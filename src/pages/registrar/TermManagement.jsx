import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Calendar, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert, Database, ArrowRight, Check, X, ClipboardList, Plus, Layers, GraduationCap } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { dispatchNotifications, notifyAdminActivity, notifyTermActivated } from '../../lib/notificationDispatcher';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import SuccessModal from '../../components/SuccessModal';
import ErrorModal from '../../components/ErrorModal';
import ConfirmModal from '../../components/ConfirmModal';
import GraduationDialog from '../../components/registrar/GraduationDialog';

const DEFAULT_GRACE_DAYS = 30;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

export default function TermManagement() {
  const { user, profile } = useAuth();
  const [terms, setTerms] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Success, Error & Confirm Modals
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({ title: '', message: '', onConfirm: null });

  // Rollover wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isGraduationOpen, setIsGraduationOpen] = useState(false);
  const [nextSemester, setNextSemester] = useState({ schoolYear: '', semester: '' });
  const [wizardStep, setWizardStep] = useState(1); // 1: Check, 2: Confirm, 3: Done
  const [auditResults, setAuditResults] = useState(null);
  const [nextTermInfo, setNextTermInfo] = useState({
    loading: false, term: null, sectionCount: 0, stranded: [], missingSections: [],
    plannedSections: [], missingPlanned: [], terminalSections: [], isNewSchoolYear: false
  });
  const [graceDays, setGraceDays] = useState(DEFAULT_GRACE_DAYS);
  const [confirmInput, setConfirmInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [rolloverSummary, setRolloverSummary] = useState(null);

  const showError = (message) => {
    setErrorModalMessage(message);
    setIsErrorModalOpen(true);
  };

  // Terms come only from the database; no cached or sample terms are ever shown.
  const loadTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTerms((data || []).map(t => ({
        id: t.term_id,
        schoolYear: t.school_year,
        semester: t.semester,
        isActive: t.is_active,
        isEvaluationOpen: t.is_evaluation_open,
        graceDays: t.sg_grace_days ?? DEFAULT_GRACE_DAYS,
        endedAt: t.ended_at || null,
        created_at: t.created_at
      })));
      setErrorMsg('');
    } catch (err) {
      console.error('Failed to load academic terms:', err);
      setTerms([]);
      setErrorMsg('Could not load the academic terms: ' + err.message);
    }
  };

  useEffect(() => {
    loadTerms();
  }, []);

  const activeTerm = terms.find(t => t.isActive) || null;

  // Succeeding term: 1st Semester -> 2nd Semester -> Summer -> 1st Semester of next year
  const calculateNextTerm = (currentTerm) => {
    const { schoolYear, semester } = currentTerm;
    const parts = (schoolYear || '').split('-');
    const nextSy = parts.length === 2 ? `${parseInt(parts[0], 10) + 1}-${parseInt(parts[1], 10) + 1}` : schoolYear;
    if (semester === '1st') return { schoolYear, semester: '2nd' };
    if (semester === '2nd') return { schoolYear, semester: 'Summer' };
    return { schoolYear: nextSy, semester: '1st' };
  };

  // The name a section becomes in the next term.
  //
  // Mirrors perform_semester_transition exactly (20261011130000:323-328):
  //
  //   WHEN v_is_new_sy AND os.name ~ '-\d'
  //     THEN regexp_replace(os.name, '-(\d)', '-' || (digit + 1))
  //     ELSE os.name
  //
  // Within a school year the name does not change -- BSIT-1A stays BSIT-1A
  // through 2nd Semester and Summer. Crossing into a new school year the cohort
  // climbs a rung. The `-\d` guard is load-bearing and deliberately copied: a
  // section named BSIT1A, with no hyphen before the digit, is NOT promoted by
  // the rollover, so this check must not claim it will be.
  const expectedNextName = (name, isNewSchoolYear) => {
    const raw = String(name || '');
    if (!isNewSchoolYear) return raw;
    const match = raw.match(/-(\d)/);
    if (!match) return raw;
    return raw.replace(/-(\d)/, `-${Number(match[1]) + 1}`);
  };

  // Name + college, which is what the rollover joins on. Comparing names alone
  // would pass a BSIT-1A created under the wrong college, and the rollover would
  // then refuse to match it.
  const sectionKey = (name, departmentId) =>
    `${String(name || '').toUpperCase()}|${departmentId || ''}`;

  // The next term must exist and have sections before the rollover: students are moved
  // into those sections, and nobody is left without one.
  //
  // "Has sections" is not enough. The rollover moves each student to the section
  // whose name and college match theirs; anyone without a match KEEPS their
  // current section, which then belongs to a term that has ended. They match no
  // class in the new term, so they disappear from every roster while still
  // counting as an active student -- and the rollover returns success, with
  // students_kept as the only clue and no indication of who.
  //
  // So the check is per student, not per term, and it runs before the rollover
  // rather than reporting afterwards: perform_semester_transition cannot be
  // undone.
  const loadNextTermInfo = useCallback(async (target, current) => {
    if (!target?.schoolYear || !target?.semester) return;
    setNextTermInfo({ loading: true, term: null, sectionCount: 0, stranded: [], missingSections: [] });
    try {
      const { data: term, error: termErr } = await supabase
        .from('academic_terms')
        .select('term_id, school_year, semester')
        .eq('school_year', target.schoolYear)
        .eq('semester', target.semester)
        .maybeSingle();
      if (termErr) throw termErr;

      // Every section, then matched in memory. Two small reads beat trying to
      // express the rollover's name-and-college join through PostgREST, and the
      // table holds a few dozen rows.
      const [{ data: allSections, error: secErr }, { data: studentRows, error: studentErr }] =
        await Promise.all([
          supabase.from('sections').select('section_id, name, department_id, school_year, semester'),
          supabase
            .from('users')
            .select('user_id, first_name, last_name, section_id')
            .eq('role', 'student')
            .eq('status', 'active')
            .not('section_id', 'is', null)
        ]);
      if (secErr) throw secErr;
      if (studentErr) throw studentErr;

      const sections = allSections || [];
      const isNextTerm = (s) =>
        s.school_year === target.schoolYear && String(s.semester) === String(target.semester);

      const sectionById = new Map(sections.map(s => [s.section_id, s]));
      const nextTermKeys = new Set(
        sections.filter(isNextTerm).map(s => sectionKey(s.name, s.department_id))
      );
      const isNewSchoolYear = Boolean(current?.schoolYear) && current.schoolYear !== target.schoolYear;

      const stranded = [];
      const missing = new Map();
      (studentRows || []).forEach(student => {
        const section = sectionById.get(student.section_id);
        if (!section) return;
        // Already sitting in a next-term section: the rollover leaves them be.
        // Checked explicitly, because across a school year their name would be
        // promoted a second time and they would look stranded when they are not.
        if (isNextTerm(section)) return;

        const wantedName = expectedNextName(section.name, isNewSchoolYear);
        const key = sectionKey(wantedName, section.department_id);
        if (nextTermKeys.has(key)) return;

        stranded.push({
          userId: student.user_id,
          name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unnamed student',
          fromSection: section.name,
          wantedName
        });
        if (!missing.has(key)) {
          missing.set(key, { name: wantedName, departmentId: section.department_id, students: 0 });
        }
        missing.get(key).students += 1;
      });

      // The full set the next term SHOULD have, derived from the term that is
      // ending. The stranded-student list above only covers sections that have
      // students in them; this covers the rest, so a section standing empty this
      // term still exists next term instead of quietly disappearing from the
      // catalogue.
      //
      // Across a school year this is the ladder: every section climbs one rung.
      // Sections with no rung above them -- a final year, or a name the rollover
      // cannot promote -- are listed separately rather than silently dropped,
      // because the students in them need a decision (graduate, or repeat), not
      // a missing section.
      const currentSections = sections.filter(
        s => s.school_year === current?.schoolYear && String(s.semester) === String(current?.semester)
      );
      const planned = [];
      const terminal = [];
      currentSections.forEach(section => {
        const wantedName = expectedNextName(section.name, isNewSchoolYear);
        // Unchanged name across a NEW school year means the rollover found no
        // year digit to raise. Carrying it forward unchanged would silently put
        // a graduating cohort back into the same year.
        if (isNewSchoolYear && wantedName === section.name) {
          terminal.push({ name: section.name, departmentId: section.department_id });
          return;
        }
        planned.push({
          name: wantedName,
          departmentId: section.department_id,
          fromName: section.name,
          exists: nextTermKeys.has(sectionKey(wantedName, section.department_id))
        });
      });

      setNextTermInfo({
        loading: false,
        term: term || null,
        sectionCount: sections.filter(isNextTerm).length,
        isNewSchoolYear,
        fromTermLabel: current ? `AY ${current.schoolYear} ${current.semester}` : 'the current term',
        stranded,
        missingSections: Array.from(missing.values()).sort((a, b) => a.name.localeCompare(b.name)),
        plannedSections: planned.sort((a, b) => a.name.localeCompare(b.name)),
        missingPlanned: planned.filter(entry => !entry.exists).sort((a, b) => a.name.localeCompare(b.name)),
        terminalSections: terminal.sort((a, b) => a.name.localeCompare(b.name))
      });
    } catch (err) {
      console.error('Failed to check the next term:', err);
      setNextTermInfo({
        loading: false, term: null, sectionCount: 0,
        stranded: [], missingSections: [], plannedSections: [],
        missingPlanned: [], terminalSections: [], error: err.message
      });
    }
  }, []);

  // Create sections in the next term, with the names and colleges the rollover
  // will look for.
  //
  // One click rather than a form per section. The system already knows every
  // value -- the name it will search for, and the college it must match -- and
  // retyping them is how the wrong college gets picked, producing a section that
  // looks right and that no student can be moved into.
  //
  // Used by both entry points: carrying the whole catalogue forward, and the
  // narrower "these students would be stranded" repair.
  const createSectionsInNextTerm = async (entries, reason) => {
    if (!entries || entries.length === 0) return;
    setIsWorking(true);
    try {
      const { error } = await supabase.from('sections').insert(
        entries.map(entry => ({
          name: entry.name,
          school_year: nextSemester.schoolYear,
          semester: nextSemester.semester,
          department_id: entry.departmentId
        }))
      );
      if (error) {
        if (error.code === '23505') {
          throw new Error('One of those sections already exists for that term. Nothing was created; reopen the assistant to refresh.');
        }
        throw error;
      }

      await logActivity(
        'Section Creation',
        `${reason} — created ${entries.length} section(s) for ${nextSemester.schoolYear} (${nextSemester.semester} Semester): ${entries.map(entry => entry.name).join(', ')}.`,
        resolveActorName(profile, user)
      );
      await loadNextTermInfo(nextSemester, activeTerm);
    } catch (err) {
      showError('The sections could not be created: ' + err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleCarrySectionsForward = () =>
    createSectionsInNextTerm(
      nextTermInfo.missingPlanned || [],
      nextTermInfo.isNewSchoolYear ? 'Promoted the previous year\'s sections' : 'Carried the previous term\'s sections forward'
    );

  const handleCreateMissingSections = () =>
    createSectionsInNextTerm(
      nextTermInfo.missingSections || [],
      'Repaired sections so no student is left without one'
    );

  useEffect(() => {
    if (isWizardOpen && wizardStep === 1) loadNextTermInfo(nextSemester, activeTerm);
  }, [isWizardOpen, wizardStep, nextSemester, activeTerm, loadNextTermInfo]);

  const startRolloverWizard = async () => {
    if (!activeTerm) {
      showError('Cannot start the next term without an active term.');
      return;
    }

    setWizardStep(1);
    setConfirmInput('');
    setRolloverSummary(null);
    setGraceDays(activeTerm.graceDays || DEFAULT_GRACE_DAYS);
    setNextSemester(calculateNextTerm(activeTerm));

    try {
      // Every class of the active term (matched by school year and semester), with how
      // many enrolled students already have a posted SG.
      const { data: classStatus, error: statusErr } = await supabase.rpc('get_term_sg_status', {
        p_school_year: activeTerm.schoolYear,
        p_semester: activeTerm.semester
      });
      if (statusErr) throw statusErr;

      const openClasses = (classStatus || []).filter(c => c.class_status === 'active');
      const unposted = openClasses
        .filter(c => c.enrolled_count > 0 && c.sg_posted_count < c.enrolled_count)
        .map(c => ({
          id: c.class_record_id,
          code: c.subject_code || 'N/A',
          section: c.section_name || 'N/A',
          facultyId: c.faculty_id,
          instructor: c.faculty_name || 'Unassigned',
          progress: `SG ${c.sg_posted_count}/${c.enrolled_count}`
        }));

      const { count: pendingCorrections, error: correctionErr } = await supabase
        .from('remark_override_requests')
        .select('request_id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (correctionErr) throw correctionErr;

      setAuditResults({
        unpostedClasses: unposted,
        pendingCorrections: pendingCorrections || 0,
        totalActiveClasses: openClasses.length
      });

      setIsWizardOpen(true);
    } catch (err) {
      console.error('Pre-rollover check failed:', err);
      showError('The pre-rollover check could not be completed, so the next term cannot be started yet: ' + err.message);
    }
  };

  const handleCreateNextTerm = async () => {
    setIsWorking(true);
    try {
      const { error } = await supabase
        .from('academic_terms')
        .insert({ school_year: nextSemester.schoolYear, semester: nextSemester.semester, is_active: false });
      if (error) throw error;
      await logActivity(
        'Term Created',
        `Created AY ${nextSemester.schoolYear} (${nextSemester.semester}) as the next term (not active yet).`,
        resolveActorName(profile, user)
      );
      await loadTerms();
      await loadNextTermInfo(nextSemester, activeTerm);
    } catch (err) {
      showError('Failed to create the next term: ' + err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleSendReminders = () => {
    const pending = auditResults?.unpostedClasses || [];
    const byFaculty = pending.reduce((acc, cls) => {
      if (!cls.facultyId) return acc;
      (acc[cls.facultyId] ||= []).push(cls);
      return acc;
    }, {});
    const facultyIds = Object.keys(byFaculty);
    if (facultyIds.length === 0) {
      showError('No reminders could be sent because the classes without a posted SG have no assigned faculty.');
      return;
    }

    setConfirmModalConfig({
      title: 'Send Reminders?',
      message: `Send an SG reminder to the ${facultyIds.length} instructor${facultyIds.length === 1 ? '' : 's'} with classes that have no posted SG yet?`,
      onConfirm: async () => {
        setIsConfirmModalOpen(false);
        try {
          await dispatchNotifications(facultyIds.map(facultyId => ({
            recipient_id: facultyId,
            type: 'term_rollover_reminder',
            severity: 'warning',
            link: '/faculty/classrecordslist',
            message: `Please post the Semestral Grade (SG) for ${byFaculty[facultyId].map(c => `${c.code} (${c.section})`).join(', ')} before AY ${activeTerm.schoolYear} ${activeTerm.semester} ends. After the term ends, an unposted SG is recorded as late.`
          })));
          setSuccessModalMessage(`Reminders sent to ${facultyIds.length} instructor${facultyIds.length === 1 ? '' : 's'}.`);
          setIsSuccessModalOpen(true);
        } catch (err) {
          console.error('Failed to send reminders:', err);
          showError('Failed to send reminders: ' + err.message);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleExecuteRollover = async () => {
    if (confirmInput !== 'CONFIRM') {
      showError('Please type "CONFIRM" exactly to start the next term.');
      return;
    }
    const days = Number(graceDays);
    if (!Number.isInteger(days) || days < 0 || days > 180) {
      showError('The grace period must be a whole number of days from 0 to 180.');
      return;
    }
    if (!nextTermInfo.term || nextTermInfo.sectionCount === 0) {
      showError('Create the next term and its sections first.');
      return;
    }
    if ((nextTermInfo.stranded || []).length > 0) {
      showError(
        `${nextTermInfo.stranded.length} student(s) have no section in the next term. Create the missing sections first, or they will stay in a section that has ended and disappear from every class list.`
      );
      return;
    }

    setIsWorking(true);
    try {
      const targetSy = nextSemester.schoolYear;
      const targetSem = nextSemester.semester;

      const { data: summary, error: transitionErr } = await supabase.rpc('perform_semester_transition', {
        old_term_uuid: activeTerm.id,
        new_term_uuid: nextTermInfo.term.term_id,
        p_grace_days: days
      });
      if (transitionErr) throw transitionErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Semester Transition',
        `Started AY ${targetSy} (${targetSem}) after AY ${activeTerm.schoolYear} (${activeTerm.semester}). ` +
          `Students moved: ${summary?.students_moved ?? 0}; kept in their section: ${summary?.students_kept ?? 0}. ` +
          `Classes archived: ${summary?.classes_archived ?? 0}; open until SG is posted: ${summary?.classes_pending_sg ?? 0} (grace ${days} days).`,
        actorName
      );

      await notifyAdminActivity({
        type: 'system',
        message: `Academic Term Management: Institutional term transitioned to AY ${targetSy} (${targetSem} Semester) by ${actorName}.`,
        actorName
      });

      await notifyTermActivated({
        termName: `${targetSem} Semester`,
        schoolYear: targetSy,
        semester: targetSem,
        actorName
      });

      setRolloverSummary(summary || {});
      setWizardStep(3);
    } catch (err) {
      console.error('Semester transition failed:', err);
      showError('The next term was not started. Nothing was changed. ' + err.message);
    } finally {
      setIsWorking(false);
    }
  };

  // A student with nowhere to go is a blocking condition, not a warning. The
  // rollover cannot be undone, and a stranded student is invisible rather than
  // obviously broken -- so the one chance to catch it is before it runs.
  const nextTermReady =
    Boolean(nextTermInfo.term) &&
    nextTermInfo.sectionCount > 0 &&
    (nextTermInfo.stranded || []).length === 0;

  return (
    <>
      <PageHeader title="Academic Terms" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">

        {/* Info Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 shadow-sm">
          <Database className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 font-display">Central Academic Term Registry</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Transitions follow the academic progression: <strong>1st Semester &rarr; 2nd Semester &rarr; Summer</strong>, then the next School Year. Before starting the next term, create it here and add its sections in Sections. Classes without a posted SG stay open after the rollover for the grace period, and are then marked overdue.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Active School Term</div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {activeTerm ? `AY ${activeTerm.schoolYear} - ${activeTerm.semester} Sem` : 'No Active Term'}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-4 pt-2 border-t border-slate-50">
              Currently active system-wide academic term period.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Predefined Hierarchy</div>
                <div className="text-xs font-bold text-slate-900 mt-1 font-mono">1st &rarr; 2nd &rarr; Summer</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-4 pt-2 border-t border-slate-50">
              Term transition sequence for automated system setup.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Transition safety Lock</div>
                <div className="text-xs font-bold text-amber-750 mt-0.5">Audit Checklist Enabled</div>
              </div>
            </div>
            <button
              onClick={startRolloverWizard}
              disabled={!activeTerm}
              className="mt-4 w-full py-2 px-4 text-xs font-bold bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer hover:shadow"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Start Next Semester
            </button>
          </div>
        </div>

        {/* Graduation.
            Sits beside the rollover because it is the other half of the same
            moment: the rollover moves everyone up a year, and the students with
            no year above them need a decision it cannot make for them. Left
            alone they stay 4th years forever, which is correct for anyone
            repeating a subject and wrong for everyone who finished. */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-3 bg-sage-50 text-sage-600 rounded-lg shrink-0">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">After the rollover</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">Record Graduations</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                4th year students stay 4th years until you say otherwise — which is right for anyone still
                owing a subject. Upload the ID numbers of those who completed their programme.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsGraduationOpen(true)}
            className="shrink-0 py-2 px-4 text-xs font-bold border border-sage-300 text-sage-700 hover:bg-sage-50 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <GraduationCap className="h-3.5 w-3.5" /> Record Graduations
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-650" /> {errorMsg}
          </div>
        )}

        {/* ── Mobile Academic Term History Cards (md:hidden) ── */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar className="h-4 w-4 text-sage-600" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display">Academic Term History</h3>
          </div>
          {terms.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-bold font-display text-slate-900">
                  AY {t.schoolYear} — {t.semester} Sem
                </h4>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t.endedAt ? `Ended ${formatDate(t.endedAt)} · SG grace ${t.graceDays} days` : `Created ${formatDate(t.created_at)}`}
                </p>
              </div>

              <div>
                {t.isActive ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Term
                  </span>
                ) : t.endedAt ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    Ended
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Next / Not started
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop List of Registered Terms (hidden md:block) ── */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-955 flex items-center gap-2 font-display">
              <Calendar className="h-4 w-4 text-sage-600" /> Academic Term History
            </h3>
          </div>

          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="px-6 py-3">Academic Period</th>
                <th className="px-6 py-3">Created Date</th>
                <th className="px-6 py-3">Ended</th>
                <th className="px-6 py-3">SG Grace Period</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 font-sans">
              {terms.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/55 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">
                    AY {t.schoolYear} — {t.semester} Sem
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDate(t.created_at)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDate(t.endedAt)}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono">
                    {t.endedAt ? `${t.graceDays} days` : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {t.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Active System Term
                      </span>
                    ) : t.endedAt ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-555 border border-slate-200">
                        Ended
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Next / Not started
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rollover Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 max-w-xl w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">

            {/* Mobile grab handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.25 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" /> New Semester Setup Assistant
              </h3>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step 1: Pre-Rollover Check */}
            {wizardStep === 1 && activeTerm && (
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Step 1: Check Grading Status</h4>
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Active Term: AY {activeTerm.schoolYear} · {activeTerm.semester}</div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-slate-200 pb-2">
                    <span className="text-slate-600">Metric Checked</span>
                    <span>Result</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500">Open classes in the active term:</span>
                    <span className="font-mono text-slate-800 font-bold">{auditResults?.totalActiveClasses} Classes</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500">SG correction requests waiting for the Dean:</span>
                    <span className="font-mono text-slate-800 font-bold">{auditResults?.pendingCorrections} Requests</span>
                  </div>
                </div>

                {auditResults?.unpostedClasses.length > 0 ? (
                  <div className="bg-amber-50 border border-amber-250 p-4 rounded-lg space-y-3">
                    <div className="flex items-start gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0" />
                      <div>
                        <span>{auditResults.unpostedClasses.length} class{auditResults.unpostedClasses.length === 1 ? '' : 'es'} without a posted SG</span>
                        <p className="font-normal text-[11px] text-slate-650 mt-1">
                          These classes stay open after the rollover so their instructors can post the SG. An SG posted within the grace period is recorded as <strong>Late</strong>; after it, as <strong>Late (overdue)</strong>, and the Dean sees the class as Overdue. No grade is posted for the instructor.
                        </p>
                      </div>
                    </div>

                    <div className="max-h-32 overflow-y-auto border-t border-amber-200/60 pt-2 text-[10px] space-y-1 font-mono text-slate-700">
                      {auditResults.unpostedClasses.map((cls) => (
                        <div key={cls.id} className="flex justify-between gap-2">
                          <span className="truncate">{cls.code} - {cls.section} · {cls.instructor}</span>
                          <span className="font-bold text-amber-700 shrink-0">{cls.progress}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleSendReminders}
                        className="px-2.5 py-1 text-[10px] font-bold text-amber-900 hover:text-white bg-amber-100 hover:bg-amber-600 rounded border border-amber-300 transition-colors"
                      >
                        Send SG Reminder to These Instructors
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-lg flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CheckCircle className="h-5 w-5 text-emerald-650" />
                    Every class with enrolled students has its SG posted.
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Next Term</label>

                  {activeTerm.semester === '2nd' ? (
                    <div className="space-y-2">
                      <label
                        onClick={() => setNextSemester({ schoolYear: activeTerm.schoolYear, semester: 'Summer' })}
                        className={cn(
                          "p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all text-xs",
                          nextSemester.semester === 'Summer'
                            ? "bg-sage-50 border-sage-500 font-bold text-sage-900 shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="targetSemChoice"
                            checked={nextSemester.semester === 'Summer'}
                            onChange={() => setNextSemester({ schoolYear: activeTerm.schoolYear, semester: 'Summer' })}
                            className="text-sage-600 focus:ring-sage-500"
                          />
                          <span>AY {activeTerm.schoolYear} &mdash; Summer Term (Mid-Year / OJT / Remedials)</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono font-normal">Same School Year</span>
                      </label>

                      {(() => {
                        const nextSy = calculateNextTerm({ schoolYear: activeTerm.schoolYear, semester: 'Summer' }).schoolYear;
                        return (
                          <label
                            onClick={() => setNextSemester({ schoolYear: nextSy, semester: '1st' })}
                            className={cn(
                              "p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all text-xs",
                              nextSemester.semester === '1st'
                                ? "bg-sage-50 border-sage-500 font-bold text-sage-900 shadow-2xs"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="targetSemChoice"
                                checked={nextSemester.semester === '1st'}
                                onChange={() => setNextSemester({ schoolYear: nextSy, semester: '1st' })}
                                className="text-sage-600 focus:ring-sage-500"
                              />
                              <span>AY {nextSy} &mdash; 1st Semester (New School Year)</span>
                            </div>
                            <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">+1 Year Level</span>
                          </label>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg text-sm font-bold text-slate-800 flex items-center justify-between font-sans">
                      <span>AY {nextSemester.schoolYear} &mdash; {nextSemester.semester} Semester</span>
                      <span className="text-[10px] font-bold text-sage-650 bg-sage-50 px-2 py-0.5 rounded border border-sage-200 uppercase tracking-wider font-mono">Auto-Calculated</span>
                    </div>
                  )}

                  {/* Next term readiness: the term and its sections must exist first */}
                  {nextTermInfo.loading ? (
                    <div className="text-[11px] text-slate-500">Checking the next term…</div>
                  ) : nextTermInfo.error ? (
                    <div className="text-[11px] text-rose-700">Could not check the next term: {nextTermInfo.error}</div>
                  ) : !nextTermInfo.term ? (
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-[11px] text-blue-900 space-y-2">
                      <p>AY {nextSemester.schoolYear} ({nextSemester.semester}) does not exist yet. Create it first (it stays inactive), then add its sections in Sections.</p>
                      <button
                        onClick={handleCreateNextTerm}
                        disabled={isWorking}
                        className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded flex items-center gap-1 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Create AY {nextSemester.schoolYear} ({nextSemester.semester})
                      </button>
                    </div>
                  ) : (nextTermInfo.missingPlanned || []).length > 0 ? (
                    // The whole catalogue, not just the sections that happen to
                    // hold students. A block cohort does not change between the
                    // terms of one school year and climbs one rung between
                    // years, so the next term's sections are already known --
                    // there is nothing for the registrar to decide, only to
                    // confirm. Doing it by hand was 16 identical forms.
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-[11px] text-amber-900 space-y-2">
                      <p>
                        {nextTermInfo.isNewSchoolYear ? (
                          <>
                            <strong>New school year.</strong> Each section moves up one year level.
                            Students are moved into the matching section during the rollover.
                          </>
                        ) : (
                          <>
                            <strong>The next term needs its sections.</strong> Within a school year they
                            are the same block sections, with the same names and colleges.
                          </>
                        )}
                      </p>
                      <div className="font-mono text-[10px] bg-white/70 border border-amber-200 rounded p-2 space-y-0.5 max-h-32 overflow-y-auto">
                        {nextTermInfo.missingPlanned.map(entry => (
                          <div key={`${entry.name}-${entry.departmentId}`} className="flex justify-between gap-3">
                            <span className="truncate">{entry.fromName}</span>
                            <span className="text-amber-800 shrink-0">&rarr; {entry.name}</span>
                          </div>
                        ))}
                      </div>
                      {(nextTermInfo.terminalSections || []).length > 0 && (
                        <p className="text-[10px] text-amber-800">
                          <strong>Not carried forward:</strong>{' '}
                          {nextTermInfo.terminalSections.map(entry => entry.name).join(', ')} — these have no
                          year level above them. Their students stay where they are until they are marked
                          as graduated.
                        </p>
                      )}
                      <button
                        onClick={handleCarrySectionsForward}
                        disabled={isWorking}
                        className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {isWorking
                          ? 'Creating…'
                          : `${nextTermInfo.isNewSchoolYear ? 'Promote' : 'Carry forward'} ${nextTermInfo.missingPlanned.length} section${nextTermInfo.missingPlanned.length === 1 ? '' : 's'}`}
                      </button>
                      <p className="text-[10px] text-amber-800">
                        Need different sections — a new intake, or a programme closing?{' '}
                        <Link to="/registrar/sectionlist" className="font-bold underline">
                          Manage Sections
                        </Link>{' '}
                        creates them one at a time or by CSV import.
                      </p>
                    </div>
                  ) : nextTermInfo.sectionCount === 0 ? (
                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-[11px] text-rose-900 space-y-2">
                      <p>The next term has <strong>no sections</strong> yet, and there are none in the current term to carry forward. Create them first (Manage Sections → Pre-load Section → Academic Term: AY {nextSemester.schoolYear} {nextSemester.semester}).</p>
                      <Link to="/registrar/sectionlist" className="inline-flex items-center gap-1 font-bold text-rose-800 underline">
                        <Layers className="h-3.5 w-3.5" /> Go to Sections
                      </Link>
                    </div>
                  ) : (nextTermInfo.stranded || []).length > 0 ? (
                    // Sections exist, but not the ones these students need. The
                    // rollover would leave them in a section belonging to a term
                    // that has ended: they would match no class in the new term
                    // and drop off every roster, while the rollover reported
                    // success. There is no "continue anyway" because there is no
                    // good reason to proceed -- a graduated student carries
                    // year_level 'Graduated' and a dropped one status 'inactive',
                    // so neither reaches this list.
                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-[11px] text-rose-900 space-y-2">
                      <p>
                        <strong>{nextTermInfo.stranded.length} student{nextTermInfo.stranded.length === 1 ? '' : 's'} would be left without a section.</strong>{' '}
                        The rollover moves each student to the next term&rsquo;s section with the same name and college. These have no match, so they would stay in a section that has ended and disappear from every class list.
                      </p>
                      <div className="font-mono text-[10px] bg-white/70 border border-rose-200 rounded p-2 space-y-0.5 max-h-28 overflow-y-auto">
                        {nextTermInfo.stranded.slice(0, 12).map(person => (
                          <div key={person.userId} className="flex justify-between gap-3">
                            <span className="truncate">{person.name}</span>
                            <span className="text-rose-700 shrink-0">{person.fromSection} &rarr; {person.wantedName}</span>
                          </div>
                        ))}
                        {nextTermInfo.stranded.length > 12 && (
                          <div className="text-rose-700">and {nextTermInfo.stranded.length - 12} more…</div>
                        )}
                      </div>
                      <button
                        onClick={handleCreateMissingSections}
                        disabled={isWorking}
                        className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create {nextTermInfo.missingSections.length} missing section{nextTermInfo.missingSections.length === 1 ? '' : 's'} ({nextTermInfo.missingSections.map(entry => entry.name).join(', ')})
                      </button>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-[11px] text-emerald-900 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-650 shrink-0" />
                      <span>The next term exists with <strong className="font-mono">{nextTermInfo.sectionCount}</strong> section{nextTermInfo.sectionCount === 1 ? '' : 's'}, and every student has one to move into.</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    onClick={() => setIsWizardOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-755 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setWizardStep(2)}
                    disabled={!nextTermReady}
                    className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    Next Step <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirmation */}
            {wizardStep === 2 && activeTerm && (
              <div className="p-6 space-y-4 overflow-y-auto">
                <h4 className="text-sm font-bold text-slate-800">Step 2: Confirm Semester Transition</h4>

                <div className="bg-rose-50 border border-rose-255 p-4 rounded-lg text-xs space-y-2">
                  <div className="font-bold text-rose-900 flex items-center gap-1.5">
                    <ShieldAlert className="h-4.5 w-4.5 text-rose-650" /> What will happen
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-655 leading-relaxed text-[11px]">
                    <li>AY {nextSemester.schoolYear} ({nextSemester.semester}) becomes the active term.</li>
                    <li>Each student moves to the matching section of the next term in the same college{nextSemester.semester === '1st' ? ' (next year number, e.g. BSIT-1A → BSIT-2A, and the year level goes up by one)' : ' (same section name)'}. A student with no matching section keeps the current section and year level.</li>
                    <li>Classes of AY {activeTerm.schoolYear} ({activeTerm.semester}) whose SG is posted are <strong>archived</strong> (view only).</li>
                    <li>Classes without a posted SG stay open until the instructor posts it: <strong>Pending</strong> during the grace period, then <strong>Overdue</strong>.</li>
                    <li>This semester transition cannot be undone.</li>
                  </ul>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="grace-days" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    SG grace period (days)
                  </label>
                  <input
                    id="grace-days"
                    type="number"
                    min={0}
                    max={180}
                    step={1}
                    value={graceDays}
                    onChange={(e) => setGraceDays(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-32 px-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                  />
                  <p className="text-[11px] text-slate-500">After this many days, an SG still not posted for AY {activeTerm.schoolYear} ({activeTerm.semester}) is shown as Overdue.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Type <code className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">CONFIRM</code> to authorize
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 focus:border-rose-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-rose-500"
                    placeholder="CONFIRM"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 border border-slate-200 text-slate-755 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleExecuteRollover}
                    disabled={confirmInput !== 'CONFIRM' || isWorking}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-250 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Check className="h-4 w-4" /> {isWorking ? 'Starting…' : 'Confirm & Start Next Semester'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Done */}
            {wizardStep === 3 && (
              <div className="p-8 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-650">
                  <Check className="h-6 w-6" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Semester Transition Completed</h3>
                  <ul className="text-xs text-slate-600 mt-2 leading-relaxed max-w-sm mx-auto text-left list-disc pl-5 space-y-0.5">
                    <li>Students moved to next-term sections: <strong className="font-mono">{rolloverSummary?.students_moved ?? 0}</strong></li>
                    <li>Students kept in their section (no matching section): <strong className="font-mono">{rolloverSummary?.students_kept ?? 0}</strong></li>
                    <li>Classes archived (SG posted): <strong className="font-mono">{rolloverSummary?.classes_archived ?? 0}</strong></li>
                    <li>Classes open until their SG is posted: <strong className="font-mono">{rolloverSummary?.classes_pending_sg ?? 0}</strong> (grace {rolloverSummary?.grace_days ?? graceDays} days)</li>
                  </ul>
                  {(rolloverSummary?.students_kept ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2 max-w-sm mx-auto">
                      Students kept in their section need a next-term section: assign them in Manage Users or with the import (update mode).
                    </p>
                  )}
                </div>

                <div className="pt-4 max-w-xs mx-auto">
                  <button
                    onClick={() => {
                      setIsWizardOpen(false);
                      loadTerms();
                    }}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    Close & Refresh Portals
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => setIsSuccessModalOpen(false)}
      />
      <ErrorModal
        isOpen={isErrorModalOpen}
        message={errorModalMessage}
        onClose={() => setIsErrorModalOpen(false)}
      />
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
      <GraduationDialog
        isOpen={isGraduationOpen}
        onClose={() => setIsGraduationOpen(false)}
        onDone={loadTerms}
      />
    </>
  );
}

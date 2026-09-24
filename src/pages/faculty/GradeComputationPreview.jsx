import { getTransmutedGrade } from '../../lib/gradingMath';
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Send, 
  ChevronDown, 
  Maximize2, 
  Minimize2, 
  FileSpreadsheet, 
  Calendar, 
  Award, 
  Layers, 
  Search, 
  X, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  TrendingUp, 
  Users, 
  HelpCircle,
  BookOpen,
  AlertTriangle,
  Lock,
  Check
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyGradesPosted } from '../../lib/notificationDispatcher';
import { showLocalNotification } from '../../lib/notificationService';
import { TableSkeleton } from '../../components/common/Skeleton';
import { triggerExcelExport } from '../../lib/excelExport';
import ExportPreviewModal from '../../components/ExportPreviewModal';
import html2pdf from 'html2pdf.js';

export default function GradeComputationPreview() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const classRecordId = searchParams.get('id') || '';

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMetadata, setExportMetadata] = useState({
    examiner: 'MYRA R. CRUZ',
    registrar: 'VIRGINIA D. SALVADOR, MBA',
    facultyName: '',
    dean: '',
    day: 'Mon',
    time: '07:00 - 10:00'
  });
  const [pendingPostMilestone, setPendingPostMilestone] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lockedMilestones, setLockedMilestones] = useState([]);
  const [postingGrades, setPostingGrades] = useState(false);

  const [classInfo, setClassInfo] = useState(null);
  const [classesList, setClassesList] = useState([]);
  const [classSearchQuery, setClassSearchQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter and search state for student computation ledger
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'passed' | 'honors' | 'at_risk' | 'fda'
  const [showFormulaGuide, setShowFormulaGuide] = useState(false);

  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });

  const isSummer = classInfo?.sections?.semester === 'Summer' || classInfo?.semester === 'Summer';

  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  // Load faculty classes for dropdown selector & cards
  useEffect(() => {
    async function fetchMyClasses() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( code, name, units ),
            sections ( name )
          `)
          .eq('faculty_id', user.id)
          .eq('status', 'active');
        if (error) throw error;
        setClassesList(data || []);
      } catch (err) {
        console.error('Error fetching classes:', err);
      }
    }
    fetchMyClasses();
  }, [user]);

  // Initialize faculty name when profile loads
  useEffect(() => {
    if (profile) {
      setExportMetadata(prev => ({
        ...prev,
        facultyName: `${profile.first_name} ${profile.last_name}`.toUpperCase()
      }));
    }
  }, [profile]);

  // Auto-lookup dean based on college
  useEffect(() => {
    if (!classInfo) return;
    const collegeName = classInfo.subjects?.departments?.name || '';
    if (!collegeName) return;

    async function fetchDean() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('first_name, last_name, departments ( name )')
          .eq('role', 'dean')
          .eq('status', 'active')
          .limit(10);

        if (error) throw error;

        const matched = (data || []).find(u => {
          const deptName = u.departments?.name || '';
          return deptName.toLowerCase().includes(collegeName.toLowerCase()) ||
                 collegeName.toLowerCase().includes(deptName.toLowerCase());
        }) || data?.[0];

        if (matched) {
          const fullName = `${matched.last_name.toUpperCase()}, ${matched.first_name.toUpperCase()}`;
          setExportMetadata(prev => ({ ...prev, dean: fullName }));
        }
      } catch (err) {
        console.error('Failed to fetch dean:', err);
      }
    }
    fetchDean();
  }, [classInfo]);

  // Load class record information, enrolled students, max points, and saved scores
  useEffect(() => {
    async function loadSpreadsheetData() {
      if (!user || !classRecordId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // 1. Fetch class info
        const { data: cr, error: crErr } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( code, name, units, departments ( name ) ),
            sections ( name )
          `)
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;
        setClassInfo(cr);

        // 2. Fetch enrolled students
        const { data: enrolls, error: studentErr } = await supabase
          .from('enrollments')
          .select(`
            student_id,
            users:student_id (
              user_id,
              first_name,
              last_name,
              email,
              user_number
            )
          `)
          .eq('section_id', cr.section_id)
          .eq('subject_id', cr.subject_id);

        if (studentErr) throw studentErr;

        // Deduplicate enrolled users by user_id
        const uniqueUsersMap = new Map();
        (enrolls || []).forEach(e => {
          if (e.users && e.users.user_id && !uniqueUsersMap.has(e.users.user_id)) {
            uniqueUsersMap.set(e.users.user_id, e.users);
          }
        });

        const studentList = Array.from(uniqueUsersMap.values()).map((u, idx) => ({
          id: u.user_id,
          studentNo: u.user_number || (u.email ? u.email.split('@')[0].toUpperCase() : `STUD-${idx}`),
          name: `${u.last_name}, ${u.first_name}`,
          email: u.email
        }));
        studentList.sort((a, b) => a.name.localeCompare(b.name));

        // 3. Fetch column max items
        const { data: cols } = await supabase
          .from('class_grading_columns')
          .select('*')
          .eq('class_record_id', classRecordId);

        const newMax = {
          Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
        };

        if (cols && cols.length > 0) {
          cols.forEach(row => {
            if (newMax[row.term]) {
              newMax[row.term] = {
                act1: row.act1_max,
                act2: row.act2_max,
                act3: row.act3_max,
                act4: row.act4_max,
                act5: row.act5_max,
                act6: row.act6_max,
                char: 100,
                exam: row.exam_max
              };
            }
          });
        }
        setMaxItems(newMax);

        // 4. Fetch saved term scores from Supabase
        const { data: savedScores } = await supabase
          .from('student_term_scores')
          .select('*')
          .eq('class_record_id', classRecordId);

        const scoresByStudent = {};
        (savedScores || []).forEach(row => {
          if (!scoresByStudent[row.student_id]) {
            scoresByStudent[row.student_id] = {
              Prelim: {},
              Midterm: {},
              'Semi-Final': {},
              Final: {}
            };
          }
          scoresByStudent[row.student_id][row.term] = {
            act1: row.act1,
            act2: row.act2,
            act3: row.act3,
            act4: row.act4,
            act5: row.act5,
            act6: row.act6,
            char: row.char_rating,
            exam: row.exam
          };
        });

        // 5. Fetch actual absences count from Supabase to sync
        const { data: absenceData } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', classRecordId)
          .eq('status', 'Absent');

        const absenceCounts = {};
        if (absenceData) {
          absenceData.forEach(rec => {
            absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
          });
        }

        // 6. Fetch locked milestones / posted grades
        const { data: pgData } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('class_record_id', classRecordId)
          .eq('grade_period', 'final');

        const lockedList = [];
        const customRemarksMap = {};
        const remarksNoteMap = {};
        if (pgData && pgData.length > 0) {
          if (pgData[0].is_locked) {
            lockedList.push('Semestral Grade');
          }
          pgData.forEach(row => {
            customRemarksMap[row.student_id] = row.remarks;
            remarksNoteMap[row.student_id] = row.remarks_note;
          });
        }
        setLockedMilestones(lockedList);

        // Compile complete student datasets
        const compiled = studentList.map(student => {
          const studentScores = scoresByStudent[student.id] || {
            Prelim: {},
            Midterm: {},
            'Semi-Final': {},
            Final: {}
          };
          const absences = absenceCounts[student.id] || 0;

          return {
            ...student,
            absences,
            periods: {
              Prelim: studentScores.Prelim || {},
              Midterm: studentScores.Midterm || {},
              'Semi-Final': studentScores['Semi-Final'] || {},
              Final: studentScores.Final || {}
            },
            customRemarks: customRemarksMap[student.id] || '',
            remarksNote: remarksNoteMap[student.id] || ''
          };
        });

        setStudents(compiled);
      } catch (err) {
        console.error('Error loading computation preview:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSpreadsheetData();
  }, [user, classRecordId]);

  // Compute live term ratings, GWA, and statuses for every student
  const computedStudents = useMemo(() => {
    return students.map(student => {
      const getTermRating = (termName) => {
        const tSc = student.periods?.[termName] || {};
        const tMx = maxItems[termName] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
        const tCs = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
        const tCsMx = tMx.act1 + tMx.act2 + tMx.act3 + tMx.act4 + tMx.act5 + tMx.act6;
        const tCsP = tCsMx > 0 ? (tCs / tCsMx) * 50 : 0;
        const tChP = (tSc.char || 0) * 0.1;
        const tExP = tMx.exam > 0 ? ((tSc.exam || 0) / tMx.exam) * 40 : 0;
        return Math.min(100, Math.max(0, Math.round(tCsP + tChP + tExP)));
      };

      const pRate = getTermRating('Prelim');
      const mRate = getTermRating('Midterm');
      const sfRate = getTermRating('Semi-Final');
      const fRate = getTermRating('Final');

      // DYCI Milestone Math
      let mr, tfr, sg;
      if (isSummer) {
        mr = mRate;
        tfr = fRate;
        sg = Math.round((mr + tfr) / 2);
      } else {
        mr = Math.round((pRate + mRate) / 2);
        tfr = Math.round((sfRate + fRate) / 2);
        sg = Math.round((mr + tfr) / 2);
      }


      // Check for missing component marks per student (per USER_JOURNEY_FLOW S31 scope)
      const hasPrelimScores = Object.values(student.periods?.Prelim || {}).some(v => v !== null && v !== undefined && v !== '' && v !== 0);
      const hasMidtermScores = Object.values(student.periods?.Midterm || {}).some(v => v !== null && v !== undefined && v !== '' && v !== 0);
      const hasSemiFinalScores = Object.values(student.periods?.['Semi-Final'] || {}).some(v => v !== null && v !== undefined && v !== '' && v !== 0);
      const hasFinalScores = Object.values(student.periods?.Final || {}).some(v => v !== null && v !== undefined && v !== '' && v !== 0);

      const hasAnyScores = isSummer 
        ? (hasMidtermScores || hasFinalScores) 
        : (hasPrelimScores || hasMidtermScores || hasSemiFinalScores || hasFinalScores);

      const rawGwa = hasAnyScores ? getTransmutedGrade(sg) : null;
      const autoRemarks = hasAnyScores ? (rawGwa <= 3.00 ? 'Passed' : 'Failed') : 'Pending';
      const draftRemarks = student.customRemarks || autoRemarks;
      const isPassed = hasAnyScores && (draftRemarks === 'Passed' || (draftRemarks !== 'Failed' && draftRemarks !== 'FDA' && draftRemarks !== 'Dropped' && rawGwa !== null && rawGwa <= 3.00));
      const isFDA = (student.absences || 0) >= 4;
      const isHonor = isPassed && rawGwa !== null && rawGwa <= 1.75;
      const isAtRisk = hasAnyScores ? (!isPassed || isFDA || (rawGwa !== null && rawGwa > 3.00)) : isFDA;

      const isPrelimMissing = !hasPrelimScores;
      const isMidtermMissing = !hasMidtermScores;
      const isSemiFinalMissing = !hasSemiFinalScores;
      const isFinalMissing = !hasFinalScores;
      const hasMissingComponents = isSummer 
        ? (isMidtermMissing || isFinalMissing)
        : (isPrelimMissing || isMidtermMissing || isSemiFinalMissing || isFinalMissing);

      return {
        ...student,
        pRate: hasPrelimScores ? pRate : 0,
        mRate: hasMidtermScores ? mRate : 0,
        mr: (hasPrelimScores || hasMidtermScores) ? mr : 0,
        sfRate: hasSemiFinalScores ? sfRate : 0,
        fRate: hasFinalScores ? fRate : 0,
        tfr: (hasSemiFinalScores || hasFinalScores) ? tfr : 0,
        sg: hasAnyScores ? sg : 0,
        gwa: rawGwa,
        hasAnyScores,
        remarks: draftRemarks,
        isPassed,
        isFDA,
        isHonor,
        isAtRisk,
        isPrelimMissing,
        isMidtermMissing,
        isSemiFinalMissing,
        isFinalMissing,
        hasMissingComponents
      };
    });
  }, [students, maxItems, isSummer]);

  // Aggregate executive metrics & distribution tiers
  const stats = useMemo(() => {
    const total = computedStudents.length;
    if (total === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        avgGwa: '—',
        honors: 0,
        atRisk: 0,
        fdaCount: 0,
        missingCount: 0,
        tier1: 0,
        tier2: 0,
        tier3: 0,
        tier4: 0
      };
    }

    let passed = 0;
    let failed = 0;
    let sumGwa = 0;
    let countGwa = 0;
    let honors = 0;
    let atRisk = 0;
    let fdaCount = 0;
    let missingCount = 0;
    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;
    let tier4 = 0;

    computedStudents.forEach(s => {
      if (s.hasAnyScores) {
        if (s.isPassed) passed++;
        else failed++;

        if (s.gwa !== null) {
          sumGwa += s.gwa;
          countGwa++;
          if (s.gwa <= 1.75) tier1++;
          else if (s.gwa <= 2.75) tier2++;
          else if (s.gwa <= 3.00) tier3++;
          else tier4++;
        }
      }
      if (s.isHonor) honors++;
      if (s.isAtRisk) atRisk++;
      if (s.isFDA) fdaCount++;
      if (s.hasMissingComponents) missingCount++;
    });

    return {
      total,
      passed,
      failed,
      passRate: countGwa > 0 ? Math.round((passed / countGwa) * 100) : 0,
      avgGwa: countGwa > 0 ? (sumGwa / countGwa).toFixed(2) : '—',
      honors,
      atRisk,
      fdaCount,
      missingCount,
      tier1,
      tier2,
      tier3,
      tier4
    };
  }, [computedStudents]);

  // Filtered students for ledger view
  const filteredStudents = useMemo(() => {
    return computedStudents.filter(s => {
      const matchesSearch = !studentSearch.trim() || 
        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.studentNo.toLowerCase().includes(studentSearch.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'passed') return s.isPassed;
      if (statusFilter === 'honors') return s.isHonor;
      if (statusFilter === 'at_risk') return s.isAtRisk;
      if (statusFilter === 'fda') return s.isFDA;
      if (statusFilter === 'missing') return s.hasMissingComponents;
      return true;
    });
  }, [computedStudents, studentSearch, statusFilter]);

  const handlePostGrades = async (targetMilestone = 'semestral') => {
    if (!classRecordId || computedStudents.length === 0) return;
    setPostingGrades(true);
    try {
      let periodParam = 'final';
      let termNotificationName = 'Official Semestral Grade (SG)';
      let newMilestoneLock = 'Semestral Grade';

      if (targetMilestone === 'midterm') {
        periodParam = 'midterm';
        termNotificationName = isSummer ? 'Midterm Grade' : 'Midterm Rating (MR)';
        newMilestoneLock = 'Midterm Rating';
      } else if (targetMilestone === 'tfr') {
        periodParam = 'final';
        termNotificationName = isSummer ? 'Final Grade (TFR)' : 'Tentative Final Rating (TFR)';
        newMilestoneLock = 'Tentative Final Rating';
      } else {
        periodParam = 'final';
        termNotificationName = 'Official Semestral Grade (SG)';
        newMilestoneLock = 'Semestral Grade';
      }

      const { data: existingPg, error: fetchErr } = await supabase
        .from('posted_grades')
        .select('posted_grade_id, student_id, computed_grade, effective_grade, remarks')
        .eq('class_record_id', classRecordId)
        .eq('grade_period', periodParam);

      if (fetchErr) throw fetchErr;

      const existingMap = {};
      const isFirstPost = !existingPg || existingPg.length === 0;

      if (existingPg) {
        existingPg.forEach(row => {
          existingMap[row.student_id] = {
            id: row.posted_grade_id,
            computed_grade: row.computed_grade,
            effective_grade: row.effective_grade,
            remarks: row.remarks
          };
        });
      }

      const mapRemarkToDb = (remarkStr) => {
        if (!remarkStr) return 'passed';
        const lower = remarkStr.toLowerCase();
        if (lower === 'inc') return 'incomplete';
        return lower;
      };

      const updatedLockedMilestones = Array.from(new Set([
        ...lockedMilestones, 
        newMilestoneLock,
        ...(targetMilestone === 'midterm' ? ['Prelim', 'Midterm'] : targetMilestone === 'tfr' ? ['Semi-Final', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final', 'Semestral Grade'])
      ]));

      const changedStudentIds = [];

      const postRows = computedStudents.map(stud => {
        const remarksLabel = mapRemarkToDb(stud.remarks);
        let computedGWA = stud.gwa;
        if (remarksLabel === 'passed' && stud.gwa > 3.00) {
          computedGWA = 3.00;
        }

        let computedTermGrade = stud.fRate;
        if (targetMilestone === 'midterm') {
          computedTermGrade = stud.mr;
        } else if (targetMilestone === 'tfr') {
          computedTermGrade = stud.tfr;
        }

        const effectiveGrade = targetMilestone === 'semestral' ? computedGWA : getTransmutedGrade(computedTermGrade);

        const oldRecord = existingMap[stud.id];
        if (!isFirstPost) {
          if (
            !oldRecord ||
            Number(oldRecord.computed_grade) !== Number(computedTermGrade) ||
            Number(oldRecord.effective_grade) !== Number(effectiveGrade) ||
            oldRecord.remarks !== remarksLabel
          ) {
            changedStudentIds.push(stud.id);
          }
        }

        const existingId = oldRecord?.id;
        return {
          posted_grade_id: existingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          })),
          class_record_id: classRecordId,
          student_id: stud.id,
          grade_period: periodParam,
          computed_grade: computedTermGrade,
          effective_grade: effectiveGrade,
          remarks: remarksLabel,
          remarks_note: stud.remarksNote || null,
          remarks_set_by: user.id,
          remarks_set_at: new Date().toISOString(),
          posted_by: user.id,
          posted_at: new Date().toISOString(),
          is_locked: true,
          locked_milestones: updatedLockedMilestones
        };
      });

      const { error: postErr } = await supabase
        .from('posted_grades')
        .upsert(postRows);

      if (postErr) throw postErr;

      setLockedMilestones(updatedLockedMilestones);

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Grade Posting',
        `Posted ${termNotificationName} for subject ${classInfo?.subjects?.code} - ${classInfo?.sections?.name}`,
        actorName
      );

      await showLocalNotification({
        title: `${termNotificationName} Posted`,
        body: `📊 ${termNotificationName} posted for ${classInfo?.subjects?.code || 'class'} (${classInfo?.sections?.name || ''}).`
      });

      const targetSectionId = classInfo?.sections?.section_id || classInfo?.section_id;
      if (targetSectionId) {
        if (isFirstPost) {
          await notifyGradesPosted({
            sectionId: targetSectionId,
            subjectCode: classInfo?.subjects?.code || '',
            termName: termNotificationName,
            facultyName: actorName,
            isUpdate: false
          });
        } else if (changedStudentIds.length > 0) {
          await notifyGradesPosted({
            sectionId: targetSectionId,
            subjectCode: classInfo?.subjects?.code || '',
            termName: termNotificationName,
            facultyName: actorName,
            studentIds: changedStudentIds,
            isUpdate: true
          });
        }
      }

      setShowConfirmModal(false);
      setPendingPostMilestone(null);

      const notifDetailText = isFirstPost 
        ? 'Enrolled students have been notified for consultation.'
        : changedStudentIds.length > 0 
          ? `${changedStudentIds.length} student(s) with updated grades have been notified.`
          : 'Grades re-posted. No score changes detected for enrolled students.';

      alert(`Successfully posted ${termNotificationName}! ${notifDetailText}`);
    } catch (err) {
      console.error('Error posting grades to database:', err);
      alert('Failed to post grades: ' + err.message);
    } finally {
      setPostingGrades(false);
    }
  };

  const handleExportExcel = (selectedTab) => {
    if (!classInfo || computedStudents.length === 0) return;

    const metadata = {
      college: classInfo.subjects?.departments?.name || 'College of Computer Studies',
      course: classInfo.course || 'BSIT',
      subjectCode: classInfo.subjects?.code || '',
      subjectName: classInfo.subjects?.name || '',
      section: classInfo.sections?.name || '',
      semester: classInfo.semester === '1st' ? '1st Sem' : classInfo.semester === '2nd' ? '2nd Sem' : 'Summer',
      schoolYear: classInfo.school_year || '',
      units: classInfo.subjects?.units || 3,
      ...exportMetadata
    };

    triggerExcelExport(metadata, computedStudents, selectedTab);
  };

  const handleExportPdf = (selectedTab) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const colorFuncRegex = /(oklch|oklab|lab|lch|hwb|color)\([^)]+\)/g;
    const convertUnsupportedColorsToStringRgb = (str) => {
      if (!str || typeof str !== 'string') return str;
      colorFuncRegex.lastIndex = 0;
      if (!colorFuncRegex.test(str)) return str;
      return str.replace(colorFuncRegex, (match) => {
        try {
          if (!ctx) return match;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = match;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return a === 255 
            ? `rgb(${r}, ${g}, ${b})` 
            : `rgba(${r}, ${g}, ${b}, ${parseFloat((a / 255).toFixed(3))})`;
        } catch (_e) {
          return match;
        }
      });
    };

    try {
      if (ctx) {
        document.querySelectorAll('style').forEach(tag => {
          if (tag.innerHTML && (tag.innerHTML.includes('oklch') || tag.innerHTML.includes('oklab') || tag.innerHTML.includes('lab') || tag.innerHTML.includes('lch'))) {
            tag.innerHTML = convertUnsupportedColorsToStringRgb(tag.innerHTML);
          }
        });
      }
    } catch (e) {
      console.error('Failed to convert stylesheet colors:', e);
    }

    const previewCard = document.querySelector('.bg-slate-100 .bg-white');
    if (!previewCard) return;

    const cloned = previewCard.cloneNode(true);
    const originalElements = [previewCard, ...Array.from(previewCard.querySelectorAll('*'))];
    const clonedElements = [cloned, ...Array.from(cloned.querySelectorAll('*'))];

    for (let i = 0; i < originalElements.length; i++) {
      const orig = originalElements[i];
      const clone = clonedElements[i];
      if (!orig || !clone) continue;

      const computed = window.getComputedStyle(orig);
      for (let j = 0; j < computed.length; j++) {
        const prop = computed[j];
        const val = computed.getPropertyValue(prop);
        if (val && typeof val === 'string' && (val.includes('oklch') || val.includes('oklab') || val.includes('lab') || val.includes('lch'))) {
          clone.style.setProperty(prop, convertUnsupportedColorsToStringRgb(val));
        }
      }
    }

    cloned.style.boxSizing = 'border-box';

    let tabName = 'Gradesheet';
    if (selectedTab === 'profile') tabName = 'Subject_Profile';
    if (selectedTab === 'record') tabName = 'Record_Sheet';
    if (selectedTab === 'report') tabName = 'Report_of_Grades';

    if (selectedTab === 'profile') {
      cloned.style.width = '740px';
      cloned.style.minWidth = '740px';
      cloned.style.maxWidth = '740px';
      cloned.style.fontSize = '11px';

      const rosterEl = cloned.querySelector('.pdf-roster-break');
      if (rosterEl) {
        rosterEl.style.pageBreakBefore = 'always';
        rosterEl.style.breakBefore = 'page';
        rosterEl.style.paddingTop = '32px';
      }
    } else {
      const originalWidth = previewCard.offsetWidth || 1120;
      const originalHeight = previewCard.offsetHeight || 1000;
      const targetWidth = 740;
      const targetHeight = 1060;

      const widthScale = targetWidth / originalWidth;
      const heightScale = targetHeight / originalHeight;
      const scaleFactor = Math.min(widthScale, heightScale);

      cloned.style.zoom = scaleFactor;
      cloned.style.width = `${originalWidth}px`;
      cloned.style.minWidth = `${originalWidth}px`;
      cloned.style.maxWidth = `${originalWidth}px`;
    }

    const filename = `${classInfo?.subjects?.code || 'SAGE'}_${classInfo?.sections?.name || 'Class'}_${tabName}.pdf`;

    const opt = {
      margin:       [0.3, 0.3, 0.3, 0.3],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    const exporter = typeof html2pdf === 'function' ? html2pdf : (html2pdf && html2pdf.default ? html2pdf.default : html2pdf);
    exporter().from(cloned).set(opt).save();
  };

  const handleClassChange = (newClassId) => {
    if (newClassId) {
      setSearchParams({ id: newClassId });
    } else {
      setSearchParams({});
    }
  };

  // Filtered classes for class selection cards view
  const filteredClasses = useMemo(() => {
    if (!classSearchQuery.trim()) return classesList;
    const q = classSearchQuery.toLowerCase();
    return classesList.filter(c => 
      (c.subjects?.code || '').toLowerCase().includes(q) ||
      (c.subjects?.name || '').toLowerCase().includes(q) ||
      (c.sections?.name || '').toLowerCase().includes(q)
    );
  }, [classesList, classSearchQuery]);

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  // View when NO class is selected
  if (!classRecordId) {
    return (
      <>
        <PageHeader title="Grade Computation Preview" breadcrumb="Faculty Portal">
          <div className="text-xs font-semibold text-slate-500 hidden sm:block">
            Institutional 4-Term Milestone Ledger &amp; GWA Transmutation
          </div>
        </PageHeader>

        <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 text-left">
          {/* Institutional KPI Metric Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">Active Classes</span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-1 truncate">
                  {classesList.length}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">Assigned Teaching Load</p>
              </div>
              <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">Grading Progression</span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-1 truncate">
                  4 Milestones
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">Prelim · Midterm · Semis · Final</p>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl flex-shrink-0">
                <Layers className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">GWA Transmutation</span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono mt-1 truncate">
                  1.00 – 5.00
                </h3>
                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5 truncate">DYCI Institutional Standard</p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl flex-shrink-0">
                <Award className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by course code, section, or subject title..."
                value={classSearchQuery}
                onChange={(e) => setClassSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-sage-300 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 text-xs text-slate-800 placeholder-slate-400 pl-3.5 pr-8 py-2.5 rounded-xl transition-all outline-none shadow-xs"
              />
              {classSearchQuery && (
                <button
                  type="button"
                  onClick={() => setClassSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 self-end sm:self-auto">
              <span>Showing <strong className="text-slate-800 font-mono">{filteredClasses.length}</strong> of <strong className="text-slate-800 font-mono">{classesList.length}</strong> active classes</span>
            </div>
          </div>

          {/* Class Cards Grid */}
          {filteredClasses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-sage-50 text-sage-600 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  {classSearchQuery ? 'No matching classes found' : 'No active class records'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {classSearchQuery 
                    ? `No classes matched "${classSearchQuery}". Try clearing your search filter.`
                    : 'You do not have any active class records assigned for this semester.'}
                </p>
              </div>
              {classSearchQuery && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setClassSearchQuery('')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredClasses.map(c => (
                <div
                  key={c.class_record_id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between overflow-hidden text-left"
                >
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          {c.sections?.name || 'Section'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400 font-mono">
                          {(Number(c.subjects?.units) || 3).toFixed(1)} Units
                        </span>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold font-display text-slate-900 leading-tight">
                        {c.subjects?.code}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{c.subjects?.name}</p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{c.school_year} • {c.semester === '1st' ? 'First' : c.semester === '2nd' ? 'Second' : c.semester} Sem</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <Link
                      to={`/faculty/scoreinput?id=${c.class_record_id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors shadow-2xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span>Score Sheet</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleClassChange(c.class_record_id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-xl transition-colors shadow-2xs cursor-pointer"
                    >
                      <Award className="h-3.5 w-3.5" />
                      <span>Preview Ledger</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // View when class record was NOT found
  if (!classInfo) {
    return (
      <>
        <PageHeader title="Grade Computation Preview" breadcrumb="Faculty Portal" />
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
              <FileSpreadsheet className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-base font-bold text-slate-900">Class Record Not Found</h3>
              <p className="text-sm text-slate-500 mt-2">
                The requested class record could not be found or you do not have permission to view it.
              </p>
              <button
                onClick={() => handleClassChange('')}
                className="mt-4 px-4 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm cursor-pointer"
              >
                Select Another Class
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isLocked = lockedMilestones.includes('Semestral Grade');

  return (
    <>
      <PageHeader title="Grade Computation Preview" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to={`/faculty/scoreinput?id=${classRecordId}`}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Open raw score spreadsheet to edit assessment scores"
          >
            <Edit3 className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Edit Raw Scores</span>
            <span className="sm:hidden">Scores</span>
          </Link>
          <button 
            disabled={computedStudents.length === 0}
            onClick={() => setShowExportModal(true)}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button 
            onClick={() => setShowConfirmModal(true)}
            disabled={postingGrades || computedStudents.length === 0}
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sage-600 hover:bg-sage-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" /> 
            <span>Post Grades</span>
          </button>
        </div>
      </PageHeader>
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 relative text-left">

        {/* ── Selector Bar ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          {/* Class Record Selector */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="relative">
              <select
                value={classRecordId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700 shadow-2xs truncate"
              >
                <option value="">-- Select Class Record --</option>
                {classesList.map(c => (
                  <option key={c.class_record_id} value={c.class_record_id}>
                    {c.subjects?.code} - {c.sections?.name} ({c.subjects?.name})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Stats Overview */}
          <div className="flex items-center gap-4 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{computedStudents.length} Students</p>
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ledger Status</p>
              <p className={`text-xs font-mono font-bold mt-0.5 ${isLocked ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isLocked ? 'Posted & Locked' : 'Draft / Unposted'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Executive Class Analytics Row (4 KPI Cards) ──────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* KPI 1: Passing Rate */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Passing Rate</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono mt-0.5">
                {stats.passRate}%
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 font-mono">
                {stats.passed}/{stats.total} Passed
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* KPI 2: Mean GWA */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Class Mean GWA</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-0.5">
                {stats.avgGwa}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Academic Standing
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-sage-50 text-sage-600">
              <Award className="w-5 h-5" />
            </div>
          </div>

          {/* KPI 3: Honor Contenders */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Honor Roll (≤ 1.75)</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-indigo-700 font-mono mt-0.5">
                {stats.honors}
              </h3>
              <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                Dean's / PL Eligible
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* KPI 4: At-Risk / In Jeopardy */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">At-Risk / Warning</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-rose-700 font-mono mt-0.5">
                {stats.atRisk}
              </h3>
              <p className="text-[11px] text-rose-600 font-medium mt-0.5 font-mono">
                {stats.failed} Failing · {stats.fdaCount} FDA
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>

        </div>

        {/* ── Grade Distribution Bar & Formula Guide ─────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Class Grade Distribution Breakdown
            </span>
            <button
              type="button"
              onClick={() => setShowFormulaGuide(!showFormulaGuide)}
              className="text-xs font-semibold text-sage-600 hover:text-sage-800 flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showFormulaGuide ? 'Hide Computation Formulas' : 'View Computation Formulas'}</span>
            </button>
          </div>

          {/* Visual Distribution Bar */}
          {stats.total > 0 ? (
            <div className="space-y-2">
              <div className="h-3 rounded-full overflow-hidden flex bg-slate-100">
                {stats.tier1 > 0 && (
                  <div 
                    className="bg-emerald-500 transition-all" 
                    style={{ width: `${(stats.tier1 / stats.total) * 100}%` }}
                    title={`Honor Roll (1.00 - 1.75): ${stats.tier1} students (${Math.round((stats.tier1 / stats.total) * 100)}%)`}
                  />
                )}
                {stats.tier2 > 0 && (
                  <div 
                    className="bg-sage-500 transition-all" 
                    style={{ width: `${(stats.tier2 / stats.total) * 100}%` }}
                    title={`Good Standing (2.00 - 2.75): ${stats.tier2} students (${Math.round((stats.tier2 / stats.total) * 100)}%)`}
                  />
                )}
                {stats.tier3 > 0 && (
                  <div 
                    className="bg-amber-500 transition-all" 
                    style={{ width: `${(stats.tier3 / stats.total) * 100}%` }}
                    title={`Passing Floor (3.00): ${stats.tier3} students (${Math.round((stats.tier3 / stats.total) * 100)}%)`}
                  />
                )}
                {stats.tier4 > 0 && (
                  <div 
                    className="bg-rose-500 transition-all" 
                    style={{ width: `${(stats.tier4 / stats.total) * 100}%` }}
                    title={`Failing / Incomplete (5.00): ${stats.tier4} students (${Math.round((stats.tier4 / stats.total) * 100)}%)`}
                  />
                )}
              </div>

              {/* Bar Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-600">1.00–1.75: <strong className="text-slate-900">{stats.tier1}</strong> ({stats.total > 0 ? Math.round((stats.tier1 / stats.total) * 100) : 0}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sage-500 shrink-0" />
                  <span className="text-slate-600">2.00–2.75: <strong className="text-slate-900">{stats.tier2}</strong> ({stats.total > 0 ? Math.round((stats.tier2 / stats.total) * 100) : 0}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-slate-600">3.00: <strong className="text-slate-900">{stats.tier3}</strong> ({stats.total > 0 ? Math.round((stats.tier3 / stats.total) * 100) : 0}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-600">5.00/INC: <strong className="text-slate-900">{stats.tier4}</strong> ({stats.total > 0 ? Math.round((stats.tier4 / stats.total) * 100) : 0}%)</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No student score data available to compute distribution.</p>
          )}

          {/* Collapsible DYCI Formula Box */}
          {showFormulaGuide && (
            <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50/70 p-3.5 rounded-xl space-y-2 text-xs text-slate-700 font-mono animate-in fade-in duration-150">
              <p className="font-bold font-sans text-slate-900">Official DYCI Grading Formula Chain:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] leading-relaxed">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="font-bold text-sky-800">1. Term Rating:</span>
                  <p className="text-slate-600">ROUND(Class Standing 50% + Character 10% + Exam 40%, 0)</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="font-bold text-indigo-800">2. Midterm Rating (MR):</span>
                  <p className="text-slate-600">ROUND(AVG(Prelim Rating, Midterm Rating), 0)</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="font-bold text-orange-800">3. Tentative Final Rating (TFR):</span>
                  <p className="text-slate-600">ROUND(AVG(Semi-Final Rating, Final Rating), 0)</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="font-bold text-emerald-800">4. Semestral Grade (SG) &amp; GWA:</span>
                  <p className="text-slate-600">ROUND(AVG(MR, TFR), 0) → Transmuted to 1.00–5.00 GWA Scale</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Completeness Audit Banner (per USER_JOURNEY_FLOW S31) ──────── */}
        {stats.missingCount > 0 ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 sm:p-4 flex items-start justify-between gap-3 shadow-2xs text-left">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-rose-900 font-display">
                  Completeness Warning: {stats.missingCount} student(s) have missing component marks
                </h4>
                <p className="text-[11px] sm:text-xs text-rose-800 mt-0.5 leading-relaxed">
                  Missing component marks are highlighted in red warnings in the calculation chain below. Please review or encode missing scores in the Score Sheet prior to posting.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing')}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0",
                statusFilter === 'missing'
                  ? "bg-slate-900 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              )}
            >
              {statusFilter === 'missing' ? 'Show All' : 'Filter Missing'}
            </button>
          </div>
        ) : stats.total > 0 ? (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-2xs text-left">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-emerald-900 font-display">
                  Audit Verified: All grading components are complete
                </h4>
                <p className="text-[11px] sm:text-xs text-emerald-700 mt-0.5">
                  All {stats.total} students have complete component marks across all required grading terms.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Search & Filter Controls ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search student by name or ID..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-sage-300 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 text-xs text-slate-800 placeholder-slate-400 pl-8 pr-8 py-2 rounded-xl transition-all outline-none shadow-2xs"
            />
            {studentSearch && (
              <button
                type="button"
                onClick={() => setStudentSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                statusFilter === 'all'
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              )}
            >
              All ({stats.total})
            </button>
            {stats.missingCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('missing')}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                  statusFilter === 'missing'
                    ? "bg-rose-600 text-white shadow-2xs"
                    : "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
                )}
              >
                Missing ({stats.missingCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusFilter('passed')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                statusFilter === 'passed'
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
              )}
            >
              Passed ({stats.passed})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('honors')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                statusFilter === 'honors'
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
              )}
            >
              Honors ({stats.honors})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('at_risk')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                statusFilter === 'at_risk'
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
              )}
            >
              At-Risk ({stats.atRisk})
            </button>
            {stats.fdaCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('fda')}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                  statusFilter === 'fda'
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
                )}
              >
                FDA Risk ({stats.fdaCount})
              </button>
            )}
          </div>
        </div>

        {/* ── Mobile Student Grades Card Feed (md:hidden) ─────────────────── */}
        <div className="md:hidden space-y-3">
          {filteredStudents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No students match current filter</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Try clearing your search query or selecting a different status filter.</p>
            </div>
          ) : (
            filteredStudents.map((student, idx) => (
              <div key={student.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                      <span className="font-bold text-slate-900 font-display text-xs sm:text-sm truncate">{student.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{student.studentNo}</span>
                  </div>

                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${
                    student.isPassed 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {student.remarks}
                  </span>
                </div>

                {/* Term Ratings Grid with Red Warnings for Missing Marks */}
                <div className="grid grid-cols-4 gap-1.5 py-2 border-y border-slate-100 text-center font-mono">
                  <div className={cn(
                    "p-1.5 rounded-xl border",
                    student.isPrelimMissing
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-sky-50/50 text-slate-800 border-sky-100"
                  )}>
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider block",
                      student.isPrelimMissing ? "text-rose-600" : "text-sky-600"
                    )}>Prelim</span>
                    <span className="text-xs font-bold">
                      {student.isPrelimMissing ? 'Missing' : student.pRate}
                    </span>
                  </div>

                  <div className={cn(
                    "p-1.5 rounded-xl border",
                    student.isMidtermMissing
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-indigo-50/50 text-indigo-900 border-indigo-100"
                  )}>
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider block",
                      student.isMidtermMissing ? "text-rose-600" : "text-indigo-600"
                    )}>Midterm MR</span>
                    <span className="text-xs font-bold">
                      {student.isMidtermMissing ? 'Missing' : student.mr}
                    </span>
                  </div>

                  <div className={cn(
                    "p-1.5 rounded-xl border",
                    student.isSemiFinalMissing
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50/50 text-slate-800 border-amber-100"
                  )}>
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider block",
                      student.isSemiFinalMissing ? "text-rose-600" : "text-amber-600"
                    )}>Semis</span>
                    <span className="text-xs font-bold">
                      {student.isSemiFinalMissing ? 'Missing' : student.sfRate}
                    </span>
                  </div>

                  <div className={cn(
                    "p-1.5 rounded-xl border",
                    student.isFinalMissing
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-orange-50/50 text-orange-900 border-orange-100"
                  )}>
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider block",
                      student.isFinalMissing ? "text-rose-600" : "text-orange-600"
                    )}>Final TFR</span>
                    <span className="text-xs font-bold">
                      {student.isFinalMissing ? 'Missing' : student.tfr}
                    </span>
                  </div>
                </div>

                {/* Summary Scores & GWA */}
                <div className="flex items-center justify-between text-xs font-mono pt-0.5">
                  <div className="text-[11px] text-slate-600 flex items-center gap-2">
                    <span>Sem Grade: <strong className="text-emerald-800">{student.sg}</strong></span>
                    {student.isFDA && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        FDA ({student.absences})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">GWA:</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg font-mono ${
                      !student.hasAnyScores || student.gwa === null
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : student.gwa <= 1.75
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : student.isPassed
                            ? 'bg-sage-100 text-sage-900 border border-sage-200'
                            : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}>
                      {student.hasAnyScores && student.gwa !== null ? student.gwa.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Desktop Computation Matrix Table (hidden md:block) ─────────── */}
        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "hidden md:flex rounded-2xl border border-slate-200 shadow-2xs bg-white overflow-hidden flex-col w-full max-w-full"}>
          
          {/* Header Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-sage-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {classInfo?.subjects?.code} — {classInfo?.sections?.name}
              </span>
              <span className="text-[10px] font-medium text-slate-400 ml-2">
                Milestone Ledger · {filteredStudents.length} of {computedStudents.length} students
              </span>
            </div>
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
              title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
            >
              {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
            <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                  <th className="px-2 py-3 border-r border-slate-200 w-10 sticky left-0 bg-slate-50 z-30">#</th>
                  <th className="px-2 py-3 border-r border-slate-200 w-28 sticky left-[40px] bg-slate-50 z-30">Student No.</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-[152px] bg-slate-50 border-r border-slate-200 z-30 w-56 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Student Name</th>
                  
                  {!isSummer && (
                    <th className="px-3 py-2 border-r border-slate-200 bg-sky-50 text-sky-900 w-24">
                      Prelim (PR)
                    </th>
                  )}
                  
                  {!isSummer && (
                    <th className="px-3 py-2 border-r border-slate-200 bg-indigo-50/40 text-indigo-800 w-24">
                      Midterm Raw
                    </th>
                  )}

                  <th className="px-3 py-2 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold w-28">
                    Midterm (MR)
                  </th>

                  {!isSummer && (
                    <th className="px-3 py-2 border-r border-slate-200 bg-amber-50 text-amber-900 w-24">
                      Semi-Final (SFR)
                    </th>
                  )}

                  {!isSummer && (
                    <th className="px-3 py-2 border-r border-slate-200 bg-orange-50/40 text-orange-800 w-24">
                      Final Raw
                    </th>
                  )}

                  <th className="px-3 py-2 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold w-28">
                    {isSummer ? 'Final Rating' : 'Tentative Final (TFR)'}
                  </th>

                  <th className="px-3 py-2 border-r border-slate-200 bg-emerald-50 text-emerald-950 font-extrabold w-28">
                    Semestral Grade (SG)
                  </th>

                  <th className="px-3 py-2 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold w-24">
                    GWA
                  </th>

                  <th className="px-3 py-2 border-r border-slate-200 text-slate-700 w-20 text-center">
                    Absences
                  </th>

                  <th className="px-3 py-2 border-r border-slate-200 text-slate-700 w-24 text-center">
                    Remarks
                  </th>

                  <th className="px-3 py-2 text-slate-700 w-24 text-center">
                    Score Sheet
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white font-mono text-xs text-center">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-12 text-center text-slate-400 bg-white">
                      <div className="flex flex-col items-center justify-center gap-2 font-sans">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="text-sm font-bold text-slate-600">No students found</p>
                        <p className="text-xs text-slate-400">
                          {studentSearch || statusFilter !== 'all' 
                            ? 'No students matched the current search and status filters.' 
                            : 'There are no students currently enrolled in this class section.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-2 py-3 border-r border-slate-100 text-slate-400 text-[11px] sticky left-0 bg-white z-20">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-3 border-r border-slate-100 text-slate-600 font-bold sticky left-[40px] bg-white z-20">
                        {student.studentNo}
                      </td>
                      <td className="px-4 py-3 text-left font-sans font-bold text-slate-900 sticky left-[152px] bg-white border-r border-slate-100 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] truncate max-w-[220px]">
                        {student.name}
                      </td>

                      {!isSummer && (
                        <td className={cn(
                          "px-3 py-3 border-r border-slate-100 font-bold",
                          student.isPrelimMissing 
                            ? "bg-rose-50/90 text-rose-700 border-l-2 border-rose-400" 
                            : "text-slate-800 bg-sky-50/20"
                        )}>
                          {student.isPrelimMissing ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold font-sans">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Missing</span>
                            </span>
                          ) : (
                            student.pRate
                          )}
                        </td>
                      )}

                      {!isSummer && (
                        <td className={cn(
                          "px-3 py-3 border-r border-slate-100",
                          student.isMidtermMissing
                            ? "bg-rose-50/90 text-rose-700 border-l-2 border-rose-400 font-bold"
                            : "text-slate-500"
                        )}>
                          {student.isMidtermMissing ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold font-sans">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Missing</span>
                            </span>
                          ) : (
                            student.mRate
                          )}
                        </td>
                      )}

                      <td className={cn(
                        "px-3 py-3 border-r border-slate-100 font-extrabold",
                        (student.isPrelimMissing || student.isMidtermMissing)
                          ? "bg-amber-50/70 text-amber-900 border-l-2 border-amber-400"
                          : "text-indigo-900 bg-indigo-50/30"
                      )}>
                        <div className="flex items-center justify-center gap-1">
                          <span>{student.mr}</span>
                          {(student.isPrelimMissing || student.isMidtermMissing) && (
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" title="Incomplete component scores" />
                          )}
                        </div>
                        {!isSummer && (
                          <span className="block text-[9px] text-indigo-500 font-normal font-sans">AVG(P, M)</span>
                        )}
                      </td>

                      {!isSummer && (
                        <td className={cn(
                          "px-3 py-3 border-r border-slate-100 font-bold",
                          student.isSemiFinalMissing
                            ? "bg-rose-50/90 text-rose-700 border-l-2 border-rose-400"
                            : "text-slate-800 bg-amber-50/20"
                        )}>
                          {student.isSemiFinalMissing ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold font-sans">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Missing</span>
                            </span>
                          ) : (
                            student.sfRate
                          )}
                        </td>
                      )}

                      {!isSummer && (
                        <td className={cn(
                          "px-3 py-3 border-r border-slate-100",
                          student.isFinalMissing
                            ? "bg-rose-50/90 text-rose-700 border-l-2 border-rose-400 font-bold"
                            : "text-slate-500"
                        )}>
                          {student.isFinalMissing ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold font-sans">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Missing</span>
                            </span>
                          ) : (
                            student.fRate
                          )}
                        </td>
                      )}

                      <td className={cn(
                        "px-3 py-3 border-r border-slate-100 font-extrabold",
                        (student.isSemiFinalMissing || student.isFinalMissing)
                          ? "bg-amber-50/70 text-amber-900 border-l-2 border-amber-400"
                          : "text-orange-900 bg-orange-50/30"
                      )}>
                        <div className="flex items-center justify-center gap-1">
                          <span>{student.tfr}</span>
                          {(student.isSemiFinalMissing || student.isFinalMissing) && (
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" title="Incomplete component scores" />
                          )}
                        </div>
                        {!isSummer && (
                          <span className="block text-[9px] text-orange-500 font-normal font-sans">AVG(SF, F)</span>
                        )}
                      </td>

                      <td className={cn(
                        "px-3 py-3 border-r border-slate-100 font-extrabold text-sm",
                        student.hasMissingComponents
                          ? "bg-amber-50/80 text-amber-950 border-l-2 border-amber-500"
                          : "text-emerald-950 bg-emerald-50/40"
                      )}>
                        <div className="flex items-center justify-center gap-1">
                          <span>{student.sg}</span>
                          {student.hasMissingComponents && (
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" title="Projected from incomplete terms" />
                          )}
                        </div>
                        <span className="block text-[9px] text-emerald-600 font-normal font-sans">AVG(MR, TFR)</span>
                      </td>

                      <td className="px-3 py-3 border-r border-slate-100">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                          !student.hasAnyScores || student.gwa === null
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : student.gwa <= 1.75
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : student.isPassed
                                ? 'bg-sage-100 text-sage-900 border border-sage-200'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                        }`}>
                          {student.hasAnyScores && student.gwa !== null ? student.gwa.toFixed(2) : '—'}
                        </span>
                      </td>

                      <td className="px-3 py-3 border-r border-slate-100">
                        {student.isFDA ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 font-sans">
                            <AlertCircle className="w-3 h-3 text-rose-600" /> FDA ({student.absences})
                          </span>
                        ) : (
                          <span className="text-slate-600">{student.absences}</span>
                        )}
                      </td>

                      <td className="px-3 py-3 border-r border-slate-100 font-sans">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          !student.hasAnyScores
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : student.isPassed 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {!student.hasAnyScores ? 'Pending' : student.remarks}
                        </span>
                      </td>

                      <td className="px-3 py-3 font-sans">
                        <Link
                          to={`/faculty/scoreinput?id=${classRecordId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-sage-50 hover:text-sage-700 border border-slate-200 hover:border-sage-300 rounded-lg transition-colors shadow-2xs"
                          title="Open raw score spreadsheet for this class"
                        >
                          <FileSpreadsheet className="w-3 h-3 text-sage-600" />
                          <span>Details</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* ── 3-Step Gradual Milestone Confirmation Modal ────────────────────────────── */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4 animate-in fade-in duration-200 text-left">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
              <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
              <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                    <Send className="h-4 w-4 text-emerald-600" />
                    <span>Post Grades for Student Consultation</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                    Publish recorded scores gradually by milestone step to poke students for consultation. Scores remain editable if adjustments are needed.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowConfirmModal(false);
                    setPendingPostMilestone(null);
                  }}
                  className="text-slate-400 hover:text-slate-650 transition-colors p-1 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-3.5 max-h-[70vh] overflow-y-auto">

                {pendingPostMilestone ? (
                  <div className="p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 font-sans uppercase tracking-wider">
                          Confirm {pendingPostMilestone === 'midterm' ? (isSummer ? 'Midterm Grade' : 'Midterm Rating (MR)') : pendingPostMilestone === 'tfr' ? (isSummer ? 'Final Grade (TFR)' : 'Tentative Final Rating (TFR)') : 'Official Semestral Grade (SG)'} Release
                        </h4>
                        <p className="text-xs text-amber-900 mt-1 leading-relaxed font-sans">
                          {pendingPostMilestone === 'midterm' && (
                            `Are you sure you want to post ${isSummer ? 'Midterm Grade' : 'Midterm Rating (MR)'}? This will notify enrolled students for consultation. Scores remain editable if adjustments are needed.`
                          )}
                          {pendingPostMilestone === 'tfr' && (
                            `Are you sure you want to post ${isSummer ? 'Final Grade (TFR)' : 'Tentative Final Rating (TFR)'}? This will notify enrolled students for consultation so they can review their recorded period scores.`
                          )}
                          {pendingPostMilestone === 'semestral' && (
                            `Are you sure you want to finalize Official Semestral Grade (SG)? This will publish final semestral grades and GWA for student review and official submission.`
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-amber-200/60">
                      <button
                        type="button"
                        onClick={() => setPendingPostMilestone(null)}
                        className="px-3.5 py-2 text-xs font-semibold border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-xl transition-colors font-sans cursor-pointer"
                      >
                        Back / Cancel
                      </button>
                      <button
                        type="button"
                        disabled={postingGrades}
                        onClick={() => handlePostGrades(pendingPostMilestone)}
                        className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-xl transition-colors shadow-2xs font-sans disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {postingGrades ? 'Posting...' : 'Yes, Confirm & Release'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Milestone Option 1: Midterm Rating (MR) */}
                    <div className={`p-4 rounded-xl border transition-all ${
                      lockedMilestones.includes('Midterm Rating') || lockedMilestones.includes('Midterm')
                        ? 'bg-slate-50 border-slate-200 opacity-90'
                        : 'bg-indigo-50/50 border-indigo-200 hover:border-indigo-400'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-indigo-900 font-sans">Step 1: {isSummer ? 'Midterm Grade' : 'Midterm Rating (MR)'}</span>
                            {(lockedMilestones.includes('Midterm Rating') || lockedMilestones.includes('Midterm')) ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                                <Check className="w-3 h-3" /> Posted for Consultation
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                                Ready for Consultation
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            {isSummer 
                              ? 'Posts Midterm period scores for student consultation. Freezes Midterm input cells.' 
                              : 'Posts Prelim & Midterm period scores + Midterm Rating (MR) for student consultation. Freezes Midterm input cells.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={postingGrades || lockedMilestones.includes('Midterm Rating') || lockedMilestones.includes('Midterm')}
                          onClick={() => setPendingPostMilestone('midterm')}
                          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-xs shrink-0 disabled:opacity-40 cursor-pointer"
                        >
                          Post MR
                        </button>
                      </div>
                    </div>

                    {/* Milestone Option 2: Tentative Final Rating (TFR) */}
                    <div className={`p-4 rounded-xl border transition-all ${
                      lockedMilestones.includes('Tentative Final Rating') || lockedMilestones.includes('Final')
                        ? 'bg-slate-50 border-slate-200 opacity-90'
                        : 'bg-amber-50/50 border-amber-200 hover:border-amber-400'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-amber-900 font-sans">Step 2: {isSummer ? 'Final Grade (TFR)' : 'Tentative Final Rating (TFR)'}</span>
                            {(lockedMilestones.includes('Tentative Final Rating') || lockedMilestones.includes('Final')) ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                                <Check className="w-3 h-3" /> Posted for Consultation
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                                Ready for Consultation
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            {isSummer 
                              ? 'Posts Final period scores for consultation before official semestral locking.'
                              : 'Posts Semi-Final & Final period scores + Tentative Final Rating (TFR) for student consultation.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={postingGrades || lockedMilestones.includes('Tentative Final Rating') || lockedMilestones.includes('Final')}
                          onClick={() => setPendingPostMilestone('tfr')}
                          className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs shrink-0 disabled:opacity-40 cursor-pointer"
                        >
                          Post TFR
                        </button>
                      </div>
                    </div>

                    {/* Milestone Option 3: Official Semestral Grade (SG) */}
                    <div className={`p-4 rounded-xl border transition-all ${
                      lockedMilestones.includes('Semestral Grade')
                        ? 'bg-slate-50 border-slate-200 opacity-90'
                        : 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-400'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-955 font-sans">Step 3: Official Semestral Grade (SG)</span>
                            {lockedMilestones.includes('Semestral Grade') ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-200 text-emerald-900 rounded-md flex items-center gap-1">
                                <Check className="w-3 h-3" /> Officially Locked & Submitted
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                                Final Lock & Submit
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Finalizes overall Semestral Grade (SG) & Transmuted GWA. Submits official grade sheet to Dean & Registrar.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={postingGrades || lockedMilestones.includes('Semestral Grade')}
                          onClick={() => setPendingPostMilestone('semestral')}
                          className="px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors shadow-xs shrink-0 disabled:opacity-40 cursor-pointer"
                        >
                          Finalize SG
                        </button>
                      </div>
                    </div>
                  </>
                )}

              </div>

              <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">
                  {lockedMilestones.length > 0 ? `${lockedMilestones.length} milestone(s) active` : 'No milestones posted yet'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setPendingPostMilestone(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors font-sans cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 📊 Export Excel / PDF Metadata Prompt Modal */}
        <ExportPreviewModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          classInfo={classInfo}
          students={computedStudents}
          maxItems={maxItems}
          metadata={exportMetadata}
          onMetadataChange={(updated) => setExportMetadata(prev => ({ ...prev, ...updated }))}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        />

      </div>
    </>
  );
}

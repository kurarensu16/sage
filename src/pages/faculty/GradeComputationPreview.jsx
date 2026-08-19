import { getTransmutedGrade } from '../../lib/gradingMath';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import StudentRow from '../../components/StudentRow';
import { ChevronRight, AlertTriangle, Send, Download, ChevronDown, Maximize2, Minimize2, FileSpreadsheet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function GradeComputationPreview() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const classRecordId = searchParams.get('id') || '';

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lockedMilestones, setLockedMilestones] = useState([]);
  const [postingGrades, setPostingGrades] = useState(false);

  const [classInfo, setClassInfo] = useState(null);
  const [classesList, setClassesList] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });

  const periodsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  // Load faculty classes for dropdown selector
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
            subjects ( code, name ),
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

        const studentList = (enrolls || [])
          .map(e => e.users)
          .filter(Boolean)
          .map((u, idx) => ({
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

  

  const handlePostGrades = async () => {
    if (!classRecordId || students.length === 0) return;
    setPostingGrades(true);
    try {
      // 1. Fetch existing posted grades for this class record and period to match primary keys
      const { data: existingPg, error: fetchErr } = await supabase
        .from('posted_grades')
        .select('posted_grade_id, student_id')
        .eq('class_record_id', classRecordId)
        .eq('grade_period', 'final');

      if (fetchErr) throw fetchErr;

      const existingMap = {};
      if (existingPg) {
        existingPg.forEach(row => {
          existingMap[row.student_id] = row.posted_grade_id;
        });
      }

      const postRows = [];
      const mapRemarkToDb = (remarkStr) => {
        if (!remarkStr) return 'passed';
        const lower = remarkStr.toLowerCase();
        if (lower === 'inc') return 'incomplete';
        return lower; // 'passed', 'failed', 'fda', 'dropped'
      };

      students.forEach(stud => {
        // Recalculate Final Rating based on ScoreInput.jsx formula
        const getTermRating = (termName) => {
          const tSc = stud.periods[termName] || {};
          const tMx = maxItems[termName] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
          const tCs = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
          const tCsMx = tMx.act1 + tMx.act2 + tMx.act3 + tMx.act4 + tMx.act5 + tMx.act6;
          const tCsP = tCsMx > 0 ? (tCs / tCsMx) * 50 : 0;
          const tChP = (tSc.char || 0) * 0.1;
          const tExP = tMx.exam > 0 ? ((tSc.exam || 0) / tMx.exam) * 40 : 0;
          return Math.min(100, Math.max(0, Math.round(tCsP + tChP + tExP)));
        };

        const prelimRating = getTermRating('Prelim');
        const midtermRating = getTermRating('Midterm');
        const sfRating = getTermRating('Semi-Final');
        const finalRating = getTermRating('Final');

        const mr = Math.round((prelimRating + midtermRating) / 2);
        const tfr = Math.round((sfRating + finalRating) / 2);
        const finalSG = Math.round((mr + tfr) / 2);

        const rawGWA = getTransmutedGrade(finalSG);
        const autoRemarks = rawGWA <= 3.00 ? 'Passed' : 'Failed';
        const draftRemarks = stud.customRemarks || autoRemarks;
        const remarksLabel = mapRemarkToDb(draftRemarks);

        let computedGWA = rawGWA;
        if (remarksLabel === 'passed' && rawGWA > 3.00) {
          computedGWA = 3.00;
        }

        const payloadRow = {
          class_record_id: classRecordId,
          student_id: stud.id,
          grade_period: 'final',
          computed_grade: finalRating,
          effective_grade: computedGWA,
          remarks: remarksLabel,
          remarks_note: stud.remarksNote || null,
          remarks_set_by: user.id,
          remarks_set_at: new Date().toISOString(),
          posted_by: user.id,
          posted_at: new Date().toISOString(),
          is_locked: true,
          locked_milestones: ['Semestral Grade']
        };

        const existingId = existingMap[stud.id];
        payloadRow.posted_grade_id = existingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }));

        postRows.push(payloadRow);
      });

      // Post to Supabase
      const { error: postErr } = await supabase
        .from('posted_grades')
        .upsert(postRows);

      if (postErr) throw postErr;

      setLockedMilestones(['Semestral Grade']);

      // Log activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Grade Posting',
        `Posted and locked Semestral grades for subject ${classInfo?.subjects?.code} - ${classInfo?.sections?.name}`,
        actorName
      );

      setShowConfirmModal(false);
      alert('Grades posted and locked successfully!');
      navigate('/faculty/postedgradesview');
    } catch (err) {
      console.error('Error posting grades to database:', err);
      alert('Failed to post grades: ' + err.message);
    } finally {
      setPostingGrades(false);
    }
  };

  const handleClassChange = (newClassId) => {
    setSearchParams({ id: newClassId });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading computation preview...</p>
        </div>
      </div>
    );
  }

  if (!classRecordId) {
    return (
      <>
        <PageHeader title="Select Class Record" breadcrumb="Faculty Portal" />
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display">Select a Class to Preview Grades</h2>
              <p className="text-sm text-slate-500 mt-1">Please select one of your active classes to load its grading preview spreadsheet.</p>
            </div>
            {classesList.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <FileSpreadsheet className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-base font-bold text-slate-900">No Active Class Records Found</h3>
                <p className="text-sm text-slate-505 mt-2">You do not have any active class records.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classesList.map(c => (
                  <button
                    key={c.class_record_id}
                    onClick={() => handleClassChange(c.class_record_id)}
                    className="p-5 bg-white border border-slate-250 hover:border-sage-400 rounded-xl shadow-xs hover:shadow-sm transition-all text-left flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{c.subjects?.code} - {c.sections?.name}</h4>
                      <p className="text-xs text-slate-500 mt-1">{c.subjects?.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.school_year} · {c.semester} Sem</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Computation Preview" breadcrumb="Faculty Portal">
        <button 
          onClick={() => navigate(`/faculty/scoreinput?id=${classRecordId}`)}
          className="px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
        >
          📝 Input Scores
        </button>
        <button 
          onClick={() => setShowConfirmModal(true)}
          disabled={lockedMilestones.includes('Semestral Grade') || postingGrades}
          className="px-4 py-2 text-sm font-semibold text-white bg-sage-600 hover:bg-sage-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <Send className="h-4 w-4" /> {lockedMilestones.includes('Semestral Grade') ? 'Grades Posted' : 'Post Grades'}
        </button>
      </PageHeader>
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6 relative">

          {/* Selector Bar */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Class Record Selector */}
            <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
              <div className="relative">
                <select
                  value={classRecordId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
                >
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
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
                <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{students.length} Students</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview Mode</p>
                <p className="text-xs font-mono font-bold text-amber-700 mt-0.5">Read-Only Spreadsheet View</p>
              </div>
            </div>
          </div>
        
        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5 animate-pulse" />
            <div className="text-left">
                <h4 className="text-sm font-bold text-amber-800">Review Before Posting</h4>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                    Please review the computed grades carefully. Once you click <strong>Post Grades</strong>, they will be locked and visible to students. Any changes will require a formal Dean administrative override approval.
                </p>
            </div>
        </div>

        {/* Header Info */}
        <div className="flex items-center gap-2 text-sm text-slate-505">
            <Link to="/faculty/classrecordslist" className="hover:text-sage-600 transition-colors">Class Records</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-slate-900">
              {classInfo?.subjects?.code} - {classInfo?.sections?.name} (Semestral Summary)
            </span>
        </div>

        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col w-full max-w-full"}>
            {/* Fullscreen header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {classInfo?.subjects?.code} - {classInfo?.sections?.name}
                </span>
                {isFullScreen && (
                  <span className="text-[10px] font-medium text-slate-400 ml-2">
                    Semestral Summary · {students.length} students
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-550 hover:text-slate-700 transition-all cursor-pointer"
                title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10 sticky left-0 bg-slate-50 z-30">No.</th>
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24 sticky left-[40px] bg-slate-50 z-30">Student No.</th>
                            <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-[136px] bg-slate-50 border-r border-slate-200 z-30 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Student Name</th>
                            {/* Prelim Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">PRELIMINARY GRADE</th>
                            
                            {/* Midterm Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">MIDTERM GRADE</th>
                            
                            {/* Midterm Rating */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">Midterm Rating (MR)</th>
                            
                            {/* Semi-Final Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">SEMI-FINAL GRADE</th>
                            
                            {/* Final Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">FINAL GRADE</th>
                            
                            {/* Tentative Final Rating */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold uppercase tracking-wider w-16">Tentative Final Rating (TFR)</th>
                            
                            {/* Semestral Grade */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">Semestral Grade (SG)</th>
                            
                            {/* Equivalent (GWA) */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-16">Equivalent GWA</th>
                            
                            {/* Remarks */}
                            <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-20">Remarks</th>
                        </tr>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[9px] font-bold text-center">
                          {/* Prelim sub-headers */}
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Raw</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-2 py-1.5 border-r border-slate-200 bg-sky-100/30 font-bold w-14 text-slate-800">Rating</th>

                          {/* Midterm sub-headers */}
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Raw</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-2 py-1.5 border-r border-slate-200 bg-indigo-100/30 font-bold w-14 text-slate-800">Rating</th>

                          {/* Semi-Final sub-headers */}
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Raw</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-2 py-1.5 border-r border-slate-200 bg-amber-100/30 font-bold w-14 text-slate-800">Rating</th>

                          {/* Final sub-headers */}
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                          <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Raw</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                          <th className="px-2 py-1.5 border-r border-slate-200 bg-orange-100/30 font-bold w-14 text-slate-800">Rating</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {students.map((student, idx) => (
                          <StudentRow 
                            key={student.id} 
                            student={student} 
                            rowNo={idx + 1}
                            initialPeriods={student.periods}
                            readOnly={true}
                            lockedMilestones={lockedMilestones}
                          />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        
        {/* Confirmation Modal */}
        {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-6 text-left">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center">
                                <Send className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Post Semestral Grades</h3>
                                <p className="text-xs text-slate-455 font-semibold">Finalize scores and lock editing for all term milestones.</p>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed space-y-2">
                            <p><strong>⚠️ Action is irreversible:</strong> Finalizing and posting will lock this class record (<strong>{classInfo?.subjects?.code} - {classInfo?.sections?.name}</strong>) across all periods.</p>
                            <p>Once posted, these grades will be visible to students. Any subsequent changes will require formal Dean administrative override approval.</p>
                        </div>
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button 
                          onClick={() => setShowConfirmModal(false)}
                          className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handlePostGrades}
                          className="px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" /> Confirm & Post Grades
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </>
  );
}

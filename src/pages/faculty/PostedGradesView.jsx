import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import StudentRow from '../../components/StudentRow';
import { 
  ChevronRight, 
  Lock, 
  Search, 
  Download, 
  FileSpreadsheet, 
  AlertTriangle,
  Maximize2,
  Minimize2,
  MessageSquare,
  Send,
  X,
  Check
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function PostedGradesView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const classRecordId = new URLSearchParams(location.search).get('id');

  const [classInfo, setClassInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lockedMilestones, setLockedMilestones] = useState([]);
  const [unlockRequests, setUnlockRequests] = useState([]);

  // Success modals
  const [showPopup, setShowPopup] = useState(false);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupDesc, setPopupDesc] = useState('');

  // Remark override request modal state
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkReqStudent, setRemarkReqStudent] = useState('');
  const [remarkReqStudentId, setRemarkReqStudentId] = useState('');
  const [remarkReqFrom, setRemarkReqFrom] = useState('Failed');
  const [remarkReqTo, setRemarkReqTo] = useState('INC');
  const [remarkReqNote, setRemarkReqNote] = useState('');
  const [remarkReqSent, setRemarkReqSent] = useState(false);

  // Maximum items configuration for activities and exams per period
  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });



  useEffect(() => {
    async function loadPostedGradesData() {
      if (!classRecordId || !user) return;
      setLoading(true);
      try {
        // 1. Fetch class record info
        const { data: cr, error: crErr } = await supabase
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
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;
        setClassInfo(cr);

        // 2. Fetch all students in this section directly from the users table
        const { data: sectionStudents, error: studentErr } = await supabase
          .from('users')
          .select('user_id, first_name, last_name, email, user_number')
          .eq('section_id', cr.section_id)
          .eq('role', 'student');

        if (studentErr) throw studentErr;

        const studentList = (sectionStudents || []).map((u, idx) => ({
          id: u.user_id,
          studentNo: u.user_number || (u.email ? u.email.split('@')[0].toUpperCase() : `STUD-${idx}`),
          name: `${u.last_name}, ${u.first_name}`,
          email: u.email
        }));
        studentList.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(studentList);

        // 3. Fetch column setup configurations
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

        // 4. Fetch saved term scores from db
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
              Final: {},
              customRemarks: '',
              remarksNote: ''
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

        // 5. Fetch posted grades to check customRemarks/overrides and locked milestones
        const { data: pgData } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('class_record_id', classRecordId);

        const locked = new Set();

        (pgData || []).forEach(row => {
          if (!scoresByStudent[row.student_id]) {
            scoresByStudent[row.student_id] = {
              Prelim: {},
              Midterm: {},
              'Semi-Final': {},
              Final: {},
              customRemarks: '',
              remarksNote: ''
            };
          }
          if (row.grade_period === 'final') {
            scoresByStudent[row.student_id].customRemarks = row.remarks === 'passed' ? 'Passed' : row.remarks === 'failed' ? 'Failed' : row.remarks.toUpperCase();
            scoresByStudent[row.student_id].remarksNote = row.remarks_note || '';
          }

          if (row.is_locked) {
            if (row.grade_period === 'final') {
              locked.add('Final');
              locked.add('Semestral Grade');
            }
            if (row.locked_milestones) {
              row.locked_milestones.forEach(m => {
                const norm = m.toLowerCase();
                if (norm === 'final' || norm === 'semestral grade' || norm === 'semestral_grade') {
                  locked.add('Final');
                  locked.add('Semestral Grade');
                }
              });
            }
          }
        });

        setLockedMilestones(Array.from(locked));

        // 6. Fetch unlock requests from database
        const { data: dbReqs } = await supabase
          .from('unlock_requests')
          .select('milestone, status')
          .eq('class_record_id', classRecordId);

        // Fetch unlock requests from localStorage (to merge/sync)
        const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${classRecordId}`) || '[]');
        const pendingSet = new Set(localReqs);
        (dbReqs || []).forEach(r => {
          if (r.status === 'pending') {
            pendingSet.add(r.milestone);
          } else {
            pendingSet.delete(r.milestone);
          }
        });
        setUnlockRequests(Array.from(pendingSet));

        // 7. Initialize local draft caches
        studentList.forEach(stud => {
          const STORAGE_KEY = `sage_scores_${classRecordId}_${stud.id}`;
          const existingDraft = localStorage.getItem(STORAGE_KEY);
          
          const dbData = scoresByStudent[stud.id] || {};
          let draftPayload = {};
          if (existingDraft) {
            try {
              draftPayload = JSON.parse(existingDraft);
            } catch {
              // Ignore invalid JSON in local storage
            }
          }
          
          const merged = {
            Prelim: { ...draftPayload.Prelim, ...dbData.Prelim },
            Midterm: { ...draftPayload.Midterm, ...dbData.Midterm },
            'Semi-Final': { ...draftPayload['Semi-Final'], ...dbData['Semi-Final'] },
            Final: { ...draftPayload.Final, ...dbData.Final },
            customRemarks: dbData.customRemarks || draftPayload.customRemarks || '',
            remarksNote: dbData.remarksNote || draftPayload.remarksNote || '',
            savedAt: new Date().toISOString()
          };
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        });

      } catch (err) {
        console.error('Error loading PostedGradesView data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPostedGradesData();
  }, [classRecordId, user]);

  const handleRequestUnlock = async (milestone) => {
    if (!classRecordId) return;

    try {
      // 1. Database: Insert to unlock_requests
      const { error } = await supabase
        .from('unlock_requests')
        .insert({
          class_record_id: classRecordId,
          milestone: milestone,
          requested_by: user.id,
          status: 'pending'
        });

      if (error) throw error;

      // 2. LocalStorage: Dual-write for Dean UI compatibility
      const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${classRecordId}`) || '[]');
      if (!localReqs.includes(milestone)) {
        localReqs.push(milestone);
        localStorage.setItem(`unlock_requests_${classRecordId}`, JSON.stringify(localReqs));
      }

      // Update state
      setUnlockRequests(prev => [...prev, milestone]);

      // 3. Log audit activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Unlock Request',
        `Requested unlock of ${milestone} milestone for subject ${classInfo?.subjects?.code}`,
        actorName
      );

      setPopupTitle('Unlock Requested');
      setPopupDesc(`Request to unlock ${milestone} has been sent to the Dean. Modifying scores will be enabled once approved.`);
      setShowPopup(true);
    } catch (err) {
      console.error('Error requesting milestone unlock:', err);
    }
  };

  const handleSubmitRemarkRequest = async () => {
    if (!remarkReqStudent || !remarkReqNote.trim() || !classRecordId) return;

    try {
      const subjCode = classInfo?.subjects?.code || '';
      const subjName = classInfo?.subjects?.name || '';
      const sectName = classInfo?.sections?.name || '';
      const actorName = resolveActorName(profile, user);
      const effectiveGradeVal = remarkReqTo === 'Passed' ? 3.00 : 5.00;

      // 1. Database: Insert into remark_override_requests (primary store)
      const { data: rorRow, error: rorErr } = await supabase
        .from('remark_override_requests')
        .insert({
          class_record_id: classRecordId,
          student_id: remarkReqStudentId || null,
          requested_by: user.id,
          subject_name: `${subjCode} - ${subjName}`,
          section_name: sectName,
          faculty_name: actorName,
          computed_grade: 5.00,
          effective_grade: effectiveGradeVal,
          current_remark: remarkReqFrom,
          requested_remark: remarkReqTo,
          note: remarkReqNote,
          status: 'pending'
        })
        .select('request_id')
        .single();

      // 2. Database: Insert unlock_requests row for 'Semestral Grade' milestone
      //    so Dean's Grade Posting Status page shows the pending indicator
      await supabase
        .from('unlock_requests')
        .insert({
          class_record_id: classRecordId,
          milestone: 'Semestral Grade',
          requested_by: user.id,
          status: 'pending'
        });

      // 3. LocalStorage: Dual-write fallback for backward compatibility
      const existing = JSON.parse(localStorage.getItem('remark_override_requests') || '[]');
      const newReq = {
        id: rorRow?.request_id || `ror-${Date.now()}`,
        classCode: classRecordId,
        subjectName: `${subjCode} - ${subjName}`,
        facultyName: actorName,
        section: sectName,
        studentId: remarkReqStudentId,
        studentName: remarkReqStudent,
        computedGrade: '5.00',
        effectiveGrade: effectiveGradeVal.toFixed(2),
        currentRemark: remarkReqFrom,
        requestedRemark: remarkReqTo,
        note: remarkReqNote,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        resolvedAt: null,
      };
      if (rorErr) {
        console.warn('DB insert failed, storing to localStorage only:', rorErr.message);
        existing.push(newReq);
        localStorage.setItem('remark_override_requests', JSON.stringify(existing));
      } else {
        existing.push(newReq);
        localStorage.setItem('remark_override_requests', JSON.stringify(existing));
      }

      // 4. Log activity
      await logActivity(
        'Remark Override Request',
        `Requested remark override for student ${remarkReqStudent} (${remarkReqFrom} -> ${remarkReqTo}) in ${subjCode}`,
        actorName
      );

      setRemarkReqSent(true);
      setTimeout(() => {
        setShowRemarkModal(false);
        setRemarkReqSent(false);
        setRemarkReqStudent('');
        setRemarkReqStudentId('');
        setRemarkReqNote('');
        setRemarkReqTo('INC');
        setPopupTitle('Override Submitted');
        setPopupDesc(`Remark change request for ${newReq.studentName} has been submitted to the Dean.`);
        setShowPopup(true);
      }, 1500);

    } catch (err) {
      console.error('Error submitting remark change request:', err);
    }
  };


  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading locked grade logs...</p>
        </div>
      </div>
    );
  }

  const subjectCode = classInfo?.subjects?.code || '';
  const subjectName = classInfo?.subjects?.name || '';
  const sectionName = classInfo?.sections?.name || '';

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <PageHeader title="View Posted Grades" breadcrumb="Faculty Portal">
        <button 
          onClick={() => navigate(`/faculty/scoreinput?id=${classRecordId}`)}
          className="px-4 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-1.5 font-sans"
        >
          📝 Input Scores
        </button>
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2 font-sans">
          <Download className="h-4 w-4" /> Export PDF
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">{subjectCode} ({sectionName}) — Locked Grades</span>
        </div>

        {/* Dynamic Lock Alert Banner with Dean's Override Panel */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div className="flex gap-3">
              <Lock className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-sm text-slate-800">Class Record Registry Lock</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Active registry locks are applied dynamically based on posted term milestones. To modify locked records, Dean approval is required.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {!(lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final')) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-250 text-emerald-700">
                      🔓 Draft Mode (Fully Editable)
                    </span>
                  ) : (
                    <div className="inline-flex items-center gap-2 bg-rose-50/50 border border-rose-200 rounded-lg p-1.5 pr-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 font-mono">
                        🔒 Semestral Grades Posted (Locked)
                      </span>
                      {unlockRequests.includes('Semestral Grade') || unlockRequests.includes('Final') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 border border-amber-250 text-amber-700">
                          ⏳ Unlock Requested
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRequestUnlock('Semestral Grade')}
                          className="px-2 py-0.5 text-[9px] font-bold bg-white border border-slate-200 hover:border-sage-300 text-slate-650 hover:text-sage-700 rounded transition-colors outline-none"
                        >
                          📨 Request Unlock
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Remark Change button */}
            <button
              onClick={() => setShowRemarkModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-300 rounded-lg transition-colors shadow-sm outline-none flex-shrink-0 font-sans"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Request Remark Change
            </button>
          </div>
        </div>

        {/* Class Selection & Search Toolbar */}
        <div className="flex flex-wrap justify-between items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Class Record */}
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              {subjectCode} - {sectionName} ({subjectName})
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Search bar */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Students</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-sage-500 focus:border-sage-500 text-xs font-semibold transition-colors outline-none bg-white text-slate-700" 
                placeholder="Search student name..." 
              />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Verification lock badge */}
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400/45"></span> Verified Registry Lock Active
          </div>
        </div>

        {/* Data Table Card */}
        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col"}>
            {/* Fullscreen header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Posted Grades — {subjectCode} ({sectionName})
                </span>
                <span className="text-[10px] font-medium text-slate-400 ml-2">
                  Posted Record · {filteredStudents.length} students
                </span>
              </div>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-slate-700 transition-all"
                title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10">No.</th>
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24">Student No.</th>
                            <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-0 bg-slate-50 border-r border-slate-200 z-20 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Student Name</th>
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">PRELIMINARY GRADE</th>
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">MIDTERM GRADE</th>
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">Midterm Rating (MR)</th>
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">SEMI-FINAL GRADE</th>
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">FINAL GRADE</th>
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold uppercase tracking-wider w-16">Tentative Final Rating (TFR)</th>
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">Semestral Grade (SG)</th>
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-16">Equivalent GWA</th>
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
                    <tbody className="divide-y divide-slate-100">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student, idx) => (
                            <StudentRow 
                              key={student.id} 
                              student={student} 
                              rowNo={idx + 1}
                              initialPeriods={{
                                Prelim: {},
                                Midterm: {},
                                'Semi-Final': {},
                                Final: {}
                              }}
                              readOnly={true}
                              classCode={classRecordId}
                              maxItems={maxItems}
                              lockedMilestones={lockedMilestones}
                            />
                          ))
                        ) : (
                          <tr>
                            <td colSpan={57} className="py-10 text-center text-slate-400 font-semibold text-xs">
                              No student records found matching search.
                            </td>
                          </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>

      {/* ══════ Remark Override Request Modal ══════ */}
      {showRemarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setShowRemarkModal(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 space-y-5 z-10 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 font-display">
                  <MessageSquare className="h-4 w-4 text-violet-550 text-violet-650" />
                  Request Remark Change
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Submit to Dean for approval. Grade row will be unlocked only after Dean approves.
                </p>
              </div>
              <button
                onClick={() => setShowRemarkModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {/* Student selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Student</label>
              <select
                value={remarkReqStudent}
                onChange={e => {
                  setRemarkReqStudent(e.target.value);
                  const selected = students.find(s => s.name === e.target.value);
                  if (selected) setRemarkReqStudentId(selected.id);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 bg-white cursor-pointer"
              >
                <option value="">— Select a student —</option>
                {students.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Remark change */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Remark</label>
                <select
                  value={remarkReqFrom}
                  onChange={e => setRemarkReqFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 bg-white cursor-pointer"
                >
                  {['Passed','Failed','INC','FDA','Dropped'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Change To</label>
                <select
                  value={remarkReqTo}
                  onChange={e => setRemarkReqTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 bg-white cursor-pointer"
                >
                  {['Passed','Failed','INC','FDA','Dropped'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Grace pass info */}
            {remarkReqTo === 'Passed' && (
              <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 text-xs text-violet-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-violet-500" />
                <span>Grace Pass: if approved, effective grade will be recorded as <strong>3.00</strong> regardless of computed grade.</span>
              </div>
            )}

            {/* Reason note */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Reason / Justification <span className="text-rose-500">*</span></label>
              <textarea
                rows={3}
                value={remarkReqNote}
                onChange={e => setRemarkReqNote(e.target.value)}
                placeholder="Explain why this remark change is needed…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 resize-none bg-white transition-colors"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowRemarkModal(false)}
                className="flex-1 px-4 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-650 hover:bg-slate-50 rounded-lg transition-colors font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRemarkRequest}
                disabled={!remarkReqStudent || !remarkReqNote.trim() || remarkReqSent}
                className={cn(
                  'flex-1 px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 font-sans',
                  remarkReqSent
                    ? 'bg-emerald-500 text-white'
                    : !remarkReqStudent || !remarkReqNote.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                )}
              >
                {remarkReqSent
                  ? '✓ Request Sent'
                  : <><Send className="h-3.5 w-3.5" /> Submit to Dean</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 font-display">{popupTitle}</h3>
              <p className="text-xs text-slate-500">{popupDesc}</p>
            </div>
            <button
              onClick={() => setShowPopup(false)}
              className="w-full py-2 bg-sage-600 hover:bg-sage-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm font-sans"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}

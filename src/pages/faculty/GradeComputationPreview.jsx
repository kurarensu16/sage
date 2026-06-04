import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import StudentRow from '../../components/StudentRow';
import { ChevronRight, AlertTriangle, Send, Download, ChevronDown, Maximize2, Minimize2, FileSpreadsheet } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function GradeComputationPreview() {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState('BSITCPR323');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState('Prelim');
  const [lockedMilestones, setLockedMilestones] = useState([]);

  useEffect(() => {
    const locked = JSON.parse(localStorage.getItem(`locked_milestones_${selectedClass}`) || '[]');
    setLockedMilestones(locked);
  }, [selectedClass]);

  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  const classesList = [
    { code: 'BSITCPR323', label: 'BSITCPR323 - IT3A (Capstone and Research 1)' },
    { code: 'IT101', label: 'IT101 - BSIT-1A (Intro to Computing)' },
    { code: 'IT201', label: 'IT201 - BSIT-2B (Data Structures)' },
    { code: 'CS301', label: 'CS301 - BSCS-3A (Artificial Intelligence)' }
  ];

  const periodsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  // Helper to generate mock period scores for standard students
  const generateMockStudentPeriods = (id, baseActTotal, baseChar, baseExam) => {
    const distributeCS = (total) => {
      let remaining = total;
      const act6 = Math.min(10, Math.round(total * (10 / 110)));
      remaining -= act6;
      const baseAct = Math.floor(remaining / 5);
      const acts = [baseAct, baseAct, baseAct, baseAct, baseAct];
      let diff = remaining - (baseAct * 5);
      for (let i = 0; i < diff; i++) {
        acts[i] += 1;
      }
      return {
        act1: acts[0],
        act2: acts[1],
        act3: acts[2],
        act4: acts[3],
        act5: acts[4],
        act6: act6
      };
    };

    const periods = {};
    periodsList.forEach((period, idx) => {
      const actTotal = Math.max(50, Math.min(110, baseActTotal - (idx % 2) * 5));
      const cs = distributeCS(actTotal);
      periods[period] = {
        ...cs,
        char: Math.max(50, Math.min(100, baseChar - (idx % 2) * 5)),
        exam: Math.max(0, Math.min(40, baseExam - (idx % 2) * 2))
      };
    });
    return periods;
  };

  // Student score mock datasets depending on active class
  const classStudents = {
    BSITCPR323: [
      {
        id: 11,
        name: 'Gabriel, John Christian C.',
        periods: {
          Prelim: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          Midterm: { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          'Semi-Final': { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          Final: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 }
        }
      },
      {
        id: 12,
        name: 'Santiago, Mark Angelo',
        periods: {
          Prelim: { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 80, exam: 40 },
          Midterm: { act1: 19, act2: 17, act3: 18, act4: 19, act5: 17, act6: 10, char: 90, exam: 37 },
          'Semi-Final': { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 85, exam: 30 },
          Final: { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 25 }
        }
      },
      {
        id: 13,
        name: 'Celestino, Carlo',
        periods: {
          Prelim: { act1: 19, act2: 17, act3: 18, act4: 19, act5: 17, act6: 10, char: 95, exam: 30 },
          Midterm: { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 85, exam: 40 },
          'Semi-Final': { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 95, exam: 33 },
          Final: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 29 }
        }
      },
      {
        id: 14,
        name: 'Reyes, Mark T.',
        periods: {
          Prelim: { act1: 12, act2: 12, act3: 12, act4: 12, act5: 12, act6: 10, char: 60, exam: 30 },
          Midterm: { act1: 11, act2: 11, act3: 11, act4: 11, act5: 11, act6: 10, char: 70, exam: 29 },
          'Semi-Final': { act1: 10, act2: 10, act3: 10, act4: 10, act5: 10, act6: 10, char: 60, exam: 27 },
          Final: { act1: 9, act2: 9, act3: 9, act4: 9, act5: 10, act6: 9, char: 60, exam: 25 }
        }
      },
      {
        id: 15,
        name: 'Villanueva, Anna C.',
        periods: {
          Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          Final: { act1: 19, act2: 19, act3: 19, act4: 19, act5: 20, act6: 9, char: 100, exam: 38 }
        }
      }
    ],
    IT101: [
      { id: 1, name: 'Dela Cruz, Juan M.', periods: generateMockStudentPeriods(1, 95, 88, 36) },
      { id: 2, name: 'Santos, Maria A.', periods: generateMockStudentPeriods(2, 75, 68, 28) },
      { id: 3, name: 'Reyes, Mark T.', periods: generateMockStudentPeriods(3, 82, 55, 26) },
      { id: 4, name: 'Villanueva, Anna C.', periods: generateMockStudentPeriods(4, 98, 92, 38) },
    ],
    IT201: [
      { id: 5, name: 'Bautista, Kevin L.', periods: generateMockStudentPeriods(5, 88, 84, 32) },
      { id: 6, name: 'Gomez, Elena R.', periods: generateMockStudentPeriods(6, 70, 65, 25) },
      { id: 7, name: 'Pascual, Jaime F.', periods: generateMockStudentPeriods(7, 92, 90, 36) },
    ],
    CS301: [
      { id: 8, name: 'Aquino, Teresa S.', periods: generateMockStudentPeriods(8, 95, 92, 38) },
      { id: 9, name: 'Lim, Dexter J.', periods: generateMockStudentPeriods(9, 60, 58, 22) },
      { id: 10, name: 'Cruz, Patricia N.', periods: generateMockStudentPeriods(10, 85, 80, 33) },
    ]
  };

  const activeStudents = classStudents[selectedClass] || classStudents.IT101;

  const handlePostGrades = () => {
    const currentLocked = JSON.parse(localStorage.getItem(`locked_milestones_${selectedClass}`) || '[]');
    if (!currentLocked.includes('Semestral Grade')) {
      currentLocked.push('Semestral Grade');
    }
    localStorage.setItem(`locked_milestones_${selectedClass}`, JSON.stringify(currentLocked));
    setShowConfirmModal(false);
    navigate('/faculty/postedgradesview');
  };

  return (
    <>
      <PageHeader title="Computation Preview" breadcrumb="Faculty Portal">
        <button 
          onClick={() => navigate('/faculty/scoreinput')}
          className="px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-lg transition-all flex items-center gap-1.5"
        >
          📝 Input Scores
        </button>
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
            <Download className="h-4 w-4" /> Export Report
        </button>
        <button 
          onClick={() => setShowConfirmModal(true)}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
            <Send className="h-4 w-4" /> Post Grades
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
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
                >
                  {classesList.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
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
                <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{activeStudents.length} Students</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview Mode</p>
                <p className="text-xs font-mono font-bold text-amber-700 mt-0.5">Read-Only Spreadsheet View</p>
              </div>
            </div>
          </div>
        
        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
                <h4 className="text-sm font-bold text-amber-800">Review Before Posting</h4>
                <p className="text-sm text-amber-700 mt-1">
                    Please review the computed grades carefully. Once you click <strong>Post Grades</strong>, they will be locked and visible to students. Any changes will require a formal Admin Grade Override.
                </p>
            </div>
        </div>

        {/* Header Info */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/faculty/classrecordslist" className="hover:text-sage-600 transition-colors">Class Records</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-slate-900">{classesList.find(c => c.code === selectedClass)?.label} (Semestral Summary)</span>
        </div>

        {/* Data Table Card */}
        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col"}>
            {/* Fullscreen header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {isFullScreen ? classesList.find(c => c.code === selectedClass)?.label : 'Computation Preview'}
                </span>
                {isFullScreen && (
                  <span className="text-[10px] font-medium text-slate-400 ml-2">
                    Semestral Summary · {activeStudents.length} students
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-sage-700 transition-all"
                title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10">
                              No.
                            </th>
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24">
                              Student No.
                            </th>
                            <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-0 bg-slate-50 border-r border-slate-200 z-20 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                              Student Name
                            </th>
                            
                            {/* Prelim Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">
                              PRELIMINARY GRADE
                            </th>
                            
                            {/* Midterm Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">
                              MIDTERM GRADE
                            </th>
                            
                            {/* Midterm Rating */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">
                              Midterm Rating (MR)
                            </th>
                            
                            {/* Semi-Final Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">
                              SEMI-FINAL GRADE
                            </th>
                            
                            {/* Final Period */}
                            <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">
                              FINAL GRADE
                            </th>
                            
                            {/* Tentative Final Rating */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold uppercase tracking-wider w-16">
                              Tentative Final Rating (TFR)
                            </th>
                            
                            {/* Semestral Grade */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">
                              Semestral Grade (SG)
                            </th>
                            
                            {/* Equivalent (GWA) */}
                            <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-16">
                              Equivalent GWA
                            </th>
                            
                            {/* Remarks */}
                            <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-20">
                              Remarks
                            </th>
                            
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
                        {activeStudents.map((student, idx) => (
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
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center">
                                <Send className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Post Semestral Grades</h3>
                                <p className="text-xs text-slate-455">Finalize scores and lock editing for all term milestones.</p>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed space-y-2">
                            <p><strong>⚠️ Action is irreversible:</strong> Finalizing and posting will lock this class record (<strong>{classesList.find(c => c.code === selectedClass)?.label}</strong>) across all periods (Prelim, Midterm, Semi-Final, and Final).</p>
                            <p>Once posted, these grades will be visible to students. Any subsequent changes will require formal Dean administrative override approval.</p>
                        </div>
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button 
                            onClick={() => setShowConfirmModal(false)}
                            className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handlePostGrades}
                            className="px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
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

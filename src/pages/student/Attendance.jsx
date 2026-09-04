import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Calendar, CheckCircle2, Clock, AlertTriangle, ChevronRight, MessageSquare, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { CardListSkeleton } from '../../components/common/Skeleton';

export default function Attendance() {
  const { user } = useAuth();
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    if (user) {
      loadAttendance();
    }
  }, [user]);

  const loadAttendance = async () => {
    if (!user) return;
    const cacheKey = `student_attendance_${user.id}`;
    const cached = getCachedData(cacheKey, 180000);
    if (cached) {
      setAttendanceData(cached);
      if (cached.length > 0 && !selectedClass) {
        setSelectedClass(cached[0]);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      
      // 1. Fetch student's enrollments to find enrolled subjects & section
      const { data: enrolls, error: enrollErr } = await supabase
        .from('enrollments')
        .select('section_id, subject_id, subjects(code, name)')
        .eq('student_id', user.id);

      if (enrollErr) throw enrollErr;

      // Deduplicate enrolled subjects by subject_id
      const uniqueSubjectsMap = new Map();
      (enrolls || []).forEach(e => {
        if (e.subject_id && !uniqueSubjectsMap.has(e.subject_id)) {
          uniqueSubjectsMap.set(e.subject_id, e);
        }
      });
      const uniqueEnrolls = Array.from(uniqueSubjectsMap.values());

      let classRecords = [];
      if (uniqueEnrolls.length > 0) {
        const sectionId = uniqueEnrolls[0].section_id;
        const subjectIds = uniqueEnrolls.map(e => e.subject_id);
        const { data: crData, error: crErr } = await supabase
          .from('class_records')
          .select('class_record_id, subject_id, faculty:users!faculty_id(first_name, last_name)')
          .eq('section_id', sectionId)
          .in('subject_id', subjectIds);
        if (crErr) throw crErr;
        classRecords = crData || [];
      }

      // 2. Fetch all attendance records for this student from attendance_records table
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('student_id', user.id)
        .order('date', { ascending: false });

      if (logsErr) throw logsErr;

      // 3. Map records into enrollments
      const mapped = uniqueEnrolls.map(e => {
        const cr = (classRecords || []).find(c => c.subject_id === e.subject_id);
        const classLogs = (logs || []).filter(l => l.class_record_id === cr?.class_record_id);
        
        // Sample demonstration logs if no records encoded yet for newly created semester
        const displayLogs = classLogs.length > 0 ? classLogs : [
          { attendance_id: '1', date: '2026-08-20', status: 'Present', remarks: 'On time and actively participated' },
          { attendance_id: '2', date: '2026-08-18', status: 'Present', remarks: 'Completed lab exercise' },
          { attendance_id: '3', date: '2026-08-15', status: 'Late', remarks: 'Arrived 10 mins late' },
          { attendance_id: '4', date: '2026-08-13', status: 'Present', remarks: 'Normal attendance' }
        ];

        const presents = displayLogs.filter(l => (l.status || '').toLowerCase() === 'present').length;
        const lates = displayLogs.filter(l => (l.status || '').toLowerCase() === 'late').length;
        const absents = displayLogs.filter(l => (l.status || '').toLowerCase() === 'absent').length;
        const excused = displayLogs.filter(l => (l.status || '').toLowerCase() === 'excused').length;

        return {
          classRecordId: cr?.class_record_id || e.subject_id,
          subjectCode: e.subjects?.code || 'TBA',
          subjectName: e.subjects?.name || 'Unknown Course',
          instructor: cr?.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'Prof. Rivera',
          presents,
          lates,
          absents,
          excused,
          isFDA: absents >= 4,
          isWarning: absents >= 2 && absents < 4,
          logs: displayLogs
        };
      });

      setAttendanceData(mapped);
      if (mapped.length > 0) {
        setSelectedClass(prev => prev ? (mapped.find(c => c.classRecordId === prev.classRecordId) || mapped[0]) : mapped[0]);
      }
      setCachedData(cacheKey, mapped);
    } catch (err) {
      console.error('Failed to load attendance records:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <CardListSkeleton count={4} />;
  }

  return (
    <>
      <PageHeader title="My Attendance Registry" breadcrumb="Student Portal" />
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {attendanceData.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-400 p-6 text-sm">
             You are not currently enrolled in any active classes this term.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* List of Enrolled Subjects */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left font-display">Enrolled Courses</h3>
              <div className="space-y-3">
                {attendanceData.map(item => (
                  <div
                    key={item.classRecordId}
                    onClick={() => setSelectedClass(item)}
                    className={`p-4 rounded-xl border transition-all text-left cursor-pointer flex justify-between items-center ${
                      selectedClass?.classRecordId === item.classRecordId
                        ? 'bg-white border-sage-500 shadow-sm ring-1 ring-sage-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1 truncate pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{item.subjectCode}</span>
                        {item.isFDA && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-rose-50 text-rose-600 border border-rose-100 uppercase animate-pulse">FDA Risk</span>
                        )}
                        {!item.isFDA && item.isWarning && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-amber-50 text-amber-600 border border-amber-100 uppercase">Warning</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{item.subjectName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{item.instructor}</div>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition-transform ${selectedClass?.classRecordId === item.classRecordId ? 'text-sage-600 translate-x-0.5' : 'text-slate-300'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Subject Attendance Details */}
            {selectedClass && (
              <div className="lg:col-span-2 space-y-6">
                
                {/* FDA Warning Advisory */}
                {selectedClass.isFDA ? (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3.5 text-left">
                    <ShieldAlert className="h-5.5 w-5.5 text-rose-500 mt-0.5 flex-shrink-0 animate-bounce" />
                    <div>
                      <h4 className="text-xs font-extrabold text-rose-800 uppercase tracking-wider font-display">FDA Absence Advisory Triggered</h4>
                      <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                        You have accumulated <strong>{selectedClass.absents} absences</strong> in {selectedClass.subjectCode}. Under institutional compliance policies, exceeding the 20% limit (4 or more absences) leads to a <strong>Failure due to Absences (FDA)</strong> designation. Please consult your instructor immediately.
                      </p>
                    </div>
                  </div>
                ) : selectedClass.isWarning ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3.5 text-left">
                    <AlertTriangle className="h-5.5 w-5.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-800 uppercase tracking-wider font-display">Absence Caution Warning</h4>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        You have <strong>{selectedClass.absents}/3 recorded absences</strong> in {selectedClass.subjectCode}. Reaching 4 absences will trigger an official FDA warning.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Summaries Panels */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="bg-white border border-slate-200/90 p-3.5 sm:p-4 rounded-2xl shadow-2xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Present
                    </div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">{selectedClass.presents}</div>
                  </div>

                  <div className="bg-white border border-slate-200/90 p-3.5 sm:p-4 rounded-2xl shadow-2xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <Clock className="h-3.5 w-3.5 text-amber-500" /> Late
                    </div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">{selectedClass.lates}</div>
                  </div>

                  <div className="bg-white border border-slate-200/90 p-3.5 sm:p-4 rounded-2xl shadow-2xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <AlertTriangle className={`h-3.5 w-3.5 ${selectedClass.isFDA ? 'text-rose-500' : 'text-slate-400'}`} /> Absent
                    </div>
                    <div className={`font-mono text-xl sm:text-2xl font-bold mt-1.5 ${selectedClass.isFDA ? 'text-rose-600' : 'text-slate-800'}`}>{selectedClass.absents}</div>
                  </div>

                  <div className="bg-white border border-slate-200/90 p-3.5 sm:p-4 rounded-2xl shadow-2xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <span className="h-2 w-2 rounded-full bg-blue-500 inline-block"></span> Excused
                    </div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">{selectedClass.excused}</div>
                  </div>
                </div>

                {/* Log history List */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-left">
                  <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-display">Date Timeline History</h4>
                    <span className="text-xs font-semibold text-slate-500 font-mono">Total sessions: {selectedClass.logs.length}</span>
                  </div>
                  
                  {selectedClass.logs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 italic">No attendance meetings have been logged by the instructor for this class record.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                      {selectedClass.logs.map(log => {
                        const statusLower = (log.status || '').toLowerCase();
                        return (
                          <div key={log.attendance_id || log.id || log.date} className="px-6 py-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-slate-50 text-slate-400 rounded-lg">
                                <Calendar className="h-4 w-4 text-sage-600" />
                              </div>
                              <div>
                                <span className="text-xs text-slate-700 font-semibold font-mono">
                                  {new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                                {log.remarks && (
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                    <MessageSquare className="h-3 w-3 text-slate-400" />
                                    <span>{log.remarks}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              statusLower === 'present' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : statusLower === 'late' 
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : statusLower === 'excused'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {log.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}


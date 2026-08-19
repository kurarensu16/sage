import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Calendar, CheckCircle2, Clock, AlertTriangle, ChevronRight, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

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
    try {
      setLoading(true);
      
      // 1. Fetch student's enrollments to find active classes
      const { data: enrolls, error: enrollErr } = await supabase
        .from('enrollments')
        .select(`
          class_record_id,
          class_records (
            class_record_id,
            subject_id,
            faculty_id,
            subjects ( code, name ),
            faculty:users!faculty_id ( first_name, last_name )
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'active');

      if (enrollErr) throw enrollErr;

      // 2. Fetch all attendance logs for this student
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', user.id)
        .order('date', { ascending: false });

      if (logsErr) throw logsErr;

      // 3. Map logs into enrollments
      const mapped = (enrolls || []).map(e => {
        const classRecord = e.class_records;
        const classLogs = (logs || []).filter(l => l.class_record_id === classRecord?.class_record_id);
        
        const presents = classLogs.filter(l => l.status === 'present').length;
        const lates = classLogs.filter(l => l.status === 'late').length;
        const absents = classLogs.filter(l => l.status === 'absent').length;

        return {
          classRecordId: classRecord?.class_record_id,
          subjectCode: classRecord?.subjects?.code || 'TBA',
          subjectName: classRecord?.subjects?.name || 'Unknown Course',
          instructor: classRecord?.faculty ? `Prof. ${classRecord.faculty.first_name} ${classRecord.faculty.last_name}` : 'TBA',
          presents,
          lates,
          absents,
          isFDA: absents >= 4,
          logs: classLogs
        };
      });

      setAttendanceData(mapped);
      if (mapped.length > 0) {
        setSelectedClass(mapped[0]);
      }
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="My Attendance Registry" breadcrumb="Student Portal" />
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium">Loading attendance records...</p>
          </div>
        ) : attendanceData.length === 0 ? (
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
                {selectedClass.isFDA && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3.5 text-left">
                    <AlertTriangle className="h-5.5 w-5.5 text-rose-500 mt-0.5 flex-shrink-0 animate-bounce" />
                    <div>
                      <h4 className="text-xs font-extrabold text-rose-800 uppercase tracking-wider font-display">FDA Absence Advisory Locked</h4>
                      <p className="text-xs text-rose-650 mt-1 leading-relaxed">
                        You have accumulated **{selectedClass.absents} absences** in {selectedClass.subjectCode}. Under university compliance policies, reaching 4 or more unexcused absences triggers an official **Failure due to Absences (FDA)** status, sealing final GWA records at **5.00** regardless of academic grades. Please consult your instructor immediately.
                      </p>
                    </div>
                  </div>
                )}

                {/* Summaries Panels */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Present
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-800 mt-2">{selectedClass.presents}</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                      <Clock className="h-4 w-4 text-amber-500" /> Late
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-800 mt-2">{selectedClass.lates}</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-left">
                    <div className="flex items-center gap-1.5 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                      <AlertTriangle className={`h-4 w-4 ${selectedClass.isFDA ? 'text-rose-500' : 'text-slate-400'}`} /> Absent
                    </div>
                    <div className={`font-mono text-2xl font-bold mt-2 ${selectedClass.isFDA ? 'text-rose-600' : 'text-slate-800'}`}>{selectedClass.absents}</div>
                  </div>
                </div>

                {/* Log history List */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-left">
                  <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-display">Date Timeline History</h4>
                    <span className="text-xs font-semibold text-slate-450 font-mono">Total logs: {selectedClass.logs.length}</span>
                  </div>
                  
                  {selectedClass.logs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 italic">No attendance meetings have been logged by the instructor for this class record.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                      {selectedClass.logs.map(log => (
                        <div key={log.log_id} className="px-6 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 text-slate-400 rounded-lg">
                              <Calendar className="h-4 w-4" />
                            </div>
                            <span className="text-xs text-slate-700 font-semibold font-mono">
                              {new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                          </div>
                          
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.status === 'present' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : log.status === 'late' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      ))}
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

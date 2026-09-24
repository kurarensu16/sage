import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ClipboardCheck, ChevronDown, Loader2, Users } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getClassPriorityRoster } from '../../lib/classRoomService';
import StudentRiskEvaluationModal from './StudentRiskEvaluationModal';

export default function StudentRisk({ mode = 'risk' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState('');

  const isEvaluateMode = mode === 'evaluate';
  const title = isEvaluateMode ? 'Evaluate Students' : 'At-Risk Students';

  useEffect(() => {
    async function loadClasses() {
      if (!user?.id) return;
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          subject_id,
          section_id,
          subjects ( code, name ),
          sections ( name, semester )
        `)
        .eq('faculty_id', user.id)
        .order('created_at', { ascending: false });

      if (queryError) {
        setError('Unable to load your assigned classes.');
      } else {
        setClasses(data || []);
        if (data?.[0]) setSelectedClassId(data[0].class_record_id);
      }
      setLoading(false);
    }

    loadClasses();
  }, [user]);

  useEffect(() => {
    async function loadRoster() {
      if (!selectedClassId) {
        setStudents([]);
        return;
      }
      setLoadingRoster(true);
      const roster = await getClassPriorityRoster(selectedClassId);
      setStudents(roster);
      setLoadingRoster(false);
    }

    loadRoster();
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find(item => item.class_record_id === selectedClassId),
    [classes, selectedClassId]
  );

  const uniqueStudentsMap = new Map();
  (students || []).forEach(s => {
    if (s.user_id && !uniqueStudentsMap.has(s.user_id)) {
      uniqueStudentsMap.set(s.user_id, s);
    }
  });
  const uniqueStudents = Array.from(uniqueStudentsMap.values());

  const visibleStudents = isEvaluateMode
    ? uniqueStudents
    : uniqueStudents.filter(student => (student.risk_score || 0) >= 20 || student.risk_level === 'high' || student.risk_level === 'critical' || student.risk_level === 'moderate');

  const handleEvaluationSaved = (saved) => {
    setStudents(prev => prev.map(student => (
      student.user_id === selectedStudent.user_id
        ? { ...student, evaluation: saved }
        : student
    )));
  };

  if (loading) return <TableSkeleton rows={7} />;

  return (
    <>
      <PageHeader title={title} breadcrumb="Faculty Portal" />
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5 text-left">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Student Risk Monitoring</p>
                <h2 className="text-lg font-bold text-slate-900 font-display mt-1">{title}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isEvaluateMode
                    ? 'Review students and record faculty-led academic interventions.'
                    : 'Students requiring attention are ranked by explainable academic risk score.'}
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Class Record</label>
                <select
                  value={selectedClassId}
                  onChange={(event) => setSelectedClassId(event.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2.5 pr-8 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-sage-500 cursor-pointer"
                >
                  {classes.length === 0 && <option value="">No classes assigned</option>}
                  {classes.map(item => (
                    <option key={item.class_record_id} value={item.class_record_id}>
                      {item.subjects?.code} - {item.sections?.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 bottom-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isEvaluateMode ? <ClipboardCheck className="h-4 w-4 text-sage-600" /> : <AlertCircle className="h-4 w-4 text-rose-600" />}
                <h3 className="text-sm font-bold text-slate-900">{selectedClass?.subjects?.code || 'Class'} Student Roster</h3>
              </div>
              <span className="text-xs font-mono font-bold text-slate-500">{visibleStudents.length} students</span>
            </div>

            {loadingRoster ? (
              <div className="p-10 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-sage-600" /> Calculating risk roster...</div>
            ) : visibleStudents.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">
                  {isEvaluateMode ? 'No enrolled students found.' : 'All students on track!'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isEvaluateMode
                    ? 'No enrolled students found in this class section.'
                    : 'No students in this class currently require urgent risk intervention. Select another class record to review.'}
                </p>
                <button onClick={() => navigate('/faculty/classrecordslist')} className="mt-4 px-4 py-2 rounded-xl bg-sage-600 text-white text-xs font-semibold hover:bg-sage-700 cursor-pointer">My Class Records</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Student</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Risk</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">GWA</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Absences</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleStudents.map(student => {
                      const isLow = student.risk_level === 'low';
                      const isMod = student.risk_level === 'moderate';
                      const badgeClass = isLow
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : isMod
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200';

                      return (
                        <tr key={student.user_id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-xs font-bold text-slate-800">{student.last_name}, {student.first_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{student.student_id_number}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeClass}`}>
                              {student.risk_level} · {student.risk_score}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono font-bold text-slate-700">
                            {student.current_gwa !== null && student.current_gwa !== undefined && Number(student.current_gwa) > 0 ? Number(student.current_gwa).toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-700">{student.absences || 0}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setSelectedStudent(student)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sage-600 hover:bg-sage-700 text-white text-[10px] font-semibold cursor-pointer shadow-2xs transition-colors"><ClipboardCheck className="h-3.5 w-3.5" /> Evaluate</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedStudent && (
        <StudentRiskEvaluationModal
          isOpen={Boolean(selectedStudent)}
          onClose={() => setSelectedStudent(null)}
          student={selectedStudent}
          classRecordId={selectedClassId}
          currentTerm='Midterm'
          subjectCode={selectedClass?.subjects?.code || ''}
          subjectName={selectedClass?.subjects?.name || ''}
          onSaveSuccess={handleEvaluationSaved}
        />
      )}
    </>
  );
}

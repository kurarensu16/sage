import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  fetchClassReportDataset,
  aggregateByStudent,
  buildSummaryCards
} from '../../lib/reportsService';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  AlertCircle,
  FileSpreadsheet,
  Search,
  BookOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TableSkeleton } from '../../components/common/Skeleton';

export default function ClassPerformance() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClassId = searchParams.get('id') || '';

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [dataset, setDataset] = useState({ enrollments: [], activities: [], rows: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // 1. Fetch faculty's assigned classes
  useEffect(() => {
    async function loadFacultyClasses() {
      if (!user) return;
      try {
        setLoadingClasses(true);
        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            section_id,
            subject_id,
            semester,
            school_year,
            subjects:subject_id (code, name),
            sections:section_id (name)
          `)
          .eq('faculty_id', user.id)
          .order('school_year', { ascending: false });

        if (error) throw error;
        setClasses(data || []);

        if (!selectedClassId && data && data.length > 0) {
          setSelectedClassId(data[0].class_record_id);
          setSearchParams({ id: data[0].class_record_id });
        }
      } catch (err) {
        console.error('Error loading faculty classes:', err);
        setErrorMsg('Failed to load assigned classes.');
      } finally {
        setLoadingClasses(false);
      }
    }
    loadFacultyClasses();
  }, [user]);

  // 2. Load dataset when class is selected
  useEffect(() => {
    async function loadReportData() {
      if (!selectedClassId) return;
      try {
        setLoadingData(true);
        setErrorMsg(null);
        const result = await fetchClassReportDataset(selectedClassId);
        setDataset(result);
      } catch (err) {
        console.error('Error loading report dataset:', err);
        setErrorMsg('Failed to load performance report for this class.');
      } finally {
        setLoadingData(false);
      }
    }
    loadReportData();
  }, [selectedClassId]);

  const handleClassChange = (e) => {
    const newId = e.target.value;
    setSelectedClassId(newId);
    setSearchParams({ id: newId });
  };

  // 3. Aggregate data by student
  const aggregatedStudents = useMemo(() => {
    return aggregateByStudent(dataset.rows);
  }, [dataset.rows]);

  // 4. Build summary cards metrics
  const summary = useMemo(() => {
    return buildSummaryCards(aggregatedStudents);
  }, [aggregatedStudents]);

  // 5. Filter students by search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return aggregatedStudents;
    const term = searchTerm.toLowerCase();
    return aggregatedStudents.filter(s =>
      s.studentName.toLowerCase().includes(term) ||
      s.studentNumber.toLowerCase().includes(term)
    );
  }, [aggregatedStudents, searchTerm]);

  const selectedClass = classes.find(c => c.class_record_id === selectedClassId);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Class Performance Report"
        subtitle="Detailed class standing, activity score breakdown, and at-risk monitoring"
      />

      {/* Class Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <BookOpen className="w-5 h-5 text-sage-600 flex-shrink-0" />
          <div className="flex-1 max-w-md">
            <label htmlFor="class-selector" className="sr-only">Select Class Record</label>
            <select
              id="class-selector"
              value={selectedClassId}
              onChange={handleClassChange}
              disabled={loadingClasses}
              className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
            >
              {loadingClasses && <option value="">Loading classes...</option>}
              {!loadingClasses && classes.length === 0 && <option value="">No classes assigned</option>}
              {classes.map(c => (
                <option key={c.class_record_id} value={c.class_record_id}>
                  {c.subjects?.code} — {c.sections?.name || 'Section'} ({c.semester} A.Y. {c.school_year})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedClass && (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-mono">
              {selectedClass.semester}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-mono">
              A.Y. {selectedClass.school_year}
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Students */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Enrolled Students</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {summary.total}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Approved enrollments</p>
        </div>

        {/* At-Risk Students */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-600 text-xs font-semibold">
            <span>At-Risk Students</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-600">
            {summary.atRisk} <span className="text-xs text-rose-400 font-normal">({summary.atRiskPct}%)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">High & critical risk tiers</p>
        </div>

        {/* Performed Well */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold">
            <span>Performed Well</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-600">
            {summary.wellCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">85% score or higher</p>
        </div>

        {/* Average */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-600 text-xs font-semibold">
            <span>Average</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-600">
            {summary.avgCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">75% - 84% score range</p>
        </div>

        {/* Struggling */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold">
            <span>Struggling</span>
            <AlertCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-700">
            {summary.strCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Below 75% passing cut-off</p>
        </div>
      </div>

      {/* Main Score Sheet Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="student-search-input"
              type="text"
              placeholder="Search by student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:border-sage-500 focus:bg-white outline-none transition-all font-medium"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-mono font-bold text-slate-800">{filteredStudents.length}</span> of <span className="font-mono font-bold text-slate-800">{aggregatedStudents.length}</span> students
          </div>
        </div>

        {/* Score Sheet Content */}
        {loadingData ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="text-sm font-semibold text-slate-600">No student records found</p>
            <p className="text-xs text-slate-400 mt-0.5">Ensure students are approved in this class record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 sticky left-0 bg-slate-50/95 z-10">Student</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4 text-center">Activities Graded</th>
                  <th className="py-3 px-4 text-right">Overall Average</th>
                  <th className="py-3 px-4 text-center">Performance Status</th>
                  <th className="py-3 px-4 text-center">At-Risk Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredStudents.map(student => {
                  const statusColor =
                    student.overallStatus === 'Performed well' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    student.overallStatus === 'Average' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    student.overallStatus === 'Struggling' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-slate-100 text-slate-500 border-slate-200';

                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 sticky left-0 bg-white hover:bg-slate-50/60 z-10">
                        {student.studentName}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {student.studentNumber}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">
                        {student.gradedCount} / {student.activitiesCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        {student.overallPercentage !== null ? `${student.overallPercentage}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border", statusColor)}>
                          {student.overallStatus || 'Ungraded'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {student.isAtRisk ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            At-Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-400">
                            On Track
                          </span>
                        )}
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
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Users, Calendar, BookOpen, Settings, Edit3, Lock, FileSpreadsheet, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { CardListSkeleton } from '../../components/common/Skeleton';

export default function ClassRecordsList() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('current'); // 'current' or 'past'

  useEffect(() => {
    async function fetchClasses() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: classesData, error: classesError } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( subject_id, code, name, units, computation_id ),
            sections ( section_id, name, school_year, semester )
          `)
          .eq('faculty_id', user.id)
          .eq('status', filterType === 'current' ? 'active' : 'archived');

        if (classesError) throw classesError;

        if (!classesData || classesData.length === 0) {
          setClasses([]);
          setLoading(false);
          return;
        }

        const classIds = classesData.map(c => c.class_record_id);

        let { data: gradingCols, error: colsError } = await supabase
          .from('class_grading_columns')
          .select('class_record_id, term')
          .in('class_record_id', classIds);

        if (colsError) throw colsError;

        // Auto-initialize missing class_grading_columns
        const unconfiguredClasses = classesData.filter(cls => {
          const matchingCols = (gradingCols || []).filter(col => col.class_record_id === cls.class_record_id);
          return matchingCols.length === 0;
        });

        if (unconfiguredClasses.length > 0) {
          for (const cls of unconfiguredClasses) {
            let templateToApply = null;
            if (cls.subjects?.computation_id) {
              const { data: temp } = await supabase
                .from('grade_computations')
                .select('*, grade_computation_components(*)')
                .eq('computation_id', cls.subjects.computation_id)
                .single();
              if (temp) templateToApply = temp;
            }

            if (!templateToApply) {
              const { data: fallbackTemp } = await supabase
                .from('grade_computations')
                .select('*, grade_computation_components(*)')
                .eq('name', 'General / Professional Education Scale')
                .single();
              if (fallbackTemp) templateToApply = fallbackTemp;
            }

            if (templateToApply) {
              const comps = templateToApply.grade_computation_components || [];
              const csComp = comps.find(c => (c.name || '').toLowerCase().includes('class standing') || (c.name || '').toLowerCase().includes('formative')) || comps[0];
              const examComp = comps.find(c => (c.name || '').toLowerCase().includes('exam') || (c.name || '').toLowerCase().includes('major')) || comps[1];

              const faMax = csComp?.max_score ? parseFloat(csComp.max_score) : 20;
              const examMax = examComp?.max_score ? parseFloat(examComp.max_score) : 100;

              const termsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
              const upsertRows = termsList.map(term => ({
                class_record_id: cls.class_record_id,
                term,
                act1_max: faMax,
                act2_max: faMax,
                act3_max: faMax,
                act4_max: faMax,
                act5_max: faMax,
                act6_max: Math.round(faMax / 2) || 10,
                exam_max: examMax
              }));

              await supabase
                .from('class_grading_columns')
                .insert(upsertRows);
            }
          }

          // Refetch grading columns
          const { data: refetchedCols } = await supabase
            .from('class_grading_columns')
            .select('class_record_id, term')
            .in('class_record_id', classIds);
          if (refetchedCols) gradingCols = refetchedCols;
        }

        const { data: postedGrades, error: gradesError } = await supabase
          .from('posted_grades')
          .select('class_record_id, grade_period, is_locked')
          .in('class_record_id', classIds);

        if (gradesError) throw gradesError;

        const { data: enrollments, error: enrollError } = await supabase
          .from('enrollments')
          .select('section_id, subject_id');

        if (enrollError) throw enrollError;

        // Count enrollments by section_id + subject_id
        const enrolledCountsMap = {};
        (enrollments || []).forEach(e => {
          const key = `${e.section_id}|${e.subject_id}`;
          enrolledCountsMap[key] = (enrolledCountsMap[key] || 0) + 1;
        });

        // Map classes to their visual representation
        const mappedClasses = classesData.map((cls) => {
          const matchingCols = (gradingCols || []).filter(col => col.class_record_id === cls.class_record_id);
          const matchingPosted = (postedGrades || []).filter(g => g.class_record_id === cls.class_record_id && g.is_locked);

          const hasSetup = matchingCols.length > 0;
          
          // Determine status and active term
          let statusLabel = 'Pending Setup';
          let gradingPeriod = 'Prelim';

          if (hasSetup) {
            const postedPeriods = new Set(matchingPosted.map(g => g.grade_period.toLowerCase()));
            
            if (postedPeriods.has('final')) {
              statusLabel = 'Grades Posted';
              gradingPeriod = 'Final';
            } else {
              statusLabel = 'Ongoing';
              gradingPeriod = 'Semestral';
            }
          }

          const enrolledCount = enrolledCountsMap[`${cls.section_id}|${cls.subject_id}`] || 0;

          return {
            id: cls.class_record_id,
            subjectCode: cls.subjects?.code || 'N/A',
            subjectName: cls.subjects?.name || 'N/A',
            section: cls.sections?.name || 'N/A',
            units: cls.subjects?.units || 0,
            enrolled: enrolledCount,
            status: statusLabel,
            gradingPeriod,
            semester: cls.semester,
            schoolYear: cls.school_year
          };
        });

        setClasses(mappedClasses);
      } catch (err) {
        console.error('Error fetching classes:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchClasses();
  }, [user, filterType]);

  const filteredClasses = classes.filter(cls => {
    const searchLower = searchTerm.toLowerCase();
    return (
      cls.subjectCode.toLowerCase().includes(searchLower) ||
      cls.subjectName.toLowerCase().includes(searchLower) ||
      cls.section.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <CardListSkeleton count={4} />;
  }

  return (
    <>
      <PageHeader title="My Class Records" breadcrumb="Faculty Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {/* Toolbar: Search & Semester Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-9 py-2.5 sm:py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors shadow-2xs" 
              placeholder="Search subject code, name, or section..." 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button 
              onClick={() => setFilterType('current')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'current' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Current Semester
            </button>
            <button 
              onClick={() => setFilterType('past')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'past' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Past Archives
            </button>
          </div>
        </div>

        {/* Classes Grid */}
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xs">
            <BookOpen className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 font-display">No classes found</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {searchTerm ? "No classes match your search query." : "You do not have any assigned classes."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-6">
            {filteredClasses.map((cls) => (
              <div key={cls.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-sm hover:border-sage-350 transition-all flex flex-col justify-between overflow-hidden text-left">
                
                {/* Card Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                      {cls.section}
                    </span>
                    
                    {cls.status === 'Pending Setup' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {cls.status}
                      </span>
                    )}
                    {cls.status === 'Ongoing' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {cls.gradingPeriod} Ongoing
                      </span>
                    )}
                    {cls.status === 'Grades Posted' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {cls.gradingPeriod} Posted
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 leading-tight">
                      {cls.subjectCode}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cls.subjectName}</p>
                  </div>
                </div>
                
                {/* Card Body (Details) */}
                <div className="p-4 sm:p-5 flex-1 space-y-2.5 bg-white">
                  <div className="flex items-center gap-2.5 text-xs text-slate-600">
                    <Calendar className="h-3.5 w-3.5 text-sage-600 flex-shrink-0" />
                    <span>{cls.schoolYear} • {cls.semester} Sem</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-600">
                    <BookOpen className="h-3.5 w-3.5 text-sage-600 flex-shrink-0" />
                    <span>{cls.units} Units</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-600">
                    <Users className="h-3.5 w-3.5 text-sage-600 flex-shrink-0" />
                    <span><strong className="text-slate-900 font-mono">{cls.enrolled}</strong> Students Enrolled</span>
                  </div>
                </div>
                
                {/* Card Footer Actions */}
                <div className="p-3.5 sm:p-4 bg-slate-50/80 border-t border-slate-100 grid grid-cols-2 gap-2">
                  {cls.status === 'Pending Setup' ? (
                    <>
                      <Link 
                        to={`/faculty/gradecomponentssetup?id=${cls.id}`} 
                        className="col-span-2 flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-2xs"
                      >
                        <Settings className="h-3.5 w-3.5" /> Setup Grade Weights
                      </Link>
                      <Link 
                        to={`/faculty/classattendance?classId=${cls.id}`} 
                        className="col-span-2 flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-sage-350 rounded-xl transition-all shadow-2xs"
                      >
                        <Calendar className="h-3.5 w-3.5 text-sage-600" /> Track Attendance
                      </Link>
                    </>
                  ) : cls.status === 'Ongoing' ? (
                    <>
                      <Link 
                        to={`/faculty/scoreinput?id=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-2xs"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Input Scores
                      </Link>
                      <Link 
                        to={`/faculty/classattendance?classId=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-sage-350 rounded-xl transition-all shadow-2xs"
                      >
                        <Calendar className="h-3.5 w-3.5 text-sage-600" /> Track Attendance
                      </Link>
                      <Link
                        to={`/faculty/postedgradesview?id=${cls.id}&export=1`}
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all shadow-2xs"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Export Grades
                      </Link>
                      <Link 
                        to={`/faculty/gradecomputationpreview?id=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:border-sage-350 rounded-xl transition-all shadow-2xs"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" /> Preview
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link 
                        to={`/faculty/postedgradesview?id=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-2xs"
                      >
                        <Lock className="h-3.5 w-3.5" /> View Posted
                      </Link>
                      <Link 
                        to={`/faculty/classattendance?classId=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-sage-350 rounded-xl transition-all shadow-2xs"
                      >
                        <Calendar className="h-3.5 w-3.5 text-sage-600" /> Track Attendance
                      </Link>
                      <Link
                        to={`/faculty/postedgradesview?id=${cls.id}&export=1`}
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all shadow-2xs"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Export Grades
                      </Link>
                      <Link 
                        to={`/faculty/scoreinput?id=${cls.id}`} 
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:border-sage-350 rounded-xl transition-all shadow-2xs"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-slate-400" /> Input Scores
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </>
  );
}



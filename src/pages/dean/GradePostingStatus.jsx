import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { GRADE_MILESTONES, getCanonicalGradePeriod } from '../../lib/gradeMilestones';
import { SG_SUBMISSION_LABELS, getClassTermState } from '../../lib/termStatus';

export default function GradePostingStatus() {
  const { profile } = useAuth();
  
  // Data state
  const [classrooms, setClassrooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [postedGradesMap, setPostedGradesMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [syFilter, setSyFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [termList, setTermList] = useState([]);

  // Pre-select dean's department and active term on load
  useEffect(() => {
    if (profile?.departments?.name) {
      setDeptFilter(profile.departments.name);
    }

    async function loadActiveTerm() {
      const { data: terms } = await supabase
        .from('academic_terms')
        .select('*')
        .order('created_at', { ascending: false });

      if (terms && terms.length > 0) {
        setTermList(terms);
        const active = terms.find(t => t.is_active) || terms[0];
        if (active) {
          setSyFilter(active.school_year);
          setSemFilter(active.semester);
        }
      }
    }
    loadActiveTerm();
  }, [profile]);

  // Fetch data from Supabase
  const loadPostingData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Classrooms with relations. Archived classes are included so a previous
      // term's posting record stays visible.
      const { data: classData, error: classErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          status,
          term_id,
          semester,
          school_year,
          faculty:users!faculty_id(user_id, first_name, last_name, email),
          subject:subjects(subject_id, code, name, units, department_id, departments(name)),
          section:sections(section_id, name)
        `);

      if (classErr) throw classErr;

      // 2. Fetch Departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('department_id, name')
        .order('name');

      if (deptData) setDepartments(deptData);

      // 3. Fetch posted grades per class, in pages: the API returns at most 1,000 rows
      // per request, and a cut-off list would show posted classes as pending.
      const classIds = (classData || []).map(c => c.class_record_id);
      const postedData = [];
      for (let i = 0; i < classIds.length; i += 100) {
        const idChunk = classIds.slice(i, i + 100);
        for (let from = 0; ; from += 1000) {
          const { data: page, error: pageErr } = await supabase
            .from('posted_grades')
            .select('posted_grade_id, class_record_id, grade_period, is_locked, sg_submission_status')
            .in('class_record_id', idChunk)
            .order('posted_grade_id')
            .range(from, from + 999);
          if (pageErr) throw pageErr;
          postedData.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
      }

      const postedMap = {};
      (postedData || []).forEach(pg => {
        if (!postedMap[pg.class_record_id]) postedMap[pg.class_record_id] = [];
        postedMap[pg.class_record_id].push(pg);
      });
      setPostedGradesMap(postedMap);

      // Normalize classroom items
      const formatted = (classData || []).map(c => {
        const facFirst = c.faculty?.first_name || '';
        const facLast = c.faculty?.last_name || '';
        const facultyName = (facFirst || facLast) ? `${facFirst} ${facLast}`.trim() : 'Unassigned';
        return {
          id: c.class_record_id,
          classRecordId: c.class_record_id,
          subjectCode: c.subject?.code || 'N/A',
          subjectName: c.subject?.name || 'Untitled Subject',
          departmentName: c.subject?.departments?.name || '',
          section: c.section?.name || 'N/A',
          facultyId: c.faculty?.user_id,
          facultyName,
          semester: c.semester || '',
          schoolYear: c.school_year || '',
          termId: c.term_id,
          status: c.status
        };
      });

      setClassrooms(formatted);
    } catch (err) {
      console.error('Error loading grade posting status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPostingData();
  }, []);

  const getStatusBadge = (cls, milestone) => {
    const postedList = (postedGradesMap[cls.id] || []).filter(row => getCanonicalGradePeriod(row) === milestone);

    if (postedList.length > 0) {
      // SG submission label recorded by the database at the first posting.
      let label = null;
      if (milestone === GRADE_MILESTONES.SEMESTRAL_GRADE) {
        const labels = postedList.map(row => row.sg_submission_status).filter(Boolean);
        label = labels.includes('late_overdue') ? 'late_overdue' : labels.includes('late') ? 'late' : labels[0] || null;
      }
      return (
        <div className="flex flex-col items-center gap-1 justify-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Posted
          </span>
          {label && (
            <span className={`text-[10px] font-semibold ${label === 'on_time' ? 'text-slate-500' : 'text-rose-700'}`}>
              {SG_SUBMISSION_LABELS[label]}
            </span>
          )}
        </div>
      );
    }

    // A previous-term class still waiting for its SG: Pending during the grace period,
    // then Overdue.
    if (milestone === GRADE_MILESTONES.SEMESTRAL_GRADE) {
      const { state, daysLeft } = getClassTermState(termList, {
        status: cls.status, term_id: cls.termId, school_year: cls.schoolYear, semester: cls.semester
      });
      if (state === 'overdue') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Overdue
          </span>
        );
      }
      if (state === 'pending') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Pending · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </span>
        );
      }
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        Pending
      </span>
    );
  };

  // Filter classrooms
  const filteredClasses = useMemo(() => {
    return classrooms.filter(c => {
      const matchesSearch = 
        c.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.section.toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesSem = !semFilter || c.semester === semFilter;
      const matchesSy = !syFilter || c.schoolYear === syFilter;
      const matchesDept = !deptFilter || c.departmentName.toLowerCase().includes(deptFilter.toLowerCase()) || (deptFilter === 'IT' && (c.subjectCode.startsWith('IT') || c.subjectCode.startsWith('CS')));

      return matchesSearch && matchesSem && matchesSy && matchesDept;
    });
  }, [classrooms, searchTerm, semFilter, syFilter, deptFilter]);

  return (
    <>
      <PageHeader 
        title="Grade Posting Status" 
        breadcrumb="Dean Portal" 
        actions={
          <button
            onClick={loadPostingData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sage-600' : 'text-slate-500'}`} />
            Refresh
          </button>
        }
      />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Filters Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" /> Filter Options
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            
            {/* Search */}
            <div className="sm:col-span-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search faculty, subject, or section..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1">
              {profile?.departments?.name ? (
                <div className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-slate-50 text-slate-500 cursor-not-allowed font-medium">
                  {profile.departments.name}
                </div>
              ) : (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.department_id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Semester */}
            <div className="flex flex-col gap-1">
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Semesters</option>
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>

            {/* School Year */}
            <div className="flex flex-col gap-1">
              <select
                value={syFilter}
                onChange={(e) => setSyFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All School Years</option>
                {Array.from(new Set(termList.map(t => t.school_year))).map(sy => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Status Feed (Mobile Card List + Desktop Table) */}
        
        {/* Mobile View Card Feed */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
              <Loader2 className="h-6 w-6 text-sage-600 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500 font-medium">Loading status...</span>
            </div>
          ) : filteredClasses.length > 0 ? (
            filteredClasses.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{c.subjectCode}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {c.section}
                      </span>
                    </div>
                    <h4 className="text-xs text-slate-600 truncate">{c.subjectName}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center"><span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Midterm</span>{getStatusBadge(c, GRADE_MILESTONES.MIDTERM_RATING)}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Final</span>{getStatusBadge(c, GRADE_MILESTONES.TENTATIVE_FINAL_RATING)}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Semestral</span>{getStatusBadge(c, GRADE_MILESTONES.SEMESTRAL_GRADE)}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <div className="w-5 h-5 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[9px] flex items-center justify-center font-mono shrink-0">
                      {c.facultyName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-[11px] truncate">Prof. {c.facultyName}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">AY {c.schoolYear}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-400">
              No matching class posting status reports found.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Faculty</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject & Title</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Midterm Rating</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Final Rating</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Semestral Grade</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 text-sage-600 animate-spin" />
                        <span>Loading class grade posting status from Supabase...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredClasses.length > 0 ? (
                  filteredClasses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[10px] flex items-center justify-center font-mono">
                          {c.facultyName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span>Prof. {c.facultyName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-slate-900">{c.subjectCode}</span>
                          <span className="text-xs text-slate-500 truncate max-w-xs">{c.subjectName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {c.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c, GRADE_MILESTONES.MIDTERM_RATING)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c, GRADE_MILESTONES.TENTATIVE_FINAL_RATING)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c, GRADE_MILESTONES.SEMESTRAL_GRADE)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No matching class posting status reports found in the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}

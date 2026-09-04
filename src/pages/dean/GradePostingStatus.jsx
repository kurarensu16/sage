import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { notifyUnlockApproved } from '../../lib/notificationDispatcher';

export default function GradePostingStatus() {
  const { user, profile } = useAuth();
  
  // Data state
  const [classrooms, setClassrooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [postedGradesMap, setPostedGradesMap] = useState({});
  const [unlockRequestsMap, setUnlockRequestsMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [syFilter, setSyFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOverrideClass, setSelectedOverrideClass] = useState('');

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
      // 1. Fetch Classrooms with relations
      const { data: classData, error: classErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          status,
          semester,
          academic_year,
          schedule,
          room,
          faculty:users!faculty_id(user_id, first_name, last_name, email),
          subject:subjects(subject_id, code, title, units, department_id, departments(name)),
          section:sections(section_id, name)
        `)
        .eq('status', 'active');

      if (classErr) throw classErr;

      // 2. Fetch Departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('department_id, name')
        .order('name');

      if (deptData) setDepartments(deptData);

      // 3. Fetch posted grades to know which classes have posted grades
      const { data: postedData } = await supabase
        .from('posted_grades')
        .select('class_record_id, grade_period, is_locked');

      const postedMap = {};
      (postedData || []).forEach(pg => {
        if (!postedMap[pg.class_record_id]) postedMap[pg.class_record_id] = [];
        postedMap[pg.class_record_id].push(pg);
      });
      setPostedGradesMap(postedMap);

      // 4. Fetch pending unlock requests
      const { data: unlockData } = await supabase
        .from('unlock_requests')
        .select('*')
        .eq('status', 'pending');

      const unlockMap = {};
      (unlockData || []).forEach(ur => {
        if (!unlockMap[ur.class_record_id]) unlockMap[ur.class_record_id] = [];
        unlockMap[ur.class_record_id].push(ur);
      });
      setUnlockRequestsMap(unlockMap);

      // Normalize classroom items
      const formatted = (classData || []).map(c => {
        const facFirst = c.faculty?.first_name || '';
        const facLast = c.faculty?.last_name || '';
        const facultyName = (facFirst || facLast) ? `${facFirst} ${facLast}`.trim() : 'Unassigned';
        return {
          id: c.class_record_id,
          classRecordId: c.class_record_id,
          subjectCode: c.subject?.code || 'N/A',
          subjectName: c.subject?.title || 'Untitled Subject',
          departmentName: c.subject?.departments?.name || '',
          section: c.section?.name || 'N/A',
          facultyId: c.faculty?.user_id,
          facultyName,
          semester: c.semester || '2nd',
          schoolYear: c.academic_year || '2025-2026',
          status: c.status
        };
      });

      setClassrooms(formatted);
      if (formatted.length > 0 && !selectedOverrideClass) {
        setSelectedOverrideClass(formatted[0].id);
      }
    } catch (err) {
      console.error('Error loading grade posting status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPostingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApproveUnlock = async (classRecordId) => {
    try {
      const resolvedAt = new Date().toISOString();
      const resolvedBy = user?.id;

      // 1. Resolve pending unlock requests in Supabase
      await supabase
        .from('unlock_requests')
        .update({ status: 'approved', resolved_by: resolvedBy, resolved_at: resolvedAt })
        .eq('class_record_id', classRecordId)
        .eq('status', 'pending');

      // 2. Unlock posted grades if locked
      await supabase
        .from('posted_grades')
        .update({ is_locked: false })
        .eq('class_record_id', classRecordId);

      // 3. Dispatch notification to class faculty
      const targetClass = classrooms.find(c => c.id === classRecordId);
      if (targetClass?.facultyId) {
        const actorName = profile ? `${profile.first_name} ${profile.last_name}` : 'Dean';
        await notifyUnlockApproved({
          facultyId: targetClass.facultyId,
          subjectName: `${targetClass.subjectCode} (${targetClass.section})`,
          milestone: 'Semestral Grade',
          actorName
        });
      }

      // Refresh data
      await loadPostingData();
    } catch (dbErr) {
      console.error('Error approving unlock request:', dbErr);
    }
  };

  const getStatusBadge = (classId) => {
    const postedList = postedGradesMap[classId] || [];
    const unlockList = unlockRequestsMap[classId] || [];
    
    const isPosted = postedList.length > 0;
    const isRequested = unlockList.length > 0;
    
    if (isPosted) {
      return (
        <div className="flex flex-col items-center gap-1.5 justify-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Posted
          </span>
          {isRequested && (
            <button
              onClick={() => handleApproveUnlock(classId)}
              className="px-2 py-0.5 text-[9px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white rounded shadow-sm transition-colors flex items-center gap-1 animate-pulse outline-none cursor-pointer"
              title="Click to approve faculty request and unlock registry"
            >
              🔓 Approve Request
            </button>
          )}
        </div>
      );
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

  const selectedClassObj = classrooms.find(c => c.id === selectedOverrideClass);
  const selectedPostedList = postedGradesMap[selectedOverrideClass] || [];
  const isSelectedLocked = selectedPostedList.length > 0 && selectedPostedList.some(p => p.is_locked);

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
        
        {/* 🔑 Dean's Administrative Registry Override Dashboard */}
        <div className="bg-amber-50/45 border border-amber-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>🔑 Dean's Administrative Registry Overrides</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Select a class record to bypass registry locks and manually unlock any term milestone score entries.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Select</label>
              <select
                value={selectedOverrideClass}
                onChange={(e) => setSelectedOverrideClass(e.target.value)}
                className="bg-white border border-slate-200 hover:border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all cursor-pointer text-slate-700 shadow-sm max-w-xs truncate"
              >
                {filteredClasses.length === 0 ? (
                  <option value="">No active classes</option>
                ) : (
                  filteredClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.subjectCode} - {c.section} ({c.facultyName})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-amber-100/70 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Registry Locks</span>
              <div className="flex flex-wrap gap-1">
                {!isSelectedLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    No active locks
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                    🔒 Semestral Grade
                  </span>
                )}
              </div>
            </div>

            {!isSelectedLocked ? (
              <p className="text-xs font-semibold text-slate-400 italic text-center py-2">
                {selectedClassObj ? `This class (${selectedClassObj.subjectCode} - ${selectedClassObj.section}) currently has no locked milestones.` : 'No class selected.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 pt-1">
                <div className="flex justify-between items-center bg-slate-50/50 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">Semestral Grade Registry</span>
                    <span className="text-[9px] text-rose-600 font-mono mt-0.5 font-bold">Status: LOCKED</span>
                  </div>
                  <button
                    onClick={() => handleApproveUnlock(selectedOverrideClass)}
                    className="px-2.5 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-sm outline-none cursor-pointer"
                  >
                    🔓 Unlock Override
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
                <option value="summer">Summer</option>
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
                {Array.from(new Set(['2025-2026', '2026-2027', ...termList.map(t => t.school_year)])).map(sy => (
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
                  <div>
                    {getStatusBadge(c.id)}
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
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Semestral Grades</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 text-sm">
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
                        {getStatusBadge(c.id)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-10 text-center text-slate-400 text-sm">
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

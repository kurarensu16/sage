import { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function GradePostingStatus() {
  const { user, profile } = useAuth();
  
  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [syFilter, setSyFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchActiveTerm() {
      try {
        const { data, error } = await supabase
          .from('academic_terms')
          .select('school_year, semester')
          .eq('is_active', true)
          .maybeSingle();
        if (data) {
          setSemFilter(data.semester);
          setSyFilter(data.school_year);
        }
      } catch (err) {
        console.error('Failed to fetch active academic term:', err);
      }
    }
    fetchActiveTerm();
  }, []);

  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [selectedOverrideClass, setSelectedOverrideClass] = useState('');

  const [classrooms, setClassrooms] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchClassrooms() {
      if (!profile?.department_id) {
        // Fallback to mockDb classrooms if profile/department_id not loaded yet
        setClassrooms(mockDb.getClassrooms().filter(c => c.status === 'active'));
        setDbLoading(false);
        return;
      }
      
      try {
        setDbLoading(true);
        // Query class_records belonging to sections in the Dean's department
        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subjects ( code, name ),
            sections!inner ( name, department_id, school_year, semester ),
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .eq('status', 'active')
          .eq('sections.department_id', profile.department_id);
          
        if (error) throw error;

        // Fetch posted_grades from database
        const { data: pgData } = await supabase
          .from('posted_grades')
          .select('class_record_id, is_locked, locked_milestones')
          .eq('grade_period', 'final');

        // Fetch unlock_requests from database
        const { data: reqData } = await supabase
          .from('unlock_requests')
          .select('class_record_id, milestone, status')
          .eq('status', 'pending');

        const dbLockedMap = {};
        (pgData || []).forEach(row => {
          if (row.is_locked) {
            if (!dbLockedMap[row.class_record_id]) {
              dbLockedMap[row.class_record_id] = new Set();
            }
            dbLockedMap[row.class_record_id].add('Semestral Grade');
            dbLockedMap[row.class_record_id].add('Final');
            if (row.locked_milestones) {
              row.locked_milestones.forEach(m => {
                dbLockedMap[row.class_record_id].add(m);
              });
            }
          }
        });

        const dbReqsMap = {};
        (reqData || []).forEach(row => {
          if (!dbReqsMap[row.class_record_id]) {
            dbReqsMap[row.class_record_id] = new Set();
          }
          dbReqsMap[row.class_record_id].add(row.milestone);
        });
        
        if (active && data) {
          const mapped = data.map(c => {
            const classId = c.class_record_id;
            const subCode = c.subjects?.code || 'N/A';
            
            // Merge database status with localStorage
            const localLocks = JSON.parse(localStorage.getItem(`locked_milestones_${classId}`) || localStorage.getItem(`locked_milestones_${subCode}`) || '[]');
            const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${classId}`) || localStorage.getItem(`unlock_requests_${subCode}`) || '[]');
            
            const mergedLocks = new Set([...localLocks, ...(dbLockedMap[classId] || [])]);
            const mergedReqs = new Set([...localReqs, ...(dbReqsMap[classId] || [])]);

            return {
              id: classId,
              subjectCode: subCode,
              subjectName: c.subjects?.name || 'N/A',
              section: c.sections?.name || 'N/A',
              facultyName: c.faculty ? `${c.faculty.first_name} ${c.faculty.last_name}` : 'Unassigned',
              schoolYear: c.sections?.school_year || c.school_year || '2025-2026',
              semester: c.sections?.semester || c.semester || '2nd',
              status: c.status,
              lockedMilestones: Array.from(mergedLocks),
              unlockRequests: Array.from(mergedReqs)
            };
          });
          setClassrooms(mapped);
        }
      } catch (err) {
        console.warn('Failed to load classrooms from database, falling back to mock:', err);
        if (active) {
          const mockClasses = mockDb.getClassrooms().filter(c => c.status === 'active');
          const mappedMock = mockClasses.map(c => {
            const localLocks = JSON.parse(localStorage.getItem(`locked_milestones_${c.subjectCode}`) || '[]');
            const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${c.subjectCode}`) || '[]');
            return {
              ...c,
              lockedMilestones: localLocks,
              unlockRequests: localReqs
            };
          });
          setClassrooms(mappedMock);
        }
      } finally {
        if (active) setDbLoading(false);
      }
    }
    fetchClassrooms();
    return () => { active = false; };
  }, [profile?.department_id, triggerRefresh]);

  const lockedMilestones = useMemo(() => {
    const selectedClass = classrooms.find(c => c.id === selectedOverrideClass || c.subjectCode === selectedOverrideClass);
    return selectedClass ? selectedClass.lockedMilestones : [];
  }, [classrooms, selectedOverrideClass]);

  const getSupabaseClassRecordId = async (subjectCode, sectionName) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(subjectCode)) return subjectCode;

    try {
      const { data, error } = await supabase
        .from('class_records')
        .select('class_record_id, subjects!inner(code), sections!inner(name)');
      if (error) throw error;
      
      const match = data?.find(cr => 
        cr.subjects?.code === subjectCode && 
        cr.sections?.name === sectionName
      );
      return match ? match.class_record_id : null;
    } catch (err) {
      console.error('Error finding Supabase class record:', err);
      return null;
    }
  };

  const handleApproveUnlock = async (classCode, milestone) => {
    const classroom = classrooms.find(c => c.subjectCode === classCode || c.id === classCode);
    const realClassRecordId = classroom ? classroom.id : classCode;
    const subCode = classroom ? classroom.subjectCode : classCode;

    // Helper to filter and update local storage arrays
    const updateLocalArray = (key, itemToRemove) => {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = existing.filter(m => m !== itemToRemove && m !== 'Final');
      localStorage.setItem(key, JSON.stringify(updated));
    };

    updateLocalArray(`locked_milestones_${realClassRecordId}`, milestone);
    updateLocalArray(`locked_milestones_${subCode}`, milestone);
    updateLocalArray(`unlock_requests_${realClassRecordId}`, milestone);
    updateLocalArray(`unlock_requests_${subCode}`, milestone);
    
    if (realClassRecordId) {
      try {
        const resolvedAt = new Date().toISOString();
        const resolvedBy = user?.id;

        await supabase
          .from('unlock_requests')
          .update({ status: 'approved', resolved_by: resolvedBy, resolved_at: resolvedAt })
          .eq('class_record_id', realClassRecordId)
          .eq('milestone', milestone)
          .eq('status', 'pending');

        await supabase
          .from('posted_grades')
          .update({ is_locked: false })
          .eq('class_record_id', realClassRecordId)
          .eq('grade_period', 'final');
      } catch (dbErr) {
        console.error('Error updating unlock request in Supabase:', dbErr);
      }
    }

    // Refresh UI
    setTriggerRefresh(prev => prev + 1);
  };

  const getStatusBadge = (classId) => {
    const classroom = classrooms.find(cl => cl.id === classId);
    if (!classroom) return null;
    
    const lockedMilestonesList = classroom.lockedMilestones || [];
    const unlockRequestsList = classroom.unlockRequests || [];
    
    const isPosted = lockedMilestonesList.includes('Semestral Grade') || lockedMilestonesList.includes('Final');
    const isRequested = unlockRequestsList.includes('Semestral Grade') || unlockRequestsList.includes('Final');
    
    if (isPosted) {
      return (
        <div className="flex flex-col items-center gap-1.5 justify-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Posted
          </span>
          {isRequested && (
            <button
              onClick={() => handleApproveUnlock(classroom.id, 'Semestral Grade')}
              className="px-2 py-0.5 text-[9px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white rounded shadow-sm transition-colors flex items-center gap-1 animate-pulse outline-none"
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
  const filteredClasses = classrooms.filter(c => {
    const matchesSearch = 
      c.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.section.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSem = !semFilter || c.semester === semFilter;
    const matchesSy = !syFilter || c.schoolYear === syFilter;
    
    // Simulate department mapping: IT prefix goes to IT department
    const isItDept = c.subjectCode.startsWith('IT') || c.subjectCode.startsWith('CS');
    const matchesDept = !deptFilter || 
      (deptFilter === 'IT' && isItDept) || 
      (deptFilter === 'CS' && c.subjectCode.startsWith('CS')) ||
      (deptFilter === 'Non-IT' && !isItDept);

    return matchesSearch && matchesSem && matchesSy && matchesDept;
  });

  return (
    <>
      <PageHeader title="Grade Posting Status" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* 🔑 Dean's Administrative Registry Override Dashboard */}
        <div className="bg-amber-50/45 border border-amber-205 rounded-xl p-5 space-y-4 shadow-sm">
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
                className="bg-white border border-slate-200 hover:border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all cursor-pointer text-slate-700 shadow-sm"
              >
                <option value="">— Select a class record —</option>
                {classrooms.map(c => (
                  <option key={c.id || c.subjectCode} value={c.id || c.subjectCode}>
                    {c.subjectCode} - {c.section} ({c.subjectName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedOverrideClass && (
            <div className="p-4 bg-white rounded-lg border border-amber-100/70 space-y-3 shadow-inner animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Registry Locks</span>
                <div className="flex flex-wrap gap-1">
                  {!(lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final')) ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-250">
                      No active locks
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                      🔒 Semestral Grade
                    </span>
                  )}
                </div>
              </div>

              {!(lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final')) ? (
                <p className="text-xs font-semibold text-slate-455 italic text-center py-2">This class currently has no locked milestones.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  <div className="flex justify-between items-center bg-slate-50/50 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">Semestral Grade</span>
                      <span className="text-[9px] text-rose-600 font-mono mt-0.5 font-bold">Status: LOCKED</span>
                    </div>
                    <button
                      onClick={() => handleApproveUnlock(selectedOverrideClass, 'Semestral Grade')}
                      className="px-2.5 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-sm outline-none"
                    >
                      🔓 Unlock Override
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
                placeholder="Search faculty or subject..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Departments</option>
                <option value="IT">Information Technology</option>
                <option value="CS">Computer Science</option>
                <option value="Non-IT">General Education / Other</option>
              </select>
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
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>

          </div>
        </div>

        {/* Status Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                {filteredClasses.length > 0 ? (
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
                      No matching class posting status reports found.
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

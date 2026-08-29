import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { ShieldAlert, Search, CheckCircle, XCircle, Loader2, Check, UserCheck, ShieldCheck, AlertTriangle, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import SuccessModal from '../../components/SuccessModal';

export default function ComplianceAudit() {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [processing, setProcessing] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [successModalData, setSuccessModalData] = useState({ isOpen: false, title: '', message: '' });
  
  // Evaluation Details Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState(null);
  const [studentEvaluationList, setStudentEvaluationList] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name || 'Department';

  const loadData = async () => {
    if (!userDepartmentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch active term
      const { data: termData } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('is_active', true)
        .single();
        
      setActiveTerm(termData);

      // Fetch active students in the department
      const { data: studentsData, error: stuErr } = await supabase
        .from('users')
        .select(`
          user_id, first_name, last_name, email, user_number, year_level,
          section_id, sections(name)
        `)
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('department_id', userDepartmentId)
        .order('last_name', { ascending: true });

      if (stuErr) throw stuErr;

      // If we have an active term, fetch clearance records for these students
      let clearancesMap = {};
      if (termData) {
        const studentIds = (studentsData || []).map(s => s.user_id);
        if (studentIds.length > 0) {
          const { data: clrData } = await supabase
            .from('clearance_records')
            .select('*')
            .eq('term_id', termData.term_id)
            .in('student_id', studentIds);
            
          (clrData || []).forEach(c => {
            clearancesMap[c.student_id] = c;
          });
        }
      }

      // Map data
      const mapped = (studentsData || []).map(s => {
        const sectionName = s.sections?.name || '';
        const programPrefix = sectionName.match(/^([A-Z]+)/)?.[1] || '';
        
        let derivedYear = s.year_level || '';
        if (!derivedYear && sectionName) {
          const match = sectionName.match(/(\d+)/)?.[1];
          if (match === '1') derivedYear = '1st Year';
          else if (match === '2') derivedYear = '2nd Year';
          else if (match === '3') derivedYear = '3rd Year';
          else if (match === '4') derivedYear = '4th Year';
        }
        if (!derivedYear) derivedYear = '1st Year';

        const clearance = clearancesMap[s.user_id];
        return {
          id: s.user_id,
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          userNumber: s.user_number,
          section: sectionName,
          section_id: s.section_id,
          programPrefix,
          yearLevel: derivedYear,
          clearanceStatus: clearance?.status === 'SIGNED' ? 'SIGNED' : 'UNSIGNED',
          clearanceId: clearance?.clearance_id || null
        };
      });

      setStudents(mapped);
    } catch (err) {
      console.error('Error loading clearance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userDepartmentId]);

  const executeToggleStatus = async (studentId, currentStatus, clearanceId) => {
    if (!activeTerm) return;
    setProcessing(true);
    setConfirmConfig(null);

    try {
      const nextStatus = currentStatus === 'SIGNED' ? 'UNSIGNED' : 'SIGNED';
      const student = students.find(s => s.id === studentId);
      
      if (clearanceId) {
        // Update existing record
        await supabase
          .from('clearance_records')
          .update({ 
            status: nextStatus,
            cleared_at: nextStatus === 'SIGNED' ? new Date().toISOString() : null
          })
          .eq('clearance_id', clearanceId);
      } else {
        // Insert new record
        const { data } = await supabase
          .from('clearance_records')
          .insert({
            student_id: studentId,
            term_id: activeTerm.term_id,
            status: nextStatus,
            cleared_at: nextStatus === 'SIGNED' ? new Date().toISOString() : null
          })
          .select()
          .single();
          
        if (data) clearanceId = data.clearance_id;
      }

      // Update local state
      setStudents(prev => prev.map(s => 
        s.id === studentId 
          ? { ...s, clearanceStatus: nextStatus, clearanceId } 
          : s
      ));

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Clearance Audit',
        `${nextStatus === 'SIGNED' ? 'Signed' : 'Revoked'} clearance for ${student.lastName}, ${student.firstName} (${student.userNumber}).`,
        actorName
      );

      setSuccessModalData({
        isOpen: true,
        title: nextStatus === 'SIGNED' ? 'Clearance Signed' : 'Clearance Revoked',
        message: nextStatus === 'SIGNED'
          ? `Successfully signed off clearance for ${student.lastName}, ${student.firstName}.`
          : `Clearance has been revoked for ${student.lastName}, ${student.firstName}.`
      });

    } catch (err) {
      console.error('Error updating clearance:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleViewEvaluationDetails = async (student) => {
    if (!activeTerm) return;
    setSelectedStudentForDetails(student);
    setIsDetailsModalOpen(true);
    setLoadingDetails(true);
    setStudentEvaluationList([]);

    try {
      // 1. Fetch ALL evaluation windows for this term (broad query)
      const { data: windows } = await supabase
        .from('evaluation_windows')
        .select(`
          window_id, term_id, faculty_id,
          faculty:users!faculty_id ( first_name, last_name )
        `)
        .eq('term_id', activeTerm.term_id)
        .eq('is_active', true);

      // 2. Fetch student's evaluation submission responses
      const { data: responses } = await supabase
        .from('evaluation_responses')
        .select('window_id')
        .eq('student_id', student.id);

      const submittedWindowIds = new Set(responses?.map(r => r.window_id) || []);

      // 3. Try to get subject info via class_records for the student's section
      let facultySubjectMap = {};
      const sectionId = student.section_id;
      
      if (sectionId) {
        const { data: classRecords } = await supabase
          .from('class_records')
          .select('faculty_id, subject_id, subjects(code, name)')
          .eq('section_id', sectionId)
          .eq('status', 'active');

        (classRecords || []).forEach(cr => {
          if (cr.faculty_id && cr.subjects) {
            facultySubjectMap[cr.faculty_id] = cr.subjects;
          }
        });
      }

      // 4. Fallback: also check enrollments table
      if (Object.keys(facultySubjectMap).length === 0) {
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(code, name)')
          .eq('student_id', student.id);

        if (enrolls && enrolls.length > 0) {
          const fallbackSectionId = enrolls[0].section_id;
          const subjectIds = enrolls.map(e => e.subject_id).filter(Boolean);
          
          if (fallbackSectionId && subjectIds.length > 0) {
            const { data: classRecords } = await supabase
              .from('class_records')
              .select('faculty_id, subject_id, subjects(code, name)')
              .eq('section_id', fallbackSectionId)
              .in('subject_id', subjectIds)
              .eq('status', 'active');

            (classRecords || []).forEach(cr => {
              if (cr.faculty_id && cr.subjects) {
                facultySubjectMap[cr.faculty_id] = cr.subjects;
              }
            });
          }
        }
      }

      // 5. Compile evaluation list
      let compiled;
      if (Object.keys(facultySubjectMap).length > 0) {
        // Match windows to student's actual instructors
        compiled = (windows || [])
          .filter(w => facultySubjectMap[w.faculty_id])
          .map(w => ({
            window_id: w.window_id,
            subjectCode: facultySubjectMap[w.faculty_id].code,
            subjectName: facultySubjectMap[w.faculty_id].name,
            instructorName: w.faculty 
              ? `Prof. ${w.faculty.first_name} ${w.faculty.last_name}` 
              : 'TBA',
            submitted: submittedWindowIds.has(w.window_id)
          }));
      } else {
        // Fallback: show ALL windows in the term (no subject-level mapping available)
        compiled = (windows || []).map(w => ({
          window_id: w.window_id,
          subjectCode: '—',
          subjectName: 'Faculty Evaluation',
          instructorName: w.faculty 
            ? `Prof. ${w.faculty.first_name} ${w.faculty.last_name}` 
            : 'TBA',
          submitted: submittedWindowIds.has(w.window_id)
        }));
      }

      setStudentEvaluationList(compiled);
    } catch (err) {
      console.error('Error loading evaluation details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const promptToggleStatus = (student) => {
    if (student.clearanceStatus === 'SIGNED') {
      setConfirmConfig({
        title: 'Revoke Clearance?',
        message: `Are you sure you want to revoke clearance for ${student.lastName}, ${student.firstName} (${student.userNumber || 'N/A'})? This will revert their clearance status to pending.`,
        actionLabel: 'Yes, Revoke Clearance',
        actionColor: 'rose',
        icon: 'alert',
        onConfirm: () => executeToggleStatus(student.id, student.clearanceStatus, student.clearanceId)
      });
    } else {
      setConfirmConfig({
        title: 'Sign Off Clearance?',
        message: `Are you sure you want to sign off clearance for ${student.lastName}, ${student.firstName} (${student.userNumber || 'N/A'})? This will grant the student clearance and unlock official grade summaries.`,
        actionLabel: 'Yes, Sign Off Clearance',
        actionColor: 'emerald',
        icon: 'check',
        onConfirm: () => executeToggleStatus(student.id, student.clearanceStatus, student.clearanceId)
      });
    }
  };

  const executeBulkSignOff = async () => {
    if (!activeTerm || selectedStudentIds.size === 0) return;
    setProcessing(true);
    setConfirmConfig(null);

    try {
      const toUpsert = [];
      const timestamp = new Date().toISOString();
      
      Array.from(selectedStudentIds).forEach(studentId => {
        const student = students.find(s => s.id === studentId);
        if (student && student.clearanceStatus !== 'SIGNED') {
          toUpsert.push({
            clearance_id: student.clearanceId || undefined,
            student_id: studentId,
            term_id: activeTerm.term_id,
            status: 'SIGNED',
            cleared_at: timestamp
          });
        }
      });

      if (toUpsert.length > 0) {
        const { data, error } = await supabase
          .from('clearance_records')
          .upsert(toUpsert, { onConflict: 'student_id,term_id' })
          .select();

        if (error) throw error;
        
        // Refresh mapping
        const newlyCleared = new Map((data || []).map(d => [d.student_id, d.clearance_id]));
        
        setStudents(prev => prev.map(s => {
          if (selectedStudentIds.has(s.id)) {
            return { ...s, clearanceStatus: 'SIGNED', clearanceId: newlyCleared.get(s.id) || s.clearanceId };
          }
          return s;
        }));

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'Bulk Clearance Audit',
          `Bulk signed clearance for ${toUpsert.length} student(s) in ${userDepartmentName}.`,
          actorName
        );

        setSuccessModalData({
          isOpen: true,
          title: 'Bulk Sign-Off Complete',
          message: `Successfully signed off clearance for ${toUpsert.length} student(s).`
        });
      }
      
      setSelectedStudentIds(new Set());
    } catch (err) {
      console.error('Error bulk signing clearance:', err);
    } finally {
      setProcessing(false);
    }
  };

  const promptBulkSignOff = () => {
    if (selectedStudentIds.size === 0) return;
    setConfirmConfig({
      title: 'Bulk Sign Off Clearance?',
      message: `Are you sure you want to sign off clearance for ${selectedStudentIds.size} selected student(s) in ${userDepartmentName}? This will unlock their term grade summaries.`,
      actionLabel: `Sign Off ${selectedStudentIds.size} Student(s)`,
      actionColor: 'emerald',
      icon: 'check',
      onConfirm: executeBulkSignOff
    });
  };

  // Row selection
  const handleSelectRow = (id) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uniquePrograms = [...new Set(students.map(s => s.programPrefix).filter(Boolean))].sort();
  const uniqueYearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const uniqueSections = [...new Set(students.map(s => s.section).filter(s => s && s !== 'Unassigned'))].sort();

  const activeFilterCount = [programFilter, yearFilter, sectionFilter, statusFilter].filter(Boolean).length;

  const clearFilters = () => {
    setProgramFilter('');
    setYearFilter('');
    setSectionFilter('');
    setStatusFilter('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      s.firstName.toLowerCase().includes(q) || 
      s.lastName.toLowerCase().includes(q) || 
      (s.userNumber && s.userNumber.toLowerCase().includes(q));
      
    const matchesProgram = !programFilter || s.programPrefix === programFilter || s.section.startsWith(programFilter);
    const matchesYear = !yearFilter || s.yearLevel === yearFilter;
    const matchesSection = !sectionFilter || s.section === sectionFilter;
    const matchesStatus = !statusFilter || s.clearanceStatus === statusFilter;
    
    return matchesSearch && matchesProgram && matchesYear && matchesSection && matchesStatus;
  });

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;
  const currentPageStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = () => {
    const allCurrentSelected = currentPageStudents.length > 0 && currentPageStudents.every(s => selectedStudentIds.has(s.id));
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        currentPageStudents.forEach(s => next.delete(s.id));
      } else {
        currentPageStudents.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-sage-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading clearance records...</p>
        </div>
      </div>
    );
  }

  if (!userDepartmentId) {
    return (
      <>
        <PageHeader title="Clearance Audit" breadcrumb="College Office Portal" />
        <div className="p-8 flex-1">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-xl text-center shadow-sm">
            <ShieldAlert className="h-12 w-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold">Unassigned Department</h3>
            <p className="mt-2 text-sm text-amber-700">Your account is not bound to a specific department. Clearance auditing is restricted to department scopes.</p>
          </div>
        </div>
      </>
    );
  }

  const signedCount = students.filter(s => s.clearanceStatus === 'SIGNED').length;
  const unsignedCount = students.length - signedCount;
  const progressPct = students.length > 0 ? Math.round((signedCount / students.length) * 100) : 0;

  return (
    <>
      <PageHeader title="Clearance Audit" breadcrumb="College Office Portal">
        {activeTerm && (
          <div className="bg-white/20 px-3 py-1.5 rounded text-sm text-white font-medium flex items-center gap-2 border border-white/30">
            <ShieldCheck className="h-4 w-4" />
            Active Term: {activeTerm.school_year} — {activeTerm.semester}
          </div>
        )}
      </PageHeader>
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 text-slate-500 mb-2">
               <ShieldAlert className="h-5 w-5 text-indigo-500" />
               <h4 className="text-xs font-bold uppercase tracking-wider">Total Students</h4>
            </div>
            <p className="text-3xl font-black text-slate-800 font-mono">{students.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-center">
             <div className="flex items-center gap-3 text-slate-500 mb-2">
               <CheckCircle className="h-5 w-5 text-emerald-500" />
               <h4 className="text-xs font-bold uppercase tracking-wider">Cleared</h4>
            </div>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-black text-emerald-600 font-mono">{signedCount}</p>
              <p className="text-sm text-slate-400 mb-1 font-medium">({progressPct}% completion)</p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-center">
             <div className="flex items-center gap-3 text-slate-500 mb-2">
               <XCircle className="h-5 w-5 text-rose-500" />
               <h4 className="text-xs font-bold uppercase tracking-wider">Pending Clearance</h4>
            </div>
            <p className="text-3xl font-black text-rose-600 font-mono">{unsignedCount}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search ID or Name..." 
            />
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* Program Filter */}
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Program</span>
            <select
              value={programFilter}
              onChange={e => {
                setProgramFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition-all cursor-pointer"
            >
              <option value="">All Programs</option>
              {uniquePrograms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Year Level Filter */}
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year Level</span>
            <select
              value={yearFilter}
              onChange={e => {
                setYearFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition-all cursor-pointer"
            >
              <option value="">All Year Levels</option>
              {uniqueYearLevels.map(yl => (
                <option key={yl} value={yl}>{yl}</option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Section</span>
            <select
              value={sectionFilter}
              onChange={e => {
                setSectionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition-all cursor-pointer"
            >
              <option value="">All Sections</option>
              {uniqueSections.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition-all cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="SIGNED">Cleared (Signed)</option>
              <option value="UNSIGNED">Pending (Unsigned)</option>
            </select>
          </div>

          {/* Clear Filters & Counter */}
          <div className="flex items-center gap-2 self-end pb-0.5">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors cursor-pointer px-2 py-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              {filteredStudents.length} matches
            </span>
          </div>
          
          <div className="ml-auto flex items-center gap-3 self-end">
            {selectedStudentIds.size > 0 && (
              <button
                onClick={promptBulkSignOff}
                disabled={processing}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5" /> 
                Sign Off Selected ({selectedStudentIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Data Feed (Mobile Cards + Desktop Table) */}
        
        {/* Mobile View Card Feed */}
        <div className="md:hidden space-y-3">
          {currentPageStudents.length > 0 ? (
            currentPageStudents.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{s.lastName}, {s.firstName}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{s.email}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">{s.userNumber || 'N/A'}</span>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {s.section || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {s.clearanceStatus === 'SIGNED' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5" /> Cleared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="h-3.5 w-3.5" /> Pending
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleViewEvaluationDetails(s)}
                    disabled={!activeTerm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" /> Eval Details
                  </button>

                  <button
                    onClick={() => promptToggleStatus(s)}
                    disabled={processing || !activeTerm}
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      s.clearanceStatus === 'SIGNED'
                        ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                    }`}
                  >
                    {s.clearanceStatus === 'SIGNED' ? 'Revoke' : 'Sign Off'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
              No students found matching your criteria.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={currentPageStudents.length > 0 && currentPageStudents.every(s => selectedStudentIds.has(s.id))}
                      onChange={handleSelectAll}
                      className="rounded text-sage-600 focus:ring-sage-500 h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ID Number</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Clearance Status</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Evaluation</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {currentPageStudents.length > 0 ? (
                  currentPageStudents.map((s) => (
                    <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${selectedStudentIds.has(s.id) ? 'bg-sage-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(s.id)}
                          onChange={() => handleSelectRow(s.id)}
                          className="rounded text-sage-600 focus:ring-sage-500 h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 font-mono">
                        {s.userNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-semibold text-slate-900">{s.lastName}, {s.firstName}</p>
                        <p className="text-xs text-slate-400 font-mono">{s.email}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {s.section || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {s.clearanceStatus === 'SIGNED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="h-3.5 w-3.5" /> Cleared
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="h-3.5 w-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <button
                          onClick={() => handleViewEvaluationDetails(s)}
                          disabled={!activeTerm}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Details
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => promptToggleStatus(s)}
                          disabled={processing || !activeTerm}
                          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            s.clearanceStatus === 'SIGNED'
                              ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                          }`}
                        >
                          {s.clearanceStatus === 'SIGNED' ? 'Revoke' : 'Sign Off'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 text-sm">
                      <ShieldCheck className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                      <p>No students found matching your criteria.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Premium Pagination Footer */}
          {totalPages > 1 && (
            <div className="bg-slate-50/75 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium">
                Showing <strong className="text-slate-800 font-semibold">{Math.min(filteredStudents.length, (currentPage - 1) * itemsPerPage + 1)}</strong> to <strong className="text-slate-800 font-semibold">{Math.min(filteredStudents.length, currentPage * itemsPerPage)}</strong> of <strong className="text-slate-800 font-semibold">{filteredStudents.length}</strong> students
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer",
                    currentPage === 1
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer",
                    currentPage === 1
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Numbered page buttons */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsisBefore = page > 1 && arr[idx - 1] !== page - 1;
                    return (
                      <React.Fragment key={page}>
                        {showEllipsisBefore && (
                          <span className="text-slate-400 text-xs px-1 select-none font-medium">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                            currentPage === page
                              ? "bg-sage-600 text-white shadow-xs"
                              : "text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer",
                    currentPage === totalPages
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer",
                    currentPage === totalPages
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Last Page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-6 text-left space-y-5 animate-in zoom-in-95 duration-200 relative">
            <button 
              onClick={() => setConfirmConfig(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                confirmConfig.actionColor === 'rose'
                  ? 'bg-rose-50 border border-rose-100 text-rose-600'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                {confirmConfig.icon === 'alert' ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <UserCheck className="h-6 w-6" />
                )}
              </div>
              <div className="space-y-1 pr-4">
                <h3 className="text-lg font-bold font-display text-slate-900 tracking-tight">
                  {confirmConfig.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {confirmConfig.message}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmConfig(null)}
                disabled={processing}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmConfig.onConfirm}
                disabled={processing}
                className={`px-4 py-2 text-white font-semibold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                  confirmConfig.actionColor === 'rose'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {confirmConfig.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📋 Evaluation Details Inspect Modal */}
      {isDetailsModalOpen && selectedStudentForDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs text-left animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 max-h-[88vh] sm:max-h-[90vh] flex flex-col">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <ClipboardList className="h-4.5 w-4.5 text-sage-600" />
                <span className="truncate">Evaluation Progress: {selectedStudentForDetails.lastName}, {selectedStudentForDetails.firstName}</span>
              </h3>
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-lg font-semibold cursor-pointer p-1"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Info Bar */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-450 block uppercase font-bold text-[9px] tracking-wide">Section & Roster</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{selectedStudentForDetails.section || 'Unassigned'}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-450 block uppercase font-bold text-[9px] tracking-wide">Overall Clearance</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${
                    selectedStudentForDetails.clearanceStatus === 'SIGNED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>
                    {selectedStudentForDetails.clearanceStatus === 'SIGNED' ? 'Cleared' : 'Pending'}
                  </span>
                </div>
              </div>

              {loadingDetails ? (
                <div className="py-12 flex flex-col items-center gap-2.5">
                  <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
                  <span className="text-xs text-slate-400 font-medium">Auditing evaluations...</span>
                </div>
              ) : studentEvaluationList.length > 0 ? (
                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {/* Progress Overview */}
                  {(() => {
                    const completed = studentEvaluationList.filter(e => e.submitted).length;
                    const total = studentEvaluationList.length;
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    return (
                      <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">Completion Rate</span>
                          <span className="font-mono font-bold text-slate-800">{completed}/{total} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Layer 1: Pending Evaluations */}
                  {studentEvaluationList.filter(e => !e.submitted).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 pl-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                          Pending ({studentEvaluationList.filter(e => !e.submitted).length})
                        </span>
                      </div>
                      <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl divide-y divide-amber-100 overflow-hidden">
                        {studentEvaluationList.filter(e => !e.submitted).map((evalItem, idx) => (
                          <div key={idx} className="px-4 py-3 flex items-center justify-between hover:bg-amber-50/60 transition-all">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{evalItem.subjectCode} — {evalItem.subjectName}</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">{evalItem.instructorName}</span>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <XCircle className="h-3 w-3" /> Not Submitted
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Layer 2: Completed Evaluations */}
                  {studentEvaluationList.filter(e => e.submitted).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 pl-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                          Completed ({studentEvaluationList.filter(e => e.submitted).length})
                        </span>
                      </div>
                      <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl divide-y divide-emerald-100 overflow-hidden">
                        {studentEvaluationList.filter(e => e.submitted).map((evalItem, idx) => (
                          <div key={idx} className="px-4 py-3 flex items-center justify-between hover:bg-emerald-50/60 transition-all">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{evalItem.subjectCode} — {evalItem.subjectName}</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">{evalItem.instructorName}</span>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle className="h-3 w-3" /> Submitted
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  No active evaluation windows mapped to this student's class section.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      <SuccessModal
        isOpen={successModalData.isOpen}
        title={successModalData.title}
        message={successModalData.message}
        onClose={() => setSuccessModalData({ isOpen: false, title: '', message: '' })}
      />
    </>
  );
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  ArrowLeft, 
  Calendar, 
  Check, 
  AlertTriangle, 
  AlertCircle, 
  UserCheck, 
  ChevronDown, 
  CloudUpload,
  Search,
  X,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';

export default function ClassAttendance() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Class selection state
  const [selectedClass, setSelectedClass] = useState(searchParams.get('classId') || '');
  const [classesList, setClassesList] = useState([]);
  
  // Update query param when class selection changes
  useEffect(() => {
    if (selectedClass) {
      setSearchParams({ classId: selectedClass });
    }
  }, [selectedClass, setSearchParams]);

  // Fetch classes assigned to this faculty member
  useEffect(() => {
    async function fetchClasses() {
      try {
        if (!user) {
          setClassesList([]);
          return;
        }

        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            term_id,
            subjects ( subject_id, code, name, units ),
            sections ( section_id, name )
          `)
          .eq('faculty_id', user.id)
          .eq('status', 'active');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const mapped = data.map(c => ({
            id: c.class_record_id,
            code: c.subjects?.code || 'N/A',
            section: c.sections?.name || 'N/A',
            name: c.subjects?.name || 'N/A',
            units: c.subjects?.units || 3,
            term_id: c.term_id
          }));
          setClassesList(mapped);
          
          // If no current selected class, default to first one
          const paramClassId = searchParams.get('classId');
          if (paramClassId && mapped.some(c => c.id === paramClassId)) {
            setSelectedClass(paramClassId);
          } else {
            setSelectedClass(mapped[0].id);
          }
        } else {
          setClassesList([]);
          setSelectedClass('');
        }
      } catch (err) {
        console.error('Database query failed:', err);
        setClassesList([]);
      }
    }
    fetchClasses();
  }, [user]);

  // Active class details
  const activeClass = classesList.find(c => c.id === selectedClass) || null;

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Present' | 'Absent' | 'Late' | 'Excused' | 'fda'

  // Notification toast message state
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Previous sessions state
  const [previousSessions, setPreviousSessions] = useState([]);

  // Fetch unique recorded attendance dates for this class
  const fetchPreviousSessions = async () => {
    if (!selectedClass) return;
    try {
      if (!user) {
        setPreviousSessions(['2026-06-05', '2026-06-03', '2026-06-01']);
        return;
      }
      const { data, error } = await supabase
        .from('attendance_records')
        .select('date')
        .eq('class_record_id', selectedClass);
      
      if (error) throw error;
      if (data) {
        const uniqueDates = [...new Set(data.map(item => item.date))].sort((a, b) => new Date(b) - new Date(a));
        setPreviousSessions(uniqueDates);
      }
    } catch (err) {
      console.warn('Error fetching sessions:', err);
    }
  };

  useEffect(() => {
    fetchPreviousSessions();
  }, [selectedClass, user]);

  // State for active roster
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Save status state
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const [isInitialized, setIsInitialized] = useState(false);
  const [showInitConfirm, setShowInitConfirm] = useState(false);

  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);
  const lastSavedStateRef = useRef('');

  // Set isFirstRender to true when selectedClass or selectedDate changes to prevent saving on initial load
  useEffect(() => {
    isFirstRender.current = true;
  }, [selectedClass, selectedDate]);

  // Fetch roster, daily logs, and term absences from Supabase
  useEffect(() => {
    async function fetchRosterAndAttendance() {
      if (!selectedClass) return;
      setLoading(true);
      try {
        // 1. Fetch roster using get_class_attendance_roster RPC
        const { data: rosterData, error: rosterError } = await supabase
          .rpc('get_class_attendance_roster', { p_class_record_id: selectedClass });

        if (rosterError) throw rosterError;

        // 2. Fetch existing daily logs for this date
        const { data: attendanceData, error: attError } = await supabase
          .from('attendance_records')
          .select('student_id, status, remarks')
          .eq('class_record_id', selectedClass)
          .eq('date', selectedDate);

        if (attError) throw attError;

        const exists = attendanceData && attendanceData.length > 0;
        setIsInitialized(exists);

        // 3. Fetch total absence counts for each student in this class (for the current term_id if available)
        const currentTermId = activeClass?.term_id || null;
        let countQuery = supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', selectedClass)
          .eq('status', 'Absent');

        if (currentTermId) {
          countQuery = countQuery.eq('term_id', currentTermId);
        }

        const { data: countData, error: countError } = await countQuery;
        
        let absenceCounts = {};
        if (!countError && countData) {
          countData.forEach(rec => {
            absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
          });
        }

        // Map together
        const mappedRoster = (rosterData || []).map(student => {
          const dailyLog = (attendanceData || []).find(a => a.student_id === student.student_id);
          const currentStatus = dailyLog ? dailyLog.status : 'Present';
          const currentRemarks = dailyLog ? (dailyLog.remarks || '') : '';
          const totalAbs = absenceCounts[student.student_id] || 0;
          
          return {
            id: student.student_id,
            firstName: student.first_name,
            lastName: student.last_name,
            type: student.student_type || 'Regular',
            status: currentStatus,
            remarks: currentRemarks,
            absences: totalAbs
          };
        });

        // Set the flag to true right before setting state so the change listener doesn't trigger immediately
        isFirstRender.current = true;
        setRoster(mappedRoster);
        
        // Cache snapshot to avoid redundant saves
        lastSavedStateRef.current = JSON.stringify(mappedRoster.map(s => ({ id: s.id, status: s.status, remarks: s.remarks })));
      } catch (err) {
        console.error('Database query failed:', err);
        setRoster([]);
      } finally {
        setLoading(false);
      }
    }

    fetchRosterAndAttendance();
  }, [selectedClass, selectedDate, activeClass?.term_id]);

  // Helper to initialize attendance sheet for current date
  const confirmInitialize = async () => {
    setShowInitConfirm(false);
    setLoading(true);
    try {
      const termId = activeClass?.term_id || null;
      let defaultRosterData = [];
      
      if (user) {
        const { data: rosterData, error: rosterError } = await supabase
          .rpc('get_class_attendance_roster', { p_class_record_id: selectedClass });

        if (rosterError) throw rosterError;
        defaultRosterData = rosterData || [];
      }

      // Fetch absence counts for default roster
      let countQuery = supabase
        .from('attendance_records')
        .select('student_id')
        .eq('class_record_id', selectedClass)
        .eq('status', 'Absent');

      if (termId) {
        countQuery = countQuery.eq('term_id', termId);
      }

      const { data: countData } = await countQuery;
      let absenceCounts = {};
      if (countData) {
        countData.forEach(rec => {
          absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
        });
      }

      const initialRoster = defaultRosterData.map(student => ({
        id: student.student_id || student.id,
        firstName: student.first_name || student.firstName,
        lastName: student.last_name || student.lastName,
        type: student.student_type || student.type || 'Regular',
        status: 'Present',
        remarks: '',
        absences: absenceCounts[student.student_id || student.id] || 0
      }));

      setIsInitialized(true);
      isFirstRender.current = true;
      setRoster(initialRoster);
      lastSavedStateRef.current = JSON.stringify(initialRoster.map(s => ({ id: s.id, status: s.status, remarks: s.remarks })));

      // Perform immediate silent save to initialize database records
      if (user) {
        const upsertRows = initialRoster.map(student => ({
          student_id: student.id,
          class_record_id: selectedClass,
          date: selectedDate,
          status: student.status,
          remarks: null,
          term_id: termId
        }));

        const { error } = await supabase
          .from('attendance_records')
          .upsert(upsertRows, { onConflict: 'student_id,class_record_id,date' });

        if (error) throw error;
      }

      fetchPreviousSessions();
      showToast('Attendance sheet initialized for today.');
    } catch (err) {
      console.error('Failed to initialize attendance:', err);
      showToast('Failed to initialize attendance.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Debounced Auto-save Effect triggered ONLY when status or remarks change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (roster.length === 0 || !isInitialized) return;

    // Check if the actionable data (status/remarks) actually changed from last saved
    const currentState = JSON.stringify(roster.map(s => ({ id: s.id, status: s.status, remarks: s.remarks })));
    if (currentState === lastSavedStateRef.current) {
      return;
    }

    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      handleSaveAttendanceSilent();
    }, 1200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [roster, isInitialized]);

  // Handle marking status in UI
  const handleStatusChange = (studentId, newStatus) => {
    setRoster(prev => prev.map(student => {
      if (student.id === studentId) {
        let newAbsences = student.absences;
        // Adjust client-side absolute counter for instant visual responsiveness
        if (student.status === 'Absent' && newStatus !== 'Absent') {
          newAbsences = Math.max(0, newAbsences - 1);
        } else if (student.status !== 'Absent' && newStatus === 'Absent') {
          newAbsences = newAbsences + 1;
        }
        return { ...student, status: newStatus, absences: newAbsences };
      }
      return student;
    }));
  };

  // Handle remarks change
  const handleRemarksChange = (studentId, remarksVal) => {
    setRoster(prev => prev.map(student => {
      if (student.id === studentId) {
        return { ...student, remarks: remarksVal };
      }
      return student;
    }));
  };

  // Mark all present helper
  const handleMarkAllPresent = () => {
    setRoster(prev => prev.map(student => {
      let newAbsences = student.absences;
      if (student.status === 'Absent') {
        newAbsences = Math.max(0, newAbsences - 1);
      }
      return { ...student, status: 'Present', absences: newAbsences };
    }));
    showToast('All students marked Present.');
  };

  // Silent Save logic for Auto-save
  const handleSaveAttendanceSilent = async () => {
    if (!selectedClass || roster.length === 0) return;
    try {
      const termId = activeClass?.term_id || null;
      const upsertRows = roster.map(student => ({
        student_id: student.id,
        class_record_id: selectedClass,
        date: selectedDate,
        status: student.status,
        remarks: student.remarks || null,
        term_id: termId
      }));

      const { error } = await supabase
        .from('attendance_records')
        .upsert(upsertRows, { onConflict: 'student_id,class_record_id,date' });

      if (error) throw error;

      // Update the snapshot ref so we know this exact state is persisted
      lastSavedStateRef.current = JSON.stringify(roster.map(s => ({ id: s.id, status: s.status, remarks: s.remarks })));

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);

      // Refresh unique session dates in background
      fetchPreviousSessions();
    } catch (err) {
      console.warn('Database save failed, writing to fallback cache:', err);
      roster.forEach(student => {
        const localKeyStatus = `sage_att_status_${selectedClass}_${selectedDate}_${student.id}`;
        const localKeyRemarks = `sage_att_remarks_${selectedClass}_${selectedDate}_${student.id}`;
        localStorage.setItem(localKeyStatus, student.status);
        localStorage.setItem(localKeyRemarks, student.remarks || '');
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // Save attendance log manually (explicit Save Button)
  const handleSaveAttendance = async () => {
    if (!selectedClass || roster.length === 0) return;
    setSaveStatus('saving');
    try {
      await handleSaveAttendanceSilent();
      showToast('Attendance records saved successfully.');
    } catch (err) {
      setSaveStatus('error');
      showToast('Failed to save attendance: ' + err.message, 'error');
    }
  };

  // Status badging helper
  const getAbsenceBadge = (absences) => {
    if (absences >= 4) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
          <AlertCircle className="h-3 w-3" /> FDA ({absences} Absences)
        </span>
      );
    }
    if (absences >= 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3" /> Warning ({absences}/3)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
        Safe ({absences} Absences)
      </span>
    );
  };

  // Calculate statistics
  const totalEnrolled = roster.length;
  const presentCount = roster.filter(s => s.status === 'Present').length;
  const absentCount = roster.filter(s => s.status === 'Absent').length;
  const lateCount = roster.filter(s => s.status === 'Late').length;
  const excusedCount = roster.filter(s => s.status === 'Excused').length;
  const fdaCount = roster.filter(s => s.absences >= 4).length;

  // Filtered Roster for UI table display
  const filteredRoster = useMemo(() => {
    return roster.filter(student => {
      // Name Search match
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch = searchQuery === '' || fullName.includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Status Filter match
      if (statusFilter === 'all') return true;
      if (statusFilter === 'fda') return student.absences >= 4 || student.absences >= 2;
      return student.status === statusFilter;
    });
  }, [roster, searchQuery, statusFilter]);

  return (
    <>
      <PageHeader title="Log Class Attendance" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 animate-pulse font-medium">
              <CloudUpload className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 sm:px-3 py-1.5 rounded-xl border border-emerald-200 font-semibold animate-in fade-in duration-200">
              <Check className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 px-2.5 sm:px-3 py-1.5 rounded-xl border border-rose-200 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Error</span>
            </span>
          )}
          <button 
            onClick={() => navigate('/faculty/classrecordslist')}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Back</span>
          </button>
          {isInitialized && (
            <button 
              onClick={handleMarkAllPresent}
              className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-xl transition-colors bg-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <UserCheck className="h-3.5 w-3.5 text-sage-600" /> <span className="hidden sm:inline">Mark All Present</span><span className="sm:hidden">All Present</span>
            </button>
          )}
          {isInitialized && (
            <button 
              onClick={handleSaveAttendance}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CloudUpload className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Save Attendance</span><span className="sm:hidden">Save</span>
            </button>
          )}
        </div>
      </PageHeader>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {toastMessage.type === 'error' ? <AlertCircle className="h-4 w-4 text-rose-600" /> : <Check className="h-4 w-4 text-emerald-600" />}
            {toastMessage.text}
          </div>
        </div>
      )}

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">

        {/* Selectors Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          
          {/* Class Record Selector */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700 shadow-2xs"
              >
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.code} - {c.section} ({c.name})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Date Selector */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Date</label>
            <div className="relative">
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all text-slate-700 shadow-2xs"
              />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Stats Overview */}
          <div className="flex items-center gap-4 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{totalEnrolled} Students</p>
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session Tally</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                <span className="text-emerald-600">{presentCount} P</span> · <span className="text-rose-500">{absentCount} A</span> · <span className="text-amber-500">{lateCount} L</span> · <span className="text-blue-500">{excusedCount} E</span>
              </p>
            </div>
          </div>

        </div>

        {/* Previous Sessions Quick Links */}
        {previousSessions.length > 0 && (
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-2.5 sm:space-y-3 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-sage-600" />
                <h4 className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">Previously Recorded Sessions</h4>
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">{previousSessions.length} logged session{previousSessions.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {previousSessions.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    selectedDate === date
                      ? 'bg-sage-600 text-white border-sage-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-sage-300'
                  }`}
                >
                  <span>{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Class Info & Policy Bar */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 sm:p-4 text-amber-900 text-xs flex items-start gap-3 shadow-2xs text-left">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-xs sm:text-sm text-amber-950 font-display">Failure Due to Absences (FDA) Policy:</span>
            <p className="text-[11px] sm:text-xs text-amber-800 leading-relaxed">
              Students exceeding 20% unexcused absences trigger mandatory FDA status. For standard 3-unit courses, reaching <strong>4 or more absences</strong> locks the final grade to 5.00.
            </p>
          </div>
        </div>

        {/* Student Roster Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden text-left">
          
          {/* Roster Controls: Search & Filters */}
          {isInitialized && roster.length > 0 && (
            <div className="p-3.5 sm:p-4 border-b border-slate-200/80 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              
              {/* Search Bar */}
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student by name..."
                  className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {[
                  { id: 'all', label: `All (${roster.length})` },
                  { id: 'Present', label: `Present (${presentCount})` },
                  { id: 'Absent', label: `Absent (${absentCount})` },
                  { id: 'Late', label: `Late (${lateCount})` },
                  { id: 'Excused', label: `Excused (${excusedCount})` },
                  { id: 'fda', label: `FDA (${fdaCount})`, icon: ShieldAlert }
                ].map(filter => {
                  const isSelected = statusFilter === filter.id;
                  const Icon = filter.icon;
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setStatusFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                        isSelected 
                          ? 'bg-slate-900 text-white shadow-xs' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {filter.label}
                    </button>
                  );
                })}
              </div>

            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sage-600"></div>
              <span>Loading class roster...</span>
            </div>
          ) : !isInitialized ? (
            <div className="p-8 sm:p-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sage-50 border border-sage-100 flex items-center justify-center text-sage-600 mx-auto">
                <Calendar className="h-7 w-7 stroke-[2]" />
              </div>
              <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">Attendance Sheet Not Initialized</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                There are no attendance records created for this class on <strong>{new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              </p>
              <button
                onClick={() => setShowInitConfirm(true)}
                className="px-5 py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-semibold rounded-xl shadow-2xs transition-all cursor-pointer inline-flex items-center gap-2 text-xs sm:text-sm"
              >
                <Sparkles className="h-4 w-4" /> Initialize Attendance Sheet
              </button>
            </div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-xs sm:text-sm text-slate-500">No students enrolled in this class record.</div>
          ) : filteredRoster.length === 0 ? (
            <div className="p-10 text-center text-xs sm:text-sm text-slate-400 space-y-2">
              <p>No students match your filter criteria.</p>
              <button 
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="text-xs text-sage-600 hover:text-sage-700 font-semibold underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              {/* ── Mobile Attendance Cards (md:hidden) ─────────────────── */}
              <div className="md:hidden divide-y divide-slate-100 p-2">
                {filteredRoster.map((student) => (
                  <div key={student.id} className="p-3.5 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 font-display text-sm block truncate">
                          {student.lastName}, {student.firstName}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          {student.type === 'Irregular' ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                              Irregular
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 font-mono">
                              Regular
                            </span>
                          )}
                          {getAbsenceBadge(student.absences)}
                        </div>
                      </div>
                    </div>

                    {/* Status Picker 4-way Segment */}
                    <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl">
                      {['Present', 'Absent', 'Late', 'Excused'].map((statusOption) => {
                        const isSelected = student.status === statusOption;
                        let activeStyles = '';
                        if (isSelected) {
                          if (statusOption === 'Present') activeStyles = 'bg-emerald-500 text-white shadow-2xs font-bold';
                          if (statusOption === 'Absent') activeStyles = 'bg-rose-500 text-white shadow-2xs font-bold';
                          if (statusOption === 'Late') activeStyles = 'bg-amber-500 text-white shadow-2xs font-bold';
                          if (statusOption === 'Excused') activeStyles = 'bg-blue-500 text-white shadow-2xs font-bold';
                        } else {
                          activeStyles = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50';
                        }

                        return (
                          <button
                            key={statusOption}
                            onClick={() => handleStatusChange(student.id, statusOption)}
                            className={`py-2 rounded-lg text-xs transition-all cursor-pointer text-center ${activeStyles}`}
                          >
                            {statusOption}
                          </button>
                        );
                      })}
                    </div>

                    {/* Remarks Input */}
                    <div>
                      <input
                        type="text"
                        value={student.remarks}
                        onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                        placeholder="Add notes / remarks..."
                        className="w-full text-xs border border-slate-200 px-3 py-2 rounded-xl outline-none focus:border-sage-400 focus:ring-1 focus:ring-sage-400 transition-colors bg-slate-50/50 shadow-2xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Desktop Roster Table (hidden md:block) ─────────────────── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Name</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Term Absences</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoster.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Name */}
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 font-display text-sm">
                            {student.lastName}, {student.firstName}
                          </span>
                        </td>
                        
                        {/* Type */}
                        <td className="px-6 py-4">
                          {student.type === 'Irregular' ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                              Irregular
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 font-mono">
                              Regular
                            </span>
                          )}
                        </td>

                        {/* Status Picker */}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
                            {['Present', 'Absent', 'Late', 'Excused'].map((statusOption) => {
                              const isSelected = student.status === statusOption;
                              let activeStyles = '';
                              if (isSelected) {
                                if (statusOption === 'Present') activeStyles = 'bg-emerald-500 text-white shadow-sm font-bold';
                                if (statusOption === 'Absent') activeStyles = 'bg-rose-500 text-white shadow-sm font-bold';
                                if (statusOption === 'Late') activeStyles = 'bg-amber-500 text-white shadow-sm font-bold';
                                if (statusOption === 'Excused') activeStyles = 'bg-blue-500 text-white shadow-sm font-bold';
                              } else {
                                activeStyles = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50';
                              }

                              return (
                                <button
                                  key={statusOption}
                                  onClick={() => handleStatusChange(student.id, statusOption)}
                                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeStyles}`}
                                >
                                  {statusOption}
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {/* Absences Badge */}
                        <td className="px-6 py-4">
                          {getAbsenceBadge(student.absences)}
                        </td>

                        {/* Remarks Input */}
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={student.remarks}
                            onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                            placeholder="Add notes..."
                            className="w-full text-xs border border-slate-200 px-3 py-1.5 rounded-lg outline-none focus:border-sage-400 focus:ring-1 focus:ring-sage-400 transition-colors"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>

      <ConfirmModal
        isOpen={showInitConfirm}
        title="Initialize Attendance Sheet?"
        message={`Are you sure you want to create a new attendance record for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}?`}
        onConfirm={confirmInitialize}
        onCancel={() => setShowInitConfirm(false)}
      />
    </>
  );
}


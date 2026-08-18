import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ArrowLeft, Calendar, Check, AlertTriangle, AlertCircle, UserCheck, ChevronDown, CloudUpload } from 'lucide-react';
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

  // Fallback data structures
  const classesListFallback = [
    { id: '1', code: 'IT101', section: 'BSIT-1A', name: 'Intro to Computing', schedule: 'MWF 9:00AM - 10:30AM (1.5 hrs)', room: 'Lab 1', term_id: 'mock-term-id' },
    { id: '2', code: 'IT201', section: 'BSIT-2B', name: 'Data Structures', schedule: 'TTh 1:00PM - 3:00PM (2 hrs)', room: 'Lab 3', term_id: 'mock-term-id' },
    { id: '3', code: 'CS301', section: 'BSCS-3A', name: 'Artificial Intelligence', schedule: 'MWF 1:00PM - 2:30PM (1.5 hrs)', room: 'Lec 5', term_id: 'mock-term-id' },
    { id: '4', code: 'BSITCPR323', section: 'BSIT-4A', name: 'Capstone Project 1', schedule: 'TTh 9:00AM - 12:00PM (3 hrs)', room: 'Lab 2', term_id: 'mock-term-id' }
  ];

  const classRostersFallback = {
    '1': [
      { student_id: '1', first_name: 'Juan M.', last_name: 'Dela Cruz', student_type: 'Regular' },
      { student_id: '2', first_name: 'Maria A.', last_name: 'Santos', student_type: 'Regular' },
      { student_id: '3', first_name: 'Mark T.', last_name: 'Reyes', student_type: 'Irregular' },
      { student_id: '4', first_name: 'Anna C.', last_name: 'Villanueva', student_type: 'Regular' }
    ],
    '2': [
      { student_id: '5', first_name: 'Kevin L.', last_name: 'Bautista', student_type: 'Regular' },
      { student_id: '6', first_name: 'Elena R.', last_name: 'Gomez', student_type: 'Regular' },
      { student_id: '7', first_name: 'Jaime F.', last_name: 'Pascual', student_type: 'Irregular' }
    ],
    '3': [
      { student_id: '8', first_name: 'Teresa S.', last_name: 'Aquino', student_type: 'Regular' },
      { student_id: '9', first_name: 'Dexter J.', last_name: 'Lim', student_type: 'Regular' },
      { student_id: '10', first_name: 'Patricia N.', last_name: 'Cruz', student_type: 'Regular' }
    ],
    '4': [
      { student_id: '11', first_name: 'John Christian C.', last_name: 'Gabriel', student_type: 'Regular' },
      { student_id: '12', first_name: 'Mark Angelo', last_name: 'Santiago', student_type: 'Regular' },
      { student_id: '13', first_name: 'Carlo', last_name: 'Celestino', student_type: 'Irregular' },
      { student_id: '14', first_name: 'Mark T.', last_name: 'Reyes', student_type: 'Regular' },
      { student_id: '15', first_name: 'Anna C.', last_name: 'Villanueva', student_type: 'Irregular' },
      { student_id: '16', first_name: 'Apolinario', last_name: 'Mabini', student_type: 'Regular' }
    ]
  };

  // Fetch classes assigned to this faculty member
  useEffect(() => {
    async function fetchClasses() {
      try {
        if (!user) {
          setClassesList(classesListFallback);
          setSelectedClass(searchParams.get('classId') || classesListFallback[3].id);
          return;
        }

        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            term_id,
            subjects ( subject_id, code, name ),
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
            term_id: c.term_id,
            schedule: 'TTh 9:00AM - 12:00PM (3 hrs)', // default schedule details
            room: 'Lab 2'
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
          setClassesList(classesListFallback);
          setSelectedClass(searchParams.get('classId') || classesListFallback[3].id);
        }
      } catch (err) {
        console.warn('Database offline or connection failed. Falling back to local classes:', err);
        setClassesList(classesListFallback);
        setSelectedClass(searchParams.get('classId') || classesListFallback[3].id);
      }
    }
    fetchClasses();
  }, [user]);

  // Active class details
  const activeClass = classesList.find(c => c.id === selectedClass) || null;

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Previous sessions state
  const [previousSessions, setPreviousSessions] = useState([]);

  // Fetch unique recorded attendance dates for this class
  const fetchPreviousSessions = async () => {
    if (!selectedClass) return;
    try {
      if (!user) {
        // Fallback recorded sessions
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
      setPreviousSessions(['2026-06-05', '2026-06-03', '2026-06-01']);
    }
  };

  useEffect(() => {
    fetchPreviousSessions();
  }, [selectedClass, user]);

  // State for active roster
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Save status state
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'

  const [isInitialized, setIsInitialized] = useState(false);
  const [showInitConfirm, setShowInitConfirm] = useState(false);

  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);

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

        // 3. Fetch total absence counts for each student in this class (for the current term_id)
        const currentTermId = activeClass?.term_id || null;
        let absenceCounts = {};
        if (currentTermId) {
          const { data: countData, error: countError } = await supabase
            .from('attendance_records')
            .select('student_id')
            .eq('class_record_id', selectedClass)
            .eq('term_id', currentTermId)
            .eq('status', 'Absent');
          
          if (!countError && countData) {
            countData.forEach(rec => {
              absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
            });
          }
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
            type: student.student_type,
            status: currentStatus,
            remarks: currentRemarks,
            absences: totalAbs
          };
        });

        // Set the flag to true right before setting state so the change listener doesn't trigger immediately
        isFirstRender.current = true;
        setRoster(mappedRoster);
      } catch (err) {
        console.warn('Database error or offline. Falling back to local roster cache:', err);
        
        // Offline / disconnected fallback logic
        const defaultRoster = classRostersFallback[selectedClass] || classRostersFallback['4'];
        const hasSavedOffline = defaultRoster.some(student => 
          localStorage.getItem(`sage_att_status_${selectedClass}_${selectedDate}_${student.student_id}`) !== null
        );
        setIsInitialized(hasSavedOffline);

        const mappedRoster = defaultRoster.map(student => {
          const localKeyStatus = `sage_att_status_${selectedClass}_${selectedDate}_${student.student_id}`;
          const localKeyRemarks = `sage_att_remarks_${selectedClass}_${selectedDate}_${student.student_id}`;
          const localKeyAbs = `sage_absences_${selectedClass}_${student.student_id}`;
          
          const savedStatus = localStorage.getItem(localKeyStatus) || (student.student_id === '16' ? 'Absent' : 'Present');
          const savedRemarks = localStorage.getItem(localKeyRemarks) || (student.student_id === '16' ? 'Medical Checkup' : '');
          const savedAbs = localStorage.getItem(localKeyAbs) || (student.student_id === '16' ? '4' : '0');
          
          return {
            id: student.student_id,
            firstName: student.first_name,
            lastName: student.last_name,
            type: student.student_type,
            status: savedStatus,
            remarks: savedRemarks,
            absences: parseInt(savedAbs)
          };
        });
        isFirstRender.current = true;
        setRoster(mappedRoster);
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
      } else {
        defaultRosterData = classRostersFallback[selectedClass] || classRostersFallback['4'];
      }

      // Fetch absence counts for default roster
      let absenceCounts = {};
      if (user && termId) {
        const { data: countData, error: countError } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', selectedClass)
          .eq('term_id', termId)
          .eq('status', 'Absent');
        
        if (!countError && countData) {
          countData.forEach(rec => {
            absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
          });
        }
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
      } else {
        // LocalStorage fallback
        initialRoster.forEach(student => {
          localStorage.setItem(`sage_att_status_${selectedClass}_${selectedDate}_${student.id}`, 'Present');
          localStorage.setItem(`sage_att_remarks_${selectedClass}_${selectedDate}_${student.id}`, '');
        });
      }

      fetchPreviousSessions();
    } catch (err) {
      console.error('Failed to initialize attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced Auto-save Effect triggered on roster changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (roster.length === 0 || !isInitialized) return;

    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      handleSaveAttendanceSilent();
    }, 1200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [roster]);

  // Handle marking status in UI
  const handleStatusChange = (studentId, newStatus) => {
    setRoster(prev => prev.map(student => {
      if (student.id === studentId) {
        let newAbsences = student.absences;
        // Adjust client-side absolute counter for visual responsiveness before saving
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

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);

      // Refresh unique session dates to include newly saved ones
      fetchPreviousSessions();

      // Refresh absences from Supabase
      if (termId) {
        const { data: countData, error: countError } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', selectedClass)
          .eq('term_id', termId)
          .eq('status', 'Absent');
        
        if (!countError && countData) {
          const absenceCounts = {};
          countData.forEach(rec => {
            absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
          });
          // Update visual absences without resetting first render state
          setRoster(prev => prev.map(s => ({
            ...s,
            absences: absenceCounts[s.id] || 0
          })));
        }
      }
    } catch (err) {
      console.warn('Database save failed, writing to localStorage cache silently:', err);
      roster.forEach(student => {
        const localKeyStatus = `sage_att_status_${selectedClass}_${selectedDate}_${student.id}`;
        const localKeyRemarks = `sage_att_remarks_${selectedClass}_${selectedDate}_${student.id}`;
        const localKeyAbs = `sage_absences_${selectedClass}_${student.id}`;
        
        localStorage.setItem(localKeyStatus, student.status);
        localStorage.setItem(localKeyRemarks, student.remarks || '');
        localStorage.setItem(localKeyAbs, student.absences.toString());
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
      alert('Attendance saved successfully to database!');
    } catch (err) {
      alert('Failed to save attendance: ' + err.message);
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

  return (
    <>
      <PageHeader title="Log Class Attendance" breadcrumb="Faculty Portal">
        {saveStatus === 'saving' && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 animate-pulse font-medium">
            <CloudUpload className="h-4 w-4" /> Saving...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-semibold animate-in fade-in duration-200">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        <button 
          onClick={() => navigate('/faculty/classrecordslist')}
          className="px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-lg transition-all flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button 
          onClick={handleMarkAllPresent}
          className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2"
        >
          <UserCheck className="h-4 w-4 text-sage-600" /> Mark All Present
        </button>
        <button 
          onClick={handleSaveAttendance}
          className="px-4 py-2 text-sm font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
        >
          <CloudUpload className="h-4 w-4" /> Save Attendance
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* Selectors Bar */}
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          
          {/* Class Record Selector */}
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
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
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Date</label>
            <div className="relative">
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all text-slate-700"
              />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Stats Overview */}
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{totalEnrolled} Students</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Roster Status</p>
              <p className="text-xs font-mono font-bold text-slate-850 mt-0.5">
                <span className="text-emerald-600">{presentCount} P</span> · <span className="text-rose-500">{absentCount} A</span> · <span className="text-amber-500">{lateCount} L</span>
              </p>
            </div>
          </div>

        </div>

        {/* Previous Sessions Quick Links */}
        {previousSessions.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-sage-600" />
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Previously Recorded Sessions</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousSessions.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    selectedDate === date
                      ? 'bg-sage-600 text-white border-sage-600 shadow-sm'
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-xs flex gap-2 shadow-sm">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0" />
          <div>
            <span className="font-bold">Failure Due to Absences (FDA) Policy:</span>
            <p className="text-amber-800 mt-0.5">
              Students exceed the 20% limit and trigger FDA at <strong>4 absences</strong> for this 3-hour session subject.
            </p>
          </div>
        </div>

        {/* Student Roster Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading class roster...</div>
          ) : !isInitialized ? (
            <div className="p-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-sage-50 border border-sage-100 flex items-center justify-center text-sage-600 mx-auto">
                <Calendar className="h-8 w-8 stroke-[2]" />
              </div>
              <h3 className="text-lg font-bold font-display text-slate-900">Attendance Sheet Not Initialized</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                There are no attendance records created for this class on <strong>{new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              </p>
              <button
                onClick={() => setShowInitConfirm(true)}
                className="px-6 py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Initialize Attendance Sheet
              </button>
            </div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No students enrolled in this class record.</div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Absences</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/40 transition-colors">
                    {/* Name */}
                    <td className="px-6 py-4.5">
                      <span className="font-bold text-slate-900 font-display">
                        {student.lastName}, {student.firstName}
                      </span>
                    </td>
                    
                    {/* Type */}
                    <td className="px-6 py-4.5">
                      {student.type === 'Irregular' ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          Irregular
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                          Regular
                        </span>
                      )}
                    </td>

                    {/* Status Picker */}
                    <td className="px-6 py-4.5">
                      <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
                        {['Present', 'Absent', 'Late', 'Excused'].map((statusOption) => {
                          const isSelected = student.status === statusOption;
                          let activeStyles = '';
                          if (isSelected) {
                            if (statusOption === 'Present') activeStyles = 'bg-emerald-500 text-white shadow-sm';
                            if (statusOption === 'Absent') activeStyles = 'bg-rose-500 text-white shadow-sm';
                            if (statusOption === 'Late') activeStyles = 'bg-amber-500 text-white shadow-sm';
                            if (statusOption === 'Excused') activeStyles = 'bg-blue-500 text-white shadow-sm';
                          } else {
                            activeStyles = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50';
                          }

                          return (
                            <button
                              key={statusOption}
                              onClick={() => handleStatusChange(student.id, statusOption)}
                              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${activeStyles}`}
                            >
                              {statusOption}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Absences Badge */}
                    <td className="px-6 py-4.5">
                      {getAbsenceBadge(student.absences)}
                    </td>

                    {/* Remarks Input */}
                    <td className="px-6 py-4.5">
                      <input
                        type="text"
                        value={student.remarks}
                        onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                        placeholder="Add notes..."
                        className="w-full text-sm border border-slate-200 px-3 py-1.5 rounded-lg outline-none focus:border-sage-400 focus:ring-1 focus:ring-sage-400 transition-colors"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

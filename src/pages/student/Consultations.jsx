import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  MessageSquare,
  Calendar,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  ChevronDown
} from 'lucide-react';
import { cn } from '../../lib/utils';
import PageHeader from '../../components/layout/PageHeader';
import AcademicPeriodFilter from '../../components/common/AcademicPeriodFilter';
import { fetchAcademicTerms, getActiveAcademicTerm } from '../../lib/termStatus';
import { getCachedData, setCachedData } from '../../lib/dataCache';

export default function Consultations() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedClassId = searchParams.get('class') || '';
  const openedContextClass = useRef('');
  
  const [loading, setLoading] = useState(true);
  const [subjectsList, setSubjectsList] = useState([]);
  
  const [consultationRequests, setConsultationRequests] = useState([]);
  const [consultationFilter, setConsultationFilter] = useState('all');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [consultForm, setConsultForm] = useState({
    classRecordId: '',
    category: 'Grade Clarification',
    schedule: '',
    message: ''
  });
  const [submittingConsult, setSubmittingConsult] = useState(false);
  const [consultFeedback, setConsultFeedback] = useState(null);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [terms, setTerms] = useState([]);
  const [archiveMode, setArchiveMode] = useState(false);
  const [appliedTerm, setAppliedTerm] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const requestSequence = useRef(0);

  // 1. Fetch enrolled subjects
  useEffect(() => {
    async function fetchSubjects() {
      if (!user) return;
      try {
        const activeTerm = getActiveAcademicTerm(terms);
        if (!activeTerm) {
          setSubjectsList([]);
          return;
        }
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(subject_id, code, name)')
          .eq('student_id', user.id);
        
        const subjectIds = [...new Set((enrolls || []).map(e => e.subject_id).filter(Boolean))];
        const sectionIds = [...new Set((enrolls || []).map(e => e.section_id).filter(Boolean))];

        const classSelect = 'class_record_id,subject_id,section_id,faculty_id,term_id,school_year,semester,sections(name),faculty:users!faculty_id(first_name,last_name,email)';
        let crs = [];
        if (subjectIds.length > 0 && sectionIds.length > 0) {
          const [exactResult, legacyResult] = await Promise.all([
            supabase.from('class_records').select(classSelect)
              .in('subject_id', subjectIds).in('section_id', sectionIds)
              .eq('status', 'active').eq('term_id', activeTerm.term_id),
            supabase.from('class_records').select(classSelect)
              .in('subject_id', subjectIds).in('section_id', sectionIds)
              .eq('status', 'active').is('term_id', null)
              .eq('school_year', activeTerm.school_year).eq('semester', activeTerm.semester)
          ]);
          if (exactResult.error) throw exactResult.error;
          if (legacyResult.error) throw legacyResult.error;
          crs = [...(exactResult.data || []), ...(legacyResult.data || [])];
        }

        // Only the student's own classes: each enrollment matches one class by
        // subject AND section (other sections of the same subject are excluded).
        const enrolledPairs = new Set((enrolls || []).map(e => `${e.subject_id}:${e.section_id}`));
        const ownClasses = (crs || []).filter(cr => enrolledPairs.has(`${cr.subject_id}:${cr.section_id}`));

        const mappedSubjects = ownClasses.map(cr => {
          const subj = enrolls?.find(e => e.subject_id === cr.subject_id && e.section_id === cr.section_id)?.subjects;
          return {
            class_record_id: cr.class_record_id,
            faculty_id: cr.faculty_id,
            code: subj?.code || 'Unknown',
            name: subj?.name || 'Unknown',
            section: cr.sections?.name || '',
            instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA'
          };
        });

        setSubjectsList(mappedSubjects);
      } catch (err) {
        console.error('Error fetching subjects:', err);
      }
    }
    fetchSubjects();
  }, [user, terms]);

  // Contextual links from My Subjects retain the selected class and open the
  // existing request form once that class is available to the student.
  useEffect(() => {
    if (archiveMode || !requestedClassId || !subjectsList.some(subject => subject.class_record_id === requestedClassId)) return;
    if (openedContextClass.current === requestedClassId) return;
    openedContextClass.current = requestedClassId;
    setConsultForm(previous => ({ ...previous, classRecordId: requestedClassId }));
    setIsConsultModalOpen(true);
  }, [archiveMode, requestedClassId, subjectsList]);

  // 2. Fetch consultations
  const fetchConsultationRequests = useCallback(async (term, { archive = false } = {}) => {
    if (!user || !term) return false;
    const requestId = ++requestSequence.current;
    const cacheKey = `student_consultations_${user.id}_${archive ? 'archive' : 'current'}_${term.term_id}`;
    const cached = getCachedData(cacheKey, 180000);
    if (cached) {
      setConsultationRequests(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setArchiveError('');
    try {
      const classFields = 'class_record_id, term_id, school_year, semester';
      const [exactClasses, legacyClasses] = await Promise.all([
        supabase.from('class_records').select(classFields).eq('term_id', term.term_id),
        supabase
          .from('class_records')
          .select(classFields)
          .is('term_id', null)
          .eq('school_year', term.school_year)
          .eq('semester', term.semester)
      ]);
      if (exactClasses.error) throw exactClasses.error;
      if (legacyClasses.error) throw legacyClasses.error;
      const classRecordIds = [...(exactClasses.data || []), ...(legacyClasses.data || [])]
        .map(record => record.class_record_id);

      const requestFields = `
          consultation_id,
          class_record_id,
          concern_category,
          preferred_schedule,
          message,
          status,
          faculty_notes,
          scheduled_at,
          consultation_mode,
          meeting_link,
          onsite_location,
          schedule_acknowledged_at,
          created_at,
          class_records:class_record_id (
            term_id,
            school_year,
            semester,
            subjects:subject_id (code, name)
          ),
          faculty:users!faculty_id (
            first_name,
            last_name,
            email
          )
        `;

      let loadedRequests = [];
      if (archive) {
        if (classRecordIds.length > 0) {
          const { data, error } = await supabase
            .from('student_consultation_requests')
            .select(requestFields)
            .eq('student_id', user.id)
            .in('class_record_id', classRecordIds)
            .in('status', ['completed', 'declined', 'cancelled'])
            .order('created_at', { ascending: false });
          if (error) throw error;
          loadedRequests = data || [];
        }
      } else {
        const queries = [
          supabase
            .from('student_consultation_requests')
            .select(requestFields)
            .eq('student_id', user.id)
            .in('status', ['pending', 'scheduled'])
            .order('created_at', { ascending: false })
        ];
        if (classRecordIds.length > 0) {
          queries.push(
            supabase
              .from('student_consultation_requests')
              .select(requestFields)
              .eq('student_id', user.id)
              .in('class_record_id', classRecordIds)
              .order('created_at', { ascending: false })
          );
        }
        const results = await Promise.all(queries);
        const failed = results.find(result => result.error);
        if (failed?.error) throw failed.error;
        const unique = new Map();
        results.flatMap(result => result.data || []).forEach(item => unique.set(item.consultation_id, item));
        loadedRequests = [...unique.values()].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
      }

      if (requestId !== requestSequence.current) return false;
      setConsultationRequests(loadedRequests);
      setCachedData(cacheKey, loadedRequests);
      return true;
    } catch (err) {
      console.error('Could not load consultation requests:', err);
      if (requestId === requestSequence.current && archive) {
        setArchiveError(err.message || 'Archived consultations could not be loaded. Please try again.');
      }
      return false;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function initializePeriod() {
      setLoading(true);
      try {
        const loadedTerms = await fetchAcademicTerms();
        if (cancelled) return;
        setTerms(loadedTerms);
        const requestedTermId = searchParams.get('archiveTerm');
        const requestedTerm = loadedTerms.find(term => !term.is_active && term.term_id === requestedTermId) || null;
        if (requestedTerm) {
          setArchiveMode(true);
          setAppliedTerm(requestedTerm);
          await fetchConsultationRequests(requestedTerm, { archive: true });
          return;
        }
        const activeTerm = getActiveAcademicTerm(loadedTerms);
        setArchiveMode(false);
        setAppliedTerm(null);
        if (activeTerm) await fetchConsultationRequests(activeTerm);
        else setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setArchiveError(err.message || 'Academic periods could not be loaded.');
          setLoading(false);
        }
      }
    }

    initializePeriod();
    return () => {
      cancelled = true;
      requestSequence.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fetchConsultationRequests]);

  const handleArchiveModeChange = async (nextArchiveMode) => {
    setArchiveError('');
    setArchiveMode(nextArchiveMode);
    setIsConsultModalOpen(false);
    if (nextArchiveMode) return;
    requestSequence.current += 1;
    setAppliedTerm(null);
    setConsultationFilter('all');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('archiveTerm');
    setSearchParams(nextParams, { replace: true });
    const activeTerm = getActiveAcademicTerm(terms);
    if (activeTerm) await fetchConsultationRequests(activeTerm);
  };

  const handleArchiveLoad = async (term) => {
    if (!term) return;
    const succeeded = await fetchConsultationRequests(term, { archive: true });
    if (!succeeded) return;
    setAppliedTerm(term);
    setConsultationFilter('all');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('archiveTerm', term.term_id);
    setSearchParams(nextParams, { replace: true });
  };

  // The faculty's decision is final, so this records only that the student has seen it.
  const handleAcknowledgeSchedule = async (consultationId) => {
    if (!user || archiveMode) return;
    setAcknowledgingId(consultationId);
    const acknowledgedAt = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('student_consultation_requests')
        .update({ schedule_acknowledged_at: acknowledgedAt, schedule_acknowledged_by: user.id })
        .eq('consultation_id', consultationId);
      if (error) throw error;

      setConsultationRequests(prev => prev.map(item => (
        item.consultation_id === consultationId
          ? { ...item, schedule_acknowledged_at: acknowledgedAt }
          : item
      )));
    } catch (err) {
      console.error('Could not acknowledge consultation schedule:', err);
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleSubmitConsultation = async (e) => {
    e.preventDefault();
    if (archiveMode || !user || !consultForm.classRecordId || !consultForm.message.trim() || !consultForm.schedule.trim()) return;
    setSubmittingConsult(true);
    setConsultFeedback(null);

    try {
      const selectedSub = subjectsList.find(s => s.class_record_id === consultForm.classRecordId);
      if (!selectedSub) {
        throw new Error("Invalid subject selection.");
      }

      const { data, error } = await supabase
        .from('student_consultation_requests')
        .insert({
          student_id: user.id,
          faculty_id: selectedSub.faculty_id,
          class_record_id: selectedSub.class_record_id,
          concern_category: consultForm.category,
          preferred_schedule: consultForm.schedule,
          message: consultForm.message,
          status: 'pending'
        })
        .select(`
          consultation_id,
          class_record_id,
          concern_category,
          preferred_schedule,
          message,
          status,
          faculty_notes,
          scheduled_at,
          consultation_mode,
          meeting_link,
          onsite_location,
          schedule_acknowledged_at,
          created_at,
          class_records:class_record_id (
            subjects:subject_id (code, name)
          ),
          faculty:users!faculty_id (
            first_name,
            last_name,
            email
          )
        `)
        .single();

      if (error) throw error;

      setConsultationRequests(prev => [data, ...prev]);
      
      try {
        localStorage.setItem(`sage_consultations_${user.id}`, JSON.stringify([data, ...consultationRequests]));
      } catch (e) {
        console.warn('Could not cache consultation requests:', e);
      }

      setConsultFeedback({ type: 'success', message: 'Consultation request sent successfully.' });
      setConsultForm({ classRecordId: subjectsList[0]?.class_record_id || '', category: 'Grade Clarification', schedule: '', message: '' });
      setTimeout(() => {
        setIsConsultModalOpen(false);
        setConsultFeedback(null);
      }, 1500);

    } catch (err) {
      console.error(err);
      setConsultFeedback({ type: 'error', message: err.message || 'Failed to submit request.' });
    } finally {
      setSubmittingConsult(false);
    }
  };

  const filteredRequests = consultationFilter === 'all' 
    ? consultationRequests 
    : consultationRequests.filter(r => r.status === consultationFilter);

  const groupedRequests = filteredRequests.reduce((acc, req) => {
    const code = req.class_records?.subjects?.code || 'General';
    if (!acc[code]) acc[code] = { name: req.class_records?.subjects?.name || 'Academic Support', items: [] };
    acc[code].items.push(req);
    return acc;
  }, {});

  if (loading && terms.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600"></div>
          <p className="text-sm font-medium text-slate-500">Loading Consultations...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader 
        title="Consultations"
        breadcrumb="Student Portal"
      >
        {!archiveMode && (
          <button
            onClick={() => {
              setConsultForm({
                classRecordId: subjectsList[0]?.class_record_id || '',
                category: 'Grade Clarification',
                schedule: '',
                message: ''
              });
              setConsultFeedback(null);
              setIsConsultModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Consultation</span>
          </button>
        )}
      </PageHeader>
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
        <AcademicPeriodFilter
          terms={terms}
          archiveMode={archiveMode}
          appliedTerm={appliedTerm}
          loading={loading}
          error={archiveError}
          onModeChange={handleArchiveModeChange}
          onLoad={handleArchiveLoad}
          onRetry={handleArchiveLoad}
        />

      {(!archiveMode || appliedTerm) && (
      <>
      {/* Consultations Header Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-sage-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-md border border-amber-800/50">
            Direct Faculty Consultations
          </span>
          <h3 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight text-white mt-1.5">
            1-on-1 Academic Advising & Mentorship
          </h3>
          <p className="text-xs text-slate-300 max-w-xl mt-1 leading-relaxed">
            Request direct consultation with your subject professors regarding grades, catch-up action items, exam feedback, or attendance advisories.
          </p>
        </div>
      </div>

      {/* Consultation Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Requests</span>
          <span className="text-2xl font-extrabold font-mono text-slate-900 mt-1 block">
            {consultationRequests.length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Review</span>
          <span className="text-2xl font-extrabold font-mono text-amber-700 mt-1 block">
            {consultationRequests.filter(r => r.status === 'pending').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Scheduled</span>
          <span className="text-2xl font-extrabold font-mono text-indigo-700 mt-1 block">
            {consultationRequests.filter(r => r.status === 'scheduled').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
          <span className="text-2xl font-extrabold font-mono text-emerald-700 mt-1 block">
            {consultationRequests.filter(r => r.status === 'completed').length}
          </span>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        <div className="flex gap-2 pb-3 border-b border-slate-200">
          {(archiveMode ? ['all', 'completed', 'declined', 'cancelled'] : ['all', 'pending', 'scheduled', 'completed', 'declined']).map(status => (
            <button
              key={status}
              onClick={() => setConsultationFilter(status)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-bold capitalize transition-colors cursor-pointer",
                consultationFilter === status 
                  ? "bg-sage-600 text-white" 
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {status}
            </button>
          ))}
        </div>

        {(() => {
          if (filteredRequests.length === 0) {
            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto shadow-xs space-y-3 mt-4">
                <div className="w-12 h-12 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900 font-display">No {consultationFilter !== 'all' ? consultationFilter : ''} Requests</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {archiveMode ? 'No completed, declined, or cancelled consultations were found for this academic period.' : 'Have questions regarding your grades, catch-up tasks, or exam performance? Reach out to your instructor directly for a 1-on-1 consultation session.'}
                </p>
                {!archiveMode && (
                  <button
                    onClick={() => {
                      setConsultForm({
                        classRecordId: subjectsList[0]?.class_record_id || '',
                        category: 'Grade Clarification',
                        schedule: '',
                        message: ''
                      });
                      setConsultFeedback(null);
                      setIsConsultModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Request Consultation Now</span>
                  </button>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {Object.entries(groupedRequests).map(([code, group]) => {
                const isExpanded = expandedSubjects[code] !== false; // Default to true
                return (
                  <div key={code} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <button
                      onClick={() => setExpandedSubjects(prev => ({ ...prev, [code]: !isExpanded }))}
                      className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{code}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs font-semibold text-slate-700">{group.name}</span>
                        <span className="ml-2 px-2 py-0.5 bg-sage-100 text-sage-700 text-[10px] font-bold rounded-full">
                          {group.items.length}
                        </span>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", !isExpanded && "-rotate-90")} />
                    </button>
                    
                    {isExpanded && (
                      <div className="p-4 space-y-4 bg-slate-50/50">
                        {group.items.map((req) => (
                          <div 
                            key={req.consultation_id} 
                            className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div>
                                <div className="text-[11px] text-slate-500">
                                  Instructor: <strong>Prof. {req.faculty?.first_name} {req.faculty?.last_name}</strong>
                                  {req.faculty?.email && ` (${req.faculty.email})`}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {req.concern_category}
                                </span>
                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                  req.status === 'pending' && "bg-amber-50 text-amber-800 border-amber-200",
                                  req.status === 'scheduled' && "bg-indigo-50 text-indigo-800 border-indigo-200",
                                  req.status === 'completed' && "bg-emerald-50 text-emerald-800 border-emerald-200",
                                  ['declined', 'cancelled'].includes(req.status) && "bg-rose-50 text-rose-800 border-rose-200"
                                )}>
                                  {req.status === 'pending' ? 'Pending Confirmation' : req.status}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-medium">
                                <Calendar className="w-3.5 h-3.5 text-sage-600 shrink-0" />
                                <span>Preferred Schedule: <strong>{req.preferred_schedule}</strong></span>
                              </div>

                              {req.scheduled_at && (
                                <div className="p-3 bg-sage-50 border border-sage-200 rounded-lg space-y-2">
                                  <span className="font-bold text-sage-950 block text-[10px] uppercase tracking-wider">Confirmed Schedule</span>
                                  <p className="text-sage-900 font-semibold">
                                    {new Date(req.scheduled_at).toLocaleString()}
                                    {req.consultation_mode === 'online' && ' · Online'}
                                    {req.consultation_mode === 'face_to_face' && ' · Face-to-Face'}
                                  </p>
                                  {req.consultation_mode === 'online' && req.meeting_link && (
                                    <a href={req.meeting_link} target="_blank" rel="noopener noreferrer" className="text-sage-700 underline break-all">
                                      {req.meeting_link}
                                    </a>
                                  )}
                                  {req.consultation_mode === 'face_to_face' && req.onsite_location && (
                                    <p className="text-sage-800">Location: {req.onsite_location}</p>
                                  )}

                                  {req.schedule_acknowledged_at ? (
                                    <p className="flex items-center gap-1.5 text-[10px] font-bold text-sage-700">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      You confirmed you have seen this schedule.
                                    </p>
                                  ) : archiveMode ? (
                                    <p className="text-[10px] font-bold text-slate-500">Archived schedule · read-only</p>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleAcknowledgeSchedule(req.consultation_id)}
                                      disabled={acknowledgingId === req.consultation_id}
                                      className="px-3 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 text-white text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      {acknowledgingId === req.consultation_id ? 'Saving…' : 'I have seen this schedule'}
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-slate-700 leading-relaxed">
                                <span className="font-bold text-slate-800 block text-[10px] uppercase tracking-wider mb-0.5">Student Notes / Question:</span>
                                {req.message}
                              </div>

                              {req.faculty_notes && (
                                <div className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-lg text-emerald-900 leading-relaxed">
                                  <span className="font-bold text-emerald-950 block text-[10px] uppercase tracking-wider mb-0.5">Professor Feedback & Meeting Details:</span>
                                  {req.faculty_notes}
                                </div>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-400 font-mono text-right pt-1">
                              Submitted on {new Date(req.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      </>
      )}

      {/* New Consultation Modal */}
      {!archiveMode && isConsultModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 my-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sage-600" />
                <span>Request Direct Faculty Consultation</span>
              </h3>
              <button
                onClick={() => setIsConsultModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitConsultation} className="p-5 space-y-4 text-xs font-sans">
              {consultFeedback && (
                <div className={cn(
                  "p-3 rounded-xl text-xs flex items-center gap-2",
                  consultFeedback.type === 'success' 
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-700"
                )}>
                  {consultFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{consultFeedback.message}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Select Course & Instructor <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={consultForm.classRecordId}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, classRecordId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-sage-600"
                >
                  {subjectsList.map((s) => {
                    // Name the section only when the same subject is listed more than once.
                    const repeated = subjectsList.filter(other => other.code === s.code).length > 1;
                    return (
                      <option key={s.class_record_id} value={s.class_record_id}>
                        {s.code} - {s.name} ({repeated && s.section ? `${s.section} · ` : ''}{s.instructor})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Concern Category <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={consultForm.category}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-sage-600"
                >
                  <option value="Grade Clarification">Grade Clarification & Computation</option>
                  <option value="Catch-Up Plan Guidance">Catch-Up Plan & Progress Guidance</option>
                  <option value="Exam & Assessment Review">Exam & Assessment Review</option>
                  <option value="Attendance & FDA Advisory">Attendance / FDA Advisory Inquiry</option>
                  <option value="General Academic Counseling">General Academic Counseling</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Preferred Consultation Schedule <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={consultForm.schedule}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, schedule: e.target.value }))}
                  placeholder="e.g. Wednesday 2:00 PM - 3:00 PM, or during faculty office hours"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs text-slate-900 focus:outline-none focus:border-sage-600"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Details of Academic Concern <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={consultForm.message}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Explain your specific concern or topic you would like to discuss with your professor..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs text-slate-900 focus:outline-none focus:border-sage-600 resize-none leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConsultModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingConsult || !consultForm.message.trim() || !consultForm.schedule.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 active:bg-sage-800 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingConsult ? 'Submitting...' : 'Send Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

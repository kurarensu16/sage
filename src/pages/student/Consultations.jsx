import React, { useState, useEffect, useCallback } from 'react';
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

export default function Consultations() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [subjectsList, setSubjectsList] = useState([]);
  
  const [consultationRequests, setConsultationRequests] = useState([]);
  const [consultationFilter, setConsultationFilter] = useState('all');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [consultForm, setConsultForm] = useState({
    subjectCode: '',
    category: 'Grade Clarification',
    schedule: '',
    message: ''
  });
  const [submittingConsult, setSubmittingConsult] = useState(false);
  const [consultFeedback, setConsultFeedback] = useState(null);

  // 1. Fetch enrolled subjects
  useEffect(() => {
    async function fetchSubjects() {
      if (!user) return;
      try {
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(subject_id, code, name)')
          .eq('student_id', user.id);
        
        const subjectIds = enrolls?.map(e => e.subject_id) || [];
        
        const { data: crs } = await supabase
          .from('class_records')
          .select('class_record_id, subject_id, faculty_id, faculty:users!faculty_id(first_name, last_name, email)')
          .in('subject_id', subjectIds)
          .eq('status', 'active');
          
        const mappedSubjects = crs?.map(cr => {
          const subj = enrolls?.find(e => e.subject_id === cr.subject_id)?.subjects;
          return {
            class_record_id: cr.class_record_id,
            faculty_id: cr.faculty_id,
            code: subj?.code || 'Unknown',
            name: subj?.name || 'Unknown',
            instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA'
          };
        }) || [];
        
        setSubjectsList(mappedSubjects);
      } catch (err) {
        console.error('Error fetching subjects:', err);
      }
    }
    fetchSubjects();
  }, [user]);

  // 2. Fetch consultations
  const fetchConsultationRequests = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('student_consultation_requests')
        .select(`
          consultation_id,
          class_record_id,
          concern_category,
          preferred_schedule,
          message,
          status,
          faculty_notes,
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
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        const local = localStorage.getItem(`sage_consultations_${user.id}`);
        setConsultationRequests(local ? JSON.parse(local) : []);
      } else {
        setConsultationRequests(data || []);
      }
    } catch {
      const local = localStorage.getItem(`sage_consultations_${user.id}`);
      setConsultationRequests(local ? JSON.parse(local) : []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConsultationRequests();
  }, [fetchConsultationRequests]);

  const handleSubmitConsultation = async (e) => {
    e.preventDefault();
    if (!user || !consultForm.subjectCode || !consultForm.message.trim() || !consultForm.schedule.trim()) return;
    setSubmittingConsult(true);
    setConsultFeedback(null);

    try {
      const selectedSub = subjectsList.find(s => s.code === consultForm.subjectCode);
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
      setConsultForm({ subjectCode: subjectsList[0]?.code || '', category: 'Grade Clarification', schedule: '', message: '' });
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

  if (loading) {
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
        <button
          onClick={() => {
            setConsultForm({
              subjectCode: subjectsList[0]?.code || '',
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
      </PageHeader>
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
      
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
          {['all', 'pending', 'scheduled', 'completed', 'declined'].map(status => (
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
                  Have questions regarding your grades, catch-up tasks, or exam performance? Reach out to your instructor directly for a 1-on-1 consultation session.
                </p>
                <button
                  onClick={() => {
                    setConsultForm({
                      subjectCode: subjectsList[0]?.code || '',
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
                                  req.status === 'declined' && "bg-rose-50 text-rose-800 border-rose-200"
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

      {/* New Consultation Modal */}
      {isConsultModalOpen && (
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
                  value={consultForm.subjectCode}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, subjectCode: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-sage-600"
                >
                  {subjectsList.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name} ({s.instructor})
                    </option>
                  ))}
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
                  <option value="Catch-Up Plan Guidance">Catch-Up Plan & Milestone Guidance</option>
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

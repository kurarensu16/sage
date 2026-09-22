import { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { logActivity, resolveActorName } from '../../lib/auditLog';

const consultationQuery = `
  consultation_id,
  student_id,
  faculty_id,
  class_record_id,
  concern_category,
  preferred_schedule,
  message,
  status,
  faculty_notes,
  created_at,
  updated_at,
  users:student_id ( first_name, last_name, email, user_number ),
  class_records ( subjects ( code, name ), sections ( name ) )
`;

export default function ConsultationRequests() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [status, setStatus] = useState('scheduled');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRequests() {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('student_consultation_requests')
          .select(consultationQuery)
          .eq('faculty_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRequests(data || []);
      } catch {
        const cached = localStorage.getItem(`sage_consultations_faculty_${user.id}`);
        setRequests(cached ? JSON.parse(cached) : []);
      } finally {
        setLoading(false);
      }
    }

    loadRequests();
  }, [user]);

  const visibleRequests = filter === 'all' ? requests : requests.filter(item => item.status === filter);

  const openRequest = (request) => {
    setSelectedRequest(request);
    setStatus(request.status === 'pending' ? 'scheduled' : request.status);
    setNotes(request.faculty_notes || '');
    setFeedback(null);
  };

  const saveResolution = async (event) => {
    event.preventDefault();
    if (!selectedRequest) return;
    setSaving(true);
    const updatedPayload = {
      status,
      faculty_notes: notes.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('student_consultation_requests')
        .update(updatedPayload)
        .eq('consultation_id', selectedRequest.consultation_id);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      setRequests(prev => prev.map(item => item.consultation_id === selectedRequest.consultation_id ? { ...item, ...updatedPayload } : item));
      await dispatchNotifications([{
        recipient_id: selectedRequest.student_id,
        type: 'system',
        message: `Consultation update from ${actorName}: Status is now "${status}".${notes.trim() ? ` Notes: ${notes.trim()}` : ''}`
      }]);
      await logActivity({
        action: 'Resolved Consultation Request',
        message: `${actorName} updated a consultation request to "${status}".`,
        actor: actorName
      });
      setFeedback({ type: 'success', message: `Consultation request marked as ${status}.` });
      setTimeout(() => setSelectedRequest(null), 800);
    } catch {
      const updated = requests.map(item => item.consultation_id === selectedRequest.consultation_id ? { ...item, ...updatedPayload } : item);
      setRequests(updated);
      localStorage.setItem(`sage_consultations_faculty_${user.id}`, JSON.stringify(updated));
      setFeedback({ type: 'success', message: `Consultation marked as ${status} (cached locally).` });
      setTimeout(() => setSelectedRequest(null), 800);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={7} />;

  return (
    <>
      <PageHeader title="Consultation Requests" breadcrumb="Faculty Portal" />
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-6xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-sage-600" /><h2 className="text-base font-bold text-slate-900 font-display">Student Consultation Inbox</h2></div>
              <p className="text-xs text-slate-500 mt-1">Review requests, schedule meetings, and send advising notes.</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'pending', 'scheduled', 'completed', 'declined'].map(item => (
                <button key={item} onClick={() => setFilter(item)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold capitalize cursor-pointer ${filter === item ? 'bg-sage-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>
              ))}
            </div>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="p-14 text-center"><MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-700">No consultation requests found</p><p className="text-xs text-slate-500 mt-1">New student requests will appear here.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleRequests.map(request => {
                const studentName = request.users ? `${request.users.first_name} ${request.users.last_name}` : 'Student';
                const subject = request.class_records?.subjects?.code || 'Course';
                return (
                  <div key={request.consultation_id} className="p-4 sm:p-5 hover:bg-slate-50/70">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-900">{studentName}</h3><span className="text-[10px] font-mono text-slate-400">{subject}</span></div>
                        <p className="text-[11px] text-slate-500 mt-1">{request.concern_category} · Preferred: {request.preferred_schedule || 'Not specified'}</p>
                        <p className="text-xs text-slate-700 mt-3">“{request.message}”</p>
                        {request.faculty_notes && <p className="text-[11px] text-slate-500 mt-2">Faculty notes: {request.faculty_notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0"><span className="px-2 py-1 rounded-full text-[10px] font-bold capitalize bg-slate-100 text-slate-700">{request.status}</span><button onClick={() => openRequest(request)} className="px-3 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-[10px] font-semibold cursor-pointer">Respond</button></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h3 className="text-base font-bold text-slate-900 font-display">Respond to Consultation Request</h3><p className="text-xs text-slate-500 mt-0.5">Set the meeting status and provide advising feedback.</p></div><button onClick={() => setSelectedRequest(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button></div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"><p className="font-bold text-slate-900">{selectedRequest.users?.first_name} {selectedRequest.users?.last_name}</p><p className="text-slate-600">{selectedRequest.class_records?.subjects?.code} · {selectedRequest.concern_category}</p><p className="text-slate-700 italic">“{selectedRequest.message}”</p></div>
            <form onSubmit={saveResolution} className="space-y-4"><div className="grid grid-cols-3 gap-2">{['scheduled', 'completed', 'declined'].map(item => <button key={item} type="button" onClick={() => setStatus(item)} className={`py-2 px-2 text-xs font-bold rounded-xl border capitalize cursor-pointer ${status === item ? 'border-sage-500 bg-sage-50 text-sage-700 ring-2 ring-sage-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{item}</button>)}</div><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add meeting details or advising notes..." className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none resize-none" />{feedback && <div className="p-2.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{feedback.message}</div>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setSelectedRequest(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer">{saving ? 'Saving...' : 'Save Response'}</button></div></form>
          </div>
        </div>
      )}
    </>
  );
}

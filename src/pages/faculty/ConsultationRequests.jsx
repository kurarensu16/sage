import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import AcademicPeriodFilter from '../../components/common/AcademicPeriodFilter';
import { fetchAcademicTerms, getActiveAcademicTerm } from '../../lib/termStatus';
import { getCachedData, setCachedData } from '../../lib/dataCache';

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
  scheduled_at,
  consultation_mode,
  meeting_link,
  onsite_location,
  schedule_acknowledged_at,
  created_at,
  updated_at,
  users:student_id ( first_name, last_name, email, user_number ),
  class_records ( term_id, school_year, semester, subjects ( code, name ), sections ( name ) )
`;

const MODE_LABELS = { online: 'Online', face_to_face: 'Face-to-Face' };

// <input type="datetime-local"> needs a local wall-clock string, not an ISO instant.
const toLocalInputValue = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function ConsultationRequests() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [status, setStatus] = useState('scheduled');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [mode, setMode] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [onsiteLocation, setOnsiteLocation] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState([]);
  const [archiveMode, setArchiveMode] = useState(Boolean(searchParams.get('archiveTerm')));
  const [appliedTerm, setAppliedTerm] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const requestSequence = useRef(0);

  const loadRequests = async (term, { archive = false } = {}) => {
    if (!user?.id || !term?.term_id) return false;
    const sequence = ++requestSequence.current;
    const cacheKey = `faculty_consultations_${user.id}_${archive ? 'archive' : 'current'}_${term.term_id}`;
    setLoading(true);
    setArchiveError('');
    try {
      let result = getCachedData(cacheKey, 2 * 60 * 1000);
      if (!result) {
        const classSelect = 'class_record_id,term_id,school_year,semester';
        const [{ data: exact, error: exactError }, { data: legacy, error: legacyError }] = await Promise.all([
          supabase.from('class_records').select(classSelect).eq('faculty_id', user.id).eq('term_id', term.term_id),
          supabase.from('class_records').select(classSelect).eq('faculty_id', user.id).is('term_id', null)
            .eq('school_year', term.school_year).eq('semester', term.semester)
        ]);
        if (exactError) throw exactError;
        if (legacyError) throw legacyError;
        const classIds = [...(exact || []), ...(legacy || [])].map(item => item.class_record_id);
        const safeClassIds = classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000'];
        if (archive) {
          const { data, error } = await supabase.from('student_consultation_requests').select(consultationQuery)
            .eq('faculty_id', user.id).in('class_record_id', safeClassIds)
            .in('status', ['completed', 'declined', 'cancelled']).order('created_at', { ascending: false });
          if (error) throw error;
          result = data || [];
        } else {
          const [{ data: open, error: openError }, { data: current, error: currentError }] = await Promise.all([
            supabase.from('student_consultation_requests').select(consultationQuery)
              .eq('faculty_id', user.id).in('status', ['pending', 'scheduled']).order('created_at', { ascending: false }),
            supabase.from('student_consultation_requests').select(consultationQuery)
              .eq('faculty_id', user.id).in('class_record_id', safeClassIds).order('created_at', { ascending: false })
          ]);
          if (openError) throw openError;
          if (currentError) throw currentError;
          result = [...new Map([...(open || []), ...(current || [])].map(item => [item.consultation_id, item])).values()]
            .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
        }
        setCachedData(cacheKey, result);
      }
      if (sequence !== requestSequence.current) return false;
      setRequests(result);
      if (archive) {
        setAppliedTerm(term);
        setFilter('all');
        setSearchParams(previous => {
          const next = new URLSearchParams(previous);
          next.set('archiveTerm', term.term_id);
          return next;
        }, { replace: true });
      }
      return true;
    } catch (error) {
      if (sequence === requestSequence.current) {
        console.error('Consultation load failed:', error);
        setArchiveError('The selected consultation history could not be loaded. Please retry.');
      }
      return false;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    async function initialize() {
      if (!user?.id) return;
      try {
        const availableTerms = await fetchAcademicTerms();
        setTerms(availableTerms);
        const requested = availableTerms.find(term => term.term_id === searchParams.get('archiveTerm'));
        if (requested && !requested.is_active) {
          setArchiveMode(true);
          await loadRequests(requested, { archive: true });
        } else {
          const active = getActiveAcademicTerm(availableTerms);
          setArchiveMode(false);
          if (active) await loadRequests(active);
          else setLoading(false);
        }
      } catch (error) {
        console.error('Consultation periods failed to load:', error);
        setArchiveError('Academic periods could not be loaded.');
        setLoading(false);
      }
    }
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleModeChange = async (useArchive) => {
    requestSequence.current += 1;
    setArchiveMode(useArchive);
    setArchiveError('');
    setSelectedRequest(null);
    if (useArchive) {
      setAppliedTerm(null);
      setRequests([]);
      setLoading(false);
      setSearchParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete('archiveTerm');
        return next;
      }, { replace: true });
    } else {
      setAppliedTerm(null);
      setSearchParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete('archiveTerm');
        return next;
      }, { replace: true });
      const active = getActiveAcademicTerm(terms);
      if (active) await loadRequests(active);
    }
  };

  const handleArchiveLoad = async (term) => {
    if (term) await loadRequests(term, { archive: true });
  };

  const visibleRequests = filter === 'all' ? requests : requests.filter(item => item.status === filter);

  const openRequest = (request) => {
    if (archiveMode) return;
    setSelectedRequest(request);
    setStatus(request.status === 'pending' ? 'scheduled' : request.status);
    setNotes(request.faculty_notes || '');
    setScheduledAt(toLocalInputValue(request.scheduled_at));
    setMode(request.consultation_mode || '');
    setMeetingLink(request.meeting_link || '');
    setOnsiteLocation(request.onsite_location || '');
    setFeedback(null);
  };

  const saveResolution = async (event) => {
    event.preventDefault();
    if (archiveMode || !selectedRequest) return;

    if (status === 'scheduled' && (!scheduledAt || !mode)) {
      setFeedback({ type: 'error', message: 'Set both a date and time and a consultation mode before scheduling.' });
      return;
    }

    setSaving(true);
    const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
    // A changed schedule invalidates an earlier acknowledgment, otherwise the student
    // would see "Acknowledged" next to a date they never saw.
    const scheduleChanged = scheduledIso !== (selectedRequest.scheduled_at || null)
      || (mode || null) !== (selectedRequest.consultation_mode || null);

    const updatedPayload = {
      status,
      faculty_notes: notes.trim(),
      scheduled_at: scheduledIso,
      consultation_mode: mode || null,
      meeting_link: meetingLink.trim() || null,
      onsite_location: onsiteLocation.trim() || null,
      updated_at: new Date().toISOString()
    };
    if (scheduleChanged) {
      updatedPayload.schedule_acknowledged_at = null;
      updatedPayload.schedule_acknowledged_by = null;
    }

    try {
      const { error } = await supabase
        .from('student_consultation_requests')
        .update(updatedPayload)
        .eq('consultation_id', selectedRequest.consultation_id);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      setRequests(prev => prev.map(item => item.consultation_id === selectedRequest.consultation_id ? { ...item, ...updatedPayload } : item));

      const scheduleSentence = scheduledIso
        ? ` Scheduled for ${new Date(scheduledIso).toLocaleString()}${mode ? ` (${MODE_LABELS[mode]})` : ''}.`
        : '';
      await dispatchNotifications([{
        recipient_id: selectedRequest.student_id,
        type: 'system',
        message: `Consultation update from ${actorName}: Status is now "${status}".${scheduleSentence}${notes.trim() ? ` Notes: ${notes.trim()}` : ''}`
      }]);
      await logActivity(
        'Resolved Consultation Request',
        `${actorName} updated a consultation request to "${status}".${scheduleSentence}`,
        actorName
      );
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

  if (loading && terms.length === 0) return <TableSkeleton rows={7} />;

  return (
    <>
      <PageHeader title="Consultation Requests" breadcrumb="Faculty Portal" />
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5">
        <AcademicPeriodFilter
          terms={terms}
          archiveMode={archiveMode}
          appliedTerm={appliedTerm}
          loading={loading}
          error={archiveError}
          onModeChange={handleModeChange}
          onLoad={handleArchiveLoad}
          onRetry={handleArchiveLoad}
        />
        {archiveMode && !appliedTerm ? null : (
        <div className="max-w-6xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-sage-600" /><h2 className="text-base font-bold text-slate-900 font-display">Student Consultation Inbox</h2></div>
              <p className="text-xs text-slate-500 mt-1">{archiveMode ? 'Review completed consultation history for the loaded academic period.' : 'Review requests, schedule meetings, and send advising notes.'}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(archiveMode ? ['all', 'completed', 'declined', 'cancelled'] : ['all', 'pending', 'scheduled', 'completed', 'declined']).map(item => (
                <button key={item} onClick={() => setFilter(item)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold capitalize cursor-pointer ${filter === item ? 'bg-sage-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>
              ))}
            </div>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="p-14 text-center"><MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-700">No consultation requests found</p><p className="text-xs text-slate-500 mt-1">{archiveMode ? 'No completed, declined, or cancelled consultations were found for this period.' : 'New student requests will appear here.'}</p></div>
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
                        {request.scheduled_at && (
                          <p className="text-[11px] font-semibold text-sage-700 mt-1">
                            Set for {new Date(request.scheduled_at).toLocaleString()}
                            {request.consultation_mode ? ` · ${MODE_LABELS[request.consultation_mode]}` : ''}
                            {request.schedule_acknowledged_at ? ' · acknowledged by student' : ' · awaiting student acknowledgment'}
                          </p>
                        )}
                        <p className="text-xs text-slate-700 mt-3">“{request.message}”</p>
                        {request.faculty_notes && <p className="text-[11px] text-slate-500 mt-2">Faculty notes: {request.faculty_notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0"><span className="px-2 py-1 rounded-full text-[10px] font-bold capitalize bg-slate-100 text-slate-700">{request.status}</span>{archiveMode ? <span className="text-[10px] font-semibold text-slate-400">Read-only</span> : <button onClick={() => openRequest(request)} className="px-3 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-[10px] font-semibold cursor-pointer">Respond</button>}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {!archiveMode && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h3 className="text-base font-bold text-slate-900 font-display">Respond to Consultation Request</h3><p className="text-xs text-slate-500 mt-0.5">Set the meeting status and provide advising feedback.</p></div><button onClick={() => setSelectedRequest(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button></div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"><p className="font-bold text-slate-900">{selectedRequest.users?.first_name} {selectedRequest.users?.last_name}</p><p className="text-slate-600">{selectedRequest.class_records?.subjects?.code} · {selectedRequest.concern_category}</p><p className="text-slate-700 italic">“{selectedRequest.message}”</p></div>
            <form onSubmit={saveResolution} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {['scheduled', 'completed', 'declined'].map(item => (
                  <button key={item} type="button" onClick={() => setStatus(item)} className={`py-2 px-2 text-xs font-bold rounded-xl border capitalize cursor-pointer ${status === item ? 'border-sage-500 bg-sage-50 text-sage-700 ring-2 ring-sage-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{item}</button>
                ))}
              </div>

              {status === 'scheduled' && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
                  <p className="text-[11px] text-slate-500">
                    The student requested <strong className="text-slate-700">{selectedRequest.preferred_schedule || 'no particular time'}</strong>. Your decision below is what they are notified of.
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Date &amp; Time <span className="text-rose-500">*</span></label>
                    <input
                      type="datetime-local"
                      required
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Mode <span className="text-rose-500">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(MODE_LABELS).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setMode(value)}
                          className={`py-2 px-2 text-xs font-bold rounded-xl border cursor-pointer ${mode === value ? 'border-sage-500 bg-sage-50 text-sage-700 ring-2 ring-sage-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mode === 'online' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Meeting Link <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                      <input
                        type="url"
                        value={meetingLink}
                        onChange={(event) => setMeetingLink(event.target.value)}
                        placeholder="https://..."
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none"
                      />
                    </div>
                  )}

                  {mode === 'face_to_face' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Location <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                      <input
                        type="text"
                        value={onsiteLocation}
                        onChange={(event) => setOnsiteLocation(event.target.value)}
                        placeholder="e.g. Faculty Room, 2nd Floor"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add advising notes..." className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none resize-none" />
              {feedback && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold border ${feedback.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {feedback.message}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSelectedRequest(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer">{saving ? 'Saving...' : 'Save Response'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

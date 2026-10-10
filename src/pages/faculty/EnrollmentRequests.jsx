import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getPendingJoinRequests, resolveJoinRequest } from '../../lib/classRoomService';
import { FOLLOWUP_MILESTONE_LABELS } from '../../lib/evaluationTracking';

// Milestones listed in posting order; the latest one posted is named in the late-join hint.
const MILESTONE_ORDER = ['midterm_rating', 'tentative_final_rating', 'semestral_grade'];

export default function EnrollmentRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [postedByClass, setPostedByClass] = useState({});
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRequests = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data: classes, error: classesError } = await supabase
        .from('class_records')
        .select('class_record_id, subjects ( code, name ), sections ( name )')
        .eq('faculty_id', user.id)
        .eq('status', 'active');
      if (classesError) throw classesError;

      const grouped = await Promise.all((classes || []).map(async cls => {
        const pending = await getPendingJoinRequests(cls.class_record_id);
        return pending.map(request => ({ ...request, classRecord: cls }));
      }));
      const pendingRequests = grouped.flat();
      setRequests(pendingRequests);

      // Late-join hint: which classes with pending requests already have a posted milestone.
      const classIds = [...new Set(pendingRequests.map(request => request.class_record_id))];
      const posted = {};
      await Promise.all(classIds.map(async classRecordId => {
        const { data: rows } = await supabase
          .from('posted_grades')
          .select('grade_period')
          .eq('class_record_id', classRecordId)
          .in('grade_period', MILESTONE_ORDER);
        const periods = new Set((rows || []).map(row => row.grade_period));
        const latest = [...MILESTONE_ORDER].reverse().find(period => periods.has(period));
        if (latest) posted[classRecordId] = FOLLOWUP_MILESTONE_LABELS[latest];
      }));
      setPostedByClass(posted);
    } catch (loadError) {
      console.error('Error loading enrollment requests:', loadError);
      setRequests([]);
      setError('Enrollment requests could not be loaded. Refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const handleResolve = async (request, status) => {
    setResolving(request.request_id);
    setError('');
    setNotice('');
    try {
      await resolveJoinRequest(request.request_id, request.class_record_id, request.student_id, status);
      setRequests(prev => prev.filter(item => item.request_id !== request.request_id));
      const student = request.users || {};
      setNotice(status === 'approved'
        ? `${student.first_name || 'The student'} ${student.last_name || ''} was added to ${request.classRecord?.subjects?.code || 'the class'}.`
        : `The request from ${student.first_name || 'the student'} ${student.last_name || ''} was rejected.`);
    } catch (resolveError) {
      console.error(`Unable to ${status} enrollment request:`, resolveError);
      setError(resolveError.message || `The request could not be ${status}.`);
    } finally {
      setResolving(null);
    }
  };

  if (loading) return <TableSkeleton rows={7} />;

  return (
    <>
      <PageHeader title="Enrollment Requests" breadcrumb="Faculty Portal" />
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-5xl mx-auto space-y-3">
          {notice && <p role="status" className="rounded-xl border border-sage-200 bg-sage-50 p-3 text-sm text-sage-800">{notice}</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-sage-600" /><h2 className="text-base font-bold text-slate-900 font-display">Pending Enrollment Requests</h2></div><p className="text-xs text-slate-500 mt-1">Students who entered your class code wait here until you approve or reject them. Only approved students are added to the roster and gradebook.</p></div>
            {requests.length === 0 ? (
              <div className="p-14 text-center"><ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-700">No pending enrollment requests</p><p className="text-xs text-slate-500 mt-1">New requests will appear here when students use a class join code.</p></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map(request => {
                  const student = request.users || {};
                  const cls = request.classRecord;
                  const busy = resolving === request.request_id;
                  const requestedOn = request.requested_at || request.created_at;
                  const postedMilestone = postedByClass[request.class_record_id];
                  return (
                    <div key={request.request_id} className="p-4 sm:p-5 space-y-3 hover:bg-slate-50/70">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div><p className="text-sm font-bold text-slate-900">{student.last_name}, {student.first_name}</p><p className="text-[11px] text-slate-500 mt-1">{student.user_number || student.email || 'Student'} · Requested {requestedOn ? new Date(requestedOn).toLocaleDateString() : 'recently'}</p><p className="text-xs font-semibold text-sage-700 mt-2">{cls?.subjects?.code} — {cls?.sections?.name}</p></div>
                        <div className="flex items-center gap-2 shrink-0"><button onClick={() => handleResolve(request, 'rejected')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50 cursor-pointer"><X className="h-3.5 w-3.5" /> Reject</button><button onClick={() => handleResolve(request, 'approved')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"><Check className="h-3.5 w-3.5" /> Approve</button></div>
                      </div>
                      {postedMilestone && (
                        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>This class already has a posted {postedMilestone}. If you approve, enter 0 for this student's missing work in posted terms, and replace it when make-up work is completed.</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

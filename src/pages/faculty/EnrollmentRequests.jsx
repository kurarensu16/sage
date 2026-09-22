import { useEffect, useState } from 'react';
import { Check, ClipboardList, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getPendingJoinRequests, resolveJoinRequest } from '../../lib/classRoomService';

export default function EnrollmentRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  const loadRequests = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: classes, error } = await supabase
        .from('class_records')
        .select('class_record_id, subjects ( code, name ), sections ( name )')
        .eq('faculty_id', user.id)
        .eq('status', 'active');
      if (error) throw error;

      const grouped = await Promise.all((classes || []).map(async cls => {
        const pending = await getPendingJoinRequests(cls.class_record_id);
        return pending.map(request => ({ ...request, classRecord: cls }));
      }));
      setRequests(grouped.flat());
    } catch (error) {
      console.error('Error loading enrollment requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const handleResolve = async (request, status) => {
    setResolving(request.request_id);
    try {
      await resolveJoinRequest(request.request_id, request.class_record_id, request.student_id, status);
      setRequests(prev => prev.filter(item => item.request_id !== request.request_id));
    } catch (error) {
      console.error(`Unable to ${status} enrollment request:`, error);
    } finally {
      setResolving(null);
    }
  };

  if (loading) return <TableSkeleton rows={7} />;

  return (
    <>
      <PageHeader title="Enrollment Requests" breadcrumb="Faculty Portal" />
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-sage-600" /><h2 className="text-base font-bold text-slate-900 font-display">Pending Enrollment Requests</h2></div><p className="text-xs text-slate-500 mt-1">Review students requesting to join your active classes.</p></div>
          {requests.length === 0 ? (
            <div className="p-14 text-center"><ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-700">No pending enrollment requests</p><p className="text-xs text-slate-500 mt-1">New requests will appear here when students use a class join code.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map(request => {
                const student = request.users || {};
                const cls = request.classRecord;
                const busy = resolving === request.request_id;
                return (
                  <div key={request.request_id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70">
                    <div><p className="text-sm font-bold text-slate-900">{student.last_name}, {student.first_name}</p><p className="text-[11px] text-slate-500 mt-1">{student.user_number || student.email || 'Student'} · Requested {request.created_at ? new Date(request.created_at).toLocaleDateString() : 'recently'}</p><p className="text-xs font-semibold text-sage-700 mt-2">{cls?.subjects?.code} — {cls?.sections?.name}</p></div>
                    <div className="flex items-center gap-2 shrink-0"><button onClick={() => handleResolve(request, 'rejected')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50 cursor-pointer"><X className="h-3.5 w-3.5" /> Reject</button><button onClick={() => handleResolve(request, 'approved')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"><Check className="h-3.5 w-3.5" /> Approve</button></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

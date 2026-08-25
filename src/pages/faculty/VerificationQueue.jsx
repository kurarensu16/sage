import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { UserCheck, X, FileText, CheckCircle2, ShieldAlert, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function VerificationQueue() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  
  // Feedback alerts
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      // Retrieve enrollments where status is pending_verification and class record belongs to active user
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          enrollment_id,
          status,
          student_id,
          class_record_id,
          student:users!student_id ( first_name, last_name, email, latest_cor_url ),
          class_records!inner (
            class_record_id,
            faculty_id,
            subjects ( code, name )
          ),
          sections ( name )
        `)
        .eq('status', 'pending_verification')
        .eq('class_records.faculty_id', user.id);

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Database query failed:', err);
      setErrorMsg('Failed to load pending verification requests from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId, action) => {
    setProcessingId(requestId);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const actorName = resolveActorName(profile, user);
      const reqObj = requests.find(r => r.enrollment_id === requestId);
      if (!reqObj) throw new Error('Request record not found.');

      const nextStatus = action === 'approve' ? 'active' : 'rejected';
      const logMsg = action === 'approve' ? 'Approved enrollment request' : 'Rejected enrollment request';

      // 1. Update enrollment status
      const { error } = await supabase
        .from('enrollments')
        .update({ status: nextStatus })
        .eq('enrollment_id', requestId);

      if (error) throw error;

      // 2. Audit Logging
      await logActivity(
        'Enrollment Verification',
        `${logMsg} for student ${reqObj.student?.first_name} ${reqObj.student?.last_name} in course ${reqObj.class_records?.subjects?.code}.`,
        actorName
      );

      setSuccessMsg(`Student enrollment successfully ${action === 'approve' ? 'approved' : 'rejected'}!`);
      
      // Update local state list
      setRequests(prev => prev.filter(r => r.enrollment_id !== requestId));
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to execute verification action:', err);
      setErrorMsg('Action failed: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <PageHeader title="Roster Verification Queue" breadcrumb="Faculty Portal" />
      <div className="p-8 overflow-y-auto flex-1 max-w-6xl mx-auto w-full space-y-6">
        
        {/* Status Notification Alerts */}
        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-2 text-left">
            <ShieldAlert className="h-4.5 w-4.5 flex-shrink-0" /> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-2 text-left">
            <CheckCircle2 className="h-4.5 w-4.5 flex-shrink-0" /> {successMsg}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium">Loading pending verification requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-400 p-6 text-sm">
             No pending COR registration verification requests in your queue.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* List queue panels */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left font-display">Pending Requests ({requests.length})</h3>
              <div className="space-y-3">
                {requests.map(req => (
                  <div
                    key={req.enrollment_id}
                    onClick={() => setSelectedRequest(req)}
                    className={`p-4 rounded-xl border transition-all text-left cursor-pointer space-y-2 ${
                      selectedRequest?.enrollment_id === req.enrollment_id
                        ? 'bg-white border-sage-500 shadow-sm ring-1 ring-sage-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900">{req.student?.last_name}, {req.student?.first_name}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{req.student?.email}</div>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold">
                      <span className="text-sage-600">{req.class_records?.subjects?.code}</span>
                      <span className="text-slate-500">{req.sections?.name || 'Irregular'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification details & COR preview block */}
            {selectedRequest && (
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 text-left">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3.5 items-center">
                    <div className="p-3 bg-sage-50 rounded-xl text-sage-600">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{selectedRequest.student?.last_name}, {selectedRequest.student?.first_name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Wishes to enroll in: <span className="font-mono font-bold text-slate-600">{selectedRequest.class_records?.subjects?.code} ({selectedRequest.sections?.name || 'Irregular'})</span></p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedRequest(null)}
                    className="text-xs text-slate-400 hover:text-slate-650 font-bold underline"
                  >
                    Close Preview
                  </button>
                </div>

                {/* PDF Viewer Block */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Uploaded COR Document</span>
                  {selectedRequest.student?.latest_cor_url ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs h-[480px] bg-slate-50 relative flex flex-col justify-between">
                      <iframe 
                        src={selectedRequest.student.latest_cor_url} 
                        title="Student Certificate of Registration (COR)"
                        className="w-full h-full border-0"
                      />
                      <div className="p-3 bg-slate-100/80 border-t border-slate-200 flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-600">Document URL:</span>
                        <a 
                          href={selectedRequest.student.latest_cor_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sage-600 hover:text-sage-700 flex items-center gap-1 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" /> View full screen
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic bg-slate-50">
                      No COR PDF document has been uploaded by the student.
                    </div>
                  )}
                </div>

                {/* Approve/Reject Controls */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3.5">
                  <button
                    disabled={processingId !== null}
                    onClick={() => handleAction(selectedRequest.enrollment_id, 'reject')}
                    className="px-5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                  >
                    Reject Enrollment
                  </button>
                  <button
                    disabled={processingId !== null}
                    onClick={() => handleAction(selectedRequest.enrollment_id, 'approve')}
                    className="px-5 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve Roster Enrollment
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

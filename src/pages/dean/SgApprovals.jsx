import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Inbox, History } from 'lucide-react';
import { fetchDeanSgQueue, SG_APPROVAL_LABEL } from '../../lib/sgApprovalService';
import { toUserMessage } from '../../lib/errorMessages';
import { ErrorBanner, InfoNote, EmptyState, Chip } from '../../components/registrar/RecordsUi';

// Dean › SG Approvals.
//
// The Semestral Grades of the Dean's college that faculty have submitted and
// that are waiting for a decision, oldest first, plus what was decided in the
// last 30 days. Opening one shows the full grade sheet with Approve and Return.
// RLS limits every row to the Dean's own college.

const formatWhen = (iso) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const daysWaiting = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);

export default function SgApprovals() {
  const [queue, setQueue] = useState({ pending: [], recent: [], unavailable: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        setQueue(await fetchDeanSgQueue());
      } catch (err) {
        setError(toUserMessage(err, 'Could not load the SG approvals.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <PageHeader title="SG Approvals" breadcrumb="Dean Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        <InfoNote>
          A Semestral Grade reaches students, their guardians and the Registrar only after you approve it.
          Returning it sends it back to the instructor with your reason.
        </InfoNote>

        <ErrorBanner message={error} />
        {queue.unavailable && (
          <ErrorBanner message="SG approval is not set up on the database yet. Ask the administrator to apply the pending migrations." />
        )}

        <section className="space-y-2.5">
          <h2 className="text-xs sm:text-sm font-bold font-display text-slate-900 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-sage-700" /> Awaiting your approval
            {!loading && <span className="font-mono tabular-nums text-slate-500">({queue.pending.length})</span>}
          </h2>
          {loading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : queue.pending.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing is waiting for you" hint="Submitted Semestral Grades from your college appear here." />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {queue.pending.map((row) => {
                const days = daysWaiting(row.submittedAt);
                return (
                  <Link
                    key={row.classRecordId}
                    to={`/dean/sgapprovals/${row.classRecordId}`}
                    className="p-3.5 sm:p-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 font-mono">{row.subjectCode}</h3>
                        <span className="text-xs sm:text-sm text-slate-700 truncate">{row.subjectName}</span>
                        {row.classType && row.classType !== 'lecture' && <Chip>{row.classType}</Chip>}
                        {row.submissionCount > 1 && <Chip tone="warn">Resubmitted</Chip>}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                        <span className="font-mono">{row.sectionName}</span>
                        <span className="ml-2">{row.instructor || 'No instructor'}</span>
                        {row.termLabel && <span className="ml-2">{row.termLabel}</span>}
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                        Submitted {formatWhen(row.submittedAt)}
                        {' · '}
                        <span className={days >= 3 ? 'text-amber-700 font-semibold' : ''}>
                          waiting {days} day{days === 1 ? '' : 's'}
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <h2 className="text-xs sm:text-sm font-bold font-display text-slate-900 flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" /> Decided in the last 30 days
          </h2>
          {!loading && queue.recent.length === 0 ? (
            <p className="text-xs text-slate-400">No decisions yet.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {queue.recent.map((row) => (
                <Link
                  key={row.classRecordId}
                  to={`/dean/sgapprovals/${row.classRecordId}`}
                  className="p-3.5 sm:p-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 font-mono">{row.subjectCode}</h3>
                      <span className="text-xs text-slate-600 font-mono">{row.sectionName}</span>
                      <Chip tone={row.status === 'approved' ? 'good' : 'warn'}>{SG_APPROVAL_LABEL[row.status]}</Chip>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                      {formatWhen(row.decidedAt)}
                      {row.decidedBy && <> · {row.decidedBy}</>}
                      {row.status === 'returned' && row.returnReason && <> · “{row.returnReason}”</>}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

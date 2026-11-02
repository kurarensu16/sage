import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  HardDrive, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Info, Settings,
  Image as ImageIcon, Trash2, Loader2, Database, Gauge, Save
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import {
  fetchCapacityReport, removeOrphanObjects, formatBytes,
  usageRatio
} from '../../lib/backupService';
import { fetchExpiredEvidence, purgeExpiredEvidence } from '../../lib/gradeChangeRequestService';
import { fetchAiBudget, saveAiBudget, budgetRatio } from '../../lib/aiBudgetService';

// Storage Health: Supabase Storage (in use today) and Cloudflare R2 (not yet).
//
// The verdict comes from the r2-storage edge function rather than from the
// browser, because R2 has no row-level security and its credentials must never
// be shipped to a client. The page asks "is storage healthy" and is told; it
// never holds a key.
//
// Until the developer sets the R2 environment variables in supabase/.env this
// reports "not configured", which is the correct and expected state through
// Phase 2 -- R2's only consumer, Grade Change Request evidence, arrives in
// roadmap item #6.

const STATES = {
  healthy: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Reachable' },
  unreachable: { chip: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle, label: 'Unreachable' },
  unconfigured: { chip: 'bg-slate-50 text-slate-600 border-slate-200', icon: Settings, label: 'Not configured' },
  unknown: { chip: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle, label: 'Unknown' }
};

// Usage against a limit, or usage alone when no limit has been entered.
//
// Defined at module scope, not inside the page: a component declared during
// render is a new type on every render, which remounts it and throws away its
// state. The React Compiler flags it, and the bar would re-animate on every
// keystroke in the plan fields.
function CapacityMeter({ icon: Icon, label, hint, usedBytes, quotaBytes }) {
  const ratio = usageRatio(usedBytes, quotaBytes);
  const pct = ratio === null ? null : Math.round(ratio * 100);

  // Thresholds, not a gradient: the question is "do I need to act", and three
  // answers serve that better than a hundred shades.
  const tone = pct === null ? 'none'
    : pct >= 90 ? 'critical'
      : pct >= 75 ? 'warning'
        : 'ok';
  const barColor = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-rose-500',
    none: 'bg-slate-300'
  }[tone];

  return (
    <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
          {label}
        </span>
        <span className="text-[11px] font-mono font-semibold text-slate-700">
          {formatBytes(usedBytes)}
          {quotaBytes ? <span className="text-slate-400"> / {formatBytes(quotaBytes)}</span> : null}
        </span>
      </div>

      {pct === null ? (
        <p className="text-[11px] text-slate-500 mt-2">
          No limit set, so there is nothing to compare this against yet.
        </p>
      ) : (
        <>
          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            {/* An inline width is the one place this codebase uses style{}: a
                bar's length is data, not design, and Tailwind cannot express an
                arbitrary percentage without a class name built at runtime,
                which would be stripped at build time. Same pattern as the
                meters on System Health. */}
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className={cn(
            'text-[11px] mt-1.5',
            tone === 'critical' ? 'text-rose-700 font-semibold'
              : tone === 'warning' ? 'text-amber-700 font-medium'
                : 'text-slate-500'
          )}>
            {pct}% used
            {tone === 'critical' && ' — nearly full. Free up space or move to a larger plan.'}
            {tone === 'warning' && ' — worth watching.'}
          </p>
        </>
      )}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function StorageHealth() {
  const { user, profile } = useAuth();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Supabase Storage: usage and orphans. Kept in its own state from the R2
  // check, because one being unavailable must not blank out the other.
  const [buckets, setBuckets] = useState([]);
  const [capacity, setCapacity] = useState(null);

  // The tier is chosen; its limits come with it. Nobody types a byte count.
  // The plan is whatever the hosting_plan_tiers row says. Changing it from
  // here was removed: the limits are published figures, not a setting this
  // page should invite anyone to adjust.
  const [bucketsLoading, setBucketsLoading] = useState(true);
  const [bucketsError, setBucketsError] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [confirmClean, setConfirmClean] = useState(null);
  const [cleanNotice, setCleanNotice] = useState('');

  // Grade change evidence that has outlived its retention. Separate state from
  // the bucket totals: the evidence rule is about terms, not about bytes, and
  // one failing must not blank the other.
  const [expired, setExpired] = useState([]);
  const [expiredError, setExpiredError] = useState('');
  const [purging, setPurging] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState('');

  // AI Study Advising spend. Here rather than on its own page because this is
  // already where system resources are reported -- database capacity, storage
  // usage, orphan cleanup. A prepaid AI balance is the same kind of thing.
  const [aiBudget, setAiBudget] = useState(null);
  const [aiError, setAiError] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [capInput, setCapInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const loadBuckets = useCallback(async () => {
    setBucketsLoading(true);
    setBucketsError('');
    try {
      const report = await fetchCapacityReport();
      setCapacity(report);
      setBuckets(report.buckets);
    } catch (err) {
      setBucketsError(toUserMessage(err, 'Could not read storage usage.'));
      setCapacity(null);
      setBuckets([]);
    } finally {
      setBucketsLoading(false);
    }
  }, []);

  const handleClean = async (bucket) => {
    setCleaning(true);
    setCleanNotice('');
    setBucketsError('');
    try {
      const { removed, failed } = await removeOrphanObjects(bucket);
      setCleanNotice(
        failed.length
          ? `Removed ${removed} unused file(s). ${failed.length} could not be removed — try again, or check that those accounts are really deleted.`
          : removed
            ? `Removed ${removed} unused file(s).`
            : 'There was nothing to remove.'
      );
      if (removed > 0) {
        await logActivity(
          'Removed Unused Files',
          `${resolveActorName(profile, user)} removed ${removed} unused file(s) from the "${bucket}" bucket.`,
          resolveActorName(profile, user)
        );
      }
      await loadBuckets();
    } catch (err) {
      setBucketsError(toUserMessage(err, 'Could not remove the unused files.'));
    } finally {
      setCleaning(false);
      setConfirmClean(null);
    }
  };

  const loadAiBudget = useCallback(async () => {
    setAiError('');
    try {
      const data = await fetchAiBudget();
      setAiBudget(data);
      setBudgetInput(String(data.budget));
      setCapInput(String(data.dailyCapPerStudent));
    } catch (err) {
      // Before the budget migration is applied this function does not exist.
      // That is a setup state, not a fault.
      setAiError(toUserMessage(err, 'Could not read the AI usage allowance.'));
      setAiBudget(null);
    }
  }, []);

  const handleSaveBudget = async () => {
    setSavingBudget(true);
    setAiError('');
    try {
      await saveAiBudget({
        budget: Number(budgetInput),
        dailyCap: capInput ? Number(capInput) : null
      });
      await logActivity(
        'Changed AI Allowance',
        `${resolveActorName(profile, user)} set the AI Study Advising allowance to ${budgetInput} requests, ${capInput} per student per day.`,
        resolveActorName(profile, user)
      );
      setEditingBudget(false);
      await loadAiBudget();
    } catch (err) {
      setAiError(toUserMessage(err, 'The allowance could not be saved.'));
    } finally {
      setSavingBudget(false);
    }
  };

  const loadExpired = useCallback(async () => {
    setExpiredError('');
    try {
      setExpired(await fetchExpiredEvidence());
    } catch (err) {
      // Before the Phase 6c migration is applied this function does not exist.
      // That is a setup state, not a fault, and saying so beats a red error.
      setExpiredError(toUserMessage(err, 'Could not check for expired evidence.'));
      setExpired([]);
    }
  }, []);

  // Files first, then rows -- the row is what identifies a file as expired, so
  // the service deliberately does it in that order. See purgeExpiredEvidence().
  const handlePurge = async () => {
    setPurging(true);
    setPurgeNotice('');
    setExpiredError('');
    try {
      const { removed, failed } = await purgeExpiredEvidence();
      setPurgeNotice(
        failed.length
          ? `Cleared ${removed} file(s). ${failed.length} could not be removed — run this again, or check that the retention policy is installed.`
          : removed
            ? `Cleared ${removed} expired evidence file(s).`
            : 'There was nothing to clear.'
      );
      if (removed > 0) {
        await logActivity(
          'Cleared Expired Evidence',
          `${resolveActorName(profile, user)} cleared ${removed} expired grade change evidence file(s).`,
          resolveActorName(profile, user)
        );
      }
      await Promise.all([loadExpired(), loadBuckets()]);
    } catch (err) {
      setExpiredError(toUserMessage(err, 'The expired evidence could not be cleared.'));
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  };

  const check = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('r2-storage', { body: { action: 'health' } });
      if (fnErr) throw fnErr;
      setHealth(data || null);
    } catch (err) {
      // A missing function is a deployment state, not a storage fault, and
      // saying so is more useful than a red "unreachable".
      setError(
        err?.message?.includes('not found') || err?.context?.status === 404
          ? 'The r2-storage edge function is not deployed yet. Deploy it to read storage health.'
          : toUserMessage(err, 'Could not reach the storage health check.')
      );
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    loadBuckets();
    loadExpired();
    loadAiBudget();
  }, [check, loadBuckets, loadExpired, loadAiBudget]);

  const key = !health
    ? 'unknown'
    : !health.configured
      ? 'unconfigured'
      : health.reachable
        ? 'healthy'
        : 'unreachable';
  const state = STATES[key];
  const StateIcon = state.icon;

  return (
    <>
      <PageHeader title="Storage Health" breadcrumb="System Maintenance">
        <button
          onClick={() => { check(); loadBuckets(); }}
          disabled={loading || bucketsLoading}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Re-check</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Capacity against the hosting plan ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl border bg-slate-50 border-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                  Capacity
                  {capacity?.planLabel && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-lg border bg-sage-50 text-sage-700 border-sage-200 align-middle">
                      {capacity.planLabel}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Usage is measured here and compared against your plan's published limits.
                  {capacity?.planNotes && <> {capacity.planNotes}</>}
                </p>
              </div>
            </div>
          </div>

          {capacity && !capacity.storageQuotaBytes && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
              This plan has no limits recorded, so usage cannot be compared against anything.
              Choose a plan, or enter your own figures.
            </p>
          )}

          {/* Three meters, two providers, one question: how much room is left.
              Object storage sits here rather than down in the R2 section
              because "where are we against the limits" is answered in one
              place or not at all. The R2 section below keeps the connection
              detail, which is a different question. */}
          {bucketsLoading ? (
            <p className="text-xs text-slate-400">Measuring…</p>
          ) : !capacity ? null : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <CapacityMeter
                icon={ImageIcon}
                label="File storage"
                hint="Profile photos and any other uploads"
                usedBytes={capacity.storageUsedBytes}
                quotaBytes={capacity.storageQuotaBytes}
              />
              <CapacityMeter
                icon={Database}
                label="Database"
                hint="All records, indexes, and sign-in accounts"
                usedBytes={capacity.databaseUsedBytes}
                quotaBytes={capacity.databaseQuotaBytes}
              />
              {health?.reachable && health?.limitBytes > 0 ? (
                <CapacityMeter
                  icon={HardDrive}
                  label="Object storage"
                  hint={
                    health.usageError
                      ? 'Cloudflare R2 — reachable, but its contents could not be listed'
                      : `Cloudflare R2 — ${(health.objectCount ?? 0).toLocaleString()} object${health.objectCount === 1 ? '' : 's'}${health.truncated ? ', counted to the listing limit' : ''}`
                  }
                  usedBytes={health.totalBytes || 0}
                  quotaBytes={health.limitBytes}
                />
              ) : (
                <div className="border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50/40">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-slate-300" />
                    Object storage
                  </span>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {loading
                      ? 'Checking Cloudflare R2…'
                      : 'Cloudflare R2 is not reachable yet. See the R2 section below.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── AI Study Advising: usage allowance ─────────────────────────── */}
        {/* The per-student daily limit answers "is one student abusing this".
            Only this total answers "can we still afford to answer anyone",
            which is the question that matters on a prepaid balance. */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 flex items-center justify-center flex-shrink-0">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                  AI Study Advising allowance
                </h2>
                <p className="text-[11px] text-slate-500">
                  Total AI requests permitted, and the per-student daily limit.
                </p>
              </div>
            </div>
            {aiBudget && !editingBudget && (
              <button
                onClick={() => setEditingBudget(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 cursor-pointer flex-shrink-0"
              >
                <Settings className="h-3 w-3" />
                Change
              </button>
            )}
          </div>

          {aiError && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 mb-2.5">
              {aiError}
            </p>
          )}

          {aiBudget && (
            <>
              <div className="flex items-end justify-between gap-2 flex-wrap mb-1.5">
                <span className="font-mono text-xl font-extrabold text-slate-900">
                  {aiBudget.used.toLocaleString()}
                  <span className="text-sm font-semibold text-slate-400"> / {aiBudget.budget.toLocaleString()}</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {aiBudget.remaining.toLocaleString()} remaining · {aiBudget.dailyCapPerStudent}/student/day
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    budgetRatio(aiBudget) >= 0.9 ? 'bg-rose-500'
                      : budgetRatio(aiBudget) >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.round(budgetRatio(aiBudget) * 100)}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-500 mt-2">
                {(aiBudget.promptTokens + aiBudget.completionTokens).toLocaleString()} tokens used
                {' '}({aiBudget.promptTokens.toLocaleString()} sent, {aiBudget.completionTokens.toLocaleString()} returned).
                {' '}Multiply by your provider&apos;s price per million to get the cost — nothing reports actual
                charges back to this system, so no figure here is shown as money.
              </p>

              {aiBudget.remaining === 0 && (
                <p className="text-[11px] text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 mt-2 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                  The allowance is used up. Students keep their saved plans, past answers and their
                  instructors&apos; materials — only new AI answers are paused. Raise the allowance to resume.
                </p>
              )}

              {editingBudget && (
                <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 w-40">
                      Total requests
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      className="w-32 px-2.5 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 w-40">
                      Per student, per day
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={capInput}
                      onChange={(e) => setCapInput(e.target.value)}
                      className="w-32 px-2.5 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Setting the total to zero switches AI answers off without affecting anything already saved.
                    Changes are recorded in the activity log.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveBudget}
                      disabled={savingBudget}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sage-600 text-white text-[11px] font-bold hover:bg-sage-700 disabled:opacity-50 cursor-pointer"
                    >
                      {savingBudget ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {savingBudget ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingBudget(false); setAiError(''); }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Supabase Storage: the bucket actually in use today ─────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl border bg-sage-50 border-sage-200 text-sage-600 flex items-center justify-center flex-shrink-0">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                Supabase Storage
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Every bucket in this project, with its usage. Profile photos live in the private{' '}
                <span className="font-mono">avatars</span> bucket, capped at 2&nbsp;MB each and
                readable only by the account that owns them. Unused-file cleanup applies to{' '}
                <span className="font-mono">avatars</span> only, since that is the bucket whose
                paths name their owner.
              </p>
            </div>
          </div>

          {bucketsError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{bucketsError}</span>
            </div>
          )}
          {cleanNotice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{cleanNotice}</span>
            </div>
          )}

          {bucketsLoading ? (
            <p className="text-xs text-slate-400">Reading storage…</p>
          ) : buckets.length === 0 ? (
            <p className="text-xs text-slate-500">
              No files are stored yet. Totals appear once someone uploads a profile photo.
            </p>
          ) : (
            <div className="space-y-2.5">
              {buckets.map((b) => (
                <div key={b.bucket} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-800 font-mono">{b.bucket}</span>
                    <span className="text-[11px] text-slate-500">
                      {b.objectCount.toLocaleString()} file{b.objectCount === 1 ? '' : 's'} ·{' '}
                      <span className="font-mono font-semibold text-slate-700">{formatBytes(b.totalBytes)}</span>
                      {b.largestBytes > 0 && <> · largest {formatBytes(b.largestBytes)}</>}
                    </span>
                  </div>

                  {/* The one number here that asks for a decision. Everything
                      else is just a total. */}
                  {b.orphanCount > 0 ? (
                    <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start justify-between gap-2.5 flex-wrap">
                      <p className="text-[11px] text-amber-900 flex-1 min-w-[12rem]">
                        <strong>{b.orphanCount} file{b.orphanCount === 1 ? '' : 's'} ({formatBytes(b.orphanBytes)})</strong>{' '}
                        {b.orphanCount === 1 ? 'belongs' : 'belong'} to an account that no longer
                        exists. Left over from deleted users, and safe to remove.
                      </p>
                      <button
                        onClick={() => setConfirmClean(b)}
                        disabled={cleaning}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors flex-shrink-0"
                      >
                        {cleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {cleaning ? 'Removing…' : 'Remove them'}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      Every file belongs to an account that still exists.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Grade change evidence: retention ───────────────────────────── */}
        {/* Evidence is REQUIRED on every dispute, so without a way to clear it
            the bucket only ever grows. The database decides what has expired
            (resolved, and one full term rollover past); this panel only decides
            when to ask. */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center flex-shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                Grade change evidence
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Files students attach to a grade change request. They are kept until the request is
                settled and the term after it has ended, then they can be cleared.
              </p>
            </div>
          </div>

          {expiredError && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 mb-2.5">
              {expiredError}
            </p>
          )}
          {purgeNotice && (
            <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 mb-2.5">
              {purgeNotice}
            </p>
          )}

          {expired.length > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start justify-between gap-2.5 flex-wrap">
              <p className="text-[11px] text-amber-900 flex-1 min-w-[12rem]">
                <strong>{expired.length} file{expired.length === 1 ? '' : 's'}</strong>{' '}
                {expired.length === 1 ? 'belongs' : 'belong'} to a request that is settled and to a
                term that has already rolled over. Safe to remove — no open request loses its proof.
              </p>
              <button
                onClick={() => setConfirmPurge(true)}
                disabled={purging}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors flex-shrink-0"
              >
                {purging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                {purging ? 'Clearing…' : 'Clear them'}
              </button>
            </div>
          ) : !expiredError && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              Nothing has expired. Every attached file still belongs to a live request or a recent term.
            </p>
          )}
        </div>

        {/* ── Cloudflare R2: not in use until evidence uploads arrive ────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={cn('w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0', state.chip)}>
              <StateIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                  Cloudflare R2 bucket
                </h2>
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-lg border', state.chip)}>
                  {loading ? 'Checking…' : state.label}
                </span>
              </div>

              {health?.bucket && (
                <p className="text-[11px] sm:text-xs text-slate-600 mt-1 font-mono truncate">
                  {health.bucket}
                </p>
              )}
              {typeof health?.latencyMs === 'number' && health.reachable && (
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  HeadBucket responded in{' '}
                  <span className="font-mono font-semibold text-slate-900">{health.latencyMs} ms</span>
                </p>
              )}
              {health && !health.configured && (
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                  Expected at this stage. R2's first consumer — grade-change evidence uploads —
                  arrives with the Grade Change Request feature.
                </p>
              )}
              {health?.error && health.configured && (
                <p className="text-[11px] sm:text-xs text-rose-700 mt-1 break-words">{health.error}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <h2 className="text-sm font-semibold font-display text-slate-900 mb-2">
            What R2 is used for
          </h2>
          <ul className="text-[11px] sm:text-xs text-slate-600 space-y-1.5 list-disc pl-4">
            <li>
              <strong>Only</strong> grade-change request evidence uploads. Profile photos stay on
              Supabase Storage's private <span className="font-mono">avatars</span> bucket
              permanently — R2 does not replace it.
            </li>
            <li>
              Every object is reached through a short-lived presigned URL minted server-side after
              an ownership check, because R2 has no row-level security of its own.
            </li>
            <li>
              Credentials live in <span className="font-mono">supabase/.env</span> and are read only
              by edge functions. They are never exposed to the browser.
            </li>
          </ul>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Setup steps — creating the bucket, scoping an API token, and the four environment
            variables — are in <span className="font-mono">docs/05-operations/storage/R2_SETUP.md</span>.
          </span>
        </div>

        {/* The capacity meter for this bucket lives in the Capacity panel at
            the top, beside the Supabase ones -- all three answer the same
            question. What stays here is the connection itself. */}

        <p className="text-[10px] text-slate-400 flex items-start gap-1.5 mt-3">
          <HardDrive className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          Only storage is metered. R2 also meters operations (1M Class A and 10M Class B per month
          on the free plan), but this system makes a handful per page load and a few per upload, so
          counting them would cost more attention than it could save.
        </p>
      </div>

      <ConfirmModal
        isOpen={!!confirmClean}
        onCancel={() => setConfirmClean(null)}
        onConfirm={() => handleClean(confirmClean.bucket)}
        title="Remove these unused files?"
        message={`${confirmClean?.orphanCount || 0} file(s) totalling ${formatBytes(confirmClean?.orphanBytes || 0)} will be deleted permanently. Only files belonging to accounts that no longer exist can be removed this way, so no current user loses their photo.`}
      />

      <ConfirmModal
        isOpen={confirmPurge}
        onCancel={() => setConfirmPurge(false)}
        onConfirm={handlePurge}
        title="Clear this expired evidence?"
        message={`${expired.length} file(s) will be deleted permanently. Only files from requests that are already settled, in a term that has since rolled over, can be removed this way — nothing attached to an open request is touched.`}
      />
    </>
  );
}

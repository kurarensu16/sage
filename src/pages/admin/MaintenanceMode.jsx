import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  Wrench, AlertTriangle, CheckCircle2, Clock, User, Loader2, Info, CalendarClock, Timer, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { useMaintenance } from '../../lib/MaintenanceContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import {
  REASON_CATEGORIES, fetchMaintenanceReasons, fetchNotePresets, toggleNoteSnippet,
  previewMaintenanceMessage, setMaintenanceWindow, toLocalInputValue,
  fromLocalInputValue, formatWindow
} from '../../lib/maintenanceService';

// Admin's maintenance window.
//
// Writes go through set_maintenance_window, which re-checks the caller's role
// server-side. system_settings has no write policy at all, so a direct table
// write from the client is refused regardless of what this page offers.
//
// MANUAL OR AUTOMATIC
//   Manual     the switch decides. A window, if given, is announced only.
//   Automatic  the clock opens the window and closes it at the end time.
//
// In both modes the switch can force maintenance on, and automatic can only
// ever ADD maintenance. The clock is never allowed to re-open the system on its
// own once someone has said stay closed -- that is the direction that loses
// work, with a restore still running at the end time.
//
// The message is never typed here. It is composed server-side from the reason,
// the window and the optional note, and previewed through the same function
// that renders it, so what is approved is what users see.

export default function MaintenanceMode() {
  const { user, profile } = useAuth();
  const {
    maintenanceMode, maintenanceMessage, updatedAt, refresh,
    reasonId: windowReasonId, reasonLabel, note: windowNote,
    startsAt: windowStartsAt, endsAt: windowEndsAt,
    auto: windowAuto, switchOn
  } = useMaintenance();

  const [reasons, setReasons] = useState([]);
  const [presets, setPresets] = useState([]);
  const [category, setCategory] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [auto, setAuto] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOn, setConfirmOn] = useState(false);
  const [updatedByName, setUpdatedByName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [r, p] = await Promise.all([fetchMaintenanceReasons(), fetchNotePresets()]);
        setReasons(r);
        setPresets(p);
      } catch (err) {
        setError(toUserMessage(err, 'Could not load the list of reasons.'));
      }
    })();
  }, []);

  // Seed the form from whatever was last set, so ending and restarting a window
  // does not mean re-entering everything.
  useEffect(() => {
    setReasonId(windowReasonId || '');
    setAuto(!!windowAuto);
    setStartsAt(toLocalInputValue(windowStartsAt));
    setEndsAt(toLocalInputValue(windowEndsAt));
    setNote(windowNote || '');
  }, [windowReasonId, windowAuto, windowStartsAt, windowEndsAt, windowNote]);

  // The category follows the saved reason rather than being stored separately,
  // so reopening the page lands on the right group without a second column in
  // the database that could fall out of step with the reason it describes.
  useEffect(() => {
    if (!reasonId || !reasons.length) return;
    const found = reasons.find((r) => r.id === reasonId);
    if (found) setCategory(found.category);
  }, [reasonId, reasons]);

  // The preview comes from the same function that renders the real message, so
  // there is no second wording to drift. Debounced because the note is typed.
  useEffect(() => {
    if (!reasonId && !note.trim()) {
      setPreview('');
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        setPreview(await previewMaintenanceMessage({
          reasonId,
          endsAt: fromLocalInputValue(endsAt),
          note: note.trim()
        }));
      } catch {
        // A preview that cannot be fetched is not worth an error banner; the
        // real message is composed server-side on save regardless.
        setPreview('');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [reasonId, endsAt, note]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('updated_by')
        .eq('id', 1)
        .maybeSingle();
      if (!data?.updated_by) {
        setUpdatedByName('');
        return;
      }
      const { data: who } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('user_id', data.updated_by)
        .maybeSingle();
      setUpdatedByName(who ? `${who.first_name || ''} ${who.last_name || ''}`.trim() : '');
    })();
  }, [updatedAt]);

  const apply = async (enabled) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await setMaintenanceWindow({
        switchOn: enabled,
        reasonId: enabled || auto ? reasonId : null,
        // Ending maintenance clears the automatic window too. Otherwise the
        // clock would silently re-close the system minutes after an admin
        // deliberately opened it.
        auto: enabled ? auto : false,
        startsAt: enabled && auto ? fromLocalInputValue(startsAt) : null,
        endsAt: enabled && auto ? fromLocalInputValue(endsAt) : null,
        note: enabled ? note.trim() : null
      });

      const label = reasons.find((r) => r.id === reasonId)?.label || 'Maintenance';
      await logActivity(
        enabled ? 'Started Maintenance' : 'Ended Maintenance',
        enabled
          ? `${resolveActorName(profile, user)} started maintenance (${label})${
              auto ? ` scheduled ${formatWindow(fromLocalInputValue(startsAt), fromLocalInputValue(endsAt))}` : ''
            }.`
          : `${resolveActorName(profile, user)} ended maintenance.`,
        resolveActorName(profile, user)
      );

      await refresh();
      setNotice(enabled ? 'Maintenance mode is now on.' : 'Maintenance mode is now off.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not change maintenance mode.'));
    } finally {
      setSaving(false);
      setConfirmOn(false);
    }
  };

  // A reason is always required. An automatic window additionally needs both
  // ends, because there is nothing for the clock to compare against otherwise.
  const windowComplete = !auto || (!!startsAt && !!endsAt);
  const windowOrdered =
    !auto || !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt);
  const canEnable = !!reasonId && windowComplete && windowOrdered;

  // Presets split by whether they are already in the note: the dropdown offers
  // what is left, the chips below remove what is there.
  const relevantPresets = presets.filter((p) => !p.reasonId || p.reasonId === reasonId);
  const chosenPresets = relevantPresets.filter((p) => note.includes(p.text));
  const availablePresets = relevantPresets.filter((p) => !note.includes(p.text));

  const blockedBecause = !reasonId
    ? 'Choose a reason first'
    : !windowComplete
      ? 'An automatic window needs a start and an end'
      : !windowOrdered
        ? 'The end time has to be after the start'
        : '';

  return (
    <>
      <PageHeader title="Maintenance Mode" breadcrumb="Admin Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* ── Current state ───────────────────────────────────────────────── */}
        <div
          className={cn(
            'rounded-2xl border shadow-2xs p-3.5 sm:p-5',
            maintenanceMode ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200/90'
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border',
                maintenanceMode
                  ? 'bg-amber-100 border-amber-200 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              )}
            >
              <Wrench className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                {maintenanceMode ? 'Maintenance mode is ON' : 'Maintenance mode is off'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5">
                {maintenanceMode
                  ? 'Non-admin users signing in now see the maintenance screen. Sessions already open keep working and have been notified.'
                  : windowAuto && windowStartsAt
                    ? `Scheduled to close ${formatWindow(windowStartsAt, windowEndsAt)}. All roles have normal access until then.`
                    : 'All roles have normal access.'}
              </p>

              {/* Why it is on matters: a window the clock opened ends by itself,
                  one the switch opened does not. */}
              {maintenanceMode && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] text-slate-700">
                    <span className="font-semibold">{reasonLabel || 'Maintenance'}</span>
                    {' — '}
                    {switchOn
                      ? 'held open by the switch. It stays on until you end it.'
                      : `opened automatically. It reopens at ${formatWindow(null, windowEndsAt)}.`}
                  </p>
                  {maintenanceMessage && (
                    <p className="text-[11px] text-slate-600 bg-white/70 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      {maintenanceMessage}
                    </p>
                  )}
                </div>
              )}
              {(updatedAt || updatedByName) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-500">
                  {updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(updatedAt).toLocaleString('en-PH')}
                    </span>
                  )}
                  {updatedByName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {updatedByName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Message + toggle ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3.5">
          {/* ── Reason ─────────────────────────────────────────────────── */}
          <div>
            <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              Why is the system closing?
            </label>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    // Clear a reason that no longer belongs, so the two
                    // dropdowns can never show a mismatched pair.
                    setReasonId((id) => {
                      const r = reasons.find((x) => x.id === id);
                      return r && r.category === e.target.value ? id : '';
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer"
                >
                  <option value="">Choose a category…</option>
                  {REASON_CATEGORIES.filter((c) => reasons.some((r) => r.category === c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                  Reason
                </label>
                <select
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                  disabled={!category}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {category ? 'Choose a reason…' : 'Choose a category first'}
                  </option>
                  {reasons
                    .filter((r) => r.category === category)
                    .map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Required. The wording users see comes from the reason you pick, so it reads the
              same every time rather than depending on what gets typed.
            </p>
          </div>

          {/* ── Manual or automatic ────────────────────────────────────── */}
          <div className="border-t border-slate-100 pt-3.5">
            <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              When
            </label>
            <div className="grid sm:grid-cols-2 gap-1.5">
              <button
                onClick={() => setAuto(false)}
                className={cn(
                  'text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer',
                  !auto ? 'bg-sage-50 border-sage-300 ring-1 ring-sage-200' : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-slate-400" /> Manual
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Starts when you press the button and stays on until you end it.
                </span>
              </button>
              <button
                onClick={() => setAuto(true)}
                className={cn(
                  'text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer',
                  auto ? 'bg-sage-50 border-sage-300 ring-1 ring-sage-200' : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Scheduled
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Closes by itself at the start time and reopens at the end time.
                </span>
              </button>
            </div>

            {auto && (
              <div className="grid sm:grid-cols-2 gap-2.5 mt-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">From</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Until</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
                  />
                </div>
              </div>
            )}

            {!auto && (
              <div className="mt-2.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                  Expected back by <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full sm:w-72 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Announced to users so they know when to come back. It does not end maintenance —
                  in manual mode only you do that.
                </p>
              </div>
            )}

            {auto && (
              <p className="text-[10px] text-amber-700 mt-2 flex items-start gap-1.5">
                <Timer className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                A scheduled window reopens the system at the end time. If you are restoring a
                backup, use <strong>Manual</strong> instead — work that overruns must not be
                interrupted by the clock.
              </p>
            )}
          </div>

          {/* ── Optional note ──────────────────────────────────────────── */}
          <div className="border-t border-slate-100 pt-3.5">
            <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              Anything to add <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>

            {/* Click to add, click again to remove. A routine window should
                need no typing at all. */}
            {availablePresets.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const preset = presets.find((p) => p.id === e.target.value);
                  if (preset) setNote((n) => toggleNoteSnippet(n, preset.text));
                }}
                className="w-full px-3 py-2 mb-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer"
              >
                <option value="">Add a ready-made sentence…</option>
                {availablePresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.text}</option>
                ))}
              </select>
            )}

            {/* Each chosen sentence stays removable, so a wrong pick does not
                mean editing it back out of the textarea by hand. */}
            {chosenPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {chosenPresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setNote((n) => toggleNoteSnippet(n, p.text))}
                    title="Remove this sentence"
                    className="px-2.5 py-1 rounded-lg border border-sage-300 bg-sage-50 text-sage-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-sage-100 transition-colors cursor-pointer text-left"
                  >
                    {p.text}
                    <X className="h-3 w-3 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Grade posting will be briefly unavailable."
              className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Added after the standard wording, not instead of it. Use the suggestions above, or
              type your own — both end up in the same notice.
            </p>
          </div>

          {/* ── Preview ────────────────────────────────────────────────── */}
          {preview && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <span className="text-micro font-bold text-slate-400 uppercase tracking-wide block mb-1">
                What users will see
              </span>
              <p className="text-xs text-slate-700">{preview}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {maintenanceMode ? (
              <button
                onClick={() => apply(false)}
                disabled={saving}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? 'Working…' : 'End maintenance'}
              </button>
            ) : (
              <button
                onClick={() => setConfirmOn(true)}
                disabled={saving || !canEnable}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wrench className="h-4 w-4" />
                Start maintenance
              </button>
            )}
            {!maintenanceMode && !canEnable && (
              <span className="text-[10px] sm:text-xs text-slate-400">{blockedBecause}</span>
            )}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            This is a soft cutover. Nobody is signed out: open sessions keep working and receive a
            one-time notice plus a banner, while new non-admin sign-ins see the maintenance screen.
            Administrators are never blocked. Ending maintenance clears the banner silently.
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOn}
        title="Start maintenance mode?"
        message={
          auto
            ? `The system will close automatically ${formatWindow(fromLocalInputValue(startsAt), fromLocalInputValue(endsAt))} and reopen at the end. Users will see: "${preview}"`
            : `Non-admin users signing in will see the maintenance screen instead of the portal. Open sessions keep working and will be notified. Users will see: "${preview}"`
        }
        onConfirm={() => apply(true)}
        onCancel={() => setConfirmOn(false)}
      />
    </>
  );
}

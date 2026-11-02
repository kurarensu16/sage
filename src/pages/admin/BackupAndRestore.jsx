import { useState, useEffect, useCallback, useRef } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  DatabaseBackup, Download, Upload, AlertTriangle, CheckCircle2, Loader2,
  Info, RotateCcw, Wrench, ShieldAlert, FileJson, KeyRound, Eye, EyeOff,
  FlaskConical, Lock
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useMaintenance } from '../../lib/MaintenanceContext';
import { toUserMessage } from '../../lib/errorMessages';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import { describePassphraseStrength } from '../../lib/backupCrypto';
import {
  BACKUP_EXCLUSIONS, fetchBackupManifest, fetchBackupHistory, fetchBackupStatus,
  createEncryptedBackup, downloadEnvelope, inspectBackupFile, unlockBackup,
  validateBackup, restoreBackup, restoreErrorMessage, backupFileName
} from '../../lib/backupService';

// Admin backup and restore.
//
// The restore half is the most destructive action in ASPIRE, so the page is
// built to make it slow and deliberate rather than convenient:
//
//   1. Maintenance mode must already be ON. Not offered here as a checkbox --
//      the admin turns it on from the Maintenance page, which announces the
//      window to everyone signed in. A restore behind an un-announced curtain
//      is how someone loses work mid-save.
//   2. The file's clear-text header is read first, so an incompatible backup is
//      identified before the passphrase is even asked for.
//   3. The file is checked, and can be rehearsed in full and rolled back,
//      before anyone commits to it.
//   4. The admin types the word RESTORE. A typed confirmation is the one gesture
//      that cannot be produced by a mis-click.
//
// Everything runs in one transaction server-side: it completes or it changes
// nothing. There is no half-restored state to recover from.

const RESTORE_PHRASE = 'RESTORE';

// The outcome of a restore or a rehearsal, as a modal.
//
// A destructive operation should end with something that has to be dismissed.
// The inline panel below stays as the record, but it is easy to scroll past at
// exactly the moment the numbers matter most -- how many records came back, and
// what did not.
function OutcomeModal({ kind, outcome, onClose }) {
  if (!outcome) return null;
  const rehearsal = kind === 'rehearsal';
  const skipped = Number(outcome.profiles_skipped_missing_login || 0);
  const emptied = Array.isArray(outcome.tables_left_empty) ? outcome.tables_left_empty : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center gap-2">
          <div className={cn(
            'w-14 h-14 rounded-full border flex items-center justify-center',
            rehearsal
              ? 'bg-sky-50 border-sky-200 text-sky-600'
              : 'bg-emerald-50 border-emerald-200 text-emerald-600'
          )}>
            {rehearsal ? <FlaskConical className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
          </div>
          <h3 className="text-lg font-bold font-display text-slate-900">
            {rehearsal ? 'Test passed' : 'Restore complete'}
          </h3>
          <p className="text-xs text-slate-500">
            {rehearsal
              ? 'The whole restore ran and was then undone. Nothing in the system changed.'
              : 'The system now holds exactly what the backup held.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            label={rehearsal ? 'Would restore' : 'Records restored'}
            value={Number(outcome.rows_restored || 0).toLocaleString()}
          />
          <StatTile label="Tables" value={outcome.tables_restored ?? 0} />
        </div>

        {skipped > 0 && (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <strong>{skipped} person record{skipped === 1 ? '' : 's'}</strong>{' '}
            {rehearsal ? 'would be' : 'could not be'} restored, because the matching sign-in
            account no longer exists. Re-create those accounts through Import Users if they are
            still needed.
          </p>
        )}

        {emptied.length > 0 && (
          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            Left empty because the backup did not contain them:{' '}
            <span className="font-mono">{emptied.map((t) => t.table).join(', ')}</span>.
          </p>
        )}

        {!rehearsal && (
          <p className="text-[11px] text-slate-700 bg-sage-50 border border-sage-200 rounded-xl px-3 py-2.5">
            <strong>Turn maintenance mode off</strong> when you have checked the result.
            Signing in is unaffected — a restore does not touch login records, so everyone keeps
            the password they already had.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint }) {
  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-3">
      <span className="text-micro font-bold text-slate-400 uppercase tracking-wide block">{label}</span>
      <span className="font-mono text-lg font-extrabold text-slate-800 mt-0.5 block">{value}</span>
      {hint && <span className="text-[10px] text-slate-400 mt-0.5 block">{hint}</span>}
    </div>
  );
}

function PassphraseField({ label, value, onChange, show, onToggleShow, placeholder, autoComplete }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

const STRENGTH_STYLES = {
  weak: 'text-rose-700',
  fair: 'text-amber-700',
  strong: 'text-emerald-700'
};

// A difference the compatibility check found. Blocking ones are the reason a
// restore is refused; the rest are losses worth knowing about before you agree.
function DifferenceRow({ diff }) {
  const blocking = !!diff.blocking;
  return (
    <li className={cn(
      'text-[11px] flex items-start gap-1.5',
      blocking ? 'text-rose-800' : 'text-slate-600'
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
        blocking ? 'bg-rose-500' : 'bg-slate-300'
      )} />
      <span>
        <strong className="font-mono">{diff.table}</strong>
        {diff.column && <span className="font-mono"> · {diff.column}</span>}
        {' — '}{diff.detail}
      </span>
    </li>
  );
}

export default function BackupAndRestore() {
  const { user, profile } = useAuth();
  const { maintenanceMode } = useMaintenance();
  const fileInput = useRef(null);

  const [manifest, setManifest] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Export
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [hint, setHint] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Restore
  const [candidate, setCandidate] = useState(null);
  const [unlockPass, setUnlockPass] = useState('');
  const [showUnlock, setShowUnlock] = useState(false);
  const [payload, setPayload] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState('');          // '' | 'inspect' | 'unlock' | 'rehearse' | 'restore'
  const [rehearsal, setRehearsal] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [result, setResult] = useState(null);
  // Which outcome the modal is showing, if any: 'restore' | 'rehearsal' | ''
  const [outcomeKind, setOutcomeKind] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, h, s] = await Promise.all([
        fetchBackupManifest(), fetchBackupHistory(), fetchBackupStatus()
      ]);
      setManifest(m);
      setHistory(h);
      setStatus(s);
    } catch (err) {
      setError(toUserMessage(err, 'Could not read the backup details.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalRows = manifest.reduce((sum, t) => sum + t.rows, 0);
  const strength = describePassphraseStrength(pass1);
  const passphrasesMatch = pass1.length > 0 && pass1 === pass2;
  const phraseOk = phrase.trim().toUpperCase() === RESTORE_PHRASE;

  const resetRestore = () => {
    setCandidate(null);
    setPayload(null);
    setCheck(null);
    setRehearsal(null);
    setUnlockPass('');
    setPhrase('');
  };

  const handleBackup = async () => {
    if (!passphrasesMatch) return;
    setBackingUp(true);
    setError('');
    setNotice('');
    try {
      const { envelope, summary, recorded } = await createEncryptedBackup(pass1, hint.trim());
      downloadEnvelope(envelope, summary.takenAt);
      setNotice(
        `Encrypted backup downloaded as ${backupFileName(summary.takenAt)} — ${summary.rowCount.toLocaleString()} records.` +
        (recorded ? '' : ' It could not be added to the history below, but the file itself is complete.') +
        ' Keep the passphrase safe: it cannot be recovered.'
      );
      setPass1('');
      setPass2('');
      setHint('');
      await logActivity(
        'Created Backup',
        `${resolveActorName(profile, user)} created an encrypted full backup (${summary.rowCount} records).`,
        resolveActorName(profile, user)
      );
      load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not create the backup.'));
    } finally {
      setBackingUp(false);
    }
  };

  const handleChooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';           // let the same file be re-chosen after a cancel
    if (!file) return;

    setBusy('inspect');
    setError('');
    setNotice('');
    setResult(null);
    resetRestore();
    try {
      setCandidate(await inspectBackupFile(file));
    } catch (err) {
      setError(toUserMessage(err, 'That file could not be read as a backup.'));
    } finally {
      setBusy('');
    }
  };

  // Unlock and check in one step: a file that opens but does not fit is still
  // unusable, and finding that out in two clicks teaches nothing extra.
  const handleUnlock = async () => {
    if (!candidate || !unlockPass) return;
    setBusy('unlock');
    setError('');
    try {
      const decrypted = await unlockBackup(candidate.envelope, unlockPass);
      setPayload(decrypted);
      setCheck(await validateBackup(decrypted));
      setUnlockPass('');
    } catch (err) {
      setError(toUserMessage(err, 'Could not open that backup.'));
    } finally {
      setBusy('');
    }
  };

  const handleRehearse = async () => {
    if (!payload) return;
    setBusy('rehearse');
    setError('');
    setNotice('');
    try {
      const outcome = await restoreBackup(payload, { rehearse: true });
      setRehearsal(outcome);
      setOutcomeKind('rehearsal');
      setNotice(
        `Rehearsal succeeded and was rolled back — nothing changed. ${Number(outcome?.rows_restored || 0).toLocaleString()} records across ${outcome?.tables_restored} tables would be restored.`
      );
      load();
    } catch (err) {
      setError(restoreErrorMessage(err) || toUserMessage(err, 'The rehearsal did not finish. Nothing was changed.'));
    } finally {
      setBusy('');
    }
  };

  const handleRestore = async () => {
    if (!payload || !phraseOk) return;
    setBusy('restore');
    setError('');
    setNotice('');
    try {
      const outcome = await restoreBackup(payload, { rehearse: false });
      const takenAt = candidate?.takenAt;
      setResult(outcome);
      setOutcomeKind('restore');
      resetRestore();
      setConfirmRestore(false);
      setNotice('Restore finished. Review the summary below, then turn maintenance mode off.');
      await logActivity(
        'Restored Backup',
        `${resolveActorName(profile, user)} restored a backup taken ${takenAt || 'at an unknown time'} (${outcome?.rows_restored ?? 0} records).`,
        resolveActorName(profile, user)
      );
      load();
    } catch (err) {
      setError(restoreErrorMessage(err) || toUserMessage(err, 'The restore did not run. Nothing was changed.'));
      setConfirmRestore(false);
    } finally {
      setBusy('');
    }
  };

  const blockingDiffs = (check?.differences || []).filter((d) => d.blocking);
  const otherDiffs = (check?.differences || []).filter((d) => !d.blocking);

  // Which tables the live database and the file disagree about, and by how much.
  //
  // A total on its own is unreadable: "230 against 228" looks the same whether
  // the two rows are audit-log entries or somebody's grades. Per table, the
  // answer is usually obvious at a glance -- and one difference is guaranteed,
  // because a backup cannot contain the log entry recording its own creation.
  const rowDifferences = (() => {
    if (!candidate) return [];
    const live = new Map(manifest.map((t) => [t.table, t.rows]));
    const inFile = new Map(candidate.tables.map((t) => [t.table, t.rows]));
    const names = new Set([...live.keys(), ...inFile.keys()]);
    return [...names]
      .map((name) => ({
        table: name,
        live: live.get(name) ?? 0,
        file: inFile.get(name) ?? 0
      }))
      .filter((d) => d.live !== d.file)
      .sort((a, b) => Math.abs(b.live - b.file) - Math.abs(a.live - a.file));
  })();
  const canRestore = !!payload && !!check?.restorable && maintenanceMode;

  return (
    <>
      <PageHeader title="Backup & Restore" breadcrumb="System Maintenance" />

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

        {/* The drift warning. This is what makes "take a new backup after every
            database change" something the system says rather than something
            someone has to remember. */}
        {!loading && status?.schemaChanged === true && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Your most recent backup can no longer be restored.</strong> The database
              structure has changed since it was taken
              {status.lastBackupAt && <> on {new Date(status.lastBackupAt).toLocaleString('en-PH')}</>}
              {' '}— most likely a system update. Create a new backup now.
            </span>
          </div>
        )}
        {!loading && status?.schemaChanged === null && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span><strong>There is no backup yet.</strong> Create one before the next change to the system.</span>
          </div>
        )}
        {!loading && status?.schemaChanged === false && status.daysSinceLastBackup > 7 && (
          <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Your last backup was {Math.floor(status.daysSinceLastBackup)} days ago. It still fits
              the current database, but anything recorded since then is not in it.
            </span>
          </div>
        )}

        {/* ── Backup ──────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sage-50 border border-sage-200 flex items-center justify-center flex-shrink-0">
              <DatabaseBackup className="h-4.5 w-4.5 text-sage-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Create a backup</h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Downloads one encrypted file holding every record in the system. Keep it somewhere
                safe — it is the only thing a restore can read.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Reading the database…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <StatTile label="Records" value={totalRows.toLocaleString()} hint="across every table" />
                <StatTile label="Tables" value={manifest.length} hint="found automatically" />
                <StatTile
                  label="Last backup"
                  value={status?.lastBackupAt
                    ? new Date(status.lastBackupAt).toLocaleDateString('en-PH')
                    : 'Never'}
                />
              </div>

              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-3">
                <p className="text-[11px] text-slate-600 flex items-start gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 mt-px flex-shrink-0 text-slate-400" />
                  <span>
                    The file is encrypted with a passphrase you choose, because it holds every
                    student's name, email, ID number and grades.{' '}
                    <strong>A forgotten passphrase cannot be recovered and the backup is then
                    unusable.</strong> Write it down somewhere other than the backup itself.
                  </span>
                </p>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  <PassphraseField
                    label="Passphrase"
                    value={pass1}
                    onChange={setPass1}
                    show={showPass}
                    onToggleShow={() => setShowPass((s) => !s)}
                    placeholder="A phrase of several words"
                    autoComplete="new-password"
                  />
                  <PassphraseField
                    label="Type it again"
                    value={pass2}
                    onChange={setPass2}
                    show={showPass}
                    onToggleShow={() => setShowPass((s) => !s)}
                    placeholder="Repeat the passphrase"
                    autoComplete="new-password"
                  />
                </div>

                {strength && (
                  <p className={cn('text-[11px] font-medium', STRENGTH_STYLES[strength.level])}>
                    {strength.text}
                  </p>
                )}
                {pass2.length > 0 && !passphrasesMatch && (
                  <p className="text-[11px] font-medium text-rose-700">
                    The two passphrases do not match.
                  </p>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Reminder (optional)
                  </label>
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="A clue only you would understand — never the passphrase itself"
                    maxLength={120}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Stored unencrypted in the file so you can read it without the passphrase.
                    Anyone who has the file can read it too.
                  </p>
                </div>

                <button
                  onClick={handleBackup}
                  disabled={backingUp || !passphrasesMatch}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sage-600 text-white text-xs font-bold hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {backingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {backingUp ? 'Encrypting…' : 'Create Backup'}
                </button>
              </div>

              <details className="group">
                <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-800 list-none inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  What a backup does and does not include
                </summary>
                <div className="mt-2.5 space-y-2">
                  <ul className="space-y-1.5">
                    {BACKUP_EXCLUSIONS.map((item) => (
                      <li key={item.what} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                        <span><strong className="text-slate-700">{item.what} are not included.</strong> {item.why}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left font-bold uppercase tracking-wide px-2.5 py-1.5">Table</th>
                          <th className="text-right font-bold uppercase tracking-wide px-2.5 py-1.5">Records</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[...manifest].sort((a, b) => a.table.localeCompare(b.table)).map((t) => (
                          <tr key={t.table}>
                            <td className="px-2.5 py-1 font-medium text-slate-700">{t.table}</td>
                            <td className="px-2.5 py-1 text-right font-mono text-slate-600">{t.rows.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </>
          )}
        </section>

        {/* ── Restore ─────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-rose-200 shadow-2xs overflow-hidden">
          <div className="bg-rose-50/70 border-b border-rose-200 px-3.5 sm:px-5 py-3 flex items-start gap-2.5">
            <ShieldAlert className="h-4.5 w-4.5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-rose-900">Restore from a backup</h2>
              <p className="text-[11px] sm:text-xs text-rose-700 mt-0.5">
                This replaces everything currently in the system with the contents of the file you
                choose. Any record created after that backup was taken is lost. There is no undo.
              </p>
            </div>
          </div>

          <div className="p-3.5 sm:p-5 space-y-3.5">
            {!maintenanceMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-900 flex items-start gap-2">
                <Wrench className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Turn on maintenance mode first.</strong> Restoring — and testing a restore —
                  is only allowed while the system is closed, because both hold every table for the
                  duration. Turn it on from <strong>System Maintenance → Maintenance Mode</strong>,
                  which also tells everyone signed in what is happening.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                onChange={handleChooseFile}
                className="hidden"
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {busy === 'inspect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {busy === 'inspect' ? 'Reading…' : 'Choose a backup file'}
              </button>
              {candidate && (
                <button
                  onClick={() => { resetRestore(); setNotice(''); setError(''); }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Clear
                </button>
              )}
              <span className="text-[11px] text-slate-400">
                Choosing a file is safe — nothing changes until you confirm.
              </span>
            </div>

            {candidate && (
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-start gap-2">
                  <FileJson className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Backup taken {candidate.takenAt ? new Date(candidate.takenAt).toLocaleString('en-PH') : 'at an unknown time'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Read from the file without its passphrase. Check this is the one you mean.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatTile label="Records" value={candidate.rowCount.toLocaleString()} />
                  <StatTile label="Tables" value={candidate.tableCount} />
                  <StatTile label="Accounts" value={candidate.accountCount.toLocaleString()} />
                  <StatTile label="Photos" value={candidate.photoCount.toLocaleString()} hint="metadata only" />
                </div>

                {/* The structure comparison, available before the passphrase is
                    asked for, so an unusable file is identified early. */}
                {status?.fingerprint && candidate.fingerprint && (
                  candidate.fingerprint === status.fingerprint ? (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                      This backup matches the current database structure.
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                      The database structure has changed since this backup was taken. Open it below
                      to see exactly what differs and whether it can still be restored.
                    </p>
                  )
                )}

                {totalRows !== candidate.rowCount && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        The system currently holds <strong>{totalRows.toLocaleString()}</strong> records and
                        this backup holds <strong>{candidate.rowCount.toLocaleString()}</strong>. After the
                        restore, the difference is gone.
                      </span>
                    </div>

                    {rowDifferences.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold hover:underline list-none">
                          Which {rowDifferences.length === 1 ? 'table differs' : `${rowDifferences.length} tables differ`}?
                        </summary>
                        <table className="w-full mt-1.5 text-[11px]">
                          <thead className="text-amber-700/80">
                            <tr>
                              <th className="text-left font-semibold py-0.5">Table</th>
                              <th className="text-right font-semibold py-0.5">Now</th>
                              <th className="text-right font-semibold py-0.5">In backup</th>
                              <th className="text-right font-semibold py-0.5">Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowDifferences.map((d) => (
                              <tr key={d.table}>
                                <td className="py-0.5 font-mono">{d.table}</td>
                                <td className="py-0.5 text-right font-mono">{d.live.toLocaleString()}</td>
                                <td className="py-0.5 text-right font-mono">{d.file.toLocaleString()}</td>
                                <td className="py-0.5 text-right font-mono font-bold">
                                  {d.file - d.live > 0 ? '+' : ''}{(d.file - d.live).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1.5 text-amber-800">
                          A small difference in <span className="font-mono">activity_logs</span> is
                          normal and expected: a backup cannot contain the log entry recording that
                          it was taken. A difference anywhere else is worth understanding before you
                          restore.
                        </p>
                      </details>
                    )}
                  </div>
                )}

                {!payload ? (
                  <div className="space-y-2.5 border-t border-slate-100 pt-3">
                    {candidate.hint && (
                      <p className="text-[11px] text-slate-600">
                        <span className="font-semibold">Reminder saved with this file:</span> {candidate.hint}
                      </p>
                    )}
                    <div className="sm:max-w-sm">
                      <PassphraseField
                        label="Passphrase for this backup"
                        value={unlockPass}
                        onChange={setUnlockPass}
                        show={showUnlock}
                        onToggleShow={() => setShowUnlock((s) => !s)}
                        placeholder="Enter the passphrase"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      onClick={handleUnlock}
                      disabled={!unlockPass || !!busy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      {busy === 'unlock' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                      {busy === 'unlock' ? 'Opening…' : 'Open and check this backup'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    {/* File integrity: the header's own total against the rows
                        actually present. A truncated download fails here. */}
                    {check && !check.intact && (
                      <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                        This file says it holds {check.declaredRows.toLocaleString()} records but
                        contains {check.actualRows.toLocaleString()}. It is damaged or incomplete —
                        most likely an interrupted download. Use another copy.
                      </p>
                    )}

                    {blockingDiffs.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                        <p className="text-[11px] font-bold text-rose-900 mb-1.5">
                          This backup cannot be restored into the current database:
                        </p>
                        <ul className="space-y-1">
                          {blockingDiffs.map((d, i) => <DifferenceRow key={i} diff={d} />)}
                        </ul>
                        <p className="text-[11px] text-rose-800 mt-1.5">
                          Use a more recent backup, or restore this one into a system at the matching
                          version.
                        </p>
                      </div>
                    )}

                    {otherDiffs.length > 0 && (
                      <details>
                        <summary className="text-[11px] font-semibold text-slate-600 cursor-pointer hover:text-slate-800 list-none inline-flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" />
                          {otherDiffs.length} difference{otherDiffs.length === 1 ? '' : 's'} that will not stop the restore
                        </summary>
                        <ul className="space-y-1 mt-2">
                          {otherDiffs.map((d, i) => <DifferenceRow key={i} diff={d} />)}
                        </ul>
                      </details>
                    )}

                    {check?.restorable && check?.intact && blockingDiffs.length === 0 && otherDiffs.length === 0 && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                        This backup is intact and fits the current database.
                      </p>
                    )}

                    {/* The rehearsal. The whole point of this page's design: you
                        can prove a backup works without spending the database to
                        find out. */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2.5 space-y-2">
                      <p className="text-[11px] text-slate-600">
                        <strong className="text-slate-800">Test it first.</strong> A rehearsal performs
                        the entire restore and then undoes it, so you find out whether this backup
                        really works without risking anything. It takes as long as the real restore.
                      </p>
                      <button
                        onClick={handleRehearse}
                        disabled={!canRestore || !!busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        {busy === 'rehearse' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                        {busy === 'rehearse' ? 'Rehearsing…' : 'Test this backup'}
                      </button>
                      {rehearsal && (
                        <p className="text-[11px] text-emerald-800 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                          Rehearsed successfully and rolled back.{' '}
                          {Number(rehearsal.rows_restored || 0).toLocaleString()} records across{' '}
                          {rehearsal.tables_restored} tables would be restored
                          {Number(rehearsal.profiles_skipped_missing_login || 0) > 0 && <>, with {rehearsal.profiles_skipped_missing_login} person record(s) skipped for missing sign-in accounts</>}.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                        Type {RESTORE_PHRASE} to confirm
                      </label>
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        placeholder={RESTORE_PHRASE}
                        autoComplete="off"
                        className="w-full sm:w-56 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
                      />
                    </div>

                    <button
                      onClick={() => setConfirmRestore(true)}
                      disabled={!phraseOk || !canRestore || !!busy || !check?.intact}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      {busy === 'restore' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      {busy === 'restore' ? 'Restoring…' : 'Restore this backup'}
                    </button>
                    {!rehearsal && canRestore && check?.intact && (
                      <p className="text-[10px] text-slate-400">
                        You can restore without rehearsing, but a rehearsal costs nothing but time.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {result && (
              <div className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-3.5 space-y-2">
                <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Restore complete
                </p>
                <p className="text-[11px] text-emerald-800">
                  {Number(result.rows_restored || 0).toLocaleString()} records restored across{' '}
                  {result.tables_restored} tables.
                </p>
                {Number(result.profiles_skipped_missing_login || 0) > 0 && (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    {result.profiles_skipped_missing_login} person record(s) in the backup could not be
                    restored because their sign-in account no longer exists. Re-create those accounts
                    through Import Users if they are still needed.
                  </p>
                )}
                {Array.isArray(result.tables_left_empty) && result.tables_left_empty.length > 0 && (
                  <p className="text-[11px] text-slate-600">
                    Left empty because the backup did not contain them:{' '}
                    {result.tables_left_empty.map((t) => t.table).join(', ')}.
                  </p>
                )}
                <p className="text-[11px] text-emerald-800">
                  Signing in is unaffected: a restore replaces records, not login accounts, so
                  everyone keeps the password they already had.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── History ─────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-3.5 sm:px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">History</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Every backup, test, restore, and storage cleanup, with who did it. This history is
              never replaced by a restore.
            </p>
          </div>
          {loading ? (
            <p className="text-xs text-slate-400 px-3.5 sm:px-5 py-4">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400 px-3.5 sm:px-5 py-4">Nothing yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((h) => (
                <div key={h.id} className="px-3.5 sm:px-5 py-2.5 flex items-start gap-2.5">
                  <span className={cn(
                    'text-micro font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border flex-shrink-0 mt-0.5',
                    h.kind === 'restore'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : h.kind === 'rehearsal'
                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : h.kind === 'storage_cleanup'
                          ? 'bg-slate-50 text-slate-600 border-slate-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  )}>
                    {h.kind === 'storage_cleanup' ? 'Cleanup'
                      : h.kind === 'restore' ? 'Restore'
                        : h.kind === 'rehearsal' ? 'Test' : 'Backup'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-xs text-slate-700">{h.notes}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {h.performedBy && <>{h.performedBy} · </>}
                      {new Date(h.performedAt).toLocaleString('en-PH')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <OutcomeModal
        kind={outcomeKind}
        outcome={outcomeKind === 'rehearsal' ? rehearsal : outcomeKind === 'restore' ? result : null}
        onClose={() => setOutcomeKind('')}
      />

      <ConfirmModal
        isOpen={confirmRestore}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={handleRestore}
        title="Replace everything with this backup?"
        message={`Every record in the system will be deleted and replaced with the ${Number(candidate?.rowCount || 0).toLocaleString()} records in this file. Anything added since ${candidate?.takenAt ? new Date(candidate.takenAt).toLocaleString('en-PH') : 'the backup was taken'} will be gone. This cannot be undone.`}
      />
    </>
  );
}

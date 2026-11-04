import { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  MessageSquare, CheckCircle2, Clock, AlertTriangle, Lock, Loader2,
  Plus, Info, Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import {
  MILESTONE_LABEL, fetchWindowsForClasses, fetchNotesForWindow,
  logConsultation, finalizeMilestone, countOpenPlansForMilestone
} from '../../lib/gradeConsultationService';

// Faculty-driven record of who actually reached out about a posted progress
// grade, replacing the retired student-initiated consultation request feature.
//
// The window opens by itself when Midterm Rating or Tentative Final Rating is
// posted. While it is open the faculty may still correct the scores behind that
// milestone; clicking Finalize closes the record and locks them. Semestral
// Grade never appears here -- it is the summary of the two and locks on posting.
//
// "Nobody reached out" is a legitimate outcome, recorded as zero notes. That is
// the point of the log: it is evidence either way, which is what makes it a
// bias-prevention record rather than a complaints box.

export default function GradeConsultationLog() {
  const { user, profile } = useAuth();
  const userId = user?.id;

  const [classes, setClasses] = useState([]);
  const [windows, setWindows] = useState([]);
  const [selected, setSelected] = useState(null);     // { window, cls }
  const [roster, setRoster] = useState([]);
  const [notes, setNotes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [noteStudent, setNoteStudent] = useState('');
  const [noteText, setNoteText] = useState('');
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  // Finalizing closes every open action plan on the periods behind this
  // milestone. Shown before the click, never blocking it.
  const [openPlans, setOpenPlans] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: myClasses, error: clsErr } = await supabase
        .from('class_records')
        .select('class_record_id, school_year, semester, subject_id, section_id, subjects:subject_id(code, name), sections:section_id(name)')
        .eq('faculty_id', userId)
        .eq('status', 'active');
      if (clsErr) throw clsErr;

      const list = myClasses || [];
      setClasses(list);
      setWindows(await fetchWindowsForClasses(list.map((c) => c.class_record_id)));
    } catch (err) {
      setError(toUserMessage(err, 'Could not load your consultation records.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const classById = useMemo(
    () => new Map(classes.map((c) => [c.class_record_id, c])),
    [classes]
  );

  const rows = useMemo(
    () =>
      windows
        .map((w) => ({ window: w, cls: classById.get(w.class_record_id) }))
        .filter((r) => r.cls)
        .sort((a, b) => {
          // Open records first: they are the ones needing attention.
          if (!!a.window.finalized_at !== !!b.window.finalized_at) {
            return a.window.finalized_at ? 1 : -1;
          }
          return new Date(b.window.opened_at) - new Date(a.window.opened_at);
        }),
    [windows, classById]
  );

  const openSelected = async (row) => {
    setSelected(row);
    setNoteStudent('');
    setNoteText('');
    setError('');
    setNotice('');
    try {
      const [rosterRows, noteRows] = await Promise.all([
        supabase
          .from('enrollments')
          .select('student_id, users:student_id(first_name, last_name, user_number)')
          .eq('subject_id', row.cls.subject_id)
          .eq('section_id', row.cls.section_id),
        fetchNotesForWindow(row.window.id)
      ]);
      if (rosterRows.error) throw rosterRows.error;
      setRoster(
        (rosterRows.data || [])
          .map((r) => ({
            studentId: r.student_id,
            name: `${r.users?.last_name || ''}, ${r.users?.first_name || ''}`.trim(),
            userNumber: r.users?.user_number || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setNotes(noteRows);
    } catch (err) {
      setError(toUserMessage(err, 'Could not open that consultation record.'));
    }
  };

  const addNote = async () => {
    if (!noteStudent || !noteText.trim()) return;
    setBusy(true);
    setError('');
    try {
      await logConsultation(selected.window.id, noteStudent, noteText.trim());
      setNotes(await fetchNotesForWindow(selected.window.id));
      setNoteStudent('');
      setNoteText('');
      setNotice('Consultation recorded.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not record that consultation.'));
    } finally {
      setBusy(false);
    }
  };

  const doFinalize = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await finalizeMilestone(selected.window.id);
      await logActivity(
        'Grade Finalized',
        `Finalized ${MILESTONE_LABEL[selected.window.grade_period]} for ${selected.cls.subjects?.code} ${selected.cls.sections?.name} with ${result?.notes_logged ?? 0} consultation(s) recorded.`,
        resolveActorName(profile, user)
      );
      setConfirmFinalize(false);
      setNotice('Finalized. The scores behind this grade are now locked.');
      await load();
      setSelected((prev) =>
        prev ? { ...prev, window: { ...prev.window, finalized_at: new Date().toISOString() } } : prev
      );
    } catch (err) {
      setError(toUserMessage(err, 'Could not finalize this grade.'));
    } finally {
      setBusy(false);
    }
  };

  const isOpen = selected && !selected.window.finalized_at;

  return (
    <>
      <PageHeader title="Grade Consultation Log" breadcrumb="Faculty Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        <div className="bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-sage-900 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            A record opens on its own when you post a <strong>Midterm Rating</strong> or{' '}
            <strong>Tentative Final Rating</strong>. While it is open you can still correct the
            scores behind that grade. <strong>Finalize</strong> closes the record and locks them —
            after that, a change needs a request from the student. Semestral Grade is not listed
            here: it summarises these two and locks when posted.
          </span>
        </div>

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

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <MessageSquare className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No consultation records yet</p>
            <p className="text-xs text-slate-400 mt-1">
              One opens automatically when you post a Midterm or Tentative Final Rating.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-3.5">
            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100 h-fit">
              {rows.map((row) => {
                const open = !row.window.finalized_at;
                const active = selected?.window.id === row.window.id;
                return (
                  <button
                    key={row.window.id}
                    onClick={() => openSelected(row)}
                    className={cn(
                      'w-full text-left p-3.5 flex items-start gap-2.5 transition-colors cursor-pointer',
                      active ? 'bg-sage-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0',
                      open
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    )}>
                      {open ? <Clock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {row.cls.subjects?.code} · {row.cls.sections?.name}
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                        {MILESTONE_LABEL[row.window.grade_period]}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {open ? 'Open for consultation' : 'Finalized'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail */}
            {!selected ? (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
                <MessageSquare className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
                <p className="text-sm font-medium text-slate-600">Select a record</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                        {selected.cls.subjects?.code} · {selected.cls.sections?.name}
                      </h2>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                        {MILESTONE_LABEL[selected.window.grade_period]} · opened{' '}
                        {new Date(selected.window.opened_at).toLocaleString('en-PH')}
                      </p>
                    </div>
                    {isOpen ? (
                      <button
                        onClick={() => {
                          setOpenPlans(0);
                          countOpenPlansForMilestone(selected.cls.class_record_id, selected.window.grade_period)
                            .then(setOpenPlans)
                            .catch(() => setOpenPlans(0));
                          setConfirmFinalize(true);
                        }}
                        disabled={busy}
                        className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                      >
                        <Lock className="h-4 w-4" />
                        Finalize grade
                      </button>
                    ) : (
                      <span className="text-[11px] sm:text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg flex-shrink-0">
                        Finalized {new Date(selected.window.finalized_at).toLocaleDateString('en-PH')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Log a consultation */}
                {isOpen && (
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-2.5">
                    <h3 className="text-xs sm:text-sm font-semibold font-display text-slate-900">
                      Record a consultation
                    </h3>
                    <select
                      value={noteStudent}
                      onChange={(e) => setNoteStudent(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer"
                    >
                      <option value="">Which student reached out?</option>
                      {roster.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.name} — {s.userNumber}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={2}
                      placeholder="What was it about, and what did you confirm or change?"
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={addNote}
                        disabled={busy || !noteStudent || !noteText.trim()}
                        className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Record
                      </button>
                      <span className="text-[10px] text-slate-400">
                        Only this student sees their own entry.
                      </span>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="px-3.5 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Users className="h-4 w-4 text-sage-700" />
                    <h3 className="text-xs sm:text-sm font-semibold font-display text-slate-900">
                      {notes.length} consultation{notes.length === 1 ? '' : 's'} recorded
                    </h3>
                  </div>
                  {notes.length === 0 ? (
                    <p className="p-5 text-xs text-slate-500 text-center">
                      Nobody has been recorded yet. Finalizing with none is a valid outcome — it
                      records that no one raised a concern.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notes.map((n) => (
                        <div key={n.id} className="p-3.5">
                          <p className="text-xs sm:text-sm font-medium text-slate-900">
                            {n.studentName}{' '}
                            <span className="font-mono text-[10px] text-slate-500">{n.userNumber}</span>
                          </p>
                          <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5">{n.note}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(n.createdAt).toLocaleString('en-PH')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Finalize confirmation. States the count either way, including zero,
          so nobody finalizes while mistaken about what the record contains. */}
      {confirmFinalize && selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3.5">
            <h3 className="text-base font-bold font-display text-slate-900">
              Finalize {MILESTONE_LABEL[selected.window.grade_period]}?
            </h3>
            <div className={cn(
              'rounded-xl border px-3 py-2.5 text-xs',
              notes.length === 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            )}>
              {notes.length === 0
                ? 'No consultations were recorded for this class. Finalizing now records that nobody raised a concern during the window.'
                : `${notes.length} consultation${notes.length === 1 ? '' : 's'} recorded for this class.`}
            </div>
            {openPlans > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <strong>{openPlans} action plan{openPlans === 1 ? '' : 's'} on this period {openPlans === 1 ? 'is' : 'are'} still open.</strong>
                <span className="block text-slate-600 mt-0.5">
                  Finalizing closes {openPlans === 1 ? 'it' : 'them'} and records {openPlans === 1 ? 'it' : 'them'} as
                  unfinished unless every task has been verified. The student and the Dean are told. Review first, or finalize anyway.
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              The scores behind this grade lock. Changing it afterwards needs a request from the
              student. This cannot be reopened.
            </p>
            <div className="flex gap-2">
              <button
                onClick={doFinalize}
                disabled={busy}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Finalize
              </button>
              <button
                onClick={() => setConfirmFinalize(false)}
                disabled={busy}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

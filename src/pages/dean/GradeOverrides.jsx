import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Loader2, MessageSquareWarning, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import {
  fetchGradeOverridesForReview,
  acknowledgeGradeOverride
} from '../../lib/gradePostingService';

// Registrar overrides awaiting this college's acknowledgement.
//
// WHAT THIS PAGE IS NOT
//   It is not an approval queue. Every grade listed here has ALREADY changed,
//   and nothing on this screen can change it back. The Registrar holds the
//   authority; what the Dean holds is the record of having looked.
//
//   That distinction is the whole design, so the page says it out loud rather
//   than letting a reader assume a pending row means a pending grade.
//
// WHY THE DEAN AND NOT THE REGISTRAR
//   The Registrar is institution-wide and does not know the student, the
//   instructor, or whether 2.00 is a plausible figure for this person in this
//   subject. The Dean of the college does. Objective 7 asks for controlled
//   correction; on this path the control is a second pair of eyes that can
//   actually tell.

const FILTERS = [
  { id: 'pending', label: 'Needs acknowledgement', state: 'pending' },
  { id: 'decided', label: 'Decided', state: null }
];

function gradeText(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toFixed(2);
}

function Delta({ label, before, after, mono = true }) {
  const changed = String(before ?? '') !== String(after ?? '');
  return (
    <div className="text-xs">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={mono ? 'font-mono' : ''}>
        <span className="text-slate-500">{before ?? '—'}</span>
        <span className="mx-1.5 text-slate-400">→</span>
        <span className={changed ? 'font-semibold text-rose-700' : 'text-slate-600'}>{after ?? '—'}</span>
      </span>
    </div>
  );
}

export default function DeanGradeOverrides() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState('');
  const [queryDraft, setQueryDraft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchGradeOverridesForReview());
    } catch (err) {
      setError(err.message || 'The override list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = rows.filter((r) => r.state === 'pending').length;
  const visible = rows.filter((r) => (filter === 'pending' ? r.state === 'pending' : r.state !== 'pending'));

  const decide = async (row, state, note) => {
    setBusy(row.operationId);
    setError('');
    try {
      await acknowledgeGradeOverride({ operationId: row.operationId, state, note });
      setQueryDraft(null);
      await load();
    } catch (err) {
      setError(err.message || 'That decision could not be saved.');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="Grade Overrides" breadcrumb="Dean Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">

        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex gap-3 text-xs leading-relaxed">
          <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <strong>These grades have already changed.</strong>
            <p className="text-slate-600 mt-0.5">
              The Registrar may correct an official grade where the normal
              request chain cannot run. You cannot reverse one here, and nothing
              is waiting on you to take effect. What you can do is acknowledge
              that you have seen it, or query it — and a query stays on the
              record permanently.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                filter === tab.id
                  ? 'border-sage-400 bg-sage-100 text-sage-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              {tab.id === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 rounded-md bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] text-rose-700">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={load}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading overrides…
          </p>
        ) : !visible.length ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {filter === 'pending'
              ? 'No overrides are waiting for your acknowledgement.'
              : 'No override in your college has been decided yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((row) => {
              const querying = queryDraft?.id === row.operationId;
              return (
                <article key={row.operationId} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display font-semibold text-sm">{row.studentName || 'Unknown student'}</h2>
                      <p className="font-mono text-xs text-slate-500">{row.studentNumber}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        {row.subjectCode} {row.subjectName && `· ${row.subjectName}`} · {row.sectionName}
                      </p>
                    </div>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                      row.state === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : row.state === 'queried' ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}>
                      {row.state === 'pending' ? 'Needs acknowledgement'
                        : row.state === 'queried' ? 'Queried' : 'Acknowledged'}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 rounded-lg bg-slate-50 p-3">
                    <Delta label="SG %" before={gradeText(row.previous.computed)} after={gradeText(row.next.computed)} />
                    <Delta label="Effective GWA" before={gradeText(row.previous.effective)} after={gradeText(row.next.effective)} />
                    <Delta label="Standing" before={row.previous.remark} after={row.next.remark} mono={false} />
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Applied {row.committedAt ? new Date(row.committedAt).toLocaleString('en-PH') : 'at an unrecorded time'}
                  </p>

                  {row.state !== 'pending' && (
                    <p className="text-xs text-slate-600">
                      {row.state === 'queried' ? 'Queried' : 'Acknowledged'}
                      {row.acknowledgedAt && ` ${new Date(row.acknowledgedAt).toLocaleString('en-PH')}`}
                      {row.note && ` — ${row.note}`}
                    </p>
                  )}

                  {row.state === 'pending' && !querying && (
                    <>
                    {/* Two unexplained verbs on a screen about grades is an
                        invitation to guess, and the likely guess -- approve /
                        reject -- is the one thing neither button does. */}
                    <dl className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed">
                      <div className="flex gap-1.5">
                        <dt className="font-semibold text-emerald-700 shrink-0">Acknowledge:</dt>
                        <dd className="text-slate-600">I have seen this change and I do not object to it.</dd>
                      </div>
                      <div className="flex gap-1.5 mt-1">
                        <dt className="font-semibold text-rose-700 shrink-0">Query:</dt>
                        <dd className="text-slate-600">
                          I have seen it and I do object. The Registrar is told, with your reason,
                          and it stays on the record — but <strong>the grade does not change back</strong>.
                        </dd>
                      </div>
                      <p className="mt-1.5 text-slate-400">Either way the decision is final and cannot be redone.</p>
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => decide(row, 'acknowledged', '')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {busy === row.operationId ? 'Saving…' : 'Acknowledge'}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => setQueryDraft({ id: row.operationId, note: '' })}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 cursor-pointer"
                      >
                        <MessageSquareWarning className="h-3 w-3" /> Query this
                      </button>
                    </div>
                    </>
                  )}

                  {querying && (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => { event.preventDefault(); decide(row, 'queried', queryDraft.note); }}
                    >
                      <label className="block text-xs font-semibold">
                        What is your objection? This stays on the record and is sent to the Registrar.
                        <textarea
                          autoFocus
                          required
                          maxLength={1000}
                          value={queryDraft.note}
                          onChange={(e) => setQueryDraft({ id: row.operationId, note: e.target.value })}
                          className="mt-1 block w-full min-h-20 rounded-lg border border-slate-200 p-2 text-xs"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={Boolean(busy) || !queryDraft.note.trim()}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40 cursor-pointer"
                        >
                          <Check className="h-3 w-3" />
                          {busy === row.operationId ? 'Saving…' : 'Record the query'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => setQueryDraft(null)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

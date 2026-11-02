import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { MessageSquare, AlertTriangle, Lock, Clock, Info } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { fetchStudentConsultationHistory } from '../../lib/gradeConsultationService';

// A student's record of consultations their faculty logged about a posted
// grade, replacing the retired self-service "request a consultation" form.
//
// Deliberately read-only and faculty-driven. There is no request button,
// because this is a record of what happened rather than a channel for asking —
// an empty state that invited requests would promise something the process does
// not offer.
//
// Grouped per term so older semesters read as history rather than clutter,
// matching how the rest of the system treats past terms.

export default function ConsultationHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTerm, setActiveTerm] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        setEntries(await fetchStudentConsultationHistory(user.id));
      } catch (err) {
        setError(toUserMessage(err, 'Could not load your consultation history.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const terms = useMemo(() => {
    const seen = new Map();
    for (const e of entries) {
      const key = `${e.schoolYear} · ${e.semester}`;
      if (!seen.has(key)) seen.set(key, { key, schoolYear: e.schoolYear, semester: e.semester, count: 0 });
      seen.get(key).count += 1;
    }
    return [...seen.values()].sort((a, b) => b.schoolYear.localeCompare(a.schoolYear));
  }, [entries]);

  useEffect(() => {
    if (!activeTerm && terms.length) setActiveTerm(terms[0].key);
  }, [terms, activeTerm]);

  const visible = entries.filter((e) => `${e.schoolYear} · ${e.semester}` === activeTerm);

  return (
    <>
      <PageHeader title="Consultations" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <MessageSquare className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No consultations recorded</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              When you raise a question about a posted grade and your instructor records it, it
              appears here. To raise one, contact your instructor directly.
            </p>
          </div>
        ) : (
          <>
            {terms.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {terms.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTerm(t.key)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                      activeTerm === t.key
                        ? 'bg-sage-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {t.key}
                    <span className="ml-1.5 font-mono tabular-nums opacity-70">{t.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {visible.map((e) => (
                <div key={e.id} className="p-3.5 sm:p-4 flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0',
                    e.finalizedAt
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  )}>
                    {e.finalizedAt ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {e.subjectCode} — {e.milestoneLabel}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-600 mt-1">{e.note}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {e.facultyName && <>Recorded by {e.facultyName} · </>}
                      {new Date(e.createdAt).toLocaleString('en-PH')}
                      {e.finalizedAt && <> · grade finalized</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            While a grade shows <strong>Posted — Not Finalized</strong>, your instructor can still
            correct it directly. Once it is <strong>Finalized</strong>, a change needs a formal
            grade change request.
          </span>
        </div>
      </div>
    </>
  );
}

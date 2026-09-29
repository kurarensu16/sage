import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X
} from 'lucide-react';
import { getAskAspireResponse } from '../../lib/openrouter';

const SUGGESTED_QUESTIONS = [
  'Why was this identified?',
  'What affected my performance most?',
  'What should I work on first?',
  'What can I realistically do this week?'
];

export default function AskAspirePanel({ open, context, onClose, onRequestConsultation }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const contextKey = context?.contextKey;
  const subjectCode = context?.subject?.code;
  const subjectName = context?.subject?.name;
  const advisorHeadline = context?.deterministicAdvisor?.headline;

  useEffect(() => {
    if (!open || !contextKey) return;
    const subjectLabel = subjectCode
      ? `${subjectCode} — ${subjectName}`
      : 'your overall academic standing';
    setMessages([{
      id: `welcome-${contextKey}`,
      role: 'assistant',
      content: `I can explain the insight for ${subjectLabel}, show which records support it, and help you choose a practical next step. Current status: ${advisorHeadline || 'Reviewing available academic evidence'}.`
    }]);
    setQuestion('');
    setError('');
  }, [open, contextKey, subjectCode, subjectName, advisorHeadline]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!open || !context) return null;

  const submitQuestion = async (value) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;

    const messageSequence = messages.length;
    const userMessage = { id: `user-${messageSequence}`, role: 'user', content: trimmed };
    const priorMessages = messages.filter(message => !message.id.startsWith('welcome-'));
    setMessages(previous => [...previous, userMessage]);
    setQuestion('');
    setError('');
    setLoading(true);

    try {
      const answer = await getAskAspireResponse({
        question: trimmed,
        context,
        history: priorMessages
      });
      setMessages(previous => [
        ...previous,
        { id: `assistant-${messageSequence}`, role: 'assistant', content: answer }
      ]);
    } catch (err) {
      console.warn('Ask ASPIRE response failed:', err);
      setError('Ask ASPIRE is temporarily unavailable. Your academic insight and evidence are still available below.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitQuestion(question);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ask-aspire-title">
      <button
        type="button"
        aria-label="Close Ask ASPIRE"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/35 cursor-pointer"
      />

      <section className="relative h-full w-full max-w-xl bg-slate-50 shadow-2xl flex flex-col animate-fade-in">
        <header className="bg-sage-950 text-white px-5 py-4 sm:px-6 border-b border-sage-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-sage-800 p-2 text-sage-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="ask-aspire-title" className="font-display text-lg font-extrabold">Ask ASPIRE</h2>
                  <span className="rounded-full border border-sage-700 bg-sage-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sage-200">
                    Academic advisor
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sage-200">
                  Ask follow-up questions about the insight and its supporting records.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ask ASPIRE"
              className="rounded-lg p-2 text-sage-200 hover:bg-sage-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-sage-800 bg-sage-900/80 px-3 py-2.5">
            <BookOpen className="h-4 w-4 shrink-0 text-sage-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">
                {context.subject?.code ? `${context.subject.code} — ${context.subject.name}` : 'Overall academic standing'}
              </p>
              <p className="text-[11px] text-sage-300">{context.periodLabel || 'Latest official milestones'}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div className={message.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-sage-700 px-4 py-3 text-sm leading-relaxed text-white'
                  : 'max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-xs'
                }>
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-500 shadow-xs">
                  <LoaderCircle className="h-4 w-4 animate-spin text-sage-600" />
                  Reviewing the supporting records…
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <div className="mt-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Suggested questions</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submitQuestion(suggestion)}
                    className="rounded-xl border border-sage-200 bg-white px-3 py-2 text-left text-xs font-semibold text-sage-800 hover:bg-sage-50 transition-colors cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-slate-800">
              <ShieldCheck className="h-4 w-4 text-sage-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Evidence available to ASPIRE</h3>
            </div>
            <div className="mt-3 space-y-2">
              {(context.evidence || []).map(item => (
                <div key={`${item.label}-${item.value}`} className="flex items-start justify-between gap-4 text-xs">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-right font-semibold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <label className="sr-only" htmlFor="ask-aspire-question">Ask ASPIRE a question</label>
            <textarea
              id="ask-aspire-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitQuestion(question);
                }
              }}
              rows={2}
              maxLength={600}
              placeholder="Ask about this insight…"
              className="min-h-12 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-100"
            />
            <button
              type="submit"
              disabled={!question.trim() || loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sage-700 px-4 text-sm font-bold text-white hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[10px] leading-relaxed text-slate-400">
              ASPIRE explains records; it does not change grades or make official decisions.
            </p>
            <button
              type="button"
              onClick={onRequestConsultation}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-sage-700 hover:text-sage-900 cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Ask faculty
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

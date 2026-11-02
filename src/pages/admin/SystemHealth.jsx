import { useState, useEffect, useRef, useCallback } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  Activity, Database, CheckCircle2, AlertTriangle, XCircle, Play, Pause, Info
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

// System Health: is this app's connection to Supabase working right now, and how
// fast is it responding.
//
// Scope is deliberately modest and honest about it. This stack has no backend
// process to monitor -- src/lib/supabase.js is a thin createClient wrapper and
// the only server-side code is a handful of Deno edge functions. So "health"
// here means round-trip latency from the browser, measured, not inferred. It
// does NOT report on Supabase's own infrastructure status; that is Supabase's
// dashboard, outside this app, and claiming otherwise would be misleading during
// an incident.
//
// Thresholds are the confirmed ones: green under 500ms, amber under 2s, red
// beyond that or on any error.

const GREEN_MS = 500;
const AMBER_MS = 2000;
const INTERVAL_MS = 10000;
const HISTORY = 20;

function tierOf(sample) {
  if (!sample || sample.error) return 'red';
  if (sample.ms < GREEN_MS) return 'green';
  if (sample.ms < AMBER_MS) return 'amber';
  return 'red';
}

const TIER_STYLE = {
  green: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', icon: CheckCircle2, label: 'Healthy' },
  amber: { chip: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500', icon: AlertTriangle, label: 'Slow' },
  red: { chip: 'bg-rose-50 text-rose-700 border-rose-200', bar: 'bg-rose-500', icon: XCircle, label: 'Unreachable' }
};

export default function SystemHealth() {
  const [samples, setSamples] = useState([]);
  const [running, setRunning] = useState(true);
  const [probing, setProbing] = useState(false);
  const timer = useRef(null);

  const probe = useCallback(async () => {
    setProbing(true);
    const started = performance.now();
    try {
      // A count-only read of the single system_settings row: the cheapest query
      // that still proves a real round trip through PostgREST and RLS. No rows
      // are transferred.
      const { error } = await supabase
        .from('system_settings')
        .select('id', { head: true, count: 'exact' });
      const ms = Math.round(performance.now() - started);
      setSamples((prev) => [...prev, { at: Date.now(), ms, error: error?.message || null }].slice(-HISTORY));
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      setSamples((prev) => [...prev, { at: Date.now(), ms, error: err?.message || 'Request failed' }].slice(-HISTORY));
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    probe();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [probe]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (running) timer.current = setInterval(probe, INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running, probe]);

  const latest = samples[samples.length - 1] || null;
  const tier = tierOf(latest);
  const style = TIER_STYLE[tier];
  const StatusIcon = style.icon;

  const ok = samples.filter((s) => !s.error);
  const avg = ok.length ? Math.round(ok.reduce((a, s) => a + s.ms, 0) / ok.length) : null;
  const worst = ok.length ? Math.max(...ok.map((s) => s.ms)) : null;
  const failures = samples.filter((s) => s.error).length;
  const peak = Math.max(AMBER_MS, ...ok.map((s) => s.ms), 1);

  return (
    <>
      <PageHeader title="System Health" breadcrumb="Admin Portal">
        <button
          onClick={() => setRunning((v) => !v)}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span className="hidden sm:inline">{running ? 'Pause' : 'Resume'}</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {/* ── Current status ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={cn('w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0', style.chip)}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                  Database connection
                </h2>
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-lg border', style.chip)}>
                  {style.label}
                </span>
              </div>
              {latest ? (
                latest.error ? (
                  <p className="text-[11px] sm:text-xs text-rose-700 mt-1 break-words">{latest.error}</p>
                ) : (
                  <p className="text-[11px] sm:text-xs text-slate-600 mt-1">
                    Round trip{' '}
                    <span className="font-mono font-semibold text-slate-900">{latest.ms} ms</span>
                    {' · '}checked {new Date(latest.at).toLocaleTimeString('en-PH')}
                    {probing && <span className="text-slate-400"> · probing…</span>}
                  </p>
                )
              ) : (
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1">Running first check…</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Rollup ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {[
            { label: 'Latest', value: latest && !latest.error ? `${latest.ms} ms` : '—', icon: Activity },
            { label: 'Average', value: avg !== null ? `${avg} ms` : '—', icon: Activity },
            { label: 'Slowest', value: worst !== null ? `${worst} ms` : '—', icon: AlertTriangle },
            { label: 'Failures', value: String(failures), icon: XCircle }
          ].map((tile) => (
            <div key={tile.label} className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
                <tile.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                  {tile.label}
                </span>
                <span className="text-base sm:text-xl font-bold font-display text-slate-900 leading-tight block truncate">
                  {tile.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Recent samples ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                Recent checks
              </h2>
              <p className="text-[11px] text-slate-500">
                Last {HISTORY} probes, newest at the bottom. One every {INTERVAL_MS / 1000}s.
              </p>
            </div>
          </div>

          {samples.length === 0 ? (
            <p className="text-xs text-slate-400">No samples yet.</p>
          ) : (
            <div className="space-y-1">
              {samples.map((s) => {
                const t = TIER_STYLE[tierOf(s)];
                const width = s.error ? 100 : Math.max(2, Math.round((s.ms / peak) * 100));
                return (
                  <div key={s.at} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400 w-16 flex-shrink-0 tabular-nums">
                      {new Date(s.at).toLocaleTimeString('en-PH', { hour12: false })}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-0">
                      <div className={cn('h-full rounded-full transition-all', t.bar)} style={{ width: `${width}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-600 w-16 text-right flex-shrink-0 tabular-nums">
                      {s.error ? 'error' : `${s.ms} ms`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            This measures <strong>this browser's connection</strong> to the database — green under{' '}
            {GREEN_MS}ms, amber under {AMBER_MS / 1000}s, red beyond that or on error. It does not
            report Supabase's own platform status; check the Supabase dashboard for that. A red
            reading here can equally mean your network rather than the database.
          </span>
        </div>
      </div>
    </>
  );
}

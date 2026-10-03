import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

// Native 2D aggregate table — replaces the earlier react-pivottable integration (item 3.9)
// per product decision 2026-10-03: the actual requirement here is 3 fixed presets plus
// simple row/column/aggregator slicing over a known, small field set, not a full generic
// drag-and-drop pivot engine. Building that logic natively removes the third-party
// dependency and lets the table match the rest of the app's design system directly.

const DIMENSION_FIELDS = ['Student', 'Activity', 'Term', 'Status', 'At-Risk'];
// 'Grade (GWA)' and 'Absences' are per-class facts, repeated identically across every
// activity row for the same student — Average over a group gives the correct value
// (averaging N identical copies), but Sum would multiply it by the activity count, which
// is misleading. Not restricted in the UI; Average/Count are the meaningful choices here.
const VALUE_FIELDS = ['Percentage', 'Score', 'Max Score', 'Grade (GWA)', 'Absences'];
const AGGREGATORS = ['Average', 'Sum', 'Count'];

const PRESETS = [
  {
    key: 'atRisk',
    label: 'At-Risk Students',
    config: { rowField: 'Student', colField: 'Activity', aggregator: 'Average', valField: 'Percentage', onlyAtRisk: true }
  },
  {
    key: 'wholeClass',
    label: 'Whole Class',
    config: { rowField: 'Student', colField: 'Activity', aggregator: 'Average', valField: 'Percentage', onlyAtRisk: false }
  },
  {
    key: 'perActivity',
    label: 'Per Activity',
    config: { rowField: 'Status', colField: 'Activity', aggregator: 'Count', valField: 'Percentage', onlyAtRisk: false }
  }
];

function aggregateValue(matchingRows, aggregator, valField) {
  if (aggregator === 'Count') return matchingRows.length;

  // Number(null) === 0 — an ungraded (null) value must never silently become a real zero
  // and drag an average down. Excluded here, not just filtered after conversion.
  const values = matchingRows
    .map(r => r[valField])
    .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return aggregator === 'Sum' ? sum : sum / values.length;
}

function formatCell(value, aggregator, valField) {
  if (value === null || value === undefined) return '—';
  if (aggregator === 'Count') return String(value);
  // GWA follows the app-wide 2-decimal convention (1.75, not 1.8); everything else
  // (percentages, raw scores) uses 1.
  return value.toFixed(valField === 'Grade (GWA)' ? 2 : 1);
}

// Builds row/column headers in first-appearance order (matches the order the underlying
// dataset already arrives in — roster order for students, creation order for activities —
// rather than re-sorting and surprising anyone comparing this against the Summary/Grid tabs).
function uniqueInOrder(rows, field) {
  const seen = new Set();
  const ordered = [];
  rows.forEach(r => {
    const value = r[field] ?? '—';
    if (!seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  });
  return ordered;
}

export default function ReportsPivotPanel({ rows = [] }) {
  const [rowField, setRowField] = useState(PRESETS[1].config.rowField);
  const [colField, setColField] = useState(PRESETS[1].config.colField);
  const [aggregator, setAggregator] = useState(PRESETS[1].config.aggregator);
  const [valField, setValField] = useState(PRESETS[1].config.valField);
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);
  const [activePreset, setActivePreset] = useState(PRESETS[1].key);

  const applyPreset = (preset) => {
    setRowField(preset.config.rowField);
    setColField(preset.config.colField);
    setAggregator(preset.config.aggregator);
    setValField(preset.config.valField);
    setOnlyAtRisk(preset.config.onlyAtRisk);
    setActivePreset(preset.key);
  };

  const filteredRows = useMemo(
    () => onlyAtRisk ? rows.filter(r => r['At-Risk'] === 'Yes') : rows,
    [rows, onlyAtRisk]
  );

  const pivot = useMemo(() => {
    const rowValues = uniqueInOrder(filteredRows, rowField);
    const colValues = uniqueInOrder(filteredRows, colField);

    const matrix = rowValues.map(rv => {
      const rowMatches = filteredRows.filter(r => (r[rowField] ?? '—') === rv);
      const cells = colValues.map(cv => {
        const cellMatches = rowMatches.filter(r => (r[colField] ?? '—') === cv);
        return aggregateValue(cellMatches, aggregator, valField);
      });
      const rowTotal = aggregateValue(rowMatches, aggregator, valField);
      return { rowValue: rv, cells, rowTotal };
    });

    const colTotals = colValues.map(cv => {
      const colMatches = filteredRows.filter(r => (r[colField] ?? '—') === cv);
      return aggregateValue(colMatches, aggregator, valField);
    });
    const grandTotal = aggregateValue(filteredRows, aggregator, valField);

    return { rowValues, colValues, matrix, colTotals, grandTotal };
  }, [filteredRows, rowField, colField, aggregator, valField]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-sage-500 flex-shrink-0" />
        <span className="text-[11px] uppercase text-slate-400 font-semibold mr-1">Presets:</span>
        {PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            id={`pivot-preset-${preset.key}`}
            onClick={() => applyPreset(preset)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer",
              activePreset === preset.key
                ? "bg-sage-600 text-white border-sage-600"
                : "bg-sage-50 hover:bg-sage-100 text-sage-700 border-sage-200"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          Rows
          <select
            id="pivot-row-field"
            value={rowField}
            onChange={(e) => { setRowField(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500"
          >
            {DIMENSION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          Columns
          <select
            id="pivot-col-field"
            value={colField}
            onChange={(e) => { setColField(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500"
          >
            {DIMENSION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          Aggregate
          <select
            id="pivot-aggregator"
            value={aggregator}
            onChange={(e) => { setAggregator(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500"
          >
            {AGGREGATORS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        {aggregator !== 'Count' && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Of
            <select
              id="pivot-val-field"
              value={valField}
              onChange={(e) => { setValField(e.target.value); setActivePreset(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500"
            >
              {VALUE_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
          <input
            id="pivot-only-at-risk"
            type="checkbox"
            checked={onlyAtRisk}
            onChange={(e) => { setOnlyAtRisk(e.target.checked); setActivePreset(null); }}
            className="rounded border-slate-300 text-sage-600 focus:ring-sage-500"
          />
          At-risk only
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-xs">
          No graded activity data available to pivot yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-2 px-3 text-left font-bold text-slate-700">{rowField}</th>
                {pivot.colValues.map(cv => (
                  <th key={String(cv)} className="py-2 px-3 text-right font-bold text-slate-700">{cv}</th>
                ))}
                <th className="py-2 px-3 text-right font-bold text-slate-900 bg-slate-100">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.matrix.map(row => (
                <tr key={String(row.rowValue)} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 font-semibold text-slate-800">{row.rowValue}</td>
                  {row.cells.map((cell, idx) => (
                    <td key={idx} className="py-2 px-3 text-right font-mono text-slate-700">
                      {formatCell(cell, aggregator, valField)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50">
                    {formatCell(row.rowTotal, aggregator, valField)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-100">
                <td className="py-2 px-3 font-bold text-slate-900">Total</td>
                {pivot.colTotals.map((total, idx) => (
                  <td key={idx} className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                    {formatCell(total, aggregator, valField)}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-200">
                  {formatCell(pivot.grandTotal, aggregator, valField)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

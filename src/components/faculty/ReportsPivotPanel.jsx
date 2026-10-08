import { useState, useMemo } from 'react';
import { Info, LayoutGrid, BarChart2, Download, ArrowRightLeft } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '../../lib/utils';
import { exportDataBreakdownToExcel } from '../../lib/reportsService';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

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
    key: 'termComp',
    label: 'Term Comparison',
    config: { rowField: 'Student', colField: 'Term', aggregator: 'Average', valField: 'Percentage', tier: 'all', term: 'all', score: 'all' }
  },
  {
    key: 'struggling',
    label: 'Struggling Areas',
    config: { rowField: 'Activity', colField: 'Term', aggregator: 'Average', valField: 'Percentage', tier: 'all', term: 'all', score: 'failing' }
  },
  {
    key: 'topPerformers',
    label: 'Top Performers',
    config: { rowField: 'Student', colField: 'Activity', aggregator: 'Average', valField: 'Percentage', tier: 'Performed well', term: 'all', score: 'all' }
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

export default function ReportsPivotPanel({ rows = [], selectedClass, onShowInfo }) {
  const { user, profile } = useAuth();
  const [rowField, setRowField] = useState(PRESETS[0].config.rowField);
  const [colField, setColField] = useState(PRESETS[0].config.colField);
  const [aggregator, setAggregator] = useState(PRESETS[0].config.aggregator);
  const [valField, setValField] = useState(PRESETS[0].config.valField);
  
  // Dynamic Filters
  const [tierFilter, setTierFilter] = useState('all');
  const [termFilter, setTermFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  
  // Views
  const [viewMode, setViewMode] = useState('grid');
  const [chartType, setChartType] = useState('bar');
  const [chartSwapAxes, setChartSwapAxes] = useState(false);

  const [activePreset, setActivePreset] = useState(PRESETS[0].key);

  const applyPreset = (preset) => {
    setRowField(preset.config.rowField);
    setColField(preset.config.colField);
    setAggregator(preset.config.aggregator);
    setValField(preset.config.valField);
    setTierFilter(preset.config.tier);
    setTermFilter(preset.config.term);
    setScoreFilter(preset.config.score);
    setActivePreset(preset.key);
  };

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // 1. Tier Filter
      if (tierFilter !== 'all') {
        // Special case: 'At-Risk' is a boolean flag, others are overallStatus strings
        if (tierFilter === 'At-Risk' && r['At-Risk'] !== 'Yes') return false;
        if (tierFilter !== 'At-Risk' && r.Tier !== tierFilter) return false;
      }
      
      // 2. Term Filter
      if (termFilter !== 'all' && r.Term !== termFilter) return false;

      // 3. Score Filter
      if (scoreFilter !== 'all') {
        const pct = Number(r.Percentage);
        if (isNaN(pct)) return false; // Exclude ungraded
        
        if (scoreFilter === 'failing' && pct >= 75) return false;
        if (scoreFilter === 'borderline' && (pct < 75 || pct >= 85)) return false;
        if (scoreFilter === 'excellent' && pct < 85) return false;
      }

      return true;
    });
  }, [rows, tierFilter, termFilter, scoreFilter]);

  const pivot = useMemo(() => {
    let rowValues = uniqueInOrder(filteredRows, rowField);
    let colValues = uniqueInOrder(filteredRows, colField);

    const sortActivitiesByTerm = (values) => {
      const termOrder = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
      const getTerm = (act) => filteredRows.find(r => r.Activity === act)?.Term || 'Other';
      return [...values].sort((a, b) => {
        const termA = getTerm(a);
        const termB = getTerm(b);
        const idxA = termOrder.indexOf(termA);
        const idxB = termOrder.indexOf(termB);
        if (idxA !== -1 && idxB !== -1) {
          if (idxA !== idxB) return idxA - idxB;
          return String(a).localeCompare(String(b));
        }
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return termA.localeCompare(termB) || String(a).localeCompare(String(b));
      });
    };

    if (rowField === 'Activity') rowValues = sortActivitiesByTerm(rowValues);
    if (colField === 'Activity') colValues = sortActivitiesByTerm(colValues);

    const colGroups = [];
    if (colField === 'Activity') {
      let currentTerm = null;
      let currentGroup = null;
      colValues.forEach(cv => {
        const term = filteredRows.find(r => r.Activity === cv)?.Term || 'Other';
        if (term !== currentTerm) {
          if (currentGroup) colGroups.push(currentGroup);
          currentTerm = term;
          currentGroup = { term, count: 1 };
        } else {
          currentGroup.count++;
        }
      });
      if (currentGroup) colGroups.push(currentGroup);
    }

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

    return { rowValues, colValues, matrix, colTotals, grandTotal, colGroups };
  }, [filteredRows, rowField, colField, aggregator, valField]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Data Breakdown & Configuration</h3>
          <button 
            type="button" 
            onClick={() => onShowInfo?.({
              title: "How to use Data Breakdown",
              hideIcon: true,
              message: (
                <div className="space-y-4 pt-2">
                  <p>
                    The <strong>Data Breakdown</strong> tool allows you to slice and dice class performance data dynamically.
                  </p>
                  
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">1. Quick Presets</h4>
                    <p className="text-xs text-slate-600">
                      Use the preset buttons at the top to instantly configure the table for common scenarios (e.g., comparing terms or finding top performers).
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">2. Customizing the Grid</h4>
                    <p className="text-xs text-slate-600">
                      Change the <strong>Rows</strong> and <strong>Columns</strong> dropdowns to restructure the table. Choose how to <strong>Aggregate</strong> the data and select which metric to calculate.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">3. Visualizing Data</h4>
                    <p className="text-xs text-slate-600">
                      Toggle between <strong>Grid</strong> and <strong>Chart</strong> views using the switch at the top right. While in Chart view, you can swap between Bar, Line, and Radar charts.
                    </p>
                  </div>

                  <div className="bg-sage-50 p-3 rounded-lg border border-sage-100 mt-2">
                    <p className="text-xs text-sage-800 font-medium">
                      💡 <strong>Pro Tip:</strong> Use the <strong>Tier</strong>, <strong>Term</strong>, and <strong>Score</strong> dropdowns to quickly filter out noise and focus on specific groups of students.
                    </p>
                  </div>
                </div>
              )
            })}
            className="text-slate-400 hover:text-sage-600 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
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

        <div className="flex items-center gap-2 ml-auto">


          {/* View Mode Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                viewMode === 'grid' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                viewMode === 'chart' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Chart</span>
            </button>
          </div>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          {/* Export Button */}
          <button
            type="button"
            onClick={() => {
              exportDataBreakdownToExcel({ selectedClass, pivot, aggregator, valField, rowField });
              void logActivity('File Export', `Initiated class data-breakdown Excel export for ${selectedClass?.subjects?.code} - ${selectedClass?.sections?.name}.`, resolveActorName(profile, user));
            }}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-50 hover:bg-sage-100 text-sage-700 border border-sage-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            title="Export Data Breakdown Matrix to Excel"
          >
            <Download className="w-3.5 h-3.5 text-sage-600" />
            <span className="hidden sm:inline">Export Matrix</span>
          </button>
        </div>
      </div>

      {/* Primary Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        
        {/* Dimension & Metric Configuration */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Rows
            <select
              id="pivot-row-field"
              value={rowField}
              onChange={(e) => { setRowField(e.target.value); setActivePreset(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
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
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
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
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
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
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
              >
                {VALUE_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="w-full h-px bg-slate-200 sm:w-px sm:h-auto mx-1"></div>

        {/* Value Filters */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Tier
            <select
              value={tierFilter}
              onChange={(e) => { setTierFilter(e.target.value); setActivePreset(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
            >
              <option value="all">All Tiers</option>
              <option value="At-Risk">At-Risk</option>
              <option value="Struggling">Struggling</option>
              <option value="Average">Average</option>
              <option value="Performed well">Performed Well</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Term
            <select
              value={termFilter}
              onChange={(e) => { setTermFilter(e.target.value); setActivePreset(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
            >
              <option value="all">All Terms</option>
              <option value="Prelim">Prelim</option>
              <option value="Midterm">Midterm</option>
              <option value="Semi-Final">Semi-Final</option>
              <option value="Final">Final</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Score
            <select
              value={scoreFilter}
              onChange={(e) => { setScoreFilter(e.target.value); setActivePreset(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-500 cursor-pointer"
            >
              <option value="all">All Scores</option>
              <option value="failing">Failing (&lt;75%)</option>
              <option value="borderline">Borderline (75-84%)</option>
              <option value="excellent">Excellent (&ge;85%)</option>
            </select>
          </label>
        </div>
      </div>


      {filteredRows.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-xs">
          No graded activity data available to pivot yet.
        </div>
      ) : viewMode === 'chart' ? (
        <div className="relative h-[450px] w-full mt-4 bg-white p-4 pt-14 rounded-xl border border-slate-200 shadow-sm">
          {/* Internal Chart Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10 bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 pl-1">Visual:</span>
            <select 
              value={chartType} 
              onChange={(e) => setChartType(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1"
            >
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="radar">Radar Chart</option>
            </select>
            <div className="w-px h-3 bg-slate-300 mx-1"></div>
            <button
              type="button"
              onClick={() => setChartSwapAxes(!chartSwapAxes)}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer flex items-center gap-1",
                chartSwapAxes ? "bg-sage-100 text-sage-700" : "text-slate-500 hover:bg-slate-100"
              )}
              title="Swap X and Y Axes"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <ResponsiveContainer width="100%" height="100%">
            {(() => {
              // Prepare chart data based on swap toggle
              const chartData = chartSwapAxes
                ? pivot.colValues.map((cv, colIdx) => {
                    const dataObj = { name: String(cv) };
                    pivot.rowValues.forEach((rv, rowIdx) => {
                      dataObj[rv] = pivot.matrix[rowIdx]?.cells[colIdx] ?? 0;
                    });
                    return dataObj;
                  })
                : pivot.matrix.map(row => {
                    const dataObj = { name: String(row.rowValue) };
                    pivot.colValues.forEach((cv, idx) => {
                      dataObj[cv] = row.cells[idx] ?? 0;
                    });
                    return dataObj;
                  });

              const seriesKeys = chartSwapAxes ? pivot.rowValues : pivot.colValues;
              const colors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];

              if (chartType === 'radar') {
                return (
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip 
                      shared={false}
                      formatter={(value) => typeof value === 'number' ? Number(value.toFixed(2)) : value}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                    />
                    {seriesKeys.length <= 12 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                    {seriesKeys.map((key, idx) => (
                      <Radar key={String(key)} name={String(key)} dataKey={String(key)} stroke={colors[idx % colors.length]} fill={colors[idx % colors.length]} fillOpacity={0.4} />
                    ))}
                  </RadarChart>
                );
              }

              if (chartType === 'line') {
                return (
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                    <Tooltip 
                      shared={false}
                      formatter={(value) => typeof value === 'number' ? Number(value.toFixed(2)) : value}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                      cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} 
                    />
                    {seriesKeys.length <= 12 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                    {seriesKeys.map((key, idx) => (
                      <Line type="monotone" key={String(key)} dataKey={String(key)} stroke={colors[idx % colors.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    ))}
                  </LineChart>
                );
              }

              return (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <Tooltip 
                    shared={false}
                    formatter={(value) => typeof value === 'number' ? Number(value.toFixed(2)) : value}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                    cursor={{ fill: '#f1f5f9' }} 
                  />
                  {seriesKeys.length <= 12 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                  {seriesKeys.map((key, idx) => (
                    <Bar key={String(key)} dataKey={String(key)} fill={colors[idx % colors.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              );
            })()}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead>
              {pivot.colGroups.length > 0 && (
                <tr className="bg-slate-100/80 border-b border-slate-200 text-center">
                  <th className="border-r border-slate-200"></th>
                  {pivot.colGroups.map((group, idx) => (
                    <th key={idx} colSpan={group.count} className="py-1.5 px-3 font-bold text-sage-700 border-r border-slate-200 text-[10px] uppercase tracking-wider">
                      {group.term}
                    </th>
                  ))}
                  <th></th>
                </tr>
              )}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-2 px-3 text-left font-bold text-slate-700 border-r border-slate-200">{rowField}</th>
                {pivot.colValues.map(cv => (
                  <th key={String(cv)} className="py-2 px-3 text-right font-bold text-slate-700">{cv}</th>
                ))}
                <th className="py-2 px-3 text-right font-bold text-slate-900 bg-slate-100 border-l border-slate-200">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.matrix.map(row => (
                <tr key={String(row.rowValue)} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 font-semibold text-slate-800">{row.rowValue}</td>
                  {row.cells.map((cell, idx) => (
                    <td 
                      key={idx} 
                      className={cn(
                        "py-2 px-3 text-right font-mono transition-colors",
                        "text-slate-700"
                      )}
                    >
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

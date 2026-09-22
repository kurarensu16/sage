import { useState } from 'react';
import { 
  TrendingUp, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight
} from 'lucide-react';

// ── COLOR CONSTANTS (Matching Tailwind SAGE theme tokens) ────────────────────
const PALETTE = {
  sage: '#1e3a8a',       // sage-600
  sageLight: '#dae4f2',  // sage-100
  sageDark: '#09132b',   // sage-900
  emerald: '#10b981',    // emerald-500
  emeraldLight: '#d1fae5',
  amber: '#f59e0b',      // amber-500
  amberLight: '#fef3c7',
  rose: '#f43f5e',       // rose-500
  roseLight: '#ffe4e6',
  indigo: '#6366f1',     // indigo-500
  slateBorder: '#e2e8f0',// slate-200
  slateText: '#64748b'   // slate-500
};

// ── 1. ACADEMIC TRAJECTORY LINE CHART (MULTI-TERM) ───────────────────────────
export function AcademicTrajectoryLineChart({ trajectoryData = [] }) {
  const [activeMetric, setActiveMetric] = useState('avgGwa'); // 'avgGwa' | 'passRate' | 'cohorts'
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!trajectoryData || trajectoryData.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
        <TrendingUp className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
        No multi-term progression data recorded yet.
      </div>
    );
  }

  // Viewport dimensions
  const width = 580;
  const height = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const pointsCount = trajectoryData.length;
  const getX = (idx) => padLeft + (idx / Math.max(1, pointsCount - 1)) * plotWidth;

  // GWA scale: 1.00 (top of plot) down to 3.50 (bottom of plot)
  const minGwa = 1.00;
  const maxGwa = 3.50;
  const getGwaY = (val) => {
    const clamped = Math.max(minGwa, Math.min(maxGwa, val || 2.5));
    const ratio = (clamped - minGwa) / (maxGwa - minGwa);
    return padTop + ratio * plotHeight;
  };

  // Pass rate scale: 100% (top) down to 50% (bottom)
  const getPassY = (pct) => {
    const clamped = Math.max(50, Math.min(100, pct || 75));
    const ratio = (100 - clamped) / 50;
    return padTop + ratio * plotHeight;
  };

  // Build SVG Path (linear or smooth bezier)
  const buildSmoothPath = (pts) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  // Coordinates calculation based on activeMetric
  let line1Points = [];
  let line2Points = [];
  let areaPath = '';

  if (activeMetric === 'avgGwa') {
    line1Points = trajectoryData.map((d, i) => ({ x: getX(i), y: getGwaY(d.avgGwa), val: d.avgGwa }));
    const curve = buildSmoothPath(line1Points);
    const lastPt = line1Points[line1Points.length - 1];
    const firstPt = line1Points[0];
    areaPath = `${curve} L ${lastPt.x} ${height - padBottom} L ${firstPt.x} ${height - padBottom} Z`;
  } else if (activeMetric === 'passRate') {
    line1Points = trajectoryData.map((d, i) => ({ x: getX(i), y: getPassY(d.passRate), val: d.passRate }));
    const curve = buildSmoothPath(line1Points);
    const lastPt = line1Points[line1Points.length - 1];
    const firstPt = line1Points[0];
    areaPath = `${curve} L ${lastPt.x} ${height - padBottom} L ${firstPt.x} ${height - padBottom} Z`;
  } else {
    // Cohorts: Line 1 = Honors Count (or %), Line 2 = At-Risk Count (or %)
    line1Points = trajectoryData.map((d, i) => {
      const total = d.total || 1;
      const pct = Math.round((d.honorsCount / total) * 100);
      return { x: getX(i), y: getPassY(pct), val: pct, count: d.honorsCount };
    });
    line2Points = trajectoryData.map((d, i) => {
      const total = d.total || 1;
      const pct = Math.round((d.atRiskCount / total) * 100);
      return { x: getX(i), y: getPassY(pct), val: pct, count: d.atRiskCount };
    });
  }

  // Active hover point info
  const activeHover = hoveredIdx !== null ? trajectoryData[hoveredIdx] : null;

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Chart Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-sage-600" /> Multi-Term Trajectory Curve
          </h4>
          <p className="text-[11px] text-slate-500">
            {activeMetric === 'avgGwa' && 'College Grade Point Average progression across evaluation periods.'}
            {activeMetric === 'passRate' && 'Percentage of students meeting passing requirements (GWA <= 3.00).'}
            {activeMetric === 'cohorts' && 'Comparative trajectory of Honors candidates vs. Flagged At-Risk cohort.'}
          </p>
        </div>

        {/* View Switcher Pills */}
        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveMetric('avgGwa')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeMetric === 'avgGwa' 
                ? 'bg-white text-sage-900 font-bold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Average GWA
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('passRate')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeMetric === 'passRate' 
                ? 'bg-white text-sage-900 font-bold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Passing Rate %
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('cohorts')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeMetric === 'cohorts' 
                ? 'bg-white text-sage-900 font-bold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Honors vs Risk
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden my-2">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            {/* Primary Navy Area Gradient */}
            <linearGradient id="sageAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.sage} stopOpacity="0.22" />
              <stop offset="100%" stopColor={PALETTE.sage} stopOpacity="0.01" />
            </linearGradient>
            
            {/* Emerald Area Gradient */}
            <linearGradient id="emeraldAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.emerald} stopOpacity="0.22" />
              <stop offset="100%" stopColor={PALETTE.emerald} stopOpacity="0.01" />
            </linearGradient>

            {/* Rose Area Gradient */}
            <linearGradient id="roseAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.rose} stopOpacity="0.22" />
              <stop offset="100%" stopColor={PALETTE.rose} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Scale */}
          {activeMetric === 'avgGwa' ? (
            [1.00, 1.50, 2.00, 2.50, 3.00, 3.50].map((gwaVal) => {
              const y = getGwaY(gwaVal);
              return (
                <g key={gwaVal}>
                  <line 
                    x1={padLeft} 
                    y1={y} 
                    x2={width - padRight} 
                    y2={y} 
                    stroke="#f1f5f9" 
                    strokeWidth="1" 
                    strokeDasharray={gwaVal === 3.00 ? "4 4" : undefined}
                  />
                  <text 
                    x={padLeft - 8} 
                    y={y + 3.5} 
                    textAnchor="end" 
                    className="font-mono text-[9px] fill-slate-400 font-semibold"
                  >
                    {gwaVal.toFixed(2)}
                  </text>
                  {gwaVal === 3.00 && (
                    <text 
                      x={width - padRight + 4} 
                      y={y + 3} 
                      textAnchor="start" 
                      className="font-mono text-[8px] fill-amber-500 font-bold"
                    >
                      Pass Limit
                    </text>
                  )}
                </g>
              );
            })
          ) : (
            [100, 90, 80, 70, 60, 50].map((pctVal) => {
              const y = getPassY(pctVal);
              return (
                <g key={pctVal}>
                  <line 
                    x1={padLeft} 
                    y1={y} 
                    x2={width - padRight} 
                    y2={y} 
                    stroke="#f1f5f9" 
                    strokeWidth="1"
                    strokeDasharray={pctVal === 75 ? "4 4" : undefined}
                  />
                  <text 
                    x={padLeft - 8} 
                    y={y + 3.5} 
                    textAnchor="end" 
                    className="font-mono text-[9px] fill-slate-400 font-semibold"
                  >
                    {pctVal}%
                  </text>
                </g>
              );
            })
          )}

          {/* Area Fill for Single Metric */}
          {activeMetric !== 'cohorts' && areaPath && (
            <path d={areaPath} fill={activeMetric === 'avgGwa' ? 'url(#sageAreaGrad)' : 'url(#emeraldAreaGrad)'} />
          )}

          {/* Main Primary Line */}
          {line1Points.length > 1 && (
            <path
              d={buildSmoothPath(line1Points)}
              fill="none"
              stroke={activeMetric === 'cohorts' ? PALETTE.emerald : activeMetric === 'passRate' ? PALETTE.emerald : PALETTE.sage}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Secondary Line for Cohorts (At-Risk) */}
          {activeMetric === 'cohorts' && line2Points.length > 1 && (
            <path
              d={buildSmoothPath(line2Points)}
              fill="none"
              stroke={PALETTE.rose}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Hover Guides & Data Nodes */}
          {trajectoryData.map((d, i) => {
            const p1 = line1Points[i];
            const p2 = line2Points[i];
            const isHovered = hoveredIdx === i;

            return (
              <g 
                key={d.term} 
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={p1.x}
                    y1={padTop}
                    x2={p1.x}
                    y2={height - padBottom}
                    stroke={PALETTE.sage}
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                )}

                {/* Primary Data Node */}
                {p1 && (
                  <>
                    <circle
                      cx={p1.x}
                      cy={p1.y}
                      r={isHovered ? "6" : "4"}
                      fill="white"
                      stroke={activeMetric === 'cohorts' ? PALETTE.emerald : activeMetric === 'passRate' ? PALETTE.emerald : PALETTE.sage}
                      strokeWidth="2.5"
                      className="transition-all duration-200"
                    />
                    {isHovered && (
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r="10"
                        fill={activeMetric === 'cohorts' ? PALETTE.emerald : PALETTE.sage}
                        opacity="0.18"
                      />
                    )}
                  </>
                )}

                {/* Secondary Data Node for Cohort mode */}
                {activeMetric === 'cohorts' && p2 && (
                  <>
                    <circle
                      cx={p2.x}
                      cy={p2.y}
                      r={isHovered ? "6" : "4"}
                      fill="white"
                      stroke={PALETTE.rose}
                      strokeWidth="2.5"
                      className="transition-all duration-200"
                    />
                    {isHovered && (
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r="10"
                        fill={PALETTE.rose}
                        opacity="0.18"
                      />
                    )}
                  </>
                )}

                {/* X-Axis Term Label */}
                <text
                  x={p1.x}
                  y={height - padBottom + 16}
                  textAnchor="middle"
                  className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${
                    isHovered ? 'fill-sage-900 font-extrabold' : 'fill-slate-500'
                  }`}
                >
                  {d.term}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip card when hovering a term */}
        {activeHover && hoveredIdx !== null && (
          <div 
            className="absolute z-10 top-2 bg-sage-900 text-white p-2.5 rounded-xl shadow-lg border border-sage-700 pointer-events-none text-xs transform -translate-x-1/2 transition-all duration-150"
            style={{ 
              left: `${(getX(hoveredIdx) / width) * 100}%`,
              maxWidth: '220px'
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-sage-800 pb-1 mb-1.5">
              <span className="font-bold font-display uppercase tracking-wider text-[10px] text-sage-200">
                {activeHover.term} Term
              </span>
              <span className="text-[10px] text-slate-300 font-mono">
                {activeHover.total} students
              </span>
            </div>

            {activeMetric === 'avgGwa' && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300 text-[11px]">Term GWA:</span>
                  <span className="font-mono font-bold text-emerald-300 text-sm">
                    {typeof activeHover.avgGwa === 'number' ? activeHover.avgGwa.toFixed(2) : activeHover.avgGwa}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                  <span>Pass Rate:</span>
                  <span className="font-mono font-semibold text-white">{activeHover.passRate}%</span>
                </div>
              </div>
            )}

            {activeMetric === 'passRate' && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300 text-[11px]">Passing Rate:</span>
                  <span className="font-mono font-bold text-emerald-300 text-sm">
                    {activeHover.passRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                  <span>Avg GWA:</span>
                  <span className="font-mono font-semibold text-white">{activeHover.avgGwa?.toFixed(2)}</span>
                </div>
              </div>
            )}

            {activeMetric === 'cohorts' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1 text-emerald-300 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Honors:
                  </span>
                  <span className="font-mono font-bold text-white">{activeHover.honorsCount} students</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1 text-rose-300 font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> At-Risk:
                  </span>
                  <span className="font-mono font-bold text-white">{activeHover.atRiskCount} students</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend & Summary Footer */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        {activeMetric === 'cohorts' ? (
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Dean's / President's Honors
            </span>
            <span className="flex items-center gap-1.5 font-medium text-rose-700">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Flagged At-Risk
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sage-800 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>4-Term Academic Trajectory tracked in real time.</span>
          </div>
        )}
        <span className="font-mono text-[10px] text-slate-400">
          Historical 4-Term Progression
        </span>
      </div>
    </div>
  );
}


// ── 2. ACADEMIC HEALTH DONUT / PIE CHART ───────────────────────────────────────
export function AcademicHealthDonutChart({ distribution = {} }) {
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const total = distribution.total || 0;
  const honors = distribution.honors || 0;
  const good = distribution.good || 0;
  const warning = distribution.warning || 0;
  const critical = distribution.critical || 0;

  const pctHonors = total > 0 ? Math.round((honors / total) * 100) : 0;
  const pctGood = total > 0 ? Math.round((good / total) * 100) : 0;
  const pctWarning = total > 0 ? Math.round((warning / total) * 100) : 0;
  const pctCritical = total > 0 ? Math.max(0, 100 - pctHonors - pctGood - pctWarning) : 0;

  const passingRate = total > 0 ? Math.round(((honors + good + warning) / total) * 100) : 0;

  // Donut geometry
  const radius = 70;
  const strokeWidth = 24;
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  const slices = [
    {
      id: 'honors',
      label: "Dean's Honors",
      range: '1.00 – 1.75',
      count: honors,
      pct: pctHonors,
      color: PALETTE.emerald,
      tailwindColor: 'text-emerald-700',
      bgLight: 'bg-emerald-50'
    },
    {
      id: 'good',
      label: 'Good Standing',
      range: '1.76 – 2.50',
      count: good,
      pct: pctGood,
      color: PALETTE.sage,
      tailwindColor: 'text-sage-700',
      bgLight: 'bg-sage-50'
    },
    {
      id: 'warning',
      label: 'Borderline Warning',
      range: '2.51 – 3.00',
      count: warning,
      pct: pctWarning,
      color: PALETTE.amber,
      tailwindColor: 'text-amber-700',
      bgLight: 'bg-amber-50'
    },
    {
      id: 'critical',
      label: 'Critical / At-Risk',
      range: '> 3.00',
      count: critical,
      pct: pctCritical,
      color: PALETTE.rose,
      tailwindColor: 'text-rose-700',
      bgLight: 'bg-rose-50'
    }
  ];

  // Compute stroke-dasharray & stroke-dashoffset for each arc
  let accumulatedOffset = 0;
  const sliceArcs = slices.map(s => {
    const sliceLength = (s.pct / 100) * circumference;
    const offset = accumulatedOffset;
    accumulatedOffset += sliceLength;
    return {
      ...s,
      dashArray: `${sliceLength} ${circumference - sliceLength}`,
      dashOffset: -offset
    };
  });

  const activeInfo = hoveredSlice ? slices.find(s => s.id === hoveredSlice) : null;

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <PieChartIcon className="h-4 w-4 text-sage-600" /> Academic Health Breakdown
          </h4>
          <p className="text-[11px] text-slate-500">
            Proportional student standing composition.
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold bg-sage-50 text-sage-700 px-2 py-0.5 rounded border border-sage-200/50">
          {total} Enrolled
        </span>
      </div>

      {/* Center Donut SVG */}
      <div className="flex flex-col sm:flex-row items-center justify-around gap-4 my-3">
        <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
            />

            {/* Slices */}
            {total > 0 && sliceArcs.map(s => {
              const isHovered = hoveredSlice === s.id;
              if (s.pct <= 0) return null;
              return (
                <circle
                  key={s.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={s.dashArray}
                  strokeDashoffset={s.dashOffset}
                  strokeLinecap="butt"
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredSlice(s.id)}
                  onMouseLeave={() => setHoveredSlice(null)}
                />
              );
            })}
          </svg>

          {/* Center Badge / Hover Details */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {activeInfo ? (
              <div className="space-y-0.5 px-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  {activeInfo.label}
                </span>
                <span className="text-xl font-extrabold font-mono text-slate-900 leading-none block">
                  {activeInfo.count}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 block">
                  {activeInfo.pct}% of total
                </span>
              </div>
            ) : (
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                  Pass Rate
                </span>
                <span className="text-2xl font-extrabold font-mono text-sage-900 leading-none block">
                  {passingRate}%
                </span>
                <span className="text-[10px] font-medium text-emerald-600 block">
                  {honors + good} Passing
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Compact Legend List */}
        <div className="flex-1 w-full space-y-2">
          {slices.map(s => {
            const isHovered = hoveredSlice === s.id;
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredSlice(s.id)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isHovered 
                    ? 'border-slate-300 bg-slate-50/80 shadow-2xs' 
                    : 'border-slate-100 bg-white hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: s.color }} 
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block leading-tight">
                      {s.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {s.range}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-slate-900 block leading-tight">
                    {s.count}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {s.pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1 font-medium text-slate-600">
          <ArrowUpRight className="h-3.5 w-3.5 text-sage-600" />
          Click or hover slices for exact demographic headcounts.
        </span>
      </div>
    </div>
  );
}


// ── 3. GWA BRACKETS VERTICAL HISTOGRAM (BAR CHART) ────────────────────────────
export function GradeDistributionHistogram({ brackets = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Default fallback if brackets not populated
  const defaultBrackets = [
    { label: '1.00-1.25', sub: 'High Honors', count: 0, pct: 0, color: 'emerald' },
    { label: '1.26-1.75', sub: "Dean's List", count: 0, pct: 0, color: 'emerald' },
    { label: '1.76-2.25', sub: 'Good', count: 0, pct: 0, color: 'sage' },
    { label: '2.26-2.75', sub: 'Satisfactory', count: 0, pct: 0, color: 'indigo' },
    { label: '2.76-3.00', sub: 'Borderline', count: 0, pct: 0, color: 'amber' },
    { label: '> 3.00', sub: 'At-Risk', count: 0, pct: 0, color: 'rose' }
  ];

  const chartData = brackets.length > 0 ? brackets : defaultBrackets;
  const maxCount = Math.max(1, ...chartData.map(b => b.count || 0));

  // Chart layout
  const width = 540;
  const height = 190;
  const padLeft = 35;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const barWidth = 44;
  const gap = (plotWidth - (barWidth * chartData.length)) / Math.max(1, chartData.length - 1);

  const getBarColor = (item) => {
    if (item.color === 'emerald') return PALETTE.emerald;
    if (item.color === 'amber') return PALETTE.amber;
    if (item.color === 'rose') return PALETTE.rose;
    if (item.color === 'indigo') return PALETTE.indigo;
    return PALETTE.sage;
  };

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-sage-600" /> Grade Distribution Histogram
          </h4>
          <p className="text-[11px] text-slate-500">
            Student frequency distribution across standard Philippine grading brackets.
          </p>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
          Scale: 1.00 (Max) → 5.00 (Fail)
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden my-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          {/* Y Axis Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
            const y = padTop + (1 - ratio) * plotHeight;
            const val = Math.round(ratio * maxCount);
            return (
              <g key={ratio}>
                <line 
                  x1={padLeft} 
                  y1={y} 
                  x2={width - padRight} 
                  y2={y} 
                  stroke="#f1f5f9" 
                  strokeWidth="1" 
                />
                <text 
                  x={padLeft - 6} 
                  y={y + 3} 
                  textAnchor="end" 
                  className="font-mono text-[9px] fill-slate-400 font-semibold"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Histogram Bars */}
          {chartData.map((b, i) => {
            const x = padLeft + i * (barWidth + gap);
            const count = b.count || 0;
            const barH = maxCount > 0 ? (count / maxCount) * plotHeight : 0;
            const y = padTop + plotHeight - barH;
            const isHovered = hoveredIdx === i;
            const color = getBarColor(b);

            return (
              <g 
                key={b.label}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Background column highlight on hover */}
                {isHovered && (
                  <rect
                    x={x - 4}
                    y={padTop}
                    width={barWidth + 8}
                    height={plotHeight}
                    fill={color}
                    opacity="0.08"
                    rx="6"
                  />
                )}

                {/* The Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(3, barH)}
                  rx="4"
                  fill={color}
                  opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                  className="transition-all duration-300"
                />

                {/* Top Count Pill */}
                {count > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(padTop - 5, y - 5)}
                    textAnchor="middle"
                    className="font-mono text-[10px] font-bold fill-slate-900"
                  >
                    {count}
                  </text>
                )}

                {/* X Axis Primary Bracket Label */}
                <text
                  x={x + barWidth / 2}
                  y={height - padBottom + 16}
                  textAnchor="middle"
                  className={`font-mono text-[9px] font-bold tracking-tight transition-colors ${
                    isHovered ? 'fill-sage-900' : 'fill-slate-600'
                  }`}
                >
                  {b.label}
                </text>

                {/* X Axis Subtitle */}
                <text
                  x={x + barWidth / 2}
                  y={height - padBottom + 27}
                  textAnchor="middle"
                  className="text-[8px] fill-slate-400 font-medium"
                >
                  {b.sub}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredIdx !== null && chartData[hoveredIdx] && (
          <div 
            className="absolute z-10 -top-1 bg-sage-900 text-white p-2 rounded-xl shadow-lg border border-sage-700 pointer-events-none text-xs transform -translate-x-1/2 transition-all duration-150"
            style={{ 
              left: `${((padLeft + hoveredIdx * (barWidth + gap) + barWidth / 2) / width) * 100}%`,
              minWidth: '130px'
            }}
          >
            <div className="text-[10px] font-mono text-sage-200 border-b border-sage-800 pb-1 mb-1 font-bold">
              GWA {chartData[hoveredIdx].label}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 text-[10px]">{chartData[hoveredIdx].sub}:</span>
              <span className="font-mono font-bold text-emerald-300 text-xs">
                {chartData[hoveredIdx].count} students ({chartData[hoveredIdx].pct}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1 font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Transmuted scale aligned with DYCI institutional standards.
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          Gaussian bell-curve projection
        </span>
      </div>
    </div>
  );
}


// ── 4. SECTION PERFORMANCE & RISK INDEX (COMPARATIVE HORIZONTAL BAR CHART) ─────
export function SectionPerformanceBarChart({ sections = [], onSelectSection }) {
  const [sortBy, setSortBy] = useState('passRate'); // 'passRate' | 'atRisk' | 'name'

  if (!sections || sections.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
        <Layers className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
        No classroom sections active in this college.
      </div>
    );
  }

  // Sort sections
  const sorted = [...sections].sort((a, b) => {
    if (sortBy === 'passRate') return (b.passRate || 0) - (a.passRate || 0);
    if (sortBy === 'atRisk') return (b.atRiskCount || 0) - (a.atRiskCount || 0);
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header with Sort Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-sage-600" /> Section Performance &amp; Risk Heatmap
          </h4>
          <p className="text-[11px] text-slate-500">
            Comparative section pass rates and early warning flags.
          </p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Sort by:</span>
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => setSortBy('passRate')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                sortBy === 'passRate' ? 'bg-white text-sage-900 font-bold shadow-2xs' : 'text-slate-600'
              }`}
            >
              Passing %
            </button>
            <button
              type="button"
              onClick={() => setSortBy('atRisk')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                sortBy === 'atRisk' ? 'bg-white text-sage-900 font-bold shadow-2xs' : 'text-slate-600'
              }`}
            >
              At-Risk
            </button>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                sortBy === 'name' ? 'bg-white text-sage-900 font-bold shadow-2xs' : 'text-slate-600'
              }`}
            >
              Name
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Bar Rows */}
      <div className="space-y-2.5 my-3 max-h-[300px] overflow-y-auto pr-1">
        {sorted.map(sec => {
          const passRate = sec.passRate != null ? sec.passRate : 85;
          const avgGwa = sec.avgGwa != null ? sec.avgGwa.toFixed(2) : '—';
          const atRisk = sec.atRiskCount || 0;
          const studentsCount = sec.studentCount || 0;

          // Bar color based on pass rate
          let barGradient = 'from-emerald-500 to-teal-600';
          let textColor = 'text-emerald-700';
          if (passRate < 75) {
            barGradient = 'from-rose-500 to-red-600';
            textColor = 'text-rose-700';
          } else if (passRate < 85) {
            barGradient = 'from-amber-400 to-amber-500';
            textColor = 'text-amber-700';
          }

          return (
            <div 
              key={sec.sectionId || sec.name}
              onClick={() => onSelectSection && onSelectSection(sec)}
              className="p-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-all space-y-1.5 cursor-pointer group"
            >
              {/* Row Header */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 group-hover:text-sage-700 transition-colors font-mono">
                    {sec.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {studentsCount} {studentsCount === 1 ? 'student' : 'students'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-700">
                    GWA {avgGwa}
                  </span>
                  {atRisk > 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertCircle className="h-3 w-3 text-rose-500 animate-pulse" /> {atRisk} At-Risk
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Optimal
                    </span>
                  )}
                </div>
              </div>

              {/* Horizontal Progress Bar */}
              <div className="flex items-center gap-3">
                <div className="h-2.5 flex-1 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div
                    style={{ width: `${Math.min(100, Math.max(5, passRate))}%` }}
                    className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500`}
                  />
                </div>
                <span className={`font-mono text-[11px] font-bold ${textColor} w-10 text-right`}>
                  {passRate}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="text-slate-500 text-[10px]">
          Showing {sorted.length} active classroom sections
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          Ranked by Section Health Metric
        </span>
      </div>
    </div>
  );
}

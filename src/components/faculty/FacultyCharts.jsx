import { useState } from 'react';
import { 
  TrendingUp, 
  PieChart as PieChartIcon, 
  BarChart3 
} from 'lucide-react';

// ── COLOR PALETTE (Strictly SAGE Semantic Tokens) ───────────────────────────
const PALETTE = {
  sage: '#1e3a8a',         // sage-600
  sageLight: '#dae4f2',    // sage-100
  sageDark: '#09132b',     // sage-900
  emerald: '#10b981',      // emerald-500
  emeraldLight: '#d1fae5',
  amber: '#f59e0b',        // amber-500
  amberLight: '#fef3c7',
  rose: '#f43f5e',         // rose-500
  roseLight: '#ffe4e6',
  indigo: '#6366f1',       // indigo-500
  indigoLight: '#e0e7ff',
  purple: '#8b5cf6',       // purple-500
  purpleLight: '#ede9fe',
  slateBorder: '#e2e8f0',  // slate-200
  slateText: '#64748b'     // slate-500
};

// ── 1. FACULTY PERFORMANCE TRAJECTORY LINE CHART (BÉZIER CURVE) ─────────────
export function FacultyPerformanceTrajectoryChart({ trajectoryData = [] }) {
  const [activeMetric, setActiveMetric] = useState('avgGwa'); // 'avgGwa' | 'passRate' | 'examAvg'
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!trajectoryData || trajectoryData.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
        <TrendingUp className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
        No multi-term progression data recorded yet for your handled sections.
      </div>
    );
  }

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

  // GWA scale: 1.00 (top) to 3.50 (bottom)
  const minGwa = 1.00;
  const maxGwa = 3.50;
  const getGwaY = (val) => {
    const clamped = Math.max(minGwa, Math.min(maxGwa, val || 2.25));
    const ratio = (clamped - minGwa) / (maxGwa - minGwa);
    return padTop + ratio * plotHeight;
  };

  // Percentage scale (0 - 100%)
  const getPctY = (pct) => {
    const clamped = Math.max(50, Math.min(100, pct || 75));
    const ratio = (100 - clamped) / 50;
    return padTop + ratio * plotHeight;
  };

  const getY = (d) => {
    if (activeMetric === 'avgGwa') return getGwaY(d.avgGwa);
    if (activeMetric === 'passRate') return getPctY(d.passRate);
    return getPctY(d.examAvg);
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

  const points = trajectoryData.map((d, idx) => ({
    x: getX(idx),
    y: getY(d),
    term: d.term,
    val: activeMetric === 'avgGwa' 
      ? d.avgGwa?.toFixed(2) 
      : activeMetric === 'passRate' 
        ? `${d.passRate}%` 
        : `${d.examAvg}%`
  }));

  const linePath = buildSmoothPath(points);
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z` 
    : '';

  return (
    <div className="space-y-3">
      {/* Metric Switcher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveMetric('avgGwa')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeMetric === 'avgGwa' 
                ? 'bg-white text-slate-900 shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Class GWA
          </button>
          <button
            onClick={() => setActiveMetric('passRate')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeMetric === 'passRate' 
                ? 'bg-white text-slate-900 shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pass Rate %
          </button>
          <button
            onClick={() => setActiveMetric('examAvg')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeMetric === 'examAvg' 
                ? 'bg-white text-slate-900 shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Exam Average %
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sage-600"></span>
            {activeMetric === 'avgGwa' ? 'Avg GWA (Lower is Better)' : 'Score % (Higher is Better)'}
          </span>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative w-full overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="facultyCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.sage} stopOpacity="0.22" />
              <stop offset="100%" stopColor={PALETTE.sage} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = padTop + ratio * plotHeight;
            const label = activeMetric === 'avgGwa'
              ? (minGwa + ratio * (maxGwa - minGwa)).toFixed(2)
              : `${Math.round(100 - ratio * 50)}%`;

            return (
              <g key={`grid-${idx}`}>
                <line 
                  x1={padLeft} 
                  y1={y} 
                  x2={width - padRight} 
                  y2={y} 
                  stroke={PALETTE.slateBorder} 
                  strokeDasharray="3 3" 
                  strokeWidth="1"
                />
                <text 
                  x={padLeft - 8} 
                  y={y + 3.5} 
                  textAnchor="end" 
                  fill={PALETTE.slateText} 
                  fontSize="9" 
                  fontFamily="JetBrains Mono, monospace"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaPath} fill="url(#facultyCurveGrad)" />

          {/* Line Path */}
          <path 
            d={linePath} 
            fill="none" 
            stroke={PALETTE.sage} 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Interactive Data Nodes */}
          {points.map((pt, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <g 
                key={`node-${idx}`} 
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Vertical guide line on hover */}
                {isHovered && (
                  <line 
                    x1={pt.x} 
                    y1={padTop} 
                    x2={pt.x} 
                    y2={height - padBottom} 
                    stroke={PALETTE.sage} 
                    strokeWidth="1" 
                    strokeDasharray="2 2" 
                    opacity="0.6"
                  />
                )}

                {/* Outer halo */}
                <circle 
                  cx={pt.x} 
                  cy={pt.y} 
                  r={isHovered ? 7 : 4} 
                  fill="#ffffff" 
                  stroke={PALETTE.sage} 
                  strokeWidth={isHovered ? 3 : 2}
                  className="transition-all duration-150"
                />

                {/* X-axis Term label */}
                <text 
                  x={pt.x} 
                  y={height - padBottom + 18} 
                  textAnchor="middle" 
                  fill={isHovered ? PALETTE.sageDark : PALETTE.slateText} 
                  fontSize="10" 
                  fontWeight={isHovered ? '700' : '500'}
                  fontFamily="DM Sans, sans-serif"
                >
                  {pt.term}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div 
            className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 bg-slate-900 text-white px-2.5 py-1.5 rounded-md text-[11px] shadow-lg flex flex-col items-center whitespace-nowrap"
            style={{ 
              left: `${(points[hoveredIdx].x / width) * 100}%`, 
              top: `${(points[hoveredIdx].y / height) * 100}%` 
            }}
          >
            <span className="font-bold font-display text-[10px] uppercase text-slate-300">
              {points[hoveredIdx].term} Milestone
            </span>
            <span className="font-mono font-bold text-xs text-white">
              {points[hoveredIdx].val}
            </span>
            <span className="text-[9px] text-slate-400">
              {activeMetric === 'avgGwa' ? 'Transmuted Class Average' : activeMetric === 'passRate' ? 'Class Passing Percentage' : 'Class Exam Average'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2. STUDENT RISK & INTERVENTION HEALTH DONUT CHART ────────────────────────
export function StudentRiskInterventionDonut({ riskData = {} }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  const segments = [
    { key: 'onTrack', label: 'On Track / Low Risk', count: riskData.onTrack || 0, color: PALETTE.emerald, desc: 'Score 0-24: Satisfactory standing' },
    { key: 'plWatch', label: 'PL Honors Retention', count: riskData.plWatch || 0, color: PALETTE.amber, desc: 'High GPA with dragging formative score' },
    { key: 'moderate', label: 'Moderate Risk', count: riskData.moderate || 0, color: '#f97316', desc: 'Score 25-49: Early academic warning' },
    { key: 'critical', label: 'Critical / Intervention', count: riskData.critical || 0, color: PALETTE.rose, desc: 'Score 50+: Active HITL intervention required' },
    { key: 'escalated', label: 'Dean Escalated', count: riskData.escalated || 0, color: PALETTE.purple, desc: 'Referral flagged to College Dean queue' }
  ];

  const total = segments.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
        <PieChartIcon className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
        No student risk evaluations recorded yet.
      </div>
    );
  }

  // Calculate SVG arc paths
  const size = 190;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.count / total : 0;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedAngle * circumference;
    accumulatedAngle += pct;

    return {
      ...seg,
      pct: Math.round(pct * 100),
      strokeDasharray,
      strokeDashoffset
    };
  });

  const activeSegment = hoveredKey ? arcs.find(a => a.key === hoveredKey) : null;

  return (
    <div className="flex min-w-0 flex-col items-center justify-between gap-5">
      {/* Donut Graphic */}
      <div className="relative flex h-[190px] w-full shrink-0 items-center justify-center">
        <svg width={size} height={size} className="overflow-visible -rotate-90">
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={arc.color}
              strokeWidth={hoveredKey === arc.key ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={arc.strokeDasharray}
              strokeDashoffset={arc.strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHoveredKey(arc.key)}
              onMouseLeave={() => setHoveredKey(null)}
            />
          ))}
        </svg>

        {/* Center Telemetry Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-2xl font-black font-mono text-slate-900 leading-none">
            {activeSegment ? activeSegment.count : total}
          </span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
            {activeSegment ? activeSegment.label.split(' ')[0] : 'Total Students'}
          </span>
          {activeSegment && (
            <span className="text-[10px] font-mono font-bold text-sage-600">
              {activeSegment.pct}%
            </span>
          )}
        </div>
      </div>

      {/* Legend & Breakdown Strip */}
      <div className="w-full min-w-0 space-y-2 text-xs">
        {arcs.map((arc) => {
          const isHovered = hoveredKey === arc.key;
          return (
            <div
              key={arc.key}
              onMouseEnter={() => setHoveredKey(arc.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                isHovered 
                  ? 'bg-slate-50 border-slate-300 shadow-2xs' 
                  : 'bg-white border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: arc.color }}
                />
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 block truncate">{arc.label}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{arc.desc}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-slate-900 block">{arc.count}</span>
                <span className="text-[10px] font-mono text-slate-500">{arc.pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. ASSESSMENT COMPONENT DISTRIBUTION BAR CHART ──────────────────────────
export function AssessmentComponentDistributionBar({ componentsData = [] }) {
  // Default structure: [ { component: 'Class Standing (50%)', avgScore: 82, target: 75 }, ... ]
  if (!componentsData || componentsData.length === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs">
        <BarChart3 className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
        No component score distribution available yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {componentsData.map((item, idx) => {
        const pct = Math.min(100, Math.max(0, item.avgScore || 0));
        const isLow = pct < 75;
        const barColor = isLow ? PALETTE.rose : pct >= 88 ? PALETTE.emerald : PALETTE.sage;

        return (
          <div key={`comp-${idx}`} className="space-y-1.5 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 font-display">
                {item.component}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">{pct.toFixed(1)}%</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  isLow 
                    ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {isLow ? 'Lagging' : 'Passing'}
                </span>
              </div>
            </div>

            {/* Bar Background */}
            <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              {/* Target 75% indicator line */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10 opacity-70"
                style={{ left: '75%' }}
                title="75% Minimum Passing Benchmark"
              />
              
              {/* Fill Bar */}
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: barColor
                }}
              />
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          75% Minimum Passing Benchmark
        </span>
        <span>Based on enrolled student scores</span>
      </div>
    </div>
  );
}

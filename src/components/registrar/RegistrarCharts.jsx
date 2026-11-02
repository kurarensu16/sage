import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  CartesianGrid, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { BarChart3, Layers, CalendarCheck } from 'lucide-react';

// Registrar analytics charts.
//
// Recharts is used here rather than the hand-rolled SVG of DeanCharts.jsx /
// FacultyCharts.jsx because this matches the convention already established for
// analytical panels -- see dean/SummaryReports.jsx, faculty/ClassAnalyticsPanel.jsx.
// The hand-rolled components are the bespoke branded visualisations; these are
// straightforward distributions.
//
// Colors are literal hex rather than Tailwind classes because Recharts writes
// SVG fill attributes, which cannot take a class. The values mirror the sage-*
// semantic tokens, the same compromise DeanCharts.jsx documents.
const PALETTE = {
  sage: '#1e3a8a',       // sage-600
  sageLight: '#dae4f2',  // sage-100
  emerald: '#10b981',    // emerald-500
  amber: '#f59e0b',      // amber-500
  rose: '#f43f5e',       // rose-500
  indigo: '#6366f1',     // indigo-500
  slateBorder: '#e2e8f0' // slate-200
};

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: 'none',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  fontSize: '12px'
};

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs">
      <Icon className="h-8 w-8 mb-2 stroke-1 text-slate-300" />
      {message}
    </div>
  );
}

// Shortens a long college name for an axis label without inventing an
// abbreviation, so the tooltip stays the source of truth for the full name.
function axisLabel(name = '') {
  if (name.length <= 14) return name;
  return `${name.slice(0, 13)}…`;
}

export function EnrollmentByCollegeChart({ perCollege = [] }) {
  if (!perCollege.length) {
    return <EmptyState icon={BarChart3} message="No enrolment recorded for the active term yet." />;
  }

  const data = perCollege.map((row) => ({
    name: axisLabel(row.college),
    fullName: row.college,
    Regular: row.regular,
    Irregular: row.irregular
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={PALETTE.slateBorder} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <RechartsTooltip
          cursor={{ fill: '#f1f5f9' }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="Regular" stackId="enrolment" fill={PALETTE.sage} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Irregular" stackId="enrolment" fill={PALETTE.amber} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TermReadinessChart({ perCollege = [] }) {
  if (!perCollege.length) {
    return <EmptyState icon={CalendarCheck} message="No classes found for the active term." />;
  }

  const data = perCollege.map((row) => ({
    name: axisLabel(row.college),
    fullName: row.college,
    completion: row.completion,
    classes: row.classes,
    overdue: row.overdue
  }));

  // Colour encodes urgency, not identity: a college far from closing its term
  // is the one the Registrar needs to chase.
  const barColor = (pct) => {
    if (pct >= 90) return PALETTE.emerald;
    if (pct >= 50) return PALETTE.amber;
    return PALETTE.rose;
  };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={PALETTE.slateBorder} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
        <RechartsTooltip
          cursor={{ fill: '#f1f5f9' }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
          formatter={(value, _name, item) => [
            `${value}% of ${item?.payload?.classes || 0} classes posted`,
            item?.payload?.overdue ? `${item.payload.overdue} overdue` : 'SG progress'
          ]}
        />
        <Bar dataKey="completion" radius={[0, 4, 4, 0]} name="SG posted">
          {data.map((row) => (
            <Cell key={row.fullName} fill={barColor(row.completion)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StructureByCollegeChart({ perCollege = [] }) {
  if (!perCollege.length) {
    return <EmptyState icon={Layers} message="No colleges configured yet." />;
  }

  const data = perCollege.map((row) => ({
    name: axisLabel(row.college),
    fullName: row.college,
    Sections: row.sections,
    Programs: row.programs
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={PALETTE.slateBorder} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <RechartsTooltip
          cursor={{ fill: '#f1f5f9' }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="Sections" fill={PALETTE.sage} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Programs" fill={PALETTE.indigo} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

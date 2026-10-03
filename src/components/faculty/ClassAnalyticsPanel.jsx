import { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';

const RISK_COLORS = {
  'Performed well': '#10b981', // emerald-500
  'Average': '#f59e0b', // amber-500
  'Struggling': '#ef4444' // rose-500
};

export default function ClassAnalyticsPanel({ students = [], activities = [] }) {
  // 1. Grade Distribution (Histogram)
  const gradeDistribution = useMemo(() => {
    const bins = [
      { name: '0-50', count: 0 },
      { name: '51-60', count: 0 },
      { name: '61-70', count: 0 },
      { name: '71-75', count: 0 },
      { name: '76-80', count: 0 },
      { name: '81-85', count: 0 },
      { name: '86-90', count: 0 },
      { name: '91-95', count: 0 },
      { name: '96-100', count: 0 },
    ];
    
    students.forEach(s => {
      if (s.overallPercentage === null || s.overallPercentage === undefined) return;
      const p = s.overallPercentage;
      if (p <= 50) bins[0].count++;
      else if (p <= 60) bins[1].count++;
      else if (p <= 70) bins[2].count++;
      else if (p <= 75) bins[3].count++;
      else if (p <= 80) bins[4].count++;
      else if (p <= 85) bins[5].count++;
      else if (p <= 90) bins[6].count++;
      else if (p <= 95) bins[7].count++;
      else bins[8].count++;
    });
    
    return bins;
  }, [students]);

  // 2. Performance Status (Donut)
  const statusData = useMemo(() => {
    let well = 0, avg = 0, st = 0;
    students.forEach(s => {
      if (s.overallStatus === 'Performed well') well++;
      else if (s.overallStatus === 'Average') avg++;
      else if (s.overallStatus === 'Struggling') st++;
    });
    return [
      { name: 'Performed well', value: well },
      { name: 'Average', value: avg },
      { name: 'Struggling', value: st }
    ].filter(d => d.value > 0);
  }, [students]);

  // 3. Activity Averages Timeline (Line Chart)
  const activityTimeline = useMemo(() => {
    return activities.map(act => {
      let sum = 0, count = 0;
      students.forEach(s => {
        const scoreObj = s.scores?.[act.activity_id];
        if (scoreObj && scoreObj.percentage !== null) {
          sum += scoreObj.percentage;
          count++;
        }
      });
      return {
        name: act.title,
        'Class Average': count > 0 ? Math.round(sum / count) : null
      };
    }).filter(d => d['Class Average'] !== null);
  }, [activities, students]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Grade Distribution */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 pb-8 overflow-hidden h-[360px]">
          <h4 className="font-bold text-slate-800 text-sm mb-4">Grade Distribution (Overall Percentage)</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeDistribution} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }} 
                contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
              />
              <Bar dataKey="count" name="Students" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Status Donut */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 pb-8 overflow-hidden h-[360px] flex flex-col">
          <h4 className="font-bold text-slate-800 text-sm mb-4">Performance Status</h4>
          <div className="flex-1 relative -mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={RISK_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 pb-8 overflow-hidden h-[320px]">
        <h4 className="font-bold text-slate-800 text-sm mb-4">Activity Performance Timeline</h4>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={activityTimeline} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} domain={[0, 100]} />
            <Tooltip 
              cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} 
              contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
            />
            <Line type="monotone" dataKey="Class Average" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

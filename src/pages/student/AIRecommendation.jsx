import React from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BrainCircuit, 
  TrendingUp, 
  CheckCircle, 
  HelpCircle, 
  AlertTriangle, 
  ChevronRight, 
  Compass, 
  BookOpen 
} from 'lucide-react';

export default function AIRecommendation() {
  const gwaProgress = [
    { sem: 'AY 23-24 1S', gwa: 1.85 },
    { sem: 'AY 23-24 2S', gwa: 1.62 },
    { sem: 'AY 24-25 1S', gwa: 1.55 },
    { sem: 'AY 24-25 2S', gwa: 1.48 },
    { sem: 'AY 25-26 1S', gwa: 1.45 },
  ];

  const suggestions = [
    {
      title: 'Maintain Active Lab Performance',
      description: 'Your laboratory and coding task averages (98%) are in the top 5% of your class. Continue active submissions in Data Structures (IT201).'
    },
    {
      title: 'Optimize Exam Preparation',
      description: 'Your exam averages (90%) are slightly lower than your quiz scores (94%). Allocate 2 extra hours for reviewing midterm practice problems.'
    },
    {
      title: 'Leverage peer tutoring resources',
      description: 'The College of Computer Studies offers daily peer coding consultations at Lab 3. Consider volunteering as a student mentor to sharpen discrete math algorithms.'
    }
  ];

  return (
    <>
      <PageHeader title="AI Academic Guidance" breadcrumb="Student Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Main Verdict Block */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-6 items-start hover:border-sage-300 transition-all">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 flex-shrink-0 flex items-center justify-center">
            <BrainCircuit className="h-10 w-10" />
          </div>
          
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold font-display text-slate-900">Academic Standing Verdict: Safe</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Low Risk Index
              </span>
            </div>
            
            <p className="text-xs text-slate-505 leading-relaxed max-w-2xl">
              Based on your real-time class score logs, exam results, and GWA index history, the predictive model flags your status as **Safe**. There is a 0.2% probability of failing any ongoing courses for AY 2025-2026.
            </p>

            <div className="text-[10px] text-slate-400 font-medium">
              Verdict generated: <span className="font-mono">May 25, 2026 • 12:00 AM</span> (Calculated daily from live registry snapshots)
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Detailed Recommendations List (2/3 width) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:col-span-2 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-sage-600" /> Model Counseling Recommendations
              </h3>
              <p className="text-xs text-slate-450 mt-1">Personalized academic pointers generated to optimize your term GPA.</p>
            </div>

            <div className="space-y-4">
              {suggestions.map((sug, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sage-100 text-sage-800 text-[10px] font-bold font-mono flex items-center justify-center">
                      {idx + 1}
                    </span>
                    {sug.title}
                  </h4>
                  <p className="text-xs text-slate-550 leading-relaxed pl-7">{sug.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* GWA Trend Chart Widget (1/3 width) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-sage-600" /> GPA Progression Trend
              </h3>
              <p className="text-xs text-slate-450 mt-1">Your General Weighted Average over previous semesters.</p>
            </div>

            {/* Custom SVG Line Chart */}
            <div className="pt-2">
              <svg className="w-full h-32" viewBox="0 0 300 100">
                {/* Horizontal grid lines */}
                <line x1="20" y1="20" x2="280" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="20" y1="50" x2="280" y2="50" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="20" y1="80" x2="280" y2="80" stroke="#f1f5f9" strokeWidth="1" />

                {/* Connecting Line path */}
                <path 
                  d="M 40 85 L 100 65 L 160 55 L 220 40 L 280 30" 
                  fill="none" 
                  stroke="#648560" 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />

                {/* Nodes representing sem indices */}
                <circle cx="40" cy="85" r="4" fill="#3e543c" />
                <circle cx="100" cy="65" r="4" fill="#3e543c" />
                <circle cx="160" cy="55" r="4" fill="#3e543c" />
                <circle cx="220" cy="40" r="4" fill="#3e543c" />
                <circle cx="280" cy="30" r="4" fill="#3e543c" />

                {/* Score labels above nodes */}
                <text x="40" y="75" textAnchor="middle" className="text-[8px] font-mono font-bold fill-slate-500">1.85</text>
                <text x="100" y="55" textAnchor="middle" className="text-[8px] font-mono font-bold fill-slate-500">1.62</text>
                <text x="160" y="45" textAnchor="middle" className="text-[8px] font-mono font-bold fill-slate-500">1.55</text>
                <text x="220" y="30" textAnchor="middle" className="text-[8px] font-mono font-bold fill-slate-500">1.48</text>
                <text x="280" y="20" textAnchor="middle" className="text-[8px] font-mono font-bold fill-emerald-700">1.45</text>
              </svg>

              {/* Labels below chart */}
              <div className="flex justify-between items-center text-[8px] font-mono font-bold text-slate-400 mt-2 px-2">
                <span>AY 23-24</span>
                <span>AY 24-25</span>
                <span>AY 25-26 1S</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
              <HelpCircle className="h-4.5 w-4.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <span>GWA represents weighted grade points. In this grading scale, a lower index represents higher academic achievement (e.g. 1.00 is highest).</span>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}

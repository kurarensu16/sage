import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { MessageSquare, Calendar, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function EvalList() {
  const evaluations = [
    {
      id: 1,
      subjectCode: 'IT201',
      subjectName: 'Data Structures and Algorithms',
      instructor: 'Prof. Amanda Rivera',
      status: 'Pending',
      deadline: 'Jun 15, 2026',
      daysLeft: 4,
      avatarBg: 'bg-sage-100 text-sage-800'
    },
    {
      id: 2,
      subjectCode: 'MATH104',
      subjectName: 'Discrete Mathematics',
      instructor: 'Dr. Carlos Valdes',
      status: 'Pending',
      deadline: 'Jun 15, 2026',
      daysLeft: 4,
      avatarBg: 'bg-emerald-100 text-emerald-850'
    },
    {
      id: 3,
      subjectCode: 'IT101',
      subjectName: 'Introduction to Computing',
      instructor: 'Prof. Amanda Rivera',
      status: 'Submitted',
      deadline: 'Completed',
      daysLeft: 0,
      avatarBg: 'bg-sage-100 text-sage-800'
    }
  ];

  return (
    <>
      <PageHeader title="Faculty Evaluations" breadcrumb="Student Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Info Header Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 items-start">
          <MessageSquare className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900">Anonymity Guaranteed</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Your feedback is completely confidential. Evaluated scores are strictly aggregated, and comments are randomized without any names or IDs attached, compliant with university privacy code FR25.
            </p>
          </div>
        </div>

        {/* Evaluation list grid */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Academic Year 2025-2026 — 1st Semester</h3>
          
          <div className="grid grid-cols-1 gap-4">
            {evaluations.map((evalItem) => (
              <div 
                key={evalItem.id} 
                className={cn(
                  "p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm",
                  evalItem.status === 'Submitted' 
                    ? "bg-slate-50/50 border-slate-200" 
                    : "bg-white border-slate-200 hover:border-sage-300"
                )}
              >
                {/* Faculty Info Block */}
                <div className="flex gap-4 items-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold font-mono text-sm border",
                    evalItem.avatarBg
                  )}>
                    {evalItem.instructor.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('')}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono text-slate-400">{evalItem.subjectCode}</span>
                    <h4 className="font-bold text-sm text-slate-900">{evalItem.instructor}</h4>
                    <p className="text-xs text-slate-500">{evalItem.subjectName}</p>
                  </div>
                </div>

                {/* Status Column */}
                <div className="flex items-center gap-6">
                  
                  {/* Deadline indicator */}
                  <div className="text-left sm:text-right">
                    {evalItem.status === 'Pending' ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Deadline</span>
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-amber-500" /> Closes in {evalItem.daysLeft} days
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Status</span>
                        <div className="text-xs font-semibold text-emerald-650 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Submitted
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions button */}
                  {evalItem.status === 'Pending' ? (
                    <Link 
                      to="/student/evalform"
                      className="px-4 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                      Evaluate <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 rounded-lg border border-slate-200/50 cursor-not-allowed"
                    >
                      Done
                    </button>
                  )}

                </div>

              </div>
            ))}
          </div>

        </div>

      </div>
    </>
  );
}

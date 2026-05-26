import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { TrendingUp, BarChart3, Filter, CheckCircle, XCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function GradeDistribution() {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('prelim');
  const [gradesList, setGradesList] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    average: 0,
    passedCount: 0,
    failedCount: 0,
    brackets: {
      excellent: { count: 0, pct: 0 },   // 1.00 - 1.50
      good: { count: 0, pct: 0 },        // 1.75 - 2.50
      passing: { count: 0, pct: 0 },     // 2.75 - 3.00
      failing: { count: 0, pct: 0 }      // 5.00 / > 3.00
    }
  });

  useEffect(() => {
    const activeClasses = mockDb.getClassrooms().filter(c => c.status === 'active');
    setClassrooms(activeClasses);
    if (activeClasses.length > 0) {
      setSelectedClassId(activeClasses[0].id);
    }
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;

    // Load grades from mockDb for chosen class and period
    const allPosted = mockDb.getPostedGrades();
    const classGrades = allPosted.filter(g => 
      g.classRecordId === selectedClassId && 
      g.gradePeriod === selectedPeriod
    );

    setGradesList(classGrades);

    if (classGrades.length > 0) {
      const total = classGrades.length;
      const sum = classGrades.reduce((acc, curr) => acc + curr.computedGrade, 0);
      const average = sum / total;
      
      const passed = classGrades.filter(g => g.computedGrade <= 3.00);
      const failed = classGrades.filter(g => g.computedGrade > 3.00);
      
      const passedCount = passed.length;
      const failedCount = failed.length;

      // Group into brackets
      const exc = classGrades.filter(g => g.computedGrade >= 1.00 && g.computedGrade <= 1.50).length;
      const gd = classGrades.filter(g => g.computedGrade >= 1.75 && g.computedGrade <= 2.50).length;
      const pass = classGrades.filter(g => g.computedGrade >= 2.75 && g.computedGrade <= 3.00).length;
      const fail = classGrades.filter(g => g.computedGrade > 3.00).length;

      setStats({
        total,
        average,
        passedCount,
        failedCount,
        brackets: {
          excellent: { count: exc, pct: total > 0 ? (exc / total) * 100 : 0 },
          good: { count: gd, pct: total > 0 ? (gd / total) * 100 : 0 },
          passing: { count: pass, pct: total > 0 ? (pass / total) * 100 : 0 },
          failing: { count: fail, pct: total > 0 ? (fail / total) * 100 : 0 }
        }
      });
    } else {
      // Empty state
      setStats({
        total: 0,
        average: 0,
        passedCount: 0,
        failedCount: 0,
        brackets: {
          excellent: { count: 0, pct: 0 },
          good: { count: 0, pct: 0 },
          passing: { count: 0, pct: 0 },
          failing: { count: 0, pct: 0 }
        }
      });
    }
  }, [selectedClassId, selectedPeriod]);

  const selectedClass = classrooms.find(c => c.id === selectedClassId);

  return (
    <>
      <PageHeader title="Grade Distribution Analysis" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Selector Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Select Class & Period
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Subject/Section Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Classroom Section</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.subjectCode} - {c.section} ({c.facultyName})
                  </option>
                ))}
              </select>
            </div>

            {/* Grading Period */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Grading Period</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="prelim">Prelim Period</option>
                <option value="midterm">Midterm Period</option>
                <option value="final">Final Period</option>
              </select>
            </div>

            {/* Context Summary */}
            {selectedClass && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center text-xs">
                <span className="font-bold text-slate-900 truncate">{selectedClass.subjectName}</span>
                <span className="text-slate-500 mt-1">Schedule: {selectedClass.schedule}</span>
              </div>
            )}

          </div>
        </div>

        {gradesList.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: stats metrics cards */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Avg GWA Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center space-y-2">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Average Class GWA</p>
                <h2 className="text-5xl font-bold font-display text-sage-900 tracking-tight font-mono py-2">
                  {stats.average.toFixed(2)}
                </h2>
                <p className="text-xs text-slate-400 leading-normal">
                  Standard Philippine Grade Point Average (1.00 Highest - 3.00 Passing - 5.00 Failing)
                </p>
              </div>

              {/* Pass/Fail count breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-3">
                  Grading Outcomes Summary
                </h3>
                
                <div className="grid grid-cols-2 gap-4 text-center">
                  
                  {/* Passed */}
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                    <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto" />
                    <span className="block text-[10px] text-emerald-800 font-bold uppercase tracking-wide">Passed</span>
                    <span className="block text-xl font-bold text-slate-900 font-mono">
                      {stats.passedCount}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      ({Math.round((stats.passedCount / stats.total) * 100)}%)
                    </span>
                  </div>

                  {/* Failed */}
                  <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                    <XCircle className="h-5 w-5 text-rose-600 mx-auto" />
                    <span className="block text-[10px] text-rose-800 font-bold uppercase tracking-wide">Failed</span>
                    <span className="block text-xl font-bold text-slate-900 font-mono">
                      {stats.failedCount}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      ({Math.round((stats.failedCount / stats.total) * 100)}%)
                    </span>
                  </div>

                </div>
              </div>

            </div>

            {/* Right side: custom bar distribution chart */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold font-display text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-sage-600" /> Grade Brackets Distribution
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Visually tracks GWA performance groups.</p>
                  </div>
                  <span className="text-xs font-bold text-slate-700 font-mono bg-slate-100 px-2 py-0.5 rounded">
                    Total Enrolled: {stats.total}
                  </span>
                </div>

                {/* The Custom CSS Bar Graph */}
                <div className="space-y-6">
                  
                  {/* Excellent Bracket */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">Excellent (1.00 - 1.50)</span>
                      <span className="font-mono font-medium text-slate-500">
                        {stats.brackets.excellent.count} Students ({Math.round(stats.brackets.excellent.pct)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${stats.brackets.excellent.pct || 1}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Good/Satisfactory Bracket */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">Good & Satisfactory (1.75 - 2.50)</span>
                      <span className="font-mono font-medium text-slate-500">
                        {stats.brackets.good.count} Students ({Math.round(stats.brackets.good.pct)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                      <div 
                        className="bg-sage-600 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${stats.brackets.good.pct || 1}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Passing Bracket */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">Passing (2.75 - 3.00)</span>
                      <span className="font-mono font-medium text-slate-500">
                        {stats.brackets.passing.count} Students ({Math.round(stats.brackets.passing.pct)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${stats.brackets.passing.pct || 1}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Failing Bracket */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">Failing (5.00 / Under 3.0)</span>
                      <span className="font-mono font-medium text-slate-500">
                        {stats.brackets.failing.count} Students ({Math.round(stats.brackets.failing.pct)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${stats.brackets.failing.pct || 1}%` }}
                      ></div>
                    </div>
                  </div>

                </div>

              </div>
            </div>

          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center text-slate-400 text-sm space-y-2">
            <BarChart3 className="h-10 w-10 text-slate-350 mx-auto" />
            <h4 className="font-bold font-display text-slate-700">No Grades Posted Yet</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Professors have not yet posted grades for the selected period ({selectedPeriod}) in this section.
            </p>
          </div>
        )}

      </div>
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  BookOpen, 
  AlertCircle, 
  ClipboardCheck, 
  ArrowRight, 
  Sparkles, 
  FileText, 
  GraduationCap, 
  TrendingUp 
} from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [stats, setStats] = useState({
    facultyCount: 0,
    sectionsCount: 0,
    atRiskCount: 0,
    pendingPosts: 0
  });

  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    const users = mockDb.getUsers();
    const classrooms = mockDb.getClassrooms().filter(c => c.status === 'active');
    const postedGrades = mockDb.getPostedGrades();

    // 1. Total Faculty
    const facultyCount = users.filter(u => u.role === 'faculty').length;

    // 2. Active Sections
    const sectionsCount = classrooms.length;

    // 3. At-Risk count (unique students with failing grades > 3.00)
    const failingGrades = postedGrades.filter(g => g.computedGrade > 3.00);
    const atRiskIds = [...new Set(failingGrades.map(g => g.studentId))];
    const atRiskCount = atRiskIds.length || 1; // Fallback to 1 representing John Smith if empty

    // 4. Pending Grade Posts
    // Each class has 3 periods: prelim, midterm, final. Count missing ones
    let pendingPosts = 0;
    classrooms.forEach(c => {
      const postedPeriods = postedGrades.filter(g => g.classRecordId === c.id).map(g => g.gradePeriod);
      const uniquePeriods = [...new Set(postedPeriods)];
      pendingPosts += (3 - uniquePeriods.length);
    });

    setStats({
      facultyCount,
      sectionsCount,
      atRiskCount,
      pendingPosts
    });

    // Generate dynamic AI academic diagnostics
    const diagnostics = [];

    // Check high failures GWA
    failingGrades.forEach(g => {
      diagnostics.push({
        id: `diag-${g.id}`,
        type: 'error',
        title: 'High Academic Risk Detected',
        message: `Student ${g.studentName} is flag-marked at high risk with GWA of ${g.computedGrade.toFixed(2)} (${g.remarks}) in ${g.subjectCode} (${g.section}) for ${g.gradePeriod} period.`,
        action: () => navigate('/dean/atriskstudents')
      });
    });

    // Check evaluation warnings (e.g. if average ratings are below 4.0)
    const windows = mockDb.getEvalWindows();
    windows.forEach(w => {
      // Simulate response rate notices
      if (w.totalStudents > 0 && (w.responsesCount / w.totalStudents) < 0.5) {
        diagnostics.push({
          id: `diag-${w.id}`,
          type: 'warning',
          title: 'Low Evaluation Engagement',
          message: `Prof. ${w.facultyName}'s class evaluation for ${w.section} has a response rate of only ${Math.round((w.responsesCount / w.totalStudents) * 100)}% (${w.responsesCount}/${w.totalStudents}).`,
          action: () => navigate('/dean/evalresultsoverview')
        });
      }
    });

    // Generic warning if pending grade posts exist
    if (pendingPosts > 0) {
      diagnostics.push({
        id: 'diag-pending-posts',
        type: 'info',
        title: 'Pending Class Grade Postings',
        message: `There are ${pendingPosts} outstanding grading periods (Prelim/Midterm/Finals) awaiting submission across active classrooms.`,
        action: () => navigate('/dean/gradepostingstatus')
      });
    }

    setWarnings(diagnostics);

  }, [navigate]);

  return (
    <>
      <PageHeader title="Academic Oversight" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          
          {/* Card 1: Faculty */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-sage-50 text-sage-700 rounded-lg">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Faculty</p>
              <h3 className="text-2xl font-bold font-display text-slate-900 mt-1 font-mono">
                {stats.facultyCount}
              </h3>
            </div>
          </div>

          {/* Card 2: Active Sections */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Classrooms</p>
              <h3 className="text-2xl font-bold font-display text-slate-900 mt-1 font-mono">
                {stats.sectionsCount}
              </h3>
            </div>
          </div>

          {/* Card 3: At-Risk Students */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-700 rounded-lg">
              <AlertCircle className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">At-Risk Students</p>
              <h3 className="text-2xl font-bold font-display text-rose-700 mt-1 font-mono">
                {stats.atRiskCount}
              </h3>
            </div>
          </div>

          {/* Card 4: Pending Posts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pending Grade Posts</p>
              <h3 className="text-2xl font-bold font-display text-amber-700 mt-1 font-mono">
                {stats.pendingPosts}
              </h3>
            </div>
          </div>

        </div>

        {/* Middle grid split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick links & navigation */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold font-display text-slate-950 uppercase tracking-wide border-b border-slate-100 pb-3">
                Quick Portal Shortcuts
              </h3>
              
              <div className="flex flex-col gap-2.5">
                <button 
                  onClick={() => navigate('/dean/gradepostingstatus')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-sage-600" /> Grade Posting Overview
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/gradedistribution')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-sage-600" /> Grade Distribution Analysis
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/evalresultsoverview')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-sage-600" /> Faculty Evaluation ratings
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/atriskstudents')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-sage-600" /> At-Risk Students Ledger
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/summaryreports')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sage-600" /> Generate Summary Reports
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* AI Performance diagnostics */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold font-display text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-violet-600" /> AI Performance Predictions & Warnings
                </h3>
                <span className="text-[10px] bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-mono font-medium">
                  Active Agent Monitor
                </span>
              </div>

              <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                {warnings.length > 0 ? (
                  warnings.map((warn) => (
                    <div 
                      key={warn.id}
                      className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        warn.type === 'error' 
                          ? 'bg-rose-50 border-rose-100 text-rose-800' 
                          : warn.type === 'warning'
                          ? 'bg-amber-50 border-amber-100 text-amber-800'
                          : 'bg-sky-50 border-sky-100 text-sky-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" /> {warn.title}
                        </h4>
                        <p className="text-xs leading-relaxed max-w-xl font-sans mt-0.5">
                          {warn.message}
                        </p>
                      </div>
                      <button
                        onClick={warn.action}
                        className={`text-xs font-bold flex items-center gap-1 cursor-pointer self-start sm:self-auto transition-opacity hover:opacity-85 ${
                          warn.type === 'error' 
                            ? 'text-rose-700' 
                            : warn.type === 'warning'
                            ? 'text-amber-700'
                            : 'text-sky-700'
                        }`}
                      >
                        Inspect <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    No active performance alerts or anomalies detected.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}

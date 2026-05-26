import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Award, 
  MessageSquare, 
  BrainCircuit, 
  ChevronRight, 
  ArrowRight, 
  Calendar, 
  Bell, 
  Activity,
  CheckCircle2
} from 'lucide-react';

export default function Dashboard() {
  // Enrolled subjects data
  const enrolledSubjects = [
    { code: 'IT101', name: 'Introduction to Computing', credits: 3, professor: 'Prof. Amanda Rivera', status: 'Grades Posted', grade: '1.25' },
    { code: 'IT201', name: 'Data Structures and Algorithms', credits: 3, professor: 'Prof. Amanda Rivera', status: 'Ongoing', grade: '—' },
    { code: 'CS301', name: 'Artificial Intelligence', credits: 3, professor: 'Prof. Amanda Rivera', status: 'Ongoing', grade: '—' },
    { code: 'MATH104', name: 'Discrete Mathematics', credits: 3, professor: 'Dr. Carlos Valdes', status: 'Ongoing', grade: '—' }
  ];

  // Latest notifications
  const recentGrades = [
    { subject: 'IT101', period: 'Midterm', grade: '1.25', date: 'Yesterday' }
  ];

  return (
    <>
      <PageHeader title="Student Overview" breadcrumb="Student Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* Welcome Banner Hero */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Academic Term: AY 2025-2026 • First Semester
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight font-display">Welcome Back, Sarah!</h1>
            <p className="text-sm text-sage-200/90 max-w-xl">
              Track your real-time grades, evaluate faculty performance, and review AI counseling insights.
            </p>
          </div>
          
          <div className="flex gap-4">
            <Link 
              to="/student/mygradeslist" 
              className="px-5 py-3 text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <Award className="h-4 w-4" /> View My Grades
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current GWA</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono mt-2">1.45</h3>
              <p className="text-xs text-slate-500 mt-1">Excellent standing</p>
            </div>
            <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
              <Award className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Enrolled Subjects</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono mt-2">04</h3>
              <p className="text-xs text-slate-500 mt-1">12 total credit units</p>
            </div>
            <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Evaluations</span>
              <h3 className="text-3xl font-extrabold text-amber-600 font-mono mt-2">02</h3>
              <p className="text-xs text-slate-500 mt-1">Due before end of term</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Recommendation</span>
              <h3 className="text-3xl font-extrabold text-emerald-600 font-mono mt-2">Safe</h3>
              <p className="text-xs text-slate-500 mt-1">No academic risk flags</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <BrainCircuit className="h-5 w-5" />
            </div>
          </div>

        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Enrolled Classes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display text-slate-900">Enrolled Subjects</h3>
                <p className="text-xs text-slate-500">Overview of courses and instructors for the current term.</p>
              </div>
              <Link to="/student/mygradeslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1">
                View Detailed Grades <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {enrolledSubjects.map((sub, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 hover:border-sage-300 transition-all bg-slate-50/50 flex flex-col justify-between h-36">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold font-mono text-slate-400">{sub.code}</span>
                      {sub.status === 'Grades Posted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {sub.grade} Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          Active
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mt-2 line-clamp-1">{sub.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{sub.professor}</p>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold border-t border-slate-200/60 pt-2">
                    <span>{sub.credits} Credit Units</span>
                    <Link to="/student/mygradesdetail" className="text-sage-600 hover:text-sage-700 flex items-center gap-0.5">
                      Card Details <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick-look Widgets */}
          <div className="space-y-6">
            
            {/* AI recommendation alert */}
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">AI Counselor Advice</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your current GWA of <strong className="text-slate-800">1.45</strong> places you in the top 12% of the computer studies division. Keep up the consistent quiz scores in Data Structures!
              </p>
              <Link to="/student/airecommendation" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                View Recommendations <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Pending evaluations card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-sage-600" />
                <h3 className="text-sm font-bold text-slate-900">Faculty Evaluations</h3>
              </div>
              <p className="text-xs text-slate-500">
                You have 2 pending instructor evaluation surveys. Submissions are entirely anonymous.
              </p>
              <Link to="/student/evallist" className="inline-flex items-center gap-1 text-xs font-bold text-sage-600 hover:underline">
                Open Evaluations List <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}

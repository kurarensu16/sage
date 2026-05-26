import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Users, 
  Award, 
  Clock, 
  AlertCircle, 
  Calendar, 
  ChevronRight, 
  ArrowRight, 
  CheckSquare, 
  TrendingUp, 
  FileText,
  UserCheck,
  Plus
} from 'lucide-react';

export default function Dashboard() {
  // Handled classes summary data
  const assignedClasses = [
    {
      id: 1,
      subjectCode: 'IT101',
      subjectName: 'Introduction to Computing',
      section: 'BSIT-1A',
      schedule: 'MWF 9:00AM - 10:30AM',
      room: 'Lab 1',
      enrolled: 45,
      status: 'Ongoing',
      gradingPeriod: 'Midterm',
      completion: 75,
    },
    {
      id: 2,
      subjectCode: 'IT201',
      subjectName: 'Data Structures and Algorithms',
      section: 'BSIT-2B',
      schedule: 'TTh 1:00PM - 3:00PM',
      room: 'Lab 3',
      enrolled: 38,
      status: 'Ongoing',
      gradingPeriod: 'Midterm',
      completion: 60,
    },
    {
      id: 3,
      subjectCode: 'CS301',
      subjectName: 'Artificial Intelligence',
      section: 'BSCS-3A',
      schedule: 'MWF 1:00PM - 2:30PM',
      room: 'Lec 5',
      enrolled: 42,
      status: 'Pending Setup',
      gradingPeriod: 'Prelim',
      completion: 0,
    },
    {
      id: 4,
      subjectCode: 'IT401',
      subjectName: 'Capstone Project 1',
      section: 'BSIT-4A',
      schedule: 'TTh 9:00AM - 12:00PM',
      room: 'Lab 2',
      enrolled: 25,
      status: 'Grades Posted',
      gradingPeriod: 'Midterm',
      completion: 100,
    }
  ];

  // Outstanding tasks requiring immediate attention
  const urgentTasks = [
    {
      id: 1,
      title: 'Submit Midterm Grades',
      description: 'Midterm grade submittal deadline for BSIT-4A (Capstone Project 1) is approaching.',
      dueDate: 'In 2 days',
      type: 'warning',
      actionLink: '/faculty/scoreinput'
    },
    {
      id: 2,
      title: 'Pending Grade Weights Setup',
      description: 'CS301 (Artificial Intelligence) requires class record setup before score logging.',
      dueDate: 'Immediate',
      type: 'danger',
      actionLink: '/faculty/gradecomponentssetup'
    }
  ];

  // Quick activity logs
  const activities = [
    { time: '10 mins ago', message: 'Logged Exam scores for IT201 - BSIT-2B' },
    { time: '2 hours ago', message: 'Grade weight setup approved for IT101' },
    { time: 'Yesterday', message: 'Exported final grades datasheet for IT401 - BSIT-4A' },
  ];

  // Today's schedule preview
  const todaysSchedule = [
    { time: '9:00 AM - 10:30 AM', subject: 'IT101', section: 'BSIT-1A', room: 'Lab 1' },
    { time: '1:00 PM - 2:30 PM', subject: 'CS301', section: 'BSCS-3A', room: 'Lec 5' },
  ];

  return (
    <>
      <PageHeader title="Overview Dashboard" breadcrumb="Faculty Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* Welcome Hero Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Active Term: AY 2025-2026 • First Semester
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight font-display">Welcome Back, Instructor!</h1>
            <p className="text-sm text-sage-200/90 max-w-xl">
              Monitor class submissions, track student performance metrics, and submit calculated grades securely to the Dean's Office.
            </p>
          </div>
          
          <div className="flex gap-4">
            <Link 
              to="/faculty/classrecordcreate" 
              className="px-5 py-3 text-sm font-semibold bg-sage-700/80 hover:bg-sage-600/90 text-white rounded-xl transition-all border border-sage-600/30 flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> Initialize Class
            </Link>
            <Link 
              to="/faculty/classrecordslist" 
              className="px-5 py-3 text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <BookOpen className="h-4 w-4" /> Manage Classes
            </Link>
          </div>
        </div>

        {/* Action Center / Alerts */}
        {urgentTasks.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-display text-slate-900">Immediate Action Required</h2>
              <span className="text-xs text-rose-500 font-bold bg-rose-50 px-2.5 py-1 rounded-full animate-pulse border border-rose-200">
                {urgentTasks.length} Pending Actions
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {urgentTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all hover:shadow-sm ${
                    task.type === 'danger' 
                      ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300' 
                      : 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex gap-3">
                    <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      task.type === 'danger' ? 'text-rose-600' : 'text-amber-600'
                    }`} />
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{task.title}</h4>
                      <p className="text-xs text-slate-600 mt-1">{task.description}</p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 border ${
                        task.type === 'danger' 
                          ? 'bg-rose-100 text-rose-800 border-rose-200' 
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        Due: {task.dueDate}
                      </span>
                    </div>
                  </div>
                  
                  <Link 
                    to={task.actionLink} 
                    className="p-2 hover:bg-slate-200/50 rounded-lg text-slate-600 hover:text-slate-950 transition-colors flex-shrink-0"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Handled Classes</span>
              <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-extrabold text-slate-900 font-mono">04</h3>
              <p className="text-[10px] text-slate-500 mt-1">Across 2 courses / sections</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Grade Posts</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-extrabold text-slate-900 font-mono">01</h3>
              <p className="text-[10px] text-amber-600 mt-1 font-semibold">CS301 (BSCS-3A)</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Eval Windows</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-extrabold text-slate-900 font-mono">Open</h3>
              <p className="text-[10px] text-slate-500 mt-1">Until Jun 15, 2026</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</span>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-extrabold text-slate-900 font-mono">02</h3>
              <p className="text-[10px] text-slate-500 mt-1">Urgent alerts pending</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider">At-Risk Students</span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-extrabold text-rose-600 font-mono">08</h3>
              <p className="text-[10px] text-rose-500 mt-1 font-semibold">Flagged across classes</p>
            </div>
          </div>

        </div>

        {/* Classes Table / Active Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Handled Sections */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display text-slate-900">Active Handled Classes</h3>
                <p className="text-xs text-slate-500">Track grading progress and current schedules per section.</p>
              </div>
              <Link to="/faculty/classrecordslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="overflow-x-auto table-container">
              <table className="min-w-full divide-y divide-slate-100 text-left">
                <thead>
                  <tr className="text-slate-400 text-xs font-semibold tracking-wider">
                    <th className="pb-3 font-medium">Class / Section</th>
                    <th className="pb-3 font-medium">Schedule</th>
                    <th className="pb-3 font-medium text-center">Students</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {assignedClasses.map((cls) => (
                    <tr key={cls.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4">
                        <div className="font-bold text-slate-900 text-sm">{cls.subjectCode}</div>
                        <div className="text-slate-400 text-[10px] font-normal truncate max-w-[180px]">{cls.subjectName}</div>
                      </td>
                      <td className="py-4 text-slate-500">
                        <div>{cls.schedule}</div>
                        <div className="text-[10px] text-slate-400">{cls.room}</div>
                      </td>
                      <td className="py-4 text-center font-mono font-semibold text-slate-900">
                        {cls.enrolled}
                      </td>
                      <td className="py-4">
                        {cls.status === 'Pending Setup' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Setup
                          </span>
                        ) : cls.status === 'Ongoing' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Grading Ongoing
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Grades Posted
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-right">
                        {cls.status === 'Pending Setup' ? (
                          <Link to="/faculty/gradecomponentssetup" className="text-sage-600 hover:text-sage-700 font-bold hover:underline">
                            Setup Weights
                          </Link>
                        ) : (
                          <Link to="/faculty/scoreinput" className="text-sage-600 hover:text-sage-700 font-bold hover:underline">
                            Input Scores
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column details (schedule preview & activities) */}
          <div className="space-y-6">
            
            {/* Today's Schedule Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sage-600" />
                <h3 className="text-sm font-bold font-display text-slate-900">Today's Class Schedule</h3>
              </div>

              <div className="space-y-3">
                {todaysSchedule.map((sched, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900">{sched.subject} ({sched.section})</div>
                      <div className="text-[10px] text-slate-400">{sched.room}</div>
                    </div>
                    <div className="text-right text-slate-500 font-medium">
                      <Clock className="h-3 w-3 inline mr-1 text-slate-400" />
                      {sched.time.split(' - ')[0]}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activities Panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold font-display text-slate-900">Recent Activity Logs</h3>
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-3 before:w-0.5 before:bg-slate-100">
                {activities.map((act, index) => (
                  <div key={index} className="flex gap-4 items-start relative text-xs">
                    <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 flex items-center justify-center text-sage-600 flex-shrink-0 z-10">
                      <CheckSquare className="h-3 w-3" />
                    </div>
                    <div>
                      <p className="text-slate-700 font-medium">{act.message}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">{act.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}


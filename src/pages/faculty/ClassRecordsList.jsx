import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Users, Calendar, Clock, BookOpen, Settings, Edit3, ChevronRight, Eye, Plus, Lock } from 'lucide-react';

export default function ClassRecordsList() {
  // Mock data for assigned classes
  const classes = [
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
    }
  ];

  return (
    <>
      <PageHeader title="My Class Records" breadcrumb="Faculty Portal">
        <Link 
          to="/faculty/classrecordcreate" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Initialize Class Record
        </Link>
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filter
        </button>
      </PageHeader>
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative max-w-md w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input 
                  type="text" 
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-sage-400 focus:border-sage-400 sm:text-sm transition-colors outline-none" 
                  placeholder="Search by subject code, name, or section..." 
                />
            </div>
            
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                <button className="px-3 py-1.5 text-sm font-medium bg-sage-50 text-sage-700 rounded-md transition-colors">Current Semester</button>
                <button className="px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md transition-colors">Past Archives</button>
            </div>
        </div>

        {/* Classes Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {classes.map((cls) => (
                <div key={cls.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-sage-300 transition-all flex flex-col group">
                    
                    {/* Card Header */}
                    <div className="p-5 border-b border-slate-100 relative">
                        <div className="flex justify-between items-start mb-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {cls.section}
                            </span>
                            
                            {cls.status === 'Pending Setup' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    {cls.status}
                                </span>
                            )}
                            {cls.status === 'Ongoing' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {cls.gradingPeriod} Ongoing
                                </span>
                            )}
                            {cls.status === 'Grades Posted' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {cls.gradingPeriod} Posted
                                </span>
                            )}
                        </div>
                        
                        <h3 className="text-xl font-bold font-display text-slate-900 leading-tight">
                            {cls.subjectCode}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-1">{cls.subjectName}</p>
                    </div>
                    
                    {/* Card Body (Details) */}
                    <div className="p-5 flex-1 space-y-3">
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                            <Clock className="h-4 w-4 text-sage-500 flex-shrink-0" />
                            <span>{cls.schedule}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                            <Calendar className="h-4 w-4 text-sage-500 flex-shrink-0" />
                            <span>{cls.room}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                            <Users className="h-4 w-4 text-sage-500 flex-shrink-0" />
                            <span><strong className="text-slate-900 font-mono">{cls.enrolled}</strong> Students Enrolled</span>
                        </div>
                    </div>
                    
                    {/* Card Footer (Actions) */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-xl grid grid-cols-2 gap-3">
                        {cls.status === 'Pending Setup' ? (
                            <Link to="/faculty/gradecomponentssetup" className="col-span-2 flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm">
                                <Settings className="h-4 w-4" /> Setup Grade Weights
                            </Link>
                        ) : cls.status === 'Grades Posted' ? (
                            <Link to="/faculty/postedgradesview" className="col-span-2 flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:border-sage-305 hover:text-slate-900 rounded-lg transition-colors shadow-sm">
                                <Lock className="h-4 w-4 text-slate-400" /> View Posted Grades
                            </Link>
                        ) : (
                            <>
                                <Link to="/faculty/scoreinput" className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm">
                                    <Edit3 className="h-4 w-4" /> Input Scores
                                </Link>
                                <Link to="/faculty/gradecomputationpreview" className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-lg transition-colors">
                                    <Eye className="h-4 w-4" /> View Computed
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>

      </div>
    </>
  );
}


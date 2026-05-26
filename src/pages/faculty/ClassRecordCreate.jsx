import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  ArrowRight, 
  HelpCircle, 
  ChevronRight, 
  AlertCircle,
  Copy
} from 'lucide-react';

export default function ClassRecordCreate() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    gradingPeriod: 'Midterm',
    copyWeights: false,
    sourceClass: ''
  });

  const availableSubjects = [
    { code: 'CS301', name: 'Artificial Intelligence (Lecture)' },
    { code: 'IT302', name: 'Database Systems 2 (Lab)' },
    { code: 'CS302', name: 'Software Engineering 1 (Lecture)' }
  ];

  const sections = ['BSCS-3A', 'BSIT-3A', 'BSIT-3B', 'BSCS-3B'];
  
  const activeClassRecords = [
    { id: 1, label: 'IT101 - BSIT-1A (Introduction to Computing)' },
    { id: 2, label: 'IT201 - BSIT-2B (Data Structures and Algorithms)' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate creation and navigate to setups or list
    if (formData.copyWeights) {
      navigate('/faculty/classrecordslist');
    } else {
      navigate('/faculty/gradecomponentssetup');
    }
  };

  return (
    <>
      <PageHeader title="Create Class Record" breadcrumb="Faculty Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 max-w-3xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">Initialize New Record</span>
        </div>

        {/* Warning Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900">Registry Sync Warning</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Initializing a new class record will pull active student enrollments directly from the university registrar. Ensure that all student adds/drops have been finalized for this section.
            </p>
          </div>
        </div>

        {/* Setup Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Subject Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Subject / Course</label>
              <select
                required
                value={formData.subject}
                onChange={(e) => setFormData({...formData, subject: e.target.value})}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Select subject...</option>
                {availableSubjects.map((sub, idx) => (
                  <option key={idx} value={sub.code}>{sub.code} - {sub.name}</option>
                ))}
              </select>
            </div>

            {/* Section Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Section</label>
              <select
                required
                value={formData.section}
                onChange={(e) => setFormData({...formData, section: e.target.value})}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Select section...</option>
                {sections.map((sec, idx) => (
                  <option key={idx} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            {/* Grading Period */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Initial Grading Period</label>
              <select
                value={formData.gradingPeriod}
                onChange={(e) => setFormData({...formData, gradingPeriod: e.target.value})}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="Prelim">Prelim</option>
                <option value="Midterm">Midterm</option>
                <option value="Final">Final</option>
              </select>
            </div>

          </div>

          {/* Copy Setup Option */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="copyWeights"
                checked={formData.copyWeights}
                onChange={(e) => setFormData({...formData, copyWeights: e.target.checked})}
                className="w-4.5 h-4.5 text-sage-600 bg-gray-50 border-gray-300 rounded focus:ring-sage-500 focus:ring-1 cursor-pointer"
              />
              <label htmlFor="copyWeights" className="text-sm font-semibold text-slate-800 cursor-pointer flex items-center gap-1.5 select-none">
                <Copy className="h-4 w-4 text-slate-400" /> Copy component weights from an existing class
              </label>
            </div>

            {formData.copyWeights && (
              <div className="flex flex-col gap-2 max-w-md animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Source Class Record</label>
                <select
                  required={formData.copyWeights}
                  value={formData.sourceClass}
                  onChange={(e) => setFormData({...formData, sourceClass: e.target.value})}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select source record...</option>
                  {activeClassRecords.map((rec) => (
                    <option key={rec.id} value={rec.id}>{rec.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-slate-100 pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/faculty/classrecordslist')}
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              Initialize Class Record <ArrowRight className="h-4 w-4" />
            </button>
          </div>

        </form>

      </div>
    </>
  );
}


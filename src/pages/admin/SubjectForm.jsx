import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, BookOpen } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

export default function SubjectForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const subjectId = params.get('id');

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    units: 3,
    department: 'College of Computer Studies'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (subjectId) {
      setIsEditMode(true);
      const subjects = mockDb.getSubjects();
      const existing = subjects.find(s => s.id === subjectId);
      if (existing) {
        let dept = existing.department;
        if (dept === 'College of IT' || dept === 'College of CS') {
          dept = 'College of Computer Studies';
        }
        setFormData({
          code: existing.code,
          name: existing.name,
          units: existing.units,
          department: dept || 'College of Computer Studies'
        });
      } else {
        setErrorMsg('Subject not found in database.');
      }
    }
  }, [subjectId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.code.trim() || !formData.name.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    // Uniqueness validation (check duplicate code for other subjects)
    const subjects = mockDb.getSubjects();
    const codeExists = subjects.some(s => s.code.toUpperCase() === formData.code.toUpperCase().trim() && s.id !== subjectId);
    if (codeExists) {
      setErrorMsg(`Subject code "${formData.code.trim().toUpperCase()}" is already registered.`);
      return;
    }

    const subjectToSave = {
      ...formData,
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      units: parseInt(formData.units, 10)
    };

    if (isEditMode) {
      subjectToSave.id = subjectId;
    }

    mockDb.saveSubject(subjectToSave);
    navigate('/admin/subjectlist');
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Edit Pre-loaded Subject" : "Pre-load New Subject"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/subjectlist')}>
            Subjects Database
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900 font-sans">
            {isEditMode ? "Edit Subject" : "Pre-load Subject"}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold flex items-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">Subject Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Define subject properties in the school year database.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Subject Code */}
            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Subject Code <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.code}
                onChange={(e) => setFormData({...formData, code: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. IT101"
              />
            </div>

            {/* Subject Name / Description */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Descriptive Title <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. Introduction to Computing"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Units */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Academic Units</label>
              <select
                value={formData.units}
                onChange={(e) => setFormData({...formData, units: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="1">1 Unit</option>
                <option value="2">2 Units</option>
                <option value="3">3 Units</option>
                <option value="4">4 Units</option>
                <option value="5">5 Units</option>
              </select>
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Owner College <span className="text-rose-500">*</span></label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                  <option key={college} value={college}>{college}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/admin/subjectlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:border-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> {isEditMode ? "Save Subject Details" : "Pre-load Subject"}
            </button>
          </div>
        </form>

      </div>
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Layers } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

export default function SectionForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const sectionId = params.get('id');

  const [formData, setFormData] = useState({
    name: '',
    schoolYear: '2025-2026',
    semester: '2nd',
    department: 'College of Computer Studies',
    program: 'Bachelor of Science in Information Technology'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (sectionId) {
      setIsEditMode(true);
      const sections = mockDb.getSections();
      const existing = sections.find(s => s.id === sectionId);
      if (existing) {
        let dept = existing.department;
        let prog = existing.program;
        if (dept === 'College of IT') {
          dept = 'College of Computer Studies';
          prog = prog || 'Bachelor of Science in Information Technology';
        } else if (dept === 'College of CS') {
          dept = 'College of Computer Studies';
          prog = prog || 'Bachelor of Science in Computer Science';
        }
        setFormData({
          name: existing.name,
          schoolYear: existing.schoolYear,
          semester: existing.semester,
          department: dept || 'College of Computer Studies',
          program: prog || (DYCI_ACADEMIC_PROGRAMS[dept]?.[0] || '')
        });
      } else {
        setErrorMsg('Section not found in database.');
      }
    }
  }, [sectionId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    // Uniqueness validation (check duplicate name in same school year and semester)
    const sections = mockDb.getSections();
    const sectionExists = sections.some(s => 
      s.name.toUpperCase() === formData.name.toUpperCase().trim() && 
      s.schoolYear === formData.schoolYear && 
      s.semester === formData.semester && 
      s.id !== sectionId
    );
    if (sectionExists) {
      setErrorMsg(`Section name "${formData.name.trim().toUpperCase()}" is already registered for ${formData.schoolYear} (${formData.semester} Sem).`);
      return;
    }

    const sectionToSave = {
      ...formData,
      name: formData.name.trim().toUpperCase()
    };

    if (isEditMode) {
      sectionToSave.id = sectionId;
    }

    mockDb.saveSection(sectionToSave);
    navigate('/admin/sectionlist');
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Edit Pre-loaded Section" : "Pre-load New Section"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/sectionlist')}>
            Sections Database
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900 font-sans">
            {isEditMode ? "Edit Section" : "Pre-load Section"}
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
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">Section Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure target cohort and class sections databases.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Section Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Section Name <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. BSIT-1A"
              />
            </div>

            {/* Department/College */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Owner College <span className="text-rose-500">*</span></label>
              <select
                value={formData.department}
                onChange={(e) => {
                  const selectedCollege = e.target.value;
                  const defaultProgram = DYCI_ACADEMIC_PROGRAMS[selectedCollege]?.[0] || '';
                  setFormData({
                    ...formData,
                    department: selectedCollege,
                    program: defaultProgram
                  });
                }}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                  <option key={college} value={college}>{college}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Degree Program Selection */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Degree Program <span className="text-rose-500">*</span></label>
              <select
                value={formData.program}
                onChange={(e) => setFormData({...formData, program: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                {(DYCI_ACADEMIC_PROGRAMS[formData.department] || []).map(prog => (
                  <option key={prog} value={prog}>{prog}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* School Year */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">School Year <span className="text-rose-500">*</span></label>
              <select
                value={formData.schoolYear}
                onChange={(e) => setFormData({...formData, schoolYear: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer font-mono"
              >
                <option value="2024-2025">2024-2025</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>

            {/* Semester */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Semester <span className="text-rose-500">*</span></label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData({...formData, semester: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/admin/sectionlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:border-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> {isEditMode ? "Save Section Details" : "Pre-load Section"}
            </button>
          </div>
        </form>

      </div>
    </>
  );
}

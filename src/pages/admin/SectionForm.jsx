import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SuccessModal from '../../components/SuccessModal';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

const PROGRAM_ABBREVIATIONS = {
  "Bachelor of Science in Accountancy": "BSA",
  "Bachelor of Science in Accounting Information System": "BSAIS",
  "Bachelor of Arts in Political Science": "BAPS",
  "Bachelor of Science in Business Administration": "BSBA",
  "Bachelor of Science in Business Administration Major in Human Resource Development Management": "BSBA-HRDM",
  "Bachelor of Science in Business Administration Major in Financial Management": "BSBA-FM",
  "Bachelor of Science in Business Administration Major in Operations Management": "BSBA-OM",
  "Bachelor of Science in Business Administration Major in Marketing Management": "BSBA-MM",
  "Bachelor of Science in Computer Science": "BSCS",
  "Bachelor of Science in Computer Engineering": "BSCpE",
  "Bachelor of Science in Information Technology": "BSIT",
  "Associate in Computer Technology": "ACT",
  "Bachelor of Elementary Education": "BEEd",
  "Bachelor of Secondary Education Major in Mathematics": "BSEd-Math",
  "Bachelor of Secondary Education Major in Filipino": "BSEd-Fil",
  "Bachelor of Secondary Education Major in English": "BSEd-Eng",
  "Bachelor of Secondary Education Major in Sciences": "BSEd-Sci",
  "Continuing Professional Teacher Education": "CPTE",
  "Bachelor of Science in Nursing": "BSN",
  "Bachelor of Science in Midwifery": "BSM",
  "Bachelor of Science in Hospitality Management": "BSHM",
  "Bachelor of Science in Tourism Management": "BSTM",
  "Bachelor of Science in Marine Transportation": "BSMT",
  "Bachelor of Science in Marine Engineering": "BSMarE",
  "Bachelor of Science in Mechanical Engineering": "BSME",
  "Bachelor of Arts in Psychology": "BAPsych"
};

export default function SectionForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const sectionId = params.get('id');

  const [formData, setFormData] = useState({
    name: '',
    schoolYear: '2025-2026',
    semester: '2nd',
    departmentId: '',
    programName: '',
    yearLevel: '1st Year',
    suffix: 'A'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allDepartments, setAllDepartments] = useState([]);
  const [allPrograms, setAllPrograms] = useState([]);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const { data: depts } = await supabase.from('departments').select('*').order('name');
        const { data: progs } = await supabase.from('programs').select('*').order('name');
        
        if (depts) setAllDepartments(depts);
        if (progs) setAllPrograms(progs);

        if (!sectionId && depts && depts.length > 0) {
          setFormData(prev => ({ ...prev, departmentId: depts[0].department_id }));
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    }
    loadData();
  }, [sectionId]);

  useEffect(() => {
    if (sectionId) {
      setIsEditMode(true);
      async function loadSection() {
        const { data } = await supabase
          .from('sections')
          .select('*, departments(name)')
          .eq('section_id', sectionId)
          .single();
          
        if (data) {
          const lastHyphenIndex = data.name.lastIndexOf('-');
          let programAbbr = '';
          let yearDigit = '';
          let suffix = '';
          
          if (lastHyphenIndex !== -1) {
            programAbbr = data.name.slice(0, lastHyphenIndex);
            const remaining = data.name.slice(lastHyphenIndex + 1);
            if (remaining.length > 0) {
              yearDigit = remaining[0];
              suffix = remaining.slice(1);
            }
          } else {
            const match = data.name.match(/^([A-Z-]+)(\d)([A-Z]*)$/i);
            if (match) {
              programAbbr = match[1];
              yearDigit = match[2];
              suffix = match[3];
            }
          }
          
          const matchedProgramName = Object.keys(PROGRAM_ABBREVIATIONS).find(
            key => PROGRAM_ABBREVIATIONS[key] === programAbbr.toUpperCase()
          ) || '';

          const yearLevelText = 
            yearDigit === '1' ? '1st Year' :
            yearDigit === '2' ? '2nd Year' :
            yearDigit === '3' ? '3rd Year' :
            yearDigit === '4' ? '4th Year' : '1st Year';

          setFormData({
            name: data.name,
            schoolYear: data.school_year,
            semester: data.semester,
            departmentId: data.department_id || '',
            programName: matchedProgramName,
            yearLevel: yearLevelText,
            suffix: suffix || 'A'
          });
        } else {
          setErrorMsg('Section not found in database.');
        }
      }
      loadSection();
    }
  }, [sectionId]);

  // Set default program if college is selected
  useEffect(() => {
    if (formData.departmentId && allPrograms.length > 0) {
      const filtered = allPrograms.filter(p => p.department_id === formData.departmentId);
      if (filtered.length > 0) {
        const exists = filtered.some(p => p.name === formData.programName);
        if (!exists) {
          setFormData(prev => ({ ...prev, programName: filtered[0].name }));
        }
      } else {
        setFormData(prev => ({ ...prev, programName: '' }));
      }
    }
  }, [formData.departmentId, allPrograms]);

  // Generate Section Name Preview reactively
  useEffect(() => {
    if (!isEditMode || (isEditMode && formData.programName && formData.yearLevel && formData.suffix)) {
      const programAbbr = PROGRAM_ABBREVIATIONS[formData.programName] || '';
      const yearDigit = 
        formData.yearLevel === '1st Year' ? '1' :
        formData.yearLevel === '2nd Year' ? '2' :
        formData.yearLevel === '3rd Year' ? '3' :
        formData.yearLevel === '4th Year' ? '4' : '';
      
      const constructedName = programAbbr && yearDigit && formData.suffix 
        ? `${programAbbr}-${yearDigit}${formData.suffix}`.toUpperCase()
        : '';
        
      setFormData(prev => ({ ...prev, name: constructedName }));
    }
  }, [formData.programName, formData.yearLevel, formData.suffix, isEditMode]);

  const filteredPrograms = allPrograms.filter(p => p.department_id === formData.departmentId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        throw new Error('Section details are incomplete. Section name could not be generated.');
      }

      if (!formData.departmentId) {
        throw new Error('Please select an owner college.');
      }

      const payload = {
        name: formData.name.trim().toUpperCase(),
        school_year: formData.schoolYear,
        semester: formData.semester,
        department_id: formData.departmentId
      };

      if (isEditMode) {
        const { error } = await supabase
          .from('sections')
          .update(payload)
          .eq('section_id', sectionId);
        
        if (error) {
           if (error.code === '23505') throw new Error(`Section "${formData.name}" is already registered for ${formData.schoolYear} (${formData.semester} Sem).`);
           throw error;
        }

        await logActivity(
          'Section Update',
          `Updated section "${formData.name}" (${formData.schoolYear}, ${formData.semester} Semester).`,
          resolveActorName(profile, user)
        );
      } else {
        const { error } = await supabase
          .from('sections')
          .insert(payload);
        
        if (error) {
           if (error.code === '23505') throw new Error(`Section "${formData.name}" is already registered for ${formData.schoolYear} (${formData.semester} Sem).`);
           throw error;
        }

        await logActivity(
          'Section Creation',
          `Pre-loaded new section "${formData.name}" for ${formData.schoolYear} (${formData.semester} Semester).`,
          resolveActorName(profile, user)
        );
      }

      setSuccessModalMessage(isEditMode ? "Section details updated successfully!" : "Section pre-loaded successfully!");
      setIsSuccessModalOpen(true);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
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
            {/* Owner College */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Owner College <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.departmentId}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Select College...</option>
                {allDepartments.map((dept) => (
                  <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Academic Program */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Academic Program <span className="text-rose-500">*</span></label>
              <select
                required
                disabled={!formData.departmentId}
                value={formData.programName}
                onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select Program...</option>
                {filteredPrograms.map((prog) => (
                  <option key={prog.program_id} value={prog.name}>{prog.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Year Level */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Year Level <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.yearLevel}
                onChange={(e) => setFormData({ ...formData, yearLevel: e.target.value })}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
            </div>

            {/* Section Suffix */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Section Suffix <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer font-mono"
              >
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((lettr) => (
                  <option key={lettr} value={lettr}>{lettr}</option>
                ))}
              </select>
            </div>

            {/* Generated Section Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Generated Section Name</label>
              <input 
                type="text" 
                disabled
                value={formData.name || 'Select details...'}
                className="block w-full px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm cursor-not-allowed font-mono font-bold"
              />
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
              disabled={loading}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {loading ? "Saving..." : (isEditMode ? "Save Section Details" : "Pre-load Section")}
            </button>
          </div>
        </form>

      </div>

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => {
          setIsSuccessModalOpen(false);
          navigate('/admin/sectionlist');
        }}
      />
    </>
  );
}

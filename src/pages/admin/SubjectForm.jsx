import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SuccessModal from '../../components/SuccessModal';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

const PROGRAM_SUBJECT_PREFIXES = {
  "Bachelor of Science in Accountancy": "ACT",
  "Bachelor of Science in Accounting Information System": "AIS",
  "Bachelor of Arts in Political Science": "POL",
  "Bachelor of Science in Business Administration": "MGT",
  "Bachelor of Science in Business Administration Major in Human Resource Development Management": "HRM",
  "Bachelor of Science in Business Administration Major in Financial Management": "FIN",
  "Bachelor of Science in Business Administration Major in Operations Management": "OPS",
  "Bachelor of Science in Business Administration Major in Marketing Management": "MKT",
  "Bachelor of Science in Computer Science": "CS",
  "Bachelor of Science in Computer Engineering": "CPE",
  "Bachelor of Science in Information Technology": "IT",
  "Associate in Computer Technology": "ACT",
  "Bachelor of Elementary Education": "EED",
  "Bachelor of Secondary Education Major in Mathematics": "SED-M",
  "Bachelor of Secondary Education Major in Filipino": "SED-F",
  "Bachelor of Secondary Education Major in English": "SED-E",
  "Bachelor of Secondary Education Major in Sciences": "SED-S",
  "Continuing Professional Teacher Education": "CPT",
  "Bachelor of Science in Nursing": "NUR",
  "Bachelor of Science in Midwifery": "MID",
  "Bachelor of Science in Hospitality Management": "HM",
  "Bachelor of Science in Tourism Management": "TM",
  "Bachelor of Science in Marine Transportation": "MT",
  "Bachelor of Science in Marine Engineering": "MarE",
  "Bachelor of Science in Mechanical Engineering": "ME",
  "Bachelor of Arts in Psychology": "PSY"
};

export default function SubjectForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const subjectId = params.get('id');

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    units: 3,
    departmentId: '',
    programName: '',
    yearLevel: '1st Year',
    semester: '1st Semester',
    subjectPrefix: '',
    computationId: ''
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allDepartments, setAllDepartments] = useState([]);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');
  const [allPrograms, setAllPrograms] = useState([]);
  const [allComputations, setAllComputations] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: depts } = await supabase.from('departments').select('*').order('name');
        const { data: progs } = await supabase.from('programs').select('*').order('name');
        const { data: comps } = await supabase.from('grade_computations').select('*').order('name');
        
        if (depts) setAllDepartments(depts);
        if (progs) setAllPrograms(progs);
        if (comps) setAllComputations(comps);

        if (!subjectId && depts && depts.length > 0) {
          setFormData(prev => ({ ...prev, departmentId: depts[0].department_id }));
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    }
    loadData();
  }, [subjectId]);

  useEffect(() => {
    if (subjectId) {
      setIsEditMode(true);
      async function loadSubject() {
        const { data } = await supabase
          .from('subjects')
          .select('*, departments(name)')
          .eq('subject_id', subjectId)
          .single();
          
        if (data) {
          const match = data.code.match(/^([A-Z-]*?)(\d)(\d)?(\d)?$/i);
          let prefix = '';
          let yearDigit = '1';
          let semesterDigit = '1';
          
          if (match) {
            prefix = match[1] || '';
            yearDigit = match[2] || '1';
            semesterDigit = match[3] || '1';
          }
          
          const matchedProgramName = Object.keys(PROGRAM_SUBJECT_PREFIXES).find(
            key => PROGRAM_SUBJECT_PREFIXES[key] === prefix.toUpperCase()
          ) || '';

          const yearLevelText = 
            yearDigit === '1' ? '1st Year' :
            yearDigit === '2' ? '2nd Year' :
            yearDigit === '3' ? '3rd Year' :
            yearDigit === '4' ? '4th Year' : '1st Year';

          const semesterText = 
            semesterDigit === '1' ? '1st Semester' :
            semesterDigit === '2' ? '2nd Semester' :
            semesterDigit === '0' ? 'Summer' : '1st Semester';

          setFormData({
            code: data.code,
            name: data.name,
            units: data.units,
            departmentId: data.department_id || '',
            programName: matchedProgramName,
            yearLevel: yearLevelText,
            semester: semesterText,
            subjectPrefix: prefix || '',
            computationId: data.computation_id || ''
          });
        } else {
          setErrorMsg('Subject not found in database.');
        }
      }
      loadSubject();
    }
  }, [subjectId]);

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

  // Update subject prefix when program changes
  useEffect(() => {
    if (formData.programName) {
      const mappedPrefix = PROGRAM_SUBJECT_PREFIXES[formData.programName] || '';
      setFormData(prev => ({ ...prev, subjectPrefix: mappedPrefix }));
    }
  }, [formData.programName]);

  // Auto-detect prefix from Descriptive Title (e.g., PATHFIT, NSTP, CWTS, ROTC, GE)
  useEffect(() => {
    const title = formData.name.trim();
    if (!title) return;

    const lowerTitle = title.toLowerCase();
    let detectedPrefix = '';

    if (lowerTitle.includes('pathfit')) {
      detectedPrefix = 'PATHFIT';
    } else if (lowerTitle.includes('nstp') || lowerTitle.includes('national service training')) {
      detectedPrefix = 'NSTP';
    } else if (lowerTitle.includes('cwts')) {
      detectedPrefix = 'CWTS';
    } else if (lowerTitle.includes('rotc')) {
      detectedPrefix = 'ROTC';
    } else if (lowerTitle.startsWith('ge ') || lowerTitle.startsWith('gec ') || lowerTitle.includes('general education')) {
      detectedPrefix = 'GE';
    }

    if (detectedPrefix) {
      setFormData(prev => ({ ...prev, subjectPrefix: detectedPrefix }));
    }
  }, [formData.name]);

  // Generate Subject Code Preview reactively
  useEffect(() => {
    const yearDigit = 
      formData.yearLevel === '1st Year' ? '1' :
      formData.yearLevel === '2nd Year' ? '2' :
      formData.yearLevel === '3rd Year' ? '3' :
      formData.yearLevel === '4th Year' ? '4' : '';
    
    const semesterDigit = 
      formData.semester === '1st Semester' ? '1' :
      formData.semester === '2nd Semester' ? '2' :
      formData.semester === 'Summer' ? '0' : '';

    const unitsDigit = formData.units ? String(formData.units) : '3';
    
    const constructedCode = formData.subjectPrefix && yearDigit && semesterDigit && unitsDigit
      ? `${formData.subjectPrefix}${yearDigit}${semesterDigit}${unitsDigit}`.toUpperCase()
      : '';
      
    setFormData(prev => ({ ...prev, code: constructedCode }));
  }, [formData.subjectPrefix, formData.yearLevel, formData.semester, formData.units]);

  const filteredPrograms = allPrograms.filter(p => p.department_id === formData.departmentId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (!formData.code.trim() || !formData.name.trim()) {
        throw new Error('Please fill in all required fields.');
      }

      if (!formData.departmentId) {
        throw new Error('Owner college not selected.');
      }

      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        units: parseInt(formData.units, 10),
        department_id: formData.departmentId,
        computation_id: formData.computationId || null
      };

      if (isEditMode) {
        const { error } = await supabase
          .from('subjects')
          .update(payload)
          .eq('subject_id', subjectId);
        
        if (error) throw error;

        await logActivity(
          'Subject Update',
          `Updated subject: ${formData.code} \u2013 "${formData.name}" (${formData.units} units).`,
          resolveActorName(profile, user)
        );
      } else {
        const { error } = await supabase
          .from('subjects')
          .insert(payload);
        
        if (error) {
           if (error.code === '23505') throw new Error(`Subject code "${formData.code}" is already registered.`);
           throw error;
        }

        await logActivity(
          'Subject Creation',
          `Pre-loaded new subject: ${formData.code} \u2013 "${formData.name}" (${formData.units} units).`,
          resolveActorName(profile, user)
        );
      }

      setSuccessModalMessage(isEditMode ? "Subject updated successfully!" : "Subject saved successfully!");
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

          {/* Group 1: College & Program (2 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Owner College */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Owner College <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.departmentId}
                onChange={(e) => setFormData({...formData, departmentId: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="">Select College</option>
                {allDepartments.map(dept => (
                  <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Academic Program */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Academic Program <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.programName}
                onChange={(e) => setFormData({...formData, programName: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                disabled={!formData.departmentId}
              >
                <option value="">Select Program</option>
                {filteredPrograms.map(prog => (
                  <option key={prog.program_id} value={prog.name}>{prog.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Grading System Template */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Grading System Template</label>
            <select
              value={formData.computationId}
              onChange={(e) => setFormData({...formData, computationId: e.target.value})}
              className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
            >
              <option value="">No Template (Professor Defaults Standard)</option>
              {allComputations.map(comp => (
                <option key={comp.computation_id} value={comp.computation_id}>{comp.name}</option>
              ))}
            </select>
          </div>

          {/* Group 2: Prefix, Year Level, Semester, Code (4 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Subject Prefix */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Subject Prefix <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.subjectPrefix}
                onChange={(e) => setFormData({...formData, subjectPrefix: e.target.value.toUpperCase()})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. IT"
              />
            </div>

            {/* Year Level */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Year Level <span className="text-rose-500">*</span></label>
              <select
                value={formData.yearLevel}
                onChange={(e) => setFormData({...formData, yearLevel: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
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
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>

            {/* Generated Subject Code */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Generated Code</label>
              <input 
                type="text" 
                readOnly
                value={formData.code}
                className="block w-full px-3.5 py-2 border border-slate-100 bg-slate-50 text-slate-500 font-bold font-mono rounded-lg text-sm outline-none cursor-not-allowed"
                placeholder="Auto-generated"
              />
            </div>
          </div>

          {/* Group 3: Title & Units (2 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Descriptive Title */}
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

            {/* Units */}
            <div className="flex flex-col gap-1.5 md:col-span-1">
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
              disabled={loading}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {loading ? "Saving..." : (isEditMode ? "Save Subject Details" : "Pre-load Subject")}
            </button>
          </div>
        </form>

      </div>

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => navigate('/admin/subjectlist')}
      />
    </>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  GraduationCap, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  Building2,
  Calendar,
  Filter,
  Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { provisionBatchClassroomsByFaculty } from '../../lib/classRoomService';

/**
 * Dynamically resolves program abbreviation from program object or name fetched from SQL database
 */
function getProgramAbbreviation(program) {
  if (!program) return '';
  if (typeof program === 'object' && program.abbreviation) return program.abbreviation;
  
  const programName = typeof program === 'string' ? program : (program.name || '');
  if (!programName) return '';

  // Specific multi-word major overrides
  if (programName.includes('Psychology')) return 'BAPSYCH';
  if (programName.includes('Computer Engineering')) return 'BSCpE';
  if (programName.includes('Human Resource')) return 'BSBA-HRDM';
  if (programName.includes('Financial Management')) return 'BSBA-FM';
  if (programName.includes('Operations Management')) return 'BSBA-OM';
  if (programName.includes('Marketing Management')) return 'BSBA-MM';
  if (programName.includes('Accounting Information')) return 'BSAIS';

  // Dynamic initial extraction (skipping stop words)
  const stopWords = new Set(['of', 'in', 'and', 'for', 'major', 'the']);
  return programName
    .split(/\s+/)
    .filter(w => !stopWords.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .join('');
}

export default function FacultyCreateClassroomModal({ isOpen, onClose, onSuccess }) {
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [academicTerms, setAcademicTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);

  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [semester, setSemester] = useState('1st Semester');

  // Program & Year Level Filters
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState('');

  // Multi-Row Teaching Load Entries
  const [entries, setEntries] = useState([
    { id: 1, subjectId: '', sectionId: '' }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadCatalogs = async () => {
      setLoading(true);
      setModalError(null);
      try {
        const [
          { data: deptsData },
          { data: termsData },
          { data: subjectsData },
          { data: sectionsData },
          { data: progsData }
        ] = await Promise.all([
          supabase.from('departments').select('*').order('name'),
          supabase.from('academic_terms').select('*').order('created_at', { ascending: false }),
          supabase.from('subjects').select('subject_id, code, name, units, department_id').order('code'),
          supabase.from('sections').select('section_id, name, department_id, school_year, semester').order('name'),
          supabase.from('programs').select('*').order('name')
        ]);

        setDepartments(deptsData || []);
        setAcademicTerms(termsData || []);
        setSubjects(subjectsData || []);
        setSections(sectionsData || []);
        setPrograms(progsData || []);

        const active = (termsData || []).find(t => t.is_active) || (termsData || [])[0];
        if (active) {
          setActiveTerm(active);
          setSchoolYear(active.school_year);
          setSemester(active.semester);
        }

        // Initialize first row
        const userDeptId = profile?.department_id;
        const availableSubs = userDeptId 
          ? (subjectsData || []).filter(s => s.department_id === userDeptId || !s.department_id)
          : (subjectsData || []);
        
        const availableSecs = userDeptId
          ? (sectionsData || []).filter(sec => sec.department_id === userDeptId)
          : (sectionsData || []);

        const initialSub = availableSubs[0]?.subject_id || (subjectsData || [])[0]?.subject_id || '';
        const initialSec = availableSecs[0]?.section_id || (sectionsData || [])[0]?.section_id || '';

        setEntries([{ id: Date.now(), subjectId: initialSub, sectionId: initialSec }]);
      } catch (err) {
        console.error('Error loading reference catalogs for classroom creation:', err);
        setModalError('Failed to load curriculum catalogs.');
      } finally {
        setLoading(false);
      }
    };

    loadCatalogs();
  }, [isOpen, profile]);

  // Identify Faculty's Home Department Name
  const facultyDeptName = useMemo(() => {
    if (!profile?.department_id) return 'General Academic';
    const dept = departments.find(d => d.department_id === profile.department_id);
    return dept ? dept.name : 'College Department';
  }, [profile, departments]);

  // Derived programs for faculty home department
  const deptPrograms = useMemo(() => {
    if (!profile?.department_id) return programs;
    const filtered = programs.filter(p => p.department_id === profile.department_id);
    return filtered.length > 0 ? filtered : programs;
  }, [programs, profile]);

  // Resolve active program abbreviation (e.g. "Bachelor of Science in Computer Science" -> "BSCS")
  const activeProgramAbbr = useMemo(() => {
    if (!selectedProgramFilter) return '';
    return getProgramAbbreviation(selectedProgramFilter) || selectedProgramFilter;
  }, [selectedProgramFilter]);

  // Filter sections based on department, program abbreviation, and year level
  const filteredSections = useMemo(() => {
    let list = sections;

    // 1. Department Scope
    if (profile?.department_id) {
      const deptSecs = list.filter(sec => sec.department_id === profile.department_id);
      if (deptSecs.length > 0) list = deptSecs;
    }

    // 2. Program Abbreviation Filter (e.g. "ACT", "BSCS", "BSIT", "BSME")
    if (activeProgramAbbr) {
      const abbrUpper = activeProgramAbbr.toUpperCase();
      const matches = list.filter(sec => {
        const secUpper = sec.name.toUpperCase();
        return secUpper.startsWith(abbrUpper) || secUpper.includes(abbrUpper);
      });
      if (matches.length > 0) list = matches;
    }

    // 3. Year Level Filter (e.g. "1", "2", "3", "4")
    if (selectedYearFilter) {
      const yr = selectedYearFilter;
      const matches = list.filter(sec => {
        const n = sec.name;
        return (
          n.includes(`-${yr}`) || 
          n.includes(` ${yr}-`) || 
          n.includes(` ${yr}`) || 
          n.includes(`${yr}A`) || 
          n.includes(`${yr}B`) || 
          n.includes(`${yr}C`)
        );
      });
      if (matches.length > 0) list = matches;
    }

    return list;
  }, [sections, profile, activeProgramAbbr, selectedYearFilter]);

  // Filter subjects based on department, program, and year level filters
  const filteredSubjects = useMemo(() => {
    let list = subjects;

    // 1. Department Scope (Faculty home dept + General Education service subjects)
    if (profile?.department_id) {
      const deptSubs = list.filter(s => s.department_id === profile.department_id);
      const geDept = departments.find(d => 
        d.name.toLowerCase().includes('general education') || 
        d.name.toLowerCase().includes('gen ed')
      );
      const geDeptId = geDept?.department_id;

      const geSubs = list.filter(s => 
        (geDeptId && s.department_id === geDeptId) || 
        s.code.toUpperCase().startsWith('GE')
      );

      list = deptSubs.length > 0 ? [...deptSubs, ...geSubs] : list;
    }

    // 2. Program-specific Course Filtering
    if (activeProgramAbbr) {
      const abbrUpper = activeProgramAbbr.toUpperCase();
      
      // Special program-specific course code rules
      const matches = list.filter(s => {
        const codeUpper = s.code.toUpperCase();
        const nameUpper = (s.name || '').toUpperCase();

        // Always keep General Education (GE) subjects available
        if (codeUpper.startsWith('GE')) return true;

        if (abbrUpper === 'BSME') {
          // Mechanical Engineering specific
          return codeUpper.startsWith('ME') || codeUpper.startsWith('THE') || codeUpper.startsWith('MACH') || codeUpper.startsWith('PHY') || codeUpper.startsWith('CAL');
        } else if (abbrUpper === 'BSCS' || abbrUpper === 'BSIT' || abbrUpper === 'ACT' || abbrUpper === 'BSCP E') {
          // Computing & Engineering specific
          return (
            codeUpper.startsWith('CS') || 
            codeUpper.startsWith('IT') || 
            codeUpper.startsWith('ITC') || 
            codeUpper.startsWith('ITP') || 
            codeUpper.startsWith('WEB') || 
            codeUpper.startsWith('CAL') || 
            codeUpper.startsWith('DMS') || 
            codeUpper.startsWith('DSA') || 
            codeUpper.startsWith('DBMS') || 
            codeUpper.startsWith('SOE') || 
            codeUpper.startsWith('CPR') || 
            codeUpper.startsWith('SAD') || 
            codeUpper.startsWith('IAS') || 
            codeUpper.startsWith('PRO') || 
            codeUpper.startsWith('FRE') || 
            codeUpper.startsWith('OOP') || 
            codeUpper.startsWith('NAC')
          );
        }

        return codeUpper.includes(abbrUpper) || nameUpper.includes(abbrUpper);
      });

      if (matches.length > 0) list = matches;
    }

    // 3. Year Level Course Filter (e.g. 100-level for Year 1, 200-level for Year 2)
    if (selectedYearFilter) {
      const yrMatches = list.filter(s => {
        const codeDigits = s.code.replace(/[^0-9]/g, '');
        if (codeDigits.length > 0) {
          return codeDigits.startsWith(selectedYearFilter);
        }
        return true;
      });
      if (yrMatches.length > 0) list = yrMatches;
    }

    return list;
  }, [subjects, departments, profile, activeProgramAbbr, selectedYearFilter]);

  // Sync entries if selected option is out of bounds after filter change
  useEffect(() => {
    if (filteredSubjects.length === 0 || filteredSections.length === 0) return;

    setEntries(prev => prev.map(entry => {
      const validSub = filteredSubjects.some(s => s.subject_id === entry.subjectId);
      const validSec = filteredSections.some(sec => sec.section_id === entry.sectionId);

      return {
        ...entry,
        subjectId: validSub ? entry.subjectId : (filteredSubjects[0]?.subject_id || ''),
        sectionId: validSec ? entry.sectionId : (filteredSections[0]?.section_id || '')
      };
    }));
  }, [filteredSubjects, filteredSections]);

  const handleAddRow = () => {
    const defaultSub = filteredSubjects[0]?.subject_id || '';
    const defaultSec = filteredSections[0]?.section_id || '';
    setEntries(prev => [...prev, { id: Date.now(), subjectId: defaultSub, sectionId: defaultSec }]);
  };

  const handleRemoveRow = (id) => {
    if (entries.length === 1) return; // Maintain at least 1 row
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleEntryChange = (id, field, value) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    // Validate entries
    const invalidRow = entries.find(e => !e.subjectId || !e.sectionId);
    if (invalidRow) {
      setModalError('Please select both a Course/Subject and a Section for all rows.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await provisionBatchClassroomsByFaculty({
        facultyId: user.id,
        classroomEntries: entries,
        schoolYear,
        semester
      });

      // Audit log
      const actorName = resolveActorName(user, profile);
      const createdCodes = res.results.map(r => `${r.subject?.code} (${r.section?.name})`).join(', ');
      await logActivity(
        actorName,
        'Faculty Classrooms Created',
        `Created ${res.results.length} classroom(s): ${createdCodes}`
      );

      if (onSuccess) {
        onSuccess({
          count: res.results.length,
          results: res.results,
          warnings: res.errors
        });
      }

      onClose();
    } catch (err) {
      console.error('Failed to create classrooms:', err);
      setModalError(err.message || 'Failed to create classrooms.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 text-left">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sage-100 text-sage-800 flex items-center justify-center shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">Create Classrooms from Teaching Load</h3>
              <p className="text-xs text-slate-500">Set up active classrooms tied to your college department load</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
          
          {modalError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Department Scope & Active Term Banner */}
          <div className="p-3.5 bg-sage-50/80 border border-sage-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-4 w-4 text-sage-700 shrink-0" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sage-600 block">Department Scope</span>
                <span className="text-xs font-bold text-sage-900">{facultyDeptName}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-sage-200 rounded-lg text-[11px] font-mono font-medium text-sage-800">
              <Calendar className="h-3.5 w-3.5 text-sage-600" />
              <span>AY {schoolYear} • {semester}</span>
            </div>
          </div>

          {/* Program & Year Level Quick Filter Controls */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-sage-600" />
                <span>Filter Teaching Load Catalog</span>
              </div>
              {(selectedProgramFilter || selectedYearFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProgramFilter('');
                    setSelectedYearFilter('');
                  }}
                  className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className={deptPrograms.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5" : "block"}>
              {/* Program Filter (Only rendered if department offers multiple programs) */}
              {deptPrograms.length > 1 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-600">Filter by Program</label>
                  <select
                    value={selectedProgramFilter}
                    onChange={e => setSelectedProgramFilter(e.target.value)}
                    className="w-full border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium cursor-pointer"
                  >
                    <option value="">All Programs ({deptPrograms.length})</option>
                    {deptPrograms.map(p => {
                      const abbr = getProgramAbbreviation(p);
                      return (
                        <option key={p.program_id} value={p.name}>
                          {abbr ? `[${abbr}] ${p.name}` : p.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Year Level Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-600">Filter by Year Level</label>
                <select
                  value={selectedYearFilter}
                  onChange={e => setSelectedYearFilter(e.target.value)}
                  className="w-full border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium cursor-pointer"
                >
                  <option value="">All Year Levels</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>
            </div>
          </div>

          {/* Multi-Row Class Load Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Teaching Load Assignments ({entries.length})
              </label>
              <span className="text-[11px] text-slate-400">Match your printed load sheet</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-sage-600" />
                <span>Loading curriculum catalogs…</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {entries.map((entry, index) => (
                  <div key={entry.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center gap-2.5 relative group">
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>

                    {/* Subject Selector */}
                    <div className="flex-1 w-full sm:w-auto">
                      <select
                        value={entry.subjectId}
                        onChange={e => handleEntryChange(entry.id, 'subjectId', e.target.value)}
                        className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium"
                      >
                        <option value="" disabled>Select Subject Code &amp; Title</option>
                        {filteredSubjects.map(s => (
                          <option key={s.subject_id} value={s.subject_id}>
                            {s.code} — {s.name} ({s.units} units)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Section Selector */}
                    <div className="w-full sm:w-48 shrink-0">
                      <select
                        value={entry.sectionId}
                        onChange={e => handleEntryChange(entry.id, 'sectionId', e.target.value)}
                        className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium font-mono"
                      >
                        <option value="" disabled>Select Block Section</option>
                        {filteredSections.map(sec => (
                          <option key={sec.section_id} value={sec.section_id}>
                            {sec.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Remove Row Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(entry.id)}
                      disabled={entries.length === 1}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      title="Remove classroom assignment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Add Another Class Button */}
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2.5 border border-dashed border-sage-300 hover:border-sage-500 bg-sage-50/50 hover:bg-sage-50 text-sage-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-sage-600" />
                  <span>+ Add Another Class Assignment</span>
                </button>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="px-5 py-2 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Classrooms…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Create All Classrooms ({entries.length})</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

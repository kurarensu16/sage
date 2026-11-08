import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, Edit2, Trash2, BookOpen, Upload, X, Check, FileSpreadsheet, AlertCircle, CheckCircle, SlidersHorizontal, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyAdminActivity } from '../../lib/notificationDispatcher';

export default function SubjectList() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [filterYearLevel, setFilterYearLevel] = useState('');
  const [filterUnits, setFilterUnits] = useState('');

  // Batch CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedSubjects, setParsedSubjects] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Reference data the import resolves College and GradingTemplate names
  // against -- loaded once, the same way SectionList resolves College names.
  const [allDepartments, setAllDepartments] = useState([]);
  const [allComputations, setAllComputations] = useState([]);

  // Built from live reference data rather than written here, so the sample
  // can never name a college or grading template that does not exist in
  // this institution -- loading it and importing it unedited must succeed.
  const sampleRows = useMemo(() => {
    const dept = allDepartments[0];
    const comp = allComputations[0];
    if (!dept || !comp) return [];
    return [
      { Code: 'SAMPLE101', Name: 'Sample Subject Title', Units: 3, College: dept.name, GradingTemplate: comp.name }
    ];
  }, [allDepartments, allComputations]);

  const sampleCSV = useMemo(
    () => sampleRows.map(r => `${r.Code},${r.Name},${r.Units},${r.College},${r.GradingTemplate}`).join('\n'),
    [sampleRows]
  );

  const [loading, setLoading] = useState(true);

  const loadSubjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subjects')
        .select('*, departments(name)')
        .order('code', { ascending: true });
        
      if (error) throw error;
      
      const mappedSubjects = data.map(sub => {
        // Derive year level from subject code digit (e.g. IT113 -> '1' -> '1st Year')
        const codeDigit = (sub.code || '').match(/([1-4])/)?.[1] || '';
        const yearLevelMap = { '1': '1st Year', '2': '2nd Year', '3': '3rd Year', '4': '4th Year' };
        return {
          id: sub.subject_id,
          code: sub.code,
          name: sub.name,
          units: sub.units,
          department: sub.departments?.name || '',
          yearLevel: yearLevelMap[codeDigit] || ''
        };
      });
      setSubjects(mappedSubjects);

      const [deptRes, compRes] = await Promise.all([
        supabase.from('departments').select('department_id, name').order('name'),
        supabase.from('grade_computations').select('computation_id, name').order('name')
      ]);
      setAllDepartments(deptRes.data || []);
      setAllComputations(compRes.data || []);
    } catch (err) {
      console.error('Failed to load subjects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  // A subject that is already in use is never deleted: deleting it would remove its
  // classes, grades, and enrollments.
  const handleDeleteSubject = async (id, code, name) => {
    let classes;
    let enrollments;
    try {
      const [classResult, enrollmentResult] = await Promise.all([
        supabase.from('class_records').select('*', { count: 'exact', head: true }).eq('subject_id', id),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('subject_id', id)
      ]);
      if (classResult.error) throw classResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;
      classes = classResult.count || 0;
      enrollments = enrollmentResult.count || 0;
    } catch (err) {
      alert('Could not check whether this subject is in use: ' + err.message);
      return;
    }

    if (classes || enrollments) {
      const reasons = [];
      if (classes) reasons.push(`${classes} class${classes === 1 ? '' : 'es'}`);
      if (enrollments) reasons.push(`${enrollments} class enrollment${enrollments === 1 ? '' : 's'}`);
      alert(`Subject "${code} - ${name}" cannot be deleted because it is in use: ${reasons.join(', ')}. Keep the subject, or remove its classes first.`);
      return;
    }

    if (confirm(`Delete subject "${code} - ${name}"? It has no classes or enrollments.`)) {
      const { error } = await supabase.from('subjects').delete().eq('subject_id', id);
      if (error) {
        alert('Failed to delete subject: ' + error.message);
      } else {
        loadSubjects();
      }
    }
  };

  // Unique filter options derived from loaded data
  const uniqueColleges = [...new Set(subjects.map(s => s.department).filter(Boolean))].sort();
  const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const uniqueUnits = [...new Set(subjects.map(s => s.units).filter(Boolean))].sort((a, b) => a - b);

  const activeFilterCount = [deptFilter, filterYearLevel, filterUnits].filter(Boolean).length;

  const clearFilters = () => {
    setDeptFilter('');
    setFilterYearLevel('');
    setFilterUnits('');
  };

  const filteredSubjects = subjects.filter(sub => {
    const matchesSearch =
      sub.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.name?.toLowerCase().includes(searchTerm.toLowerCase());

    // Normalise department comparison for legacy data
    let subDept = sub.department;
    // Legacy aliases removed: they mapped to a college that no longer exists.
    let filterDept = deptFilter;


    const matchesDept     = !filterDept      || subDept       === filterDept;
    const matchesYearLvl  = !filterYearLevel || sub.yearLevel === filterYearLevel;
    const matchesUnits    = !filterUnits     || String(sub.units) === filterUnits;

    return matchesSearch && matchesDept && matchesYearLvl && matchesUnits;
  });

  const handleFileUpload = (file) => {
    setImportError('');
    setImportSuccess('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        setCsvText(csv);
        handleParseCSV(csv);
      } catch {
        setImportError('Failed to parse file. Please verify it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // CSV Parsing
  const handleLoadSample = () => {
    setCsvText(sampleCSV);
    handleParseCSV(sampleCSV);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(sampleRows, {
      header: ['Code', 'Name', 'Units', 'College', 'GradingTemplate']
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects');
    XLSX.writeFile(wb, 'ASPIRE_Subjects_Import_Template.xlsx');
  };

  const handleParseCSV = (textToParse = csvText) => {
    setImportError('');
    setImportSuccess('');

    if (!textToParse.trim()) {
      setParsedSubjects([]);
      return;
    }

    const lines = textToParse.split('\n');
    const list = [];
    const existingCodes = subjects.map(s => s.code.toLowerCase());
    let hasError = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip CSV header row if present
      if (i === 0 && (line.toLowerCase().includes('code') || line.toLowerCase().includes('units'))) {
        continue;
      }

      const parts = line.split(',');
      if (parts.length < 5) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: Code,Name,Units,Department,GradingTemplate`);
        hasError = true;
        break;
      }

      let [code, name, units, department, gradingTemplate] = parts.map(p => p.trim());

      if (existingCodes.includes(code.toLowerCase())) {
        setImportError(`Row ${i + 1}: Subject Code "${code}" already exists in the database.`);
        hasError = true;
        break;
      }

      const parsedUnits = parseInt(units);
      if (isNaN(parsedUnits) || parsedUnits <= 0) {
        setImportError(`Row ${i + 1}: Units value "${units}" must be a valid positive number.`);
        hasError = true;
        break;
      }

      // Every subject needs a grading template -- the database column is
      // NOT NULL (20261001090000_unify_academic_policy_templates.sql) -- so
      // this is caught here rather than surfacing as a database error later.
      if (!gradingTemplate) {
        setImportError(`Row ${i + 1}: GradingTemplate is required.`);
        hasError = true;
        break;
      }

      list.push({
        code: code.toUpperCase(),
        name,
        units: parsedUnits,
        department,
        gradingTemplate
      });
    }

    if (!hasError) {
      setParsedSubjects(list);
      setImportSuccess(`Successfully parsed ${list.length} subject records.`);
    } else {
      setParsedSubjects([]);
    }
  };

  // Write the parsed rows.
  //
  // Until 2026-11-08 this function parsed, validated, rendered a preview
  // saying "Successfully parsed N subject records" -- and then alerted "will
  // be enabled in a future update" and wrote nothing. Every check above it
  // was real; only the write was missing (the same bug SectionList's import
  // had until 2026-11-03).
  //
  // Same two rules as that fix:
  //
  //   * ALL OR NOTHING. A single insert() is one statement, so Postgres
  //     either takes every row or none. Importing nine of ten and reporting
  //     success is the failure shape behind B-02, B-10 and B-14.
  //   * EVERY NAME MUST RESOLVE. The CSV names a college and a grading
  //     template in words; the table stores department_id and
  //     computation_id (NOT NULL). An unmatched name stops the whole file
  //     rather than inserting a null or guessing.
  const handleSaveImport = async () => {
    if (parsedSubjects.length === 0) return;
    setImportError('');
    setImportSuccess('');

    const deptIdByName = new Map(
      allDepartments.map(d => [String(d.name).trim().toLowerCase(), d.department_id])
    );
    const compIdByName = new Map(
      allComputations.map(c => [String(c.name).trim().toLowerCase(), c.computation_id])
    );

    const unresolvedDepts = [];
    const unresolvedTemplates = [];
    const rows = parsedSubjects.map((s, index) => {
      const departmentId = deptIdByName.get(String(s.department || '').trim().toLowerCase());
      const computationId = compIdByName.get(String(s.gradingTemplate || '').trim().toLowerCase());
      if (!departmentId) unresolvedDepts.push(`row ${index + 1} ("${s.department || 'blank'}")`);
      if (!computationId) unresolvedTemplates.push(`row ${index + 1} ("${s.gradingTemplate || 'blank'}")`);
      return {
        code: s.code,
        name: s.name,
        units: s.units,
        department_id: departmentId || null,
        computation_id: computationId || null
      };
    });

    if (unresolvedDepts.length > 0) {
      setImportError(
        `Nothing was imported. These colleges are not in the database: ${unresolvedDepts.join(', ')}. ` +
        `Use the exact college name shown in Academic Setup: ${allDepartments.map(d => d.name).join(', ')}.`
      );
      return;
    }
    if (unresolvedTemplates.length > 0) {
      setImportError(
        `Nothing was imported. These grading templates are not in the database: ${unresolvedTemplates.join(', ')}. ` +
        `Use the exact template name: ${allComputations.map(c => c.name).join(', ')}.`
      );
      return;
    }

    setIsImporting(true);
    try {
      const { error } = await supabase.from('subjects').insert(rows);
      if (error) {
        if (error.code === '23505') {
          throw new Error('One of these subject codes, or a name already used in that college, is already registered. Nothing was imported.');
        }
        throw error;
      }

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Subject Creation',
        `Batch imported ${rows.length} subject(s) via CSV.`,
        actorName
      );
      await notifyAdminActivity({
        type: 'system',
        message: `Subjects Database: ${rows.length} subject(s) were batch imported by ${actorName}.`,
        actorName
      });

      setImportSuccess(`${rows.length} subject(s) imported.`);
      setCsvText('');
      setParsedSubjects([]);
      loadSubjects();
      setTimeout(() => setIsImportOpen(false), 1200);
    } catch (err) {
      setImportError(err.message || 'The import could not be saved.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <PageHeader title="Subjects Database" breadcrumb="Registrar Portal">
        <div className="flex gap-2">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 hover:border-sage-350 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <Link 
            to="/registrar/subjectform" 
            className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Pre-load Subject
          </Link>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 flex gap-3">
          <BookOpen className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 font-display">Subjects Pre-loading Flow</h4>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
              Define the master list of academic subjects/courses for the school year. Faculty will select from this pre-loaded database when initiating new class records.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
            placeholder="Search by code or name..."
          />
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:px-4 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5 text-sage-600" />
            Filter by
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sage-600 text-white text-micro font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* College Filter */}
          <div className="flex flex-col gap-0.5 min-w-[130px] flex-1 sm:flex-none">
            <span className="text-micro font-bold text-slate-400 uppercase tracking-wider">College</span>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer w-full"
            >
              <option value="">All Colleges</option>
              {uniqueColleges.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Year Level Filter */}
          <div className="flex flex-col gap-0.5 min-w-[100px] flex-1 sm:flex-none">
            <span className="text-micro font-bold text-slate-400 uppercase tracking-wider">Year Level</span>
            <select
              value={filterYearLevel}
              onChange={(e) => setFilterYearLevel(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer w-full"
            >
              <option value="">All Years</option>
              {yearLevels.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Units Filter */}
          <div className="flex flex-col gap-0.5 min-w-[90px] flex-1 sm:flex-none">
            <span className="text-micro font-bold text-slate-400 uppercase tracking-wider">Units</span>
            <select
              value={filterUnits}
              onChange={(e) => setFilterUnits(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer w-full"
            >
              <option value="">All Units</option>
              {uniqueUnits.map(u => (
                <option key={u} value={String(u)}>{u} Unit{u !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          {/* Clear + result count */}
          <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            <span className="text-xs text-slate-400 font-mono">
              {filteredSubjects.length} / {subjects.length} shown
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium">Loading subjects catalog...</p>
          </div>
        ) : (
          <>
            {/* ── Mobile Card List View (md:hidden) ── */}
            <div className="md:hidden space-y-3">
          {filteredSubjects.length > 0 ? (
            filteredSubjects.map((sub) => (
              <div 
                key={sub.id} 
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-sage-50 text-sage-800 border border-sage-200">
                        {sub.code}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {sub.units} Units
                      </span>
                      {sub.yearLevel && (
                        <span className="text-[10px] font-semibold text-sage-600">
                          {sub.yearLevel}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold font-display text-slate-900 leading-snug">
                      {sub.name}
                    </h3>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 truncate">
                    {sub.department}
                  </span>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button 
                      onClick={() => navigate(`/registrar/subjectform?id=${sub.id}`)}
                      title="Edit Subject"
                      className="p-2 text-slate-600 hover:text-sage-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>

                    <button 
                      onClick={() => handleDeleteSubject(sub.id, sub.code, sub.name)}
                      title="Delete Subject"
                      className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center text-slate-400 text-xs">
              No subjects registered. Click "Pre-load Subject" or "Import CSV" to create one.
            </div>
          )}
        </div>

        {/* ── Desktop Subjects Table (hidden md:block) ── */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Subject Code</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Units</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">College</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 font-sans">
                {filteredSubjects.length > 0 ? (
                  filteredSubjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-slate-800">
                        {sub.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        {sub.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                        {sub.units} Units
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {sub.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/registrar/subjectform?id=${sub.id}`)}
                            title="Edit Subject"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteSubject(sub.id, sub.code, sub.name)}
                            title="Delete Subject"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md border border-rose-100 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No subjects registered. Click "Pre-load Subject" or "Import CSV" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 max-w-2xl w-full shadow-2xl flex flex-col overflow-hidden max-h-[88vh] sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            
            {/* Mobile grab handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.25 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" /> Batch Import Subjects (CSV)
              </h3>
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setCsvText('');
                  setParsedSubjects([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {importError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600" /> {importError}
                </div>
              )}

              {importSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> {importSuccess}
                </div>
              )}

            <div className="flex flex-col gap-4">
              
              {/* Drag and Drop Upload Zone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
                className="border-2 border-dashed border-slate-200 hover:border-sage-400 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-sage-50/20 transition-all flex flex-col items-center justify-center gap-2 group relative"
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-slate-400 group-hover:text-sage-600 transition-colors" />
                <div className="text-xs font-bold text-slate-700 group-hover:text-sage-700">Drag & drop your Excel (.xlsx) or CSV (.csv) file here</div>
                <div className="text-[10px] text-slate-400">Or click to select a file from your computer</div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Or Paste Raw Data (Format: <code className="font-mono text-sage-700 bg-sage-50 px-1 py-0.5 rounded border border-sage-200">Code,Name,Units,College,GradingTemplate</code>)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={downloadTemplate}
                      disabled={sampleRows.length === 0}
                      className="px-2.5 py-1 text-[11px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 rounded disabled:opacity-50"
                    >
                      Download Template
                    </button>
                    <button
                      onClick={handleLoadSample}
                      disabled={sampleRows.length === 0}
                      className="px-2.5 py-1 text-[11px] font-bold border border-sage-200 text-sage-700 hover:bg-sage-50 rounded disabled:opacity-50"
                    >
                      Load Sample Template
                    </button>
                  </div>
                </div>

                <textarea
                  value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setParsedSubjects([]);
                }}
                onBlur={() => handleParseCSV()}
                rows="6"
                placeholder="ACC101,Fundamentals of Accounting,3,College of Accountancy,General Education Core"
                className="block w-full p-3 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
              />

              <div className="text-right">
                <button
                  onClick={() => handleParseCSV()}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all"
                >
                  Validate & Parse CSV
                </button>
              </div>

              {parsedSubjects.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-650 uppercase border-b border-slate-200 font-display">
                    Parsed Subjects Preview ({parsedSubjects.length} Records)
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 font-bold text-slate-500">Code</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Name</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Units</th>
                          <th className="px-4 py-2 font-bold text-slate-500">College</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Grading Template</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {parsedSubjects.map((s, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 font-mono font-bold text-slate-800">{s.code}</td>
                            <td className="px-4 py-2 font-semibold text-slate-750">{s.name}</td>
                            <td className="px-4 py-2 font-mono text-slate-600">{s.units} Units</td>
                            <td className="px-4 py-2 text-slate-600">{s.department}</td>
                            <td className="px-4 py-2 text-slate-600">{s.gradingTemplate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setCsvText('');
                  setParsedSubjects([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                disabled={isImporting}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveImport}
                disabled={parsedSubjects.length === 0 || isImporting}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isImporting ? 'Saving…' : 'Save Imported Subjects'}
              </button>
            </div>
          </div>

        </div>
      </div>
      )}
    </>
  );
}

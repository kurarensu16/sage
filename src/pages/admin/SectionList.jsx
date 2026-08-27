import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, Edit2, Trash2, Layers, Upload, X, Check, FileSpreadsheet, AlertCircle, CheckCircle, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

const PROGRAM_NAMES = {
  "BSA": "Bachelor of Science in Accountancy",
  "BSAIS": "Bachelor of Science in Accounting Information System",
  "BAPS": "Bachelor of Arts in Political Science",
  "BSBA": "Bachelor of Science in Business Administration",
  "BSBA-HRDM": "Bachelor of Science in Business Administration Major in Human Resource Development Management",
  "BSBA-FM": "Bachelor of Science in Business Administration Major in Financial Management",
  "BSBA-OM": "Bachelor of Science in Business Administration Major in Operations Management",
  "BSBA-MM": "Bachelor of Science in Business Administration Major in Marketing Management",
  "BSCS": "Bachelor of Science in Computer Science",
  "BSCPE": "Bachelor of Science in Computer Engineering",
  "BSIT": "Bachelor of Science in Information Technology",
  "ACT": "Associate in Computer Technology",
  "BEED": "Bachelor of Elementary Education",
  "BSED-MATH": "Bachelor of Secondary Education Major in Mathematics",
  "BSED-FIL": "Bachelor of Secondary Education Major in Filipino",
  "BSED-ENG": "Bachelor of Secondary Education Major in English",
  "BSED-SCI": "Bachelor of Secondary Education Major in Sciences",
  "CPTE": "Continuing Professional Teacher Education",
  "BSN": "Bachelor of Science in Nursing",
  "BSM": "Bachelor of Science in Midwifery",
  "BSHM": "Bachelor of Science in Hospitality Management",
  "BSTM": "Bachelor of Science in Tourism Management",
  "BSMT": "Bachelor of Science in Marine Transportation",
  "BSMARE": "Bachelor of Science in Marine Engineering",
  "BSME": "Bachelor of Science in Mechanical Engineering",
  "BAPSYCH": "Bachelor of Arts in Psychology"
};

export default function SectionList() {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterYearLevel, setFilterYearLevel] = useState('');
  const [semFilter, setSemFilter] = useState('');

  // Batch CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedSections, setParsedSections] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = React.useRef(null);

  const sampleCSV = `BSIT-1B,2025-2026,2nd,College of Computer Studies,Bachelor of Science in Information Technology
BSIT-2A,2025-2026,2nd,College of Computer Studies,Bachelor of Science in Information Technology
BSCS-2A,2025-2026,2nd,College of Computer Studies,Bachelor of Science in Computer Science`;

  const [loading, setLoading] = useState(true);

  const loadSections = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sections')
        .select('*, departments(name)')
        .order('name', { ascending: true });
        
      if (error) throw error;
      
      const mappedSections = data.map(sec => {
        const sectionName = sec.name || '';
        const programPrefix = sectionName.match(/^([A-Z]+)/)?.[1] || '';
        const yearDigit = sectionName.match(/-(\d)/)?.[1] || sectionName.match(/(\d)/)?.[1] || '';
        const yearLevelMap = { '1': '1st Year', '2': '2nd Year', '3': '3rd Year', '4': '4th Year' };
        return {
          id: sec.section_id,
          name: sectionName,
          schoolYear: sec.school_year,
          semester: sec.semester,
          department: sec.departments?.name || '',
          program: sec.program || '',
          programPrefix,
          yearLevel: yearLevelMap[yearDigit] || ''
        };
      });
      setSections(mappedSections);
    } catch (err) {
      console.error('Failed to load sections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSections();
  }, []);

  const handleDeleteSection = async (id, name) => {
    if (confirm(`Are you sure you want to delete section "${name}"? This will affect new classroom creations.`)) {
      const { error } = await supabase.from('sections').delete().eq('section_id', id);
      if (error) {
        alert('Failed to delete section: ' + error.message);
      } else {
        loadSections();
      }
    }
  };

  // Unique filter options derived from loaded data
  const uniqueColleges = [...new Set(sections.map(s => s.department).filter(Boolean))].sort();
  const uniquePrograms = [...new Set(sections.map(s => s.programPrefix).filter(Boolean))].sort();
  const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  const activeFilterCount = [deptFilter, filterProgram, filterYearLevel, semFilter].filter(Boolean).length;

  const clearFilters = () => {
    setDeptFilter('');
    setFilterProgram('');
    setFilterYearLevel('');
    setSemFilter('');
  };

  const filteredSections = sections.filter(sec => {
    const matchesSearch = sec.name.toLowerCase().includes(searchTerm.toLowerCase());

    // Normalise department comparison for legacy data
    let secDept = sec.department;
    if (secDept === 'College of IT' || secDept === 'College of CS') secDept = 'College of Computer Studies';
    let filterDept = deptFilter;
    if (filterDept === 'College of IT' || filterDept === 'College of CS') filterDept = 'College of Computer Studies';

    const matchesDept     = !filterDept     || secDept           === filterDept;
    const matchesProgram  = !filterProgram  || sec.programPrefix === filterProgram;
    const matchesYearLvl  = !filterYearLevel || sec.yearLevel    === filterYearLevel;
    const matchesSem      = !semFilter      || sec.semester      === semFilter;

    return matchesSearch && matchesDept && matchesProgram && matchesYearLvl && matchesSem;
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
      } catch (err) {
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

  const handleParseCSV = (textToParse = csvText) => {
    setImportError('');
    setImportSuccess('');

    if (!textToParse.trim()) {
      setParsedSections([]);
      return;
    }

    const lines = textToParse.split('\n');
    const list = [];
    let hasError = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip CSV header row if present
      if (i === 0 && (line.toLowerCase().includes('semester') || line.toLowerCase().includes('schoolyear') || line.toLowerCase().includes('school_year'))) {
        continue;
      }

      const parts = line.split(',');
      if (parts.length < 4) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: Name,SchoolYear,Semester,College,Program`);
        hasError = true;
        break;
      }

      let [name, schoolYear, semester, department, program] = parts.map(p => p?.trim() || '');

      // Backwards compatibility for 4 columns
      if (parts.length === 4) {
        department = parts[3].trim();
        if (department === 'College of IT' || department === 'College of CS' || department === 'College of Computer Studies') {
          department = 'College of Computer Studies';
        }
        const prefix = name.split('-')[0].toUpperCase();
        program = PROGRAM_NAMES[prefix] || 'General Program';
      } else {
        if (department === 'College of IT' || department === 'College of CS') {
          department = 'College of Computer Studies';
        }
        const prefix = name.split('-')[0].toUpperCase();
        program = program || PROGRAM_NAMES[prefix] || 'General Program';
      }

      // Validate uniqueness in current parsed list & database
      const isDuplicateDb = sections.some(s => 
        s.name.toUpperCase() === name.toUpperCase() && 
        s.schoolYear === schoolYear && 
        s.semester === semester
      );
      const isDuplicateList = list.some(l => 
        l.name.toUpperCase() === name.toUpperCase() && 
        l.schoolYear === schoolYear && 
        l.semester === semester
      );

      if (isDuplicateDb || isDuplicateList) {
        setImportError(`Row ${i + 1}: Section "${name}" is already registered for ${schoolYear} (${semester} Sem).`);
        hasError = true;
        break;
      }

      const validSemesters = ['1st', '2nd', 'Summer'];
      if (!validSemesters.includes(semester)) {
        setImportError(`Row ${i + 1}: Invalid semester "${semester}". Valid semesters: 1st, 2nd, Summer`);
        hasError = true;
        break;
      }

      list.push({
        name: name.toUpperCase(),
        schoolYear,
        semester,
        department,
        program
      });
    }

    if (!hasError) {
      setParsedSections(list);
      setImportSuccess(`Successfully parsed ${list.length} section records.`);
    } else {
      setParsedSections([]);
    }
  };

  const handleSaveImport = async () => {
    if (parsedSections.length === 0) return;

    alert("Batch CSV import will be enabled for Supabase in a future update.");
    setIsImportOpen(false);
  };

  return (
    <>
      <PageHeader title="Sections Database" breadcrumb="Admin Portal">
        <div className="flex gap-2">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 hover:border-sage-350 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <Link 
            to="/admin/sectionform" 
            className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Pre-load Section
          </Link>
        </div>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <Layers className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 font-display">Sections Pre-loading Flow</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Define academic sections and target cohorts for the current semester. Pre-loading sections here enables the grouping of students under clear classroom records for gradings and evaluations.
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
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
            placeholder="Search by section name..."
          />
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter by
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sage-600 text-white text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* College */}
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">College</span>
            <select
              value={deptFilter}
              onChange={e => { setDeptFilter(e.target.value); setFilterProgram(''); }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Colleges</option>
              {uniqueColleges.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Program */}
          <div className="flex flex-col gap-0.5 min-w-[140px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Program</span>
            <select
              value={filterProgram}
              onChange={e => setFilterProgram(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Programs</option>
              {uniquePrograms
                .filter(p => !deptFilter || sections.some(s => s.department === deptFilter && s.programPrefix === p))
                .map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
            </select>
          </div>

          {/* Year Level */}
          <div className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year Level</span>
            <select
              value={filterYearLevel}
              onChange={e => setFilterYearLevel(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Year Levels</option>
              {yearLevels.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Semester</span>
            <select
              value={semFilter}
              onChange={e => setSemFilter(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Semesters</option>
              <option value="1st">1st Semester</option>
              <option value="2nd">2nd Semester</option>
              <option value="Summer">Summer</option>
            </select>
          </div>

          {/* Clear + result count */}
          <div className="ml-auto flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors"
              >
                <X className="h-3 w-3" /> Clear Filters
              </button>
            )}
            <span className="text-xs text-slate-400 font-mono">
              {filteredSections.length} / {sections.length} shown
            </span>
          </div>
        </div>

        {/* Sections Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Section Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">School Year</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Semester</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">College</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Program</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 font-sans">
                {filteredSections.length > 0 ? (
                  filteredSections.map((sec) => (
                    <tr key={sec.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-slate-800">
                        {sec.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        {sec.schoolYear}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                        {sec.semester} Sem
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {sec.department === 'College of IT' || sec.department === 'College of CS' ? 'College of Computer Studies' : sec.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-655 font-medium">
                        {sec.program || PROGRAM_NAMES[(sec.programPrefix || '').toUpperCase()] || 'General Program'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/admin/sectionform?id=${sec.id}`)}
                            title="Edit Section"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteSection(sec.id, sec.name)}
                            title="Delete Section"
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
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No sections registered. Click "Pre-load Section" or "Import CSV" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full shadow-lg flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-sage-600" /> Batch Import Sections (CSV)
              </h3>
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setCsvText('');
                  setParsedSections([]);
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
                    Or Paste Raw Data (Format: <code className="font-mono text-sage-700 bg-sage-50 px-1 py-0.5 rounded border border-sage-200">Name,SchoolYear,Semester,College,Program</code>)
                  </label>
                  <button
                    onClick={handleLoadSample}
                    className="px-2.5 py-1 text-[11px] font-bold border border-sage-200 text-sage-700 hover:bg-sage-50 rounded"
                  >
                    Load Sample Template
                  </button>
                </div>

                <textarea
                  value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setParsedSections([]);
                }}
                onBlur={() => handleParseCSV()}
                rows="6"
                placeholder="BSIT-1B,2025-2026,2nd,College of Computer Studies,Bachelor of Science in Information Technology"
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

              {parsedSections.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-650 uppercase border-b border-slate-200 font-display">
                    Parsed Sections Preview ({parsedSections.length} Records)
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 font-bold text-slate-500">Name</th>
                          <th className="px-4 py-2 font-bold text-slate-500">School Year</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Semester</th>
                          <th className="px-4 py-2 font-bold text-slate-500">College</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Program</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {parsedSections.map((sec, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 font-mono font-bold text-slate-800">{sec.name}</td>
                            <td className="px-4 py-2 font-semibold text-slate-750">{sec.schoolYear}</td>
                            <td className="px-4 py-2 font-mono text-slate-650">{sec.semester} Sem</td>
                            <td className="px-4 py-2 text-slate-600">{sec.department}</td>
                            <td className="px-4 py-2 text-slate-650 font-medium">{sec.program}</td>
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
                  setParsedSections([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveImport}
                disabled={parsedSections.length === 0}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Check className="h-4 w-4" /> Save Imported Sections
              </button>
            </div>
          </div>

        </div>
      </div>
      )}
    </>
  );
}

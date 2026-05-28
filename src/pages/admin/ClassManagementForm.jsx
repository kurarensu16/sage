import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Upload, X, Check, Users, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import * as XLSX from 'xlsx';

export default function ClassManagementForm() {
  const navigate = useNavigate();
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  
  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    facultyId: '',
    schoolYear: '2025-2026',
    semester: '2nd'
  });

  const [csvText, setCsvText] = useState('');
  const [parsedStudents, setParsedStudents] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [warningText, setWarningText] = useState('');
  const fileInputRef = React.useRef(null);

  // Sample CSV template pre-loaded for easy demo
  const sampleCSV = `std-101,Jenkins,Sarah,s.jenkins@student.sage.edu
std-102,Smith,John,j.smith@student.sage.edu
std-103,Johnson,Mary,m.johnson@student.sage.edu`;

  useEffect(() => {
    // Load active faculty members
    const users = mockDb.getUsers();
    setFacultyUsers(users.filter(u => u.role === 'faculty' && u.status === 'active'));

    // Load dynamic subjects and sections, sorted alphabetically
    const dbSubjects = mockDb.getSubjects().sort((a, b) => a.code.localeCompare(b.code));
    const dbSections = mockDb.getSections().sort((a, b) => a.name.localeCompare(b.name));
    setSubjects(dbSubjects);
    setSections(dbSections);
  }, []);

  useEffect(() => {
    if (formData.subject && formData.facultyId) {
      const [subCode] = formData.subject.split('|');
      const selectedSubject = subjects.find(s => s.code === subCode);
      const selectedFaculty = facultyUsers.find(f => f.id === formData.facultyId);
      
      if (selectedSubject && selectedFaculty && selectedSubject.department !== selectedFaculty.department) {
        setWarningText(`The subject ${selectedSubject.code} belongs to "${selectedSubject.department}", but Prof. ${selectedFaculty.firstName} ${selectedFaculty.lastName} belongs to "${selectedFaculty.department}".`);
        setShowWarning(true);
      } else {
        setShowWarning(false);
        setWarningText('');
      }
    } else {
      setShowWarning(false);
      setWarningText('');
    }
  }, [formData.subject, formData.facultyId, subjects, facultyUsers]);

  const handleSectionChange = (e) => {
    const selectedSecName = e.target.value;
    const secObj = sections.find(s => s.name === selectedSecName);
    if (secObj) {
      setFormData(prev => ({
        ...prev,
        section: selectedSecName,
        schoolYear: secObj.schoolYear || '2025-2026',
        semester: secObj.semester || '2nd'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        section: selectedSecName
      }));
    }
  };

  const handleLoadSample = () => {
    setCsvText(sampleCSV);
    handleParseCSV(sampleCSV);
  };

  const handleParseCSV = (textToParse = csvText) => {
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!textToParse.trim()) {
      setParsedStudents([]);
      return;
    }

    const lines = textToParse.split('\n');
    const list = [];
    let hasError = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 4) {
        setErrorMsg(`Row ${i + 1} has insufficient columns. Required format: StudentID,LastName,FirstName,Email`);
        hasError = true;
        break;
      }

      const [studentId, lastName, firstName, email] = parts.map(p => p.trim());
      
      // Simple email validation
      if (!email.includes('@')) {
        setErrorMsg(`Row ${i + 1} has an invalid email format: ${email}`);
        hasError = true;
        break;
      }

      list.push({ studentId, lastName, firstName, email });
    }

    if (!hasError) {
      setParsedStudents(list);
      setSuccessMsg(`Successfully parsed ${list.length} student records from CSV.`);
    } else {
      setParsedStudents([]);
    }
  };

  const handleFileUpload = (file) => {
    setErrorMsg('');
    setSuccessMsg('');
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
        setErrorMsg('Failed to parse file. Please verify it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.subject || !formData.section || !formData.facultyId) {
      setErrorMsg('Please select a subject, section, and faculty member.');
      return;
    }

    if (parsedStudents.length === 0) {
      setErrorMsg('Please import enrolled students via CSV before saving.');
      return;
    }

    // Verify if classroom already exists
    const classrooms = mockDb.getClassrooms();
    const [subCode, subName] = formData.subject.split('|');
    
    const duplicate = classrooms.some(
      c => c.subjectCode === subCode && c.section === formData.section && c.status === 'active'
    );
    
    if (duplicate) {
      setErrorMsg(`Active classroom for ${subCode} - ${formData.section} already exists.`);
      return;
    }

    // Save classroom
    const newClassroom = {
      subjectCode: subCode,
      subjectName: subName,
      section: formData.section,
      facultyId: formData.facultyId,
      schoolYear: formData.schoolYear,
      semester: formData.semester,
      enrolledCount: parsedStudents.length,
      status: 'active',
      schedule: 'TTh 9:00AM - 10:30AM', // Mocked schedule
      room: 'Lab 4' // Mocked room
    };

    mockDb.saveClassroom(newClassroom);
    navigate('/admin/classmanagementlist');
  };

  return (
    <>
      <PageHeader title="Create Classroom" breadcrumb="Admin Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/classmanagementlist')}>
            Classrooms
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">Create Classroom</span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg text-sm font-semibold">
            {successMsg}
          </div>
        )}

        {showWarning && (
          <div className="bg-amber-50 border border-amber-250 text-amber-800 p-4 rounded-lg text-sm font-semibold flex items-start gap-2.5 shadow-sm">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Department Mismatch Warning</span>
              <span className="text-xs text-amber-700 mt-1 block leading-relaxed">{warningText}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Subject, Section & Faculty Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900">Classroom Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Link a syllabus subject, targeted section, and advising faculty.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Subject / Course <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select subject...</option>
                  {subjects.map((sub, idx) => (
                    <option key={idx} value={`${sub.code}|${sub.name}`}>{sub.code} - {sub.name}</option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Target Section <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.section}
                  onChange={handleSectionChange}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select section...</option>
                  {sections.map((sec, idx) => (
                    <option key={idx} value={sec.name}>{sec.name}</option>
                  ))}
                </select>
              </div>

              {/* Faculty */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assigned Instructor <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.facultyId}
                  onChange={(e) => setFormData({...formData, facultyId: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select instructor...</option>
                  {facultyUsers.map((fac) => (
                    <option key={fac.id} value={fac.id}>Prof. {fac.firstName} {fac.lastName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* School Year */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">School Year</label>
                <input 
                  type="text" 
                  disabled
                  value={formData.schoolYear}
                  className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-sm cursor-not-allowed font-mono"
                />
              </div>

              {/* Semester */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Semester</label>
                <input 
                  type="text" 
                  disabled
                  value={formData.semester}
                  className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-sm cursor-not-allowed font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: CSV Import Area */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-slate-900">Student Enrollment CSV Import</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Paste comma-separated rows of active student registries.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadSample}
                className="px-3 py-1.5 border border-sage-200 text-sage-700 hover:bg-sage-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Load Sample CSV
              </button>
            </div>

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
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Or Paste Raw Data (Format: <code className="font-mono text-sage-700">StudentID,LastName,FirstName,Email</code>)
                </label>
                <textarea
                  value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setParsedStudents([]);
                }}
                onBlur={() => handleParseCSV()}
                rows="5"
                placeholder="std-101,Jenkins,Sarah,s.jenkins@student.sage.edu&#10;std-102,Smith,John,j.smith@student.sage.edu"
                className="block w-full p-4 border border-slate-200 rounded-xl text-sm font-mono focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
              />
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => handleParseCSV()}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all"
                >
                  Validate & Parse CSV
                </button>
              </div>
            </div>
          </div>

            {/* Student Preview Table */}
            {parsedStudents.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 uppercase border-b border-slate-200">
                  Enrolled Students Registry Preview ({parsedStudents.length} Records)
                </div>
                <div className="table-container max-h-60 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase font-mono">ID</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Last Name</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">First Name</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase font-mono">Email Address</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {parsedStudents.map((stud, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 whitespace-nowrap text-xs font-mono font-medium text-slate-700">{stud.studentId}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-900 font-medium">{stud.lastName}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-900 font-medium">{stud.firstName}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-slate-600">{stud.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/admin/classmanagementlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-5 py-2.5 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> Save Classroom Setup
            </button>
          </div>

        </form>

      </div>
    </>
  );
}

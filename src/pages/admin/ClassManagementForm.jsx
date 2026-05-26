import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Upload, X, Check, Users, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

const availableSubjects = [
  { code: 'IT101', name: 'Introduction to Computing' },
  { code: 'IT201', name: 'Data Structures and Algorithms' },
  { code: 'CS301', name: 'Artificial Intelligence' },
  { code: 'IT401', name: 'Capstone Project 1' }
];

const availableSections = ['BSIT-1A', 'BSIT-2B', 'BSCS-3A', 'BSIT-4A', 'BSCS-1B', 'BSIT-2A'];

export default function ClassManagementForm() {
  const navigate = useNavigate();
  const [facultyUsers, setFacultyUsers] = useState([]);
  
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

  // Sample CSV template pre-loaded for easy demo
  const sampleCSV = `std-101,Jenkins,Sarah,s.jenkins@student.sage.edu
std-102,Smith,John,j.smith@student.sage.edu
std-103,Johnson,Mary,m.johnson@student.sage.edu`;

  useEffect(() => {
    // Load active faculty members
    const users = mockDb.getUsers();
    setFacultyUsers(users.filter(u => u.role === 'faculty' && u.status === 'active'));
  }, []);

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
                  {availableSubjects.map((sub, idx) => (
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
                  onChange={(e) => setFormData({...formData, section: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select section...</option>
                  {availableSections.map((sec, idx) => (
                    <option key={idx} value={sec}>{sec}</option>
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

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                CSV Input Data (Format: <code className="font-mono text-sage-700">StudentID,LastName,FirstName,Email</code>)
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

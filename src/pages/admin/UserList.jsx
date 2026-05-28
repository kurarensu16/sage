import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Plus, Edit2, Trash2, Power, UserCheck, CheckCircle, AlertCircle, Upload, X, Check, FileSpreadsheet } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import * as XLSX from 'xlsx';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

export default function UserList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');

  // Batch CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedUsers, setParsedUsers] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = React.useRef(null);

  const sampleCSV = `Smith,Jane,A.,jane.smith@student.sage.edu,student,College of Computer Studies,Bachelor of Science in Information Technology,BSIT-1A,1st Year
Cruz,Patricia,N.,p.cruz@sage.edu.ph,dean,College of Computer Studies,,,
Rivera,Amanda,Santos,a.rivera@sage.edu.ph,faculty,College of Computer Studies,Bachelor of Science in Information Technology,,`;

  // Load users from mockDb
  const loadUsers = () => {
    setUsers(mockDb.getUsers());
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    
    // Normalise department comparison for legacy data
    let userDept = user.department;
    if (userDept === 'College of IT' || userDept === 'College of CS') {
      userDept = 'College of Computer Studies';
    }
    
    let filterDept = deptFilter;
    if (filterDept === 'College of IT' || filterDept === 'College of CS') {
      filterDept = 'College of Computer Studies';
    }
    
    const matchesDept = filterDept ? userDept === filterDept : true;
    const matchesProgram = programFilter ? user.program === programFilter : true;
    const matchesYear = yearFilter ? user.yearLevel === yearFilter : true;
    
    return matchesSearch && matchesRole && matchesDept && matchesProgram && matchesYear;
  });

  // Toggle User Active Status
  const handleToggleStatus = (userId) => {
    const updatedUser = users.find(u => u.id === userId);
    if (updatedUser) {
      const nextStatus = updatedUser.status === 'active' ? 'inactive' : 'active';
      mockDb.saveUser({ ...updatedUser, status: nextStatus });
      loadUsers();
    }
  };

  // Delete User
  const handleDeleteUser = (userId) => {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      mockDb.deleteUser(userId);
      loadUsers();
    }
  };

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
      setParsedUsers([]);
      return;
    }

    const lines = textToParse.split('\n');
    const list = [];
    const existingEmails = users.map(u => u.email.toLowerCase());
    let hasError = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 6) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: LastName,FirstName,MiddleName,Email,Role,College,Program[,Section,YearLevel]`);
        hasError = true;
        break;
      }

      let [lastName, firstName, middleName, email, role, department, program, section, yearLevel] = parts.map(p => p?.trim() || '');

      // Backwards compatibility for 6 columns
      if (parts.length === 6) {
        department = parts[5].trim();
        if (department === 'College of IT' || department === 'College of CS' || department === 'College of Computer Studies') {
          department = 'College of Computer Studies';
          program = role === 'student' || role === 'faculty'
            ? 'Bachelor of Science in Information Technology'
            : '';
        } else {
          program = '';
        }
        section = '';
        yearLevel = '';
      } else {
        if (department === 'College of IT' || department === 'College of CS') {
          department = 'College of Computer Studies';
          program = program || (role === 'student' || role === 'faculty'
            ? 'Bachelor of Science in Information Technology'
            : '');
        }
      }

      // Automatically derive Year Level and assign first matching active section if student lacks section/yearLevel
      if (role.toLowerCase() === 'student') {
        if (!yearLevel) {
          // If section is provided, try to extract year level from section name (e.g. BSIT-1A -> 1st Year)
          if (section) {
            if (section.includes('1')) yearLevel = '1st Year';
            else if (section.includes('2')) yearLevel = '2nd Year';
            else if (section.includes('3')) yearLevel = '3rd Year';
            else if (section.includes('4')) yearLevel = '4th Year';
          }
          if (!yearLevel) {
            yearLevel = '1st Year'; // Default fallback
          }
        }

        if (!section) {
          const dbSections = mockDb.getSections();
          const matchesDigit = yearLevel.charAt(0); // '1', '2', '3', '4'
          const matchedSec = dbSections.find(
            s => s.department === department && 
                 s.program === program &&
                 (s.name.includes(`-${matchesDigit}`) || s.name.includes(matchesDigit))
          );
          section = matchedSec ? matchedSec.name : '';
        }
      }

      if (!email.includes('@')) {
        setImportError(`Row ${i + 1} has an invalid email format: ${email}`);
        hasError = true;
        break;
      }

      if (existingEmails.includes(email.toLowerCase())) {
        setImportError(`Row ${i + 1}: Email "${email}" is already registered.`);
        hasError = true;
        break;
      }

      const validRoles = ['admin', 'dean', 'faculty', 'student'];
      if (!validRoles.includes(role.toLowerCase())) {
        setImportError(`Row ${i + 1} has an invalid role: "${role}". Valid values: admin, dean, faculty, student`);
        hasError = true;
        break;
      }

      list.push({
        lastName,
        firstName,
        middleName,
        email,
        role: role.toLowerCase(),
        department,
        program,
        section,
        yearLevel,
        status: 'active'
      });
    }

    if (!hasError) {
      setParsedUsers(list);
      setImportSuccess(`Successfully parsed ${list.length} user records.`);
    } else {
      setParsedUsers([]);
    }
  };

  const handleSaveImport = () => {
    if (parsedUsers.length === 0) return;
    
    parsedUsers.forEach(user => {
      mockDb.saveUser(user);
    });

    setIsImportOpen(false);
    setCsvText('');
    setParsedUsers([]);
    setImportSuccess('');
    loadUsers();
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase font-mono">Admin</span>;
      case 'dean':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">Dean</span>;
      case 'faculty':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase font-mono">Faculty</span>;
      case 'student':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase font-mono">Student</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader title="User Management" breadcrumb="Admin Portal">
        <div className="flex gap-2">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 hover:border-sage-350 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <Link 
            to="/admin/userform" 
            className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add New User
          </Link>
        </div>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Filters Toolbar */}
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by name or email..." 
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors min-w-[120px]"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="dean">Dean</option>
              <option value="faculty">Faculty</option>
              <option value="student">Student</option>
            </select>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setProgramFilter('');
              }}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors min-w-[160px] max-w-[240px] truncate"
            >
              <option value="">All Colleges</option>
              {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                <option key={college} value={college}>{college}</option>
              ))}
            </select>

            {/* Program Filter */}
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors min-w-[180px] max-w-[320px] truncate"
            >
              <option value="">All Programs</option>
              {Array.from(new Set(
                deptFilter ? (DYCI_ACADEMIC_PROGRAMS[deptFilter] || []) : Object.values(DYCI_ACADEMIC_PROGRAMS).flat()
              )).map(prog => (
                <option key={prog} value={prog}>{prog}</option>
              ))}
            </select>

            {/* Year Level Filter */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors min-w-[130px]"
            >
              <option value="">All Year Levels</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
            </select>
          </div>
        </div>

        {/* User Table Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">College / Program</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 font-display text-sm">
                          {user.lastName}, {user.firstName} {user.middleName && user.middleName[0] + '.'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-650 font-medium">
                        <div>{user.department === 'College of IT' || user.department === 'College of CS' ? 'College of Computer Studies' : user.department}</div>
                        {user.program && <div className="text-[10px] text-slate-400 font-normal">{user.program}</div>}
                        {user.role === 'student' && (
                          <div className="text-[10px] text-sage-600 font-semibold mt-0.5">
                            {user.yearLevel || '1st Year'}{user.section ? ` | Section: ${user.section}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          user.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleToggleStatus(user.id)}
                            title={user.status === 'active' ? 'Disable Account' : 'Enable Account'}
                            className={`p-1.5 rounded-md border ${
                              user.status === 'active' 
                                ? 'text-rose-600 hover:bg-rose-50 border-rose-100' 
                                : 'text-emerald-600 hover:bg-emerald-50 border-emerald-100'
                            } transition-colors`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          
                          <button 
                            onClick={() => navigate(`/admin/userform?id=${user.id}`)}
                            title="Edit User Details"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            title="Delete User"
                            disabled={user.role === 'admin'}
                            className={`p-1.5 rounded-md border transition-colors ${
                              user.role === 'admin' 
                                ? 'text-slate-300 border-slate-100 cursor-not-allowed' 
                                : 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-100'
                            }`}
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
                      No users match your criteria.
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
                <FileSpreadsheet className="h-5 w-5 text-sage-600" /> Batch Import Users (CSV)
              </h3>
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setCsvText('');
                  setParsedUsers([]);
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
                    Or Paste Raw Data (Format: <code className="font-mono text-sage-700 bg-sage-50 px-1 py-0.5 rounded border border-sage-200">LastName,FirstName,MiddleName,Email,Role,College,Program,Section,YearLevel</code>)
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
                    setParsedUsers([]);
                  }}
                  onBlur={() => handleParseCSV()}
                  rows="6"
                  placeholder="Smith,Jane,A.,jane.smith@student.sage.edu,student,College of Computer Studies,Bachelor of Science in Information Technology,BSIT-1A,1st Year"
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

              {parsedUsers.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-650 uppercase border-b border-slate-200 font-display">
                    Parsed Registry Preview ({parsedUsers.length} Records)
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 font-bold text-slate-500">Name</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Email</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Role</th>
                          <th className="px-4 py-2 font-bold text-slate-500">College / Program</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Year Level</th>
                          <th className="px-4 py-2 font-bold text-slate-500">Section</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {parsedUsers.map((u, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 font-bold text-slate-800">{u.lastName}, {u.firstName}</td>
                            <td className="px-4 py-2 font-mono text-slate-600">{u.email}</td>
                            <td className="px-4 py-2 font-semibold text-slate-750 uppercase font-mono">{u.role}</td>
                            <td className="px-4 py-2 text-slate-600 text-xs">
                              <div>{u.department}</div>
                              {u.program && <div className="text-[10px] text-slate-400 font-mono">{u.program}</div>}
                            </td>
                            <td className="px-4 py-2 text-slate-650 text-xs font-medium">{u.yearLevel || '-'}</td>
                            <td className="px-4 py-2 text-slate-600 text-xs font-mono font-bold">{u.section || '-'}</td>
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
                  setParsedUsers([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveImport}
                disabled={parsedUsers.length === 0}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Check className="h-4 w-4" /> Save Imported Users
              </button>
            </div>
          </div>

        </div>
      </div>
      )}
    </>
  );
}

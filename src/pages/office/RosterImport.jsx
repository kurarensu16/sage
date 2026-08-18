import React, { useState, useRef, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function RosterImport() {
  const { user, profile } = useAuth();
  const [csvText, setCsvText] = useState('');
  const [parsedUsers, setParsedUsers] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const [dbUsers, setDbUsers] = useState([]);
  const [dbSections, setDbSections] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  
  // Scoped to the office's department
  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name;

  const sampleCSV = `Smith,Jane,A.,jane.smith@student.sage.edu,student,Bachelor of Science in Information Technology,BSIT-1A,1st Year,2026-00005
Rivera,Amanda,Santos,a.rivera@sage.edu.ph,faculty,Bachelor of Science in Information Technology,,,FAC-2026-00003`;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: usersData } = await supabase.from('users').select('email, user_number, status');
        if (usersData) setDbUsers(usersData);

        const { data: secs } = await supabase.from('sections').select('*');
        if (secs) setDbSections(secs);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingInitial(false);
      }
    };
    fetchData();
  }, []);

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

  const handleParseCSV = (textToParse = csvText) => {
    setImportError('');
    setImportSuccess('');

    if (!textToParse.trim()) {
      setParsedUsers([]);
      return;
    }

    const lines = textToParse.split('\n');
    const list = [];
    let hasError = false;

    // We no longer need roleCounts here because we generate UUID or random sequence if userNumber is missing,
    // or rely on the user to provide userNumber. Let's provide a simple randomizer for user numbers if missing.
    const tempRandomIds = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 5) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: LastName,FirstName,MiddleName,Email,Role,Program[,Section,YearLevel,IDNumber]`);
        hasError = true;
        break;
      }

      let [lastName, firstName, middleName, email, role, program, section, yearLevel, userNumber] = parts.map(p => p?.trim() || '');

      // Assign the department implicitly based on the office's scope
      const department = userDepartmentName;

      // Automatically derive Year Level and assign first matching active section if student lacks section/yearLevel
      if (role.toLowerCase() === 'student') {
        if (!yearLevel) {
          if (section) {
            if (section.includes('1')) yearLevel = '1st Year';
            else if (section.includes('2')) yearLevel = '2nd Year';
            else if (section.includes('3')) yearLevel = '3rd Year';
            else if (section.includes('4')) yearLevel = '4th Year';
          }
          if (!yearLevel) {
            yearLevel = '1st Year'; 
          }
        }

        if (!section) {
          const matchesDigit = yearLevel.charAt(0);
          const matchedSec = dbSections.find(
            s => s.department_id === userDepartmentId && 
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

      const existingUser = dbUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existingUser && existingUser.status !== 'archived') {
        setImportError(`Row ${i + 1}: Email "${email}" is already registered.`);
        hasError = true;
        break;
      }

      if (list.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        setImportError(`Row ${i + 1}: Duplicate email "${email}" found inside the CSV.`);
        hasError = true;
        break;
      }

      const validRoles = ['faculty', 'student'];
      if (!validRoles.includes(role.toLowerCase())) {
        setImportError(`Row ${i + 1} has an invalid role: "${role}". Valid values for College Office: faculty, student`);
        hasError = true;
        break;
      }

      let finalUserNumber = userNumber;
      if (!finalUserNumber) {
        const prefix = role.toLowerCase() === 'student' ? '' : 'FAC-';
        const year = new Date().getFullYear();
        let generated = '';
        do {
          const randomSeq = Math.floor(10000 + Math.random() * 90000);
          generated = `${prefix}${year}-${randomSeq}`;
        } while (dbUsers.some(u => u.user_number === generated) || tempRandomIds.has(generated));
        tempRandomIds.add(generated);
        finalUserNumber = generated;
      } else {
        if (role.toLowerCase() === 'student') {
          const studentIdRegex = /^\d{4}-\d{5}$/;
          if (!studentIdRegex.test(finalUserNumber)) {
            setImportError(`Row ${i + 1} has an invalid Student Number format: "${finalUserNumber}". Must be YYYY-XXXXX.`);
            hasError = true;
            break;
          }
        } else {
          const employeeIdRegex = /^FAC-\d{4}-\d{5}$/;
          if (!employeeIdRegex.test(finalUserNumber)) {
            setImportError(`Row ${i + 1} has an invalid Employee ID format: "${finalUserNumber}". Must be FAC-YYYY-XXXXX.`);
            hasError = true;
            break;
          }
        }
        if (dbUsers.some(u => u.user_number === finalUserNumber) || list.some(u => u.userNumber === finalUserNumber)) {
          setImportError(`Row ${i + 1} has a duplicate ID Number: "${finalUserNumber}".`);
          hasError = true;
          break;
        }
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
        status: 'active',
        userNumber: finalUserNumber
      });
    }

    if (!hasError) {
      setParsedUsers(list);
      setImportSuccess(`Successfully parsed ${list.length} user records.`);
    } else {
      setParsedUsers([]);
    }
  };

  const executeSaveImport = async () => {
    if (!userDepartmentId) {
      setImportError('Your account is not bound to a specific department. Cannot import roster.');
      return;
    }
    
    setImportError('');
    setImportSuccess('');
    setIsImporting(true);
    setImportProgress('Starting import process...');

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < parsedUsers.length; i++) {
        const u = parsedUsers[i];
        setImportProgress(`Registering user ${i + 1} of ${parsedUsers.length}: ${u.firstName} ${u.lastName}...`);

        const secObj = dbSections.find(s => s.name === u.section && s.department_id === userDepartmentId);
        const existingUserObj = dbUsers.find(oldU => oldU.email.toLowerCase() === u.email.toLowerCase());

        if (existingUserObj) {
          // Reactivate existing user
          const { error: updateErr } = await supabase
            .from('users')
            .update({
              status: 'active',
              first_name: u.firstName.trim(),
              last_name: u.lastName.trim(),
              middle_name: u.middleName.trim(),
              role: u.role,
              department_id: userDepartmentId,
              year_level: u.role === 'student' ? u.yearLevel : null,
              section_id: u.role === 'student' ? (secObj?.id || null) : null,
              user_number: u.userNumber
            })
            .eq('email', u.email.toLowerCase());

          if (updateErr) {
            console.error(`Failed to restore ${u.email}:`, updateErr);
            failCount++;
          } else {
            successCount++;
          }
        } else {
          // Create new user via Edge Function
          const { data, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
            body: {
              email: u.email.trim().toLowerCase(),
              password: 'DemoPassword123!',
              firstName: u.firstName.trim(),
              lastName: u.lastName.trim(),
              middleName: u.middleName.trim(),
              role: u.role,
              departmentId: userDepartmentId,
              yearLevel: u.role === 'student' ? u.yearLevel : null,
              sectionId: u.role === 'student' ? (secObj?.id || null) : null,
              userNumber: u.userNumber
            }
          });

          if (invokeErr || data?.error) {
            console.error(`Failed to register ${u.email}:`, invokeErr || data?.error);
            failCount++;
          } else {
            if (data?.user?.id) {
              const { error: updateErr } = await supabase
                .from('users')
                .update({ user_number: u.userNumber })
                .eq('user_id', data.user.id);
              if (updateErr) {
                console.error(`Failed to set user number client-side for ${u.email}:`, updateErr);
              }
            }
            successCount++;
          }
        }
      }

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Department Roster Import',
        `Batch CSV import completed for ${userDepartmentName}: ${successCount} user(s) registered successfully.`,
        actorName
      );

      setImportSuccess(`Import completed! Successfully registered ${successCount} users. Failed: ${failCount}`);
      
      setTimeout(() => {
        setParsedUsers([]);
        setCsvText('');
        setImportSuccess('');
        setImportProgress('');
        setIsImporting(false);
      }, 3000);

    } catch (err) {
      console.error('Import failed:', err);
      setImportError('Import failed: ' + err.message);
      setIsImporting(false);
    }
  };

  return (
    <>
      <PageHeader title="Roster Import" breadcrumb="College Office Portal" />
      <div className="p-8 overflow-y-auto flex-1">
        <div className="max-w-4xl mx-auto space-y-6">
          
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-sage-50 text-sage-600 rounded-full flex items-center justify-center">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Bulk Import {userDepartmentName} Accounts</h3>
              <p className="text-sm text-slate-500 mt-2">Upload a CSV file containing student or faculty records. They will be automatically mapped to your department.</p>
            </div>
            
            <div 
              className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Click to upload or drag and drop</p>
              <p className="text-xs text-slate-400">CSV or Excel files only (max. 5MB)</p>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </div>
            
            <div className="flex items-center justify-center gap-4 text-sm text-slate-500">
              <span>Need a template?</span>
              <button 
                onClick={() => {
                  setCsvText(sampleCSV);
                  handleParseCSV(sampleCSV);
                }}
                className="text-sage-600 font-semibold hover:text-sage-700 flex items-center gap-1"
              >
                <Download className="h-4 w-4" /> Load Sample Data
              </button>
            </div>
          </div>

          {importError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-800">Import Error</h4>
                <p className="text-sm text-rose-600 mt-1">{importError}</p>
              </div>
            </div>
          )}

          {importSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-800">Success</h4>
                <p className="text-sm text-emerald-600 mt-1">{importSuccess}</p>
              </div>
            </div>
          )}

          {parsedUsers.length > 0 && !isImporting && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Data Preview</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Please review the {parsedUsers.length} records below before confirming the import.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setParsedUsers([]); setCsvText(''); }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeSaveImport}
                    className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" /> Confirm Import
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Section</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">ID Number</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {parsedUsers.map((u, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'faculty' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                          {u.lastName}, {u.firstName}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {u.email}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600">
                          {u.section || '-'}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {u.userNumber}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isImporting && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
              <Loader2 className="h-8 w-8 text-sage-600 animate-spin mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">Processing Import...</h4>
                <p className="text-xs text-slate-500 mt-1">{importProgress}</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 max-w-md mx-auto overflow-hidden">
                <div className="bg-sage-600 h-1.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </>
  );
}

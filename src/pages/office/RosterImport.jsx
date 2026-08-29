import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, UserPlus, Upload, FileSpreadsheet, Search, Check, 
  AlertCircle, Loader2, X, Download, Eye, Edit2, Lock, 
  Layers, GraduationCap, Briefcase, CheckCircle, Power, 
  MoreVertical, Archive, RotateCcw, ChevronLeft, ChevronRight, 
  ChevronsLeft, ChevronsRight, Plus, SlidersHorizontal, BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

export default function RosterImport() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  
  // Department scoping
  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name || 'Department';

  // Data states
  const [rosterUsers, setRosterUsers] = useState([]);
  const [dbSections, setDbSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Pagination state (20 users per page)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Dropdown menu state
  const [activeDropdownId, setActiveDropdownId] = useState(null);

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  // Single User Form state
  const [addUserForm, setAddUserForm] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    role: 'student',
    yearLevel: '1st Year',
    sectionId: '',
    autoGenerateId: true,
    userNumber: ''
  });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState('');

  // Batch CSV/Excel Import state
  const [csvText, setCsvText] = useState('');
  const [parsedUsers, setParsedUsers] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Edit User Form state
  const [editForm, setEditForm] = useState({
    sectionId: '',
    yearLevel: '',
    status: 'active'
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const sampleCSV = `Smith,Jane,A.,jane.smith@student.sage.edu,student,Bachelor of Science in Information Technology,BSIT-1A,1st Year,2026-00005
Rivera,Amanda,Santos,a.rivera@sage.edu.ph,faculty,Bachelor of Science in Information Technology,,,FAC-2026-00003`;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeDropdownId && !e.target.closest('.dropdown-trigger') && !e.target.closest('.dropdown-menu')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownId]);

  // Fetch department roster & sections
  const fetchRosterData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch sections for this department
      const { data: secsData } = await supabase
        .from('sections')
        .select('*')
        .eq('department_id', userDepartmentId);
      
      if (secsData) setDbSections(secsData);

      // Fetch users in this department
      let query = supabase
        .from('users')
        .select('*, departments(name), sections(name)')
        .order('last_name', { ascending: true });

      if (userDepartmentId) {
        query = query.eq('department_id', userDepartmentId);
      }

      const { data: usersData, error: usersErr } = await query;
      if (usersErr) throw usersErr;

      const mapped = (usersData || []).map(u => ({
        id: u.user_id,
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        middleName: u.middle_name || '',
        email: u.email || '',
        role: u.role || 'student',
        department: u.departments?.name || userDepartmentName,
        departmentId: u.department_id,
        section: u.sections?.name || (u.role === 'student' ? 'Irregular' : ''),
        sectionId: u.section_id,
        yearLevel: u.year_level || '',
        status: u.status || 'active',
        userNumber: u.user_number || '',
        isAdminLocked: u.status === 'suspended_by_admin' || u.status === 'suspended'
      }));

      setRosterUsers(mapped);
    } catch (err) {
      console.error('Failed to fetch department roster:', err);
      showToast('Failed to load roster: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [userDepartmentId, userDepartmentName]);

  useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  // Filtered roster users
  const filteredUsers = useMemo(() => {
    return rosterUsers.filter(u => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.userNumber.toLowerCase().includes(term) ||
        u.section.toLowerCase().includes(term);

      const matchesRole = !roleFilter || u.role === roleFilter;
      const matchesSection = !sectionFilter || u.sectionId === sectionFilter || u.section === sectionFilter;
      const matchesYear = !yearFilter || u.yearLevel === yearFilter;
      const matchesStatus = showArchived ? u.status === 'archived' : u.status !== 'archived';

      return matchesSearch && matchesRole && matchesSection && matchesYear && matchesStatus;
    });
  }, [rosterUsers, searchTerm, roleFilter, sectionFilter, yearFilter, showArchived]);

  // Department Metrics
  const stats = useMemo(() => {
    const total = rosterUsers.length;
    const students = rosterUsers.filter(u => u.role === 'student').length;
    const faculty = rosterUsers.filter(u => u.role === 'faculty').length;
    const sections = dbSections.length;
    return { total, students, faculty, sections };
  }, [rosterUsers, dbSections]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const currentPageUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const activeFilterCount = [roleFilter, sectionFilter, yearFilter, showArchived].filter(Boolean).length;

  const clearFilters = () => {
    setRoleFilter('');
    setSectionFilter('');
    setYearFilter('');
    setShowArchived(false);
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Handle Single User Submission
  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    setAddUserError('');

    if (!addUserForm.firstName.trim() || !addUserForm.lastName.trim() || !addUserForm.email.trim()) {
      setAddUserError('Please provide First Name, Last Name, and Email.');
      return;
    }

    if (addUserForm.role === 'student' && !addUserForm.sectionId) {
      setAddUserError('Please assign a block section to the student.');
      return;
    }

    if (rosterUsers.some(u => u.email.toLowerCase() === addUserForm.email.toLowerCase().trim())) {
      setAddUserError('A user with this email address already exists in the department.');
      return;
    }

    setAddUserLoading(true);

    try {
      let finalUserNumber = addUserForm.userNumber.trim();
      if (addUserForm.autoGenerateId || !finalUserNumber) {
        const prefix = addUserForm.role === 'student' ? '' : 'FAC-';
        const year = new Date().getFullYear();
        const randomSeq = Math.floor(10000 + Math.random() * 90000);
        finalUserNumber = `${prefix}${year}-${randomSeq}`;
      } else {
        if (addUserForm.role === 'student' && !/^\d{4}-\d{5}$/.test(finalUserNumber)) {
          setAddUserError('Student ID must follow YYYY-XXXXX format.');
          setAddUserLoading(false);
          return;
        }
        if (addUserForm.role === 'faculty' && !/^FAC-\d{4}-\d{5}$/.test(finalUserNumber)) {
          setAddUserError('Faculty ID must follow FAC-YYYY-XXXXX format.');
          setAddUserLoading(false);
          return;
        }
      }

      const finalSectionId = (addUserForm.role === 'student' && addUserForm.sectionId && addUserForm.sectionId !== 'irregular') 
        ? addUserForm.sectionId 
        : null;

      const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: addUserForm.email.trim().toLowerCase(),
          firstName: addUserForm.firstName.trim(),
          lastName: addUserForm.lastName.trim(),
          middleName: addUserForm.middleName.trim(),
          role: addUserForm.role,
          departmentId: userDepartmentId,
          yearLevel: addUserForm.role === 'student' ? addUserForm.yearLevel : null,
          sectionId: finalSectionId,
          userNumber: finalUserNumber
        }
      });

      if (invokeErr || invokeData?.error) {
        const { error: directErr } = await supabase.from('users').insert({
          first_name: addUserForm.firstName.trim(),
          last_name: addUserForm.lastName.trim(),
          middle_name: addUserForm.middleName.trim(),
          email: addUserForm.email.trim().toLowerCase(),
          role: addUserForm.role,
          department_id: userDepartmentId,
          section_id: finalSectionId,
          year_level: addUserForm.role === 'student' ? addUserForm.yearLevel : null,
          user_number: finalUserNumber,
          status: 'active',
          password_hash: 'managed_by_supabase_auth'
        });

        if (directErr) throw directErr;
      } else if (invokeData?.user?.id) {
        await supabase
          .from('users')
          .update({ user_number: finalUserNumber })
          .eq('user_id', invokeData.user.id);
      }

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Department User Onboarding',
        `Registered new ${addUserForm.role}: ${addUserForm.lastName}, ${addUserForm.firstName} (${finalUserNumber}) to ${userDepartmentName}.`,
        actorName
      );

      showToast(`Successfully registered ${addUserForm.firstName} ${addUserForm.lastName}!`);
      setIsAddUserOpen(false);
      setAddUserForm({
        firstName: '',
        lastName: '',
        middleName: '',
        email: '',
        role: 'student',
        yearLevel: '1st Year',
        sectionId: '',
        autoGenerateId: true,
        userNumber: ''
      });
      fetchRosterData();
    } catch (err) {
      console.error('Failed to register member:', err);
      setAddUserError(err.message || 'Failed to create user account.');
    } finally {
      setAddUserLoading(false);
    }
  };

  // Handle Edit Member Submission
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editingUser.isAdminLocked) {
      setEditError('This account is locked by Central IT and cannot be modified by the College Office.');
      return;
    }

    setEditLoading(true);
    setEditError('');

    try {
      const updatePayload = {
        section_id: editingUser.role === 'student' ? (editForm.sectionId || null) : null,
        year_level: editingUser.role === 'student' ? editForm.yearLevel : null,
        status: editForm.status
      };

      const { error: updateErr } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('user_id', editingUser.id);

      if (updateErr) throw updateErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Department Roster Update',
        `Updated ${editingUser.role} ${editingUser.lastName}, ${editingUser.firstName} section/status in ${userDepartmentName}.`,
        actorName
      );

      showToast(`Updated ${editingUser.firstName} ${editingUser.lastName}'s details.`);
      setEditingUser(null);
      fetchRosterData();
    } catch (err) {
      console.error('Failed to update member:', err);
      setEditError(err.message || 'Failed to update user details.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Status Toggle
  const handleToggleStatus = async (targetUser) => {
    if (targetUser.isAdminLocked) {
      showToast('Action Blocked: This account has a System Administrator lock.', 'error');
      return;
    }

    const nextStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    try {
      const { error: toggleErr } = await supabase
        .from('users')
        .update({ status: nextStatus })
        .eq('user_id', targetUser.id);

      if (toggleErr) throw toggleErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Department User Status Change',
        `Set ${targetUser.role} ${targetUser.lastName}, ${targetUser.firstName} to "${nextStatus}".`,
        actorName
      );

      showToast(`Member marked as ${nextStatus}.`);
      setActiveDropdownId(null);
      fetchRosterData();
    } catch (err) {
      console.error('Failed to change status:', err);
      showToast('Failed to change status: ' + err.message, 'error');
    }
  };

  // Handle Archive / Restore
  const handleArchiveRestore = async (targetUser, isArchive) => {
    if (targetUser.isAdminLocked) {
      showToast('Action Blocked: This account has a System Administrator lock.', 'error');
      return;
    }

    const nextStatus = isArchive ? 'archived' : 'active';
    try {
      const { error: toggleErr } = await supabase
        .from('users')
        .update({ status: nextStatus })
        .eq('user_id', targetUser.id);

      if (toggleErr) throw toggleErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        isArchive ? 'Department User Archival' : 'Department User Restoration',
        `${isArchive ? 'Archived' : 'Restored'} ${targetUser.role} ${targetUser.lastName}, ${targetUser.firstName}.`,
        actorName
      );

      showToast(`Member ${isArchive ? 'archived' : 'restored'} successfully.`);
      setActiveDropdownId(null);
      fetchRosterData();
    } catch (err) {
      console.error('Failed to archive/restore:', err);
      showToast('Action failed: ' + err.message, 'error');
    }
  };

  // Batch CSV/Excel Upload Handler
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
        setImportError('Failed to parse file. Please verify it is a valid Excel (.xlsx/.xls) or CSV file.');
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
    const tempRandomIds = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip CSV header row if present
      if (i === 0 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('role'))) {
        continue;
      }

      const parts = line.split(',');
      if (parts.length < 5) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: LastName,FirstName,MiddleName,Email,Role,College,Program[,Section,YearLevel,IDNumber]`);
        hasError = true;
        break;
      }

      let [lastName, firstName, middleName, email, role, college, program, section, yearLevel, userNumber] = parts.map(p => p?.trim() || '');
      const department = userDepartmentName;

      if (role.toLowerCase() === 'student') {
        if (!yearLevel) {
          if (section) {
            if (section.includes('1')) yearLevel = '1st Year';
            else if (section.includes('2')) yearLevel = '2nd Year';
            else if (section.includes('3')) yearLevel = '3rd Year';
            else if (section.includes('4')) yearLevel = '4th Year';
          }
          if (!yearLevel) yearLevel = '1st Year';
        }

        if (!section) {
          const matchesDigit = yearLevel.charAt(0);
          const matchedSec = dbSections.find(
            s => (s.name.includes(`-${matchesDigit}`) || s.name.includes(matchesDigit))
          );
          section = matchedSec ? matchedSec.name : '';
        }
      }

      if (!email.includes('@')) {
        setImportError(`Row ${i + 1} has an invalid email format: ${email}`);
        hasError = true;
        break;
      }

      const existingUser = rosterUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existingUser && existingUser.status !== 'archived') {
        setImportError(`Row ${i + 1}: Email "${email}" is already registered in this department.`);
        hasError = true;
        break;
      }

      if (list.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        setImportError(`Row ${i + 1}: Duplicate email "${email}" found inside the file.`);
        hasError = true;
        break;
      }

      const validRoles = ['faculty', 'student'];
      if (!validRoles.includes(role.toLowerCase())) {
        setImportError(`Row ${i + 1} has an invalid role: "${role}". Valid values: faculty, student`);
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
        } while (rosterUsers.some(u => u.userNumber === generated) || tempRandomIds.has(generated));
        tempRandomIds.add(generated);
        finalUserNumber = generated;
      } else {
        if (role.toLowerCase() === 'student' && !/^\d{4}-\d{5}$/.test(finalUserNumber)) {
          setImportError(`Row ${i + 1} has an invalid Student Number: "${finalUserNumber}". Must be YYYY-XXXXX.`);
          hasError = true;
          break;
        }
        if (role.toLowerCase() === 'faculty' && !/^FAC-\d{4}-\d{5}$/.test(finalUserNumber)) {
          setImportError(`Row ${i + 1} has an invalid Faculty ID: "${finalUserNumber}". Must be FAC-YYYY-XXXXX.`);
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
        setImportProgress(`Registering ${i + 1} of ${parsedUsers.length}: ${u.firstName} ${u.lastName}...`);

        const secObj = dbSections.find(s => s.name === u.section);
        const existingUserObj = rosterUsers.find(oldU => oldU.email.toLowerCase() === u.email.toLowerCase());

        if (existingUserObj) {
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
              section_id: u.role === 'student' ? (secObj?.section_id || null) : null,
              user_number: u.userNumber
            })
            .eq('email', u.email.toLowerCase());

          if (updateErr) failCount++;
          else successCount++;
        } else {
          const { data, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
            body: {
              email: u.email.trim().toLowerCase(),
              password: 'SagePassword123!',
              firstName: u.firstName.trim(),
              lastName: u.lastName.trim(),
              middleName: u.middleName.trim(),
              role: u.role,
              departmentId: userDepartmentId,
              yearLevel: u.role === 'student' ? u.yearLevel : null,
              sectionId: u.role === 'student' ? (secObj?.section_id || null) : null,
              userNumber: u.userNumber
            }
          });

          if (invokeErr || data?.error) {
            const { error: directErr } = await supabase.from('users').insert({
              first_name: u.firstName.trim(),
              last_name: u.lastName.trim(),
              middle_name: u.middleName.trim(),
              email: u.email.trim().toLowerCase(),
              role: u.role,
              department_id: userDepartmentId,
              section_id: u.role === 'student' ? (secObj?.section_id || null) : null,
              year_level: u.role === 'student' ? u.yearLevel : null,
              user_number: u.userNumber,
              status: 'active',
              password_hash: 'managed_by_supabase_auth'
            });

            if (directErr) failCount++;
            else successCount++;
          } else {
            if (data?.user?.id) {
              await supabase
                .from('users')
                .update({ user_number: u.userNumber })
                .eq('user_id', data.user.id);
            }
            successCount++;
          }
        }
      }

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Department Roster Batch Import',
        `Batch imported ${successCount} member(s) into ${userDepartmentName}.`,
        actorName
      );

      setImportSuccess(`Import completed! Successfully registered ${successCount} members. Failed: ${failCount}`);
      
      setTimeout(() => {
        setParsedUsers([]);
        setCsvText('');
        setIsImporting(false);
        setIsImportOpen(false);
        fetchRosterData();
      }, 1800);

    } catch (err) {
      console.error('Import failed:', err);
      setImportError('Import failed: ' + err.message);
      setIsImporting(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'faculty':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase font-mono">Faculty</span>;
      case 'student':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase font-mono">Student</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase font-mono">{role}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading department roster...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* PageHeader with Action Buttons matching User Management */}
      <PageHeader 
        title="Department Roster" 
        breadcrumb={`College Office Portal • ${userDepartmentName}`}
      >
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 hover:border-sage-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-xs flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button 
            onClick={() => {
              setAddUserError('');
              setIsAddUserOpen(true);
            }}
            className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add New User
          </button>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {/* Toast Notification */}
        {toastMessage && (
          <div className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200",
            toastMessage.type === 'error' ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          )}>
            {toastMessage.type === 'error' ? <AlertCircle className="h-5 w-5 text-rose-600" /> : <Check className="h-5 w-5 text-emerald-600" />}
            <span className="text-sm font-medium">{toastMessage.message}</span>
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          
          {/* Card 1: TOTAL ROSTER */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">TOTAL ROSTER</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">{stats.total}</h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate max-w-[100px] sm:max-w-none">{userDepartmentName}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50/70 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>

          {/* Card 2: ENROLLED STUDENTS */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">STUDENTS</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">{stats.students}</h3>
              <p className="text-[10px] sm:text-xs text-emerald-600 font-medium mt-0.5 truncate">Academic Load</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center shrink-0">
              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>

          {/* Card 3: DEPARTMENT FACULTY */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">FACULTY</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">{stats.faculty}</h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Instructors</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>

          {/* Card 4: ACTIVE SECTIONS */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">SECTIONS</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">{stats.sections}</h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Cohorts</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-50 text-purple-700 rounded-xl flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>

        </div>

        {/* Toolbar & Filters (Matching User Management) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by name, email, or ID number..." 
            />
            {searchTerm && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Right Action Controls: Status Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => {
                  setShowArchived(false);
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  !showArchived 
                    ? "bg-white text-slate-900 shadow-xs" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Active
              </button>
              <button
                onClick={() => {
                  setShowArchived(true);
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5",
                  showArchived 
                    ? "bg-white text-rose-600 shadow-xs" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Archive className="h-3 w-3" />
                Archived
              </button>
            </div>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
          >
            <option value="">All Roles ({stats.total})</option>
            <option value="student">Students ({stats.students})</option>
            <option value="faculty">Faculty ({stats.faculty})</option>
          </select>

          {/* Section Filter */}
          <select
            value={sectionFilter}
            onChange={(e) => {
              setSectionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
          >
            <option value="">All Sections</option>
            {dbSections.map(s => (
              <option key={s.section_id} value={s.section_id}>{s.name}</option>
            ))}
          </select>

          {/* Year Level Filter */}
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
          >
            <option value="">All Year Levels</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
          </select>

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
              {filteredUsers.length} / {rosterUsers.filter(u => showArchived ? u.status === 'archived' : u.status !== 'archived').length} matches
            </span>
          </div>
        </div>

        {/* User Feed (Mobile Cards + Desktop Table) */}
        
        {/* Mobile View Card Feed */}
        <div className="md:hidden space-y-3">
          {currentPageUsers.length > 0 ? (
            currentPageUsers.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="font-bold text-slate-900 font-display text-sm hover:text-sage-600 hover:underline truncate block"
                    >
                      {u.lastName}, {u.firstName} {u.middleName && u.middleName[0] + '.'}
                    </button>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">{u.email}</p>
                    {u.userNumber && (
                      <span className="text-[10px] font-mono text-slate-500">{u.userNumber}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {getRoleBadge(u.role)}
                    {u.isAdminLocked ? (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <Lock className="h-2.5 w-2.5 text-rose-500" /> Locked
                      </span>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border",
                        u.status === 'active' 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      )}>
                        {u.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="text-slate-600">
                    {u.role === 'student' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sage-700 font-bold text-[11px]">{u.yearLevel || '1st Year'}</span>
                        {u.section && (
                          <span className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono">
                            {u.section}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Faculty Instructor</span>
                    )}
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="View Profile"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setEditForm({
                          sectionId: u.sectionId || '',
                          yearLevel: u.yearLevel || '1st Year',
                          status: u.status
                        });
                        setEditError('');
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit Details"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {u.role === 'student' && (
                      <button
                        onClick={() => navigate(`/office/studentsections?studentId=${u.id}`)}
                        className="p-1.5 text-sage-600 hover:bg-sage-50 rounded-lg transition-colors cursor-pointer"
                        title="Manage Subject Load"
                      >
                        <BookOpen className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-400">
              No matching users found in this department.
            </div>
          )}
        </div>

        {/* User Table Grid (Desktop) */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto min-h-[320px]">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Department / Section</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {currentPageUsers.length > 0 ? (
                  currentPageUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/40 transition-colors">
                      
                      {/* Name Column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="font-bold text-slate-900 font-display text-sm hover:text-sage-600 hover:underline text-left block"
                        >
                          {u.lastName}, {u.firstName} {u.middleName && u.middleName[0] + '.'}
                        </button>
                        {u.userNumber && (
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {u.userNumber}
                          </div>
                        )}
                      </td>

                      {/* Email Column */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                        {u.email}
                      </td>

                      {/* Role Column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(u.role)}
                      </td>

                      {/* Department & Section */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                        <div>{u.department}</div>
                        {u.role === 'student' ? (
                          <div className="text-[10px] font-semibold mt-0.5 flex items-center gap-1.5">
                            <span className="text-sage-600">{u.yearLevel || '1st Year'}</span>
                            {u.section && (
                              <span className={u.section === 'Irregular' 
                                ? 'bg-amber-50 text-amber-700 border border-amber-100 rounded px-1.5 py-0.5 text-[9px] font-bold' 
                                : 'bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[9px] font-medium'
                              }>
                                {u.section}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-normal mt-0.5">Faculty Instructor</div>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {u.isAdminLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200" title="Locked by Central IT">
                            <Lock className="h-3 w-3 text-rose-500" />
                            Admin Lock
                          </span>
                        ) : (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                            u.status === 'active' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          )}>
                            {u.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>

                      {/* Action Menu (3 dots) */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === u.id ? null : u.id);
                            }}
                            className="dropdown-trigger p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            aria-label="Actions"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>

                          {activeDropdownId === u.id && (
                            <div className="dropdown-menu absolute right-6 mt-1 w-48 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-40 text-left">
                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setSelectedUser(u);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-400" />
                                View Profile
                              </button>

                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setEditingUser(u);
                                  setEditForm({
                                    sectionId: u.sectionId || '',
                                    yearLevel: u.yearLevel || '1st Year',
                                    status: u.status
                                  });
                                  setEditError('');
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                                Edit Details
                              </button>

                              {u.role === 'student' && (
                                <button
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    navigate(`/office/studentsections?studentId=${u.id}`);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-sage-700 hover:bg-sage-50 flex items-center gap-2"
                                >
                                  <BookOpen className="h-3.5 w-3.5 text-sage-600" />
                                  Manage Subject Load
                                </button>
                              )}

                              <button
                                onClick={() => handleToggleStatus(u)}
                                disabled={u.isAdminLocked}
                                className={cn(
                                  "w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
                                  u.status === 'active' ? "text-slate-700 hover:bg-slate-50" : "text-emerald-600 hover:bg-emerald-50"
                                )}
                              >
                                <Power className={`h-3.5 w-3.5 ${u.status === 'active' ? 'text-rose-500' : 'text-emerald-500'}`} />
                                {u.status === 'active' ? 'Disable Account' : 'Enable Account'}
                              </button>

                              {u.status !== 'archived' ? (
                                <button
                                  onClick={() => handleArchiveRestore(u, true)}
                                  disabled={u.isAdminLocked}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Archive className="h-3.5 w-3.5 text-rose-500" />
                                  Archive Account
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleArchiveRestore(u, false)}
                                  disabled={u.isAdminLocked}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <RotateCcw className="h-3.5 w-3.5 text-emerald-500" />
                                  Restore Account
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                      No members match your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer (20 Users per Page) */}
          {totalPages > 1 && (
            <div className="bg-slate-50/75 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Showing <strong className="text-slate-800 font-semibold">{Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)}</strong> to <strong className="text-slate-800 font-semibold">{Math.min(filteredUsers.length, currentPage * itemsPerPage)}</strong> of <strong className="text-slate-800 font-semibold">{filteredUsers.length}</strong> users
              </div>
              
              <div className="flex items-center gap-1.5">
                {/* First Page */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === 1
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>

                {/* Previous Page */}
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === 1
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Numbered Page Buttons with Ellipsis Window */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, idx, arr) => {
                    const showEllipsisBefore = page > 1 && arr[idx - 1] !== page - 1;
                    return (
                      <React.Fragment key={page}>
                        {showEllipsisBefore && (
                          <span className="text-slate-400 text-xs px-1 select-none font-medium">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center",
                            currentPage === page
                              ? "bg-sage-600 text-white shadow-xs"
                              : "text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}

                {/* Next Page */}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === totalPages
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Last Page */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === totalPages
                      ? "text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  title="Last Page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD SINGLE USER MODAL (Late Enrollee / Adjunct Faculty)          */}
      {/* ========================================================================= */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Department Member</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register a single student or faculty account to {userDepartmentName}</p>
              </div>
              <button 
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-6 space-y-4">
              
              {addUserError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{addUserError}</span>
                </div>
              )}

              {/* Department Locked Badge */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Department Scope:</span>
                <span className="font-semibold text-sage-800 bg-sage-50 px-2.5 py-1 rounded-md border border-sage-200 flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-sage-600" />
                  {userDepartmentName}
                </span>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Role Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={cn(
                    "flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    addUserForm.role === 'student' 
                      ? "bg-sage-50 border-sage-500 text-sage-800 shadow-xs" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="student" 
                      checked={addUserForm.role === 'student'} 
                      onChange={() => setAddUserForm({ ...addUserForm, role: 'student' })}
                      className="sr-only" 
                    />
                    <GraduationCap className="h-4 w-4" />
                    <span>Student</span>
                  </label>

                  <label className={cn(
                    "flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    addUserForm.role === 'faculty' 
                      ? "bg-blue-50 border-blue-500 text-blue-800 shadow-xs" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="faculty" 
                      checked={addUserForm.role === 'faculty'} 
                      onChange={() => setAddUserForm({ ...addUserForm, role: 'faculty' })}
                      className="sr-only" 
                    />
                    <Briefcase className="h-4 w-4" />
                    <span>Faculty</span>
                  </label>
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Juan"
                    value={addUserForm.firstName}
                    onChange={(e) => setAddUserForm({ ...addUserForm, firstName: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Middle Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Santos"
                    value={addUserForm.middleName}
                    onChange={(e) => setAddUserForm({ ...addUserForm, middleName: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dela Cruz"
                    value={addUserForm.lastName}
                    onChange={(e) => setAddUserForm({ ...addUserForm, lastName: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder={addUserForm.role === 'student' ? 'juan.delacruz@student.sage.edu' : 'j.delacruz@sage.edu.ph'}
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500 font-mono"
                />
              </div>

              {/* Student Specific Section Assignment */}
              {addUserForm.role === 'student' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Year Level</label>
                    <select
                      value={addUserForm.yearLevel}
                      onChange={(e) => setAddUserForm({ ...addUserForm, yearLevel: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Block Section *</label>
                    <select
                      value={addUserForm.sectionId}
                      onChange={(e) => setAddUserForm({ ...addUserForm, sectionId: e.target.value })}
                      required
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                    >
                      <option value="">Select Section / Status</option>
                      <option value="irregular">Irregular (Unassigned Block)</option>
                      {dbSections.map(sec => (
                        <option key={sec.section_id} value={sec.section_id}>{sec.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ID Number Setup */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Official ID Number</label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-sage-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={addUserForm.autoGenerateId}
                      onChange={(e) => setAddUserForm({ ...addUserForm, autoGenerateId: e.target.checked })}
                      className="rounded text-sage-600 focus:ring-sage-500"
                    />
                    <span>Auto-generate official ID</span>
                  </label>
                </div>

                {!addUserForm.autoGenerateId && (
                  <input
                    type="text"
                    placeholder={addUserForm.role === 'student' ? '2026-00001' : 'FAC-2026-00001'}
                    value={addUserForm.userNumber}
                    onChange={(e) => setAddUserForm({ ...addUserForm, userNumber: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500 font-mono"
                  />
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-lg transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {addUserLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>{addUserLoading ? 'Creating Account...' : 'Register Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: BATCH CSV & EXCEL SPREADSHEET IMPORT MODAL                       */}
      {/* ========================================================================= */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Batch Roster Import (CSV & Excel)</h3>
                <p className="text-xs text-slate-500 mt-0.5">Bulk register department class lists and faculty rosters for {userDepartmentName}</p>
              </div>
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setParsedUsers([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              
              {/* Dropzone */}
              <div 
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer text-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 bg-sage-50 text-sage-600 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Click to upload spreadsheet or drag & drop</p>
                  <p className="text-xs text-slate-400 mt-0.5">Microsoft Excel (.xlsx, .xls) or Comma-Separated Values (.csv)</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                />
              </div>

              {/* Sample loader */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Need reference formatting?</span>
                <button 
                  onClick={() => {
                    setCsvText(sampleCSV);
                    handleParseCSV(sampleCSV);
                  }}
                  className="text-sage-600 font-semibold hover:text-sage-700 flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" /> Load Sample Data
                </button>
              </div>

              {/* Error / Success Banners */}
              {importError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-emerald-700">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{importSuccess}</span>
                </div>
              )}

              {/* Data Preview */}
              {parsedUsers.length > 0 && !isImporting && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Preview: {parsedUsers.length} Records to Register</span>
                    <span className="text-slate-500">Auto-scoped to {userDepartmentName}</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 sticky top-0 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500">
                        <tr>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3">Section</th>
                          <th className="py-2 px-3">ID Number</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedUsers.map((u, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                u.role === 'faculty' ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                              )}>
                                {u.role}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">{u.lastName}, {u.firstName}</td>
                            <td className="py-2 px-3 text-slate-500 font-mono">{u.email}</td>
                            <td className="py-2 px-3 text-slate-600">{u.section || '-'}</td>
                            <td className="py-2 px-3 text-slate-600 font-mono">{u.userNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress Indicator */}
              {isImporting && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center space-y-3">
                  <Loader2 className="h-6 w-6 text-sage-600 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">{importProgress}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  setParsedUsers([]);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsedUsers.length === 0 || isImporting}
                onClick={executeSaveImport}
                className="px-5 py-2 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-lg transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                <span>Confirm & Import Roster</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT MEMBER (Section Assignment & Status)                         */}
      {/* ========================================================================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Member Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingUser.lastName}, {editingUser.firstName} ({editingUser.userNumber})</p>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {editError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {editingUser.isAdminLocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800">
                  <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Central IT Override Active</span>
                    <span>This account has an administrative lock placed by System Administrators. Status changes are restricted.</span>
                  </div>
                </div>
              )}

              {editingUser.role === 'student' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Year Level</label>
                    <select
                      value={editForm.yearLevel}
                      onChange={(e) => setEditForm({ ...editForm, yearLevel: e.target.value })}
                      disabled={editingUser.isAdminLocked}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Section</label>
                    <select
                      value={editForm.sectionId}
                      onChange={(e) => setEditForm({ ...editForm, sectionId: e.target.value })}
                      disabled={editingUser.isAdminLocked}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                    >
                      <option value="">Irregular / Unassigned</option>
                      {dbSections.map(sec => (
                        <option key={sec.section_id} value={sec.section_id}>{sec.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  disabled={editingUser.isAdminLocked}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading || editingUser.isAdminLocked}
                  className="px-5 py-2 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-lg transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER 4: QUICK PROFILE DETAILS DRAWER                                    */}
      {/* ========================================================================= */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Member Overview</h3>
              <button 
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 shadow-xs",
                  selectedUser.role === 'faculty' ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-sage-50 text-sage-700 border border-sage-200"
                )}>
                  {selectedUser.firstName.charAt(0)}{selectedUser.lastName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {selectedUser.lastName}, {selectedUser.firstName} {selectedUser.middleName}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedUser.email}</p>
                </div>
              </div>

              <div className="space-y-2.5 bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">ID Number:</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedUser.userNumber}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Role:</span>
                  <span className="font-semibold text-slate-800 uppercase">{selectedUser.role}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Department:</span>
                  <span className="font-semibold text-slate-800">{selectedUser.department}</span>
                </div>
                {selectedUser.role === 'student' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500 font-medium">Section:</span>
                      <span className="font-semibold text-slate-800">{selectedUser.section}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500 font-medium">Year Level:</span>
                      <span className="font-semibold text-slate-800">{selectedUser.yearLevel}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 font-medium">Account Status:</span>
                  <span className={cn(
                    "font-bold uppercase",
                    selectedUser.isAdminLocked ? "text-rose-600" : selectedUser.status === 'active' ? "text-emerald-600" : "text-slate-500"
                  )}>
                    {selectedUser.isAdminLocked ? 'Central IT Lock' : selectedUser.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

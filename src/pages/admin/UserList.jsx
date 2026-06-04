import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, Edit2, Power, CheckCircle, AlertCircle, Upload, X, Check, FileSpreadsheet, MoreVertical, Archive, RotateCcw, FileText, Eye, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

// Custom styled premium checkbox matching SAGE design language
const CustomCheckbox = ({ checked, onChange }) => {
  return (
    <label className="relative flex items-center justify-center cursor-pointer select-none">
      <input 
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div className={cn(
        "w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 shadow-xs",
        checked 
          ? "bg-sage-600 border-sage-600 text-white scale-100 shadow-xs" 
          : "bg-white border-slate-300 hover:border-sage-400 hover:shadow-xs"
      )}>
        {checked && <Check className="h-3.5 w-3.5 text-white stroke-[2.5]" />}
      </div>
    </label>
  );
};

// Helper to style activity logs with status border stripes
const getLogBorderColor = (action) => {
  const act = action?.toLowerCase() || '';
  if (act.includes('creation') || act.includes('restoration') || act.includes('restore')) {
    return 'border-l-4 border-emerald-500 bg-emerald-50/5';
  }
  if (act.includes('archival') || act.includes('archive') || act.includes('delete')) {
    return 'border-l-4 border-rose-500 bg-rose-50/5';
  }
  if (act.includes('status') || act.includes('change') || act.includes('toggle')) {
    return 'border-l-4 border-blue-500 bg-blue-50/5';
  }
  if (act.includes('import') || act.includes('batch')) {
    return 'border-l-4 border-indigo-500 bg-indigo-50/5';
  }
  return 'border-l-4 border-sage-500 bg-sage-50/5';
};

export default function UserList() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  const activeFilterCount = [roleFilter, deptFilter, programFilter, yearFilter, sectionFilter].filter(Boolean).length;

  const clearFilters = () => {
    setRoleFilter('');
    setDeptFilter('');
    setProgramFilter('');
    setYearFilter('');
    setSectionFilter('');
    setCurrentPage(1);
  };

  // Batch CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedUsers, setParsedUsers] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const fileInputRef = React.useRef(null);

  const [departments, setDepartments] = useState([]);
  const [dbSections, setDbSections] = useState([]);

  // Overhaul custom states
  const [showArchived, setShowArchived] = useState(false);
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);

  // Quick profile drawer state
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [profileDetails, setProfileDetails] = useState({ enrollments: [], classes: [], grades: [] });
  const [profileLoading, setProfileLoading] = useState(false);

  // User logs modal state
  const [activeLogsUser, setActiveLogsUser] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const sampleCSV = `Smith,Jane,A.,jane.smith@student.sage.edu,student,College of Computer Studies,Bachelor of Science in Information Technology,BSIT-1A,1st Year,2026-00005
Cruz,Patricia,N.,p.cruz@sage.edu.ph,dean,College of Computer Studies,,,,DN-2026-00002
Rivera,Amanda,Santos,a.rivera@sage.edu.ph,faculty,College of Computer Studies,Bachelor of Science in Information Technology,,,FAC-2026-00003`;

  // Load users, departments and sections from Supabase
  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*, departments(name), sections(name)')
        .order('last_name', { ascending: true });
        
      if (error) throw error;
      
      const mappedUsers = data.map(u => ({
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        middleName: u.middle_name,
        email: u.email,
        role: u.role,
        department: u.departments?.name || '',
        program: '', // Legacy mock data
        yearLevel: u.year_level || '',
        section: u.sections?.name || '',
        status: u.status || 'active',
        userNumber: u.user_number || ''
      }));
      setUsers(mappedUsers);

      const { data: depts } = await supabase.from('departments').select('*');
      if (depts) setDepartments(depts);

      const { data: secs } = await supabase.from('sections').select('*');
      if (secs) setDbSections(secs.map(s => ({
        id: s.section_id,
        name: s.name,
        department: depts?.find(d => d.department_id === s.department_id)?.name || ''
      })));

    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, []);

  // Dropdown event listener to close active menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeDropdownId && !e.target.closest('.dropdown-trigger') && !e.target.closest('.dropdown-menu')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownId]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.userNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
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
    const matchesSection = sectionFilter ? user.section === sectionFilter : true;
    const matchesStatus = showArchived ? user.status === 'archived' : user.status !== 'archived';
    
    return matchesSearch && matchesRole && matchesDept && matchesProgram && matchesYear && matchesSection && matchesStatus;
  });

  // Toggle User Active/Inactive Status (Disable)
  const handleToggleStatus = async (userId) => {
    try {
      const userToToggle = users.find(u => u.id === userId);
      if (!userToToggle) return;

      const nextStatus = userToToggle.status === 'active' ? 'inactive' : 'active';
      
      const { error } = await supabase
        .from('users')
        .update({ status: nextStatus })
        .eq('user_id', userId);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === userId ? { ...u, status: nextStatus } : u));
      setActiveDropdownId(null);

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'User Status Change',
        `Set user account for ${userToToggle.lastName}, ${userToToggle.firstName} (${userToToggle.email}) to "${nextStatus}".`,
        actorName
      );
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert('Error updating status: ' + err.message);
    }
  };

  // Trigger Custom Confirmation Modals for single user actions
  const triggerToggleStatusConfirm = (userId) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;
    
    const isDisabling = targetUser.status === 'active';
    const actionVerb = isDisabling ? 'disable' : 'enable';
    
    setConfirmModalConfig({
      title: isDisabling ? 'Disable User Account' : 'Enable User Account',
      message: (
        <span>
          Are you sure you want to {actionVerb} the account for{' '}
          <strong className="text-slate-800 font-semibold">{targetUser.lastName}, {targetUser.firstName}</strong> ({targetUser.email})?{' '}
          {isDisabling ? 'They will be temporarily locked out of the system.' : 'They will regain access to their portal.'}
        </span>
      ),
      confirmText: isDisabling ? 'Disable Account' : 'Enable Account',
      confirmBg: isDisabling ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500' : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      icon: <Power className={`h-6 w-6 ${isDisabling ? 'text-rose-600' : 'text-emerald-600'}`} />,
      iconBg: isDisabling ? 'bg-rose-50' : 'bg-emerald-50',
      onConfirm: () => handleToggleStatus(userId)
    });
  };

  const triggerArchiveUserConfirm = (userId) => {
    const userToArchive = users.find(u => u.id === userId);
    if (!userToArchive) return;
    
    setConfirmModalConfig({
      title: 'Archive User Account',
      message: (
        <span>
          Are you sure you want to archive the account for{' '}
          <strong className="text-slate-800 font-semibold">{userToArchive.lastName}, {userToArchive.firstName}</strong> ({userToArchive.email})?{' '}
          They will no longer be able to log in, but their historical data will be preserved.
        </span>
      ),
      confirmText: 'Archive Account',
      confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
      icon: <Archive className="h-6 w-6 text-rose-600" />,
      iconBg: 'bg-rose-50',
      onConfirm: () => handleArchiveUser(userId)
    });
  };

  const triggerRestoreUserConfirm = (userId) => {
    const userToRestore = users.find(u => u.id === userId);
    if (!userToRestore) return;
    
    setConfirmModalConfig({
      title: 'Restore User Account',
      message: (
        <span>
          Are you sure you want to restore the account for{' '}
          <strong className="text-slate-800 font-semibold">{userToRestore.lastName}, {userToRestore.firstName}</strong> ({userToRestore.email}) to active status?
        </span>
      ),
      confirmText: 'Restore Account',
      confirmBg: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      icon: <RotateCcw className="h-6 w-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      onConfirm: () => handleRestoreUser(userId)
    });
  };

  const triggerEditUserConfirm = (userObj) => {
    setConfirmModalConfig({
      title: 'Edit User Details',
      message: (
        <span>
          Are you sure you want to edit the details for{' '}
          <strong className="text-slate-800 font-semibold">{userObj.lastName}, {userObj.firstName}</strong> ({userObj.email})?{' '}
          You will be redirected to the user edit form.
        </span>
      ),
      confirmText: 'Proceed to Edit',
      confirmBg: 'bg-sage-600 hover:bg-sage-700 focus:ring-sage-500',
      icon: <Edit2 className="h-6 w-6 text-sage-600" />,
      iconBg: 'bg-sage-50',
      onConfirm: () => {
        setActiveDropdownId(null);
        navigate(`/admin/userform?id=${userObj.id}`);
      }
    });
  };

  // Archive a user (soft-delete)
  const handleArchiveUser = async (userId) => {
    try {
      const userToArchive = users.find(u => u.id === userId);
      if (!userToArchive) return;

      const { error } = await supabase
        .from('users')
        .update({ status: 'archived' })
        .eq('user_id', userId);

      if (error) throw error;

      setUsers(users.map(u => u.id === userId ? { ...u, status: 'archived' } : u));
      setActiveDropdownId(null);

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'User Archival',
        `Archived ${userToArchive.role} account for ${userToArchive.lastName}, ${userToArchive.firstName} (${userToArchive.email}).`,
        actorName
      );
    } catch (err) {
      console.error('Failed to archive user:', err);
      alert('Error archiving user: ' + err.message);
    }
  };

  // Restore an archived user
  const handleRestoreUser = async (userId) => {
    const userToRestore = users.find(u => u.id === userId);
    if (!userToRestore) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'active' })
        .eq('user_id', userId);

      if (error) throw error;

      setUsers(users.map(u => u.id === userId ? { ...u, status: 'active' } : u));
      setActiveDropdownId(null);

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'User Restoration',
        `Restored ${userToRestore.role} account for ${userToRestore.lastName}, ${userToRestore.firstName} (${userToRestore.email}) to active status.`,
        actorName
      );
    } catch (err) {
      console.error('Failed to restore user:', err);
      alert('Error restoring user: ' + err.message);
    }
  };

  // Handle Row Checkbox Selection
  const handleSelectRow = (userId) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Handle Master Header Checkbox
  const handleSelectAll = (filteredList) => {
    const allFilteredIds = filteredList.map(u => u.id);
    const allSelected = allFilteredIds.every(id => selectedUserIds.has(id));

    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Bulk Archive selected users
  const handleBulkArchive = async (filteredList) => {
    const selectedList = filteredList.filter(u => selectedUserIds.has(u.id));
    if (selectedList.length === 0) return;

    if (confirm(`Are you sure you want to archive all ${selectedList.length} selected users?`)) {
      try {
        const idsArray = selectedList.map(u => u.id);
        const { error } = await supabase
          .from('users')
          .update({ status: 'archived' })
          .in('user_id', idsArray);

        if (error) throw error;

        setUsers(users.map(u => idsArray.includes(u.id) ? { ...u, status: 'archived' } : u));
        setSelectedUserIds(new Set());

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'Batch User Archival',
          `Archived ${selectedList.length} user accounts in bulk.`,
          actorName
        );
      } catch (err) {
        console.error('Bulk archive failed:', err);
        alert('Error performing bulk archive: ' + err.message);
      }
    }
  };

  // Bulk Status Toggle (Active/Inactive)
  const handleBulkToggleStatus = async (filteredList, targetStatus) => {
    const selectedList = filteredList.filter(u => selectedUserIds.has(u.id));
    if (selectedList.length === 0) return;

    try {
      const idsArray = selectedList.map(u => u.id);
      const { error } = await supabase
        .from('users')
        .update({ status: targetStatus })
        .in('user_id', idsArray);

      if (error) throw error;

      setUsers(users.map(u => idsArray.includes(u.id) ? { ...u, status: targetStatus } : u));
      setSelectedUserIds(new Set());

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Batch User Status Change',
        `Set status to "${targetStatus}" for ${selectedList.length} user accounts in bulk.`,
        actorName
      );
    } catch (err) {
      console.error('Bulk status change failed:', err);
      alert('Error performing bulk status change: ' + err.message);
    }
  };

  // Fetch detailed data for Profile slide-out drawer
  const fetchProfileDetails = async (targetUser) => {
    setSelectedUserProfile(targetUser);
    setProfileLoading(true);
    setProfileDetails({ enrollments: [], classes: [], grades: [] });

    try {
      if (targetUser.role === 'student') {
        const { data: enrollData } = await supabase
          .from('enrollments')
          .select('enrollment_id, subjects(code, name, units), sections(name)')
          .eq('student_id', targetUser.id);
        
        const { data: gradeData } = await supabase
          .from('posted_grades')
          .select('class_record_id, computed_grade, effective_grade, remarks, posted_at, class_records(subjects(code, name))')
          .eq('student_id', targetUser.id);

        setProfileDetails({
          enrollments: enrollData || [],
          classes: [],
          grades: gradeData || []
        });
      } else {
        const { data: classData } = await supabase
          .from('class_records')
          .select('class_record_id, school_year, semester, subjects(code, name), sections(name)')
          .eq('faculty_id', targetUser.id)
          .eq('status', 'active');

        setProfileDetails({
          enrollments: [],
          classes: classData || [],
          grades: []
        });
      }
    } catch (err) {
      console.error('Error fetching profile details:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Fetch user logs
  const fetchUserLogs = async (targetUser) => {
    setActiveLogsUser(targetUser);
    setLogsLoading(true);
    setUserLogs([]);

    try {
      const actorName = `${targetUser.firstName} ${targetUser.lastName}`;
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .or(`actor.eq."${actorName}",actor.eq."${targetUser.email}"`)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setUserLogs(data || []);
    } catch (err) {
      console.error('Failed to load user logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Export currently filtered list of users to Excel using SheetJS
  const handleExportUsers = () => {
    try {
      const dataToExport = filteredUsers.map((u, idx) => ({
        'No.': idx + 1,
        'ID Number': u.userNumber,
        'Last Name': u.lastName,
        'First Name': u.firstName,
        'Middle Name': u.middleName || '',
        'Email Address': u.email,
        'Role': u.role.toUpperCase(),
        'College / School': u.department,
        'Year Level': u.role === 'student' ? (u.yearLevel || '1st Year') : '',
        'Section': u.role === 'student' ? (u.section || '') : '',
        'Status': u.status.toUpperCase()
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users List');
      
      const colWidths = [
        { wch: 6 },  // No
        { wch: 16 }, // ID Number
        { wch: 15 }, // Last Name
        { wch: 15 }, // First Name
        { wch: 15 }, // Middle Name
        { wch: 25 }, // Email
        { wch: 10 }, // Role
        { wch: 30 }, // College
        { wch: 12 }, // Year Level
        { wch: 10 }, // Section
        { wch: 10 }  // Status
      ];
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, `SAGE_Users_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);

      const actorName = resolveActorName(profile, user);
      logActivity('User Export', `Exported ${filteredUsers.length} user records to Excel.`, actorName);
    } catch (err) {
      console.error('Failed to export users:', err);
      alert('Error exporting users: ' + err.message);
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

    // Track sequential role counts dynamically for auto-generation
    const roleCounts = {
      admin: users.filter(u => u.role === 'admin').length,
      dean: users.filter(u => u.role === 'dean').length,
      faculty: users.filter(u => u.role === 'faculty').length,
      student: users.filter(u => u.role === 'student').length,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 6) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: LastName,FirstName,MiddleName,Email,Role,College,Program[,Section,YearLevel,IDNumber]`);
        hasError = true;
        break;
      }

      let [lastName, firstName, middleName, email, role, department, program, section, yearLevel, userNumber] = parts.map(p => p?.trim() || '');

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
        userNumber = '';
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
          const matchesDigit = yearLevel.charAt(0); // '1', '2', '3', '4'
          const matchedSec = dbSections.find(
            s => s.department === department && 
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

      const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
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

      const validRoles = ['admin', 'dean', 'faculty', 'student'];
      if (!validRoles.includes(role.toLowerCase())) {
        setImportError(`Row ${i + 1} has an invalid role: "${role}". Valid values: admin, dean, faculty, student`);
        hasError = true;
        break;
      }

      // Handle user number generation or validation
      let finalUserNumber = userNumber;
      if (!finalUserNumber) {
        const prefix = role.toLowerCase() === 'student' ? '' : role.toLowerCase() === 'admin' ? 'ADM-' : role.toLowerCase() === 'faculty' ? 'FAC-' : 'DN-';
        const year = new Date().getFullYear();
        let generated = '';
        do {
          roleCounts[role.toLowerCase()] = (roleCounts[role.toLowerCase()] || 0) + 1;
          const nextSeq = String(roleCounts[role.toLowerCase()]).padStart(5, '0');
          generated = `${prefix}${year}-${nextSeq}`;
        } while (users.some(u => u.userNumber === generated) || list.some(u => u.userNumber === generated));
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
          const employeeIdRegex = /^(ADM|FAC|DN)-\d{4}-\d{5}$/;
          if (!employeeIdRegex.test(finalUserNumber)) {
            setImportError(`Row ${i + 1} has an invalid Employee ID format: "${finalUserNumber}". Must be ADM-YYYY-XXXXX, FAC-YYYY-XXXXX, or DN-YYYY-XXXXX.`);
            hasError = true;
            break;
          }
        }
        if (users.some(u => u.userNumber === finalUserNumber) || list.some(u => u.userNumber === finalUserNumber)) {
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

        const deptObj = departments.find(d => d.name === u.department);
        if (!deptObj) {
          console.warn(`Department "${u.department}" not found for user ${u.email}`);
          failCount++;
          continue;
        }

        const secObj = dbSections.find(s => s.name === u.section);

        const existingUserObj = users.find(oldU => oldU.email.toLowerCase() === u.email.toLowerCase());

        if (existingUserObj) {
          // Reactivate/update existing archived user in the database directly
          const { error: updateErr } = await supabase
            .from('users')
            .update({
              status: 'active',
              first_name: u.firstName.trim(),
              last_name: u.lastName.trim(),
              middle_name: u.middleName.trim(),
              role: u.role,
              department_id: deptObj.department_id,
              year_level: u.role === 'student' ? u.yearLevel : null,
              section_id: u.role === 'student' ? (secObj?.id || null) : null,
              user_number: u.userNumber
            })
            .eq('user_id', existingUserObj.id);

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
              departmentId: deptObj.department_id,
              yearLevel: u.role === 'student' ? u.yearLevel : null,
              sectionId: u.role === 'student' ? (secObj?.id || null) : null,
              userNumber: u.userNumber
            }
          });

          if (invokeErr || data?.error) {
            console.error(`Failed to register ${u.email}:`, invokeErr || data?.error);
            failCount++;
          } else {
            // Client-side fallback update to ensure user_number is persisted in public.users
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
        'Batch User Import',
        `Batch CSV import completed: ${successCount} user(s) registered successfully, ${failCount} failed out of ${parsedUsers.length} total records.`,
        actorName
      );

      setImportSuccess(`Import completed! Successfully registered ${successCount} users. Failed: ${failCount}`);
      loadUsers();
      
      setTimeout(() => {
        setIsImportOpen(false);
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

  const handleSaveImport = () => {
    setShowConfirmModal(true);
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading user registry...</p>
        </div>
      </div>
    );
  }

  const availableSections = dbSections
    .filter(sec => !deptFilter || sec.department === deptFilter)
    .map(sec => sec.name);
  const uniqueSections = [...new Set(availableSections)].sort();

  const itemsPerPage = 20;
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const currentPageUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
        
        {/* Toolbar & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by name or email..." 
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Show Archived Users Only checkbox using CustomCheckbox */}
            <div className="flex items-center gap-2 select-none cursor-pointer">
              <CustomCheckbox 
                checked={showArchived}
                onChange={() => {
                  setShowArchived(!showArchived);
                  setSelectedUserIds(new Set());
                  setCurrentPage(1);
                }}
              />
              <span className="text-sm text-slate-655 font-semibold">Show Archived Users Only</span>
            </div>

            <div className="w-px h-5 bg-slate-200 hidden md:block" />

            {/* Bulk Select Mode Toggle Button */}
            <button
              onClick={() => {
                const nextMode = !isSelectionModeActive;
                setIsSelectionModeActive(nextMode);
                if (!nextMode) {
                  setSelectedUserIds(new Set());
                }
              }}
              className={cn(
                "px-4 py-2 text-sm font-medium border rounded-lg transition-all shadow-sm flex items-center gap-2",
                isSelectionModeActive
                  ? "border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                  : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-sage-350"
              )}
            >
              {isSelectionModeActive ? (
                <>
                  <X className="h-4 w-4" /> Cancel Selection
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> Bulk Select
                </>
              )}
            </button>

            {/* Export current list button */}
            <button
              onClick={handleExportUsers}
              className="px-4 py-2 text-sm font-medium border border-slate-200 hover:border-sage-350 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm flex items-center gap-2"
            >
              <Download className="h-4 w-4" /> Export current list
            </button>
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────────── */}
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

          {/* Role Filter */}
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Role</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="dean">Dean</option>
              <option value="faculty">Faculty</option>
              <option value="student">Student</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex flex-col gap-0.5 min-w-[180px] max-w-[240px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">College</span>
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setProgramFilter('');
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer truncate"
            >
              <option value="">All Colleges</option>
              {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                <option key={college} value={college}>{college}</option>
              ))}
            </select>
          </div>

          {/* Program Filter */}
          <div className="flex flex-col gap-0.5 min-w-[180px] max-w-[320px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Program</span>
            <select
              value={programFilter}
              onChange={(e) => {
                setProgramFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer truncate"
            >
              <option value="">All Programs</option>
              {Array.from(new Set(
                deptFilter ? (DYCI_ACADEMIC_PROGRAMS[deptFilter] || []) : Object.values(DYCI_ACADEMIC_PROGRAMS).flat()
              )).map(prog => (
                <option key={prog} value={prog}>{prog}</option>
              ))}
            </select>
          </div>

          {/* Year Level Filter */}
          <div className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year Level</span>
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
          </div>

          {/* Section Filter */}
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Section</span>
            <select
              value={sectionFilter}
              onChange={(e) => {
                setSectionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Sections</option>
              {uniqueSections.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
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
              {filteredUsers.length} / {users.filter(user => showArchived ? user.status === 'archived' : user.status !== 'archived').length} matches
            </span>
          </div>
        </div>

        {/* User Table Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {isSelectionModeActive && (
                    <th className="px-6 py-3 text-left w-10">
                      <CustomCheckbox
                        checked={currentPageUsers.length > 0 && currentPageUsers.every(u => selectedUserIds.has(u.id))}
                        onChange={() => handleSelectAll(currentPageUsers)}
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">College / Program</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {currentPageUsers.length > 0 ? (
                  currentPageUsers.map((user) => (
                    <tr key={user.id} className={cn(
                      "hover:bg-slate-50/40 transition-colors",
                      selectedUserIds.has(user.id) && "bg-sage-50/20"
                    )}>
                      {isSelectionModeActive && (
                        <td className="px-6 py-4 whitespace-nowrap w-10">
                          <CustomCheckbox
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => handleSelectRow(user.id)}
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => fetchProfileDetails(user)}
                          className="font-bold text-slate-900 font-display text-sm hover:text-sage-600 hover:underline text-left block"
                        >
                          {user.lastName}, {user.firstName} {user.middleName && user.middleName[0] + '.'}
                        </button>
                        {user.userNumber && (
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {user.userNumber}
                          </div>
                        )}
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === user.id ? null : user.id);
                            }}
                            className="dropdown-trigger p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            aria-label="Actions"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>

                          {activeDropdownId === user.id && (
                            <div className="dropdown-menu absolute right-6 mt-1 w-48 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-40 text-left">
                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  fetchProfileDetails(user);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-400" />
                                View Profile
                              </button>
                              
                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  fetchUserLogs(user);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                View Activity Logs
                              </button>

                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  triggerEditUserConfirm(user);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                                Edit User Details
                              </button>

                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  triggerToggleStatusConfirm(user.id);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Power className={`h-3.5 w-3.5 ${user.status === 'active' ? 'text-rose-500' : 'text-emerald-500'}`} />
                                {user.status === 'active' ? 'Disable Account' : 'Enable Account'}
                              </button>

                              {user.status !== 'archived' ? (
                                <button
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    triggerArchiveUserConfirm(user.id);
                                  }}
                                  disabled={user.role === 'admin'}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-rose-650 hover:bg-rose-50/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Archive className="h-3.5 w-3.5 text-rose-500" />
                                  Archive Account
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    triggerRestoreUserConfirm(user.id);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-650 hover:bg-emerald-50/50 flex items-center gap-2"
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
                    <td colSpan={isSelectionModeActive ? 7 : 6} className="px-6 py-10 text-center text-slate-400 text-sm">
                      No users match your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Premium Pagination Footer */}
          {totalPages > 1 && (
            <div className="bg-slate-50/75 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Showing <strong className="text-slate-800 font-semibold">{Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)}</strong> to <strong className="text-slate-800 font-semibold">{Math.min(filteredUsers.length, currentPage * itemsPerPage)}</strong> of <strong className="text-slate-800 font-semibold">{filteredUsers.length}</strong> users
              </div>
              <div className="flex items-center gap-1.5">
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
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === 1
                      ? "text-slate-305 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-205 bg-white hover:bg-slate-50"
                  )}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Render numbered buttons with window */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                  })
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

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center",
                    currentPage === totalPages
                      ? "text-slate-305 border-slate-100 bg-slate-50 cursor-not-allowed"
                      : "text-slate-600 border-slate-205 bg-white hover:bg-slate-50"
                  )}
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
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

              {importProgress && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-650 border-t-transparent flex-shrink-0"></div>
                  <span>{importProgress}</span>
                </div>
              )}

            <div className="flex flex-col gap-4">
              
              {/* Drag and Drop Upload Zone */}
              <div 
                onClick={() => !isImporting && fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isImporting) return;
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
                className={cn(
                  "border-2 border-dashed border-slate-200 rounded-xl p-6 text-center transition-all flex flex-col items-center justify-center gap-2 group relative",
                  isImporting ? "bg-slate-100 cursor-not-allowed" : "hover:border-sage-400 bg-slate-50/50 hover:bg-sage-50/20 cursor-pointer"
                )}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  disabled={isImporting}
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
                    Or Paste Raw Data (Format: <code className="font-mono text-sage-700 bg-sage-50 px-1 py-0.5 rounded border border-sage-200">LastName,FirstName,MiddleName,Email,Role,College,Program,Section,YearLevel[,IDNumber]</code>)
                  </label>
                  <button
                    disabled={isImporting}
                    onClick={handleLoadSample}
                    className="px-2.5 py-1 text-[11px] font-bold border border-sage-200 text-sage-700 hover:bg-sage-50 rounded disabled:opacity-50"
                  >
                    Load Sample Template
                  </button>
                </div>

                <textarea
                  disabled={isImporting}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setParsedUsers([]);
                  }}
                  onBlur={() => handleParseCSV()}
                  rows="6"
                  placeholder="Smith,Jane,A.,jane.smith@student.sage.edu,student,College of Computer Studies,Bachelor of Science in Information Technology,BSIT-1A,1st Year,2026-00001"
                  className="block w-full p-3 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                />

              <div className="text-right">
                <button
                  disabled={isImporting}
                  onClick={() => handleParseCSV()}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
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
                disabled={isImporting}
                onClick={() => {
                  setIsImportOpen(false);
                  setCsvText('');
                  setParsedUsers([]);
                  setImportError('');
                  setImportSuccess('');
                  setImportProgress('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveImport}
                disabled={parsedUsers.length === 0 || isImporting}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Check className="h-4 w-4" /> {isImporting ? 'Saving...' : 'Save Imported Users'}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-slate-200 max-w-sm w-full shadow-lg p-6 space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-display">Confirm Batch Registration</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to batch register these <strong className="text-slate-800 font-mono">{parsedUsers.length}</strong> users in the system?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  executeSaveImport();
                }}
                className="flex-1 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out User Profile Drawer */}
      {selectedUserProfile && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedUserProfile(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />

          <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-bold font-display text-slate-955">
                    {selectedUserProfile.lastName}, {selectedUserProfile.firstName} {selectedUserProfile.middleName}
                  </h3>
                  {getRoleBadge(selectedUserProfile.role)}
                </div>
                <div className="text-xs font-mono text-slate-500">
                  {selectedUserProfile.userNumber && `ID: ${selectedUserProfile.userNumber} • `} {selectedUserProfile.email}
                </div>
                <div className="text-xs text-slate-505 font-medium">
                  Status: <span className={selectedUserProfile.status === 'active' ? 'text-emerald-600 font-bold' : selectedUserProfile.status === 'archived' ? 'text-slate-500 font-bold' : 'text-rose-600 font-bold'}>
                    {selectedUserProfile.status.toUpperCase()}
                  </span>
                  {selectedUserProfile.department && ` • College: ${selectedUserProfile.department}`}
                </div>
              </div>
              <button 
                onClick={() => setSelectedUserProfile(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-950 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {profileLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sage-600"></div>
                  <p className="text-xs text-slate-500 font-medium font-sans">Loading relation records...</p>
                </div>
              ) : (
                <>
                  {selectedUserProfile.role === 'student' ? (
                    <div className="space-y-6">
                      {/* Enrolled Subjects */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display text-left">Enrolled Subjects</h4>
                        {profileDetails.enrollments.length === 0 ? (
                          <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-left">No active subject enrollments found.</p>
                        ) : (
                          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Code</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Subject Name</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500 text-center">Units</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Section</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-100 font-medium">
                                {profileDetails.enrollments.map((en, index) => (
                                  <tr key={en.enrollment_id || index} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 font-mono text-slate-900 font-bold">{en.subjects?.code}</td>
                                    <td className="px-4 py-2.5 text-slate-650">{en.subjects?.name}</td>
                                    <td className="px-4 py-2.5 text-center text-slate-600 font-mono">{en.subjects?.units}</td>
                                    <td className="px-4 py-2.5 text-slate-600 font-mono font-bold">{en.sections?.name}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Academic Grades */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display text-left">Academic Grades</h4>
                        {profileDetails.grades.length === 0 ? (
                          <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-left">No academic grades have been posted.</p>
                        ) : (
                          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Code</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Subject Name</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500 text-center">Term Rating</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500 text-center">Final Grade</th>
                                  <th className="px-4 py-2.5 font-bold text-slate-500">Remarks</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-100 font-medium">
                                {profileDetails.grades.map((gr, index) => (
                                  <tr key={gr.class_record_id || index} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 font-mono text-slate-900 font-bold">{gr.class_records?.subjects?.code}</td>
                                    <td className="px-4 py-2.5 text-slate-650">{gr.class_records?.subjects?.name}</td>
                                    <td className="px-4 py-2.5 text-center text-slate-650 font-mono">{gr.computed_grade}</td>
                                    <td className="px-4 py-2.5 text-center text-slate-900 font-mono font-bold">{gr.effective_grade}</td>
                                    <td className="px-4 py-2.5 text-left">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        gr.remarks?.toLowerCase() === 'passed' 
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {gr.remarks || 'PASSED'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Faculty, Dean, Admin */
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display text-left">Assigned Class Records</h4>
                      {profileDetails.classes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-left">No active classes assigned to this account.</p>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                          <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-2.5 font-bold text-slate-500">School Year / Term</th>
                                <th className="px-4 py-2.5 font-bold text-slate-500">Subject</th>
                                <th className="px-4 py-2.5 font-bold text-slate-500">Section</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100 font-medium">
                              {profileDetails.classes.map((cls, index) => (
                                <tr key={cls.class_record_id || index} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2.5 text-slate-950 text-left">
                                    <div className="font-bold">{cls.school_year}</div>
                                    <div className="text-[10px] text-slate-405 font-mono capitalize">{cls.semester}</div>
                                  </td>
                                  <td className="px-4 py-2.5 text-left">
                                    <div className="font-mono text-slate-900 font-bold">{cls.subjects?.code}</div>
                                    <div className="text-slate-600 font-sans text-xs">{cls.subjects?.name}</div>
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-700 font-mono font-bold text-left">{cls.sections?.name}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedUserProfile(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Activity Logs Modal */}
      {activeLogsUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-sage-200 shadow-2xl flex flex-col overflow-hidden max-h-[85vh] max-w-2xl w-full animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-sage-50/60 to-white/40 p-6 border-b border-sage-100 flex items-center justify-between">
              <div className="space-y-1 text-left">
                <h3 className="text-lg font-bold font-display text-sage-900 flex items-center gap-2.5">
                  <FileText className="h-5.5 w-5.5 text-sage-600" /> User Activity History
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Showing logs for <span className="text-slate-800 font-bold">{activeLogsUser.firstName} {activeLogsUser.lastName}</span> ({activeLogsUser.email})
                </p>
              </div>
              <button 
                onClick={() => setActiveLogsUser(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/20">
              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sage-600"></div>
                  <p className="text-xs text-slate-500 font-medium font-sans">Loading audit history...</p>
                </div>
              ) : userLogs.length === 0 ? (
                <div className="text-center py-16 space-y-2">
                  <AlertCircle className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">No activity records found for this user.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {userLogs.map((log) => (
                    <div 
                      key={log.log_id} 
                      className={cn(
                        "bg-white rounded-xl p-4 shadow-xs space-y-3 hover:border-slate-350 transition-colors text-left border border-slate-150",
                        getLogBorderColor(log.action)
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-sage-50 text-sage-850 border border-sage-150 uppercase font-mono tracking-wider">
                          {log.action}
                        </span>
                        <span className="text-[10px] font-mono text-slate-450 font-medium">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium">
                        {log.message}
                      </p>
                      <div className="text-[10px] text-slate-455 flex items-center gap-1 font-medium font-sans">
                        <span>Actor ID:</span>
                        <span className="font-mono text-slate-700 font-semibold">{log.actor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button 
                onClick={() => setActiveLogsUser(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
              >
                Close History
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Batch Actions Bar */}
      {selectedUserIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md text-slate-800 px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-6 z-50 border border-sage-200/80 animate-in slide-in-from-bottom-4 duration-300">
          <div className="text-sm font-semibold flex items-center">
            <span className="font-mono text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-lg mr-2 font-bold">{selectedUserIds.size}</span>
            {selectedUserIds.size === 1 ? 'user selected' : 'users selected'}
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkToggleStatus(filteredUsers, 'active')}
              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Bulk Enable
            </button>
            <button
              onClick={() => handleBulkToggleStatus(filteredUsers, 'inactive')}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Power className="h-3.5 w-3.5" />
              Bulk Disable
            </button>
            {!showArchived ? (
              <button
                onClick={() => handleBulkArchive(filteredUsers)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Archive className="h-3.5 w-3.5" />
                Bulk Archive
              </button>
            ) : (
              <button
                onClick={async () => {
                  const selectedList = filteredUsers.filter(u => selectedUserIds.has(u.id));
                  if (selectedList.length === 0) return;
                  
                  // Setup Bulk Restore with Confirmation Modal
                  setConfirmModalConfig({
                    title: 'Bulk Restore Accounts',
                    message: `Are you sure you want to restore the selected ${selectedList.length} user accounts to active status?`,
                    confirmText: 'Restore Accounts',
                    confirmBg: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
                    icon: <RotateCcw className="h-6 w-6 text-emerald-600" />,
                    iconBg: 'bg-emerald-50',
                    onConfirm: async () => {
                      try {
                        const idsArray = selectedList.map(u => u.id);
                        const { error } = await supabase
                          .from('users')
                          .update({ status: 'active' })
                          .in('user_id', idsArray);
                        if (error) throw error;
                        setUsers(users.map(u => idsArray.includes(u.id) ? { ...u, status: 'active' } : u));
                        setSelectedUserIds(new Set());
                        const actorName = resolveActorName(profile, user);
                        await logActivity(
                          'Batch User Restoration',
                          `Restored ${selectedList.length} user accounts in bulk.`,
                          actorName
                        );
                      } catch (err) {
                        console.error('Bulk restore failed:', err);
                        alert('Error performing bulk restore: ' + err.message);
                      }
                    }
                  });
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Bulk Restore
              </button>
            )}
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <button
            onClick={() => setSelectedUserIds(new Set())}
            className="text-xs font-semibold text-slate-450 hover:text-slate-700 transition-colors"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Dynamic Action Confirmation Modal */}
      {confirmModalConfig && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-sage-200 shadow-2xl p-6 space-y-5 text-center animate-in zoom-in-95 duration-200 max-w-sm w-full">
            <div className={`mx-auto w-14 h-14 rounded-full ${confirmModalConfig.iconBg} flex items-center justify-center shadow-xs animate-pulse duration-[2000ms]`}>
              {confirmModalConfig.icon}
            </div>
            <div className="space-y-1.5 text-center">
              <h3 className="text-base font-bold text-slate-900 font-display">{confirmModalConfig.title}</h3>
              <div className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
                {confirmModalConfig.message}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalConfig(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const onConfirm = confirmModalConfig.onConfirm;
                  setConfirmModalConfig(null);
                  onConfirm();
                }}
                className={`flex-1 px-4 py-2 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm ${confirmModalConfig.confirmBg}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

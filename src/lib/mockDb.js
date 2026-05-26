// persistent mock database helper for SAGE using localStorage

const STORAGE_KEYS = {
  USERS: 'sage_users',
  CLASSROOMS: 'sage_classrooms',
  EVAL_TEMPLATES: 'sage_eval_templates',
  EVAL_WINDOWS: 'sage_eval_windows',
  LOGS: 'sage_logs',
  POSTED_GRADES: 'sage_posted_grades'
};

// Seed Data
const defaultUsers = [
  { id: 'usr-001', lastName: 'System', firstName: 'Admin', middleName: 'Control', email: 'admin@sage.edu.ph', role: 'admin', department: 'College of IT', status: 'active' },
  { id: 'usr-002', lastName: 'Valdes', firstName: 'Carlos', middleName: 'Mendoza', email: 'c.valdes@sage.edu.ph', role: 'dean', department: 'College of IT', status: 'active' },
  { id: 'usr-003', lastName: 'Rivera', firstName: 'Amanda', middleName: 'Santos', email: 'a.rivera@sage.edu.ph', role: 'faculty', department: 'College of IT', status: 'active' },
  { id: 'usr-004', lastName: 'Doe', firstName: 'John', middleName: 'Smith', email: 'j.doe@sage.edu.ph', role: 'faculty', department: 'College of CS', status: 'active' },
  { id: 'usr-005', lastName: 'Jenkins', firstName: 'Sarah', middleName: 'Lee', email: 's.jenkins@student.sage.edu', role: 'student', department: 'College of IT', status: 'active' },
  { id: 'usr-006', lastName: 'Smith', firstName: 'John', middleName: 'Davis', email: 'j.smith@student.sage.edu', role: 'student', department: 'College of IT', status: 'active' },
  { id: 'usr-007', lastName: 'Johnson', firstName: 'Mary', middleName: 'Cruz', email: 'm.johnson@student.sage.edu', role: 'student', department: 'College of CS', status: 'active' }
];

const defaultClassrooms = [
  {
    id: 'cls-001',
    subjectCode: 'IT101',
    subjectName: 'Introduction to Computing',
    section: 'BSIT-1A',
    facultyId: 'usr-003', // Prof. Amanda Rivera
    facultyName: 'Amanda Rivera',
    schedule: 'MWF 9:00AM - 10:30AM',
    room: 'Lab 1',
    enrolledCount: 45,
    status: 'active',
    semester: '2nd',
    schoolYear: '2025-2026'
  },
  {
    id: 'cls-002',
    subjectCode: 'IT201',
    subjectName: 'Data Structures and Algorithms',
    section: 'BSIT-2B',
    facultyId: 'usr-003', // Prof. Amanda Rivera
    facultyName: 'Amanda Rivera',
    schedule: 'TTh 1:00PM - 3:00PM',
    room: 'Lab 3',
    enrolledCount: 38,
    status: 'active',
    semester: '2nd',
    schoolYear: '2025-2026'
  },
  {
    id: 'cls-003',
    subjectCode: 'CS301',
    subjectName: 'Artificial Intelligence',
    section: 'BSCS-3A',
    facultyId: 'usr-003', // Prof. Amanda Rivera
    facultyName: 'Amanda Rivera',
    schedule: 'MWF 1:00PM - 2:30PM',
    room: 'Lec 5',
    enrolledCount: 42,
    status: 'active',
    semester: '2nd',
    schoolYear: '2025-2026'
  },
  {
    id: 'cls-004',
    subjectCode: 'IT401',
    subjectName: 'Capstone Project 1',
    section: 'BSIT-4A',
    facultyId: 'usr-003', // Prof. Amanda Rivera
    facultyName: 'Amanda Rivera',
    schedule: 'TTh 9:00AM - 12:00PM',
    room: 'Lab 2',
    enrolledCount: 25,
    status: 'active',
    semester: '2nd',
    schoolYear: '2025-2026'
  }
];

const defaultEvalTemplates = [
  {
    id: 'tmpl-001',
    title: 'AY 2025-2026 Semester 2 Faculty Evaluation',
    author: 'Admin System Control',
    createdDate: '2026-05-10T09:00:00Z',
    criteria: [
      { id: 'crit-1', label: 'Teaching Effectiveness', description: 'Explains complex topics clearly with relevant examples.', maxRating: 5 },
      { id: 'crit-2', label: 'Punctuality & Attendance', description: 'Starts class sessions on time and conducts them regularly.', maxRating: 5 },
      { id: 'crit-3', label: 'Fair Grading Assessment', description: 'Grades activities, projects, and exams objectively.', maxRating: 5 },
      { id: 'crit-4', label: 'Communication & Engagement', description: 'Addresses student inquiries patiently and professionally.', maxRating: 5 }
    ]
  }
];

const defaultEvalWindows = [
  {
    id: 'ew-001',
    templateId: 'tmpl-001',
    templateTitle: 'AY 2025-2026 Semester 2 Faculty Evaluation',
    facultyId: 'usr-003',
    facultyName: 'Amanda Rivera',
    section: 'BSIT-1A',
    openAt: '2026-05-15T08:00',
    closeAt: '2026-06-30T17:00',
    isClosed: false,
    responsesCount: 18,
    totalStudents: 45
  },
  {
    id: 'ew-002',
    templateId: 'tmpl-001',
    templateTitle: 'AY 2025-2026 Semester 2 Faculty Evaluation',
    facultyId: 'usr-003',
    facultyName: 'Amanda Rivera',
    section: 'BSIT-2B',
    openAt: '2026-05-20T08:00',
    closeAt: '2026-06-30T17:00',
    isClosed: false,
    responsesCount: 12,
    totalStudents: 38
  }
];

const defaultPostedGrades = [
  { id: 'grd-001', classRecordId: 'cls-001', subjectCode: 'IT101', section: 'BSIT-1A', studentId: 'usr-005', studentName: 'Sarah Jenkins', gradePeriod: 'prelim', computedGrade: 2.00, remarks: 'passed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-03-10T11:00:00Z' },
  { id: 'grd-002', classRecordId: 'cls-001', subjectCode: 'IT101', section: 'BSIT-1A', studentId: 'usr-005', studentName: 'Sarah Jenkins', gradePeriod: 'midterm', computedGrade: 2.25, remarks: 'passed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-05-12T14:30:00Z' },
  { id: 'grd-003', classRecordId: 'cls-002', subjectCode: 'IT201', section: 'BSIT-2B', studentId: 'usr-006', studentName: 'John Smith', gradePeriod: 'prelim', computedGrade: 3.25, remarks: 'failed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-03-11T10:00:00Z' }
];

const defaultLogs = [
  { id: 'log-001', timestamp: '2026-05-25T14:22:15Z', action: 'System Setup', message: 'SAGE Platform Database Initialized.', actor: 'System Control' },
  { id: 'log-002', timestamp: '2026-05-25T15:30:00Z', action: 'User Creation', message: 'Created user c.valdes@sage.edu.ph (Dean).', actor: 'Admin System Control' },
  { id: 'log-003', timestamp: '2026-05-25T16:15:22Z', action: 'Classroom Creation', message: 'Created classroom CS301 (BSCS-3A).', actor: 'Admin System Control' }
];

// LocalStorage loaders
function getFromStorage(key, fallback) {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

function setToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const mockDb = {
  // --- USERS ---
  getUsers: () => getFromStorage(STORAGE_KEYS.USERS, defaultUsers),
  saveUser: (user) => {
    const users = mockDb.getUsers();
    if (user.id) {
      // Edit
      const index = users.findIndex(u => u.id === user.id);
      if (index !== -1) {
        users[index] = { ...users[index], ...user };
      }
    } else {
      // Create
      user.id = `usr-${Math.random().toString(36).substr(2, 9)}`;
      users.push(user);
    }
    setToStorage(STORAGE_KEYS.USERS, users);
    mockDb.addLog(user.id ? 'User Update' : 'User Creation', `Saved user account details for ${user.email} (${user.role}).`);
    return user;
  },
  deleteUser: (id) => {
    const users = mockDb.getUsers();
    const user = users.find(u => u.id === id);
    const filtered = users.filter(u => u.id !== id);
    setToStorage(STORAGE_KEYS.USERS, filtered);
    if (user) {
      mockDb.addLog('User Deletion', `Deleted user account: ${user.email}.`);
    }
  },

  // --- CLASSROOMS ---
  getClassrooms: () => getFromStorage(STORAGE_KEYS.CLASSROOMS, defaultClassrooms),
  saveClassroom: (classroom) => {
    const classrooms = mockDb.getClassrooms();
    const users = mockDb.getUsers();
    
    // Find faculty name
    const faculty = users.find(u => u.id === classroom.facultyId);
    classroom.facultyName = faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unassigned';

    if (classroom.id) {
      const index = classrooms.findIndex(c => c.id === classroom.id);
      if (index !== -1) {
        classrooms[index] = { ...classrooms[index], ...classroom };
      }
    } else {
      classroom.id = `cls-${Math.random().toString(36).substr(2, 9)}`;
      classrooms.push(classroom);
    }
    setToStorage(STORAGE_KEYS.CLASSROOMS, classrooms);
    mockDb.addLog('Classroom Creation', `Created class section ${classroom.subjectCode} - ${classroom.section}.`);
    return classroom;
  },
  reassignFaculty: (classId, facultyId, adminName) => {
    const classrooms = mockDb.getClassrooms();
    const users = mockDb.getUsers();
    const index = classrooms.findIndex(c => c.id === classId);
    if (index !== -1) {
      const oldFacultyName = classrooms[index].facultyName;
      const faculty = users.find(u => u.id === facultyId);
      const newFacultyName = faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unassigned';
      
      classrooms[index].facultyId = facultyId;
      classrooms[index].facultyName = newFacultyName;
      
      setToStorage(STORAGE_KEYS.CLASSROOMS, classrooms);
      mockDb.addLog('Faculty Reassignment', `Reassigned class ${classrooms[index].subjectCode} - ${classrooms[index].section} from ${oldFacultyName} to ${newFacultyName}.`, adminName);
    }
  },
  archiveClassroom: (classId, adminName) => {
    const classrooms = mockDb.getClassrooms();
    const index = classrooms.findIndex(c => c.id === classId);
    if (index !== -1) {
      classrooms[index].status = 'archived';
      setToStorage(STORAGE_KEYS.CLASSROOMS, classrooms);
      mockDb.addLog('Classroom Archive', `Archived class record ${classrooms[index].subjectCode} - ${classrooms[index].section}.`, adminName);
    }
  },

  // --- EVALUATION TEMPLATES ---
  getEvalTemplates: () => getFromStorage(STORAGE_KEYS.EVAL_TEMPLATES, defaultEvalTemplates),
  saveEvalTemplate: (template) => {
    const templates = mockDb.getEvalTemplates();
    if (template.id) {
      const index = templates.findIndex(t => t.id === template.id);
      if (index !== -1) {
        templates[index] = { ...templates[index], ...template };
      }
    } else {
      template.id = `tmpl-${Math.random().toString(36).substr(2, 9)}`;
      template.createdDate = new Date().toISOString();
      templates.push(template);
    }
    setToStorage(STORAGE_KEYS.EVAL_TEMPLATES, templates);
    mockDb.addLog('Evaluation Builder', `Saved evaluation form template: "${template.title}".`);
    return template;
  },
  deleteEvalTemplate: (id) => {
    const templates = mockDb.getEvalTemplates();
    const template = templates.find(t => t.id === id);
    const filtered = templates.filter(t => t.id !== id);
    setToStorage(STORAGE_KEYS.EVAL_TEMPLATES, filtered);
    if (template) {
      mockDb.addLog('Evaluation Deletion', `Removed evaluation form template: "${template.title}".`);
    }
  },

  // --- EVALUATION WINDOWS ---
  getEvalWindows: () => getFromStorage(STORAGE_KEYS.EVAL_WINDOWS, defaultEvalWindows),
  saveEvalWindow: (window) => {
    const windows = mockDb.getEvalWindows();
    const users = mockDb.getUsers();
    const templates = mockDb.getEvalTemplates();
    
    const faculty = users.find(u => u.id === window.facultyId);
    window.facultyName = faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unassigned';
    
    const template = templates.find(t => t.id === window.templateId);
    window.templateTitle = template ? template.title : 'Evaluation Form';

    if (window.id) {
      const index = windows.findIndex(w => w.id === window.id);
      if (index !== -1) {
        windows[index] = { ...windows[index], ...window };
      }
    } else {
      window.id = `ew-${Math.random().toString(36).substr(2, 9)}`;
      window.responsesCount = 0;
      windows.push(window);
    }
    setToStorage(STORAGE_KEYS.EVAL_WINDOWS, windows);
    mockDb.addLog('Evaluation Window', `Scheduled evaluation window for ${window.facultyName} (${window.section}).`);
    return window;
  },
  deleteEvalWindow: (id) => {
    const windows = mockDb.getEvalWindows();
    const filtered = windows.filter(w => w.id !== id);
    setToStorage(STORAGE_KEYS.EVAL_WINDOWS, filtered);
    mockDb.addLog('Evaluation Window Deletion', `Removed scheduled evaluation window.`);
  },

  // --- POSTED GRADES & OVERRIDES ---
  getPostedGrades: () => getFromStorage(STORAGE_KEYS.POSTED_GRADES, defaultPostedGrades),
  overrideGrade: (gradeId, newGrade, remarks, reason, adminName) => {
    const grades = mockDb.getPostedGrades();
    const index = grades.findIndex(g => g.id === gradeId);
    if (index !== -1) {
      const oldGrade = grades[index].computedGrade;
      const oldRemarks = grades[index].remarks;
      
      grades[index].computedGrade = parseFloat(newGrade);
      grades[index].remarks = remarks;
      grades[index].isLocked = true; // Still locked but overridden
      grades[index].overrideBy = adminName;
      grades[index].overrideAt = new Date().toISOString();
      
      setToStorage(STORAGE_KEYS.POSTED_GRADES, grades);
      mockDb.addLog('Grade Override', `Overrode ${grades[index].studentName}'s ${grades[index].gradePeriod} grade in ${grades[index].subjectCode} from ${oldGrade.toFixed(2)} (${oldRemarks}) to ${parseFloat(newGrade).toFixed(2)} (${remarks}). Reason: ${reason}.`, adminName);
    }
  },

  // --- LOGS ---
  getLogs: () => getFromStorage(STORAGE_KEYS.LOGS, defaultLogs),
  addLog: (action, message, actor = 'Admin System Control') => {
    const logs = mockDb.getLogs();
    const newLog = {
      id: `log-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      message,
      actor
    };
    logs.unshift(newLog); // Put new logs at the beginning
    setToStorage(STORAGE_KEYS.LOGS, logs);
  }
};

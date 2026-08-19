// persistent mock database helper for SAGE using localStorage

const STORAGE_KEYS = {
  USERS: 'sage_users',
  CLASSROOMS: 'sage_classrooms',
  EVAL_TEMPLATES: 'sage_eval_templates',
  EVAL_WINDOWS: 'sage_eval_windows',
  LOGS: 'sage_logs',
  POSTED_GRADES: 'sage_posted_grades',
  SUBJECTS: 'sage_subjects',
  SECTIONS: 'sage_sections',
  ACADEMIC_TERMS: 'sage_academic_terms'
};


// Seed Data
const defaultUsers = [
  { id: 'usr-001', lastName: 'System', firstName: 'Admin', middleName: 'Control', email: 'admin@sage.edu.ph', role: 'admin', department: 'College of Computer Studies', program: '', status: 'active' },
  { id: 'usr-002', lastName: 'Valdes', firstName: 'Carlos', middleName: 'Mendoza', email: 'c.valdes@sage.edu.ph', role: 'dean', department: 'College of Computer Studies', program: '', status: 'active' },
  { id: 'usr-003', lastName: 'Rivera', firstName: 'Amanda', middleName: 'Santos', email: 'a.rivera@sage.edu.ph', role: 'faculty', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology', status: 'active' },
  { id: 'usr-004', lastName: 'Doe', firstName: 'John', middleName: 'Smith', email: 'j.doe@sage.edu.ph', role: 'faculty', department: 'College of Computer Studies', program: 'Bachelor of Science in Computer Science', status: 'active' },
  { id: 'usr-005', lastName: 'Jenkins', firstName: 'Sarah', middleName: 'Lee', email: 's.jenkins@student.sage.edu', role: 'student', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology', section: 'BSIT-1A', yearLevel: '1st Year', status: 'active' },
  { id: 'usr-006', lastName: 'Smith', firstName: 'John', middleName: 'Davis', email: 'j.smith@student.sage.edu', role: 'student', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology', section: 'BSIT-2B', yearLevel: '2nd Year', status: 'active' },
  { id: 'usr-007', lastName: 'Johnson', firstName: 'Mary', middleName: 'Cruz', email: 'm.johnson@student.sage.edu', role: 'student', department: 'College of Computer Studies', program: 'Bachelor of Science in Computer Science', section: 'BSCS-3A', yearLevel: '3rd Year', status: 'active' },
  { id: 'usr-008', lastName: 'Doe', firstName: 'Jane', middleName: 'Reyes', email: 'j.doe@student.sage.edu', role: 'student', department: 'College of Computer Studies', program: 'Bachelor of Science in Computer Science', section: 'BSCS-3A', yearLevel: '2nd Year', status: 'active' }
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
      { id: 'crit-1', label: 'Content Knowledge and Pedagogy', description: 'Instructional methods, higher-order thinking skills, language proficiency, verbal/non-verbal strategies.', maxRating: 4 },
      { id: 'crit-2', label: 'Learning Environment', description: 'Safe, learning-focused environment, behavior management, supportive collaboration.', maxRating: 4 },
      { id: 'crit-3', label: 'Diversity of Learners', description: 'Learner-centered culture, linguistic and cultural responsiveness, addressing unique educational needs.', maxRating: 4 },
      { id: 'crit-4', label: 'Teaching, Learning, and Planning', description: 'Sequential teaching-learning process, curriculum alignment, technology integration.', maxRating: 4 },
      { id: 'crit-5', label: 'Assessment and Reporting', description: 'Assessment design, monitoring student progress, informing stakeholders of accomplishments.', maxRating: 4 },
      { id: 'crit-6', label: 'Community Linkages and Professional Engagement', description: 'School community relations, professional ethics, compliance with rules/regulations.', maxRating: 4 },
      { id: 'crit-7', label: 'Personal Growth and Professional Development', description: 'Protection of teaching honor, professional collaboration, self-reflection.', maxRating: 4 }
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
  },
  {
    id: 'ew-003',
    templateId: 'tmpl-001',
    templateTitle: 'AY 2025-2026 Semester 2 Faculty Evaluation',
    facultyId: 'usr-004',
    facultyName: 'John Doe',
    section: 'BSCS-3A',
    openAt: '2026-05-22T08:00',
    closeAt: '2026-06-30T17:00',
    isClosed: false,
    responsesCount: 40,
    totalStudents: 42
  }
];

const defaultSubjects = [
  { id: 'sbj-001', code: 'IT101', name: 'Introduction to Computing', units: 3, department: 'College of Computer Studies' },
  { id: 'sbj-002', code: 'IT201', name: 'Data Structures and Algorithms', units: 3, department: 'College of Computer Studies' },
  { id: 'sbj-003', code: 'CS301', name: 'Artificial Intelligence', units: 3, department: 'College of Computer Studies' },
  { id: 'sbj-004', code: 'IT401', name: 'Capstone Project 1', units: 3, department: 'College of Computer Studies' }
];

const defaultSections = [
  { id: 'sec-001', name: 'BSIT-1A', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology' },
  { id: 'sec-002', name: 'BSIT-2B', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology' },
  { id: 'sec-003', name: 'BSCS-3A', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Computer Science' },
  { id: 'sec-004', name: 'BSIT-4A', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology' },
  { id: 'sec-005', name: 'BSCS-1B', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Computer Science' },
  { id: 'sec-006', name: 'BSIT-2A', schoolYear: '2025-2026', semester: '2nd', department: 'College of Computer Studies', program: 'Bachelor of Science in Information Technology' }
];

const defaultPostedGrades = [
  { id: 'grd-001', classRecordId: 'cls-001', subjectCode: 'IT101', section: 'BSIT-1A', studentId: 'usr-005', studentName: 'Sarah Jenkins', gradePeriod: 'prelim', computedGrade: 2.00, remarks: 'passed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-03-10T11:00:00Z' },
  { id: 'grd-002', classRecordId: 'cls-001', subjectCode: 'IT101', section: 'BSIT-1A', studentId: 'usr-005', studentName: 'Sarah Jenkins', gradePeriod: 'midterm', computedGrade: 2.25, remarks: 'passed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-05-12T14:30:00Z' },
  { id: 'grd-003', classRecordId: 'cls-002', subjectCode: 'IT201', section: 'BSIT-2B', studentId: 'usr-006', studentName: 'John Smith', gradePeriod: 'prelim', computedGrade: 5.00, remarks: 'failed', isLocked: true, postedBy: 'Amanda Rivera', postedAt: '2026-03-11T10:00:00Z' }
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
  getUsers: () => {
    let stored = getFromStorage(STORAGE_KEYS.USERS, defaultUsers);
    let updated = false;

    // Force append any new default seed users missing from local storage
    defaultUsers.forEach(def => {
      if (!stored.some(u => u.id === def.id)) {
        stored.push(def);
        updated = true;
      }
    });

    const migrated = stored.map(u => {
      const def = defaultUsers.find(d => d.id === u.id);
      if (def) {
        // Find if any key present in seed defaults is missing/empty in stored user
        const missingKeys = Object.keys(def).filter(k => u[k] === undefined || u[k] === '');
        if (missingKeys.length > 0) {
          updated = true;
          return { ...def, ...u, ...missingKeys.reduce((acc, k) => ({ ...acc, [k]: def[k] }), {}) };
        }
      }
      return u;
    });

    if (updated) {
      setToStorage(STORAGE_KEYS.USERS, migrated);
      return migrated;
    }
    return stored;
  },
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
  getEvalWindows: () => {
    let stored = getFromStorage(STORAGE_KEYS.EVAL_WINDOWS, defaultEvalWindows);
    let updated = false;
    defaultEvalWindows.forEach(def => {
      if (!stored.some(w => w.id === def.id)) {
        stored.push(def);
        updated = true;
      }
    });
    if (updated) {
      setToStorage(STORAGE_KEYS.EVAL_WINDOWS, stored);
    }
    return stored;
  },
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

  // --- SUBJECTS ---
  getSubjects: () => getFromStorage(STORAGE_KEYS.SUBJECTS, defaultSubjects),
  saveSubject: (subject) => {
    const subjects = mockDb.getSubjects();
    if (subject.id) {
      const index = subjects.findIndex(s => s.id === subject.id);
      if (index !== -1) {
        subjects[index] = { ...subjects[index], ...subject };
      }
    } else {
      subject.id = `sbj-${Math.random().toString(36).substr(2, 9)}`;
      subjects.push(subject);
    }
    setToStorage(STORAGE_KEYS.SUBJECTS, subjects);
    mockDb.addLog(subject.id ? 'Subject Update' : 'Subject Creation', `Saved subject details for ${subject.code} - ${subject.name}.`);
    return subject;
  },
  deleteSubject: (id) => {
    const subjects = mockDb.getSubjects();
    const subject = subjects.find(s => s.id === id);
    const filtered = subjects.filter(s => s.id !== id);
    setToStorage(STORAGE_KEYS.SUBJECTS, filtered);
    if (subject) {
      mockDb.addLog('Subject Deletion', `Deleted subject: ${subject.code} - ${subject.name}.`);
    }
  },

  // --- SECTIONS ---
  getSections: () => getFromStorage(STORAGE_KEYS.SECTIONS, defaultSections),
  saveSection: (section) => {
    const sections = mockDb.getSections();
    if (section.id) {
      const index = sections.findIndex(s => s.id === section.id);
      if (index !== -1) {
        sections[index] = { ...sections[index], ...section };
      }
    } else {
      section.id = `sec-${Math.random().toString(36).substr(2, 9)}`;
      sections.push(section);
    }
    setToStorage(STORAGE_KEYS.SECTIONS, sections);
    mockDb.addLog(section.id ? 'Section Update' : 'Section Creation', `Saved section details for ${section.name}.`);
    return section;
  },
  deleteSection: (id) => {
    const sections = mockDb.getSections();
    const section = sections.find(s => s.id === id);
    const filtered = sections.filter(s => s.id !== id);
    setToStorage(STORAGE_KEYS.SECTIONS, filtered);
    if (section) {
      mockDb.addLog('Section Deletion', `Deleted section: ${section.name}.`);
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
  },

  // --- ACADEMIC TERMS ---
  getAcademicTerms: () => {
    const defaultTerms = [
      { id: 'term-1', schoolYear: '2025-2026', semester: '2nd', isActive: true, created_at: new Date().toISOString() },
      { id: 'term-2', schoolYear: '2025-2026', semester: '1st', isActive: false, created_at: new Date().toISOString() },
      { id: 'term-3', schoolYear: '2024-2025', semester: '2nd', isActive: false, created_at: new Date().toISOString() }
    ];
    return getFromStorage(STORAGE_KEYS.ACADEMIC_TERMS, defaultTerms);
  },
  saveAcademicTerm: (term) => {
    const terms = mockDb.getAcademicTerms();
    if (term.id) {
      const idx = terms.findIndex(t => t.id === term.id);
      if (idx !== -1) terms[idx] = { ...terms[idx], ...term };
    } else {
      term.id = `term-${Math.random().toString(36).substr(2, 9)}`;
      term.created_at = new Date().toISOString();
      terms.push(term);
    }
    setToStorage(STORAGE_KEYS.ACADEMIC_TERMS, terms);
    return term;
  }
};

/**
 * Named exports: Fallback mock data for ScoreInput.jsx and VerificationQueue.jsx.
 * Used only when Supabase queries fail (e.g. offline dev, missing RLS).
 */
export const mockClassInfo = {
  class_record_id: 'mock-class-rec-001',
  subject_id: 'mock-subj-001',
  section_id: 'mock-sec-001',
  faculty_id: 'mock-fac-001',
  status: 'active',
  subjects: {
    code: 'IT101',
    name: 'Introduction to Computing',
    departments: { name: 'College of Computer Studies' }
  },
  sections: {
    name: 'BSIT-1A',
    semester: '2nd',
    school_year: '2025-2026'
  }
};

export const mockStudents = [
  { id: 'mock-stu-001', first_name: 'Juan', last_name: 'Dela Cruz', user_number: '2025-0001', email: 'j.delacruz@student.sage.edu' },
  { id: 'mock-stu-002', first_name: 'Maria', last_name: 'Santos', user_number: '2025-0002', email: 'm.santos@student.sage.edu' },
  { id: 'mock-stu-003', first_name: 'Jose', last_name: 'Rizal', user_number: '2025-0003', email: 'j.rizal@student.sage.edu' }
];

export const mockActivities = {
  Prelim: [
    { id: 'act1', name: 'Formative Assessment 1', max: 50 },
    { id: 'act2', name: 'Formative Assessment 2', max: 50 }
  ],
  Midterm: [
    { id: 'act1', name: 'Formative Assessment 1', max: 50 },
    { id: 'act2', name: 'Formative Assessment 2', max: 50 }
  ],
  'Semi-Final': [
    { id: 'act1', name: 'Formative Assessment 1', max: 50 },
    { id: 'act2', name: 'Formative Assessment 2', max: 50 }
  ],
  Final: [
    { id: 'act1', name: 'Formative Assessment 1', max: 50 },
    { id: 'act2', name: 'Formative Assessment 2', max: 50 }
  ]
};

export const mockDraftScores = {};

export const mockVerificationQueue = [
  {
    id: 'vq-001',
    studentName: 'Dela Cruz, Juan',
    userNumber: '2025-0001',
    subjectCode: 'IT101',
    subjectName: 'Introduction to Computing',
    section: 'BSIT-1A',
    term: 'Midterm',
    requestedRemark: 'PASSED',
    currentGrade: 85,
    status: 'pending',
    submittedAt: new Date().toISOString()
  }
];

// --- DEAN PORTAL MOCK FALLBACKS ---
export const mockDeanFacultyData = [
  {
    id: 'fac-001',
    firstName: 'Amanda',
    lastName: 'Rivera',
    email: 'a.rivera@sage.edu.ph',
    department: 'College of Computer Studies',
    sectionsCount: 3,
    subjectCodes: ['IT101', 'IT102', 'CS103'],
    rating: 4.85,
    responseCount: 112,
    onTimeCount: 108,
    lateCount: 4,
    hasResponses: true,
    isReleased: false,
    windows: []
  },
  {
    id: 'fac-002',
    firstName: 'John',
    lastName: 'Doe',
    email: 'j.doe@sage.edu.ph',
    department: 'College of Computer Studies',
    sectionsCount: 2,
    subjectCodes: ['IT201', 'IT205'],
    rating: 3.2,
    responseCount: 45,
    onTimeCount: 40,
    lateCount: 5,
    hasResponses: true,
    isReleased: true,
    windows: []
  },
  {
    id: 'fac-003',
    firstName: 'Mark',
    lastName: 'Bautista',
    email: 'm.bautista@sage.edu.ph',
    department: 'College of Computer Studies',
    sectionsCount: 1,
    subjectCodes: ['CS202'],
    rating: null,
    responseCount: 0,
    onTimeCount: 0,
    lateCount: 0,
    hasResponses: false,
    isReleased: false,
    windows: []
  }
];

export const mockDeanAtRiskStudents = [
  {
    student_id: 'stu-001',
    user_number: '2023-0101',
    first_name: 'Joel',
    last_name: 'Villanueva',
    email: 'j.villanueva@student.sage.edu.ph',
    section: 'BSIT-1A',
    programPrefix: 'BSIT',
    yearLevel: '1st Year',
    avgGwa: 3.25,
    failingCount: 2,
    risk: { severity: 'high', advisory: 'Immediate academic counselor intervention advised. Failing marks recorded.' }
  },
  {
    student_id: 'stu-002',
    user_number: '2023-0102',
    first_name: 'Anna',
    last_name: 'Reyes',
    email: 'a.reyes@student.sage.edu.ph',
    section: 'BSIT-2A',
    programPrefix: 'BSIT',
    yearLevel: '2nd Year',
    avgGwa: 2.75,
    failingCount: 0,
    risk: { severity: 'medium', advisory: 'Provide tutoring support. Running GWA is border-lining the passing scale.' }
  }
];

export const mockDeanGradeDistribution = [
  { range: '1.00', count: 45, color: '#059669' },
  { range: '1.25', count: 82, color: '#10b981' },
  { range: '1.50', count: 120, color: '#34d399' },
  { range: '1.75', count: 95, color: '#6ee7b7' },
  { range: '2.00', count: 150, color: '#a7f3d0' },
  { range: '2.25', count: 110, color: '#fcd34d' },
  { range: '2.50', count: 85, color: '#fbbf24' },
  { range: '2.75', count: 40, color: '#f59e0b' },
  { range: '3.00', count: 35, color: '#d97706' },
  { range: '5.00', count: 18, color: '#ef4444' },
  { range: 'INC', count: 8, color: '#64748b' },
  { range: 'DRP', count: 5, color: '#475569' }
];

export const mockDeanGradePostingStatus = [
  {
    class_record_id: 'cr-001',
    subjectCode: 'IT101',
    subjectName: 'Introduction to Computing',
    sectionName: 'BSIT-1A',
    facultyName: 'Rivera, Amanda',
    facultyEmail: 'a.rivera@sage.edu.ph',
    department: 'College of Computer Studies',
    postedCount: 35,
    totalCount: 35,
    progress: 100,
    isComplete: true,
    lastUpdated: new Date().toISOString()
  },
  {
    class_record_id: 'cr-002',
    subjectCode: 'IT102',
    subjectName: 'Computer Programming 1',
    sectionName: 'BSIT-1B',
    facultyName: 'Doe, John',
    facultyEmail: 'j.doe@sage.edu.ph',
    department: 'College of Computer Studies',
    postedCount: 15,
    totalCount: 40,
    progress: Math.round((15/40)*100),
    isComplete: false,
    lastUpdated: new Date().toISOString()
  },
  {
    class_record_id: 'cr-003',
    subjectCode: 'CS103',
    subjectName: 'Data Structures',
    sectionName: 'BSCS-2A',
    facultyName: 'Bautista, Mark',
    facultyEmail: 'm.bautista@sage.edu.ph',
    department: 'College of Computer Studies',
    postedCount: 0,
    totalCount: 25,
    progress: 0,
    isComplete: false,
    lastUpdated: null
  }
];

export const mockDeanRemarkRequests = [
  {
    id: 'req-001',
    studentName: 'Villanueva, Joel',
    userNumber: '2023-0101',
    subjectCode: 'IT101',
    subjectName: 'Introduction to Computing',
    section: 'BSIT-1A',
    term: 'Final',
    facultyName: 'Rivera, Amanda',
    requestedRemark: 'INC',
    currentGrade: 74,
    status: 'pending',
    submittedAt: new Date().toISOString()
  }
];

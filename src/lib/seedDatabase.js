import { supabase } from './supabase';

// Seed data
const defaultDepartments = [
  { name: 'College of Computer Studies' }
];

const defaultSubjects = [
  { code: 'IT101', name: 'Introduction to Computing', units: 3, departmentName: 'College of Computer Studies' },
  { code: 'IT201', name: 'Data Structures and Algorithms', units: 3, departmentName: 'College of Computer Studies' },
  { code: 'CS301', name: 'Artificial Intelligence', units: 3, departmentName: 'College of Computer Studies' },
  { code: 'IT401', name: 'Capstone Project 1', units: 3, departmentName: 'College of Computer Studies' }
];

const defaultSections = [
  { name: 'BSIT-1A', school_year: 'AY 2025-2026', semester: '2nd', departmentName: 'College of Computer Studies' },
  { name: 'BSIT-2B', school_year: 'AY 2025-2026', semester: '2nd', departmentName: 'College of Computer Studies' },
  { name: 'BSCS-3A', school_year: 'AY 2025-2026', semester: '2nd', departmentName: 'College of Computer Studies' }
];

const defaultUsers = [
  { lastName: 'System', firstName: 'Admin', middleName: 'Control', email: 'admin@sage.edu.ph', role: 'admin', user_number: 'ADM-2026-00001', departmentName: 'College of Computer Studies' },
  { lastName: 'Valdes', firstName: 'Carlos', middleName: 'Mendoza', email: 'c.valdes@sage.edu.ph', role: 'dean', user_number: 'DN-2026-00002', departmentName: 'College of Computer Studies' },
  { lastName: 'Rivera', firstName: 'Amanda', middleName: 'Santos', email: 'a.rivera@sage.edu.ph', role: 'faculty', user_number: 'FAC-2026-00003', departmentName: 'College of Computer Studies' },
  { lastName: 'Jenkins', firstName: 'Sarah', middleName: 'Lee', email: 's.jenkins@student.sage.edu', role: 'student', user_number: '2026-00005', year_level: '1st Year', departmentName: 'College of Computer Studies' }
];

export async function seedDatabase() {
  console.log("Starting Database Seed...");
  try {
    // 1. Seed Departments (Check if exists first to avoid duplicates)
    let ccsId;
    const { data: existingDept } = await supabase.from('departments').select('department_id').eq('name', 'College of Computer Studies').maybeSingle();
    
    if (existingDept) {
      ccsId = existingDept.department_id;
    } else {
      const { data: deptData, error: deptErr } = await supabase.from('departments').insert(defaultDepartments).select();
      if (deptErr) throw deptErr;
      ccsId = deptData[0].department_id;
    }

    // 2. Seed Subjects
    const mappedSubjects = defaultSubjects.map(s => ({
      code: s.code, name: s.name, units: s.units, department_id: ccsId
    }));
    // Use upsert on code
    const { error: subjErr } = await supabase.from('subjects').upsert(mappedSubjects, { onConflict: 'code' });
    if (subjErr) throw subjErr;

    // 3. Seed Sections (Check if exists manually since name isn't unique in schema)
    const { data: existingSections } = await supabase.from('sections').select('name');
    const existingSectionNames = existingSections?.map(s => s.name) || [];
    
    const sectionsToInsert = defaultSections
      .filter(s => !existingSectionNames.includes(s.name))
      .map(s => ({
        name: s.name, school_year: s.school_year, semester: s.semester, department_id: ccsId
      }));

    if (sectionsToInsert.length > 0) {
      const { error: secErr } = await supabase.from('sections').insert(sectionsToInsert);
      if (secErr) throw secErr;
    }

    // 4. Seed Users via Auth API
    for (const u of defaultUsers) {
      // Check if user already exists in public table to avoid auth duplicate errors entirely
      const { data: existingUser } = await supabase.from('users').select('user_id').eq('email', u.email).maybeSingle();
      if (existingUser) continue;

      // Register in Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: u.email,
        password: 'DemoPassword123!'
      });
      
      if (authErr && !authErr.message.includes('already registered')) {
        console.error(`SignUp failed for ${u.email}:`, authErr);
        throw new Error(`Failed to create ${u.email}: ${authErr.message}`);
      }

      // If user already registered in Auth but not in public DB, we skip to avoid complexity here
      if (!authData?.user) continue;

      const userId = authData.user.id;

      // Insert into public.users
      const { error: profileErr } = await supabase.from('users').upsert({
        user_id: userId,
        last_name: u.lastName,
        first_name: u.firstName,
        middle_name: u.middleName,
        email: u.email,
        password_hash: 'managed_by_supabase_auth',
        role: u.role,
        year_level: u.year_level || null,
        department_id: ccsId,
        must_change_password: true,
        user_number: u.user_number
      }, { onConflict: 'email' });

      if (profileErr) throw profileErr;
    }

    console.log("Seeding complete!");
    alert("Database seeded successfully! You can now log in.");
  } catch (error) {
    console.error("Seeding failed:", error);
    alert("Seeding failed. Check console for details.");
  }
}

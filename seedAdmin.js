import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, 'supabase', '.env');
const envFile = fs.readFileSync(envPath, 'utf-8');
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    process.env[key] = val;
  }
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabaseUrl or supabaseKey");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const defaultUsers = [
  { lastName: 'System', firstName: 'Admin', middleName: 'Control', email: 'admin@sage.edu.ph', role: 'admin', user_number: 'ADM-2026-00001', departmentName: 'College of Computer Studies' },
  { lastName: 'Valdes', firstName: 'Carlos', middleName: 'Mendoza', email: 'c.valdes@sage.edu.ph', role: 'dean', user_number: 'DN-2026-00002', departmentName: 'College of Computer Studies' },
  { lastName: 'Rivera', firstName: 'Amanda', middleName: 'Santos', email: 'a.rivera@sage.edu.ph', role: 'faculty', user_number: 'FAC-2026-00003', departmentName: 'College of Computer Studies' },
  { lastName: 'Jenkins', firstName: 'Sarah', middleName: 'Lee', email: 's.jenkins@student.sage.edu', role: 'student', user_number: '2026-00005', year_level: '1st Year', departmentName: 'College of Computer Studies' },
  { lastName: 'Staff', firstName: 'College', middleName: 'Office', email: 'office@sage.edu.ph', role: 'admin', user_number: 'OFC-2026-00008', departmentName: 'College of Computer Studies' }
];

async function seed() {
  console.log("Fetching CCS department...");
  const { data: ccs } = await supabase.from('departments').select('department_id').eq('name', 'College of Computer Studies').single();
  
  if (!ccs) {
    console.error("Department not found. Did you run the seed script from the UI first?");
    return;
  }

  const { data: existingAuth } = await supabase.auth.admin.listUsers();
  const authUsersByEmail = {};
  if (existingAuth && existingAuth.users) {
    existingAuth.users.forEach(u => authUsersByEmail[u.email] = u.id);
  }

  for (const u of defaultUsers) {
    console.log("Processing", u.email);
    
    let userId = authUsersByEmail[u.email];
    
    if (!userId) {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'DemoPassword123!',
        email_confirm: true
      });

      if (authErr) {
        console.error("Auth error for", u.email, ":", authErr);
        continue;
      }
      userId = authData.user.id;
    }

    if (!userId) continue;

    // Insert public.users
    const { error: profileErr } = await supabase.from('users').upsert({
      user_id: userId,
      last_name: u.lastName,
      first_name: u.firstName,
      middle_name: u.middleName,
      email: u.email,
      password_hash: 'managed_by_supabase_auth',
      role: u.role,
      year_level: u.year_level || null,
      department_id: ccs.department_id,
      must_change_password: true,
      user_number: u.user_number
    }, { onConflict: 'email' });

    if (profileErr) {
      console.error("Profile Error for", u.email, profileErr);
    } else {
      console.log("Successfully seeded profile for", u.email);
    }
  }
}

seed();

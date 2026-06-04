const fs = require('fs');
const path = require('path');

const envPath = path.resolve('supabase', '.env');
const envFile = fs.readFileSync(envPath, 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const sql = `
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_academic_insights TO authenticated, anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.faculty_performance_insights TO authenticated, anon;
`;

async function run() {
  console.log('Sending SQL to Supabase exec_sql endpoint...');
  const response = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'apikey': env.SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Failed to run grants SQL:', text);
    return;
  }

  console.log('Grants applied successfully!');
}

run();

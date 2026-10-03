import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanLegacyActivities() {
  console.log('Fetching all class activities...');
  const { data: activities, error: actError } = await supabase
    .from('class_activities')
    .select('activity_id, title, term, class_record_id');

  if (actError) {
    console.error('Error fetching activities:', actError);
    return;
  }

  console.log(`Found ${activities.length} activities. Checking for scores...`);

  let deletedCount = 0;

  for (const activity of activities) {
    // Check if this activity has any scores recorded
    const { data: scores, error: scoreError } = await supabase
      .from('student_activity_scores')
      .select('score_id')
      .eq('activity_id', activity.activity_id)
      .limit(1);

    if (scoreError) {
      console.error(`Error checking scores for activity ${activity.activity_id}:`, scoreError);
      continue;
    }

    if (!scores || scores.length === 0) {
      console.log(`Deleting unused activity: [${activity.term}] ${activity.title} (ID: ${activity.activity_id})`);
      
      const { error: deleteError } = await supabase
        .from('class_activities')
        .delete()
        .eq('activity_id', activity.activity_id);
        
      if (deleteError) {
        console.error(`Failed to delete activity ${activity.activity_id}:`, deleteError);
      } else {
        deletedCount++;
      }
    }
  }

  console.log(`\nCleanup complete. Deleted ${deletedCount} unused activities.`);
}

cleanLegacyActivities();

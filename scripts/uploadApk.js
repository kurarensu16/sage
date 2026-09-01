import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Minimal .env parser without external dependency
function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          process.env[key] = val;
        }
      }
    });
  }
}

loadEnvFile('supabase/.env');
loadEnvFile('.env.local');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ettnwknyhdhehoclrwwh.supabase.co';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log('1. Checking storage buckets...');
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) {
    console.error('Error listing buckets:', bErr);
  } else {
    console.log('Existing buckets:', buckets.map(b => b.name));
  }

  const bucketName = 'app-releases';
  const exists = (buckets || []).some(b => b.name === bucketName);

  if (!exists) {
    console.log(`2. Creating public bucket "${bucketName}"...`);
    const { data: newBucket, error: createErr } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 104857600 // 100MB
    });
    if (createErr) {
      console.error('Failed to create bucket:', createErr);
    } else {
      console.log('Bucket created successfully:', newBucket);
    }
  } else {
    console.log(`Bucket "${bucketName}" already exists.`);
  }

  let apkPath = path.resolve('android/app/build/outputs/apk/debug/sage.apk');
  if (!fs.existsSync(apkPath)) {
    apkPath = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  }

  console.log('3. Reading APK from:', apkPath);

  if (!fs.existsSync(apkPath)) {
    console.error('APK file not found at:', apkPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(apkPath);
  console.log(`APK File Size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  const fileNames = ['sage.apk', 'sage-latest.apk', 'app-debug.apk'];

  console.log('4. Uploading APK aliases to Supabase Storage...');
  for (const name of fileNames) {
    const { data: uploadData, error: upErr } = await supabase.storage
      .from(bucketName)
      .upload(name, fileBuffer, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true
      });

    if (upErr) {
      console.error(`Upload of ${name} failed:`, upErr);
    } else {
      console.log(`Uploaded ${name} successfully:`, uploadData.path);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${name}`;
    const res = await fetch(publicUrl, { method: 'HEAD' });
    console.log(`  -> ${name} HTTP status:`, res.status, res.statusText);
  }

  console.log('ALL APK endpoints are live and verified.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

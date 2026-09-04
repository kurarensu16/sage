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

  const debugApk = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  const targetSageApk = path.resolve('android/app/build/outputs/apk/debug/sage.apk');

  if (fs.existsSync(debugApk)) {
    console.log('Syncing fresh app-debug.apk -> sage.apk locally...');
    fs.copyFileSync(debugApk, targetSageApk);
  }

  const apkPath = fs.existsSync(targetSageApk) ? targetSageApk : debugApk;
  console.log('3. Reading APK from:', apkPath);

  if (!fs.existsSync(apkPath)) {
    console.error('APK file not found at:', apkPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(apkPath);
  console.log(`APK File Size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  console.log('4. Cleaning other files from bucket to keep only "sage.apk"...');
  const { data: existingFiles, error: listErr } = await supabase.storage
    .from(bucketName)
    .list();

  if (listErr) {
    console.warn('Warning: Could not list bucket files:', listErr.message);
  } else if (existingFiles && existingFiles.length > 0) {
    const filesToRemove = existingFiles
      .filter(f => f.name !== 'sage.apk')
      .map(f => f.name);

    if (filesToRemove.length > 0) {
      console.log('Removing legacy/alias files from bucket:', filesToRemove);
      const { data: delData, error: delErr } = await supabase.storage
        .from(bucketName)
        .remove(filesToRemove);
      if (delErr) {
        console.error('Failed to remove extra files:', delErr);
      } else {
        console.log('Removed extra files successfully:', delData);
      }
    }
  }

  const fileName = 'sage.apk';
  console.log(`5. Uploading "${fileName}" to Supabase Storage...`);
  const { data: uploadData, error: upErr } = await supabase.storage
    .from(bucketName)
    .upload(fileName, fileBuffer, {
      contentType: 'application/vnd.android.package-archive',
      cacheControl: '3600',
      upsert: true
    });

  if (upErr) {
    console.error(`Upload of ${fileName} failed:`, upErr);
    process.exit(1);
  } else {
    console.log(`Uploaded ${fileName} successfully:`, uploadData.path);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${fileName}`;
  const res = await fetch(publicUrl, { method: 'HEAD' });
  console.log(`  -> ${fileName} HTTP status:`, res.status, res.statusText);

  // List final bucket contents to verify only sage.apk exists
  const { data: finalFiles } = await supabase.storage.from(bucketName).list();
  console.log('Final bucket contents:', finalFiles?.map(f => `${f.name} (${(f.metadata?.size / (1024 * 1024) || 0).toFixed(2)} MB)`));
  console.log(`Public Download URL: ${publicUrl}`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

import { supabase } from './supabase';
import { encryptBackup, decryptBackup, readEnvelope } from './backupCrypto';

// Admin backup, restore, and capacity reporting.
//
// Everything here goes through SECURITY DEFINER RPCs gated on is_active_admin().
// The browser holds no service-role key, so there is nothing here that a
// non-admin could borrow by calling it directly.
//
// The passphrase never leaves this file's callers: the database sees only
// decrypted payloads, and the encryption happens in the browser.
//
// Migration: 20261029215500_backup_and_restore.sql

const AVATARS_BUCKET = 'avatars';

export const BACKUP_CONTENT_VERSION = 2;

// What a backup leaves out, shown on the page so nobody is surprised at the
// moment they need the backup most.
export const BACKUP_EXCLUSIONS = Object.freeze([
  {
    what: 'Passwords',
    why: 'Password hashes are never exported, so the file is safe to keep. This does not affect signing in: a restore never touches the login records, so everyone keeps the password they already have.'
  },
  {
    what: 'Profile photos',
    why: 'The image files stay in Supabase Storage, which keeps its own backups. The backup records which photos existed so a restore can tell you if any are missing.'
  },
  {
    what: 'Maintenance settings, backup history, and editing locks',
    why: 'Restoring these would undo the maintenance mode that protects the restore, erase the record of restores, and re-apply stale editing locks.'
  }
]);

// --- Status and manifest ---------------------------------------------------

export async function fetchBackupManifest() {
  const { data, error } = await supabase.rpc('aspire_backup_manifest');
  if (error) throw error;
  return (data || []).map((row) => ({
    table: row.table_name,
    order: row.sort_order,
    rows: Number(row.row_count || 0)
  }));
}

// The drift warning's source. `schemaChanged` is deliberately tri-state:
// null means there is no backup at all, which is a different problem from a
// backup that no longer matches.
export async function fetchBackupStatus() {
  const { data, error } = await supabase.rpc('aspire_backup_status');
  if (error) throw error;
  return {
    fingerprint: data?.schema_fingerprint || null,
    lastBackupAt: data?.last_backup_at || null,
    lastBackupRows: data?.last_backup_rows ?? null,
    lastBackupTables: data?.last_backup_tables ?? null,
    lastBackupFingerprint: data?.last_backup_fingerprint || null,
    schemaChanged: data?.schema_changed_since_last_backup ?? null,
    daysSinceLastBackup:
      data?.days_since_last_backup == null ? null : Number(data.days_since_last_backup)
  };
}

export async function fetchBackupHistory(limit = 20) {
  const { data, error } = await supabase
    .from('backup_runs')
    .select('id, kind, performed_at, table_count, row_count, backup_taken_at, notes, users:performed_by(first_name, last_name)')
    .order('performed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    kind: row.kind,
    performedAt: row.performed_at,
    tableCount: row.table_count,
    rowCount: row.row_count,
    backupTakenAt: row.backup_taken_at,
    notes: row.notes,
    performedBy: `${row.users?.last_name || ''}, ${row.users?.first_name || ''}`.trim().replace(/^,\s*/, '')
  }));
}

// --- Export ----------------------------------------------------------------

/**
 * Export, encrypt, and hand back the envelope ready to download.
 *
 * The audit row is written separately because the export RPC is STABLE -- it
 * must not write, so that all of its reads share one snapshot and the backup is
 * internally consistent. A failed audit write is reported but does not discard
 * a good backup.
 */
export async function createEncryptedBackup(passphrase, hint = '') {
  const { data, error } = await supabase.rpc('aspire_export_backup');
  if (error) throw error;

  const envelope = await encryptBackup(data, passphrase, hint);

  let recorded = true;
  const { error: logErr } = await supabase.rpc('aspire_record_backup_run', {
    p_kind: 'export',
    p_table_count: data?.table_count ?? null,
    p_row_count: data?.database_rows ?? null,
    p_schema_fingerprint: data?.schema_fingerprint ?? null,
    p_notes: 'Encrypted full export. Password hashes excluded by policy.'
  });
  if (logErr) {
    console.warn('Backup was not recorded in the history:', logErr);
    recorded = false;
  }

  return { envelope, summary: {
    takenAt: data?.taken_at || null,
    tableCount: data?.table_count ?? 0,
    rowCount: data?.database_rows ?? 0,
    fingerprint: data?.schema_fingerprint || null
  }, recorded };
}

// Named so that a folder of backups sorts chronologically and a restore can be
// matched to the moment it came from without opening the file.
export function backupFileName(takenAt) {
  const taken = takenAt ? new Date(takenAt) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${taken.getFullYear()}-${pad(taken.getMonth() + 1)}-${pad(taken.getDate())}_${pad(taken.getHours())}${pad(taken.getMinutes())}`;
  return `aspire-backup_${stamp}.json`;
}

export function downloadEnvelope(envelope, takenAt) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(takenAt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Reading a file --------------------------------------------------------

/**
 * Read a chosen file's clear-text header. No passphrase needed.
 *
 * Split from decryption on purpose: this is what lets the page say "that file
 * predates three migrations" before asking for a passphrase, instead of leaving
 * an incompatible backup and a mistyped passphrase looking identical.
 */
export async function inspectBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file could not be read as a backup. Choose the .json file produced by Create Backup.');
  }
  const { header, hint, envelope } = readEnvelope(parsed);

  const tables = (header.tables || [])
    .filter((t) => t?.name)
    .map((t) => ({ table: t.name, rows: Number(t.rows || 0) }))
    .sort((a, b) => a.table.localeCompare(b.table));

  return {
    envelope,
    hint,
    takenAt: header.taken_at || null,
    fingerprint: header.schema_fingerprint || null,
    contentVersion: header.content_version ?? null,
    tableCount: header.table_count ?? tables.length,
    rowCount: header.database_rows ?? tables.reduce((s, t) => s + t.rows, 0),
    accountCount: header.account_count ?? 0,
    photoCount: header.photo_count ?? 0,
    tables
  };
}

export async function unlockBackup(envelope, passphrase) {
  return decryptBackup(envelope, passphrase);
}

// --- Checking and restoring ------------------------------------------------

/** Read-only compatibility and integrity check. No locks, no maintenance window. */
export async function validateBackup(payload) {
  const { data, error } = await supabase.rpc('aspire_validate_backup', { p_payload: payload });
  if (error) throw error;
  return {
    takenAt: data?.taken_at || null,
    fingerprintMatches: !!data?.fingerprint_matches,
    restorable: !!data?.restorable,
    blockingCount: Number(data?.blocking_count || 0),
    differences: data?.differences || [],
    declaredRows: Number(data?.declared_rows || 0),
    actualRows: Number(data?.actual_rows || 0),
    intact: !!data?.intact,
    tableCount: Number(data?.table_count || 0),
    tables: data?.tables || []
  };
}

/**
 * Restore, or rehearse one.
 *
 * `rehearse: true` performs the whole restore and rolls it back. Both forms take
 * the same gates -- maintenance mode and the exclusive lock -- because a
 * rehearsal locks every table while it runs.
 */
export async function restoreBackup(payload, { rehearse = false } = {}) {
  const { data, error } = await supabase.rpc('aspire_restore_backup', {
    p_payload: payload,
    p_rehearse: rehearse
  });
  if (error) throw error;
  return data;
}

// A restore that trips a column, type, or constraint error means the database
// has changed shape since the backup was taken. The generic wording for those
// codes ("Something required was left blank") sends the admin looking for a form
// field that does not exist, so this says the real thing. Nothing was written
// either way: the restore is one transaction.
const SCHEMA_DRIFT_CODES = new Set(['23502', '23503', '23514', '42703', '42804', '22P02']);

export function restoreErrorMessage(error) {
  if (SCHEMA_DRIFT_CODES.has(error?.code)) {
    return 'This backup does not fit the current database. It was most likely taken before a system update that changed how records are stored. Nothing was changed — use a more recent backup, or check it first with Test this backup.';
  }
  return null;
}

// --- Capacity and storage --------------------------------------------------

// Limits come from the chosen plan tier, which is seeded to Free. Nothing here
// asks anyone for a byte count -- the tiers are data in the database, so a
// change to Supabase's published limits is one UPDATE, not a code change.
//
// Which tier a project is actually on cannot be detected: Supabase exposes that
// only through its Management API, which needs a full-account Personal Access
// Token. Deliberately not worth adding to read two numbers.
export async function fetchCapacityReport() {
  const { data, error } = await supabase.rpc('aspire_capacity_report');
  if (error) throw error;
  const n = (v) => (v == null ? null : Number(v));
  return {
    planTier: data?.plan_tier || '',
    planLabel: data?.plan_label || '',
    planNotes: data?.plan_notes || '',
    planHasOverride: !!data?.plan_has_override,
    storageQuotaBytes: n(data?.storage_quota_bytes),
    storageUsedBytes: Number(data?.storage_used_bytes || 0),
    databaseQuotaBytes: n(data?.database_quota_bytes),
    databaseUsedBytes: Number(data?.database_used_bytes || 0),
    egressQuotaBytes: n(data?.egress_quota_bytes),
    tiers: (data?.tiers || []).map((t) => ({
      id: t.id,
      label: t.label,
      storageBytes: n(t.storage_bytes),
      databaseBytes: n(t.database_bytes),
      notes: t.notes || ''
    })),
    buckets: (data?.buckets || []).map((b) => ({
      bucket: b.bucket,
      objectCount: Number(b.object_count || 0),
      totalBytes: Number(b.total_bytes || 0),
      largestBytes: Number(b.largest_bytes || 0),
      orphanCount: Number(b.orphan_count || 0),
      orphanBytes: Number(b.orphan_bytes || 0)
    }))
  };
}

export async function saveHostingPlan({ tier, storageOverrideBytes = null, databaseOverrideBytes = null }) {
  const { error } = await supabase.rpc('set_hosting_plan', {
    p_tier: tier,
    p_storage_override: storageOverrideBytes,
    p_database_override: databaseOverrideBytes
  });
  if (error) throw error;
}

export async function fetchOrphanObjects(bucket = AVATARS_BUCKET, limit = 200) {
  const { data, error } = await supabase.rpc('aspire_list_orphan_storage_objects', {
    p_bucket_id: bucket,
    p_limit: limit
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    name: row.object_name,
    bytes: Number(row.size_bytes || 0),
    createdAt: row.created_at
  }));
}

// Removal goes through the Storage API, not a DELETE on storage.objects:
// deleting the row would leave the actual image file in the bucket forever,
// because the bytes live outside the database. The admin delete policy added by
// the migration is what lets this call through, and it permits only paths whose
// owning account is gone.
export async function removeOrphanObjects(bucket = AVATARS_BUCKET, limit = 200) {
  const orphans = await fetchOrphanObjects(bucket, limit);
  if (!orphans.length) return { removed: 0, failed: [] };

  const paths = orphans.map((o) => o.name);
  const { data, error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;

  const removed = Array.isArray(data) ? data.length : 0;
  const removedNames = new Set((data || []).map((d) => d.name));
  const failed = paths.filter((p) => !removedNames.has(p));

  // Recorded even on a partial removal, because the count that matters for the
  // audit trail is what actually left the bucket.
  if (removed > 0) {
    const { error: logErr } = await supabase.rpc('aspire_record_storage_cleanup', {
      p_bucket_id: bucket,
      p_removed: removed
    });
    // A failed audit write must not make a successful cleanup look like a
    // failure; the page reports the removal and the console carries the rest.
    if (logErr) console.warn('Storage cleanup was not recorded:', logErr);
  }

  return { removed, failed };
}

// --- Formatting ------------------------------------------------------------

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const GIB = 1024 * 1024 * 1024;

/** Percentage used, or null when no limit has been entered. */
export function usageRatio(usedBytes, quotaBytes) {
  if (!quotaBytes || quotaBytes <= 0) return null;
  return Math.min(Number(usedBytes || 0) / quotaBytes, 1.5);
}

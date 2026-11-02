// Passphrase encryption for backup files, using the browser's own Web Crypto.
// No library: SubtleCrypto gives PBKDF2 and AES-GCM directly, and a backup
// format that depends on a CDN is a backup that stops working when the CDN does.
//
// WHY EVERY BACKUP IS ENCRYPTED
// A backup holds every student's name, email, ID number and grades. Decided by
// the owner on 2026-10-29: there is no plain-text option, because the one time
// a plain-text export gets made is the time it ends up in a shared folder.
//
// WHAT IS *NOT* ENCRYPTED, AND WHY THAT MATTERS
// The envelope keeps a clear-text header: format version, when it was taken, the
// database-structure fingerprint, and per-table row counts. Three reasons:
//
//   1. The page can tell you whether a file fits the current database *before*
//      asking for the passphrase. Otherwise a wrong-passphrase error and an
//      incompatible-backup error look identical.
//   2. You can see what a file is without being able to read anyone's records.
//   3. A lost passphrase still leaves you knowing what you lost.
//
// None of the header is personal data. Table names and row counts are structure,
// not records.
//
// THE PASSPHRASE CANNOT BE RECOVERED
// There is no key escrow and no reset. A forgotten passphrase means the file is
// gone. That is the point of encryption, and it is why the page makes you type
// it twice and offers to store a hint.

const PBKDF2_ITERATIONS = 600000;   // OWASP guidance for PBKDF2-SHA256, 2023
const SALT_BYTES = 16;
const IV_BYTES = 12;                // AES-GCM standard nonce length
const KEY_BITS = 256;

export const BACKUP_FILE_FORMAT = 2;

function subtle() {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    // Web Crypto needs a secure context. Over plain http on anything but
    // localhost, crypto.subtle is simply absent -- worth saying plainly rather
    // than letting "cannot read properties of undefined" reach the admin.
    throw new Error('Encryption is unavailable in this browser. Open ASPIRE over https, or use localhost, and try again.');
  }
  return c.subtle;
}

// Chunked because String.fromCharCode(...bytes) blows the argument limit on
// anything larger than a few hundred kilobytes, and a backup is much larger.
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

function base64ToBytes(b64) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap an exported backup document in an encrypted envelope.
 *
 * @param {object} payload   what aspire_export_backup() returned
 * @param {string} passphrase
 * @param {string} [hint]    optional reminder, stored in the clear
 * @returns {Promise<object>} the envelope to write to disk
 */
export async function encryptBackup(payload, passphrase, hint = '') {
  if (!passphrase) throw new Error('A passphrase is required.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  return {
    aspire_backup_file: BACKUP_FILE_FORMAT,
    encrypted: true,
    // Clear-text header: structure, never records. See the note at the top.
    header: {
      taken_at: payload?.taken_at || null,
      schema_fingerprint: payload?.schema_fingerprint || null,
      content_version: payload?.aspire_backup_version ?? null,
      table_count: payload?.table_count ?? null,
      database_rows: payload?.database_rows ?? null,
      account_count: Array.isArray(payload?.auth_identities) ? payload.auth_identities.length : null,
      photo_count: Array.isArray(payload?.storage_objects) ? payload.storage_objects.length : null,
      tables: (payload?.tables || []).map((t) => ({
        name: t?.name,
        rows: Array.isArray(t?.rows) ? t.rows.length : 0
      })),
      excludes: payload?.excludes || null
    },
    hint: hint || null,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt)
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(ciphertext)
  };
}

/** Read the clear-text header without needing the passphrase. */
export function readEnvelope(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file could not be read as a backup.');
  }
  if (parsed.aspire_backup_file !== BACKUP_FILE_FORMAT) {
    // An unencrypted document from an older build, or something else entirely.
    throw new Error(
      parsed.aspire_backup_version
        ? 'That backup was made by an older version of ASPIRE and cannot be restored here.'
        : 'That file is not an ASPIRE backup.'
    );
  }
  if (!parsed.encrypted || !parsed.ciphertext || !parsed.kdf?.salt || !parsed.cipher?.iv) {
    throw new Error('That backup file is incomplete and cannot be restored.');
  }
  return {
    header: parsed.header || {},
    hint: parsed.hint || '',
    envelope: parsed
  };
}

/**
 * Decrypt an envelope read by readEnvelope().
 *
 * AES-GCM authenticates as it decrypts, so a wrong passphrase and a tampered
 * file both surface here rather than as nonsense JSON later. They are reported
 * differently on purpose: one is a mistake to retry, the other is a file not to
 * trust.
 */
export async function decryptBackup(envelope, passphrase) {
  if (!passphrase) throw new Error('Enter the passphrase for this backup.');

  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.cipher.iv);
  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations || PBKDF2_ITERATIONS);

  let plaintext;
  try {
    plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
  } catch {
    throw new Error('That passphrase does not open this backup. Check it and try again — the file itself is unchanged.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    // Decryption authenticated but the contents are not a backup. That means a
    // file encrypted by something else with the same passphrase, not corruption.
    throw new Error('That file opened, but it does not contain an ASPIRE backup.');
  }
}

// A passphrase weak enough to brute-force makes the encryption decorative. This
// is advice, not a gate: an admin locked out of their own backup by a password
// rule is worse off than one with a short passphrase.
export function describePassphraseStrength(passphrase) {
  const value = passphrase || '';
  if (!value) return null;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;

  if (value.length < 12) {
    return { level: 'weak', text: 'Too short to protect a file this sensitive. Use at least 12 characters.' };
  }
  if (classes < 2) {
    return { level: 'weak', text: 'Mix in capitals, numbers, or symbols — a single kind of character is quick to guess.' };
  }
  if (value.length < 16 || classes < 3) {
    return { level: 'fair', text: 'Workable. A longer phrase of several unrelated words would be stronger and easier to remember.' };
  }
  return { level: 'strong', text: 'Strong. Write it down somewhere safe — it cannot be recovered.' };
}

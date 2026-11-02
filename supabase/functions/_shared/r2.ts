// Cloudflare R2 access, server-side only.
//
// SCOPE (confirmed decision, 2026-10-29)
//   R2 is adopted for ONE purpose: Grade Change Request evidence uploads, which
//   arrive in roadmap item #6. It does NOT replace Supabase Storage for avatars
//   -- that bucket stays exactly as it is, permanently. Do not widen this
//   module's use without revisiting that decision.
//
// WHY THIS LIVES IN AN EDGE FUNCTION AND NOT IN src/lib
//   R2 is a flat S3-compatible bucket with no row-level security. Supabase
//   Storage gives ownership checks and signed URLs for free; R2 gives neither.
//   So the credentials must never reach the browser, and every object access has
//   to be brokered by a function that checks the caller's identity first and
//   then hands back a short-lived presigned URL. A browser-side R2 client would
//   mean shipping a bucket-wide write key to every student.
//
// ENV (set by the developer in supabase/.env -- never committed, and an AI agent
// must not edit .env* files per AGENTS.md):
//   R2_ACCOUNT_ID         Cloudflare account id
//   R2_ACCESS_KEY_ID      R2 API token access key
//   R2_SECRET_ACCESS_KEY  R2 API token secret
//   R2_BUCKET_NAME        target bucket
//
// Setup notes live in docs/05-operations/storage/R2_SETUP.md.

import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.705.0'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.705.0'

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export function readR2Config(): R2Config | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET_NAME')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

// R2 ignores the region but the S3 protocol requires one; 'auto' is what
// Cloudflare documents.
export function r2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  })
}

export type BucketHealth = {
  configured: boolean
  reachable: boolean
  bucket: string | null
  latencyMs: number | null
  error: string | null
}

// A HeadBucket is the cheapest call that proves the credentials and the bucket
// name are both correct. It transfers no object data.
export async function checkBucket(): Promise<BucketHealth> {
  const config = readR2Config()
  if (!config) {
    return {
      configured: false,
      reachable: false,
      bucket: null,
      latencyMs: null,
      error: 'R2 environment variables are not set.'
    }
  }

  const started = Date.now()
  try {
    const client = r2Client(config)
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    return {
      configured: true,
      reachable: true,
      bucket: config.bucket,
      latencyMs: Date.now() - started,
      error: null
    }
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      bucket: config.bucket,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'HeadBucket failed.'
    }
  }
}

const UPLOAD_TTL_SECONDS = 300   // 5 minutes: long enough to pick a file, short enough to be useless if leaked
const DOWNLOAD_TTL_SECONDS = 300

// Presigned PUT for an upload. The CALLER is responsible for having already
// verified who the user is and that they may write this key -- this module does
// not and cannot know that.
export async function signUpload(key: string, contentType: string): Promise<string> {
  const config = readR2Config()
  if (!config) throw new Error('R2 is not configured.')
  const client = r2Client(config)
  return await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_TTL_SECONDS }
  )
}

// Presigned GET for a download. Same caveat: authorize before calling.
export async function signDownload(key: string): Promise<string> {
  const config = readR2Config()
  if (!config) throw new Error('R2 is not configured.')
  const client = r2Client(config)
  return await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: DOWNLOAD_TTL_SECONDS }
  )
}

// Key layout for item #6's evidence files. Prefixing by request id keeps one
// dispute's attachments together and makes an object's owner inferable from its
// key, which matters because R2 itself enforces nothing.
export function evidenceKey(requestId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120)
  return `grade-change-evidence/${requestId}/${Date.now()}_${safe}`
}

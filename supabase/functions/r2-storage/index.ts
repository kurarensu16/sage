import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from 'npm:@aws-sdk/client-s3@3.705.0'

// Cloudflare R2 access, brokered server-side.
//
// WHY EVERYTHING R2 LIVES IN ONE FUNCTION
// This project deploys edge functions from the Supabase dashboard, which
// uploads only the files shown in its editor -- so an import from
// ../_shared/ cannot resolve and bundling fails. The alternative was to inline
// the same R2 helpers into every function that needs them, which would mean
// several copies of the signing logic and a certainty that one day only one of
// them gets fixed.
//
// So R2 has exactly one entry point, and an `action` chooses what it does. The
// credentials, the client and the bucket check exist once.
//
// WHY A FUNCTION AT ALL
// R2 is a flat S3-compatible bucket with NO row-level security. Supabase
// Storage gives ownership checks and signed URLs for free; R2 gives neither.
// The credentials must therefore never reach a browser, and every object access
// has to be brokered by something that checks who is asking FIRST and then
// hands back a short-lived presigned URL. A browser-side R2 client would mean
// shipping a bucket-wide write key to every student.
//
// ENV (set as Edge Function secrets, never committed):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//
// Replaces the r2-health function, which could not be deployed from the
// dashboard because it imported from _shared.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

// --- R2 ---------------------------------------------------------------------

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

function readR2Config(): R2Config | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET_NAME')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

// R2 ignores the region but the S3 protocol requires one; 'auto' is what
// Cloudflare documents.
function r2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  })
}

// Cloudflare's published free allowance for R2 storage. Returned in the
// response rather than hard-coded in the page, so the figure has one home.
//
// Only storage is metered here. R2 also meters Class A and Class B operations
// (1M and 10M per month free), but this system makes a handful per admin page
// load and a few per upload -- counting them would cost more attention than it
// could ever save.
const R2_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024

// Listing is a Class A operation and pages at 1000 keys. The cap exists so a
// bucket that unexpectedly grows cannot turn an admin page load into hundreds
// of billed calls; past it the figures are reported as a floor, not a total.
const MAX_LIST_PAGES = 10

// Sums what is actually stored. Separate from the health check because it costs
// list operations, where HeadBucket costs almost nothing -- but they are
// returned together so the page makes one request, not two.
async function readUsage(client: S3Client, bucket: string) {
  let token: string | undefined
  let objectCount = 0
  let totalBytes = 0
  let pages = 0
  let truncated = false

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
      MaxKeys: 1000
    }))
    for (const obj of page.Contents ?? []) {
      objectCount += 1
      totalBytes += Number(obj.Size) || 0
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
    pages += 1
    if (pages >= MAX_LIST_PAGES && token) { truncated = true; break }
  } while (token)

  return { objectCount, totalBytes, truncated }
}

// A HeadBucket is the cheapest call that proves the credentials AND the bucket
// name are both right. It transfers no object data.
//
// The two failure modes are reported separately on purpose, because they need
// different fixes: "not configured" means a secret is missing or misspelled,
// while "configured but unreachable" means the values are wrong -- in practice
// almost always the bucket name or the token's bucket scope, rarely the keys.
async function checkBucket() {
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
    const latencyMs = Date.now() - started

    // Usage is attempted only AFTER the bucket is known reachable, and its
    // failure is not the bucket's failure: a token with read-write on objects
    // but no list permission would break the sum while uploads and downloads
    // work perfectly. Reporting that as "unreachable" would send someone
    // debugging credentials that are fine.
    let usage: { objectCount: number; totalBytes: number; truncated: boolean } | null = null
    let usageError: string | null = null
    try {
      usage = await readUsage(client, config.bucket)
    } catch (err) {
      usageError = err instanceof Error ? err.message : 'Could not list objects.'
    }

    return {
      configured: true,
      reachable: true,
      bucket: config.bucket,
      latencyMs,
      error: null,
      objectCount: usage?.objectCount ?? null,
      totalBytes: usage?.totalBytes ?? null,
      truncated: usage?.truncated ?? false,
      limitBytes: R2_FREE_STORAGE_BYTES,
      usageError
    }
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      bucket: config.bucket,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'HeadBucket failed.',
      objectCount: null,
      totalBytes: null,
      truncated: false,
      limitBytes: R2_FREE_STORAGE_BYTES,
      usageError: null
    }
  }
}

// --- Handler ----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user) return json({ error: 'Not authenticated' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'health')

    // Each action authorizes separately. R2 enforces nothing itself, so this
    // function is the only thing between a presigned URL and whoever asks for
    // one -- a single shared permission check would be the wrong shape, since
    // reading storage health and uploading evidence are not the same right.
    if (action === 'health') {
      const { data: profile, error: profileErr } = await supabase
        .from('users')
        .select('role, status')
        .eq('user_id', auth.user.id)
        .maybeSingle()

      if (profileErr || !profile) return json({ error: 'Profile not found' }, 403)
      if (profile.role !== 'admin' || (profile.status ?? 'active') !== 'active') {
        return json({ error: 'Only an active administrator may read storage health.' }, 403)
      }

      return json(await checkBucket(), 200)
    }

    // sign-upload and sign-download arrive with the evidence broker. They are
    // deliberately absent rather than stubbed: an unauthorized signing endpoint
    // that happens to be unfinished is still an endpoint.
    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Storage check failed.' },
      500
    )
  }
})

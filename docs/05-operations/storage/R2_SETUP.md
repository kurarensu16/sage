# Cloudflare R2 setup

**Status:** Current. Groundwork built in Phase 2; the first consumer (Grade
Change Request evidence uploads) arrives in roadmap item #6.
**Who does this:** the developer. An AI agent must not edit `.env*` files, per
`AGENTS.md`.

## What R2 is and is not used for here

| | |
|---|---|
| **Used for** | Grade-change request evidence uploads only |
| **Not used for** | Profile photos. Avatars stay on Supabase Storage's private `avatars` bucket **permanently** — this was decided explicitly, not deferred |

The reason the scope is this narrow: Supabase Storage already gives ownership
checks and signed URLs for free. R2 is a flat S3-compatible bucket with **no
row-level security at all**, so every object needs its access brokered by code.
That is worth doing for a new file type; it is not worth re-doing for avatars
that already work.

## Why access is brokered by an edge function

Because R2 enforces nothing itself, a browser-side R2 client would mean shipping
a bucket-wide key to every student. So:

1. The browser asks an edge function for permission to upload or download.
2. The function verifies who the caller is and whether they may touch that object.
3. Only then does it mint a **presigned URL valid for 5 minutes**.
4. The browser uses that URL directly; the credentials never leave the server.

Code: [`supabase/functions/r2-storage/index.ts`](../../../supabase/functions/r2-storage/index.ts) —
one function for everything R2, with an `action` choosing what it does
(`health` today; `sign-upload` and `sign-download` arrive with the evidence
broker).

It is a **single file with no imports from `_shared/`** on purpose. This project
deploys edge functions from the Supabase dashboard, which uploads only the file
in its editor, so a `../_shared/` import cannot resolve and bundling fails. The
alternative — inlining the same R2 helpers into every function that needs them —
would mean several copies of the signing logic and a certainty that one day only
one of them gets fixed. Hence one entry point, with the credentials, the client
and the bucket check existing exactly once.

The former `r2-health` function was replaced by this for that reason.
[`supabase/functions/_shared/r2.ts`](../../../supabase/functions/_shared/r2.ts)
still holds the signing helpers and is absorbed into `r2-storage` when the
broker is built.

## Setup steps

### 1. Create the bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name it something unambiguous, for example `aspire-evidence`.
3. Location: pick the hint nearest your users (APAC for the Philippines).
4. **Leave public access disabled.** Every read goes through a presigned URL; a
   public bucket would make unguessable keys the only protection, which is a
   materially weaker guarantee than the avatars bucket has today.

### 2. Create a scoped API token

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permission: **Object Read & Write**.
3. Scope it to **only** the bucket from step 1 — not "all buckets". If the token
   leaks, the blast radius should be one bucket of evidence files.
4. Copy the **Access Key ID** and **Secret Access Key** now; the secret is shown
   once.
5. Note your **Account ID** from the R2 overview page.

### 3. Set the environment variables

Add to `supabase/.env` (server-side only, never committed, never `VITE_`-prefixed
— a `VITE_` variable is compiled into the browser bundle, which would defeat the
entire design):

```
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=aspire-evidence
```

Then set the same four as function secrets so the deployed functions can read
them:

```
supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=...
```

### 4. Deploy the health function

```
supabase functions deploy r2-storage
```

### 5. Verify

Open **Admin → System Maintenance → Storage Health (R2)**.

| What you see | What it means |
|---|---|
| **Not configured** | The four variables are not set. This is the correct state before step 3 |
| **Reachable** + a latency figure | Credentials and bucket name are both right |
| **Unreachable** with an error | Credentials, bucket name, or token scope is wrong — the error text names which |
| "The r2-storage edge function is not deployed yet" | Step 4 has not been run |

A non-admin calling `r2-storage` receives `403`. Confirm that too.

## How a URL actually reaches the viewer

Worth being explicit, since "signed URL" hides the mechanics:

1. Client calls the edge function with its Supabase session token.
2. Function confirms the session and the caller's right to that object.
3. Function returns a URL of the form
   `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-Signature=…&X-Amz-Expires=300`.
4. The browser `PUT`s or `GET`s that URL directly — the file does not pass
   through the edge function, so large attachments do not consume function time.
5. After five minutes the signature is worthless. Anyone who intercepts the URL
   after that gets `403`.

Object keys follow `grade-change-evidence/<request_id>/<timestamp>_<filename>`,
so one dispute's attachments stay together and an object's owner is inferable
from its key — which matters precisely because R2 itself enforces nothing.

## Operational notes

- **Two storage systems now exist.** Supabase Storage holds avatars; R2 holds
  evidence. That is the accepted cost of not migrating a working avatar path.
- **Usage totals are deliberately not polled** by the Storage Health page: R2
  bills per operation, and a page left open would accrue cost for information the
  Cloudflare dashboard already shows.
- **Rotating the token:** create a new one, update the four variables and the
  function secrets, redeploy, then revoke the old token. Presigned URLs already
  issued under the old key stop working immediately, so rotate outside a busy
  window.

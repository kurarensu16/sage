# Hosting tiers and cost

- **Status:** Proposed (planning reference for institutional adoption)
- **Related:** [E-15 capacity and load test](README.md) · [Scalability overview](../SCALABILITY_AND_DATA_HANDLING_2026-10-10.md)

> **Verify every limit and price on each provider's official pricing page at the time of adoption.** The figures below are the commonly published values as understood on 2026-10-10. They change over time and are given for planning only.

## 1. Current deployment (research prototype)

| Service | Plan | Used for |
|---|---|---|
| Supabase | Free | Database, auth, storage (avatars, APK), realtime, Edge Functions, pg_cron email drain |
| Vercel | Hobby (free) | Hosting the PWA (static files over a CDN) |
| Gmail SMTP | Free Gmail account | Email notifications (`send-email` Edge Function) |
| AI provider | Free models (via OpenRouter) | AI Study Tutor and faculty intervention drafts |

This is appropriate for development, testing, and the defense demonstration with synthetic data.

## 2. Free-tier limits that matter

| Service | Limit (approximate) | Effect on ASPIRE |
|---|---|---|
| Supabase Free | About **200 simultaneous realtime connections**; small shared compute; 500 MB database; limited monthly bandwidth and Edge Function calls; **the project pauses after about 7 days without activity** | Live notifications stop above about 200 online users. Polling (F-05) overloads the small compute well before 1,000 users. A paused project means downtime until it's restored. |
| Vercel Hobby | Monthly bandwidth cap; terms limit use to **personal, non-commercial** projects | Serving files is easy at scale; an official school deployment may not fit the Hobby terms. |
| Gmail (free) | About **500 emails per day** | One grade posting for a few hundred students plus guardians can use up the day's quota. |
| AI free models | Small per-minute and per-day request limits | Many students opening the AI Study Tutor at once get "too many requests". |

## 3. Tiers by size of adoption

| Tier | Typical use | Hosting | Enhancements required | Rough monthly cost (USD) |
|---|---|---|---|---|
| **0: Prototype** | Development, defense demo, one-class pilot (dozens of users) | All free (current) | None (keep demo data within the limits in the defense Q&A) | 0 |
| **1: Department** | One department; a few hundred accounts; up to about 150–200 online at once | Supabase Pro (no pausing, daily backups, higher limits); a transactional email service; Vercel plan per its terms | **P0 (E-01–E-04)** and **E-05** (remove polling) | about 25–75 |
| **2: Institution** | Whole school; 1,000+ online at once (e.g., grade-posting day) | Supabase Pro plus a larger **compute add-on** and a **higher realtime connection quota**; a transactional email service sized for peak postings; Vercel Pro if required by the terms; a paid AI quota | **P0 + P1 + P2**, then **E-15 load test** passing | about 100–300+, depending on compute size, email volume, and AI usage |

The cost figures are order-of-magnitude estimates. The biggest variables are the database compute size, email volume (students plus guardians per posting), and AI usage.

## 4. Questions for the school before adoption
1. How many **students, faculty, and guardians** would have accounts?
2. What is the **peak** number of people online at once (usually grade-posting days)?
3. How many **emails** per posting (students plus guardians) and per semester?
4. Does the school have an existing **Google Workspace** or email service and **cloud budget**?
5. Who owns and pays for the accounts (school IT vs. the developers)?
6. Data-protection requirements (RA 10173): data residency, backups, retention.

## 5. How to decide
1. Estimate peak online users and emails per posting (questions 1–3).
2. Pick the tier from §3.
3. Implement the required enhancements.
4. Run E-15 (load test) on the chosen plan with a staging copy of the database.
5. Launch only when E-15 passes.

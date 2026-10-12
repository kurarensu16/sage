# President's List GWA wording fix

- **Date:** 2026-10-12 09:52 (Philippine time)
- **AI tool:** Codex (GPT-6)
- **Approved by (device owner):** kurarensu16 (sadiazaclarence@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed

- `supabase/functions/invoke-advisor/index.ts`
- `docs/README.md`
- `docs/05-operations/agents/feature-updates/2026-10-12_0952_presidents-list-gwa-wording.md`

## What changed and why

A direct live student test produced the correct President's List eligibility result but mislabeled 1.75 as a minimum GWA. The developer explicitly approved correcting the wording. The existing honors rule in the shared chat/insight system prompt now calls 1.75 the maximum allowed GWA, explains that numerically lower grades are better, prohibits the minimum-GWA wording, and supplies the labels "GWA ceiling: 1.75" and "maximum GWA: 1.75". It distinguishes this ceiling from the minimum 18-unit requirement.

The numerical eligibility condition remains `GWA <= 1.75`. This is a prompt wording fix, with no grading-engine or database change. Hosted deployment is left to the developer as agreed for the preceding fallback setup.

## How to verify

1. Deploy the updated `supabase/functions/invoke-advisor/index.ts` source to the existing `invoke-advisor` function.
2. In AI Study Tutor → Ask ASPIRE, ask: "Am I eligible for the President's List? Check my units, GWA, subject grades and INC status."
3. Confirm the reply labels the 1.75 requirement as a maximum or ceiling, uses a minimum only for the enrolled-unit requirement, and retains the existing four eligibility checks.

Before deployment, the modified TypeScript parsed successfully and the actual updated prompt was checked against `apodex/apodex-1.1-mini:free` using only synthetic academic context. The provider returned complete validated JSON in 2.4 seconds with zero reported cost. Its GWA check read: "GWA: 2.50 tentative running GWA (need maximum 1.75)". This check verifies the intended wording for one response; generated wording can vary across requests and providers. Hosted verification remains pending redeployment.

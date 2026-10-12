# Ask ASPIRE: unambiguous President's List subject-floor wording

- **Date:** 2026-10-11 20:45 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None. Redeploy the `invoke-advisor` edge function.

## Files changed
- `supabase/functions/invoke-advisor/index.ts`

## What changed and why
The President's List policy given to the AI said "no individual subject grade below 2.0". On DYCI's 1.00–5.00 scale, where a lower number is a better grade, a model could read "below 2.0" backwards and fail a 1.75 subject. The deterministic eligibility check (`getHonorTier` in `src/lib/academicPolicy.js`) was already correct: it fails any subject grade higher than 2.00, checked per subject.

The prompt now says: no individual subject grade worse than 2.00. On DYCI's scale a higher number is a worse grade, so 1.00–2.00 passes and 2.25 or higher fails. Each subject is checked separately using its `runningGwa`.

## How to verify
After redeploying, ask Ask ASPIRE "Am I eligible for the President's List?" for a student with a 2.50 subject. The reply lists condition 2 as failing for that subject. A student whose subjects are all 2.00 or better gets condition 2 as passing.

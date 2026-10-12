# Ask ASPIRE: cut-off replies, time limit, structured answers, useful offline fallback

- **Date:** 2026-10-11 22:07 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix (edge function reliability), Polish (answer layout, offline fallback)
- **Migration:** None. Redeploy the `invoke-advisor` edge function.

## Files changed
- `supabase/functions/invoke-advisor/index.ts`
- `src/lib/openrouter.js`

## What changed and why
The logs of a failed question showed two problems:
- The main free model (`poolside/laguna-s-2.1:free`) returned 429 (rate-limited upstream).
- The only backup (`openrouter/free`) returned replies cut off mid-JSON ("Unterminated string in JSON at position 558 / 915").

The 600-token cap was too small for free models that reason before answering. The student then saw "I am currently unable to process complex requests". Separately, some answers came back as one long paragraph even when they listed several points.

Edge function:
- **Token cap raised from 600 to 1,500.** The reply itself is still capped at 180 words by the prompt.
- **Cut-off replies** (`finish_reason: "length"`) are logged as `model_output_truncated`, and the next model is tried right away instead of retrying the same one.
- **Total time limit of 60 seconds** across all models, logged as `time_budget_exceeded`. Each try's timeout shrinks to fit what is left.
- **Rule 15 is now mandatory, with a worked example.** Answers longer than two sentences must use a summary sentence, a blank line, then numbered points. No paragraph may be longer than two sentences.
- **Safety net `normalizeMessageLayout`.** A single-paragraph reply with two or more inline numbered points ("(1)…(2)…" or "1. … 2. …") gets one point per line. Plain prose and decimals such as 3.00 are left untouched.

Client:
- **Offline fallback.** When every model fails, Ask ASPIRE now answers from the student-visible evidence shown in the panel (up to 4 numbered items) and asks the student to try again in a minute. This replaces "I am currently unable to process complex requests…" and keeps the paper's documented "deterministic local fallback".

Backup models are configured separately with the `OPENROUTER_FALLBACK_MODELS` secret (no code change). The setup guide was given to the developer who manages OpenRouter.

## How to verify
1. Redeploy: `supabase functions deploy invoke-advisor`.
2. Ask "How am I doing in this subject?" in the ITC113 Ask ASPIRE panel. The reply has a summary sentence, then numbered lines.
3. Logs show `invoke-advisor answered { model }`. A busy model shows `provider_model_failed`, and a cut-off one shows `model_output_truncated` before the next model answers.
4. When all models fail, the reply lists up to 4 records from "Evidence available to ASPIRE" with "try again in a minute".
5. `npm run lint` (0 errors) and `npm run build` pass. A syntax check of the edge function passed, and the numbering safety net was tested on sample replies.

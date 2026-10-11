# Ask ASPIRE fallback models (same pattern as faculty AI drafts)

- **Date:** 2026-10-11 20:03 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None. Redeploy the `invoke-advisor` edge function.

## Files changed
- `supabase/functions/invoke-advisor/index.ts`

## What changed and why
Ask ASPIRE's only backup was a hard-coded `meta-llama/llama-3-8b-instruct:free`. It was passed together with the main model in one request and retried once. If OpenRouter retired that free model, Ask ASPIRE had no working backup, and changing it needed a code edit.

It now follows `generate-intervention-draft`:
- **Model list:** `ADVISOR_MODEL` or `OPENROUTER_MODEL` first, then the fallbacks. The fallbacks come from `ADVISOR_FALLBACK_MODELS`, otherwise the shared `OPENROUTER_FALLBACK_MODELS`, otherwise `openrouter/free`. The hard-coded Llama model is removed.
- **Order:** models are tried one at a time. A provider failure (400, 402, 404, 408, 409, 429, 5xx) or a lost connection moves to the next model. Unusable output retries the same model once at temperature 0, then moves on. 400 is included because some free fallback models reject the JSON-only response option.
- **Time limit:** 25 seconds per try, so a stuck model cannot use up the function's time.
- **Logs:** each failed model and the model that answered (`provider_model_failed`, `model_output_invalid`, `provider_connection_failed`, `all_models_failed`, `answered`).

Unchanged: the rules, the JSON check, the required boundary statement, and the built-in local answer in `src/lib/openrouter.js` when every model fails.

## How to verify
1. Redeploy: `supabase functions deploy invoke-advisor`.
2. Optional: in Supabase Edge Function secrets, set `OPENROUTER_FALLBACK_MODELS` (comma-separated). If it is not set, `openrouter/free` is used.
3. Ask Ask ASPIRE a question. The function's Logs show `invoke-advisor answered` with the model used.
4. To test failover, temporarily set `ADVISOR_MODEL` to a non-existent model id. The log shows `provider_model_failed` for it, then `answered` with a fallback model. Remove the setting afterward.

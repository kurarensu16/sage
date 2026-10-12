# Free AI fallback setup and reasoning fix

- **Date:** 2026-10-12 09:10 (Philippine time)
- **AI tool:** Codex (GPT-6)
- **Approved by (device owner):** kurarensu16 (sadiazaclarence@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed

- `supabase/functions/invoke-advisor/index.ts`
- `supabase/functions/generate-intervention-draft/index.ts`
- `docs/README.md`
- `docs/05-operations/agents/feature-updates/2026-10-12_0910_free-ai-fallback-reasoning.md`

## What changed and why

The developer assigned the free backup-model setup and approved reasoning-capable backups after checking the current OpenRouter catalog. Simple JSON hello tests passed for Apodex Mini and Dots, but the actual Ask ASPIRE prompt produced truncated responses at the existing 1,500-token cap: hidden reasoning consumed the output budget. Both OpenRouter requests now send `reasoning: { enabled: false }`. The advisor token cap, prompts, validators, primary model selection, authentication, and fallback order remain as configured before this fix.

The developer explicitly approved edits to both edge functions and the documentation index, and chose to apply Supabase settings and deployments manually. No hosted secret, account privacy setting, database, or deployment was changed in this session. The live provider checks used the existing local OpenRouter key and only generic prompts or synthetic academic evidence. Compatibility with the hosted key and account policy still requires the manual check below.

### Observed provider checks

These are individual test results, not latency or availability guarantees. The two selected backups advertise JSON response support and context windows above 32K in the [OpenRouter model catalog](https://openrouter.ai/api/v1/models). Their free endpoints were served by different providers during the checks: Novita for Apodex and AtlasCloud for Dots.

| Model | Actual prompt | Result with reasoning disabled | Observed duration | Reported cost |
|---|---|---|---|---|
| `apodex/apodex-1.1-mini:free` | Ask ASPIRE chat | Complete JSON with the expected response fields | 8.6 seconds | 0 |
| `dots-studio/dots-3-note-preview:free` | Ask ASPIRE chat | Complete JSON with the expected response fields | 3.6 seconds | 0 |
| `poolside/laguna-s-2.1:free` | Ask ASPIRE chat | Passed the existing advisor response validator | 7.1 seconds | 0 |
| `apodex/apodex-1.1-mini:free` | Faculty draft | Passed the existing draft validator | 9.2 seconds | 0 |
| `dots-studio/dots-3-note-preview:free` | Faculty draft and existing lower-temperature retry | Rejected by the existing action-verb validator on both attempts | 8.3 / 7.4 seconds | 0 |

Without the new setting, Apodex and Dots both returned `finish_reason: "length"` for the chat prompt. With it, both returned `finish_reason: "stop"` and zero reported reasoning tokens. Google Gemma candidates returned upstream 429 errors and were not selected. NVIDIA's free endpoint was excluded from the recommended lists because its [model page](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free) advises against submitting personal or confidential information.

[OpenRouter documents](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) that reasoning and visible replies can share `max_tokens`. Model diversity can help with upstream failures; it does not bypass [OpenRouter's account-wide free usage limits](https://openrouter.ai/docs/api/reference/limits).

## Manual Supabase setup

Project: `ettnwknyhdhehoclrwwh`.

In Edge Functions → Secrets, add or update:

```text
OPENROUTER_FALLBACK_MODELS=apodex/apodex-1.1-mini:free,dots-studio/dots-3-note-preview:free,openrouter/free
INTERVENTION_FALLBACK_MODELS=apodex/apodex-1.1-mini:free,openrouter/free
```

`ADVISOR_FALLBACK_MODELS`, if already configured, overrides the shared list. Set that override to the same value as `OPENROUTER_FALLBACK_MODELS` if it exists. The separate intervention list avoids sending faculty drafts to Dots, whose output failed the faculty validator in these checks.

Keep the current API key and primary model secrets. A successful provider check did not require changing the locally tested account's privacy policy; hosted account settings were not inspected. If the hosted key encounters `No endpoints found matching your data policy`, review the affected provider and account policy before allowing training on academic records.

Deploy the updated source for both `invoke-advisor` and `generate-intervention-draft`. [Supabase applies secret changes without requiring deployment](https://supabase.com/docs/guides/functions/secrets); deployment is required here to publish the code fix.

## How to verify

1. After deploying both functions and saving the secrets, sign in as a student and ask about a subject in AI Study Tutor → Ask ASPIRE.
2. Check `invoke-advisor` logs for `invoke-advisor answered` and record the model. A primary-model answer proves the service works but does not exercise a fallback. If the primary is unavailable, confirm a selected fallback answers after the failure log.
3. Confirm the message is complete and that there is no `model_output_truncated` entry for the answering model. Capture the successful log line for the assignment handoff.
4. As faculty, generate a draft from saved academic evidence. Confirm it contains three validated tasks. Check for provider or validation failures if it does not.
5. Recheck model availability when failures recur. Dots' [model page](https://openrouter.ai/dots-studio/dots-3-note-preview:free) currently lists retirement on December 31, 2026.

Hosted verification and the requested log screenshot remain pending the developer's manual deployment.

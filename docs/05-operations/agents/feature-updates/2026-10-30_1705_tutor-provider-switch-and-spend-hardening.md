# AI Study Advising — provider switch and spend hardening

- **Date:** 2026-10-30 17:05 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration (not yet applied):** `20261030164030_tutor_budget_and_usage.sql`
- **Redeploy required:** `invoke-study-tutor`

The project moved from OpenRouter to a **direct DeepSeek account with a $2
ceiling**. That changes what the limits are for.

## Files changed

**New**
- `supabase/migrations/20261030164030_tutor_budget_and_usage.sql`
- `src/lib/aiBudgetService.js`

**Changed**
- `supabase/functions/invoke-study-tutor/index.ts`
- `src/pages/admin/StorageHealth.jsx`
- `src/pages/admin/Dashboard.jsx`

## The gap this closes

The tutor already had a per-student burst limit and a per-student daily cap.
Neither bounds total spend. **A per-user limit multiplied by the number of users
is not a bound on anything** — with 116 accounts, the old cap of 20/day allowed
over 2,000 calls in a day, which is approximately the entire $2 balance.

The failure mode mattered as much as the number: the balance would empty with no
warning, and the first symptom would be the tutor dying in front of a panel.

So there are now two ceilings answering different questions:

| Ceiling | Question it answers | Default |
|---|---|---|
| Per student, per Philippine day | Is one student abusing this? | 25 |
| **Global, since a reset point** | **Can we still afford to answer anyone?** | **1500** |

Both live in `system_settings`, changeable by an administrator **without a
redeploy** — which matters mid-presentation, when redeploying is not an option.

## Owner's decisions

| Decision | Outcome |
|---|---|
| Provider | **Direct DeepSeek**, model `DeepSeek-V4.1-Flash-1017` |
| Limits | 1500 total, 25 per student per day |
| When exhausted | Refuse new AI answers; admin can raise the ceiling from the UI |
| Continuity | **In**, capped at one prior exchange |
| Where shown | **Both** Admin Dashboard (summary) and Storage Health (detail) |

On the limits: the owner first said "2000 per student per day", then "let's go
with the safer route". The safer reading was taken because the asymmetry is
one-sided — a ceiling set too low costs fifteen seconds to raise, while one set
too high costs the balance with no warning. Worth re-confirming.

## What was verified rather than assumed

**Web search does not work on this model.** DeepSeek documents `web_search` as
supported on `deepseek-v4-pro`; the Flash model **accepts the request and
ignores the tool**. A search that never happens is indistinguishable from one
that found nothing, so this is recorded as a comment in `callModel()` to stop
anyone adding the parameter later and believing it worked.

That confirms the existing design rather than limiting it: links reach students
only from faculty-attached resources and from search URLs this system builds out
of the admin-curated `search_destinations` table.

**Model ids differ between the provider's own API and the gateways that resell
it** (`deepseek-flash`, `deepseek/deepseek-v4.1-flash-1017`,
`deepseek-ai/DeepSeek-V4.1-Flash-1017`). The owner confirmed
`DeepSeek-V4.1-Flash-1017` from their own account, which overrides what the
public sources said.

## Changes to the function

**Provider is configuration, not code.** `TUTOR_API_BASE` and `TUTOR_API_KEY`;
both providers speak the OpenAI chat-completions shape, so switching back is two
environment variables.

**A wrong model id no longer reads as an outage.** A 400/404 mentioning the
model returns a distinct error, and the student is told the system is not set up
correctly rather than that the tutor is unreachable — because the two need
different fixes and the generic message sends you looking in the wrong place.

**Link stripping on every path, not just one.** The keyword branch already
filtered anything link-shaped; `explain`, `plan` and `practice` did not. The
system prompt says never to invent links, but a prompt is a request — now the
message, follow-ups, plan items, questions, choices and explanations are all
stripped. This matters more on Flash than it would elsewhere: with no web
access, any URL it produces is recalled from training and unverifiable by
construction.

**Effort per action.** `practice` gets `high`, everything else `low`. Writing
five multiple-choice questions with plausible *wrong* answers is the only
genuinely hard task here; weak distractors make practice worthless. Sent only
when `TUTOR_EFFORT_PARAM` names the provider's parameter, so a wrong guess at
the parameter name cannot break every call.

**Continuity.** The last exchange on the same topic is fed back, capped at ~400
characters. Without it a student asking about a topic twice gets two unrelated
explanations, the second ignoring that they scored 3 of 5 on practice in
between.

Only the **message** is carried back, never the stored response wholesale: a
practice response holds the correct answers, and feeding those into a later
prompt would risk the model repeating them.

**Token accounting.** `prompt_tokens`, `completion_tokens` and `model_served`
are recorded per call. `model_served` is what the provider says actually
answered, not what was asked for — a model name is often an alias repointed at a
newer snapshot without notice, and for a thesis "which model produced these
results" should be answerable from data rather than from a configuration value
that may since have moved.

## A bug found while writing this

The continuity read looked for `response.message` in `student_tutor_log` — but
the log only ever stored ids and the model name, never the reply. It would have
found nothing on every request and failed silently, looking like a model that
just ignored the instruction. The log writes now store a truncated message.

## Known limitations

- **The spend figure is in calls and tokens, never money.** Nothing reports
  actual charges back, so the UI shows tokens and says to multiply by the
  provider's published price. A confident currency figure the system cannot
  verify would be worse than none.
- **No fallback chain.** Going direct means one provider: if DeepSeek is
  unavailable, the tutor is unavailable. It fails with a plain message.
- **The effort parameter name is unconfirmed.** It is omitted unless
  `TUTOR_EFFORT_PARAM` is set, so this costs nothing until verified.

## Environment to set

```
TUTOR_API_BASE   https://api.deepseek.com
TUTOR_API_KEY    <DeepSeek key>
TUTOR_MODEL      DeepSeek-V4.1-Flash-1017
TUTOR_EFFORT_PARAM   (optional, once the parameter name is confirmed)
```

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean ·
`npm run verify:grading` passes.

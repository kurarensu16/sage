# Intervention form wording, type scale, and sidebar hierarchy

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None

## Files changed
- `src/pages/faculty/StudentRiskEvaluationModal.jsx`
- `src/index.css`
- `src/components/layout/Sidebar.jsx`
- 29 files containing sub-10px type (see "Type scale" below)

## What changed and why

Phases 5 and 6 (ASPIRE-C03, C05).

**Intervention form (C03).** Added the literal instruction "Select the action(s) you intend to take." above the task list, and an explicit per-task **Edit** control that focuses and selects that task's text.

The plan allowed either a full edit/save toggle or, at minimum, a labelled button that focuses the field. The focus button was chosen deliberately: a toggle would make each description read-only until clicked, which unmounts the `required` input and removes the browser-level empty check, and it would interact with the draft autosave that fires on task changes. The submit guard would still catch an empty task, but the toggle would buy a visible affordance at the cost of changing a working validation path.

No change to the draft/finalize/lock behaviour. Post-finalization editing still works as before — editable until a follow-up snapshot is recorded, with content-diff-triggered re-acknowledgment. That was a documentation-clarity question, not a workflow restriction.

**Type scale (C05).** `@theme` in `src/index.css` defined colour and font-family tokens but no font-size tokens, and the interface contained 151 arbitrary sub-10px sizes (`text-[7px]`, `[8px]`, `[9px]`) across 29 files, unreadable on phones and high-DPI screens. Added `--text-micro` (10px) and `--text-tiny` (11px) tokens and migrated all 151 occurrences to `text-micro`.

The floor is **10px, not the 12px the plan suggested**: 10px and 11px account for ~908 existing usages, so a 12px floor would have made the smallest class larger than the text around it, inverting the scale and risking overflow in dense grade tables.

**Sidebar (C05).** The hierarchy was already correct in direction — group headers at 10px were smaller than nav labels at `text-xs` (12px). What was actually wrong is that both were arbitrary values. They now use the tokens, giving a deliberate scale: micro (10) → tiny (11) → xs (12) → sm (14). No arbitrary sizes remain in the sidebar.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §11 and §12. In particular §12.2: badges, table footnotes and stat captions must still fit their containers after the size increase.

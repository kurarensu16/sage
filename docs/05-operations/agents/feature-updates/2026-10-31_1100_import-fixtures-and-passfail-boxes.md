# Import fixtures, and pass/fail boxes on the full-cycle checklist

- **Date:** 2026-10-31 11:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New material, approved by the owner
- **Migrations:** none

## Files changed

- `docs/04-testing/import-fixtures/` (new) — three `.xlsx` files and a README
- `docs/04-testing/ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md`

## Import fixtures

Three workbooks, built from the live catalogue the owner queried today — 10
colleges, 26 programs, 8 sections, 12 subjects, 2026–2027 1st semester — each
producing **one clean row, several that already exist, and one row per error
reason**.

| File | Path | Rows |
|---|---|---|
| `ASPIRE_Import_Users_DEMO.xlsx` | Admin → Manage Users → Import | 1 ready · 3 exist · 9 error |
| `ASPIRE_Import_Subjects_DEMO.xlsx` | Registrar → Subjects | 1 ready · 2 exist · 1 error |
| `ASPIRE_Import_Sections_DEMO.xlsx` | Registrar → Manage Sections | 1 ready · 2 exist · 1 error |

The importer already classifies rows as `ready` / `conflict` / `error` and shows
them before writing anything, so the preview screen is itself the demonstration.
Nothing had to be invented for this.

Each workbook carries a second sheet, `Expected outcome`, with the expected
result per row and a sentence to say about it. The importer reads
`SheetNames[0]` only, so the crib is invisible to the system.

**Verified by parsing them back** through `XLSX.utils.sheet_to_csv`, the same
call the importer makes: 10, 4 and 5 columns on every row, headers detected by
each page's own rule, no commas inside any field.

### One error the files cannot produce

`sheet_to_csv` pads every row to the sheet's full column range, so a short row
still arrives with all ten columns and the "insufficient columns" branch is
unreachable from a spreadsheet. It is shown by pasting a short line into the CSV
box instead, and the README says so rather than leaving a row that silently
fails for a different reason than advertised.

### Regeneration

Section rows are matched against the **active** term, so every section row will
fail after the rollover to 2nd semester. The README says to re-run the catalogue
query and rebuild. Generator: `make_import_fixtures.js` in the scratchpad.

## Pass/fail boxes

The owner asked for two boxes per check, so a failure can be marked and
annotated in place. Every check became:

```
- [ ] ok  [ ] **bug** — <check>  ·  _note:_
```

**64 checks converted.** A check can span several lines, so the note slot is
appended to the item's **last** line; appending to the first would drop it into
the middle of a sentence.

Added with it: a worked example of a ticked bug, a **bug log** table for anything
needing more than a line, and a **pass record** table for the four runs. The bug
log asks for what the screen did rather than what it should have done, since the
expectation is already in the checklist and the observation is not.

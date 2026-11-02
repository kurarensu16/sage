# Import fixtures — deliberately mixed Excel files

Three workbooks for demonstrating the bulk-import paths. Each one is built to
produce **one clean row, some that already exist, and one row per error reason**,
so the preview screen itself becomes the demonstration.

Built 2026-10-31 against the live catalogue: 10 colleges, 26 programs, 8 sections
and 12 subjects, in the **2026–2027 1st semester**. If the term rolls over or the
catalogue changes, regenerate them — the section rows in particular are matched
against the *active* term and will all fail in 2nd semester.

| File | Import path | Rows |
|---|---|---|
| `ASPIRE_Import_Users_DEMO.xlsx` | Admin → Manage Users → Import | 1 ready · 3 exist · 9 error |
| `ASPIRE_Import_Subjects_DEMO.xlsx` | Registrar → Subjects → Import | 1 ready · 2 exist · 1 error |
| `ASPIRE_Import_Sections_DEMO.xlsx` | Registrar → Manage Sections → Import | 1 ready · 2 exist · 1 error |

**Every file has a second sheet, `Expected outcome`**, giving the expected result
per row and a sentence to say about it. The importer reads the **first sheet
only**, so that crib is invisible to the system and safe to keep in the file.

## Why this presents well

The importer already classifies each row into three states, and shows them
before anything is written:

- **ready** — will be created
- **conflict** — *"User already exists (will update if overwrite enabled)"*, not an error
- **error** — refused, with the reason on the row

Scrolling one file through mixed outcomes shows validation, de-duplication and
refusal in a single screen. A clean import shows only that a form works.

## The row worth stopping on

```
Reyes,Juan,,j.reyes@dyci.edu.ph,student,College of Accountancy,BSA,BSIT-1A,1st Year,2026-00104
```

`BSIT-1A` is a **real section** — but it belongs to the Technology college, not
Accountancy. A section is matched on **name, college, school year and semester**,
all four. This is the row that shows the check is not a spelling test.

Two others that read well:

- **`College of Computer Studies`** does not exist here, and the importer does
  not guess. Matching is **exact**, by design: a name that rewrites near-misses
  on the importer's own authority is a second, silently diverging source of
  truth beside the catalogue.
- **`BSIT-2A` with `1st Year`** is refused for self-contradiction. The year is
  read out of the section name, and a disagreement is an error rather than a
  silent choice between the two.

## Two things to say before a panelist asks

- **A blank College on an admin or registrar row is correct.** Those roles are
  institution-wide and exempt; students, faculty and deans all require one.
- **A blank ID Number is not an error.** It is generated, with a role prefix —
  `ADM-`, `FAC-`, `DN-`, `REG-`, and no prefix for students.

## The one error these files cannot produce

**Insufficient columns.** A spreadsheet pads every row to the sheet's full column
count, so a short row still arrives with all ten. To show that validator, paste a
short line into the CSV text box instead of uploading:

```
Cruz,Marco,m.cruz@dyci.edu.ph
```

## Regenerating

The generator is `make_import_fixtures.js` in the session scratchpad. If these
need rebuilding after a rollover, re-run the catalogue query in
[`../ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md`](../ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md)
first — the colleges, sections and existing emails are all hard-coded from it.

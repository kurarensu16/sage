# Provisioning lock — idle release test guide

**Date:** 2026-10-31 · Run this before Stage 2 of
[`ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md`](ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md).

Timings to know: the college is handed back after **2 minutes** without input,
the watchdog checks every **15 seconds**, and the server lapses an unheard-from
lock after **3 minutes**. So a release lands somewhere between 2:00 and 2:15.

Sign in as **registrar** and open **Faculty Loading & Provisioning** → the
Technology college. Dev server on **5175**.

---

## 1 · The release happens, and says so plainly

- [ ] ok  [ ] **bug** — With the college open, there is **no banner** at all. Editing controls
  are live.  ·  _note:_
- [ ] ok  [ ] **bug** — Fill in the picker part-way — pick Rivera, a program, a year, a section,
  a subject, and some days and times — but **do not** press Add.  ·  _note:_
- [ ] ok  [ ] **bug** — Now take your hands off completely. Do not move the mouse. Wait about
  **2 minutes 15 seconds**.  ·  _note:_
- [ ] ok  [ ] **bug** — A **grey** banner appears: *"Editing paused. Technology … was handed back
  after a couple of minutes without activity …"*. Grey, not amber, and it names
  **no colleague**.  ·  _note:_
- [ ] ok  [ ] **bug** — **Everything you typed is still on screen** — same faculty, section,
  subject, days and times. This is the claim the banner makes, so it is the one
  worth checking hardest.  ·  _note:_
- [ ] ok  [ ] **bug** — **Add** is disabled while the banner is up.  ·  _note:_

## 2 · It comes back on its own

- [ ] ok  [ ] **bug** — Click anywhere, or move the mouse. The grey banner **disappears without
  you doing anything else**. No reload, no reopening the college.  ·  _note:_
- [ ] ok  [ ] **bug** — Your picker selections are **still intact** after the reclaim.  ·  _note:_
- [ ] ok  [ ] **bug** — Press **Add**. It succeeds. This is the whole point: the message you used
  to get here was *"Someone else is editing this college right now"*, and it was
  nobody.  ·  _note:_

## 3 · The hidden-tab case — the one that matters for the demo

This is why the feature exists. The demo runs one window per role, so this page
is hidden most of the time.

- [ ] ok  [ ] **bug** — With the college open and the lock yours, switch to another window or
  tab for **3 minutes or more**.  ·  _note:_
- [ ] ok  [ ] **bug** — Come back. Within a second the page has sorted itself out: either no
  banner at all, or the grey one which then clears as you move the mouse.  ·  _note:_
- [ ] ok  [ ] **bug** — Press **Add**. It succeeds. Before this change a throttled heartbeat could
  lapse the lock while hidden and the add would be refused.  ·  _note:_

## 4 · A real colleague is still reported as a colleague

The idle banner must not swallow the genuine case. Two browser profiles are
needed — the registrar in one, the **Technology dean** (`tech.dean@dyci.edu.ph`)
in the other, since a Dean can load their own college.

- [ ] ok  [ ] **bug** — Registrar holds Technology. Now open Faculty Loading as the **dean** in
  the second profile.  ·  _note:_
- [ ] ok  [ ] **bug** — The dean sees the **amber** banner naming the registrar — not the grey
  one. Editing is view-only for them.  ·  _note:_
- [ ] ok  [ ] **bug** — Let the **registrar** go idle for 2:15, so the college is released.  ·  _note:_
- [ ] ok  [ ] **bug** — The **dean** moves their mouse, or switches away and back. They now get
  the college, and their amber banner clears.  ·  _note:_
- [ ] ok  [ ] **bug** — The **registrar** now moves their mouse. They get the **amber** banner
  naming the dean — correctly, because somebody really does hold it now. They
  are not silently handed a lock the dean is using.  ·  _note:_
- [ ] ok  [ ] **bug** — The registrar's typed picker values are **still** on screen even though
  they cannot submit.  ·  _note:_

## 5 · Nothing was broken on the way past

- [ ] ok  [ ] **bug** — Leave the college and come back. The lock is acquired cleanly, with no
  banner and no stale state.  ·  _note:_
- [ ] ok  [ ] **bug** — Switch colleges in the picker (registrar only). The old college is
  released and the new one acquired.  ·  _note:_
- [ ] ok  [ ] **bug** — Close the tab mid-edit, then reopen within a few seconds. The college is
  available again — the unmount release still fires.  ·  _note:_
- [ ] ok  [ ] **bug** — The three Stage 2 refusals still behave: no schedule, the `DSA123` faculty
  clash, and the `DSA123` section clash.  ·  _note:_
- [ ] ok  [ ] **bug** — Finalize still works, and nothing about the idle cycle left a stray draft
  behind.  ·  _note:_

---

## If something fails

Tick **bug**, and in the note say which of the five sections you were in, which
banner colour you saw, and whether your typed values survived. Those three facts
separate every failure mode this feature has.

The thing most likely to be wrong is the **timing feel** — 2 minutes may be too
short if you read the checklist with the page open, or too long if you want a
colleague freed faster. It is one constant, `IDLE_RELEASE_MS` at the top of
`src/components/provisioning/FacultyLoadingWorkspace.jsx`; say what would suit
you and it is a one-line change.

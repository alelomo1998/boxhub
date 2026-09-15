# Critique — piece editor Delete (`/app/coach/wods/:id`), M14c-b Task 6

⚠️ DEGRADED: single-context (user rule: critiques run inline). impeccable's in-page detector cannot
load — preflight injection of `detect.js` failed, the app's CSP is `script-src 'self'` (read from the
response header this pass) — and `impeccable detect` on source is banned by the user. Deterministic
evidence is the audit's Playwright measurements (same build, after the audit fix batch).

Live stack, fresh Claude in Chrome tab at 330px, signed in as the user's coach session: Library →
Annie card → editor → trash → sheet → Keep it. The window would not resize, so 1024px screenshots
(editor, desktop dialog) came from Playwright on the same build. Scope: the opener and the confirm
flow only; the editor itself was critiqued in M14c-a.

Build under review: Task 6 + audit fixes (Escape-while-pending reopen, focus restore on error,
Keep it `ariaDisabled` while pending, `replaceUrl` on success). Karma 982 SUCCESS.

## Pass 1 — 31/40 (below 32; no P0/P1)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Spinner + `aria-busy` while pending, errors inline and announced. Success is silent: the coach lands on the library and has to notice the row is gone. |
| 2 | Match with the real world | 3 | Coach language, the consequence for classes is stated plainly. |
| 3 | User control and freedom | 3 | Keep it, Escape, swipe, backdrop, desktop X; Back after delete skips the dead URL. No undo — acceptable behind a confirm. |
| 4 | Consistency and standards | 3 | Red-outline opener matches block remove; outline opener → filled executor matches account delete. **But the flow says "WOD" on a screen that says "piece" everywhere else** — "New piece", "Save piece", "Untitled piece", "Loading the piece…". |
| 5 | Error prevention | 3 | Two-step, escalating fill, Delete last. The sheet never names what it deletes, and Annie is flagged BENCHMARK in the library — nothing says the benchmark itself survives. |
| 6 | Recognition rather than recall | 3 | Trash is universal and named for screen readers; the sheet title "Delete this WOD?" sits over a scrim that dims the only place the name is shown. |
| 7 | Flexibility and efficiency | 3 | Full keyboard path (Tab → Enter → Enter / Escape), focus returns to the opener or to Delete after an error. Rare action — no accelerator needed. |
| 8 | Aesthetic and minimalist design | 4 | One 44px control on the title row, one sheet, zero volt spent, danger bounded to a button. Nothing added to the footer. |
| 9 | Error recognition and recovery | 3 | 409 says why; 500 says try again with focus already on Delete. 409 gives no next step. |
| 10 | Help and documentation | 3 | The body copy answers the one real question ("do my classes lose it?"). |
| **Total** | | **31/40** | **Good, below the 32 bar** |

**Design specificity:** plumbing done the house way — the opener reads as the block-remove control's
big sibling, the sheet is the product's standard confirm. Nothing generic, nothing expressive, which
is correct for a destructive control.

### What's working
- Placement: the destructive action costs the editor nothing — no footer weight, Save stays the one
  `strong` action, and the trash is on the row that names the thing it deletes.
- Escalation grammar: red outline opens, red fill executes, Keep it first. Same as account.
- State is never silent while pending or failing — including Escape mid-request (fixed in the audit).

### Priority issues
- **[P2] "WOD" in a "piece" screen** — the only place the editor says WOD. Fix: "Delete this piece"
  everywhere in the flow (opener label, sheet aria, 409 copy). `/impeccable clarify`
- **[P2] The sheet doesn't name the piece** — title "Delete Annie?", falling back to "Delete this
  piece?" when untitled. `/impeccable clarify`
- **[P2] Benchmark copies get no reassurance** — when `benchmarkTemplateId` is set, add "Annie stays in
  Benchmarks — this removes your box's copy." `/impeccable clarify`
- **[P2] Success is silent** — no confirmation on the library after the delete. Needs a new transient
  status component (none exists). `/impeccable harden`
- **[P3] 409 has no next step** — "…Remove it from that class first."

### Persona red flags
- **Casey (one thumb, on the floor):** trash is top-right — a stretch at 393px, but a rare, deliberate
  action behind a confirm; the executing Delete is bottom-of-sheet, in the thumb zone. Acceptable.
- **Sam (keyboard/screen reader):** passes — named opener, `h2` in a modal dialog, `role="alert"`
  errors, focus returned in every path (measured).
- **Jordan (first-timer):** "Delete this WOD?" over a dimmed title, on a screen that calls the thing a
  piece — is this deleting the WOD of the day? The benchmark flag makes it worse for Annie.

### Minor observations
- Desktop dialog shows the X and Keep it — redundant but harmless; buttons stack full width in a 560px
  dialog (desktop would usually pair them right-aligned). P3.
- Page `<title>` is "Edit WOD · rxed" while the page says piece — pre-existing, same terminology split.

## Pass 2 — 34/40 (PASS: ≥32, no P0/P1/P2 open)

⚠️ DEGRADED: single-context (user rule: critiques run inline). Detector preflight re-attempted in a
fresh tab this pass: `detect.js` injection blocked, CSP `script-src 'self'`.

Fresh Claude in Chrome tab, 330px, build `c642205`, walked this pass: Library → Angie (the remaining
benchmark copy) → trash → sheet → Delete with the page's DELETE forced to a dead URL (nginx: one
`DELETE /api/box/__audit_forced_error__ 404`, Angie untouched) → Keep it; then a real delete of
Smoke piece 53 → library notice → browser Back. User review deleted Annie and Smoke piece 54 between
passes (nginx 20:10–20:11, iPhone UA, 204).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Pending spinner; inline error; "Smoke piece 53 deleted." on arrival, `role="status"`, gone on reload. |
| 2 | Match with the real world | 3 | Plain consequence copy; the browser tab still says "Edit WOD" (pre-existing). |
| 3 | User control and freedom | 3 | Keep it / Escape / swipe; Back skipped the deleted piece to Angie's editor. No undo. |
| 4 | Consistency and standards | 4 | "piece" throughout the flow, matching "New piece" / "Save piece"; opener/executor grammar matches account delete and block remove. |
| 5 | Error prevention | 4 | "DELETE ANGIE?", "Angie stays in Benchmarks — this removes your box's copy.", Keep it before a filled Delete. |
| 6 | Recognition rather than recall | 3 | The name is in the sheet now; the opener is still icon-only for sighted first-timers (named for AT). |
| 7 | Flexibility and efficiency | 3 | Full keyboard path; after the forced error focus sat on Delete (measured `piece-delete-confirm`), Keep it returned it to the opener. |
| 8 | Aesthetic and minimalist design | 4 | One control, one sheet, one quiet success line; no volt spent. |
| 9 | Error recognition and recovery | 3 | "That did not delete — try again." with focus on Delete; 409 still has no next step (user left it out). |
| 10 | Help and documentation | 3 | Body copy answers the classes question; benchmark line answers the Benchmarks one. |
| **Total** | | **34/40** | **Good — bar met** |

### Remaining P3s → BACKLOG at milestone close
- 409 copy has no next step ("Remove it from that class first").
- Library delete notice has no dismiss and stays until the coach leaves the page (search/filter keep it).
- Desktop dialog shows both X and Keep it; buttons stack full width at 560px.
- Browser tab title "Edit WOD · rxed" on a screen that says piece (pre-existing).
- (Audit) Tab from a sheet's last control reached the shell box switcher in Chromium — cause unverified, all sheets.

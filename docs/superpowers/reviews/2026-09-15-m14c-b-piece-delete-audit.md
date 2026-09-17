# Audit — piece editor Delete (`/app/coach/wods/:id`), M14c-b Task 6

Run 2026-09-15 on the live dev stack. Visual pass in **Claude in Chrome** (330px tab, signed in as
the user's coach session): opener, confirm sheet, Keep it, `/coach/wods/new` without opener.
Chrome's synthetic keys did not reach the page (Tab left focus on the title), so the keyboard,
focus, error and pending measurements ran in **Playwright** at 320 / 360 / 393 against the same
stack, signed in as coach@demo.io, with every `DELETE` intercepted (`page.route`) — no data deleted
by the audit. The impeccable detector was not run: it is CSP-blocked on this page (same as the
Library audit), and running it on source is banned.

Scope: the trash opener on the title row and the confirm sheet. The rest of the editor was audited
in M14c-a and is out of scope.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Focus falls to `<body>` when Delete goes pending, and stays there after an error |
| 2 | Performance | 4 | Nothing measurable: one request, no loops, no new listeners |
| 3 | Responsive | 4 | 46×44 opener at 320/360/393, no overflow with a 66-char title |
| 4 | Theming | 4 | Tokens only; icon copied verbatim from lucide-static |
| 5 | Implementation integrity | 3 | Escape during a pending delete desyncs the sheet from its state signal |
| **Total** | | **18/20** | **Excellent** (bar ≥16 met) |

## Measured, passing

- Opener: `<button type="button">`, accessible name "Delete this WOD", svg `aria-hidden`, 46×44 at
  every width, vertically centred on the title (Δ 0px). Icon and border `--danger` on `--ground`
  4.86:1 (text and non-text both pass). Tab order title → opener → WHAT chip; 2px volt focus ring
  with 2px offset, visible (screenshot).
- Sheet: native modal `<dialog>`, `aria-label` "Delete this WOD", `h2` "Delete this WOD?", focus
  lands on the dialog surface. Body copy 15.92:1, Keep it label 15.92:1, Delete label on
  `--danger` 4.86:1, both buttons 56px tall. Escape closes and returns focus to the opener; Keep it
  does the same.
- Errors: 409 → "This WOD is still used by a class, so it can't be deleted."; 500 → "That did not
  delete — try again."; both `role="alert"` inside the open sheet, text 15.92:1; closing clears
  the error. Pending: Delete shows a spinner, `aria-busy="true"`.
- Reduced motion: every sheet transition collapses to ~0s.
- Real deletes (the user's review, nginx log 19:46 UTC): two `DELETE … 204` from an iPhone UA.

## Findings

**[P1] Escape during a pending delete strands the sheet**
- Location: `piece-editor.page.ts` `closeDelete()`, bound to `bh-sheet (closed)`.
- Impact: the native `<dialog>` closes on Escape (or backdrop), `closed` fires, and `closeDelete()`
  ignores it because `deleting()` is true — `deleteOpen` stays `true` while the dialog is shut. If
  the request then fails, the error renders in a closed dialog, and the trash button sets an
  already-true signal, so the sheet never reopens until the coach navigates away. Measured:
  `pendingEsc open:false` → `afterPendingError open:false, err set` → `reopenAfterPendingEsc
  open:false`.
- Fix: the `(closed)` handler always syncs `deleteOpen` to false (the dialog IS closed); a failing
  request reopens the sheet so its error is seen; Keep it keeps its own guard.

**[P1] Focus drops to `<body>` on Delete and is not restored after an error**
- Location: same sheet; `bh-button [loading]` renders the native `disabled` attribute.
- Impact: a keyboard or screen-reader user presses Delete, the button leaves the a11y tree, focus
  goes to `<body>`; after 409/500 it is still there (measured `focus: BODY`), so the retry is lost.
  CLAUDE.md: "move focus onto whatever replaced the control".
- WCAG 2.4.3 Focus Order.
- Fix: when the request errors, `afterNextRender` focus the confirm button's inner `<button>`.

**[P2] Keep it looks live while it does nothing** — during the pending request Keep it renders at
full strength but its click is ignored. Fix: `[ariaDisabled]="deleting()"`.

**[P2] Back after a successful delete lands on the deleted piece** — `router.navigate(['/coach/wods'])`
pushes a history entry, so Back re-opens `/coach/wods/:id` → "That piece could not be loaded." with a
Try again that can never succeed (seen in Chrome on the WOD the user deleted). Fix: `replaceUrl: true`.

**[P2, pre-existing, all sheets] Tab from a sheet's last control reached the shell's box switcher** in
Playwright/Chromium, despite the modal dialog. Not introduced here; cause unverified → BACKLOG.

**[P3, pre-existing] Ghost button border 1.34:1 against the sheet surface** — the label identifies the
control, so 1.4.11 is not failed; system-wide `ghost` variant. **[P3, pre-existing] A 404 piece shows
the generic load error with Try again** rather than "this piece no longer exists".

## Recommended actions

1. **[P1]** Fix the pending-Escape desync and the focus restore (one batch, with Karma specs).
2. **[P2]** `ariaDisabled` on Keep it while pending; `replaceUrl: true` on the success navigate.
3. Then `/impeccable critique` in Chrome.

# Critique — coach Library page (`/app/coach/wods`), M14c-b

⚠️ DEGRADED: single-context (user rule: critiques run inline). impeccable's in-page detector cannot
load — app CSP is `script-src 'self'` — and `impeccable detect` on source is banned by the user, so
the deterministic evidence is the audit's in-page measurements plus this pass's JS probes.

Live stack, Claude in Chrome, coach@demo.io. This session's walkthrough ran at 550px (window would not
resize, iframe blocked by `frame-ancestors`); the 1024/1426 composition is from the first half of this
critique (`…-critique-NOTES.md`) on the same build plus `44bb945`'s a11y fixes.

## Pass 1 — 27/40 (FAIL: below 32, one P1 open)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Every refined search blanks the list to "Loading the library…" (measured: 1 result → 0 cards → 1); under 3 characters nothing happens and nothing says so. "Show N" in the sheet is good. |
| 2 | Match with the real world | 2 | **Benchmark sheet misstates the workout**: Barbara shows 20/30/40/50 with no "5 rounds" and no rest; Helen loses "3 rounds for time" and her Rx note. "600 SEC easy row" prints a unit enum. |
| 3 | User control and freedom | 3 | Sheets close by swipe/Esc/Back, search has a clear X; clearing filters is open sheet → Clear → Show. |
| 4 | Consistency and standards | 3 | The same piece (Annie, a box copy of the benchmark) is unflagged in the default list and `BENCHMARK · GIRL` with the chip on — `benchmarkKind` null in default mode, against D9. |
| 5 | Error prevention | 3 | Tapping a benchmark never copies (D8); Add is explicit. |
| 6 | Recognition rather than recall | 2 | Active filters show only as a count badge — with Timing = For time on, nothing on the page says "for time". History gives no hint which days ran pieces: in the last 11 days only Mon 14 has any (10), the strip marks every day with the same tick. |
| 7 | Flexibility and efficiency | 3 | Name-or-movement search, four facets, Benchmarks chip, month/day jump. |
| 8 | Aesthetic and minimalist design | 3 | Prescription cards read like the board; one volt `+`. Uniform strip ticks are noise; `GIRL WORKOUT · FOR TIME` repeats "Workout" on every benchmark. |
| 9 | Error recognition and recovery | 3 | Error state (provoked by failing `/api/box/library`) keeps query, chip and filter, offers Try again at 44px. No-match ("Nothing matches "zzqx"") gives no way out and doesn't mention active filters. |
| 10 | Help and documentation | 3 | Placeholder "Name or movement" teaches the search; the 3-character rule is undocumented anywhere on screen. |
| **Total** | | **27/40** | **Below bar** |

## Design specificity

Authored for this product: the cards are the prescription voice (mono lines, tabular reps, macro ·
timing eyebrows, score type top-right), not a CRM card grid. History's `WOD CLASS 15:14 · WARMUP`
eyebrow ties a piece to the class that ran it. The weakest part is the benchmark sheet, a bare list
where the workout's structure should be the point.

## What's working

- Card as prescription: a coach tells Annie from Angie at a glance without opening either.
- Filter sheet menu → drill-in → "Show 3 results" with a live count before applying.
- Error and empty states exist on both tabs and preserve input.

## Priority issues

- **[P1] Benchmark sheet drops block labels, notes and score type** (`wod-library.page.ts`
  `benchLines` → `prescriptionLines`, lines only). The sheet is the one place a coach inspects a
  benchmark before "Add to library"; Barbara reads as a single round. D8 promised the full
  prescription + score type. Fix: render `expandedRows` (label / line / note), card-style eyebrow with
  the Benchmark chip + kind + score. Same gap in the class stack's detail step (notes) — fix there too.
- **[P2] Box copies of benchmarks lose their flag in the default list** (`LibraryController.libraryMode`
  passes `benchmarkKind = null`). D9. Fix: resolve kinds for the page's template ids.
- **[P2] Refining a search blanks the list.** Keep the current rows while the next page loads.
- **[P2] Active filters are invisible except as a count.** No-match with a filter on can't be
  diagnosed without opening the sheet.
- **[P2] History: no hint which days ran pieces.** 10 of the last 11 days are empty; the tick under
  every day carries no information.

## Persona red flags

- **Coach on the floor, phone, between classes:** types "Fr" looking for Fran — nothing happens, no
  hint; taps History, sees "No class ran a piece on this day" for today and must guess which day to tap.
- **Head coach planning a benchmark week:** opens Barbara, sees four lines, adds it believing it's one
  round; the rest interval is only discoverable in the editor.
- **Screen-reader coach:** audit P1 fixed (`aria-pressed`, labelled cards); History day buttons no
  longer claim "no classes" (verify in pass 2).

## Minor observations

- "600 SEC easy row" / "400 M Run": `prescriptionLines` prints the unit enum uppercase.
- Benchmark mode total is 18 templates (spec said ~30) — data, not UX.
- No-match state has no "clear search" / "clear filters" action.

## Question for the user (asked, not decided)

Drop "Workout" from benchmark eyebrows (`BENCHMARK · GIRL · WORKOUT · FOR TIME`)?

## Fix batch 1 (spec'd, no new UI) — verified live after `up -d --build`

- **P1 fixed:** benchmark sheet renders block labels, lines and notes (`expandedRows` gains `note`;
  class stack detail + expanded row render notes too), card-style eyebrow with Benchmark chip + kind,
  score type and cap in the class stack's format. Live: Barbara "5 ROUNDS … Rest 3 min between
  rounds"; Cindy "ROUNDS + REPS · CAP 20:00". Contrast: label 4.70, note/score/reps 7.89.
- **D9 fixed:** default list flags box copies (`LibraryController.libraryMode`, one template lookup per
  page). Live: Annie shows `BENCHMARK · GIRL` without the chip.
- Gates: `LibraryApiTest` 8/8; Karma 961 SUCCESS; build zero warnings. Full backend suite not re-run yet.
- Projected: #2 → 3, #4 → 4 ≈ 29/40. Still below 32; remaining P2s add UI → user decision pending.
- Noted for Task 7: class stack's `.rxline` load span appends the reps unit (`r.unit`) to the load.

## Fix batch 2 — user-approved "all 4 and drop workout", verified live 2026-09-15

- F1 refresh keeps rows dimmed (`aria-busy`), request token guards stale responses. Live: no blank.
- F2 removable filter chips beside Benchmarks. Live: `For time ×` removes the facet, focus → Filters
  button (first build dropped focus to body — `setTimeout` ran before the chip left the DOM; now
  `afterNextRender`).
- F3 "Type at least 3 letters to search" at 1–2 characters.
- F4 no-match "Clear search" / "Clear filters", focus → search field.
  Found live: after "Clear search", retyping the same term never searched — `bh-search-bar` de-duped
  against the last typed value and ignored the consumer's reset. Fixed in `ui/search-bar` (a value set
  from outside is the new baseline); spec proven red without the fix.
- F5 `GET /api/box/wods/history/days` + `bh-week-calendar` `toneWords`. Live: Mon 14 "pieces ran" with
  a dot, other days "nothing ran".
- F6 benchmark eyebrow `BENCHMARK · GIRL · FOR TIME`.
- Gates: backend 848/0/0/0; Karma 974 SUCCESS; build zero warnings; visual 33 passed (week-calendar
  baselines re-taken for the gallery's added toneWords instance). `ui/` greps empty.
- Next: user visual sign-off → critique pass 2 in Chrome.

## Pass 2 — 33/40 (PASS: ≥32, no P0/P1 open) — after user visual sign-off, 2026-09-15

Same method and degraded banner as pass 1. Walked in Chrome at 550px: short-search hint, refresh,
filter chip apply/remove, no-match with filters, Benchmarks eyebrows, benchmark sheet, History strip.

| # | Heuristic | P1 | P2 | Key issue now |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | Refresh dims rows (`aria-busy`) instead of blanking; hint under 3 letters; live "Show N". No result count on the page itself. |
| 2 | Match with the real world | 2 | 3 | Benchmark sheet states the real workout (rounds, rest, Rx note, cap). "600 SEC easy row" still prints the unit enum. |
| 3 | User control and freedom | 3 | 4 | One-tap `For time ×`; Clear search / Clear filters; sheets dismiss by swipe, Esc, Back. |
| 4 | Consistency and standards | 3 | 4 | A benchmark copy is flagged in both modes; card and sheet share one eyebrow; filter chips match the Benchmarks chip. |
| 5 | Error prevention | 3 | 3 | Tap never copies; Add is explicit. |
| 6 | Recognition rather than recall | 2 | 4 | Applied filters are on the page; History marks days that ran pieces ("pieces ran", dot). The jump sheet's month grid carries no marks. |
| 7 | Flexibility and efficiency | 3 | 3 | Unchanged. |
| 8 | Aesthetic and minimalist design | 3 | 3 | "Workout" gone from benchmark eyebrows; the hint line shifts the list ~50px as it appears. |
| 9 | Error recognition and recovery | 3 | 3 | See P2 below: "Clear filters" can leave the coach in the same no-match. |
| 10 | Help and documentation | 3 | 3 | The 3-letter rule is now stated where it bites. |
| **Total** | | **27** | **33/40** | |

Measured: filter chip 94×44, text 15.92:1, × icon 7.89:1; hint 8.52:1; no-match button 108×44;
block label 4.70:1, note/score 7.89:1. Focus: chip removal → Filters button; clear → search field.

### Open findings (none P0/P1)

- **[P2] No-match "Clear filters" keeps the query the title blames.** "Nothing matches "zzqx"" with
  Benchmarks on offers Clear filters; it keeps "zzqx", so the coach lands on the same empty state.
  Candidate: when both a query and filters are active, offer both actions, or clear the query too.
  User decision — not built.
- **[P3]** Hint line inserts above the list (layout shift ~50px); `600 SEC` / `400 M` unit enums in
  `prescriptionLines`; jump sheet month grid has no History marks; future (disabled) strip days
  announce "nothing ran".

## Fix batch 3 — user-ruled "clear filters also clear search, for p3 do as you like", verified live

- P2: "Clear filters" clears facets, Benchmarks and the search in one refetch; focus → search. Live: 50 cards back.
- P3 hint rides the chip row: grid top 267px before and after the hint (no shift). Chip 104 + hint 177
  fits a 328px row at 360; with filter chips present it wraps.
- P3 printed units lowercase: "600 sec easy row", "400 m Run".
- P3 unselectable strip days drop the tone word: 16–20 Sep announce the date only.
- P3 month-grid History marks → `docs/BACKLOG.md`.
- Gates: Karma 975 SUCCESS; build zero warnings; visual 33 passed; `ui/` greps empty. Score stands at
  33/40 (these close the P2 and three P3s; not re-scored).

## Pass 3 — withdrawn

A 35/40 written from earlier observations without a fresh browser walk was withdrawn at the user's
request; not a score. Replaced by the Chrome pass below.

## Pass 3 (Chrome) — 34/40 (PASS, no P0/P1/P2 open) — 2026-09-15

⚠️ DEGRADED: single-context (user rule: critiques inline). Detector: a real injection attempt —
`impeccable live-server` on :8400, `detect.js` appended to the page in a fresh `[Human]` tab — was
blocked by the app CSP (`script-src 'self'`); server stopped. Evidence is this walk: fresh Chrome tab
rendering at **330px** (a phone width Chrome had not given before), coach@demo.io, current build.

Walked: default list; "Fr" hint; Filters → Movement drill-in → type "thr" → pick Thruster → Back →
"Show 1 result"; chip row with `Thruster ×` + hint; Fran card; chip removal; Benchmarks → Barbara
sheet; History today (empty) and strip marks. Carried from batch-3's live check on the same build:
no-match "Clear filters" clearing search + Benchmarks, focus to search; unselectable-day labels.

| # | Heuristic | P1 | P2 | P3 | Evidence in this walk |
|---|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | 3 | Hint + live "Show 1 result" + dimmed refresh. No count on the page. |
| 2 | Match with the real world | 2 | 3 | 4 | Barbara: 5 ROUNDS · 20/30/40/50 · Rest 3 min; "600 sec easy row"; "21-15-9 Thruster (43 kg)". |
| 3 | User control and freedom | 3 | 4 | 4 | `Thruster ×` one tap; sheet Esc/Back; clear actions. Movement step exits only via Back → Show (two taps). |
| 4 | Consistency and standards | 3 | 4 | 4 | Fran (box copy) flagged like a global; card and sheet eyebrows identical. |
| 5 | Error prevention | 3 | 3 | 3 | Add is explicit; nothing more to prevent. |
| 6 | Recognition rather than recall | 2 | 4 | 3 | Movement step is an empty field until you type — the coach must recall a name. Filters visible as chips; History dot on Mon 14. |
| 7 | Flexibility and efficiency | 3 | 3 | 3 | Unchanged. |
| 8 | Aesthetic and minimalist design | 3 | 3 | 3 | At 330 with a chip, the hint wraps to a lone right-aligned line; search placeholder truncates ("Name or movei"); drill-in heading shows a volt focus rectangle after a tap. |
| 9 | Error recognition and recovery | 3 | 3 | 4 | Clear filters exits the no-match; error keeps input + Try again. |
| 10 | Help and documentation | 3 | 3 | 3 | 3-letter rule stated in place. |
| **Total** | | **27** | **33** | **34/40** | |

Open (all P3): movement facet needs recall (no browse list); hint orphaned on its own line at phone
width with chips; placeholder truncation at 330; focus rectangle on the drill-in heading after a
pointer tap; movement step has no direct apply; month-grid marks (BACKLOG); shell gym name collapses
to "D" at 330 (shell, pre-existing).

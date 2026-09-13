# M14c-b — library, benchmarks & types

**Roadmap row 11.** Brainstormed and shaped with the user 2026-09-13. Branch `m14c-b-library`.
Baselines on `main` at `39054b3`, re-run by the orchestrator this session: backend **821/0/0/0**,
Karma **874 SUCCESS**, production build **zero warnings**.

Tour decisions carried: **5** (Types becomes admin-only — *"we are permitting our workers to change the
structure of the classes? i dont think so"*) and **6** (the Benchmarks page is deleted, the WOD library
gains a history tab, benchmarks become library entries flagged as such). Plus the removal of the
duplicate function, inherited from M14c-a §10.

## 1. Decisions (user-ruled 2026-09-13)

| # | Question | Ruling |
|---|---|---|
| D1 | What is the "history tab"? | **Everything programmed.** Library tab = saved pieces; History tab = every piece a class ran, newest first. |
| D2 | How do benchmarks live in the library? | **Global, merged in.** The seeded catalogue stays one shared read-only table; it appears inside the Library tab flagged `BENCHMARK`. No migration, no per-box seeding. |
| D3 | Tapping a History row | **Opens that class's builder** (`/coach/classes/:id/build`), where "Also save this to the library" already exists. No new action. |
| D4 | Where Delete lives | **Inside the piece editor** (standalone mode), confirm in a sheet. Rows carry no actions. |
| D5 | Types in this milestone | **Moves unchanged to `/admin/types`**; writes become `BOX_ADMIN`; M15b rebuilds it. Never absent. |
| D6 | Coach dock | **`Classes · Library`** — two tabs, "Build" renamed. |
| D7 | Benchmarks in the class stack's slot search | **Yes, same library.** Picking one copies it into the class with provenance. |
| D8 | Benchmark tap on the Library page | A read-only sheet with ONE action, **"Add to library"** (today's clone), which then opens the editor. Tapping never copies silently — a silent copy on tap is how the library flooded before M14c-a. |
| D9 | Duplicate global + box copy | Once a box library piece carries a benchmark's `benchmarkTemplateId`, the **global row hides** and the box row shows the `BENCHMARK` flag. Never two Frans. |
| D10 | Composition | **B · Prescription cards** (shape, below). |
| D11 | History composition | **Mono date rules + the same card**; the eyebrow names class and time instead of macro. |
| D12 | Growth | **Column grid**: 1 column to 767px, 2 from 768px, 3 from 1280px. |

## 2. The Library page — shape

**Job.** A coach (phone on the floor, or tablet/desktop while programming) finds a piece they have
written before, a benchmark, or something a class ran recently — to open it, add it, or reuse it.
Visitor mode: **Operate**. Not on the hero list; it renders inside the coach shell, whose box-switcher
mark already spends the screen's volt. **No volt on this page.**

**Why cards, not rows (D10).** A coach recognises a workout by its movements, not its title — "the
one with thrusters and pull-ups" is Fran to them before the name is. So each card leads with the
prescription in the mono voice, the `games.crossfit.com` reference (`docs/design-ref/identity/
games.crossfit.com/this-text-is-incredible.png`). Density is traded for recognition on purpose: ~3–4
cards per 360px viewport.

**Structure, top to bottom (360px):**

1. Header: screen title + **`+ New WOD`**, the one `bh-button variant="strong"` (full-width `lg` on
   mobile, per the primary-action rule).
2. `bh-segmented`: **Library | History**.
3. `bh-search-bar` — one field; filters the active tab.
4. Content:
   - **Library tab** — one card list: the box's saved pieces (newest updated first), then benchmarks
     not already copied into the box (D9), Girls before Heroes, by name.
   - **History tab** — cards grouped under mono date rules (`TUE 9 SEP`), newest first; "load more"
     at the bottom when the page returned 50.

**The card** (a feature component in `features/programming/`, not `ui/` — one consumer screen plus the
picker row, and it has no reason to exist outside programming):

- Eyebrow (mono, `--fs-meta`): Library → `macro · timing preset` (or `BENCHMARK` chip + `GIRL`/`HERO`
  + timing); History → `class name hh:mm · macro`. Score type right-aligned on the same line.
- Title: Archivo 800, uppercase.
- Prescription: **at most 3 lines** in mono, then `+N more` when truncated. A fixed line budget is what
  keeps grid rows aligned at 2 and 3 columns. Lines come from the piece's blocks (reps · text · load,
  flattened across both block levels); a benchmark has empty blocks, so its `bodyText` is split on
  `:` and `,` into lines. A piece with neither shows no prescription lines, never an empty box.
- The whole card is one link/button, `--tap` minimum, focus ring on the card.

**States.** Loading, error with retry, and empty — per tab: Library empty (no saved pieces AND no
benchmarks is impossible, so the realistic empty is a search with no match); History empty ("No class
has run a piece yet"). Search-no-match copy names the query. Load-more has its own pending and error.

**Benchmark sheet (D8).** `bh-sheet`: eyebrow, name, full prescription lines, score type and time cap;
one `strong` action **Add to library** (pending + inline error, sheet stays open on failure); on
success navigates to `/coach/wods/:newId`.

**Ranges.** Title up to the column limit (long names wrap, two lines max then ellipsis); a box with 0
to a few hundred saved pieces (the whole list is fetched once, as the class stack already does — see
its `ponytail:` note); ~30 benchmarks; history paged.

**Anti-goals.** No filter chips (the old Bench page's Girls/Heroes filter is not carried — search and
ordering cover it). No row actions, no duplicate, no swipe. No preview pane on desktop (D12 grows
columns, not panes).

## 3. Other surfaces

- **Piece editor, standalone mode** (`/coach/wods/:id` only — never inside a class): a danger-bordered
  ghost **Delete** opener; confirm `bh-sheet` with a filled danger **Delete**; pending + inline error.
  `409 WOD in use` (only possible for pre-M14c-a rows, since classes now hold copies) renders inline in
  the sheet. On success → `/coach/wods`.
- **Class stack slot search** (M14c-a's picker): benchmark rows alongside saved pieces, same `BENCHMARK`
  flag and D9 hide rule, same merge helper. Picking a benchmark sends `fromBenchmarkId`.
- **Benchmarks page** — deleted. `/coach/benchmarks` redirects to `/coach/wods`.
- **Types page** — file and behaviour unchanged, route moves to `/admin/types` with an admin nav entry
  (desktop list and mobile overflow both); `/coach/types` redirects to `/coach/classes`. Its FormsModule,
  native select and decorators are M15b's to convert, not this milestone's (surface milestones convert
  only their own).
- **Coach dock** — `Classes · Library`; the Library tab keeps the `wods` link.

## 4. Backend

### 4.1 `GET /api/box/wods/history` (STAFF)

Class-owned pieces (`wod.library = false`) joined through `session_item` to `class_sessions`:
`start_at <= now()`, session `status <> 'CANCELLED'`, optional `search` (title, case-insensitive),
ordered `start_at desc, sort_order asc`, **limit 50**, cursor `before` (an ISO instant; returns rows
strictly older). Response rows: `{ itemId, sessionId, className, startAt, wod: WodDto }`.

Tenant-scoped through the ordinary filtered path — no native SQL, no `runAsRoot`. No migration.

### 4.2 The library merge stays client-side

`GET /wods` and `GET /benchmarks` are unchanged. One `ProgrammingService` method returns the merged,
ordered list with the D9 hide rule applied; both the Library page and the slot picker consume it.
A server-side merge would be a second DTO shape for one rule a few lines long.

### 4.3 `PUT /api/box/sessions/{id}/items` gains `fromBenchmarkId`

Exactly one of `wodId` / `fromLibraryWodId` / `fromBenchmarkId`, else 400. A benchmark source goes
through **the same copier** as a library source (`WodService.copyForSession`'s field list must not fork —
M14c-a's "ONE copier" rule): a class-owned wod, `library = false`, `benchmarkTemplateId` set,
`sourceWodId` null. An unknown benchmark id → 404. Existing-item-with-a-source → 400, as today.
Athlete benchmark history (`PerformanceQueries.benchmarkHistory`, `HistoryController`) already keys on
`benchmarkTemplateId`, so a benchmark picked into a class counts with no further change.

### 4.4 Delete the duplicate endpoint

`POST /api/box/wods/{id}/duplicate`, its tests, its `AuthzConformanceTest.MIN_ROLE` entry, and
`ProgrammingService.duplicateWod`. The conformance edit is a route **removal**, audited by the
orchestrator.

### 4.5 Class-structure writes become `BOX_ADMIN`

`POST /api/box/class-templates`, `PATCH /api/box/class-templates/{id}` (the class photo is a field of
this PATCH) and `PUT /api/box/class-templates/{templateId}/skeleton`: `RoleGuard` raised to admin,
`MIN_ROLE` entries `COACH → BOX_ADMIN`. **Verified 2026-09-13:** the only frontend callers are
`admin/schedule.page.ts` and `types.page.ts`; the builder only **reads** skeletons
(`class-builder.page.ts:848`), and `GET …/skeleton` stays `COACH`. The plan must grep backend and e2e
tests for coach-authenticated calls to these writes before raising the guard.

### 4.6 No notification

Nothing here fires one. `docs/NOTIFICATIONS.md` §5 is not engaged.

## 5. Tests

- **4.1** happy; athlete 403; cross-tenant (another box's history never appears); future session
  excluded; cancelled session excluded; library pieces excluded; `before` cursor pages correctly.
  **Every `Instant` seeded and compared after a DB round-trip is truncated to `ChronoUnit.MICROS`.**
- **4.3** happy (copy is `library=false`, provenance set, no library row created); two sources 400;
  unknown benchmark 404; athlete 403; cross-tenant session 404.
- **4.4** conformance sweep green with the route gone.
- **4.5** coach 403 on each of the three writes; admin happy; conformance green.
- **Karma**: merge helper (order, D9 hide rule); card line derivation (blocks flatten, benchmark
  `bodyText` split, 3-line budget with `+N more`, no-lines case); Library page tab/search/states;
  editor delete flow; picker sends `fromBenchmarkId`.
- **e2e**: Library tabs render; benchmark sheet → Add to library → editor; delete from editor;
  class stack picks a benchmark and saves; `/coach/benchmarks` and `/coach/types` redirect; admin
  reaches `/admin/types`.

## 6. Per-screen routine

Three surfaces, each: shape (done here for the Library page; the other two are repeats of agreed
shapes) → build → **user visual sign-off** → audit ≥16/20 → fix every P0/P1 → critique ≥32/40, both
in Claude in Chrome, measured at 320 / 360 / 393 / 768 / 1024 / 1280 (Playwright for the widths Chrome
cannot render). `harden` applies to the Library page (real data, long names). The card is not a `ui/`
component, so the dev-gallery contract does not apply; its states are covered by the page.

## 7. Out of scope

- Types page rebuild, admin builder entry point — **M15b**.
- Remaining `wodType` consumers other than the Library page (`types.page`, `runner.page`,
  `athlete/wod.page`, `class-builder.page`) — **M15b / M17b / M34**.
- Box-authored benchmarks (a coach flagging their own piece) — not built; would need a column and a
  second history key. File in BACKLOG if raised.
- Tags / search-by-movement — already in BACKLOG.

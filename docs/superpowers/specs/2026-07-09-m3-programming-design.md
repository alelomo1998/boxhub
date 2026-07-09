# M3 — Programming (coach) — design spec

**Date:** 2026-07-09. **Milestone:** M3. **Status:** approved, ready for plan.
**Depends on:** M0 (auth/tenancy), M1 (box/plans), M2 (scheduling), design system.
**Roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` §M3.

## Goal & acceptance

Coaches build WODs, program them onto a calendar across parallel tracks (RX/Fitness),
draft then publish, reuse/duplicate, and pull from a seeded benchmark library.
Athletes see only published WODs via a read-only board.

**Acceptance (from roadmap):**
- Coach builds a Fran-style WOD in < 2 min.
- Coach programs a full week on two tracks and publishes.
- Athletes see published WODs only (draft hidden, proven by API test + visible board).
- Benchmark library seeded (girls + heroes); coach clones one into their box.

## Key decisions (locked in brainstorm)

1. **WOD content = hybrid.** Typed top-level fields (wod_type, score_type, time_cap, track
   via slot) + semi-structured movement lines (`blocks_json`) with optional movement-catalog
   links. Not full typed blocks, not pure free-text.
2. **Tracks = box-configurable rows.** `track` table (`@TenantId`), seeded RX+Fitness on box
   create; admin can rename / add / archive / reorder.
3. **Benchmarks = global read-only templates, copy-on-use.** Separate non-tenant
   `benchmark_template` table; "clone" writes a box-scoped `wod`.
4. **Calendar = one WOD per track per day, draft/publish per slot.** `program_slot`
   (date, track, wod) with status; unique (box, date, track).
5. **WOD is a reusable library entity**, separate from slots. Reuse = point a new slot at the
   same WOD; duplicate = clone the WOD. Editing a published WOD is **live** (no snapshot).
6. **M3/M4 line:** M3 ships the athlete read-only WOD board (a hero screen) + published-only
   API enforcement. All scoring / PR / leaderboard stays in M4.

## Architecture

New backend package `com.boxhub.programming` (movements, benchmarks, wods, tracks, slots,
board). Frontend feature area `src/app/features/programming` (coach) + athlete WOD board +
admin tracks/movement management. Flyway **V4**.

### Schema (Flyway V4)

| Table | Scope | Columns (essential) |
|---|---|---|
| `movement` | **global + custom** | id, box_id (nullable: null = global seed), name, category, modality, active, created_at |
| `benchmark_template` | **global, non-tenant** | id, name, kind (GIRL/HERO/OTHER), score_type, time_cap_seconds, body_text, blocks_json |
| `track` | `@TenantId` | id, box_id, name, sort_order, archived, created_at |
| `wod` | `@TenantId` | id, box_id, title, wod_type, score_type, time_cap_seconds, body_text, blocks_json, scaling_notes, benchmark_template_id (nullable), created_by, created_at, updated_at |
| `program_slot` | `@TenantId` | id, box_id, slot_date, track_id (FK track), wod_id (FK wod), status (DRAFT/PUBLISHED), published_at, created_by, created_at |

Enums stored as check-constrained strings (project convention):
- `wod_type`: FOR_TIME, AMRAP, EMOM, INTERVAL, STRENGTH, CUSTOM
- `score_type`: TIME, ROUNDS_REPS, LOAD, NONE
- `movement.category`: BARBELL, GYMNASTICS, MONOSTRUCTURAL, DUMBBELL, KETTLEBELL, ODD_OBJECT, OTHER
- `benchmark_template.kind`: GIRL, HERO, OTHER
- `program_slot.status`: DRAFT, PUBLISHED

Constraints:
- `program_slot` UNIQUE (box_id, slot_date, track_id) — one WOD per track per day.
- `movement` UNIQUE (coalesce(box_id, all-zeros), lower(name)) — no dup name within global or within a box.
- FKs: slot.track_id, slot.wod_id, wod.box_id, track.box_id, movement.box_id (RESTRICT;
  slot→wod/track restrict so a referenced WOD/track can't be hard-deleted — archive instead).

### `blocks_json` shape (hybrid)

```json
{
  "blocks": [
    {
      "label": "For Time",
      "note": "21-15-9",
      "lines": [
        { "text": "Thrusters 95/65", "movementId": 42, "reps": "21-15-9", "load": "95/65", "scaling": "45/35" },
        { "text": "Pull-ups", "movementId": 88, "reps": "21-15-9" }
      ]
    }
  ]
}
```

Top-level typed fields (wod_type/score_type/time_cap) live on the `wod` row, not in JSON.
`movementId` is optional (free text lines allowed). App validates shape on write; DB stores JSONB.

## Tenancy (binding — see CLAUDE.md gotchas)

- **`movement` and `benchmark_template` are NOT `@TenantId`.** Global reads must not be
  silently tenant-filtered (gotcha #1). `MovementRepository` uses explicit predicate
  `box_id IS NULL OR box_id = :boxId` (native or JPQL with the param bound from
  `TenantContext`, NOT relying on `@TenantId`). Custom-movement writes set box_id from
  `TenantContext`. Benchmark templates are read-only global.
- **Benchmark clone**: read global template via the plain (non-tenant) repo, write the box
  `wod` under the caller's tenant (normal `@TenantId`).
- **`track`, `wod`, `program_slot` are `@TenantId`** — standard box scoping.
- **Seeder writes globals** (movements, benchmarks): those tables aren't `@TenantId`, so no
  synthetic tenant needed for them. **Per-box default tracks** are seeded inside box creation
  (already in a box context) or, if a system writer, set a synthetic box tenant BEFORE the tx
  opens (gotcha #2).
- **Cross-tenant test on every box endpoint** (tracks/wods/slots/custom-movements). Plus
  explicit tests: global movement/benchmark visible across two boxes; **custom movement of
  box A NOT visible to box B** (proves the manual filter, since `@TenantId` is off here).

## Backend API (`/api/box/**`)

Writes require coach or admin membership (`RoleGuard`); reads by any box member unless noted.

- **Movements** — `GET /movements?search&category` (global+custom merged), `POST /movements`
  (custom), `PATCH /movements/{id}` (custom only: rename/archive).
- **Benchmarks** — `GET /benchmarks?kind`, `GET /benchmarks/{id}`,
  `POST /benchmarks/{id}/clone` → 201 new box `wod`.
- **WODs** — `GET /wods?search`, `POST /wods`, `GET /wods/{id}`, `PATCH /wods/{id}`,
  `DELETE /wods/{id}` (archive/soft if referenced by a slot; hard-delete only if unreferenced),
  `POST /wods/{id}/duplicate` → 201 clone.
- **Tracks** — `GET /tracks`, `POST /tracks`, `PATCH /tracks/{id}` (name/sort_order/archived).
- **Program (calendar)** — `GET /program?from&to&track`, `PUT /program`
  (body: date, trackId, wodId → upsert slot, DRAFT by default),
  `PATCH /program/{id}` (status publish/unpublish), `DELETE /program/{id}` (clear slot),
  `POST /program/publish` (bulk: date range and/or track → publish matching slots).
- **WOD board** — `GET /wod-board?date` → published slots for date grouped by track.
  Athlete: published-only. Coach/admin: `?includeDrafts=true` for calendar preview.

Errors: RFC7807 problem+json (existing convention). Validation 400; role denial 403;
cross-tenant 404/403 per existing pattern.

## Frontend

Design law binding: tokens only, `bh-*` components, warm-dark default, race-red only accent,
identity in hero screens, numbers tabular. No raw hex outside `_tokens.scss`.

- **Coach — WOD builder** (`features/programming`): title, wod_type + score_type selects,
  optional time cap, movement-picker-backed line editor (add block, add line, link movement),
  scaling notes, whiteboard body text. Save to library. Target: Fran in < 2 min.
- **Coach — WOD library**: searchable list, duplicate, edit, delete/archive.
- **Coach — Programming calendar**: week grid (rows = tracks, cols = days). Click a slot →
  assign existing WOD or create new; per-slot draft/publish chip; "publish week" / "publish
  day" action. Draft vs published visually distinct (published = live).
- **Coach — Benchmark library**: browse girls/heroes, "use" clones into box WOD, opens builder.
- **Admin — Tracks**: list/add/rename/archive/reorder (up/down via sort_order — no drag DnD).
- **Admin — Movement catalog**: list global + custom, add/archive custom movements.
- **Athlete — WOD board (HERO screen)**: today's published WOD per track, read-only, tabular,
  warm-dark broadcast identity. Track tabs/columns; movement lines legible; no scoring (M4).
  Replaces the current athlete WOD "coming soon" placeholder.

## Seeding

`DevDataSeeder` additions:
- ~150 global movements (name + category + modality only; no media).
- Benchmark templates: girls (Fran, Grace, Helen, Cindy, Diane, Elizabeth, Karen, Annie, …)
  + heroes (Murph, DT, JT, Michael, …) with score_type/time_cap/body_text/blocks_json.
- Default tracks RX + Fitness seeded on box create (all boxes, incl. Demo Box).
- Demo: a handful of sample WODs + one published sample week on both tracks for Demo Box.

## Testing

- **Backend** (Testcontainers): per-endpoint happy + auth-denied + cross-tenant-denied;
  global-read visibility (benchmark + global movement cross-box) and custom-movement
  no-leak; publish visibility (athlete published-only, drafts hidden); benchmark clone
  writes a box WOD with provenance; WOD duplicate; unique-slot constraint (dup assign
  rejected/upserts); track archive hides from active list; role guard on writes.
- **Frontend** (Karma): new services (programming API client) + builder/calendar/board
  component specs; token/no-hex discipline.
- **e2e** (Playwright, serial): coach logs in → builds a WOD → programs a week on two tracks →
  publishes → athlete logs in → WOD board shows the published WODs, drafts absent.

## Scope cuts → BACKLOG

- Movement media (videos, coaching cues, images) — seed names/category only.
- WOD versioning / revision history / comments.
- Tag system + search-by-movement across the WOD library.
- Structured minute-by-minute EMOM/interval modeling (hybrid text lines cover it for now).
- Snapshot-on-publish (edits to published WODs are live in M3).
- Drag-and-drop track reorder and drag-to-move calendar slots (up/down + click-assign in M3).
- Bulk-copy a full week to another week / templates for programming cycles.

## Out of scope (later milestones)

Score logging, PR detection, leaderboards, benchmark history (M4). TV WOD display (M5).
Live class runner (M6).

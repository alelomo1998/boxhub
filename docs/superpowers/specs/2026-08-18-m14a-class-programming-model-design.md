# M14a — class & programming model (2026-08-18)

**Phase 1, milestone 1 of `docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`.**

Schema, entities and domain services. **No new endpoints, no new DTOs, no screens.** Existing
controllers are edited only as far as required to keep the build and the suite green — that is a
compile obligation, not a licence to design API surface. The surfaces that consume this model are
M14b (schedule & classes) and M14c (the builder).

Input evidence: `docs/superpowers/specs/2026-08-09-m14-coach-tour.md` (ten decisions, six questions
left open) and the eight decisions taken at brainstorm on 2026-08-18, recorded in §2.

---

## 1. What this milestone is for

`class_templates` holds a class's **identity** (`name`, `image_path`, `coach_id`) and its **weekly
slot** (`weekday`, `start_time`, `duration_min`, `capacity`) in one row. That is why there is no page
that can describe a class, and no way to schedule the same class twice.

`PieceTypes.ALL` is one flat list mixing two axes — `FOR_TIME, AMRAP, EMOM, INTERVAL` are timing
schemes, `STRENGTH, WARMUP, CIRCUIT, SKILL` are section kinds, `CUSTOM` is neither — and there is no
`TABATA` in the vocabulary at all.

`WodJson` nests one level deep. The only timing field on a `Wod` is `time_cap_seconds`, so the
coach's *"30s squat, 15s rest, 30s burpees"* is not expressible.

`SessionItem.wod_id` is `NOT NULL`, so every piece of a class must be a library `Wod` — which is the
root cause of the filed bug where the library grows unboundedly on every edited re-save.

`BookingService.cancel` calls `bookings.delete(booking)`. Cancellation history does not exist and
cannot be recovered.

## 2. Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | **A `ClassSession` stays a snapshot.** It copies name, duration, capacity and coach at generation time, exactly as it does today. | History must stay truthful. Under a live reference, renaming a class rewrites what every past session claims to have been, and a capacity change retroactively makes a full class look under-booked. Cost accepted: an edit does not reach already-generated sessions, so §4.6 adds an explicit regenerate path. |
| 2 | **`duration_min`, `capacity` and `coach_id` live on `schedule_slot`, outright.** No type-level defaults, no override resolution. | A slot stores real values, so a session snapshots straight from it with no resolution rule anywhere in the domain. The convenience belongs in M14b's builder, which pre-fills a new slot from the class type's last-used values — zero schema cost. |
| 3 | **One `wod` table with a `library` flag, and content is copied on attach.** A class owns its own copy; re-saving updates that copy in place. | Applies decision 1 to content. Under shared rows, editing a library WOD rewrites what a class that already ran actually did, and a benchmark leaderboard silently starts comparing scores against different prescribed work. Also the root-cause fix for the unbounded-growth bug: save updates rather than inserts. |
| 4 | **Three axes: macro + timing + score. Score is explicit, never derived.** | Tour decision 1. `PieceTypes.defaultScoreType()` is the derivation and is therefore deleted; it has exactly one caller. Makes a `WORKOUT`/`AMRAP` scored by load expressible with no special case. |
| 5 | **The macro vocabulary is fixed platform-wide: `WARMUP`, `STRENGTH`, `GYMNASTIC`, `WORKOUT`.** | The four the user named. Fixed rather than box-configurable because **M25 publishes workouts across boxes** — per-box macro lists would make the feed's filters and any cross-box comparison meaningless. |
| 6 | **Timing is a segment sequence with an optional round count, stored as `jsonb` on `wod`.** AMRAP / EMOM / Tabata / For-time are **presets over that sequence, not types**. | Tour decisions 7 and 8. `jsonb` matches the `blocks_json` precedent in the same table, segments are never queried independently of their piece, and `ClassTimer.spec_json` is already free-form text so Project 2 consumes it with no migration. |
| 7 | **Blocks and segments are independent.** Blocks are *what* (movement, reps, load, scaling); segments are *when* (duration, work/rest, optional short label). | Both shapes are real: an AMRAP is one work segment with rich blocks; a Tabata is eight segments with one block. Keeps the runner's auto-arm reading segments only and the board reading blocks only. Rejected alternative — segments referencing block lines by id — would put unenforced references inside JSON that dangle when a line is deleted. |
| 8 | **Two-level nesting is expressed by adding an optional `blocks[]` to the existing `Block`, capped at depth 2 by validation.** | Every `blocks_json` value already in the database stays valid untouched — **the migration changes no content**. A macro can hold lines directly, so a simple warmup needs no synthetic wrapper. Cost accepted: the cap is a validator rather than a type, so §7 requires a test that proves depth 3 is rejected. |
| 9 | **A cancellation is a status, not a delete.** `CANCELLED`, plus `cancelled_at` and a `was_late` boolean **stamped at cancel time**. | `was_late` cannot be derived later: it depends on `box.cancel_cutoff_min`, which is mutable and which M15 is putting a UI on. Derived at query time, a box loosening its cutoff would retroactively forgive every late cancel in its history. |
| 10 | **`country` moves out of this milestone, to M22.** | v3 inherited it from v2's "M14 carries every schema change" rule, which v3 itself overturned. Country is box location; M22 adds the full box public profile including location. Splitting one concern across two milestones is what the replacement rule forbids. |

## 3. What this milestone deliberately does NOT model

Required by the v3 Phase 1 rule: *"every Phase 1 milestone must state what it deliberately does not
model, and why that shape is a screen's decision rather than a table's."*

- **Team WODs.** Tour decision 10 scopes them at M14c and designs them at the screen — *"deliberately
  not modelled against no screen, that is how `bh-stat` happened."* Nothing here anticipates them.
- **Extensions to the score-type vocabulary.** `TIME`, `ROUNDS_REPS`, `LOAD`, `NONE` carry forward
  unchanged. Whether reps, distance or calories are needed is decided by M14c's replacement for the
  scored checkbox — the screen that has to render the choice.
- **Folding `time_cap_seconds` into `timing_json`.** The column stays. It has live consumers —
  `WodService`, `WodController`'s DTOs, `wod-builder.page.ts`, and `runner.page.ts:299-301`, which
  already pre-fills the arm fields from it for `FOR_TIME` and `AMRAP`. Removing it forces frontend
  changes this milestone is not allowed to make. **`timing_json` is authoritative for the clock;
  M14c folds the column into it when it rebuilds the builder.**
- **The runner's auto-arm.** Tour decision 9 is a change to the runner, and the runner is Project 2.
  M14a defines the segment shape; Project 2 consumes it. The coach's double entry survives until then.
- **Whether a preset stays attached after the coach edits its segments.** `timing_preset` is stored
  for filtering, analytics and the board's eyebrow. Whether editing a Tabata's segments makes it stop
  being a Tabata is a builder decision, made at M14c.
- **Archiving a class type.** `active` lives on the slot, as it does today. A type with no slots is
  simply not scheduled. If M14b wants an explicit archive, it can add one.

## 4. Schema — migration `V19__class_model_v2.sql`

`V18__locale.sql` is the last applied migration; V19 is free. **No production data exists** — the
product has never been deployed and `deploy/deploy.sh` has never successfully run — so V19 transforms
dev data rather than carrying a careful backfill strategy.

### 4.1 `class_templates` splits

**`class_type`** — identity and skeleton. `id`, `box_id` (`@TenantId`), `name`, `image_path`,
`created_at`.

**`schedule_slot`** — when, and the values a session snapshots. `id`, `box_id` (`@TenantId`),
`class_type_id` (FK, `NOT NULL`), `weekday`, `start_time`, `duration_min`, `capacity`, `coach_id`,
`active`.

Migration: one `class_type` per distinct `(box_id, name, image_path)`, one `schedule_slot` per
existing `class_templates` row pointing at it. `class_templates` is dropped.

### 4.2 `template_piece` repoints

`template_id` → `class_type_id`. `wod_type` splits into `macro` (`NOT NULL`) and `timing_preset`
(nullable), per §4.4's mapping. The skeleton is a property of the class type, not of a slot.

### 4.3 `class_sessions`

`template_id` → `schedule_slot_id` (nullable, as today — a session may be created ad hoc). Every
other column is unchanged: the session remains a snapshot, per decision 1.

### 4.4 `wod`

- `wod_type` → **`macro`** `NOT NULL` + **`timing_preset`** nullable.
- **`timing_json`** `jsonb NOT NULL DEFAULT '{"rounds":1,"segments":[]}'`.
- **`library`** `boolean NOT NULL DEFAULT false`.
- `score_type` stays `NOT NULL` and is now always explicit.
- `time_cap_seconds`, `body_text`, `blocks_json`, `scaling_notes`, `benchmark_template_id` unchanged.

**Vocabulary migration**, applied to `wod.wod_type` and `template_piece.wod_type`:

| old value | `macro` | `timing_preset` |
|---|---|---|
| `WARMUP` | `WARMUP` | null |
| `STRENGTH` | `STRENGTH` | null |
| `SKILL` | `GYMNASTIC` | null |
| `CIRCUIT` | `WORKOUT` | null |
| `CUSTOM` | `WORKOUT` | null |
| `FOR_TIME` | `WORKOUT` | `FOR_TIME` |
| `AMRAP` | `WORKOUT` | `AMRAP` |
| `EMOM` | `WORKOUT` | `EMOM` |
| `INTERVAL` | `WORKOUT` | `INTERVAL` |

`TABATA` joins the preset vocabulary. No existing row maps to it.

Existing rows migrate with `library = true` — everything in the table today *is* the library, and
nothing has yet been attached by copy.

### 4.5 `session_item`

`score_type` becomes `NOT NULL`, backfilled during the migration by applying the old
`defaultScoreType` rule once, to the value it would have derived. After that the derivation is gone.

### 4.6 `bookings`

- `cancelled_at` `timestamptz` nullable, `was_late` `boolean` nullable — both set only on cancel.
- `status` gains `CANCELLED`.
- **`uq_active_booking unique (session_id, membership_id)` is dropped and recreated as partial:**
  `... where status <> 'CANCELLED'`. Same pattern as `uq_subscription_active` in V14.

Without the partial index, soft-cancelling forbids ever re-booking a class you once cancelled. With
it, book → cancel → re-book leaves two rows, which is the true history.

### 4.7 Regenerate support

A domain service that regenerates sessions for a slot **from a given date forward**, leaving earlier
sessions untouched. Decision 1 makes this necessary; M14b builds the screen for it. Existing bookings
on a regenerated session are the open case — see §8.

## 5. JSON contracts

**`blocks_json`** — `Block` gains an optional `blocks`:

```
Blocks { blocks: Block[] }
Block  { label, note, lines: Line[], blocks?: Block[] }   // a nested Block MUST NOT carry blocks
Line   { text, movementId, reps, load, scaling }
```

Depth is capped at 2 by validation on the parse/save path. Existing values remain valid.

**`timing_json`** — new:

```
Timing  { rounds: int, segments: Segment[] }
Segment { seconds: int, kind: "WORK" | "REST", label?: string }
```

Reproducing the tour's own table exactly:

```
EMOM 12    -> { rounds: 12, segments: [ {60, WORK} ] }
Tabata     -> { rounds: 8,  segments: [ {20, WORK}, {10, REST} ] }
the user's -> { rounds: N,  segments: [ {30, WORK, "squat"}, {15, REST}, {30, WORK, "burpees"} ] }
AMRAP 20   -> { rounds: 1,  segments: [ {1200, WORK} ] }
For time   -> { rounds: 1,  segments: [ {cap, WORK} ] }
```

The preset is a starting point the coach edits freely; `timing_preset` records which one it started
from and never constrains what can be built.

## 6. Blast radius — measured, not estimated

`ClassTemplate` is referenced by **9 files** in `backend/src/main/java`: its own entity, its
repository, `ClassTemplateController`, `HomeController`, `SessionDetailController`,
`SessionGenerator`, `MyClassController`, `SkeletonController`, `DevDataSeeder`. **6 test files**
touch `ClassTemplate`, `PieceTypes` or `defaultScoreType`.

`PieceTypes.defaultScoreType` has **exactly one caller**: `SessionItemController:53`.

Every one of these is a keep-it-compiling edit. None of them is an invitation to redesign a response
shape — that is M14b's and M14c's work.

## 7. Verification

- Backend suite green. Every box-scoped endpoint keeps happy + auth-denied + cross-tenant-denied
  coverage; `AuthzConformanceTest` must pass **without any edit to it**, since this milestone adds no
  route. An edit to that file is a signal that scope has leaked.
- **A test that proves depth 3 in `blocks_json` is rejected.** Decision 8 trades a type guarantee for
  a validator, and an untested validator is not a guarantee.
- **A test that proves the partial index permits book → cancel → re-book**, and still forbids two
  simultaneous active bookings. This is the constraint change most likely to be silently wrong.
- **A test that proves `was_late` is stamped from the cutoff in force at cancel time** — change
  `cancel_cutoff_min` afterwards and the stored value must not move.
- A migration test over seeded dev data proving every old `wod_type` lands on the mapping in §4.4,
  and that no `blocks_json` value was rewritten.
- e2e green. Booking, the classes page and the runner all read this model; per the standing rule, run
  on a rebuilt `down -v` stack.

## 8. Open — to be answered before the plan is written

- **What happens to existing bookings when a slot is regenerated forward.** Cancel and notify, move
  to the new session, or refuse to regenerate a date range that has bookings. This is a product
  decision with a mail consequence, and it should be answered rather than defaulted.
- **Whether a `class_type` may have zero slots** and still be listed in the builder — likely yes, as
  a template a coach schedules later, but it decides whether M14b needs an "unscheduled" state.

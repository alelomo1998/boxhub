# M3 Programming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This project's pace (CLAUDE.md):** DEFAULT is inline execution by the main thread — write files, run tests+build, commit in batches. Spawn an agent ONLY for genuinely parallel or high-risk work. The tenancy-critical tasks here (T4 movement filter, T7 slot/board visibility) are the ones worth extra care, not a subagent per task.

**Goal:** Coaches build WODs, program them onto a per-track draft/publish calendar, reuse/duplicate them and clone seeded benchmarks; athletes see a read-only board of published WODs only.

**Architecture:** New backend package `com.boxhub.programming` (Flyway V4, 5 tables). Global `movement` + `benchmark_template` tables are deliberately **not** `@TenantId` (global reads must skip the tenant filter — CLAUDE.md gotcha #1); `track`/`wod`/`program_slot` are `@TenantId` box-scoped. Frontend gets a coach programming area, admin tracks/movement management, and an athlete WOD-board hero screen, all on the existing design system.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Hibernate 6 `@TenantId` / Postgres 16 JSONB / Flyway. Angular 19 standalone + signals, `bh-*` components, SCSS tokens. Testcontainers, Karma, Playwright.

## Global Constraints

- **Build env:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend `mvn`.
- **Flyway only for schema.** Next migration is **V4**. Never edit an applied migration.
- **Tenancy:** resolve tenant ONLY from `TenantContext` (never request params). Every box endpoint gets happy + auth-denied + cross-tenant-denied tests. `@TenantId` entities: any tenant-agnostic query = NATIVE SQL. `movement`/`benchmark_template` are NOT `@TenantId` — filter movements explicitly by `box_id IS NULL OR box_id = :box`. System writers of `@TenantId` entities set a synthetic box tenant (JwtAuthenticationToken, `SCOPE_box`) BEFORE the tx opens (use the `runAsBox` + `TransactionTemplate` pattern from `SessionGenerator`).
- **Roles:** `RoleGuard.requireStaff()` (coach or admin) for programming writes; `RoleGuard.requireBoxAdmin()` for tracks/custom-movement admin. Reads by any box member unless stated.
- **Tenant-filter idiom:** a foreign id looks absent under `@TenantId` → `findById(...).orElseThrow(NoSuchElementException::new)` yields the cross-tenant 404 (see `PlanController.patch`).
- **Design (binding):** tokens only — a raw hex outside `frontend/src/styles/_tokens.scss` is a bug. Warm-dark default; race-red (`--red`) is the only accent; build from `bh-*` components; numbers tabular; identity in hero screens (the athlete WOD board). Verify each FE task with a `grep` for raw hex.
- **Commits:** conventional; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Track progress in `.superpowers/sdd/progress.md`.

**Spec:** `docs/superpowers/specs/2026-07-09-m3-programming-design.md`.

---

## Task 1: Flyway V4 schema + migration test

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__programming.sql`
- Test: `backend/src/test/java/com/boxhub/MigrationTest.java` (extend existing — add V4 assertions)

**Interfaces:**
- Produces tables: `movement`, `benchmark_template`, `track`, `wod`, `program_slot` with the columns/constraints below.

- [ ] **Step 1: Write the migration**

```sql
-- V4__programming.sql

-- Global movement catalog (box_id null) + per-box custom movements. NOT tenant-discriminated:
-- reads must return globals to every box, so this table is intentionally not @TenantId.
create table movement (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid references boxes(id),                       -- null = global seed
    name       text not null,
    category   text not null check (category in
                 ('BARBELL','GYMNASTICS','MONOSTRUCTURAL','DUMBBELL','KETTLEBELL','ODD_OBJECT','OTHER')),
    modality   text,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);
-- unique name within global (box_id null) and within each box, case-insensitive
create unique index uq_movement_global on movement (lower(name)) where box_id is null;
create unique index uq_movement_box on movement (box_id, lower(name)) where box_id is not null;
create index idx_movement_box on movement (box_id);

-- Global read-only benchmark templates (girls + heroes). Not tenant-scoped.
create table benchmark_template (
    id              uuid primary key default gen_random_uuid(),
    name            text not null unique,
    kind            text not null check (kind in ('GIRL','HERO','OTHER')),
    score_type      text not null check (score_type in ('TIME','ROUNDS_REPS','LOAD','NONE')),
    time_cap_seconds int,
    body_text       text not null,
    blocks_json     jsonb not null default '{"blocks":[]}'
);

create table track (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id),
    name       text not null,
    sort_order int  not null default 0,
    archived   boolean not null default false,
    created_at timestamptz not null default now(),
    unique (box_id, name)
);
create index idx_track_box on track (box_id);

create table wod (
    id                    uuid primary key default gen_random_uuid(),
    box_id                uuid not null references boxes(id),
    title                 text not null,
    wod_type              text not null check (wod_type in
                            ('FOR_TIME','AMRAP','EMOM','INTERVAL','STRENGTH','CUSTOM')),
    score_type            text not null check (score_type in ('TIME','ROUNDS_REPS','LOAD','NONE')),
    time_cap_seconds      int,
    body_text             text not null default '',
    blocks_json           jsonb not null default '{"blocks":[]}',
    scaling_notes         text,
    benchmark_template_id uuid references benchmark_template(id),  -- provenance for M4
    created_by            uuid references users(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create index idx_wod_box on wod (box_id);

create table program_slot (
    id           uuid primary key default gen_random_uuid(),
    box_id       uuid not null references boxes(id),
    slot_date    date not null,
    track_id     uuid not null references track(id),
    wod_id       uuid not null references wod(id),
    status       text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED')),
    published_at timestamptz,
    created_by   uuid references users(id),
    created_at   timestamptz not null default now(),
    unique (box_id, slot_date, track_id)
);
create index idx_slot_box_date on program_slot (box_id, slot_date);
```

- [ ] **Step 2: Add assertions to MigrationTest** — assert the 5 tables exist and the `program_slot` unique (box_id, slot_date, track_id) index is present (mirror the existing V3 assertion style in that file).
- [ ] **Step 3: Run** `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q -Dtest=MigrationTest test` → PASS (Flyway applies V4 clean on Testcontainers Postgres).
- [ ] **Step 4: Commit** `feat: M3 V4 programming schema (movements, benchmarks, tracks, wods, slots)`.

---

## Task 2: JPA entities + repositories

**Files:**
- Create under `backend/src/main/java/com/boxhub/programming/`: `Movement.java`, `MovementRepository.java`, `BenchmarkTemplate.java`, `BenchmarkTemplateRepository.java`, `Track.java`, `TrackRepository.java`, `Wod.java`, `WodRepository.java`, `ProgramSlot.java`, `ProgramSlotRepository.java`.
- Test: `backend/src/test/java/com/boxhub/programming/ProgrammingRepositoryTest.java`

**Interfaces:**
- Produces:
  - `Movement` (fields: id, boxId (nullable), name, category, modality, active). `@TenantId` **NOT** used.
  - `MovementRepository.findVisible(UUID boxId)` — `@Query("select m from Movement m where m.active = true and (m.boxId is null or m.boxId = :box)")` (boxId param bound from `TenantContext`, NOT `@TenantId`).
  - `BenchmarkTemplate` (id, name, kind, scoreType, timeCapSeconds, bodyText, blocksJson String). Read-only. Plain `JpaRepository`, `findAllByOrderByKindAscNameAsc()`, `findByKind(String)`.
  - `Track` (`@TenantId boxId`, name, sortOrder, archived). `TrackRepository.findByArchivedFalseOrderBySortOrderAsc()`.
  - `Wod` (`@TenantId boxId`, title, wodType, scoreType, timeCapSeconds, bodyText, blocksJson String, scalingNotes, benchmarkTemplateId, createdBy, createdAt, updatedAt).
  - `ProgramSlot` (`@TenantId boxId`, slotDate LocalDate, trackId, wodId, status, publishedAt, createdBy). `ProgramSlotRepository.findBySlotDateBetween(from,to)`, `findBySlotDateBetweenAndStatus(from,to,status)`, `findBySlotDate(LocalDate)`, `findBySlotDateAndTrackId(date, trackId)`.
- `blocksJson` stored as JSONB but mapped as `String` with `@JdbcTypeCode(SqlTypes.JSON)` on a `@Column(columnDefinition="jsonb")` field. Keep JSON handling at the DTO layer (parse/serialize with Jackson in the service), not in the entity.

- [ ] **Step 1: Write entities** following the `ClassTemplate` style (field-level getters/setters, `@TenantId @Column(name="box_id")` on the box-scoped four; `Movement.boxId` is a plain nullable `@Column(name="box_id")` with NO `@TenantId`). For `blocksJson`:

```java
@JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
@Column(name = "blocks_json", columnDefinition = "jsonb", nullable = false)
private String blocksJson = "{\"blocks\":[]}";
```

- [ ] **Step 2: Write repositories** with the finders above.
- [ ] **Step 3: Write ProgrammingRepositoryTest** (Testcontainers, follows existing RepositoryTest style). Assert:
  - Saving a `Movement` with `boxId=null` and one with a boxId; `findVisible(boxA)` returns global + boxA-custom, NOT boxB-custom.
  - `Track`/`Wod`/`ProgramSlot` round-trip; `program_slot` duplicate (same box+date+track) throws `DataIntegrityViolationException`.
- [ ] **Step 4: Run** `mvn -q -Dtest=ProgrammingRepositoryTest test` → PASS.
- [ ] **Step 5: Commit** `feat: programming entities + repositories`.

---

## Task 3: Tracks API + default-track seeding on box create

**Files:**
- Create: `backend/src/main/java/com/boxhub/programming/TrackController.java`, `TrackService.java`
- Modify: `backend/src/main/java/com/boxhub/box/BoxAdminController.java` (call `trackService.seedDefaults(boxId)` after box create), `DevDataSeeder.java` (Demo Box tracks come via the same path)
- Test: `backend/src/test/java/com/boxhub/programming/TrackControllerTest.java`

**Interfaces:**
- Consumes: `TrackRepository`, `RoleGuard`, `TenantContext`.
- Produces: `TrackService.seedDefaults(UUID boxId)` — seeds `RX` (sort 0) + `Fitness` (sort 1) using the `runAsBox` + `TransactionTemplate` pattern from `SessionGenerator` (tenant set BEFORE tx — gotcha #2). Endpoints under `/api/box/tracks`:
  - `GET /api/box/tracks` → `List<TrackDto>` (active, ordered).
  - `POST /api/box/tracks` (admin) body `{name}` → 201 `TrackDto`.
  - `PATCH /api/box/tracks/{id}` (admin) body `{name?, sortOrder?, archived?}` → `TrackDto`.
- `record TrackDto(UUID id, String name, int sortOrder, boolean archived)`.

- [ ] **Step 1: Write TrackControllerTest** — happy (admin creates track, list returns seeded RX/Fitness + new one ordered), auth-denied (athlete POST → 403), cross-tenant-denied (patch a track id from another box → 404), and box-create seeds RX+Fitness.
- [ ] **Step 2: Run** → FAIL (no controller).
- [ ] **Step 3: Implement** `TrackService.seedDefaults` (runAsBox+tx), `TrackController` (mirror `PlanController`: `RoleGuard.requireBoxAdmin()` on writes, `NoSuchElementException` for foreign ids), wire `seedDefaults` into `BoxAdminController` box-create after `saveAndFlush`, and into `DevDataSeeder` per box.
- [ ] **Step 4: Run** `mvn -q -Dtest=TrackControllerTest test` → PASS.
- [ ] **Step 5: Commit** `feat: tracks API + default RX/Fitness seeding on box create`.

---

## Task 4: Movement catalog API (TENANCY-CRITICAL — global + custom, no cross-box leak)

**Files:**
- Create: `backend/src/main/java/com/boxhub/programming/MovementController.java`
- Test: `backend/src/test/java/com/boxhub/programming/MovementControllerTest.java`

**Interfaces:**
- Consumes: `MovementRepository.findVisible(TenantContext.requireBoxId())`.
- Produces `/api/box/movements`:
  - `GET ?search=&category=` → `List<MovementDto>` = globals + caller-box custom, filtered in-query, name-sorted. Bind `boxId` from `TenantContext` — never rely on `@TenantId` here.
  - `POST` (admin) `{name, category, modality?}` → 201 custom movement with `boxId = TenantContext.requireBoxId()`.
  - `PATCH /{id}` (admin) `{name?, modality?, active?}` — custom ONLY: reject if the loaded movement's `boxId` is null or != caller box → 404 (`NoSuchElementException`). Globals are immutable.
- `record MovementDto(UUID id, String name, String category, String modality, boolean global)` (`global = boxId == null`).

- [ ] **Step 1: Write MovementControllerTest** — the tenancy proofs matter most here:
  - Global movement (boxId null) visible to box A AND box B.
  - Box A creates a custom movement → visible to box A `GET`, **NOT** visible to box B `GET` (the manual-filter proof, since `@TenantId` is off).
  - Box B `PATCH` on box A's custom movement → 404.
  - `PATCH` on a global movement → 404 (immutable).
  - Athlete `POST` → 403.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** controller. Search/category filter applied in the `findVisible` query (add an overload or filter the returned list — keep it simple; list is small). Custom-only mutation guard as above.
- [ ] **Step 4: Run** `mvn -q -Dtest=MovementControllerTest test` → PASS.
- [ ] **Step 5: Commit** `feat: movement catalog API (global + box-custom, no cross-box leak)`.

---

## Task 5: WOD CRUD + duplicate

**Files:**
- Create: `backend/src/main/java/com/boxhub/programming/WodController.java`, `WodService.java`, `WodJson.java` (blocks_json DTO + Jackson (de)serialize helper)
- Test: `backend/src/test/java/com/boxhub/programming/WodControllerTest.java`

**Interfaces:**
- Consumes: `WodRepository`, `RoleGuard.requireStaff()`, `TenantContext`.
- Produces:
  - `WodJson` records: `record Block(String label, String note, List<Line> lines)`, `record Line(String text, UUID movementId, String reps, String load, String scaling)`, `record Blocks(List<Block> blocks)`. `WodService` (de)serializes `Blocks` <-> the entity `blocksJson` String via a shared `ObjectMapper`; validates shape on write (null → empty blocks).
  - `/api/box/wods`:
    - `GET ?search=` → `List<WodDto>`.
    - `POST` (staff) `CreateWodRequest{title, wodType, scoreType, timeCapSeconds?, bodyText?, blocks?, scalingNotes?}` → 201 `WodDto` (sets createdBy, timestamps).
    - `GET /{id}` → `WodDto` (404 cross-tenant).
    - `PATCH /{id}` (staff) partial → `WodDto` (bumps updatedAt).
    - `DELETE /{id}` (staff) → 204; if referenced by any `program_slot`, return 409 `"WOD in use"` (check `programSlotRepository.existsByWodId(id)`); else hard delete.
    - `POST /{id}/duplicate` (staff) → 201 clone (new id, title suffixed " (copy)", copies fields incl. blocks + benchmarkTemplateId, fresh timestamps).
  - `record WodDto(UUID id, String title, String wodType, String scoreType, Integer timeCapSeconds, String bodyText, WodJson.Blocks blocks, String scalingNotes, UUID benchmarkTemplateId)`.
- Add `boolean existsByWodId(UUID wodId)` to `ProgramSlotRepository`.

- [ ] **Step 1: Write WodControllerTest** — create (Fran-style: FOR_TIME/TIME, two blocks with movement lines), get, patch title, duplicate produces independent row, delete unreferenced → 204, auth-denied (athlete POST → 403), cross-tenant (get/patch/delete foreign id → 404).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `WodJson`, `WodService`, `WodController`.
- [ ] **Step 4: Run** `mvn -q -Dtest=WodControllerTest test` → PASS.
- [ ] **Step 5: Commit** `feat: WOD CRUD + duplicate with hybrid blocks JSON`.

---

## Task 6: Benchmark library API + clone-into-box

**Files:**
- Create: `backend/src/main/java/com/boxhub/programming/BenchmarkController.java`
- Modify: `WodService.java` (add `cloneFromBenchmark`)
- Test: `backend/src/test/java/com/boxhub/programming/BenchmarkControllerTest.java`

**Interfaces:**
- Consumes: `BenchmarkTemplateRepository` (global, non-tenant), `WodService`.
- Produces `/api/box/benchmarks`:
  - `GET ?kind=` → `List<BenchmarkDto>` (global list, any box member).
  - `GET /{id}` → `BenchmarkDto` (404 if unknown).
  - `POST /{id}/clone` (staff) → 201 `WodDto` — reads the global template via the plain repo, writes a box `Wod` (tenant from `TenantContext`) copying title=name, wodType inferred or CUSTOM, scoreType, timeCap, bodyText, blocks, and `benchmarkTemplateId = template.id` (provenance).
  - `record BenchmarkDto(UUID id, String name, String kind, String scoreType, Integer timeCapSeconds, String bodyText, WodJson.Blocks blocks)`.

- [ ] **Step 1: Seed 2 templates in a test fixture** (e.g. Fran GIRL/TIME, Murph HERO/TIME) and write BenchmarkControllerTest — list visible to box A and box B (global), clone by box A writes a WOD with `benchmarkTemplateId` set and visible only to box A, athlete clone → 403.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** controller + `WodService.cloneFromBenchmark(UUID templateId)`.
- [ ] **Step 4: Run** `mvn -q -Dtest=BenchmarkControllerTest test` → PASS.
- [ ] **Step 5: Commit** `feat: benchmark library API + clone-into-box`.

---

## Task 7: Programming calendar (slots) + WOD board (TENANCY/VISIBILITY-CRITICAL)

**Files:**
- Create: `backend/src/main/java/com/boxhub/programming/ProgramController.java`, `ProgramService.java`, `WodBoardController.java`
- Test: `backend/src/test/java/com/boxhub/programming/ProgramControllerTest.java`, `WodBoardControllerTest.java`

**Interfaces:**
- Consumes: `ProgramSlotRepository`, `TrackRepository`, `WodRepository`, `WodService` (to build WodDto), `RoleGuard`, `TenantContext`.
- Produces:
  - `/api/box/program`:
    - `GET ?from=&to=&trackId=` (staff) → `List<SlotDto>` — all slots (draft+published) in range, optional track filter.
    - `PUT` (staff) `AssignRequest{slotDate, trackId, wodId}` → upserts the (date,track) slot to point at wodId, status defaults DRAFT on create, preserves status on update; validates trackId+wodId belong to box (404 otherwise); handles the unique constraint as an upsert (find existing by date+track, else create). Returns `SlotDto`.
    - `PATCH /{id}` (staff) `{status}` — PUBLISHED sets publishedAt=now; DRAFT clears it. 404 cross-tenant.
    - `DELETE /{id}` (staff) → 204 clears the slot.
    - `POST /program/publish` (staff) `{from, to, trackId?}` → publishes all matching draft slots, returns count.
  - `/api/box/wod-board`:
    - `GET ?date=&includeDrafts=` → `BoardDto` grouped by track. **Athletes: published-only, `includeDrafts` ignored/forbidden.** Staff may pass `includeDrafts=true`. Default date = today (box tz not required for M3; use server date).
  - `record SlotDto(UUID id, LocalDate slotDate, UUID trackId, String trackName, UUID wodId, String wodTitle, String status)`.
  - `record BoardDto(LocalDate date, List<BoardTrack> tracks)`, `record BoardTrack(UUID trackId, String trackName, WodDto wod, String status)`.

- [ ] **Step 1: Write ProgramControllerTest** — assign creates a DRAFT slot; second assign to same (date,track) updates wodId without duplicating (unique upsert); publish flips status + sets publishedAt; bulk publish counts; DELETE clears; assign with foreign trackId/wodId → 404; athlete PUT → 403; cross-tenant PATCH → 404.
- [ ] **Step 2: Write WodBoardControllerTest** — the visibility proof: a box with one PUBLISHED and one DRAFT slot on a date. Athlete `GET /wod-board?date` returns ONLY the published track's WOD; the drafted track is absent (or wod null). Staff `GET ?includeDrafts=true` sees both. Cross-tenant: box B athlete sees nothing of box A.
- [ ] **Step 3: Run both** → FAIL.
- [ ] **Step 4: Implement** `ProgramService` (upsert by find-or-create on date+track; bulk publish), `ProgramController`, `WodBoardController` (role-gate `includeDrafts`: if caller is athlete, force published-only). Use `@Transactional(readOnly=true)` where lazy relations are read.
- [ ] **Step 5: Run** `mvn -q -Dtest=ProgramControllerTest,WodBoardControllerTest test` → PASS.
- [ ] **Step 6: Commit** `feat: programming calendar slots + published-only WOD board`.

---

## Task 8: Seed global movements + benchmarks + demo week

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__seed_programming.sql` (global movements + benchmark templates — reference data, seeded via migration so it exists in prod, not just dev)
- Modify: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java` (Demo Box: a few sample WODs + one published week on RX/Fitness)
- Test: extend `MigrationTest` (assert movement/benchmark row counts > threshold)

**Interfaces:**
- Produces: global `movement` rows (curated ~120–150: common barbell/gymnastics/monostructural/DB/KB movements) and `benchmark_template` rows (girls: Fran, Grace, Isabel, Helen, Cindy, Diane, Elizabeth, Karen, Annie, Angie, Barbara, Nancy; heroes: Murph, DT, JT, Michael, Chad, Randy). Reasonable `blocks_json` + `body_text` + score_type/time_cap per benchmark.

- [ ] **Step 1: Write V5 seed migration** — `insert into movement (name, category, modality) values (...)` for the catalog (box_id null), and `insert into benchmark_template (...)` for the benchmarks. Idempotent by nature (fresh DB); do NOT edit later. *ponytail: names+category only, no media — media is BACKLOG.*
- [ ] **Step 2: Extend MigrationTest** — assert `select count(*) from movement where box_id is null` ≥ 100 and `benchmark_template` ≥ 15.
- [ ] **Step 3: Add demo programming to DevDataSeeder** — inside the existing `runAsBox(demo)` block: clone ~3 benchmarks into WODs, create ~2 custom WODs, assign a Mon–Fri week across RX+Fitness, publish it. Reuse `WodService`/`ProgramService` if injectable, else insert directly under the box tenant.
- [ ] **Step 4: Run** `mvn -q -Dtest=MigrationTest test` → PASS; then full `mvn test` → all green.
- [ ] **Step 5: Commit** `feat: seed global movements + benchmark library + demo programming week`.

---

## Task 9: Frontend programming API client + models

**Files:**
- Create: `frontend/src/app/features/programming/programming.models.ts`, `frontend/src/app/features/programming/programming.service.ts`
- Test: `frontend/src/app/features/programming/programming.service.spec.ts`

**Interfaces:**
- Produces TS models mirroring the backend DTOs (`Track`, `Movement`, `Wod`, `WodBlock`, `WodLine`, `Benchmark`, `Slot`, `Board`, `BoardTrack`) and a `ProgrammingService` (signals + `HttpClient`) with methods: `tracks()`, `createTrack`, `patchTrack`; `movements(search?, category?)`, `createMovement`, `patchMovement`; `wods(search?)`, `wod(id)`, `createWod`, `patchWod`, `deleteWod`, `duplicateWod`; `benchmarks(kind?)`, `cloneBenchmark(id)`; `program(from,to,trackId?)`, `assignSlot`, `patchSlot`, `deleteSlot`, `publish(from,to,trackId?)`; `board(date?, includeDrafts?)`. All hit `/api/box/...` (interceptor adds the box token).

- [ ] **Step 1: Write programming.service.spec.ts** with `HttpTestingController` — assert each method hits the right URL/verb and maps the response (cover at least tracks, wods CRUD, assignSlot, board).
- [ ] **Step 2: Run** `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless` → FAIL.
- [ ] **Step 3: Implement** models + service.
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Commit** `feat: frontend programming API client`.

---

## Task 10: Coach WOD builder + library screen

**Files:**
- Create: `frontend/src/app/features/programming/wod-builder.component.ts`, `wod-library.component.ts` (+ specs)
- Modify: `frontend/src/app/app.routes.ts` (coach-guarded routes `/programming/wods`, `/programming/wods/new`, `/programming/wods/:id`), coach nav/rail.

**Interfaces:**
- Consumes: `ProgrammingService`. Uses `bh-field`, `bh-button`, `bh-panel`, `bh-tag`, `bh-pill`, `.bh-table`.
- Produces: builder form (title, wodType select, scoreType select, optional timeCap, block/line editor with movement picker backed by `movements()`, scaling notes, whiteboard body); saves via `createWod`/`patchWod`. Library: searchable `.bh-table` list with duplicate/edit/delete.

- [ ] **Step 1: Write component specs** — builder renders fields, adds a block+line, links a movement, submits a valid WOD (mock service asserts payload). Library lists WODs, duplicate calls service.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** components + routes + nav entry. Tokens only, `bh-*` components. Movement picker = typeahead over `movements()`.
- [ ] **Step 4: Run** specs → PASS; `npm run build` → clean; `grep -rn "#[0-9a-fA-F]\{3,6\}" frontend/src/app/features/programming` → no raw hex.
- [ ] **Step 5: Commit** `feat: coach WOD builder + library`.

---

## Task 11: Coach programming calendar (week grid + publish)

**Files:**
- Create: `frontend/src/app/features/programming/program-calendar.component.ts` (+ spec)
- Modify: `app.routes.ts` (`/programming/calendar`, coach-guarded), coach nav.

**Interfaces:**
- Consumes: `ProgrammingService` (`program`, `assignSlot`, `patchSlot`, `deleteSlot`, `publish`, `tracks`, `wods`).
- Produces: week grid — rows = active tracks, cols = Mon–Sun of the selected week (prev/next week nav). Each cell shows the assigned WOD title + a draft/published chip (`bh-pill`, published = live/accent, draft = muted). Click empty cell → assign existing WOD (picker) or "new" (route to builder). Cell menu: unassign, publish/unpublish. "Publish week" / "Publish day" buttons.

- [ ] **Step 1: Write spec** — renders track rows × day cols from `program()`, clicking a cell assigns a WOD (asserts `assignSlot`), publish-week calls `publish` with the week range.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** component + route + nav. Published vs draft visually distinct via tokens (draft muted, published gets the rationed accent — NOT decorative, it marks live).
- [ ] **Step 4: Run** specs → PASS; build clean; no-hex grep clean.
- [ ] **Step 5: Commit** `feat: coach programming calendar with per-slot draft/publish`.

---

## Task 12: Benchmark library browse + clone UI

**Files:**
- Create: `frontend/src/app/features/programming/benchmark-library.component.ts` (+ spec)
- Modify: `app.routes.ts` (`/programming/benchmarks`, coach-guarded), coach nav.

**Interfaces:**
- Consumes: `ProgrammingService.benchmarks()`, `cloneBenchmark(id)`.
- Produces: girls/heroes list (filter by kind via `bh-tag`), each with a "Use" action that clones → navigates to the builder on the new WOD.

- [ ] **Step 1: Write spec** — lists benchmarks, kind filter works, "Use" calls `cloneBenchmark` and routes to `/programming/wods/:id`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** component + route + nav.
- [ ] **Step 4: Run** specs → PASS; build clean; no-hex grep clean.
- [ ] **Step 5: Commit** `feat: benchmark library browse + clone`.

---

## Task 13: Admin tracks + movement catalog management

**Files:**
- Create: `frontend/src/app/features/admin/admin-tracks.component.ts`, `admin-movements.component.ts` (+ specs)
- Modify: `app.routes.ts` (`/admin/tracks`, `/admin/movements`, admin-guarded), admin nav.

**Interfaces:**
- Consumes: `ProgrammingService` track + movement methods.
- Produces: tracks list (add, rename inline, archive, reorder via up/down buttons adjusting `sortOrder` — no drag DnD, per spec); movement catalog list (global read-only + box custom; add custom, archive custom).

- [ ] **Step 1: Write specs** — add track calls `createTrack`; up/down reorders via `patchTrack` sortOrder; add custom movement calls `createMovement`; global movements not editable.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** components + routes + admin nav entries.
- [ ] **Step 4: Run** specs → PASS; build clean; no-hex grep clean.
- [ ] **Step 5: Commit** `feat: admin tracks + movement catalog management`.

---

## Task 14: Athlete WOD board (HERO screen)

**Files:**
- Create: `frontend/src/app/features/athlete/wod-board.component.ts` (+ spec)
- Modify: `app.routes.ts` (replace the athlete WOD "coming soon" placeholder with `/wod` → this component), athlete nav.

**Interfaces:**
- Consumes: `ProgrammingService.board(date?)` (athlete = published-only from the API).
- Produces: today's published WOD per track — read-only, tabular, warm-dark broadcast identity. Track tabs or columns; movement lines legible (display font for the WOD title/type, tabular numbers for reps/loads). No scoring controls (M4). Empty state when nothing published today.

- [ ] **Step 1: Write spec** — renders board from `board()`, shows a track's WOD title + lines, shows empty state when no published slots.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the hero screen. This is an identity screen — apply the treatment (Saira Condensed display for titles, tabular numbers, rationed glow on the live/today marker only). Tokens only.
- [ ] **Step 4: Run** specs → PASS; build clean; no-hex grep clean.
- [ ] **Step 5: Commit** `feat: athlete WOD board hero screen (published-only)`.

---

## Task 15: e2e — program a week, publish, athlete sees it

**Files:**
- Create: `e2e/tests/programming.spec.ts`
- Modify: `e2e/` page helpers if needed. Keep `workers:1` (serial — shared seeded backend).

**Interfaces:**
- Consumes: running compose stack (dev users `coach@demo.io`, `athlete@demo.io`, password `password123`).

- [ ] **Step 1: Write the e2e** — coach logs in → builds a WOD (or clones a benchmark) → programs it onto today on the RX track → publishes → logs out → athlete logs in → `/wod` board shows the published WOD; a drafted track's WOD is absent.
- [ ] **Step 2: Bring up stack** `docker compose -f docker/docker-compose.yml up -d --build`, then `cd e2e && npx playwright test programming.spec.ts` → PASS (retries:1 for cold start).
- [ ] **Step 3: Run full e2e** `npx playwright test` → all green serial.
- [ ] **Step 4: Commit** `test: e2e programming week publish + athlete board visibility`.
- [ ] **Step 5: Stop stack** `docker compose -f docker/docker-compose.yml down`.

---

## Final: whole-milestone verification + finish branch

- [ ] Backend `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` → all green (~77 prior + new).
- [ ] Frontend `npm test -- --watch=false --browsers=ChromeHeadless && npm run build` → green.
- [ ] `grep -rn "#[0-9a-fA-F]\{3,6\}" frontend/src/app` → only `_tokens.scss` (verify no raw hex crept in).
- [ ] Update `docs/HANDOFF.md` status (M3 done), prune `docs/BACKLOG.md`, update `.superpowers/sdd/progress.md`.
- [ ] Invoke superpowers:finishing-a-development-branch (merge m3-programming → main, push).

---

## Self-review notes (coverage against spec)

- Movement catalog (global+custom) → T1/T2/T4/T8. Benchmarks (girls+heroes, clone) → T1/T6/T8. WOD builder (hybrid blocks) → T1/T2/T5/T10. Tracks (box-configurable, seeded) → T1/T3/T13. Calendar (one/track/day, draft/publish, bulk) → T1/T7/T11. Duplicate/reuse → T5 (duplicate) + T7 (reuse via re-assign). Athlete published-only board (hero) → T7/T14. Tenancy proofs → T4 (movement no-leak), T7 (board visibility), cross-tenant tests on every box endpoint. Seeding → T8. e2e acceptance → T15.
- Gotcha coverage: #1 (non-@TenantId global reads) T2/T4; #2 (system writer synthetic tenant) T3/T8; #4 (lazy relations `@Transactional(readOnly=true)`) T7.
```

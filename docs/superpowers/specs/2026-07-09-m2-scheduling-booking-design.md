# BoxHub M2 — Scheduling & Booking Design Spec

**Date:** 2026-07-09 · **Status:** approved direction, pre-plan
**Milestone:** M2 of the master roadmap (`docs/superpowers/specs/2026-07-07-boxhub-design.md` §9). Builds on merged M0 (auth/tenancy) + M1 (box core). Binding for M2 work.

**Goal:** Athletes book classes and coaches run the roster. Recurring weekly templates materialize into concrete sessions; athletes book with waitlist auto-promotion, cancel within a cutoff, and are held to their plan's weekly limit; coaches mark attendance.

---

## 1. Locked decisions (from brainstorming)

1. **Session generation** — rolling horizon, automatic. A scheduled job materializes concrete sessions from active templates up to `booking_horizon_weeks` ahead. Sessions are individually editable/cancelable; templates are the recurring schedule.
2. **Waitlist** — auto-promote, FIFO by position. Full session → WAITLIST; a freed spot promotes waitlist position 1 to BOOKED, atomically server-side.
3. **Cancellation** — box-configured cutoff (`cancel_cutoff_min`, default 120). Cancel before cutoff = free, frees the spot + promotes waitlist. Cancel after cutoff = refused (409); the booking stands and becomes NO_SHOW if the athlete doesn't attend. No penalty/no-show-count system in M2.
4. **Plan weekly limit** — hard block. Booking refused (409) when the athlete already holds `weekly_class_limit` BOOKED/CHECKED_IN sessions in that Mon–Sun week (box timezone). Null limit = unlimited. Waitlist entries don't count until promoted.
5. **Check-in** — coach marks the roster (tap present → CHECKED_IN). Booked-but-unmarked after start → NO_SHOW. Athlete self-check-in is a later milestone.
6. **Roles** — BOX_ADMIN manages templates + box booking settings; COACH manages individual sessions (edit/cancel) + rosters/check-in; ATHLETE books/cancels. (Admin is usually also a coach.)
7. **Members only** — no drop-in / non-member booking in M2 (later).
8. **Tracks (RX/Fitness)** — deferred to M3; not modeled here.

## 2. Data model (V3 migration, Flyway)

All tables `@TenantId` on `box_id` (per ADR-001; **any tenant-agnostic query needs native SQL** — the M1 lesson).

```sql
-- box booking settings live on the existing boxes row
alter table boxes add column cancel_cutoff_min int not null default 120;
alter table boxes add column booking_horizon_weeks int not null default 2;

create table class_templates (
    id          uuid primary key default gen_random_uuid(),
    box_id      uuid not null references boxes(id),
    name        text not null,
    weekday     int  not null check (weekday between 0 and 6),   -- 0=Mon .. 6=Sun
    start_time  time not null,                                   -- local wall-clock in box tz
    duration_min int not null check (duration_min > 0),
    capacity    int  not null check (capacity > 0),
    coach_id    uuid references users(id),
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);
create index idx_templates_box on class_templates(box_id);

create table class_sessions (
    id           uuid primary key default gen_random_uuid(),
    box_id       uuid not null references boxes(id),
    template_id  uuid references class_templates(id),
    name         text not null,
    start_at     timestamptz not null,          -- concrete instant (UTC), displayed in box tz
    duration_min int not null check (duration_min > 0),
    capacity     int not null check (capacity > 0),
    coach_id     uuid references users(id),
    status       text not null default 'SCHEDULED' check (status in ('SCHEDULED','CANCELLED')),
    created_at   timestamptz not null default now(),
    unique (template_id, start_at)              -- idempotent generation
);
create index idx_sessions_box_start on class_sessions(box_id, start_at);

create table bookings (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    session_id    uuid not null references class_sessions(id),
    membership_id uuid not null references memberships(id),
    status        text not null check (status in ('BOOKED','WAITLIST','CHECKED_IN','NO_SHOW','CANCELLED')),
    position      int,                           -- waitlist order; null for non-waitlist
    booked_at     timestamptz not null default now(),
    checked_in_at timestamptz,
    -- one active booking per athlete per session (cancelled rows don't collide)
    constraint uq_active_booking unique (session_id, membership_id)
);
create index idx_bookings_session on bookings(session_id);
create index idx_bookings_membership on bookings(membership_id);
```

Note on `uq_active_booking`: a CANCELLED booking must not block re-booking. Simplest: on cancel, **delete** the row (waitlist promotion recomputes positions) rather than keep CANCELLED. So the `bookings` status set in practice is BOOKED/WAITLIST/CHECKED_IN/NO_SHOW; CANCELLED is transient (row removed). Attendance history (CHECKED_IN/NO_SHOW) is retained. This keeps the unique constraint clean and re-booking trivial.

## 3. Booking engine (the concurrency core)

One service, `BookingService`, owns all state transitions. Every mutation is `@Transactional` and takes a **pessimistic lock on the session row** (`SELECT … FOR UPDATE`) so capacity and waitlist decisions serialize per session.

- **book(sessionId, membership):**
  1. Lock session. Reject if CANCELLED or `start_at` past.
  2. Cutoff/limit checks (below). Reject → 409.
  3. Count BOOKED for session. If `< capacity` → create BOOKED. Else → create WAITLIST with `position = max(position)+1`.
- **cancel(sessionId, membership):**
  1. Lock session. Find the athlete's active booking.
  2. If past `cancel_cutoff_min` before `start_at` and booking is BOOKED → 409 (can't self-cancel late). WAITLIST cancel is always allowed.
  3. Delete the booking. If it was BOOKED and a WAITLIST exists → promote position 1 to BOOKED (clear its position), decrement remaining positions.
- **plan weekly-limit:** within the txn, resolve the membership's plan `weekly_class_limit`; if non-null, count the athlete's BOOKED+CHECKED_IN sessions whose `start_at` falls in the same Mon–Sun week (box timezone) as the target session; reject if `>= limit`.
- **check-in(sessionId, bookingId) [coach]:** set CHECKED_IN + `checked_in_at`. **no-show(bookingId):** set NO_SHOW. A daily job (or on-roster-read derivation) flips BOOKED→NO_SHOW for past sessions left unmarked — M2 uses **coach-marked only + a nightly sweep** for unmarked past BOOKED.

**This service + its race/cutoff/limit tests is the high-risk pocket → built by one agent with mandatory tests: concurrent double-book on last spot (no oversell), concurrent cancel+book, waitlist promote ordering, cross-tenant denial, cutoff boundary, weekly-limit boundary.**

## 4. Session generation

`SessionGenerator` (`@Scheduled` daily + invoked on template create/reactivate): for each active template, compute session `start_at` instants from `weekday`+`start_time` in the box timezone for each week up to `booking_horizon_weeks` ahead; upsert via the `(template_id, start_at)` unique constraint (skip existing). Cancelling/editing a template does not retro-delete future materialized sessions (coach cancels those explicitly) — deactivating a template just stops future generation.

## 5. Endpoints

Tenant from `TenantContext`; box-scoped under `/api/box/**` (SCOPE_box). Role via `RoleGuard`.

**Admin (BOX_ADMIN):**
- `GET/POST /api/box/class-templates`, `PATCH /api/box/class-templates/{id}` (edit/deactivate)
- `PATCH /api/box/settings` gains `cancelCutoffMin`, `bookingHorizonWeeks`

**Coach (COACH or BOX_ADMIN):**
- `GET /api/box/sessions?from=&to=` — calendar range (both roles + athlete can read)
- `PATCH /api/box/sessions/{id}` — edit (capacity/coach/time) / cancel (status=CANCELLED; cancelling notifies nobody in M2, just frees bookings)
- `GET /api/box/sessions/{id}/roster` — bookings with athlete name + status
- `POST /api/box/sessions/{id}/checkin` `{bookingId}` → CHECKED_IN; `POST …/no-show` `{bookingId}`

**Athlete (any box role):**
- `GET /api/box/sessions?from=&to=` — with the caller's booking state per session (booked/waitlisted/full/position)
- `POST /api/box/sessions/{id}/book` → 201 booking (BOOKED or WAITLIST) / 409 with reason (`FULL`→waitlist is not 409; `LIMIT_REACHED`/`PAST_CUTOFF`/`CANCELLED`/`ALREADY_BOOKED` are)
- `DELETE /api/box/sessions/{id}/booking` — cancel own booking
- `GET /api/box/my-bookings?from=` — upcoming bookings + waitlist positions

RFC 7807 errors; the 409 body carries a machine `reason` code for the frontend.

## 6. Frontend (design system)

All on `bh-*` components + tokens. New screens:
- **Admin › Schedule** — template list + create/edit form (weekday, time, duration, capacity, coach); a week/agenda view of generated sessions with edit/cancel.
- **Coach › Roster** — a session's booked + waitlist lists; tap to check-in / mark no-show. (Seeds the M6 live class-runner; M2 is the static roster.)
- **Athlete shell → real content:** a **booking calendar** (upcoming sessions, capacity/"X spots"/"waitlist" state, book/cancel button, weekly-limit feedback) + **My bookings** (upcoming, waitlist position, cancel).
- Coach shell gets a sessions/roster entry; athlete shell replaces the placeholder.

## 7. Testing & quality bar (per master §7)

- Booking engine: unit + slice tests for every rule; **concurrency tests** (two threads booking the last spot → exactly one BOOKED, one WAITLIST; concurrent cancel/promote). Cross-tenant denial on every new endpoint (mandatory).
- Session generation idempotency test (run twice → no duplicates; horizon respected; box-timezone correctness incl. a DST-adjacent case).
- Playwright e2e: athlete books → session fills → second athlete waitlisted → first cancels → second auto-promoted → coach checks in. This is the M2 acceptance flow.
- Perf budget per master (p95 < 300ms reads).

## 8. Definition of Done

- Templates create → sessions auto-generate to horizon (job + on-create), idempotent, box-tz correct.
- Athlete books; full → waitlist; cancel before cutoff promotes next; after cutoff blocked; plan weekly limit hard-blocks — all proven by tests + the e2e flow.
- Coach marks a roster; unmarked past BOOKED → NO_SHOW via nightly sweep.
- All screens on the design system; both themes; frontend specs + build green; full suite + e2e green; merged to main; CI green.

## 9. Execution note (process)

Lean, judgment-based (per `CLAUDE.md`): migration, templates CRUD, settings, session generation, and all frontend = inline. The **`BookingService` (capacity + waitlist promote + cutoff + plan-limit, with race tests)** = one implementer agent + one review — it's the concurrency/correctness risk pocket. Deferred ideas → `docs/BACKLOG.md`.

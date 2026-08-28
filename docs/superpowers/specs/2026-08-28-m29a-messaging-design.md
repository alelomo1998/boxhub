# M29a — messaging design

**Status:** approved 2026-08-28. Supersedes nothing; extends the `Announcement` entity from `V7`.
**Milestone:** M29a, Phase A position 7. `M29b` (notifications) follows and depends on this.
**Predecessor:** M39 analytics foundations, closed at `40ac190`.

---

## 1. Scope

Three things, one subsystem:

1. **Staff ↔ member 1:1 threads**, both directions, coaches included.
2. **A staff shared inbox** over those threads.
3. **Announcements grown up** — segments (everyone / one class's roster / expiring members),
   with history, built on the existing `Announcement` entity.

**No member ↔ member.** Not a rule to enforce but a shape to build: no endpoint anywhere accepts a
recipient chosen by a member. A member's own routes carry no id at all, so there is nothing to
tamper with. Member-to-member messaging would be moderation, blocking and abuse reporting for a
community that already lives in WhatsApp — out of scope permanently, not deferred.

### Boundary with M29b

M29a owns **thread state**. M29b owns the **event feed**.

| Belongs to M29a | Belongs to M29b |
|---|---|
| `member_last_read_at` / `staff_last_read_at` on a thread | `NotificationEvent(NEW_MESSAGE)` |
| Unread count on the Messages surface itself | The global in-app inbox and shell badge |
| Nothing emitted, no event system | Per-type preferences, waitlist/cancellation/expiry events |

M29a emits no events and builds no notification infrastructure. M29b layers on top and rewrites
none of this. Push is M27c's and picks its own transport.

---

## 2. Decisions

Each was put as an explicit fork and chosen; recorded so they are not re-argued.

| # | Decision | Rationale |
|---|---|---|
| D-1 | **One thread per member, shared by all staff.** Replies attributed to the individual sender. | This *is* the shared inbox — no second construct. Member-side UI is one conversation with "your gym". Accepted cost: no private coach↔member side-channel. |
| D-2 | **Announcement audience frozen at send**, one recipient row per matched member. | "Expiring members" is a moving set. Resolved at read time, a member who renews would silently lose a message genuinely sent to them, and "who received this?" would be unanswerable. Also gives per-member read state a home. |
| D-3 | **One shared staff read marker per thread**, not per staff member. | What "shared inbox" means everywhere else: the queue is the team's. One column, not a row per staff member per thread with backfill on every hire and promotion. Prevents two coaches answering the same thread. |
| D-4 | **Announcement history replaces the single overwritten row.** Home keeps its card, now showing the latest send addressed to me. | Staff get history and read counts; the athlete home screen does not change shape. One announcement concept, not two. |
| D-5 | **Polling, not SSE.** Fetch on open, re-fetch every 20s while visible, stop when hidden. | SSE in this repo exists only in the TV subsystem, which has an **open, un-root-caused lost-push bug owned by M37**. Building messaging on that transport inherits the defect and makes the next red ambiguous. |
| D-6 | **Member entry is a header envelope**, not a sixth dock tab. | The athlete dock holds five; six pills crowd at 360px, and the shell has visual baselines recorded against it. Messaging is a check-when-notified surface, not a primary destination. |
| D-7 | **Waitlisted members are included in a class-roster announcement.** | "Tomorrow's 6am is cancelled" is precisely the message someone waiting for a spot needs. |
| D-8 | **Coaches may send announcements** (`requireStaff`, matching today's rule), and reach the screen in their own shell. | A coach cancelling their own class should not need an admin. |

---

## 3. Data model

Three new tables, one altered.

```sql
message_thread
  id                       uuid pk
  box_id                   uuid not null   -- @TenantId
  membership_id            uuid not null   -- the member; staff side is the box
  created_at               timestamptz not null
  last_message_at          timestamptz
  last_message_from_staff  boolean not null default false
  member_last_read_at      timestamptz
  staff_last_read_at       timestamptz     -- ONE marker, shared by all staff (D-3)
  unique (box_id, membership_id)

message
  id                    uuid pk
  box_id                uuid not null      -- @TenantId
  thread_id             uuid not null references message_thread(id)
  sender_membership_id  uuid not null references memberships(id)
  sender_side           text not null check (sender_side in ('MEMBER','STAFF'))
  body                  text not null
  created_at            timestamptz not null

announcement            -- ALTERED, see §7
  id           uuid pk
  box_id       uuid not null              -- @TenantId; UNIQUE constraint DROPPED
  body         text not null
  segment      text not null check (segment in ('EVERYONE','CLASS_ROSTER','EXPIRING'))
  segment_ref  uuid                       -- class_sessions(id) when CLASS_ROSTER, else null
  sent_by      uuid references users(id)  -- renamed from updated_by
  sent_at      timestamptz not null       -- renamed from updated_at

announcement_recipient
  id               uuid pk
  box_id           uuid not null          -- @TenantId
  announcement_id  uuid not null references announcement(id) on delete cascade
  membership_id    uuid not null references memberships(id)
  read_at          timestamptz
  unique (announcement_id, membership_id)
```

### Why `sender_side` is stored, not derived

A message sent by someone acting as a member stays a member message after that person is promoted
to coach. Deriving the side from the sender's *current* role rewrites history — the same reasoning
as D-2's frozen audience.

### Why `last_message_at` / `last_message_from_staff` are denormalised

The shared inbox list needs "who spoke last, when" for every thread. Denormalised, that list is one
query with no N+1. Both columns are written in the same transaction as the message insert, inside a
single service method, so they cannot drift from the `message` rows.

**"Needs reply" is derived, never stored:**

```
needs_reply  =  last_message_from_staff = false
            AND last_message_at > coalesce(staff_last_read_at, '-infinity')
```

No status column, no state machine, nothing to leave in the wrong state.

---

## 4. Tenancy and intra-box confidentiality

**This is the section that matters most. Read it before writing a repository method.**

Every new entity is `@TenantId`. Every write happens on a request thread serving a user inside a
box, so an ambient tenant is always present: no `runAsBox`, no `runAsRoot`, and none of TENANCY.md
failure mode 2 (a `@TenantId` row written in a tenant-less half stamping the all-zeros sentinel).

### `@TenantId` is box-scoping, NOT member-scoping

Both members of a leak are in the *same box*, so the tenant filter passes. This is stated as a
known, **verified** limit of the conformance sweep at
`backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java:95`:

> **Probe (d) is a CROSS-BOX assertion only — it cannot see an intra-box leak.** […] dropping the
> caller scoping from `LiftController.byMovement` (so it returns every member's lifts) leaves this
> sweep GREEN, because `LiftEntry` is `@TenantId` and the derived query is still box-filtered.
> […] Athlete-vs-athlete visibility inside one box is a different guarantee and belongs in the
> per-feature tests, not here.

`SecurityConfig.java:87` gates `/api/box/**` at `hasAuthority("SCOPE_box")` only — any
authenticated member of any box. There is no role separation in the security config; role
enforcement lives entirely in per-handler `RoleGuard` calls.

Consequence for messaging: `message_thread`, `message` and `announcement_recipient` are box-filtered
and **not** member-filtered. A finder that loses its `AND membership_id = :me` returns every
member's private correspondence, and `@TenantId` passes it, probe (c) passes it, probe (d) passes
it, and the suite stays green. That is the shape of M39's D-3 defect and of the `LiftController`
example above. For lifts a leak is embarrassing; here it *is* the product's confidentiality model.

### Three countermeasures, all mandatory

1. **Member-facing finders scope by membership inside the repository method**, never by the caller
   assembling a filter afterwards. No `findAll()` on any of the three entities. A fourth standing
   grep joins the three from M39, and must stay empty:

   ```sh
   grep -rn "messageThreads\.findAll()\|messages\.findAll()\|announcementRecipients\.findAll()" \
        backend/src/main/java
   ```

2. **A fourth mandatory test per messaging endpoint.** CLAUDE.md requires happy + auth-denied +
   cross-tenant-denied. Messaging adds **cross-member-denied**: member B, same box, ACTIVE, asks for
   member A's thread and announcements and sees nothing of A's. Negative control, named: remove the
   `membership_id` predicate from the finder and that test must go red. If it does not, the test is
   worthless and says so.

3. **Member routes carry no path id** (`/api/box/me/thread`, not `/api/box/threads/{id}`), so there
   is nothing to tamper with in the URL. A future `/api/box/me/{someId}/…` hits the sweep's
   `concrete` hard failure rather than slipping through.

### Staff routes

Staff routes *are* covered structurally. Probe (c) (`AuthzConformanceTest.java:61`) fires box A's
ATHLETE token at every route declaring a role stricter than ATHLETE and requires 403. Declaring the
staff routes `COACH` in `MIN_ROLE` therefore makes a forgotten `RoleGuard.requireStaff()` a **build
failure**, not a latent hole.

### Membership queries

`Membership` is **not** `@TenantId`. Segment resolution queries it explicitly by `boxId` and never
via `memberships.findAll()` — M39's standing grep stays at zero.

---

## 5. Segments

| Segment | `segment_ref` | Resolved as |
|---|---|---|
| `EVERYONE` | null | Memberships in the box with `status = 'ACTIVE'` |
| `CLASS_ROSTER` | `class_sessions(id)` | Bookings for that session with `status in ('BOOKED','CHECKED_IN','WAITLIST')` (D-7) |
| `EXPIRING` | null | Active subscription whose `current_period_end` falls within `EXPIRING_SOON_DAYS`; a grandfathered subscription (null end) never counts |

Resolution runs **once, at send**, and writes one `announcement_recipient` row per match (D-2).
Members with no match get no row and never see the announcement.

### The expiry window — a real inconsistency, resolved deliberately

Two different windows exist in the codebase today:

- `MemberController.java:28` — `EXPIRING_SOON_DAYS = 14`, used for the staff members list.
- `HomeController` — an inline `planDaysLeft <= 7` for the athlete's own `planExpiringSoon` banner.

**The `EXPIRING` segment reuses `MemberController.EXPIRING_SOON_DAYS` (14)**, because the segment is
a staff-facing audience and must match the "expiring soon" members the same staff see in the members
list. The constant is promoted out of `MemberController` to a shared home so both read one
definition. **`HomeController`'s 7-day athlete banner is deliberately left alone** — it is a
different question ("is *my* plan about to lapse") aimed at a different reader, and unifying it is
not this milestone's call. Filed as a one-line note in `docs/BACKLOG.md` rather than silently
changed.

---

## 6. API

### Member side — no path ids, `me`-scoped throughout

```
GET  /api/box/me/thread                     200 {thread, messages[]}; 200 {null, []} if none yet
POST /api/box/me/thread/messages            {body} — creates the thread on first send
POST /api/box/me/thread/read                sets member_last_read_at = now()
GET  /api/box/me/announcements              my recipient rows joined to their announcements
POST /api/box/me/announcements/{id}/read    sets read_at; 404 if not addressed to me
```

`{id}` on the last route is an **announcement** id, and the handler resolves the recipient row by
`(announcement_id, my membership_id)` — a member passing an announcement they were not sent gets
404, never someone else's row.

**`GET /api/box/me/thread` always returns 200, never 204** — a member with no thread yet is a
normal empty state the screen renders, not a missing resource. 204 would force the frontend to
branch on status instead of on data, and the old `GET /api/box/announcement` did exactly that.

### Staff side — `requireStaff()`, addressed by member

```
GET  /api/box/threads                          inbox list
GET  /api/box/threads/{membershipId}           thread + messages
POST /api/box/threads/{membershipId}/messages  {body} — creates the thread on first send
POST /api/box/threads/{membershipId}/read      sets staff_last_read_at = now()
POST /api/box/announcements                    {body, segment, segmentRef} — sends
GET  /api/box/announcements                    history, newest first, + sent/read counts
```

Addressing by `membershipId` rather than a thread id means staff opening a **new** conversation need
no separate create call — the thread is created lazily on first send, exactly as on the member side.
`{membershipId}` already has a seeded entry in the sweep's `pathIds` (`AuthzConformanceTest.java:311`).

### Retired

`PUT /api/box/announcement` and `DELETE /api/box/announcement` are removed, along with
`GET /api/box/announcement`.

**Verified safe:** `putAnnouncement()` at `frontend/src/app/features/athlete/home.service.ts:32` and
`announcement()` at `:31` have **no callers** — the athlete home card reads the `announcement` field
of the `/api/box/home` DTO, not these endpoints. That DTO field stays; its source changes from
`announcements.findAll().stream().findFirst()` to *the latest send addressed to me*, joined through
`announcement_recipient`. Both dead service methods are deleted with the endpoints.

### `MIN_ROLE` registrations

All new routes are declared in `AuthzConformanceTest`'s `MIN_ROLE` (line 422); the three retired
routes are removed from it. Member routes declare `ATHLETE`, staff routes `COACH`. **The
orchestrator audits this edit personally — never an executor** (CLAUDE.md, M11 standing guarantee).

---

## 7. Migration — `V30__messaging.sql`

`V29` is applied and untouched. `V30`:

1. `alter table announcement drop constraint` on the `box_id` **unique** (from `V7__class_model.sql:37`)
   — history requires many rows per box.
2. `alter table announcement rename column updated_at to sent_at`, `updated_by to sent_by`.
3. `alter table announcement add column segment text not null default 'EVERYONE'`, then drop the
   default; `add column segment_ref uuid references class_sessions(id)`; add the segment check
   constraint.
4. `create table message_thread`, `message`, `announcement_recipient` with the columns in §3.
5. Indexes: `message(thread_id, created_at)`, `message_thread(box_id, last_message_at desc)`,
   `announcement_recipient(membership_id, announcement_id)`, `announcement(box_id, sent_at desc)`.
6. **Backfill:** each existing `announcement` row becomes one `EVERYONE` send, and fans out one
   `announcement_recipient` row per `ACTIVE` membership in that row's box. Existing announcements
   keep appearing on athlete home; nobody loses a message to the migration.

---

## 8. Screens

Three, each through the **full impeccable routine with Claude in Chrome connected**:
`shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH`.

| # | Screen | Routes | Notes |
|---|---|---|---|
| 1 | **Athlete Messages** | `/athlete/messages` | The box thread plus a read-only announcements section. Reached via an envelope in the shell header with an unread count; the dock stays at five (D-6). |
| 2 | **Staff Inbox** | `/coach/inbox`, `/admin/messages` | One component, two routes, one per shell. List shows member, last message preview, and a derived needs-reply mark. |
| 3 | **Announcements** | `/coach/announcements`, `/admin/announcements` | One component, two routes (D-8). Composer plus history with sent/read counts. |

### Binding design constraints

- **Volt budget is already spent** by the box switcher's mark in every shell header. These are
  plumbing screens, not hero screens: **no volt**. The needs-reply mark and the unread count use
  `--bone` and weight, not accent. The dock's active-tab icon remains exempt as wayfinding chrome.
- **Mono is the prescription voice** — unread counts and timestamps are mono and tabular. Message
  **bodies are prose and therefore Archivo**; mono is banned from prose.
- **Tokens only.** No raw hex, no raw px type sizes.
- **i18n-marked**, every string. Dates through locale-aware formatting. No new hardcoded `€`,
  no new unmarked user-facing string.
- **Form contract:** `(ngSubmit)` dies with `FormsModule`. The composer and the message box bind
  native `<form (submit)="submit($event)" novalidate>` with `preventDefault()`, and
  `bh-field`/`bh-select` bind `[(value)]` against signals — they are not `ControlValueAccessor`s.
- **A disabled send button guards one path, never the action.** Enter submits regardless. The guard
  lives in the handler, and focus moves onto whatever replaces the control.
- **Seven states each**, loading / error / empty on every fetch, pending + inline error with input
  preserved on every save.
- **Reuse `bh-*` components.** Re-implementing a component's markup in a screen is a bug. If a new
  shared component turns out to be genuinely needed, it goes in `frontend/src/app/ui/` under the
  M13c rules (signal inputs only, no `@Input()`/`@Output()`, no raw hex or px) and owes a dev-gallery
  section rendering every state — which adds visual baselines. Prefer composition over a new component.
- **An attribute on a component host does not reach the element inside it.** Anything Playwright must
  `.fill()` takes an explicit input bound to the inner element.

---

## 9. Testing and gates

### Backend, per endpoint

Four tests, not three: **happy + auth-denied + cross-tenant-denied + cross-member-denied** (§4).

Additional targeted tests:

- **Frozen audience:** send to `EXPIRING`, then renew a recipient's subscription. The recipient row
  survives and the member still sees the announcement. Negative control: resolve the segment at read
  time instead and this test goes red.
- **Shared staff marker:** Coach A reads a thread; Admin B sees it as read. Negative control: make
  the marker per-staff-member and this goes red.
- **Announcement history:** two sends leave two rows. Negative control: restore the `box_id` unique
  constraint and the second send fails.
- **`sender_side` frozen:** a member sends, is promoted to COACH, and the old message still reads
  `MEMBER`.
- **Roster segment includes waitlist** (D-7), and excludes `CANCELLED` and `NO_SHOW`.
- **Migration backfill:** an existing announcement survives `V30` with recipient rows for every
  active member.

### Gates at close — all measured, none inherited

| Gate | Command |
|---|---|
| Backend | `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test` |
| Karma | `env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless` |
| Production build | `env -u NODE_OPTIONS npx ng build --configuration production` |
| e2e | on a `down -v` stack, frontend image rebuilt first |
| Visual | `e2e/visual.sh` (Linux container), on a clean stack |
| Eight §8.1 greps | zero |
| M39's three greps + **this milestone's fourth** (§4) | zero |
| `AuthzConformanceTest` | edits limited to `MIN_ROLE` registration, orchestrator-audited |

`ng build` does not compile spec files — Karma is what catches a spec that does not compile. `tsc`
does not type-check Angular templates — only the production build does. Never pipe a gate for its
exit status.

### e2e

One round-trip spec: member sends → staff inbox shows needs-reply → staff replies → member sees it
and the unread count clears. Plus a segmented announcement reaching exactly its roster.
`retries: 0` stays; do not add retries.

---

## 10. Out of scope → `docs/BACKLOG.md`

- Notification events, the global in-app inbox and the shell unread badge — **M29b**
- Push delivery — **M27c**
- SMS channel, automation rules, campaign builder — **M32b**
- Member ↔ member messaging — **permanently out**, not deferred
- Attachments and images, message search, message edit/delete, scheduled sends, typing indicators
- Per-thread rate limiting (the abuse surface is a member spamming their own box thread)
- Unifying `HomeController`'s 7-day athlete expiry banner with `EXPIRING_SOON_DAYS = 14` (§5)

---

## 11. Known open bug not owned here

A TV SSE push can go missing (`docs/BACKLOG.md`, **OPEN, owned by M37**). Not root-caused. M29a
does not touch the TV subsystem and does not use SSE (D-5). If `runner.spec.ts` reds during this
milestone, the WARN now logged by `TvStreamService.push()` on a dropped connection is the first
place to look. **Do not "fix" it with retries** — `playwright.config.ts` sets `retries: 0`
deliberately and records why.

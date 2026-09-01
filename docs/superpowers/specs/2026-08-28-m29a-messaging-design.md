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

---

# AMENDMENT A1 — per-person conversations replace the shared box thread

**Ruled by the user 2026-08-29, mid-milestone, after seeing Task 8 rendered.** This amendment
**supersedes D-1 and D-3** and rewrites §3, §4 and §6. Tasks 1–7 shipped the superseded model;
`05219e3` is the checkpoint. Everything below is binding from here.

## A1.1 What changed and why

The shipped model gave each athlete **one thread, shared by all staff** — the athlete messaged "the
box" and whichever coach was free replied. Rendered, that produced a screen that opens straight onto
a text box, because there is only ever one conversation and so nothing to list.

The user's ruling: **messaging is person-to-person.**

- An **athlete** opens Messages and sees a list of people — **every coach, plus the box admin** —
  each row opening its own 1:1 conversation.
- **Staff** see coaches, the admin **and** athletes.
- **Search** over that list is required, not optional.
- The shared "message the box" thread is **replaced entirely**, not kept alongside (user's explicit
  choice). The consequence was put to the user before the decision and accepted: a message to a
  coach who is away now waits for that coach, where the shared inbox let anyone pick it up.
- **An athlete may not message another athlete.** Confirmed explicitly; it is the boundary the
  tests are written against.

## A1.2 The security property that changes — read this before touching the controllers

The superseded design's guarantee was **structural**: `MyThreadController` carried **no path ids at
all**, so the wire had no way to name another member and "no member↔member" could not be violated
even by a bug. Choosing a coach from a list requires naming a recipient, so **that guarantee is now
a rule, not an impossibility.**

It moves to exactly one place, `MessagingService.assertMayMessage(actor, target)`:

- both memberships resolve **within `TenantContext.requireBoxId()`** — never from a request param;
- `actor != target`;
- if the actor's role is `ATHLETE`, the target's role **must be** `COACH` or `BOX_ADMIN`;
- if the actor is staff, any membership in the box is permitted.

Every conversation endpoint calls it. **`@TenantId` is box-scoping and cannot help here** — both
sides of an athlete↔athlete leak sit in the same box, so the tenant filter passes it, and
`AuthzConformanceTest`'s probe (d) is cross-box only. The **cross-member-denied test is therefore
the only thing standing between this rule and a private-message leak**, and every endpoint owes one:
an ATHLETE token addressing another ATHLETE's membershipId must get 403.

## A1.3 Data model (`V31`)

A thread is an unordered **pair** of memberships. Uniqueness is enforced by the database rather than
by application care: the pair is stored in canonical order with a check constraint, so the plain
unique constraint means "one thread per pair".

```sql
member_lo_id uuid not null,   -- always the numerically smaller uuid
member_hi_id uuid not null,
constraint message_thread_pair_order check (member_lo_id < member_hi_id),
constraint uq_message_thread_pair  unique (box_id, member_lo_id, member_hi_id)
```

Read state is **per participant** — `lo_last_read_at` / `hi_last_read_at` — replacing D-3's single
shared staff marker, which no longer means anything. `last_message_from_staff` is replaced by
`last_sender_membership_id`: "needs reply" is now viewer-relative ("the last message is not mine")
and stays **derived, never stored**.

`message.sender_side` is **dropped**. Ownership is `sender_membership_id == viewer`, so the column
would be a dead field — the same defect `MemberController` documents for `planId`.

**`V31` drops and recreates `message_thread` and `message` rather than migrating them.** The old
shape cannot be mapped onto pairs, because its staff side was *not a person*. This is only
acceptable because **rxed has no production deployment** — `docs/VPS-DEPLOYMENT.md` records the OVH
target as pre-production with open blockers, and `V30` was applied today, in dev, seeded data only.
The migration says so in a comment. **Announcement tables are untouched.**

## A1.4 API — replaces §6's thread endpoints

`MyThreadController` and `StaffInboxController` **collapse into one** `ConversationController`.
Athlete and staff now perform the same operations; the only difference is who they may address,
which lives in `assertMayMessage`. Two controllers would duplicate that rule, and a duplicated
security rule is one that drifts.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/box/contacts?search=` | People the caller may message. Athlete → staff only; staff → everyone in the box. Reuses `MembershipRepository.searchByBox`, which already exists and is what `/api/box/members` uses. |
| `GET` | `/api/box/conversations` | The caller's threads, newest first, with counterpart, preview, `unreadCount` and derived `needsReply`. |
| `GET` | `/api/box/conversations/{membershipId}` | One conversation. **Resolve, never create** — a GET must not write. |
| `POST` | `/api/box/conversations/{membershipId}/messages` | Send; creates the thread lazily on first send. |
| `POST` | `/api/box/conversations/{membershipId}/read` | Mark read; no-ops when no thread exists. |

`{membershipId}` is always **the other person**. **RETIRED:** `/api/box/me/thread**` and
`/api/box/threads**`, removed from `MIN_ROLE` along with their tests.

`/api/box/contacts` is a **top-level path, deliberately not `/api/box/conversations/contacts`** —
`AuthzConformanceTest` seeds a `{id}` from the preceding path segment, and a literal sibling of a
path variable is exactly the shape that confuses it.

## A1.5 Screens — replaces §8 rows 1 and 2

Both messaging screens become **list → conversation**, and the athlete screen and the staff screen
are now *the same screen with a different contact list*.

- **No screen opens onto a composer.** The landing state is the conversation list; the composer
  exists only inside an open conversation. The rejected build put an empty composer mid-screen with
  the label "Message your gym" as the first thing an athlete saw.
- Empty list state teaches the interface and offers the contact picker.
- **Search** filters the list; the contact picker searches all addressable people.
- Everything binding in §8 still holds: no volt, mono for counts and timestamps and never for prose,
  tokens only, i18n on every string, the native-`(submit)` form contract, the handler-side guard,
  the composer's row layout with the circular `variant="solid"` send button (**never `primary`,
  which is volt-filled**), and the seven states.

## A1.6 Announcements are unaffected

§5, D-2, D-4, D-7 and D-8 stand. Segments, the frozen audience and the announcement history do not
touch threads. **Task 10 proceeds against the original spec.**

## A1.7 Conversation UI refinements (user review, 2026-08-29)

Ruled after reviewing the rebuilt screen in the browser. These override A1.5's row and bubble
description.

- **The "Needs reply" tag is REMOVED from the list.** The signal the user wants is *opened vs not
  opened*: unread rows are bold and carry a count, and opening one returns the row to normal. A
  separate derived "needs reply" label on top of that read a second, competing meaning into the same
  row. `ConversationDto.needsReply` stays on the wire — the backend still derives it and the tests
  still cover it — but no screen renders it. Removing the field would be a schema change for a
  presentation decision that may yet return for the staff view.
- **The role tag sits on the NAME line, right of the name** — not on the preview line.
- **The composer is pinned to the bottom of the conversation pane** and **cannot be resized**
  (`resize: none`). The thread scrolls above it.
- **Each message carries the speaker's avatar**, on its own side, collapsed for consecutive messages
  from the same speaker.
- **A message's own meta is the HOUR only** (`HH:mm`). The date moves out of the message entirely
  and becomes a **day separator** between groups: messages run under a small centred date, and when
  the day changes a new separator is drawn. The sender's name is dropped from the meta — in a 1:1
  conversation the avatar and the pane header already say who is speaking.

## A1.8 Read state, and the reach boundary made visible (user review, 2026-08-31)

Three questions were put to the user after the design critique. Answers, and what they change:

1. **Push notification for a time-sensitive message.** *"there would be when we render the web app
   mobile with capacitor"* — push arrives with the Capacitor mobile wrapper, not here. **No work in
   M29a.** Recorded so the gap is a known deferral rather than an oversight: until that ships, a
   message to a coach is seen when the coach next opens rxed.
2. **No read or delivery signal.** *"lets make it"* — build it. The data already exists:
   `message_thread` carries a read marker **per participant** (`lo_last_read_at` /
   `hi_last_read_at`), so whether the counterpart has read a message is a comparison, not a new
   concept. `ConversationDetailDto` gains `counterpartLastReadAt`; the screen marks the sender's own
   latest message Read or Sent. This is what Design Principle 4, "state is never silent", requires
   of the waiting, not just of the sending.
3. **The athlete-to-staff boundary is invisible.** A search for a training partner returns an empty
   result indistinguishable from a typo. *"lets write it maybe in the top or bottom of chat list"* —
   a quiet line on the conversation list saying who you can reach. Placed at the **bottom**: it is an
   explanation, not an action, and the top belongs to the conversations themselves.

   The wording differs by role (an athlete reaches staff; staff reach everyone). **That is copy, not
   authorization** — A1's rule that this screen never branches on role governs who may be addressed,
   which stays server-side in `assertMayMessage`. Reading the caller's own role to choose a sentence
   does not weaken it.

## A1.9 Correction: the list shows conversations, discovery is by search

**A1.1's sentence above ("an athlete opens Messages and sees a list of people — every coach, plus
the box admin") describes the user's ORIGINAL request and was never amended when the decision
changed. It is stale, and the shipped behaviour is correct.** Recorded here because a design
critique re-derived the contradiction from the spec and filed it as a P1 defect against the code —
the next reader would do the same.

When asked how an athlete starts a conversation with someone they have never messaged, the user was
given three options — search surfaces everyone; a + button opening a contact picker; or every
addressable person always listed — and chose **search**. The trade-off was stated at the time: for
staff, "always listed" means every athlete in the gym, potentially hundreds of rows.

So the list shows **conversations**, and typing surfaces addressable people under **Start a chat**.
The empty state names the same path in words.

**The critique's underlying UX argument still stands and is not dismissed by this correction:** an
athlete's addressable set is tiny and bounded (a few coaches and one admin), so requiring recall to
reach it is a real cost on the highest-stakes path — a first message to a coach about an injury. If
that is revisited, the sharp version is to default **Start a chat** to the full addressable list
only when the query is empty AND the caller is an athlete, leaving staff search-first. That was put
back to the user rather than changed unilaterally.

# AMENDMENT A1.10 — how staff reach announcements, and two endpoints the screen needs

**Ruled by the user 2026-08-31, before Task 10 was built.** A1.6 said "announcements are unaffected,
Task 10 proceeds against the original spec". That is still true of §5's segments, D-2's frozen
audience and D-4's history. It was **not** true of the screen's reachability, which §8 row 3 left as
two route names and nothing else. This amendment fills that gap and adds the two endpoints the
screen cannot be built without.

## A1.10.1 The coach's way in is a link on `/coach/classes`, not an action on the class row

D-8 gives a coach the right to announce; **`a147d88` narrowed it to CLASS_ROSTER for a session they
coach**. The obvious-looking design — an "Announce" action on each session row, the class implied by
where you tapped — was put to the user and **rejected in favour of a separate screen**.

Three facts decided it:

1. **`/coach/classes` lists every session in the box, not the coach's own.** `listSessions(from, to)`
   does not filter by coach, so an Announce action on every row would offer a control that 403s on
   most of them.
2. **The frontend cannot tell whose class is whose.** `MembershipDto` and `ActiveBox` carry
   `boxId`, `boxName` and `role` — **no user id** — and `ClassSession.coachId` is a **user** id, not
   a membership id (the same asymmetry `a147d88` had to get right on the server). So "is this mine?"
   is unanswerable client-side, and answering it would mean shipping a second copy of the permission
   rule into the browser.
3. The row already carries three actions and wraps to a second line below 560px.

**Decision:** `/coach/announcements` is a full screen, the same component `/admin/announcements`
renders, and a coach reaches it from a **header link on `/coach/classes`**. The session rows keep
their three actions. The user's stated reason for the separate screen: *"is better to have it as a
separate announcement… in the future we will have a coach home, but that is for a future
milestone."* **The header link is explicitly an interim entry point** — the coach shell's navigation
is revisited when coach home is built, and this link is the first thing that milestone should
reconsider. It is recorded here so the next reader knows it was a placement decision, not an
oversight.

## A1.10.2 `GET /api/box/announcements/targets` — "which classes may I announce to?"

The exact analogue of `/api/box/contacts` ("who may I message"), and it exists for the same reason:
**the permission is the server's to know.** Returns the upcoming sessions (now → +14 days, the
window `/coach/classes` already uses, `CANCELLED` excluded) that the caller may address — every one
for a `BOX_ADMIN`, only those where `coach_id = TenantContext.userId()` for a `COACH`. A null
`coach_id` is an unassigned session and is admin-only, mirroring `assertMaySendToSegment`.

The picker therefore **cannot offer a class the send would refuse**. The alternative — exposing the
viewer's user id and filtering in the browser — was rejected: it duplicates a security rule into a
place where it can drift, which is the defect §4 is written to prevent.

## A1.10.3 `GET /api/box/announcements/preview` — the count in the confirm dialog

Task 10 requires the confirm to **name the recipient count**, and nothing on the wire could answer
it. Deriving it client-side (roster from `bookedCount + waitlistCount`, EVERYONE from the members
list) would be a **second implementation of §5's segment rules**, free to disagree with what the
send actually writes.

So the count comes from `SegmentResolver` — the same resolver the send uses — and
`previewCountMatchesWhatTheSendWrites` is the test that keeps the dialog honest. The endpoint calls
**the existing `assertMaySendToSegment` before resolving**: without it a coach could read the roster
size of a class they do not coach, and the preview would leak precisely what the send refuses.

Both routes are `requireStaff()`, both registered `COACH` in `MIN_ROLE`. Neither takes a path
variable, so neither needs a `pathIds` seed — and both are literal segments with no `{id}` sibling
at their level, which is why they are safe where A1.4 had to make `/api/box/contacts` top-level.

## A1.10.4 The class picker is a `bh-select`

Chosen by the user over a radio list of session rows and over a day-grouped select. One dropdown,
options read `Fri 5 Sep · 06:00 · Metcon`, fed by `/targets`. Same control for admin and coach; only
the data behind it differs, and that difference is the server's.

## A1.10.5 What Task 10 does NOT do

- **The confirm is not a `--danger` flow.** Sending an announcement is irreversible, not
  destructive; `--danger` fills the control that executes a destructive action, and this is not one.
- **No new component in `frontend/src/app/ui/`.** The screen composes `bh-button`, `bh-select`,
  `bh-sheet`, `bh-alert` and `bh-empty`. A new shared component would owe a dev-gallery section
  rendering seven states plus visual baselines, for a screen that needs none of it.
- **The admin dock stays at three tabs.** Announcements joins the admin sidebar `nav` and the
  overflow `moreLinks`, never `mobileTabs`.

# AMENDMENT A1.11 — the composer is rebuilt mobile-first; A1.10.4 is overturned

**Ruled by the user 2026-08-31, after seeing the Task 10 screen rendered.** The screen was built to
A1.10, reviewed in the browser, and **the composer was rejected**. This amendment records why, what
replaced it, and the standing rule the rejection created.

## A1.11.1 The rule this created — mobile first, because of App Review

The user's words: *"lets remember from now on that we need to be VERY MOBILE FRIENDLY, lets remember
that we will need the appstore to accept the app, if we dont have those mobile feature they will
reject us, for me an ng select like this is not mobile friendly."*

This is **not** scoped to M29a. It is now in CLAUDE.md's design rules as binding, and the short
version is:

- Every screen is designed at **360px first** and allowed to grow — never a desktop layout rescued
  by a media query. Nothing may scroll horizontally at **320px**.
- **A native `<select>` is banned for anything richer than a short plain label.** On iOS it collapses
  to a wheel picker showing one truncated line, so a class's name, time, coach and audience size
  become `Fri 5 Sep · 06:0…`. Choosing among domain objects means tappable rows or cards in a
  `bh-sheet`.
- A primary action is **full-width** on mobile, not a small right-aligned button.
- `docs/design-ref/` holds the user's own references and is the arbiter of what "app-like" means
  here. It had been sitting unread since 2026-08-19.

rxed ships to the App Store through Capacitor. "Responsive" is not the bar; App Review rejects
interfaces that merely reflow.

## A1.11.2 **A1.10.4 is overturned.** The class picker is a sheet, not a `bh-select`

A1.10.4 recorded a `bh-select` of upcoming sessions, chosen from three options a day earlier. Seeing
it rendered reversed the decision. Replaced by:

- a **full-width trigger button** showing the chosen class or "Choose a class";
- opening a **`bh-sheet`** containing **`bh-day-pager`** (the control the coach already knows from
  `/coach/classes`, `max=13`, matching `/targets`' 14-day window) and the classes for that day as
  **cards**.

**Card structure comes from `docs/design-ref/screens/booking-screen-example.webp`** — a full-bleed
image with the text laid over the bottom on a `--scrim`, **not** a thumbnail beside a text column,
which is what the first sketch proposed and is not what the reference shows. Each card carries the
class name, `by <coach>`, `HH:mm`, `N booked · N waiting`, and **"N people would get it"**.

**`/coach/classes` is explicitly NOT the model** — the user called it "shit" as an example to
follow. It is a pre-rework screen and its own redesign belongs to the future coach-home milestone
that A1.10.1 already anticipates.

## A1.11.3 The "To" control is tappable rows, not a select either

Three full-width rows, each with a title and a one-line explanation a `<option>` cannot carry
("every active member" / "everyone booked, waitlist included" / "lapsing within 14 days"), with a
checkmark on the selection. Built from **real `<input type="radio">` inside `<label>` cards**, the
input visually clipped rather than `display:none` — which would drop it out of the a11y tree — so
native arrow-key navigation, grouping and semantics come for free instead of being hand-rolled.

**A coach sees no chooser at all**, only a line saying the message goes to the class they pick: they
may send to exactly one segment (A1.10.1), and a one-option chooser is a control that asks a
question with a single answer.

## A1.11.4 The Send button is full-width

Via `class="full"` on `bh-button`, which `button.component.ts` already supports. **A new `lg` size
was deliberately NOT added to `bh-button`** — a shared `ui/` component change owes a dev-gallery
section rendering seven states plus new visual baselines, and whether the control also needs to be
*taller* is a question for the user looking at the full-width version, not a guess made in advance.

## A1.11.5 `/targets` grew to carry a card

`TargetSession` becomes `(id, name, startAt, imagePath, coachName, bookedCount, waitlistCount,
recipientCount)`. `imagePath` follows `SessionDetailController.detail()`: `ScheduleSlot -> ClassType
-> getImagePath()`, signed through `MediaSigner`, and **null is the common case in dev data** — a
card with no image is a plain `--surface-2` card, not a broken `<img>`.

**`recipientCount` is not `bookedCount + waitlistCount`.** It is computed with `SegmentResolver`'s
own rule — statuses `BOOKED`, `CHECKED_IN`, `WAITLIST`, **distinct by `membershipId`** — because the
card promises a number and the confirm dialog promises a number, and if they can disagree one of
them is lying. `targetRecipientCountMatchesPreviewForTheSameSession` is the test holding that
equality, and it is the reason the field exists at all rather than being summed in the browser.

# AMENDMENT A1.12 — the outbox, the recipients sheet, and two badge bugs

**Ruled by the user 2026-09-01, reviewing the rebuilt screen.** Four items: one scope correction, one
new surface, two real bugs.

## A1.12.1 The history is an OUTBOX — `GET /api/box/announcements` is mine-only

The user, seeing another staff member's send in their history: *"why i can see an announce that i
dont send by myself?"* The endpoint returned `findAllByOrderBySentAtDesc()` — every announcement in
the box.

**It now filters to `sentBy = TenantContext.userId()`, for coaches and admins alike.** The user was
offered an admin-sees-all variant and an admin toggle, and chose neither: the screen is *my outbox*,
in both shells. A coach may only announce to a class they coach (A1.10.1), so there is little for an
admin to oversee, and D-4's read counts stay per-send either way.

**Consequence, deliberate:** `V30`'s backfilled announcements and any seeded send carry a null
`sentBy`, so they belong to nobody's outbox and appear in no history. That is correct — a test pins
it so the next reader does not "fix" it.

## A1.12.2 New surface: the recipients sheet

D-4 gave the history a read *count*. The user wants the *names*: *"i wish i could open the detail and
see who viewed the announce"*.

**Shape (user-chosen, after being offered a full route and an inline accordion): a `bh-sheet`, the
same shape as the class picker** — *"sheet like the selector of the class, let's add the image and
some detail of the class also"*. So a CLASS_ROSTER announcement's sheet is headed by that class's
image and details, reusing the picker card's own treatment; EVERYONE and EXPIRING have no class and
are headed by the segment and the sent time.

**The recipient list is ONE list with a mark per row** (not two grouped sections), ordered **read
first, then unread, alphabetical within each** — the user's words: *"first read, then not read, all
alphabetical"*. A read row shows a tick and the time; an unread row shows a dash. **A search box**
sits above it: an EVERYONE send in a full box is hundreds of rows, and "did Marco see it?" should
not require scrolling.

**The list gets the class picker's fixed-height treatment.** A `bh-sheet` is height-capped, so a
long list must scroll inside its own fixed-height region with the header pinned above it — the same
fix A1.11 needed after paging days made cards slide under the user's finger.

**Authorization: only the sender may read it.** Not "any staff", which would reintroduce exactly
what A1.12.1 removed. A null `sentBy` matches nobody — the null-equality slip is called out because
it silently grants everyone access to authorless rows.

`GET /api/box/announcements/{id}/recipients` returns the announcement, an optional `ClassBrief`, and
the recipient rows in one call — the sheet is one request, and `AnnouncementRow` carries no
`segmentRef`, so the class could not otherwise be resolved client-side.

**Sweep fixture note:** `AuthzConformanceTest` seeded its announcement with **no sender**, so once
this rule existed the positive control would have taken a legitimate 403 and failed —
indistinguishable from a broken route. The seeded row is now sent by the owner-admin. That is a
fixture seed, the sanctioned category of edit to that file, and the orchestrator made it.

## A1.12.3 Bug: coaches and admins had NO unread indicator at all

`grep -n "messaging\|unread"` over `coach-shell.page.ts` and `admin-shell.page.ts` returned nothing.
The envelope, the count and the 60s poll were built only into `athlete-shell.page.ts` — D-6 was
implemented for one shell out of three. A coach received a message and nothing anywhere said so.

**Fixed by giving all three shells the same header envelope.** The user was offered a dock-tab badge
for the coach (Inbox is already one of their five tabs) and rejected it: *"only on the header! why he
have to has it in the dock? let mantain the identity."* The reasoning holds — a badge on the dock
tab and an envelope in the header would put the same count in two different places across shells,
and the count and its destination would disagree on screen. The envelope means one thing and lives
in one place. **The coach's Inbox dock tab keeps no badge.**

The shared envelope is extracted once rather than copied three times: the badge, the aria-label
branch, the poll and the pause-on-hidden are one implementation. It does **not** go in
`frontend/src/app/ui/` — a component there owes a dev-gallery section rendering seven states plus
visual baselines, which this does not need.

## A1.12.4 Bug: the badge did not clear when a conversation was read

*"when i receive a message and im an athlete and i open the message the notification badge on the
message dont go down, it will go down when i reload the page."*

`refreshUnread()` had exactly two callers, both in the athlete shell: once on init, once per 60s
interval. `ConversationsPage` called `markRead(membershipId)` on the server and nothing told the
shell to re-read the count, so the badge cleared on reload or after up to a minute.

**The refresh moves into `MessagingService.markRead` itself.** The service owns the `unread` signal,
and a caller that forgets to refresh it is precisely how this shipped. A client-side optimistic
decrement was rejected: it is a second, unverified copy of arithmetic the server already performs,
free to drift from the truth.

## A1.12.5 Visual baselines

Adding an envelope to the coach and admin headers **changes the rendered chrome of two shells** and
invalidates their recorded visual baselines. Expected, and regenerated in Task 11 — not a surprise
to debug.

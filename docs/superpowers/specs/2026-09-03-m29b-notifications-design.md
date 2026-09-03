# M29b — notifications design

**Status:** approved 2026-09-03. **Milestone:** M29b, Phase A position 8.
**Predecessor:** M29a messaging, closed at `5e9536b`.
**Consumes:** `docs/NOTIFICATIONS.md` (the registry), M29a's `announcement_recipient` and its read marker.
**Consumed by:** M27c (push transport), M32b (SMS, automation rules), M17 (which is placed after this
so it can use the feed).

---

## 1. Scope

Four things, one subsystem:

1. **An event model** — one `notification` table, one Java enum that is the single declaration of
   every event's icon, params, channels and defaults.
2. **The in-app feed** — a routed page in all three shells, day-grouped, with a bell and badge in
   the shell header beside the messages envelope.
3. **Fourteen declared events**, twelve of which write a feed row.
4. **Per-type, per-channel preferences** on their own page.

### Boundary

| Belongs to M29b | Does not |
|---|---|
| `notification`, `notification_pref`, the `NotificationType` enum | Push transport, FCM/APNs, permission prompts — **M27c** |
| The bell, the badge, the feed page, the preferences page | SMS, automation rules, campaigns — **M32b** |
| Emission at 13 sites, inside the causing transaction | Email. The 11 existing sends (registry §3) are untouched |
| The scheduler for `CLASS_STARTING_SOON` | Its delivery — the rows are written, nothing renders them until M27c |
| Reconciling `HomeController`'s 7-day banner with `EXPIRING_SOON_DAYS` | Any other change to home |

**Messages stay on the envelope.** `bh-messages-envelope` keeps its own badge, its own 60s poll and
its own read marker (`message_thread.member_last_read_at`). The feed does not show messages. This is
D-2 below and it is the milestone's single most important structural decision.

---

## 2. Decisions

Each was put as an explicit fork and chosen. Recorded so they are not re-argued.

| # | Decision | Rationale |
|---|---|---|
| **D-1** | **One `notification` table, one row per recipient**, `params` frozen at emit. | Registry §5.2: the audience is resolved once, never recomputed. 9 of the 14 events have exactly one recipient, so an event/recipient split would be two tables and a join to save nothing — and would still need D-3's special case. |
| **D-2** | **The feed excludes messages; the envelope keeps them.** A bell sits beside the envelope in the header. | `message_thread` already holds a read marker and the envelope already renders a badge. A message row in the feed would mean two badges counting one message and two read states disagreeing — the announcement bug, in a second place. One badge per thing. |
| **D-3** | **`NEW_ANNOUNCEMENT` rows delegate read state to `announcement_recipient.read_at`** and leave `notification.read_at` NULL forever. | The hard rule this milestone must not break. There is exactly one marker per announcement; the feed derives its flag from it and mark-read routes to it. Reading from the feed drops home's badge and vice versa, because they are the same column. |
| **D-4** | **A feed row is written INSIDE the causing transaction.** | Amends registry §5.1 — see §3. A feed row is persistence, like an audit row; a *send* is delivery. Written after commit it can be lost in the gap, and every emitter would need a signature change to carry the payload out (`BookingService.cancel()` would have to start returning who it promoted). |
| **D-5** | **`type` is a Java enum, not a DB check constraint.** | The enum carries the icon, the params shape, the channels and the three §5.3 properties in one greppable place. A check constraint would make adding an event a migration, when registry §7 defines it as a doc row plus code. The emit API takes the enum, so a typo'd type string cannot exist. |
| **D-6** | **Preferences are per type AND per channel** — `notification_pref(type, channel, enabled)` — with only `IN_APP` rows written in M29b. | The one Capacitor decision that is expensive later. "In-app yes, push no" is a thing people want the moment push exists; without the column M27c needs a migration *and* a preferences rebuild. One column now, and the page renders one toggle column until there are two. |
| **D-7** | **Preferences get their own routed page**, not a section on account. | A list fits in an account section; a type × channel grid does not, and that is what this becomes in M27c. A route also gives the feed somewhere to link to and gives M27c a home for the "notifications are blocked in iOS settings" state. Supersedes the account-section option considered on 2026-09-03. |
| **D-8** | **The preference is checked at emit, not at read.** | Enabling a type shows future events only. A read-time filter would mean rows written for people who had it off, and "who was told?" stops being answerable — the same reasoning as registry §5.2. |
| **D-9** | **The feed is a routed page**, `/{athlete,coach,admin}/notifications`, not a sheet from the bell. | A sheet has no URL, and M27c needs a deep-link target for a push tap. A fixed-height sheet is also a poor host for a list that pages. |
| **D-10** | **The bell shows the ACTIVE box only.** | `notification` is `@TenantId`; a member of two boxes has two memberships and two feeds. This matches the switcher and every other box-scoped surface. A cross-box aggregate is not built. **M27c obligation:** a push arrives with no active box, so tapping one must switch box before deep-linking. |
| **D-11** | **`CLASS_STARTING_SOON` is scheduled in M29b and rendered by nobody.** | The scheduler is the hard, reusable half and M27c would otherwise build it while also building push. It writes a real row (so dedupe works and the sweep is assertable) which the feed query excludes via `showsInFeed = false`. Precedent: the v1.0 doc's "Stripe ships and works, no money flows". Amends registry §5.5 — see §3. |
| **D-12** | **`EXPIRING_SOON_DAYS = 14` becomes the only answer**, and `HomeController`'s literal `7` is deleted. | Ships first, in its own commit, before any emitter. Banner, staff segment, members-table chip and `SUBSCRIPTION_EXPIRING` must answer one question or the badge and the banner contradict each other on screen. |
| **D-13** | **No booking-confirmation event.** | A notification for an action you just performed, on the screen that just confirmed it. Registry §5.3: the fastest way to feel worse than a WhatsApp group is to notify more than one. The need behind it — *will I remember to go?* — is `CLASS_STARTING_SOON`'s. |
| **D-14** | **`INVITE_ACCEPTED` and `NEW_MEMBER_JOINED` are mutually exclusive by construction.** | Discovered during design: both would fire at `InvitePublicController:72/80`, giving admins two rows for one event. `INVITE_ACCEPTED` fires on the invite route; `NEW_MEMBER_JOINED` fires only where a membership becomes ACTIVE by another route. Neither site fires both. **As built the exclusivity is total** — no such other route exists, so `NEW_MEMBER_JOINED` is emitted nowhere (§5.3). |

---

## 3. Amendments to binding documents

Both are edits to `docs/NOTIFICATIONS.md`, made in the same commit as the code that relies on them.

**§5.1 currently conflates persistence with delivery.** It says notifications follow the mail rule
and fire after commit. CLAUDE.md's actual dichotomy is *"mail fires strictly AFTER commit; an audit
row is written strictly INSIDE the transaction"*, and an in-app feed row is an audit row, not a mail.
Rewritten as:

> An **in-app notification row is persistence** and is written **inside** the transaction that caused
> it, exactly like an audit row: a rolled-back promotion must erase its own notification, and a row
> written after commit can be lost if the process dies in the gap. An **outbound send is delivery** —
> email, push (M27c), SMS (M32b) — and fires **strictly after commit**, because it cannot be
> retracted.

**§5.5 forbids an event with no reader.** `CLASS_STARTING_SOON` is deliberately such an event for one
milestone. Rewritten as:

> No event without a reader **in the milestone that delivers it**. An event may be recorded before its
> channel exists, provided the milestone that owns the channel is named and the rows are covered by
> retention (§8). A recorded event with no named delivery milestone is a table that grows forever.

**§4.1's `CLASS_STARTING_SOON` row says "off by default".** This spec ships it **on**, opt-out. The
registry's fear is unsolicited noise; this fires only for a class the athlete booked themselves, and a
reminder for a commitment you made is not unsolicited. Recorded here rather than silently diverging;
one line to reverse if a pilot box disagrees.

---

## 4. Data model

One migration, `V32__notifications.sql`. Two new tables, one new column.

```sql
create table notification (
  id            uuid primary key,
  box_id        uuid not null references boxes(id),        -- @TenantId
  membership_id uuid not null references memberships(id),
  type          text not null,
  params        jsonb not null default '{}'::jsonb,
  link          text,                                      -- an app ROUTE path, never a URL
  source_id     uuid,                                      -- announcement id for NEW_ANNOUNCEMENT
  dedupe_key    text,                                      -- see below; null for most types
  created_at    timestamptz not null,
  read_at       timestamptz                                -- always null for NEW_ANNOUNCEMENT (D-3)
);
create index notification_feed_idx on notification (box_id, membership_id, created_at desc);
create unique index notification_dedupe_idx
  on notification (box_id, membership_id, type, dedupe_key)
  where dedupe_key is not null;

create table notification_pref (
  id            uuid primary key,
  box_id        uuid not null references boxes(id),        -- @TenantId
  membership_id uuid not null references memberships(id),
  type          text not null,
  channel       text not null,                             -- 'IN_APP' only in M29b (D-6)
  enabled       boolean not null,
  unique (box_id, membership_id, type, channel)
);

alter table boxes add column class_reminder_minutes int not null default 60;
```

**`notification_pref` is sparse.** A row exists only where a member has overridden the type's
default. Absent means "the enum's default". This is what stops every new event from requiring a
backfill of every member × every type.

**`params` is frozen at emit and rendered client-side.** The row stores `{"className": "6:00 WOD",
"startAt": "..."}`, never a rendered sentence — so every string stays `$localize`-marked (i18n is
binding), and a class deleted next week still renders its notification correctly. The one exception is
`NEW_ANNOUNCEMENT`, whose `bodyPreview` is user-written text and therefore not translatable anyway.

**`dedupe_key` is used by two types.** `SUBSCRIPTION_EXPIRING` keys on
`subscriptionId + ':' + currentPeriodEnd`, so a nightly sweep cannot fire the same warning fourteen
times, and a renewal legitimately re-arms it. `CLASS_STARTING_SOON` keys on
`sessionId + ':' + membershipId`, so a scheduler restart or an overlapping sweep cannot double-fire.
The partial unique index is the guarantee; the check-then-insert in each job is the control flow, not
the safety net.

**`link` is an app route path**, e.g. `/athlete/class/<id>`. Never an absolute URL. This is what lets
M27c resolve a push tap through the same router, and it is why D-9 chose a route over a sheet.

---

## 5. The event catalogue

`NotificationType` is the single declaration. Each constant carries: icon, recipients rule, params
shape, `showsInFeed`, default state, and whether it is mandatory (no toggle), opt-out (on, switchable)
or opt-in (off, switchable).

### 5.1 Writes a feed row (12)

| Type | Icon | Emit site | Recipients | `params` | Default |
|---|---|---|---|---|---|
| `WAITLIST_PROMOTED` | `check` | `BookingService.cancel`, the promote block | the promoted athlete | `sessionId, className, startAt` | on, opt-out |
| `CLASS_CANCELLED` | `x` | `SessionController.patch`, status → CANCELLED | BOOKED **+ WAITLIST** (D-7 of M29a) | `sessionId, className, startAt` | on, opt-out |
| `CLASS_TIME_CHANGED` | `calendar` | `SessionController.patch`, `startAt` changed | BOOKED + WAITLIST | `sessionId, className, oldStartAt, newStartAt` | on, opt-out |
| `COACH_CHANGED` | `user` | `SessionController.patch`, `coachId` changed | BOOKED + WAITLIST | `sessionId, className, startAt, coachName` | on, opt-out |
| `LATE_CANCEL_UNREFUNDED` | `triangle-alert` | `BookingService.cancel`, when `late && !refundEntry` | the canceller | `sessionId, className, startAt` | on, opt-out |
| `NO_SHOW_RECORDED` | `circle-alert` | `BookingService.markNoShow` **and** `sweepNoShows` (§7) | the booking's member | `sessionId, className, startAt` | on, opt-out |
| `NEW_ANNOUNCEMENT` | `mail` | `AnnouncementService.send`, over the rows it just froze | the frozen recipients | `bodyPreview, sentByName` | on, opt-out |
| `SUBSCRIPTION_EXPIRING` | `credit-card` | `SubscriptionExpiringJob` (new, `runAsBox`) | the member | `planName, endsAt` | on, **mandatory** |
| `PAYMENT_FAILED` | `triangle-alert` | `StripeWebhookController`'s transaction — **not** `PaymentReceipts` | the member | `amountCents, currency` | on, **mandatory** |
| `MEMBERSHIP_BLOCKED` | `lock` | `MemberController`, status → SUSPENDED | the member | — | on, **mandatory** |
| `INVITE_ACCEPTED` | `user` | `InvitePublicController` accept path | box admins | `inviteeName` | on, opt-out |
| `NEW_MEMBER_JOINED` | `users` | ~~non-invite `MembershipEvent.JOINED`~~ — **no such site exists; not emitted, see §5.3** | box admins | `memberName` | on, opt-out |

**`PAYMENT_FAILED`'s site is a correction, not a preference.** `StripeWebhookController:180` opens
`runAsBox(boxId, () -> tx.execute(…))` and saves the payment at `:190`;
`receipts.sendPaymentFailed(…)` is called at `:196`, deliberately **outside** that block so the mail
fires after commit. The notification is the other half of D-4 and belongs at `:190`, inside. Emitting
next to the mail call would put the row outside the transaction that wrote the payment.

**`NEW_ANNOUNCEMENT` stores a body preview** (first 140 characters) plus `sentByName`, so the feed
renders without a second fetch. A null `sentByName` is legitimate — `V30`'s backfill and seed sends —
and renders as "Your gym", the same fallback the athlete announcements list already uses.

### 5.2 Declared, writes no feed row (2)

| Type | Why | Owner of its delivery |
|---|---|---|
| `NEW_MESSAGE` | The envelope already delivers it, with its own badge and its own read marker (D-2). Declared so M27c has something to route push against. Emits nothing, and gets no toggle on the preferences page in M29b — a toggle that switches nothing is worse than an absent one. | M27c |
| `CLASS_STARTING_SOON` | `ClassReminderScheduler` writes the row `box.class_reminder_minutes` before `startAt`; `showsInFeed = false` keeps it out of the feed, because an in-app "starts in 1 hour" read at 9pm is noise (D-11). Recipients: **BOOKED only**, never the waitlist. | M27c |

### 5.3 Considered and not built

- **`PR_CONGRATULATED`** — **deferred to M25 (social), 2026-09-03.** The registry's §4.4 says
  *"PostLike exists already"*, and the entity and repository do — but **nothing in the codebase ever
  creates one.** `grep -rn "postLikes.save\|new PostLike" backend/src/main/java` returns nothing;
  the only references are in `PerformanceQueries`' GDPR export. There is no endpoint to like a post,
  so the event has no trigger. M25 owns the feed, the composer and **likes**, and it is the
  milestone that can wire this in one line once a like can happen. Building a like endpoint here
  would break milestone lock to serve a notification nobody can yet cause.
- **`NEW_MEMBER_JOINED`** — **declared but emitted nowhere, 2026-09-03.** §5.1 gave its emit site as
  "non-invite `MembershipEvent.JOINED` writes only (D-14)". Verified against the source during Task 8:
  production code has exactly **two** membership-creation paths, `BoxSignupTx` and `InviteAcceptTx`
  (`grep -rn "new Membership()" backend/src/main/java` — everything else is `DevDataSeeder`). The
  invite path is `INVITE_ACCEPTED`'s. The only non-invite path is `BoxSignupService`, which creates a
  box **together with its owner** — so the sole ACTIVE box admin at that moment is the person who just
  signed up, and the row would tell them that they themselves joined. That is the "no notification for
  an action you just performed" rule (registry §5.3, D-13) applied to its own audience. **There is no
  route by which somebody joins an existing box other than an invite**, so the event has no trigger.
  The enum constant, icon, link and default all stay — the milestone that adds a non-invite join path
  (public self-signup to an existing box) emits it in one line. Same failure as `PR_CONGRATULATED`
  above: an emit site listed in the approved spec without being verified against the source.
- **`BOOKING_CONFIRMED`** — D-13.
- **Waitlist position changed** ("you are now #2") — the only position that matters already has an
  event, and the rest is noise.
- **`PROGRAMMING_PUBLISHED`, `CLASS_UNDER_BOOKED`, `LEADERBOARD_PLACED`, `COACH_UNASSIGNED_SESSION`** —
  the registry's "later" column, unchanged by this milestone.
- **Staff told when an athlete cancels** — close to `CLASS_UNDER_BOOKED`; goes to `docs/BACKLOG.md`.

---

## 6. Emission

One service, one method, called from inside the caller's existing transaction:

```java
notifications.emit(NotificationType type, UUID membershipId, Map<String,Object> params);
notifications.emitAll(NotificationType type, List<UUID> membershipIds, Map<String,Object> params);
```

`emit` resolves the preference (enum default, overridden by a `notification_pref` row), returns
silently when disabled, and otherwise inserts. `link` and `dedupe_key` are derived from the type and
params by the enum, not passed by callers — a caller that could pass its own link is a caller that can
ship a dead one, which the mail templates have done before.

**Tenancy.** `notification` is `@TenantId`. An emit on an authenticated request thread inherits the
caller's JWT tenant and needs nothing. An emit from a job — or from the **Stripe webhook, which carries
no JWT** — must sit under `TenantContext.runAsBox(boxId, …)` installed **before** the transaction
opens; setting the tenant on an already-open Hibernate session is a documented no-op. The webhook
already establishes such a block, so `PAYMENT_FAILED` emits inside the one that exists rather than
opening another. `runAsRoot` must never be on a thread that emits (§7).

---

## 7. The `runAsRoot` landmine

**`BookingMaintenance.java:24-35` runs the nightly no-show sweep under `TenantContext.runAsRoot(…)`,**
and its own comment states the precondition in advance: *"the sweep flips status on already-loaded
Booking rows and never INSERTs a `@TenantId` row."* Emitting `NO_SHOW_RECORDED` from inside
`sweepNoShows` breaks exactly that precondition — the inserts would take their `box_id` from the root
sentinel. A nested `runAsBox` inside the sweep does not fix it, for the no-op reason in §6.

**Fix:** restructure `BookingMaintenance` to iterate boxes under `runAsBox`, the pattern
`SubscriptionLapseJob.sweepAll` and `SessionGenerator.generateAll` already document, and drop
`runAsRoot`. `sweepNoShows` then runs per box under a real tenant and may insert.

**This is tenancy work and the orchestrator implements it,** not an executor (CLAUDE.md: delicate work
where a wrong diff is expensive). The gate
`grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'` must stay empty, and after
this change `BookingMaintenance` must not contain `runAsRoot` at all.

Two new jobs follow the same per-box shape from the start:

- **`SubscriptionExpiringJob`** — nightly, per box under `runAsBox`, emits `SUBSCRIPTION_EXPIRING` for
  subscriptions inside `EXPIRING_SOON_DAYS` of `current_period_end`, deduped on the period.
- **`ClassReminderScheduler`** — every minute, per box under `runAsBox`, selects sessions whose
  `startAt` falls in `[now + lead, now + lead + 1min)` where `lead = box.class_reminder_minutes`, and
  emits `CLASS_STARTING_SOON` to BOOKED members, deduped on session + membership.

---

## 8. Retention

`PurgeJob` gains one rule: delete `notification` rows older than **90 days**, read or not. A
90-day-old notification is not actionable, and registry §5.5's real concern is a table that grows
forever. This is what makes `CLASS_STARTING_SOON`'s invisible rows acceptable under the amended §5.5.

---

## 9. API

Six endpoints across five paths, all member-level: any ACTIVE membership of the caller's box. All are
box-scoped, so each gets happy + auth-denied + cross-tenant-denied tests.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/box/notifications` | a page of 30, newest first, `showsInFeed` types only, `cursor` for the next page |
| `GET` | `/api/box/notifications/unread-count` | `{ count }` |
| `POST` | `/api/box/notifications/{id}/read` | marks one read — **routes to `announcement_recipient` for `NEW_ANNOUNCEMENT`** (D-3) |
| `POST` | `/api/box/notifications/read-all` | marks the caller's feed read, both tables |
| `GET`/`PUT` | `/api/box/me/notification-prefs` | effective per-type, per-channel state; PUT takes `[{type, channel, enabled}]` |

**The list endpoint's read flags.** Fetch the page, collect the `source_id`s of its
`NEW_ANNOUNCEMENT` rows, and batch-load `announcement_recipient` in **one** query — the pattern
`MyAnnouncementsController.mine()` already uses, written there against an N+1 that had never run
(M29a trap #10). Never one lookup per row.

**The unread count is a sum of two counts,** not a join:
`count(notification where showsInFeed and type <> NEW_ANNOUNCEMENT and read_at is null)` plus the
count of unread `announcement_recipient` rows — which is the number `HomeController` already computes
for its card badge. One marker, two readers, no HQL gymnastics.

**Authz.** All six register in `AuthzConformanceTest`'s `MIN_ROLE`, and the one path-variable route
(`/{id}/read`) seeds a real notification id in `pathIds`. **The orchestrator makes that edit** (M29a
trap #8). No route here takes a required `@RequestParam`, so none can 400 before `RoleGuard` runs.

---

## 10. Frontend

| File | What |
|---|---|
| `ui/icon.component.ts` | **one** new icon, `bell`. The other twelve types map onto names already in `ICON_NAMES`. Adding an icon obliges a visual-baseline regeneration (M29a trap #12). |
| `features/notifications/notification.service.ts` | `unread` signal, list/paging, `markRead`, `markAllRead`, prefs |
| `features/notifications/notification-copy.ts` | the type → (icon, title, body) map. **Every string `$localize`d**, and a placeholder name must follow its expression immediately (`${n}:count:`) or it ships as literal text past both Karma and the build |
| `features/notifications/notification-bell.component.ts` | a near-copy of `bh-messages-envelope`: 60s poll, pause on hidden, `--bone` on `--surface-2` badge, `99+` cap, three aria strings |
| `features/notifications/notifications.page.ts` | the day-grouped feed |
| `features/notifications/notification-prefs.page.ts` | the type × channel grid |
| the three shell pages | project `<bh-notification-bell actions …>` beside the envelope |
| `app.routes.ts` | `notifications` and `notifications/settings` under all three shells |
| `features/dev/dev-gallery.page.ts` | a `bh-notification-bell` section rendering all seven states |

**The bell is never volt.** The box switcher's mark is the shell's one volt element, so the badge is
`--bone` on `--surface-2` with a hairline — identical to the envelope's, which was ruled the same way.
The header becomes switcher · envelope · bell · you; at 360px that is three 44px targets after the
brand, which the responsive pass must confirm.

**The feed page.** Day headers (Today / Yesterday / date), per-type icon, unread rows carrying a bone
dot and a heavier title, timestamp in mono (it is measured), "Mark all read" in the sticky header.
Announcement rows open a detail sheet on the page reusing home's detail shape — a repeat of an agreed
shape. Every other row navigates to `link` and marks itself read. Loading, error, empty and end-of-list
states all required by design law v2.

**The preferences page.** One row per type that has an in-app row, grouped by the registry's four
categories. Mandatory types render locked with the reason stated, never as a disabled control with no
explanation. One toggle column in M29b; the grid grows a column in M27c without a rebuild (D-6).

**Forms.** The preferences page has no `<form>` — it is a list of `bh-switch` controls that save on
change with pending + inline error and the previous value preserved. If a form is introduced, it binds
the **native** `(submit)` with `novalidate`; `(ngSubmit)` dies with `FormsModule` (M13d, binding).

---

## 11. The 7-vs-14 reconciliation

Ships **first, in its own commit**, before any emitter.

`HomeController.java:110`'s `planDaysLeft <= 7` becomes `planDaysLeft <= EXPIRING_SOON_DAYS`, imported
from `SegmentResolver` — the same constant `MemberController` already imports. After this the athlete
banner, the staff "expiring" announcement segment, the members-table chip and `SUBSCRIPTION_EXPIRING`
all answer one question.

**Dependents to fix, not just the line itself** (`docs/PREFLIGHT.md`'s most-repeated failure): every
backend test asserting the 7-day boundary, `home.page.spec.ts`, and any e2e fixture that books a
membership expiring between 8 and 14 days out and expects no banner. Grep before editing.

---

## 12. Tests and gates

Beyond the standing gates (backend suite, Karma, production build with zero warnings, the four tenancy
greps, the `ui/` §8.1 greps, axe, visual baselines, i18n marking):

- **The delegation test, both directions.** Read an announcement from the feed → `HomeController`'s
  `announcementUnread` drops. Read it from home → the feed row reports read. This is the test that
  proves there is one marker, and it is the milestone's single most important assertion.
- **A rollback test.** A transaction that fails after emitting leaves **no** notification row. Proves
  D-4 rather than asserting it.
- **A dedupe test per keyed type.** Run `SubscriptionExpiringJob` twice and `ClassReminderScheduler`
  twice: one row each time, not two.
- **A preference test.** A disabled type writes no row; re-enabling does not backfill (D-8).
- **A tenancy test for the restructured no-show sweep.** Two boxes, both with no-shows: each member
  gets exactly one notification, carrying **their own** `box_id`. This is what §7 is for.
- **Cross-tenant-denied on all six endpoints**, plus auth-denied and happy.
- **`AuthzConformanceTest`** registrations, orchestrator-authored. No assertion weakened, no allowlist,
  no probe removed.
- **e2e `notifications.spec.ts`** — a screen is not verified until e2e runs on it, because Karma cannot
  see a dead binding. Rebuild the frontend image first and **verify the testid is in the served
  bundle**, not just the source.
- **Two impeccable cycles**, one per new screen: shape → build → user sign-off on the render →
  `audit` ≥16/20 → `critique` ≥32/40 → fix every P0/P1 → re-run both. `harden` applies to the feed
  (it renders real, user-supplied data — a long class name and a long gym name). `interaction-design`
  applies to `bh-notification-bell` as a new component.

---

## 13. Risks

| Risk | Handling |
|---|---|
| `runAsRoot` in the no-show sweep silently writes sentinel `box_id`s | §7. Orchestrator-implemented, with a two-box tenancy test that would fail if it regressed. |
| A third badge crowds the header at 360px | Responsive pass at 360 on all three shells before the audit. Chrome will not size below ~500px — 320 is Playwright's job (M29a environment note). |
| The per-minute reminder sweep is a new recurring cost across every box | It selects on an indexed one-minute `startAt` window per box, not a full scan. Measured before merge. |
| 14 events is a large surface for one milestone | Planned in phases (§14) so review lands in reviewable batches, not as one diff. |
| `params` shapes drift from what `notification-copy.ts` renders | The enum declares the shape and a Karma spec asserts every `NotificationType` has a copy entry — an unrendered type is a blank row otherwise. |

---

## 14. Phasing

Not a schedule; an ordering so each phase is reviewable and the risky work is not buried.

1. **P0** — the 7→14 reconciliation and its dependents. Own commit.
2. **P1** — `V32`, entities, `NotificationType`, `NotificationService`, preference resolution, tests.
3. **P2** — the eleven emitters that run on a request thread, plus the manual half of
   `NO_SHOW_RECORDED` (`markNoShow`). `PAYMENT_FAILED` emits inside the Stripe webhook's **existing**
   `runAsBox` block, not on an ambient-tenant thread — the webhook carries no JWT.
4. **P3** — jobs: the `BookingMaintenance` restructure (orchestrator), `SubscriptionExpiringJob`,
   `ClassReminderScheduler`, `PurgeJob` retention.
5. **P4** — the five routes plus `AuthzConformanceTest` registration (orchestrator).
6. **P5** — `bell` icon, `bh-notification-bell`, dev-gallery section, the three shells.
7. **P6** — the feed page, its impeccable cycle.
8. **P7** — the preferences page, its impeccable cycle.
9. **P8** — e2e, visual baselines, the full gate sweep, registry amendments (§3) committed with the
   code that relies on them.

# Notifications — the registry

**Status:** opened 2026-08-31, during M29a. **This document builds nothing.** It is the inventory
that M29b, M27c and M32b each need and would otherwise each rediscover on their own.

Read it before designing the in-app feed, before adding a push payload, and **before writing any
code that fires a notification** — the rules in §5 are binding on new events.

---

## 1. Why this file exists

Notification work is split across four milestones, in this order:

| Milestone | Owns |
|---|---|
| **M29a** (now) | Thread state and the unread count on the Messages surface itself. **Emits nothing.** |
| **M29b** (next) | `NotificationEvent`, the global in-app feed, the shell badge, per-type preferences |
| **M27c** | Push delivery through the Capacitor mobile wrapper |
| **M32b** | SMS channel, automation rules, campaign builder |

Each of those would otherwise start by asking "so what do we actually notify people about?" and
answer it slightly differently. **This is that answer, written once.** It is also the reason a
notification gap is visible as a gap: `BookingService.java:137` promotes a waitlisted athlete into
a class and tells them nothing, and nothing in the codebase records that as missing.

**Not in scope for this file:** transport mechanics, payload shapes, the preference UI, or retry
semantics. Those belong to the milestone that owns the channel.

---

## 2. Channels

| Channel | Status | Owner | Notes |
|---|---|---|---|
| **Email** | **Shipping today** — 11 sends, listed in §3 | already built | `Mailer.send(to, subject, template, vars)` with Thymeleaf templates under `resources/templates/mail`. The one sanctioned place raw hex is allowed, because HTML mail cannot read custom properties. |
| **In-app feed** | not built | **M29b** | The bell and the feed page. This is the default channel for anything gym-operational. |
| **Push** | not built | **M27c** | Arrives with the Capacitor wrapper, not before. Until it does, **a time-sensitive message is seen when the athlete next opens rxed** — recorded in M29a spec A1.8 #1 so the gap is a known deferral, not an oversight. |
| **SMS** | not built | **M32b** | Expensive per message. Reserve for the genuinely urgent; see §5.3. |

A single event may fan out to several channels. The event is the thing this registry names; the
channel is a per-event, per-preference decision.

---

## 3. What already notifies today (email only)

Verified against `main` on 2026-08-31 by enumerating every `mailer.send(` call site.

| # | Event | Trigger | Recipient |
|---|---|---|---|
| 1 | Verify your email | `AuthService:128` — registration | the new user |
| 2 | Someone tried to sign up with your email | `AuthService:122` — duplicate registration | the existing account owner |
| 3 | Reset your password | `AuthService:170` | the user |
| 4 | Your password was changed | `AccountController:68` | the user |
| 5 | Confirm your new email address | `AccountService:93` | the **new** address |
| 6 | You have been invited to a box | `InviteAdminController:76` | the invitee |
| 7 | Your box is live | `SuperadminBoxController:68` | the box owner |
| 8 | About your application (rejected) | `SuperadminBoxController:76` | the box owner |
| 9 | Payment receipt | `PaymentReceipts:53` | the paying member |
| 10 | Payment did not go through | `PaymentReceipts:69` | the paying member |
| 11 | Your membership has lapsed | `SubscriptionLapseJob:99` | the lapsed member |

**Observation worth acting on in M29b:** every one of these is either an *account/identity* event
or a *money* event. **Not one of them is about training** — nothing tells an athlete their class was
cancelled, that they got off the waitlist, or that a coach replied. That is the whole hole M29b
fills, and it is why the in-app feed is the right default channel rather than more email.

---

## 4. The registry — events that should exist

Ordered by how much a person loses by missing it. **Nothing here is built.** Column *Owner* is the
milestone that should build it, not a promise that it is scheduled.

### 4.1 Time-critical — someone changes their day because of this

| Event | Fires when | Recipients | Channels | Owner | Notes |
|---|---|---|---|---|---|
| `CLASS_CANCELLED` | a `ClassSession` moves to `CANCELLED` | the roster, **waitlist included** | feed + push + email | M29b | D-7 already rules waitlist in for the announcement equivalent. Today a coach must send a CLASS_ROSTER announcement by hand — see §6. |
| `WAITLIST_PROMOTED` | `BookingService:137` promotes the head of the waitlist into a freed spot | the promoted athlete | feed + push | M29b | **The sharpest gap in the product today.** The athlete now has a spot in a class they may not attend because nobody told them. Silent as of 2026-08-31. |
| `CLASS_STARTING_SOON` | scheduled, N minutes before `startAt` | booked athletes | push | M27c | Needs a scheduler and a per-box lead time. Opt-out, and off by default — this is the single most likely event to make people mute rxed entirely. |
| `CLASS_TIME_CHANGED` | `startAt` is patched on a session with bookings | the roster | feed + push + email | M29b | `SessionController` patches `startAt` today with no notice at all. |

### 4.2 Conversational — someone is waiting on a reply

| Event | Fires when | Recipients | Channels | Owner | Notes |
|---|---|---|---|---|---|
| `NEW_MESSAGE` | a `Message` is inserted | the other participant | feed + push | M29b | Named explicitly in the M29a spec §1 boundary table as M29b's. M29a deliberately emits nothing. |
| `NEW_ANNOUNCEMENT` | an `Announcement` is sent | its frozen `announcement_recipient` rows | feed + push | **M29b — user-confirmed 2026-09-01** | See §4.2.1. The audience already exists as rows (D-2), so the fan-out is a read, not a resolution. |

#### 4.2.1 `NEW_ANNOUNCEMENT` — what M29a already built for it

**The user asked for this explicitly on 2026-09-01**, so it is a commitment, not a candidate. M29a
left it ready to be wired and nothing else:

- **The audience is already frozen as rows.** `announcement_recipient` holds one row per matched
  member from the moment of sending (D-2), so the feed fan-out is a `SELECT`, not a re-resolution.
  Nothing about segments needs re-deciding in M29b.
- **Per-person read state already exists.** `announcement_recipient.read_at` is written when an
  athlete opens their announcements list, and the sender sees it in the recipients sheet
  (A1.12.2). M29b's feed must **share this marker, not invent a second one** — two read states for
  one announcement would disagree the first time someone reads it from the feed instead of the card.
- **The sender is known.** `sentByName` is on both athlete-facing DTOs as of 2026-09-01, so the
  notification can say *who* announced, not just "your gym". **A null sender is legitimate**
  (`V30`'s backfill, seed sends) and renders as "Your gym" — the feed needs the same fallback.
- **There is no event and no emitter.** M29a emits nothing, deliberately (§1 boundary table). The
  `Announcement` insert is where `NEW_ANNOUNCEMENT` will be raised, **after commit** (§5.1) — an
  announcement notification for a send that rolled back is the exact lie that rule exists to stop.

**The gap this leaves until M29b ships:** an athlete learns about an announcement only by opening
rxed and looking at home. A cancelled 6am reaches nobody who does not open the app — which is why
`CLASS_CANCELLED` (§4.1) is served manually by a coach's roster announcement for now, and why that
manual path should be re-examined, not kept by default, once this event exists.

### 4.3 Money and membership — acted on within days, not minutes

| Event | Fires when | Recipients | Channels | Owner | Notes |
|---|---|---|---|---|---|
| `SUBSCRIPTION_EXPIRING` | inside `EXPIRING_SOON_DAYS` (14) of `current_period_end` | the member | feed + email | M29b | Today the member learns **only after it lapses** (#11 above). Warning beats condolence. Note the live inconsistency the M29a spec §5 records: staff-facing "expiring" is 14 days, `HomeController`'s athlete banner is 7. Pick one **before** this event ships, or the badge and the banner will disagree on screen. |
| `PAYMENT_FAILED` | already emails (#10) | the member | **+ feed** | M29b | Email exists; the feed entry is what makes it visible to someone who does not read email. |
| `MEMBERSHIP_BLOCKED` | a membership moves to a blocked state | the member | feed + email | M29b | Being unable to book with no explanation is the worst version of this. |
| `INVITE_ACCEPTED` | an invite is redeemed | box admins | feed | M29b | Staff-facing. Low urgency, high satisfaction. |

### 4.4 Social and performance — never urgent, easy to over-send

| Event | Fires when | Recipients | Channels | Owner | Notes |
|---|---|---|---|---|---|
| `PR_CONGRATULATED` | someone likes or comments on your PR post | the athlete | feed | M29b | `PostLike` exists already. |
| `LEADERBOARD_PLACED` | you land top-3 on a WOD | the athlete | feed | later | Genuinely optional. Ship only if it does not add noise. |
| `PROGRAMMING_PUBLISHED` | a session's `programming_status` → `PUBLISHED` | athletes booked on it | feed | later | **Off by default.** A box that publishes a week at a time would fire this a dozen times in a minute. |

### 4.5 Staff-facing operations

| Event | Fires when | Recipients | Channels | Owner | Notes |
|---|---|---|---|---|---|
| `CLASS_UNDER_BOOKED` | N hours before start, below a threshold | the assigned coach | feed | later | The "should I cancel this?" prompt. |
| `NEW_MEMBER_JOINED` | a membership becomes ACTIVE | box admins | feed | M29b | |
| `COACH_UNASSIGNED_SESSION` | an upcoming session still has `coach_id = null` | box admins | feed | later | Already a real state — M29a had to rule on it: an unassigned session is admin-only for announcements. |

---

## 5. Rules — binding on any new notification

### 5.1 It fires strictly AFTER commit

CLAUDE.md, binding: **mail fires strictly after commit; an audit row is written strictly inside the
transaction.** Notifications follow the mail half. A notification sent inside a transaction that
then rolls back is a lie told to a real person — "you got a spot" for a promotion that never
happened. The same reasoning gives every channel the same rule.

### 5.2 The audience is frozen, not recomputed

Announcements already establish this (M29a D-2): resolve the recipients **once, at send**, and store
them. A feed entry resolved at read time silently disappears for someone whose state changed after
the fact — and "who was told?" stops being answerable. Any new fan-out event inherits this.

### 5.3 Every event declares its channel and its default

Three properties, decided when the event is added here, not when someone is debugging noise:

- **channels** it may use;
- **default on or off** — anything that can fire more than a few times a week starts **off**;
- **opt-out or mandatory** — money and account-security events are mandatory; training events are
  opt-out; social events are opt-in.

The single fastest way to make rxed feel worse than a WhatsApp group is to notify more than a
WhatsApp group would. Being CrossFit-only means the alternative is a *very good* group chat
(`docs/POSITIONING.md`), and it is free.

### 5.4 Tenancy applies unchanged

A notification is box-scoped data. `@TenantId` on the entity, resolved from the JWT via
`TenantContext`, never from a request param — and since M21 a tenant-less read **fails closed**. A
platform-wide sweep (a scheduled reminder job, say) runs under `TenantContext.runAsRoot(...)` or
per-box `runAsBox`, never on a thread serving a user request. Full rule: `docs/TENANCY.md`.

### 5.5 No event without a reader

An event nobody is shown is a table that grows forever. Add the feed row and the event in the same
milestone, or do not add the event.

---

## 6. What M29a leaves behind on purpose

- **The bell and the notifications page are M29b**, execution position 8 — the milestone immediately
  after M29a, and placed before M17 so M17 consumes it. Confirmed against
  `docs/ROADMAP-AT-A-GLANCE.md` on 2026-09-01, when the user asked. M29b is **in-app only** by
  design; a notification reaching a phone that is not open is **M27c** (position 30), which routes
  every type — announcements named explicitly — through FCM and APNs.
- **M29a emits nothing.** No `NotificationEvent`, no badge, no bell. The spec's §1 boundary table is
  explicit, and building a bell now would mean a feed with no event model behind it — one that M29b
  would then delete and rebuild. The unread count on the Messages surface is M29a's; the **global**
  badge is M29b's.
- **`CLASS_CANCELLED` is served manually for now.** A coach cancelling their 6am sends a
  CLASS_ROSTER announcement by hand — that is exactly the case D-8 was written for, and why a coach
  may announce at all. When `CLASS_CANCELLED` ships, revisit whether the manual path stays.

---

## 7. Adding an event

1. Add a row to §4 with its trigger call site, recipients, channels, owning milestone.
2. Decide its three §5.3 properties in the same edit. An event without a default is an event that
   will be turned on for everybody by accident.
3. Only then write code — and fire it **after commit** (§5.1) against a **frozen** audience (§5.2).

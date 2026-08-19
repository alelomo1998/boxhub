# M22 — new-domain schema

Date: 2026-08-19. Status: accepted, not yet implemented. Branch: `m22-new-domain-schema` (to be cut).

Closes **Phase 1**. Follows M21 (identity & tenancy for multi-box), which is merged to `main`.

## 1. What this milestone is

The tables everything in Phase 2 needs, cut **before** any screen exists to bias them: a box's public
profile, rooms, coach profiles and availability, the drop-in, social posts and ratings, and payout
accounts.

**Phase 1's rule holds: schema, domain model and tenancy. No endpoints, no DTOs, no screens.**
Migrations are one-way and expensive to get wrong; endpoints and DTOs are cheap to change and are
exactly what suffers from being designed screen-blind.

**Phase 1 also requires every milestone to state what it deliberately does NOT model.** §10 is that
statement, and it is not a formality — three of its entries are places where modelling an *open*
product question would have been the more natural mistake.

### One scope addition, made at spec time

Rooms/floors were **not** in M22's original scope. They were added during this design at the user's
request. That is not a milestone-lock violation: the lock forbids *building* out-of-scope things
mid-milestone, and scope is set at spec time. The reasoning is in decision 11.

## 2. Decisions

Thirteen, each settled during design. They are recorded with their reasoning because the reasoning is
what makes them reviewable later.

### 2.1 Money

**D1 — The payee splits by product. A drop-in is paid to the BOX; PT is paid to the COACH.**
A drop-in is a box product: a visitor pays to attend a box's class. PT is the coach's own service.
The v3 roadmap already called a drop-in "a box product" (decision 3 there); this confirms it and
overturns the same document's assumption that PT money also flows through the box.

**D2 — The PT payee is a PER-COACH choice, and coach-direct is the default.**
Each coach chooses: take the money themselves, or let the box collect and settle up. M26 already
anticipated exactly this — *"Connect onboarding for a coach who chooses to be paid directly, with the
box-collects path as the alternative."* Consequence: the payee is a **reference**, not an assumption
baked into the payment path.

**D3 — Every payment settles online or in person.** Stripe, or cash/card at the desk. This needs no
new mechanism: the shipped `payment.method` check is already
`STRIPE|CASH|TRANSFER|CARD|OTHER` with `status` in `SUCCEEDED|PENDING`, and `recorded_by` already
records which membership took an in-person payment.

**D4 — No credits. Payment attaches to the booking. There is no prepaid balance.**
This reverses the design's first proposal, and the user's objection was correct. A credit would make
rxed the **authoritative record of a prepaid liability** — the box owes this person a class. rxed has
never been in the money flow (the box's own restricted Stripe key takes the payment; cash goes in the
box's till), and a credit balance would be the first time it held the record of money owed. That
drags in expiry rules, refund rules and EU prepaid-voucher accounting.

The argument *for* credits was also partly wrong and is corrected here: "paid but didn't come" is
**already modelled** — bookings carry `NO_SHOW`, and M14a made cancellation a recorded status with
`cancelled_at` and `was_late`. The only remaining benefit was selling multi-packs, which is
speculative and in no milestone's scope.

How the real cases land:

| Case | Model |
|---|---|
| Pay online in advance | Booking created, payment `SUCCEEDED`, booking confirmed |
| Pay cash at the desk | Booking created `PENDING`, payment recorded `SUCCEEDED` on arrival |
| Non-member books PT | Pays for the session directly — no entitlement needed to point at |
| Paid and didn't show | Booking goes `NO_SHOW`, payment stands. Already how the model works |

Reversal cost is low and additive: if multi-packs become table stakes, an entitlement table is added
then, with a real screen driving it, and existing per-booking drop-ins stay valid. Credits-now is the
expensive direction.

**D13 — A paying visitor may NOT join the waitlist.** Drop-ins book open spots only. Same principle
as D4: it never makes rxed the record of money owed back. No refund machinery, no "paid but never
promoted" state, and for the cash case no automatic refund exists anyway. A visitor who finds a class
full picks another time.

### 2.2 Visibility and consent

**D6 — Box listing is opt-in.** A `published` flag, off by default; only an `ACTIVE` box may publish.
This reuses M9's existing `PENDING/ACTIVE/SUSPENDED` lifecycle as the precondition rather than
inventing a second one — which the v3 roadmap explicitly asked M22 to check. A half-filled listing
makes the whole directory look dead, and publishing a business's page should be its own act.

**D7 — A coach's public visibility is per-coach opt-in.** The coach owns and publishes their own
profile; a box's public page renders whoever opted in.

This is the milestone's answer to a constraint the v3 roadmap flagged and refused to let M22 skip:
*"Staff names and photos are personal data belonging to people who are not the account holder."* The
coach is already an rxed account holder, so consent is collectible in-app, and — the load-bearing
part — **deletion becomes a single-row removal**. `DELETE /api/me` drops the coach's own profile row
and the name and photo leave every public page. Had the box owned that record, deletion would be a
cross-entity cascade with an orphaned name on a public page as its failure mode.

### 2.3 Location and media

**D8 — Plain `lat`/`lng` columns. No PostGIS.**
The database image is `postgres:16-alpine`. PostGIS means a different image, which changes the VPS
deployment and the backup/restore drill — real, one-way cost for a directory of hundreds of boxes,
where an indexed bounding-box prefilter plus a haversine sort is ample. The columns stay valid if the
extension is ever added.

Address is structured: `street`, `city`, `region`, `postcode`, `country`. **`country` arrives here**,
moved out of M14a by the v3 roadmap, and is what M18's geographic analytics needs.

**How `lat`/`lng` get filled is deferred to M24.** Geocoding a typed address needs an external API and
a key — a secret that, per the house rule, must fail startup when missing and is subject to
`SecretDefaultsTest`. A map pin needs none of that. Either way it is *behaviour at an endpoint*, and
Phase 1 ships no endpoints. The columns are nullable; M24 picks the mechanism.

**D9 — Two classes of media, separated by path, not by a database flag.**
The v3 roadmap flagged the contradiction and required it be resolved here: *"M11 made media reads
signed and short-lived. A public box page contradicts that."* A public page breaks the signed model
three ways — a shared link's photos die after 10 minutes, social-preview crawlers get nothing, and
nothing is CDN-cacheable.

The resolution is smaller than expected, because **there is no media table**. Media is files on a
volume with unguessable UUID names, paths stored as plain columns (`boxes.logo_url`), and nginx's
`location /media/` enforcing `secure_link` + `expires 10m` + `Cache-Control: private`. So:

- `/media/` is untouched, byte for byte. M11's guarantee stays exactly where it was aimed.
- `/media/pub/` gets its own nginx location with **no** `secure_link` and a public cache header.
  nginx's longest-prefix match makes the more specific block win. Filenames stay unguessable UUIDs.

`MediaSigner`, `MediaStorage`'s EXIF-strip round-trip, the 5 MB cap and the JPEG/PNG allowlist are all
unchanged.

**Amended 2026-08-19, during planning: the mechanism is decided here, but BUILT in M24.** Writing the
plan surfaced that this decision has no schema in it — it is one nginx location and one storage
subdirectory — and that nothing writes to `/media/pub/` and no test exercises it until M24 gives the
upload endpoint a public option. Shipping an nginx block with no writer and no test is the
speculative work Phase 1's own rule forbids, so M22 records the resolution and M24 implements it.
The contradiction is *resolved* here, as the v3 roadmap required; it is not *coded* here.

### 2.4 Scheduling

**D11 — Rooms/floors are modelled here; the calendar that uses them is M14b's.**
There is today **no "where" axis at all**: `class_type` (what) → `schedule_slot` (when) →
`class_sessions` (the instance) → `bookings`. Capacity lives on the slot and the session. No room, no
floor, anywhere.

The split:

- **Schema is M22.** A `room` table plus a nullable `room_id` on `schedule_slot` and `class_sessions`.
- **The admin calendar with when/where/what filters is M14b**, which already owns "the classes page
  and week calendar". Phase 1 ships no screens.

The reason schema comes now is a **cost asymmetry, not tidiness**. `class_sessions` is the hottest
table in the product — `bookings` has an FK to it. Adding `room_id` now is a nullable column while
those surfaces are still being built; adding it in Phase 4 is a migration against live booking data.
Phase 1 exists precisely to avoid that.

**`room.capacity` is deliberately excluded.** `room_id` on `class_sessions` is the expensive-to-defer
piece; a nullable int on a brand-new, small `room` table is trivial to add whenever a milestone gives
it behaviour. Shipping two capacities with nothing deciding which one wins, and no screen to resolve
it, is a question every later surface would answer differently.

**Rooms are optional.** A single-space box never sets a `room_id` and nothing about it changes.

**D5 — A PT session does not consume class capacity, but it IS located in a room.**
Two different things, and the distinction is the whole point. PT does not take a seat in a class and
does not enter the capacity count — `coach_availability` is keyed on the user rather than joined to
`schedule_slot`, matching M26's *"the availability calendar the coach manages"*.

But a PT session **is** something happening on the floor at a time, so it carries a `room_id` and the
admin calendar can show it. Without that, the calendar answers "what is happening in the structure"
with a hole in it. So `pt_booking` gets a nullable `room_id`, exactly like `class_sessions`.

This means the data can express a class and a PT session in the same room at the same time.
**Detecting that collision is deliberately not built here** — it is behaviour, and M14b owns the
calendar. M22's job is to make the collision *representable and therefore detectable later*, which it
would not be if PT had no room at all. A box-controlled "PT-allowed window" is likewise additive; §10
records both.

**D14 — Assume a coach works at ONE box for now, but cut the schema multi-box-ready.**
The user's call, and it removes this milestone's sharpest risk. The schema already satisfies it
without change: `coach_profile`, `coach_availability`, `coach_time_off` and `coach_stripe` are keyed
on the **user**, so a coach who later holds three boxes has one profile, one calendar and one Stripe
account. **Enabling multi-box coaching therefore needs no migration** — it needs the cross-box
availability read described in §3.2, and nothing else.

No constraint is added to *enforce* single-box coaching. Enforcing it would mean a partial unique
index on `memberships` where `role = 'COACH'`, which could fail against existing rows and would have
to be dropped again the moment multi-box is wanted — a one-way migration spent on a temporary
assumption. The assumption is recorded here instead, with its trigger named in §13.

**D12 — The waitlist already exists. Do not rebuild it.**
`bookings.status` carries `WAITLIST` with a `position` column. `BookingService` (~L93–104) promotes
`waitlist.get(0)` to `BOOKED` on cancel, clears its position and shifts the rest up, under the
`SELECT … FOR UPDATE` lock. Covered by `BookingConcurrencyTest`, `BookingEngineTest` and
`BookingCancellationTest`.

**The real gap is notification** — *"you get a spot and are never told"* — and **M17 owns it**,
because M17 decides the notification strategy for the whole product. Modelling an outbox here would
be modelling an open question, which is the exact reason the v3 roadmap excluded comment threading
from this milestone.

### 2.5 The payment spine

**D10 — Disjoint nullable FKs with a CHECK that exactly one is set.**
`payment.subscription_id` is `NOT NULL` with an FK to `subscription`: today **every** payment must
belong to a subscription, and a drop-in and a PT session are neither. That constraint is the central
schema problem of this milestone.

Chosen: make `subscription_id` nullable, add a real FK per product, and let a CHECK enforce that
exactly one is set. Every existing row stays valid untouched, and the database keeps enforcing
integrity — which a polymorphic `(type, id)` pair cannot. A fourth product later is one column plus a
CHECK edit.

Rejected, with reasons:

| Alternative | Why not |
|---|---|
| An `order`/`payable` parent row every sale creates | The textbook answer, and correct past ~4 product types. Costs an indirection layer now **and a backfill of every existing payment** — a bigger, riskier one-way migration for a benefit that does not yet exist |
| A separate payment table per product | Turns "all money for this box" into a three-way UNION, and forces the Stripe webhook's lookup by `stripe_session_id` to search three tables instead of one |

## 3. Tenancy classification

This is the section M21 was built to make answerable, and it produces one hard rule.

> **The directory query decides.** A public directory lists **many** boxes at once. Under M21 a
> `@TenantId` table cannot serve that: `runAsBox` scopes to exactly one box, and `runAsRoot` is for
> platform jobs and is forbidden on a thread serving a user request. So anything the directory reads
> across boxes **must not be `@TenantId`** — it gets an explicit `box_id` predicate instead, the
> `Movement`/`Box`/`Membership` pattern that `docs/TENANCY.md` §4 already sanctions.

And its refinement, which is what keeps the rule from becoming a leak:

> **Drop `@TenantId` only when the WHOLE table is public.** A mixed-visibility table keeps the
> discriminator and gets one narrow, registered native read instead.

Box profiles and photos are entirely public — there is nothing private in those tables to leak, so an
explicit predicate is safe. `post` holds **both** public and box-only rows, so one missed predicate
would leak private content; it stays `@TenantId` and the public feed becomes a single audited native
query.

| Class | Tables | Why |
|---|---|---|
| **Not `@TenantId`** | box public profile columns (on `boxes`), `box_photo`, `box_hours` | The directory reads these across boxes, for boxes the reader does not belong to. Wholly public |
| **Not `@TenantId`, keyed on USER** | `coach_profile`, `coach_availability`, `coach_time_off`, `coach_stripe` | A coach is one person across several boxes — see §3.1 |
| **`@TenantId`** | `room`, `pt_booking`, `post`, `post_like`, `wod_rating`; `bookings` and `payment` already are | Box-operational or mixed-visibility. The dominant read is a box looking at its own data |

### 3.1 Why the coach tables are keyed on the user

M21 made it real for one person to hold several boxes. A coach has **one** Stripe account and **one**
calendar across every box they work at. Tenant-scoping either one would duplicate credentials per box,
or make the account vanish when the coach switches box — which is `docs/TENANCY.md` failure mode 1,
exactly.

Note the deliberate asymmetry: `coach_stripe` is keyed on the **user** ("who is this person's Stripe
account"), while `payment.payee_membership_id` points at a **membership** ("who is owed, in this box's
context"). Two different questions, two correct scopes.

### 3.2 The three cross-box reads, named in advance

Each is a boxless or cross-box read of a `@TenantId` table, which since M21 returns **empty** rather
than leaking. Each needs the third route sanctioned by `docs/TENANCY.md` §4 — a **registered native
query**, added to `docs/TENANCY.md` §6's native-method table with its justification.

**M22 does not build them.** Phase 1 ships no endpoints, so none of these has a caller yet. They are
named here because the *schema* has to make them possible, and because a cross-box read discovered
later, by someone who does not know this rule, is exactly how the same bug shipped three times before
the M11 audit. Each is built by the milestone that first needs it.

| Cross-box read | Built by | Note |
|---|---|---|
| "My drop-ins across every box" — a boxless session reading its own `bookings` rows | M23/M24 | The boxless shell is where this first has a caller |
| A coach's real free slots — availability at Box A must account for their `pt_booking` rows at Box B | **M26** | **Deferred by D14.** Not needed while a coach works at one box. This was the milestone's sharpest risk before that assumption |
| The public social feed — `post` rows across boxes where `visibility = 'PUBLIC'` | M25 | |

## 4. Schema — the box public surface

| Change | Notes |
|---|---|
| `boxes` += `published boolean not null default false` | D6. Only an `ACTIVE` box may set it |
| `boxes` += `description`, `street`, `city`, `region`, `postcode`, `country`, `lat`, `lng` | All nullable. On `boxes` rather than a `box_profile` join: the directory query is `where published and …`, and one indexed table beats keeping `boxes` lean |
| `box_photo` (id, box_id, path, sort_order, created_at) | Not `@TenantId` |
| `box_hours` (id, box_id, weekday, open_time, close_time) | Not `@TenantId`. **Rows, not columns**, so a box can have split hours — morning *and* evening, which is normal in Italy |

Indexes: `(published, country, city)` for directory filtering; `(lat, lng)` for the bounding-box
prefilter.

## 5. Schema — rooms

| Change | Notes |
|---|---|
| `room` (id, box_id, name, active, created_at) | `@TenantId` |
| `schedule_slot.room_id` nullable FK | Optional |
| `class_sessions.room_id` nullable FK | Optional |
| `pt_booking.room_id` nullable FK | D5 — PT is located on the floor even though it consumes no class capacity |

No capacity, no double-booking prevention, no collision detection. All behaviour, all M14b. What M22
guarantees is that a collision is **representable**: a class and a PT session in the same room at the
same time are both recorded against that room, so the rule can be written later without a migration.

## 6. Schema — the coach

| Table | Notes |
|---|---|
| `coach_profile` (user_id PK, bio, strengths, weaknesses, photo_path, `published`, `price_cents`, `currency`, `payee`) | Not `@TenantId`. `payee` is `COACH`/`BOX`, default `COACH` — D2 in one column. One price per coach; per-box pricing is excluded, see §10 |
| `coach_availability` (id, user_id, weekday, start_time, end_time) | Not `@TenantId`. The recurring pattern |
| `coach_time_off` (id, user_id, starts_at, ends_at) | Not `@TenantId`. Exceptions, kept a separate table rather than nullable columns muddying the first |
| `pt_booking` (id, box_id, coach_membership_id, athlete_user_id, `room_id` nullable, starts_at, duration_min, status, price_cents, currency, created_at) | `@TenantId`. Coach is a **membership** — it proves they belong to that box and matches `payment.payee_membership_id`. Athlete is a **user**, because a non-member can book PT. `room_id` is D5: PT does not consume class capacity but is located on the floor |
| `coach_stripe` (user_id PK, restricted_key_enc, webhook_secret_enc, enabled) | Not `@TenantId`. Mirrors `box_stripe` exactly |

`pt_booking.status` in `REQUESTED, ACCEPTED, DECLINED, CANCELLED, COMPLETED, NO_SHOW`. M26 specifies
the request → coach-accepts flow; M22 only cuts the states.

## 7. Schema — the drop-in and the payment spine

### 7.1 A drop-in is a row in `bookings`, not its own table

A separate `dropin_booking` table would be a **correctness bug, not a style choice**. Capacity is
enforced by a single count — `bookings.countBySessionIdAndStatus(sessionId, "BOOKED")`
(`BookingService.java:58`). Put visitors in a separate table and that count silently stops seeing
them: **a class can be oversold.** Every roster read, check-in, TV board and the waitlist promotion
would each need a UNION, and missing one reintroduces the bug.

Today: `membership_id uuid not null references memberships(id)`, and since V21 a partial unique index
`uq_active_booking on bookings (session_id, membership_id) where status <> 'CANCELLED'`.

| Change | Why |
|---|---|
| `membership_id` becomes **nullable**; add `visitor_user_id` FK to `users` | A visitor has no membership |
| CHECK: **exactly one** of `membership_id` / `visitor_user_id` is set | Same disjoint-FK pattern as `payment` |
| A sibling partial unique on `(session_id, visitor_user_id) where status <> 'CANCELLED'` | A visitor must not double-book. Mirrors the existing index exactly |
| CHECK: a visitor row may not have `status = 'WAITLIST'` | **D13 enforced by the database**, not by remembering |

Capacity, concurrency and the promotion logic then need **zero changes** — they already count the
right rows. The only code affected is display-side name resolution, and since Phase 1 ships no
endpoint that can create a visitor booking, no such row can exist yet to break anything.

### 7.2 `payment`

```
payment.subscription_id     nullable  -> subscription
payment.booking_id          nullable  -> bookings      (a visitor drop-in)
payment.pt_booking_id       nullable  -> pt_booking
CHECK: exactly one of the three is non-null
payment.payee_membership_id nullable  -> memberships   (NULL = the box is paid)
```

Every existing row stays valid untouched: `subscription_id` set, the other two null. The Stripe
webhook's native lookup by `stripe_session_id` is unaffected — still one table, still one row, still
resolving the box from the row's own `box_id` before establishing `runAsBox`.

## 8. Schema — social and ratings

| Table | Notes |
|---|---|
| `post` (id, box_id, author_membership_id, wod_id nullable, caption, `visibility` PUBLIC/BOX, created_at) | `@TenantId`. ~100 character caption plus the WOD, per M25 |
| `post_like` (post_id, user_id, created_at) | `@TenantId`, unique (post_id, user_id) |
| `wod_rating` (id, wod_id, user_id, rating, created_at) | `@TenantId`, unique (wod_id, user_id), `rating` CHECK between 1 and 5 — the dumbbell rating |

## 9. GDPR — an obligation, not an extra

The v3 roadmap named this and refused to let M22 skip it: the project is the processor and EU gyms are
the controllers.

**`GET /api/me/export` gains:** coach profile, availability, time off, PT bookings **in both roles**
(as coach and as athlete), visitor bookings, posts, likes and ratings. `coach_stripe` appears as
**existence only — never the encrypted key**.

**The anonymising `DELETE /api/me`:**

- `coach_profile` is **deleted outright**, which removes the name and photo from every public page
  with no cascade to chase. That is precisely the payoff of D7.
- `coach_stripe` is deleted.
- Posts, likes and ratings are **anonymised, not deleted**, so a box's feed does not develop holes.
  This matches the shipped pattern, pinned by
  `AccountDeletionTest#anonymizationLeavesBookingsScoresAndLiftsIntact`.

## 10. Deliberately not modelled

Required by the Phase 1 rule. Each entry is a decision, not an omission.

| Excluded | Why |
|---|---|
| Comment threading on posts | Open product question. The v3 roadmap already excluded it: a thread model built against no screen is what the Phase 1 rule forbids |
| Multi-packs, day passes, credit balances, credit expiry | D4 — no prepaid liability on rxed |
| Drop-in waitlist | D13 — no money owed back |
| `room.capacity`, room double-booking prevention, collision detection | D11 — behaviour, and M14b owns the surface |
| Per-box coach pricing | One price per coach. A `coach_box_rate` table is additive later |
| Per-coach-per-box "offers PT here" flag | Same reasoning; a boolean on `memberships` is additive later |
| A box-controlled "PT-allowed window" | D5 — PT consumes no class capacity, so nothing intersects it yet. Additive if a pilot box asks |
| Room collision detection between a class and a PT session | D5 — M22 makes it representable; M14b writes the rule |
| The cross-box coach availability read | D14 — a coach works at one box for now. M26 builds it, and no migration is needed |
| Notification / outbox | M17 owns the notification strategy. Modelling it here models an open question |
| The geocoding mechanism | M24. Phase 1 ships no endpoints |
| Stripe Connect | BYO restricted keys mirror `box_stripe`. Connect is M26's, if a coach ever needs it |

## 11. Migration

**One migration, `V22__new_domain_schema.sql`.** V21 is the current head. No applied migration is
edited.

Ordering within it: additive columns on `boxes`, `schedule_slot`, `class_sessions` and `payment`
first; then the new tables; then the constraint changes on `bookings` (drop the old partial unique,
recreate both), and last the CHECK constraints — so no CHECK is created against a column that does
not yet exist.

**Nothing in this migration is destructive.** Every existing row remains valid without backfill:
`payment.subscription_id` stays set, `bookings.membership_id` stays set, every new column is nullable
or has a default.

## 12. Test obligations

The tenancy rule is that classification is not trusted until a **two-box** test proves it. A
single-box test passes against a silently-broken version just as happily — which is how the same bug
shipped three times before M11, and why `SessionApiTest#sweepFlipsPastBookedToNoShow` stayed green for
a year over a job that flipped nothing.

| Test | Pins | Mutation it must catch |
|---|---|---|
| Directory read across two boxes | Public box tables are not `@TenantId` | Re-adding `@TenantId` to `box_photo`/`box_hours` — the read would return empty |
| Box-only post is invisible to another box | `post` keeps its discriminator | Dropping `@TenantId` from `post` |
| Public feed spans two boxes | The registered native query | Reverting it to JPQL — it would see one box |
| A coach's profile and availability survive a box switch, and read identically from either box | D14 — the coach tables are keyed on the user, not tenant-scoped | Adding `@TenantId` to `coach_profile`/`coach_availability`: the rows would vanish on switch, which is `docs/TENANCY.md` failure mode 1 |
| "My drop-ins" from a boxless session | The registered native query | Reverting it to a derived query — it would return empty |
| Visitor + member bookings count toward one capacity | §7.1's whole argument | Moving visitors to a separate table |
| A visitor row cannot be `WAITLIST` | D13 in the database | Dropping the CHECK |
| `payment` rejects two product FKs at once, and rejects zero | D10's CHECK | Dropping the CHECK |
| `coach_profile` deletion clears the public page | D7's payoff | Making the box own the record |

**Run the negative control on every one of them.** Break the implementation, watch the named test go
red, revert. If you cannot name the mutation a test catches, say so rather than counting it as
coverage.

`AuthzConformanceTest` should need **no edits** in this milestone — M22 adds no routes. If it goes
red, that is a finding to investigate, not a line to adjust.

## 13. Open questions handed forward

| Question | Owner |
|---|---|
| Geocode a typed address, or drop a pin on a map? | M24 |
| Build the `/media/pub/` nginx location and storage subdirectory, and give the upload endpoint a public option — the mechanism is settled in D9, only the implementation is deferred | M24 |
| Does the public box page show a timetable? If so it is one box, so `runAsBox(targetBoxId)` serves it | M24 |
| Notification strategy, and specifically the silent waitlist promotion | M17 |
| Room capacity and collision rules, and the admin calendar with when/where/what filters | M14b |
| The coach request → accept flow, and Connect if a coach ever needs more than BYO keys | M26 |
| **Multi-box coaching.** Trigger: the first coach holding a COACH membership at two boxes. Needs the cross-box availability read in §3.2 and **no migration**. Until it lands, a coach at two boxes would show as free at Box A while booked at Box B | M26 |
| Comment threading | Still an open product question |

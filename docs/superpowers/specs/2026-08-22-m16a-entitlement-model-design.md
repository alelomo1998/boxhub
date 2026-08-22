# rxed — M16a: the plan entitlement model

**Date:** 2026-08-22
**Branch:** `m16a-entitlement-model`
**Position:** **before M23.** The schema half of M16, pulled forward.
**Status:** design approved in conversation, plan pending.

---

## 1. Why this exists, and why now

A plan today carries **one** limit: `plan.weekly_class_limit`, gated behind a two-value
`entitlement` string (`UNLIMITED` / `WEEKLY_LIMIT`). A real box needs more than that: a maximum per
day, per week, per month, a total for the term, and the same again for cancellations — each of them
optional, each meaning *unlimited* when unset.

**The reason it is not simply filed under M16 is sequencing.** M16 sits after all of Phase 2, but
M23 → M26 are the milestones that build the screens which **display and edit plans**. Landing a
six-limit model after six milestones have rendered a one-integer model means rewriting those screens.

That is the same argument M13f was justified by, one layer down: M13f existed because eight
milestones were about to build on a component layer with known defects, and repairing it first cost
less than repairing eight screens afterwards. **Here the wrong shape is in the data model rather than
the UI, and the cost lands in exactly the same place.**

M16a is therefore **backend only**: schema, entities, the entitlement check, and tests. **No new
endpoints beyond what the existing plan CRUD already exposes, and no screens.** M14a used exactly
this test for scope leakage and it worked; reuse it.

### 1.1 What stays in M16

Stripe recurring / auto-renew, class-pack *purchase* flows, the discount catalog, PDF receipts,
proration and refunds, Stripe Connect. M16a takes only the entitlement model those features will
later price and sell.

**M16's backlog line "class-packs / credit punch-cards (N-session decrementing buckets)" is absorbed
here**, because a punch-card is exactly this model with `entries_total` set and everything else null.
Building it twice would mean the second one rewrites the first.

---

## 2. The model

### 2.1 Two counters, four periods, all optional

| | per day | per week | per month | total |
|---|---|---|---|---|
| **entries** | `entries_per_day` | `entries_per_week` | `entries_per_month` | `entries_total` |
| **cancellations** | `cancellations_per_day` | `cancellations_per_week` | `cancellations_per_month` | `cancellations_total` |

Eight nullable integer columns on `plan`. **NULL means unlimited**, and a plan with all eight null is
today's `UNLIMITED`. A punch-card is `entries_total = 10` with the other seven null.

### 2.2 Limits compose with AND (user-stated 2026-08-22)

Every set limit must pass. "Max 3 per day and 10 per week" blocks the eleventh booking in a week even
on a day where the athlete has booked nothing. There is no "tightest wins" resolution and no
precedence between periods — a limit that is set is a limit that binds.

The check evaluates in a **fixed order — total, month, week, day — and reports the first limit
violated**, so the athlete is told which rule stopped them rather than a generic refusal. The order
is for the message, not the logic; the outcome is identical whichever order runs.

### 2.3 Period windows

All windows are computed in the **box's timezone**, matching the existing weekly check:

- **day** — midnight to midnight in box tz, of the session's own date
- **week** — Monday 00:00 to the following Monday 00:00 (`TemporalAdjusters.previousOrSame(MONDAY)`,
  as the current code already does)
- **month** — first of the month 00:00 to the first of the next month 00:00
- **total** — `subscription.current_period_start` to `subscription.current_period_end`

**`total` is scoped to the subscription term, not to all time.** `Subscription` already carries both
columns, so a monthly subscription's total resets every month and an annual one's every year, with
no new date arithmetic and nothing for an admin to reset by hand. This is what makes "monthly or
annual" work without a second concept.

**The window is anchored to the session being booked, not to `now`.** Booking next Tuesday's class
counts against next Tuesday's day and its week — otherwise an athlete could exhaust a week's
allowance by booking far ahead and the counts would disagree with what the calendar shows.

### 2.4 Cancellation refunds the entry, and spends a cancellation

Both halves matter, and the second is the point of having a cancellation limit at all:

- the entry is **refunded** — it no longer counts against any entry limit
- a cancellation is **recorded** — it counts against every cancellation limit

Without the second half a cancellation limit would be unenforceable, and without the first an athlete
who cancelled would be charged for a class they did not take.

**A LATE cancellation refunds nothing.** It spends the entry *and* the cancellation.
`booking.was_late` is already stamped at cancel time from the cutoff then in force (V21), so the fact
is recorded at the only moment it is knowable. Refunding a late cancel would make the cutoff
meaningless: an athlete could hold a place, drop it after the cutoff, and be no worse off than
someone who never booked.

*(Assumption stated at design time and open to reversal: if a box wants late cancels refunded, that
is a per-plan flag, not a change to this rule.)*

---

## 3. The usage ledger, and why it cannot be a query over `booking`

Counting entries directly from `booking` rows looks sufficient — every booking and cancellation is
already there, with `cancelled_at` and `was_late`.

**It is not safe, for one concrete reason: scheduling deletes booking rows.**
`SlotRegenerationService.regenerateFrom` deletes bookings for every session in the regenerated range
(it must — `bookings.session_id` has no `ON DELETE CASCADE`), and its own comment records that this
"deliberately discards cancellation history for the regenerated range".

So a coach editing next month's schedule would silently change how many entries every affected
athlete has consumed. **Consumption history cannot live in a table that scheduling is allowed to
delete from.**

### 3.1 `entitlement_usage`

Append-only. One row per consumption event.

| column | notes |
|---|---|
| `id` | uuid pk |
| `box_id` | **`@TenantId`** |
| `subscription_id` | the term the row counts against |
| `membership_id` | denormalised for the count queries |
| `booking_id` | nullable, and **no FK** — see below |
| `session_start_at` | the window anchor, copied at write time |
| `kind` | `ENTRY` or `CANCELLATION` |
| `refunded` | boolean, default false; an `ENTRY` row flipped true no longer counts |
| `created_at` | |

**`booking_id` deliberately carries no foreign key.** A FK would either block the regeneration delete
or cascade the ledger away with it, which is the exact failure this table exists to prevent. It is a
soft reference for tracing, and nothing reads it to compute a count.

**`session_start_at` is copied, not joined.** The window anchor must survive the session row being
deleted by regeneration, for the same reason.

### 3.2 Writes

- **book** → insert one `ENTRY`
- **cancel, in time** → flip that `ENTRY` to `refunded = true`, insert one `CANCELLATION`
- **cancel, late** → insert one `CANCELLATION`; the `ENTRY` stays unrefunded
- **waitlist promotion** → insert the `ENTRY` at promotion, not at join. A waitlisted athlete holds
  no place and must not be charged for one.

Every write happens **inside the booking transaction**, so a rolled-back booking cannot leave a
consumed entry behind — the same rule this project already applies to audit rows.

### 3.3 Counting

`ENTRY` rows where `refunded = false`, and `CANCELLATION` rows, both filtered to the window by
`session_start_at` and to the subscription for `total`. One index carries all of it:
`(membership_id, kind, session_start_at)`.

---

## 4. Migrating the existing model

**V28** adds the eight columns and the ledger, then:

- `plan.weekly_class_limit` → `entries_per_week`, value preserved
- `entitlement = 'UNLIMITED'` → all eight null
- `entitlement = 'WEEKLY_LIMIT'` → `entries_per_week` keeps its value

**`plan.entitlement` and `plan.weekly_class_limit` are dropped as COLUMNS, but both stay on the wire — see §4.1.** The string enum exists only to
say "is there a limit", which the nullability of the eight columns now says directly, and
`PlanController.resolveEntitlement` exists only to keep the two fields consistent with each other —
a validation that disappears with the redundancy that created it.

**Existing subscriptions need backfill.** Rows in `entitlement_usage` for bookings already made in
the current term, so an athlete mid-month is not handed a fresh allowance. Derive from `booking`
during the migration: this is the one moment the booking table is authoritative, before regeneration
can have deleted anything from the current term.

### 4.1 `wodType`-style wire compatibility DOES apply — verified, against this spec's first draft

This spec initially claimed no frontend consumed `entitlement`, and said to check before planning.
**The check ran on 2026-08-22 and the claim was false:**

```
frontend/src/app/features/admin/plans.page.ts   entitlement x5, weeklyClassLimit x4
frontend/src/app/features/admin/admin.service.ts  weeklyClassLimit on the PlanDto
4 spec files                                      invites, plans, subscriptions, membership
```

`plans.page.ts` binds `entitlement` to a `<select>`, disables the limit input on `UNLIMITED`, and
renders `p.weeklyClassLimit + '/week'` in the list. Dropping the fields from the wire breaks that
screen, and fixing the screen is frontend work — which is exactly the scope leakage §1 forbids.

**So both fields stay on the wire as derived values, exactly as M14a kept `wodType` alive as
`timingPreset ?? macro` after its column was gone:**

- `weeklyClassLimit` is served as `entries_per_week`
- `entitlement` is served as `UNLIMITED` when all eight limits are null, else `WEEKLY_LIMIT`
- writes accept both, mapping `weeklyClassLimit` onto `entries_per_week`

The shim is deleted by whichever milestone rebuilds the plan admin screen (M14b or M17), and that
obligation is recorded in `docs/HANDOFF.md` at M16a's close, not left implicit.

**This correction is the standing rule paying for itself inside a single session.** The spec asserted
a fact about the current code, the grep contradicted it, and the design changed rather than the
evidence. A deferred defect list is a hypothesis; so is a spec's claim about what consumes a field.

---

## 5. Gates

| Gate | Requirement |
|---|---|
| Backend suite | **511 → grows.** Every new limit gets a happy + blocked test. |
| Migration head | **V27 → V28.** Exactly one migration. |
| Frontend | **Karma 419, e2e 67, visual 31 — ALL UNCHANGED.** M16a touches no frontend. Any movement is scope leakage, which is this milestone's own test on itself. |
| `AuthzConformanceTest` | No new routes. Untouched. |
| Tenancy | `entitlement_usage` is `@TenantId`. Every box-scoped endpoint keeps happy + auth-denied + cross-tenant-denied. **Any tenant-agnostic read is native SQL** — since M21 a tenant-less read fails closed and returns empty. |
| Negative control | On every new test. Break it, watch it go red, revert. If the mutation cannot be named, say so instead of counting it as coverage. |

### 5.1 The tests that matter most

1. **AND composition** — 3/day and 10/week: the 4th booking in one day is blocked while the week has
   room, and the 11th in a week is blocked on an empty day.
2. **Refund restores the allowance** — book to the limit, cancel in time, book again: allowed.
3. **Late cancel does not** — book to the limit, cancel late, book again: blocked.
4. **A cancellation limit binds even when entries have room.**
5. **Regeneration does not alter counts** — book, regenerate the slot's range, re-count. This is the
   test the ledger exists for; it fails against a `booking`-derived count and passes against the
   ledger. **Write it first**; it is the whole justification for §3.
6. **Period rollover** — a booking in the previous week does not count against this week.
7. **`total` resets with the subscription term**, and does not reset on renewal into a new term
   mid-window.

---

## 6. Out of scope

- Any screen. `plans.page.ts` keeps working unchanged against the compatibility shim in §4.1; the
  screen is rebuilt by M14b or M17, which is also what deletes the shim.
- Pricing, purchase, proration, receipts — M16.
- Per-plan "refund late cancellations" flag. Recorded here as the reversal path for §2.4, not built.
- Drop-in entitlements (M24) and coach-reservation limits (M26). Both are different products against
  a different table and neither is a plan.

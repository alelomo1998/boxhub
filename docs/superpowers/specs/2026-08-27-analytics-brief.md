# The analytics brief

**A brief, not a build.** Written 2026-08-27, in the same spirit as `2026-08-27-m38-scale-readiness-brief.md`:
it establishes what is true, names the gaps, and sets the rules that the screen milestones consume.

It is placed early on purpose. Every finding below is either a **migration**, which is cheap now and
ruinous at milestone #27, or a **definition**, which is free now and a support ticket later.

**Consumed by:** `M15a` (LEG, at-risk), `M16d` (ARM, owner dashboard, payroll), `M17c` (athlete
analytics), `M18` (platform analytics). Those milestones implement; this document decides.

---

## 0. What was measured, and how

Everything in §2 and §3 was read from source on 2026-08-27 against `main` at `3451b65`. Claims carry
`path:line`. Two findings were produced by subagents and then **re-verified independently** by the
orchestrator before being written down here — the `SessionItemController` cascade (§2, D-1) and the
four load-bearing revenue claims (§3). The palette in §4 was **computed and validated by script**,
not chosen by eye; the validator output is reproduced verbatim so nobody re-derives it.

Where a claim is inferred rather than read, it says so.

---

## 1. What each surface must answer

A stats screen is not a place to put numbers. It is an answer to a question somebody actually asks.
These are the questions, per role. A chart that answers none of them does not ship.

### Athlete — `M17c`

| Question | Reads |
|---|---|
| Am I getting my money's worth? | `entitlement_usage` entries this period vs the plan's eight limits; payments ÷ visits |
| Am I turning up? | attendance count and trend, weekly streak, longest gap |
| Am I getting better? | `lift_entry` per movement over time; benchmark re-tests; `wod_score` on repeated WODs |
| Where do I stand today? | current period, entries left, renewal date |

The **cost-per-visit** number is the one an athlete has never been shown by any competitor and it is
the one that justifies the membership to them. It needs §3's revenue rule as much as the owner's
dashboard does — a comped athlete must not be shown "€0.00 per visit" as if it were a bargain.

### Coach

| Question | Reads |
|---|---|
| Who is in my class, and who has stopped coming? | roster, per-member attendance gap |
| Are my classes filling? | `bookings` count ÷ `class_sessions.capacity` (the snapshot — see §2, F-6) |
| What have I actually run? | **not answerable today** — see §2, M-6 |

### Box owner — `M15a` and `M16d`

| Question | Reads |
|---|---|
| What did we take in, net? | §3 — and it needs three migrations first |
| ARM — average revenue per member | net revenue ÷ active members, both defined in §3 |
| LEG — length of engagement | **not answerable today** — see §2, M-1. This is the headline finding. |
| Who is at risk of leaving? | attendance decay + entitlement under-use; both durable today |
| Is the timetable right? | fill rate by class type and by time-of-day, waitlist pressure |
| What do I owe the coaches? | coach hours — **not answerable today**, see §2, M-6 |

### Superadmin — `M18`

Platform revenue, boxes by lifecycle state, renewals versus lapses, geography. Every one of these is
a cross-box read and therefore goes through `TenantContext.runAsRoot(...)` per `docs/TENANCY.md` —
**never** on a thread serving a box user, and never by loosening a `@TenantId` filter.

---

## 2. The Phase 1 data audit

### What is durable — do not re-litigate

Phase 1 did record most of what the reports need, and in two places it was explicitly designed for
this. Credit where it is due:

| Fact | Where | Why it holds |
|---|---|---|
| Cancellations | `bookings.cancelled_at`, `was_late` (`V21`) | M14a stopped `bookings.delete()`. "Who cancels late" went from impossible to easy. |
| Entitlement consumption | `entitlement_usage` (`V28`) | **Append-only, no FK to `bookings` on purpose.** The model everything else should have copied. |
| Attendance | `bookings.status` `CHECKED_IN`/`NO_SHOW`, `checked_in_at` | Distinguishes booked from attended from no-show. |
| Payment history | `payment`, insert-only | Rows are never updated except a `PENDING`→terminal status flip. |
| Price at time of sale | `payment.list_price_cents` (`V16`) | A receipt reopened after a price change shows the discount actually given. |
| Capacity at time of booking | `class_sessions` is a snapshot (`V19`) | Historical fill rate is correct even after a slot is edited. See F-6. |
| Erasure does not distort history | `AccountService.anonymize()` | Scrubs identity, keeps membership, scores, bookings, payments. **A member exercising GDPR erasure does not change the owner's revenue chart.** |
| Box-local time | `boxes.timezone` (`V1`) | Present. Must actually be used — see the rule at the end of this section. |

### Named misses

Ranked by cost of finding out late.

---

**M-1 — There is no record that a member ever left. LEG and churn are not computable.**
**Severity: highest. Needs a migration.**

`memberships.status` is `ACTIVE | SUSPENDED`, overwritten in place at
`box/MemberController.java:79` with no audit row, no timestamp, and no prior value retained. No code
path anywhere deletes a membership row. So:

- **Join date** exists (`memberships.created_at`). **Leave date does not exist at all.**
- LEG (length of engagement) is computable for a *current* member and **not** for a churned one —
  which is the only cohort the metric is about.
- Monthly churn, the number every affiliate owner is trained on, has nothing to read.

> **This corrects `docs/POSITIONING.md` §5**, which states that "`subscription` + `payment` +
> `entitlement_usage` already hold everything needed" for LEG and ARM. That is true for **ARM** and
> **false for LEG**. Recorded here so nobody plans M15a against the wrong version.

`subscription` does not rescue it. On a same-plan renewal `SubscriptionService.recordPeriod` updates
the existing row in place (`box/SubscriptionService.java:93-95`), so per-period history is
overwritten too. `SubscriptionLapseJob` flips the same row to `EXPIRED`. A lapse is *a* signal, but a
lapsed subscription is not a departed member and a suspended member may still hold an active one.

**Fix:** an append-only `membership_event(id, box_id, membership_id, kind, at, actor, note)` written
inside the transition's transaction — the same discipline `CLAUDE.md` already binds for audit rows.
`kind` covers `JOINED | SUSPENDED | REACTIVATED | LEFT`. Backfill `JOINED` from
`memberships.created_at`; everything before today is genuinely unknowable and must be left so rather
than invented.

---

**M-2 — A payment's timestamp is when checkout started, not when the money settled.**
**Severity: high. Needs a migration.**

`payment.created_at` is `insertable = false, updatable = false` (`box/Payment.java:33`) over a
`default now()` column. The webhook flips `PENDING`→`SUCCEEDED`/`FAILED`
(`box/StripeWebhookController.java:167,215`) and **cannot** touch `created_at`.

For card payments this is a distinction without a difference. For the delayed-notification rails the
webhook exists to handle — SEPA debit, bank transfer — settlement can land days later and **in a
different month**. A cash-basis "revenue by month" chart keyed on `created_at` then books the money
to the month the member clicked, not the month it arrived. A `FAILED` row also carries a `created_at`
for money that never existed.

**Fix:** `payment.settled_at timestamptz null`, set by the webhook on the transition to `SUCCEEDED`,
and set at insert for the admin-recorded path (which is already `SUCCEEDED` on creation,
`box/SubscriptionTx.java:42`). Revenue reads `settled_at`; `created_at` stays what it is, the
attempt time.

---

**M-3 — A refund cannot be represented at all. Every revenue number is gross, forever.**
**Severity: high. Needs a migration.**

`payment.status` admits `SUCCEEDED | PENDING | FAILED` (`V17`). There is no `REFUNDED`, no
`refunded_at`, no refund amount, no negative amount, and no linked credit row. The webhook handles
exactly three event types (`box/StripeWebhookController.java:54,62,68`); every other type, including
`charge.refunded`, falls through as a silent `200`.

**A refund issued from the Stripe dashboard today changes nothing in the database.** The `payment`
row stays `SUCCEEDED` for ever. This is not a reporting bug that reporting can work around — the
fact is absent.

**Fix:** a `refund` row referencing the payment (`amount_cents`, `reason`, `refunded_at`, `method`),
not a mutation of the payment. Partial refunds exist, so a status flag is the wrong shape. Add
`charge.refunded` to the webhook's handled set at the same time, or Stripe-side refunds stay
invisible whatever the schema says.

---

**M-4 — "Comped" is a string comparison against a plan name.**
**Severity: medium. Migration advisable.**

`SubscriptionService.isComp` is `COMPED_PLAN_NAME.equals(p.getName())` where `COMPED_PLAN_NAME` is
the literal `"Comped"` (`box/SubscriptionService.java:127,130`). Nothing on `subscription` marks it.
The comp plan is created lazily per box, `archived = true`, `price_cents = 0`, currency hardcoded
`"eur"`.

Two consequences. A box admin who renames or recreates that plan silently un-comps every member on
it. And a comp is indistinguishable in the data from a member who simply has not been charged yet —
which matters enormously to §3, because one is intentional and the other is debt.

**Fix:** an explicit `subscription.kind` (`PAID | COMPED | TRIAL`) or a boolean. `TRIAL` is worth
including now: `M32a` builds the trial → member conversion board and will otherwise invent its own.

---

**M-5 — Nothing enforces one currency per box, and `boxes` has no currency at all.**
**Severity: medium. Migration advisable.**

`plans.currency` is free text accepted verbatim from the request body
(`box/PlanController.java:92,121`) with no pattern, enum or ISO-4217 check. `Box` has no currency
field. `payment.currency` copies whatever the plan carried. No DB constraint anywhere.

So a box can hold a `eur` plan and a `usd` plan, and `SUM(amount_cents)` adds cents of euros to cents
of dollars. The number is wrong and nothing complains.

**Fix:** `boxes.currency` as the single source of truth, plans validated against it. The alternative —
reporting per currency — is the right general answer and the wrong one for a product whose pilot is
one European gym; do the simple thing and record why.

---

**M-6 — Nobody records who actually ran a class. `M16d`'s payroll calculator has no input.**
**Severity: medium. Needs a migration.**

`class_sessions.coach_id` is the coach **assigned** when the session was generated from the slot. The
coach who covered a sick colleague at 6am leaves no trace. `M16d` scopes a "staff payroll calculator
(coach hours from class assignments)", and the roadmap's own open-questions list already flags
"tracking who actually *ran* a class versus who was assigned it" as unanswered.

Paying people from the assignment column is a payroll error, not a reporting inaccuracy.

**Fix:** `class_sessions.ran_by_membership_id`, written at check-in or class start by The Room
(`M34`), defaulting to `coach_id` when nothing overrides it. Cheap now; awkward once payroll ships
against the wrong column.

---

**M-7 — A payment does not say which period it paid for.**
**Severity: medium. Migration advisable.**

`payment.subscription_id` links to the subscription, but the subscription's period columns are
overwritten on renewal (M-1). So for a subscription with several payments, which period each one
covered is reconstructible only by inference from timestamps.

Cash-basis revenue ("what came in during March") survives this. **Accrual-basis revenue and MRR do
not** — recognising €99 across a month, or stating deferred revenue, needs the covered period.

**Fix:** `payment.period_start` / `payment.period_end`, snapshotted at insert. Decide in §3 whether
accrual is in scope at all; if it is not, this becomes a rule rather than a migration.

---

**M-8 — `payee_membership_id` has no writer, so coach money will silently enter box revenue.**
**Severity: latent, becomes high at `M26`. No migration — a rule.**

`payment.payee_membership_id` exists (`V26`, null = the box is paid, set = that coach is paid) and
`grep` finds **no caller of `setPayeeMembershipId`** anywhere. Neither PT bookings nor drop-ins are
implemented, so today every payment row is box money by omission.

The roadmap has already decided that for PT and drop-ins **the coach owns the money** and the gym is
not in the payment flow. The day `M26` ships, an unqualified `SUM(amount_cents)` starts counting
money the box never received.

**Rule, binding from now:** every revenue query filters `payee_membership_id IS NULL`. Write it into
the first query, not the one that breaks.

---

**M-9 — `lift_entry.is_pr` means "was a record when logged", not "is the current record".**
**Severity: low, but it will be misread. No migration.**

Set once at insert against the then-current max (`performance/LiftController.java:52-66`), and
`LiftController` has no PATCH or DELETE, so rows are insert-only. Old rows keep `is_pr = true` after
being beaten — several rows per movement carry the flag. The one production caller wants "the last
time you set a PR" and is correct; `LiftController.prs()` already ignores the flag and recomputes.

**Rule:** analytics must not read `is_pr` as "the athlete's current PR". Recompute, as `prs()` does.

---

**M-10 — Announcements have no history.** One row per box (`unique (box_id)`, `V7`), find-or-create
then overwrite, plus a hard `DELETE`. Irrelevant to revenue and attendance; a gap for `M29a`'s
engagement reporting. **No action now** — recorded so `M29a` designs its own history rather than
discovering this.

### Three live defects found while auditing

Not analytics gaps. Found because the audit traced what destroys history, and destroying history is
what they do.

**D-1 — Editing a class's programming deletes every score logged against it. Live and reachable.**

`PUT /api/box/sessions/{sessionId}/items` calls `items.deleteBySessionId(sessionId)`
(`programming/SessionItemController.java:94`) and recreates the items fresh. `wod_score.session_item_id`
is `on delete cascade` (`V7__class_model.sql:53`). There is **no guard on existing scores and no date
guard** — the endpoint works on a class that finished last month.

A coach reordering two pieces or fixing a typo after a class has been scored silently destroys every
athlete's result for that class. Verified by the orchestrator directly, not taken from a report.

This is the single most expensive thing found by this brief, and it is not an analytics problem —
`M33` names performance history as *the real switching cost for a CrossFit box*.

**The suite already knew.** `e2e/tests/programming.spec.ts:10-11` carries this comment:

> build "Burn It", not the first class: today's first class is the WOD Class that
> `tracking.spec` scores against (Fran), and **republishing it here would wipe that**.

The behaviour was observed, understood well enough to be described accurately, and routed around
rather than filed. That is the failure worth generalising: **a workaround written into a test is a
defect report nobody filed.** When a comment explains why a test avoids a code path, the reason
belongs in the backlog too.

There is also **no test anywhere, backend or e2e, that logs a score and then edits the programming** —
which is why four green tests over `replace()` never saw it.

**Ruled 2026-08-27: fixed now, as a defect** (see "Decisions taken"). The root cause is on the wire,
not in the method: `ItemInput` carries no item id, and `wod_id` cannot substitute for one because a
session may legitimately hold the same WOD twice. Ids must also stay stable for
`class_timers.session_item_id` (a soft pointer with no FK) and for `/athlete/board/:itemId`, which is
a shareable URL.

**D-3 — The admin dashboard's member count is the whole platform's, not the box's. Live.**

`AdminStatsController.stats()` calls `memberships.findAll()` with **no box filter**
(`box/AdminStatsController.java:39`), and `Membership` is **not** `@TenantId` —
`MembershipRepository` says so in a comment: *"Membership is not @TenantId — derived query safe
tenant-agnostically."* That comment is true of the methods it annotates, which all take a `boxId`.
`findAll()` takes none.

So `GET /api/box/admin-stats` returns `activeMembers` and `expiringPlans` counted **across every box
on the platform**. Two consequences, and the second is the one that matters:

1. A box admin learns the platform's aggregate size. An information leak, not a data breach — counts,
   no PII.
2. **The gym owner's single most-looked-at number is simply wrong**, and wrong in a direction that
   flatters. It has read as plausible because the platform has had few boxes.

This is the exact shape `docs/TENANCY.md` §1 warns about, with the twist that `@TenantId` was never
there to save it: the entity is deliberately un-discriminated so the box switcher can read a person's
memberships across boxes, and the safety therefore has to live in every query. `findAll()` has no
safety at all.

Found while auditing the only existing stats surface. **Fixed in `M39`** — it is a cross-tenant
correctness bug on precisely the surface this brief is about, and leaving a known live one open while
rewriting its neighbours would be indefensible.

**D-2 — `SlotRegenerationService.regenerateFrom` can delete sessions nothing refills. Latent.**

The delete is unbounded backwards (`findByScheduleSlotIdAndStartAtGreaterThanEqual`) while the
recreate floors at today (`box/SessionGenerator.java:76,80`). A past `from` therefore deletes sessions
between `from` and today and never refills them. Its blocking check inspects only `bookings.status`,
so a session carrying scores but no live booking is not protected.

**No controller calls it** — grep finds only javadoc and two tests. So this is latent, not live. It
becomes live the moment a schedule-edit flow wires it in, which is `M14b`. Recorded here so `M14b`
reads it first.

### One rule that costs nothing and is easy to get wrong

**Every date grouping is in the box's timezone, not UTC.** `boxes.timezone` exists and defaults to
`Europe/Rome`. "Attendance by weekday" and "revenue by month" computed in UTC will misfile the
early-morning and late-evening classes that a CrossFit box is *made of* — the 6am and the 20:30.
No migration; just never write `date_trunc('day', start_at)` without the timezone.

---

## 3. Defining "revenue"

There is no revenue number in the product today. `AdminStatsController` returns
`(activeMembers, weekAttendance, expiringPlans)` and its javadoc still says full analytics is
"milestone M8". No aggregate over money exists anywhere — a repo-wide grep for SQL `SUM(` returns
nothing. **Whatever ships first is the first such number a gym owner will ever see**, and there is no
prior version to be consistent with. That is the opportunity and the risk.

### The definition

> **Revenue for a box, over a window, is the sum of `payment.amount_cents` for rows that are
> `SUCCEEDED`, whose `payee_membership_id` is null, whose `settled_at` falls in the window, in the
> box's own currency — less refunds settled in the same window.**

Every clause is there because dropping it produces a specific wrong number:

| Clause | Dropping it means |
|---|---|
| `SUCCEEDED` only | `PENDING` counts money that may never arrive; `FAILED` counts money that never did |
| `payee_membership_id IS NULL` | coach PT and drop-in money is booked as the gym's (M-8) |
| `settled_at`, not `created_at` | delayed-settlement payments land in the wrong month (M-2) |
| one currency | euro cents added to dollar cents (M-5) |
| less refunds | the number is gross for ever and can only overstate (M-3) |

**Two of those five clauses cannot be written today.** `settled_at` and refunds are migrations M-2
and M-3. Until they land, any revenue figure is *gross, cash-basis, attributed to checkout date* —
which is a defensible thing to ship, **but only if it is labelled as that on the screen**, not
labelled "Revenue" and quietly meaning something narrower.

### Comped is not zero revenue — it is not revenue

A comped subscription carries no `payment` row at all, so it contributes nothing to the sum. That is
arithmetically right and analytically misleading, because a comp is invisible in exactly the same way
a member who has never been billed is invisible.

**Rule:** every revenue surface that shows a member count alongside money must split the count into
**paying / comped / unpaid**, from M-4's explicit flag. ARM in particular:

> **ARM = net revenue ÷ paying members.** Not ÷ all members.

Dividing by all members lets a box improve its ARM by cancelling comps, which is a metric telling an
owner to do something stupid. Show the comped count next to it so the dilution stays visible.

### Subscriptions are not evidence of payment

`subscription.price_cents` is the **agreed** price, not money received. An invite accepted with a
plan creates an `ACTIVE` subscription at full list price and writes no payment row — the code says so
in a comment: *"No Payment row — they haven't paid."* (`box/InvitePublicController.java:65`).

**Rule: revenue never reads `subscription`.** It reads `payment`. `subscription` answers "what should
they be paying", which is a different, also-useful question — and the gap between the two is the
**outstanding** figure a box owner genuinely wants. Name it *Outstanding*, never fold it into revenue.

### Discounts are real and unstructured

`price_cents` may legitimately differ from `plans.price_cents` — the controller documents it as *"a
negotiated discount, not an error"* (`box/SubscriptionController.java:69-70`), and the seeder ships a
`"Founding member rate"` at 7000 against a list price of 8900. The only record of *why* is the free
text `price_note`.

So "discounting" is reportable in aggregate (`list_price_cents` vs `amount_cents` on the payment) and
**not** reportable by reason. That is acceptable; do not build a chart that implies otherwise.

### Accrual is out of scope for v1.0

Deferred revenue and MRR need M-7's period columns and a recognition schedule. A pilot box that is
not being billed does not need them, and Two-Brain's ARM is a cash metric. **v1.0 ships cash-basis
revenue only, and says so.** M-7 is therefore recorded as advisable, not required — but it stays on
the list because adding period columns to a table with rows in it is harder than adding them now.

---

## 4. The categorical chart palette

This section is the one nothing else owns. `M17c` needs it and must not improvise one.

### Volt is not slot 1, and charts get no volt at all

`--volt` means live / now / primary / winning, and since M23 **the box switcher's mark is the shell's
one volt element, on every screen**. A screen rendered inside a shell starts with its volt budget
already spent, and analytics screens are plumbing — they are not on the hero list.

**Therefore charts on analytics screens use no volt.** This is a derivation from the existing ruling,
not a new one. It also disposes of the tempting question "is volt series 1?": a series colour is
identity, volt is emphasis, and a palette whose first slot means *winning* would tell the reader
series 1 is the good one.

The measurement agrees. Running the four existing rxed hues as a four-series palette **fails**:

```
$ validate_palette.js "#dfff4e,#3fcf8e,#f0883e,#e5484d" --mode dark --surface "#151a16"
  [FAIL] Lightness band       outside band: volt L=0.946, good L=0.763, warn L=0.727
  [FAIL] Normal-vision floor  worst adjacent #e5484d↔#f0883e ΔE 14.1 — below 15
  → FAILED
```

Volt at `L 0.946` is a highlighter, not a series colour, and `--warn` and `--danger` are not
distinguishable enough from each other to be two series. The five-series-in-volt/green/orange/red
chart this brief exists to prevent is not merely semantically wrong; it fails the gate.

### The geometry: rxed's reserved hues own the warm half of the wheel

Measured in OKLCH:

| Token | Hex | L | C | Hue |
|---|---|---|---|---|
| `--danger` | `#e5484d` | 0.626 | 0.193 | **23°** |
| `--warn` | `#f0883e` | 0.727 | 0.153 | **53°** |
| `--volt` | `#dfff4e` | 0.946 | 0.196 | **119°** |
| `--good` | `#3fcf8e` | 0.763 | 0.154 | **159°** |

Excluding ±25° around the three semantic hues and ±45° around volt — volt gets the wider berth
because a mustard or olive series next to it reads as a weak accent, which is exactly the failure the
design law warns about — leaves the free arc **184°–358°**.

**The consequence is structural and worth stating plainly: rxed's categorical palette is cool-only.**
Teal through cyan, blue, indigo, violet, magenta, rose. There is no warm series colour available and
there cannot be one, because warmth is spoken for. This is a feature — a chart in this palette can
never be mistaken for a status — but nobody should discover it by trying and failing.

### The palette

Six slots. Derived by search over the free arc under a chroma cap of 0.19 (no series may out-shout
volt, whose C is 0.196), selected on **all-pairs** separation and then ordered for adjacent
separation.

| Token | Hex | Name | L / C / hue | On `--surface` |
|---|---|---|---|---|
| `--cat-1` | `#7550d1` | indigo | 0.54 / 0.19 / 292° | 3.21:1 |
| `--cat-2` | `#1fa89c` | teal | 0.66 / 0.11 / 186° | 5.99:1 |
| `--cat-3` | `#bc2b72` | rose | 0.54 / 0.19 / 356° | 3.13:1 |
| `--cat-4` | `#3293fc` | azure | 0.66 / 0.18 / 254° | 5.64:1 |
| `--cat-5` | `#07719f` | deep cyan | 0.52 / 0.11 / 236° | 3.25:1 |
| `--cat-6` | `#c962d3` | orchid | 0.66 / 0.19 / 324° | 5.18:1 |

Validator output, reproduced so it is not re-derived:

```
$ validate_palette.js "#7550d1,#1fa89c,#bc2b72,#3293fc,#07719f,#c962d3" --mode dark --surface "#151a16"
  [PASS] Lightness band        all 6 inside L 0.48–0.67
  [PASS] Chroma floor          all 6 >= 0.1
  [PASS] CVD separation        worst adjacent  #c962d3↔#07719f ΔE 8.7 (protan)
  [PASS] Normal-vision floor   worst adjacent  #07719f↔#3293fc ΔE 16.3
  [PASS] Contrast vs surface   all 6 >= 3:1
  --pairs all
  [PASS] CVD separation        worst all-pairs #c962d3↔#1fa89c ΔE 8.3 (deutan) · tritan 3.5
  [PASS] Normal-vision floor   worst all-pairs #07719f↔#7550d1 ΔE 15.8
```

Every slot also clears 3:1 against `--ground` (`#0d110e`), so a chart may sit on the page background
as well as on a card.

**Three honest caveats, because a palette presented as clean is a palette nobody re-checks:**

1. **Six is the ceiling, and it clears by a thin margin** — all-pairs CVD 8.3 against a target of 8.0,
   normal-vision 15.8 against a floor of 15. Seven slots fails outright. **A seventh series folds into
   "Other", facets into small multiples, or the chart is the wrong form.** Never generate a hue.
2. **`--cat-2` (teal) and `--cat-4` (azure) collapse under tritanopia** (ΔE 3.5) — blue-versus-green
   is exactly what tritanopia confuses. `--cat-1`/`--cat-5` are next at 7.8. Tritan is reported by
   the validator, not gated, and it is rare — but do not put either pair adjacent in a stacked bar
   without direct labels.

   > Read the validator's output carefully: it **names** the worst protan/deutan pair and then
   > reports the minimum tritan across *all* pairs **unnamed**. Attributing that tritan number to
   > the named pair is wrong, and this brief did exactly that before the arithmetic was re-run.
3. **`--cat-2` sits near the chroma floor** (C 0.11) and is only ΔE 10.8 from `--faint`, the muted
   text token. As a fill or a 2px line it is fine; as a 1px hairline beside axis labels it will read
   as grey. The gamut at 186° does not permit more chroma inside the lightness band.

### Rules of use

- **Assign in fixed order, never cycled.** Colour follows the entity, never its rank — a filter that
  drops series 2 must not repaint series 3.
- **Status keeps its own colours.** When a series *means* good/bad — pass rate, no-shows, failures —
  it wears `--good`/`--warn`/`--danger`, never a `--cat-*`. When it is just "series 4" it wears
  `--cat-4`. Never both in one chart.
- **Never a dual-axis chart.** Two measures of different scale are two charts.
- **Text wears text tokens** (`--bone`, `--bone-dim`, `--faint`), never the series colour. The mark
  beside the label carries identity.
- **A legend is always present for ≥2 series**; ≤4 series are also direct-labelled, so identity is
  never colour-alone. One series needs no legend — the title names it.
- **Sequential is one hue, light to dark; diverging is two hues with a neutral grey midpoint.** Never
  a rainbow, never a hue at the midpoint. Both are separate from these six.
- **Tokens only.** These six go in `frontend/src/styles/_tokens.scss` like everything else. A raw hex
  in a chart component is the same bug it has always been.

---

## 5. What this brief forces

**Migrations, in the order they should land.** All are cheap now.

| | Change | Unblocks |
|---|---|---|
| M-1 | `membership_event` append-only table | LEG, churn, at-risk (`M15a`) |
| M-2 | `payment.settled_at` | correct revenue-by-month (`M16d`, `M18`) |
| M-3 | `refund` table + `charge.refunded` in the webhook | net revenue (`M16d`, `M16c`) |
| M-4 | `subscription.kind` (`PAID`/`COMPED`/`TRIAL`) | ARM's denominator; `M32a`'s trial board |
| M-5 | `boxes.currency`, plans validated against it | any safe `SUM` |
| M-6 | `class_sessions.ran_by_membership_id` | payroll (`M16d`), coach hours |
| M-7 | `payment.period_start` / `period_end` *(advisable)* | accrual / MRR, if ever wanted |

**Rules, binding from now:** revenue filters `payee_membership_id IS NULL` (M-8); revenue never reads
`subscription` (§3); analytics never trusts `lift_entry.is_pr` (M-9); every date grouping uses the
box's timezone (§2); charts on analytics screens use no volt and only `--cat-1..6` (§4).

**Filed to the backlog, needing a decision rather than a quiet fix:** D-1, the score-destroying
programming edit.

## Out of scope

The custom report builder (v1.1 per the pilot programme), accrual accounting, cohort retention curves,
and any predictive or AI-derived metric. Exports beyond what a screen shows are `M33`'s neighbour, not
this brief's.

## Decisions taken, 2026-08-27

All three were put to the user and ruled the same day the brief was written. They are recorded here
so they are not re-argued.

1. **D-1 is fixed now, as a defect.** Not folded into `M14c-a`. The reasoning that decided it: a
   guard is small, `M14c-a` is three milestones away (`M29a`, `M29b` and `M14b` come first), and
   folding would leave a live data-loss path open across that whole interval — on the one kind of
   data `M33` names as *the real switching cost for a CrossFit box*.
2. **The six migrations land as ONE pass, now, before `M29a`.** The argument that decided it: two of
   the six only ever capture data **going forward**. `membership_event` and `payment.settled_at`
   cannot be backfilled — an event nobody recorded is unrecoverable — so every day they do not exist
   is a day of LEG, churn and settlement history permanently lost. The other four gain nothing from
   being early, but they cost one Flyway pass and one test sweep instead of four. This restores
   Phase 1's own rule: *migrations are one-way, so they go first.*
3. **Athlete analytics are scoped to the current box.** Not aggregated across the person. It matches
   the data model exactly — `lift_entry` and `wod_score` hang off `membership`, which is box-scoped —
   and it needs no cross-tenant read, which `docs/TENANCY.md` reserves for platform jobs via
   `runAsRoot` and forbids on a thread serving a user.

   **The cost is real and deferred, so it is recorded rather than implied:** change gym and your PR
   history stops following you. **Re-open trigger** — a real athlete holds memberships in two gyms
   at once, or `M33`'s import needs to attach history to a *person* rather than to a membership.
   Until then, per-box is the answer and `M17c` should not re-litigate it.

These three decisions create **`M39` — analytics foundations**, which is the implementation of this
brief and is scheduled immediately after it, before `M29a`.

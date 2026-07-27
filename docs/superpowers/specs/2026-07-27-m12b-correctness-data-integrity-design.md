# M12b — Correctness & data integrity

**Date:** 2026-07-27
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** Flyway **V16** — one migration, two changes.

## Why this milestone exists

Ten small defects that are invisible from the outside and cheap to fix now. They run before the UX
rework because none of them ships a screen — fixing them after M12 would mean re-testing surfaces
that had just been rebuilt, and two of them (the owner who cannot book, the invite that produces an
unbookable member) are first-run experience bugs that a redesign would otherwise inherit.

M12a made the gates trustworthy, so a test written here that goes green means something.

## Scope: 3 of the 13 backlog items are deliberately NOT here

Reading the M12b backlog section as a whole, three items are not small correctness fixes:

- **Instance-builder creates new `wod` rows on every edited re-save.** The fix is dedupe or
  update-in-place — a design change to the builder's save model. **M12 owns that screen**; doing it
  here means building it twice.
- **Types-page fan-out partial failure.** The backlog's own suggested fix is *"move class type to a
  first-class entity"* — a schema refactor, not a bug fix. **Deferred to M15.**
- **`Membership.role`/`status` as plain Strings rather than enums.** Churn across many files, the DB
  already check-constrains both values, and behaviour does not change. **YAGNI — retired to
  Accepted.**

The remaining **ten** are genuinely small, invisible and backend-only.

## Decisions (locked in brainstorm)

| Question | Decision |
|---|---|
| Self-serve owner cannot book their own classes | **Auto-comp subscription at signup.** Keeps ONE entitlement rule — always "is there an active subscription" — instead of adding a role-based branch to the booking engine. |
| Old receipts with no stored list price | **Leave NULL, omit the discount line.** We genuinely do not know what the list price was; inventing one replaces a computed error with a stored, unfalsifiable one. |
| `checkout.session.async_payment_failed` | **Mark FAILED and email the member.** They attempted payment and it bounced; without a notice they sit believing they are subscribed until a booking fails. |
| Scope | **Ten items.** The three above move to M12 / M15 / Accepted. |

## 1. Flyway V16 — one migration, two changes

- **`DROP memberships.expires_at`.** Dead since M10 moved expiry to `subscription.current_period_end`.
  All three reading surfaces were repointed then; only the column survived, because dropping it needed
  a migration and M10 was V14-only.
- **`ADD payment.list_price_cents int NULL`.** Nullable on purpose — see §3.

## 2. The comp-subscription shape (a constraint that changed the design)

`subscription.plan_id` is **NOT NULL with an FK to `plans`** (V14 line 14). A subscription therefore
cannot be plan-less, which rules out the obvious "just create a subscription with no plan".

**The codebase already solved this.** V14's grandfather migration created a **per-box synthetic plan**
— named `Grandfathered`, `archived = true`, `price_cents = 0`, `entitlement = UNLIMITED`,
`current_period_end = null` — so grandfathered subscriptions had something to point at, and
`archived = true` keeps it out of the admin's plans list.

**M12b reuses that pattern** with a distinctly-named `Comped` plan (not reusing `Grandfathered`, so
the two reasons stay separable in any later reporting), created lazily per box on first need:

- **Self-serve owner** (`BoxSignupTx`): the owner's BOX_ADMIN membership gets an ACTIVE, no-expiry
  subscription on the box's `Comped` plan.
- **Plan-less invite accept**: same treatment. A box that chooses "No plan (bill manually)" is billing
  offline, so that member should be bookable — today they are not.

Both routes end in the same place as invite-with-plan and as V14's grandfathering: an active
subscription the entitlement gate can read. No new concept, no schema change, no role-based exception.

## 3. Receipts snapshot the list price

`PaymentReceipts` computes the discount against the plan's **current** list price, so re-opening an old
receipt after a price change shows a discount that was never given — on a document a member may treat
as financial evidence.

The list price is snapshotted onto the Payment row at creation. For rows that predate this, the column
is NULL and **the receipt omits the discount line entirely** rather than computing one. A receipt that
says less is better than a receipt that says something false.

## 4. Failed delayed payments

`checkout.session.async_payment_failed` is currently unhandled, so a bounced SEPA/bank-transfer payment
leaves its Payment row PENDING forever. Nothing is granted, so this is safe — but the row never
resolves and the member is never told.

The webhook handles the event: the Payment row moves PENDING → FAILED, and the member is emailed that
the payment did not go through. **The mail fires strictly after commit**, per the standing house rule —
a mail sent inside a transaction that rolls back is a lie. Idempotent on replay, like every other
webhook path: a row already FAILED is a no-op.

## 5. Tenancy and validation

- **Member patch accepts an unknown or foreign `planId` unchecked.** The FK only requires the plan to
  exist, so another box's plan persists and renders `planName` null. Validate tenant-scoped, exactly as
  invite-create already does.
- **Box timezone is not validated** on create or settings-patch, so arbitrary strings persist. Low
  severity (admins are trusted) but it is a one-line guard against a value that silently breaks every
  date calculation for that box.
- **`checkin`/`uncheck`/`no-show` return 500, not 400**, when the body carries no `bookingId`
  (`BookingIdRequest` has no `@NotNull` and the params are not `@Valid`, so `bookings.findById(null)`
  throws). Authorization runs first, so this is malformed-input handling, not a security hole.

## 6. Append-only, enforced by the type

`SuperadminAuditRepository` extends `JpaRepository`, inheriting `delete()`, `deleteAll()` and `save()`.
The audit log's append-only property is therefore a comment asking people not to call them. Extend
`Repository<>` and declare only the finder plus the single write the code actually needs, so the
guarantee is structural. M11 shipped this knowingly and logged it; this closes it.

## 7. Testing and done criteria

Every fix carries a test that **fails against the current code** — the M12a bar, and the reason M12a
came first.

Three deserve more than a status-code assertion:

- **The owner test must prove the owner can BOOK**, not merely that a subscription row exists. The row
  is the mechanism; being able to book is the requirement.
- **The receipt test must prove a NULL-list-price row renders WITHOUT a discount line**, not just that
  the column is nullable. The omission is the fix.
- **The failed-payment test must prove idempotency** — a replayed `async_payment_failed` changes
  nothing further and does not send a second email.

**Done** = all ten items fixed with failing-first tests; V16 applied; backend suite green with no
skips; e2e green at `retries: 0` on a fresh stack; the M12b section of `docs/BACKLOG.md` emptied, with
the three descoped items moved to their new homes.

## Out of scope

- The three descoped items (§Scope).
- Any UI redesign. Where a fix needs a frontend change (the receipt's discount line, an error message
  for the new 400s), it is the **minimum** change to match the backend — M12 owns how these screens look.
- Payment state modelling beyond adding FAILED. Proration, refunds and grace periods are M16.

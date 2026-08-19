# M22 Task 7 — finding recorded before implementing (orchestrator, 2026-08-19)

The plan's Task 7 assumes an `AccountService` API it never read. The real one:

- `anonymize(UUID userId, String password)` — **two args**, not one. The plan's test calls
  `accountService.anonymize(coach)`; that does not compile.
- `export(UUID userId)` returns `Map<String, Object>` — `.toString()` works, so the secret-redaction
  assertion is usable as written.
- Export delegates box/performance data through the `PerformanceQueries` port
  (`bookingsOf` / `scoresOf` / `liftsOf`), not through repositories injected into `identity`.
  New M22 export data from the `box` and `performance` packages goes through that port too.
- Anonymise scrubs the **user row in place** and never deletes it (membership cascades would take
  the box's whole class history with it). Posts, likes and ratings therefore need **no new code** to
  be "anonymised, not deleted" — they point at the scrubbed user, exactly like bookings/scores/lifts.
  The only additions are the four coach-owned deletes (profile, stripe, availability, time off).

## The one that is not a plan defect but a possible product bug

`AccountService.export` reads bookings via `PerformanceQueries.bookingsOf` →
`BookingRepository.findByMembershipId`, a **derived query on a `@TenantId` entity**, called from
`GET /api/me/export` — a **boxless** session (`scope=user`, no `box_id` claim).

Since M21 a tenant-less read of a `@TenantId` entity fails **CLOSED**: it resolves `NO_TENANT` and
returns **empty**. So the GDPR export's `bookings` array may be silently empty in production, and
`docs/TENANCY.md` §6 does not list this method as native.

This is `docs/TENANCY.md` §4 exactly: "A plain derived or JPQL read of a `@TenantId` entity from a
boxless path is a bug. Since M21 it returns empty rather than leaking, but it is still a bug — and
the empty result is the symptom."

**Not yet verified** — needs a two-box export test to confirm before anything is changed. If
confirmed it is an M21 regression in scope for M22 (Task 7 touches this exact code path), and the
fix is a registered native query added to `docs/TENANCY.md` §6. If the export is already covered by
a passing test that seeds bookings, check whether that test runs under `actAsBox` — that is the
`SessionApiTest#sweepFlipsPastBookedToNoShow` failure shape, and it would mean the test cannot fail.

---

# T3 negative control — weaker than the plan claimed (orchestrator note, 2026-08-19)

`CoachProfileTenancyTest`'s stated mutation is "adding `@TenantId` to `coach_profile`". The measured
control did go red, but by **refusing to boot**: Hibernate rejects `@TenantId` on a field that is
also `@Id`, and `coach_profile`'s PK *is* `user_id`. So what was proved is "you cannot annotate that
field", not "the read is tenant-filtered".

Consequence, stated rather than papered over: with no discriminator anywhere on these tables,
`aCoachProfileAndCalendarReadIdenticallyFromEitherBox` passes **trivially** — nothing filters, so
reading from box B was never going to fail. It does not currently pin what its name claims.

**The control that would actually pin it** (not yet run — deferred at a usage checkpoint):
annotate `CoachAvailability.userId` with `@TenantId`. That entity has a surrogate `@Id`, so Hibernate
boots and genuinely filters, and the
`availability.findByUserIdOrderByWeekdayAscStartTimeAsc(coach)).hasSize(1)` assertion should go red
(0 rows) — or fail at save with the assigned-tenant-differs violation. Run it before Task 8 signs the
milestone off, and if it does NOT go red, the test needs rewriting, not counting.

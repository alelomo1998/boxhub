# Continue **rxed** — start **M22, new-domain schema**. It is specced and planned; begin at Task 1.

Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker Compose behind nginx, GitHub
`alelomo1998/boxhub` private.

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if a
> superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one entry.
> Milestone work is a feature branch in this directory, merged to `main` at the end.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m22-new-domain-schema
```

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **The plan:** `docs/superpowers/plans/2026-08-19-m22-new-domain-schema.md` — eight tasks, each with
   exact SQL, exact entity code, exact test code, exact gate commands and the mutation every test must
   catch. **This is what you execute.**
3. **The spec it argues from:** `docs/superpowers/specs/2026-08-19-m22-new-domain-schema-design.md` —
   14 decisions (`D1`–`D14`) with the reasoning that makes them reviewable.
4. **`docs/TENANCY.md`** — rewritten in M21 and the authority. §2 (fail-closed), §4 (the boxless
   contract and the three sanctioned cross-box routes) and §6 (the native-method table) are the ones
   M22 leans on.
5. **`docs/PREFLIGHT.md`** at its four moments, and **`docs/HANDOFF.md`** for the gotcha list.

## State

**M21 is merged and CI is green** (`8b4fa73`). `main` is clean, no open branch. Tenant-less reads fail
**closed**; cross-box visibility is `TenantContext.runAsRoot`, jobs only, sole caller
`BookingMaintenance`; `/api/box/**` carries the `X-Box-Id` staleness guard.

**M22 is specced and planned. No code, no branch, no migration.** V22 is still free.

**Baseline to hold:** backend `Tests run: 494, Failures: 0, Errors: 0`. Karma **412**, e2e **64 passed
+ 1 skipped**, `visual.sh` **31 specs, zero dirty baselines** — the frontend is untouched by this
milestone, so any movement there means scope leaked.

## What M22 is

The tables Phase 2 needs, cut before any screen exists to bias them. **Phase 1's rule holds: schema,
domain model and tenancy. No endpoints, no DTOs, no screens.** Eight tasks, six migrations V22–V27:

| # | Task | Migration | Owner |
|---|---|---|---|
| 1 | Box public profile, location, directory indexes | V22 | executor |
| 2 | Rooms + the `room_id` axis on slots and sessions | V23 | executor |
| 3 | Coach profile, availability, time off, payout account | V24 | executor |
| 4 | PT booking | V25 | executor |
| 5 | Drop-in on `bookings` + the payment spine | V26 | **ORCHESTRATOR** |
| 6 | Social posts, likes, workout ratings | V27 | executor |
| 7 | GDPR export + anonymising delete | — | executor |
| 8 | Docs, gates, merge | — | ORCHESTRATOR |

Tasks 1, 2, 3 and 6 are independent. Tasks 4 → 5 → 7 → 8 are strictly ordered (`room` before
`pt_booking`; `pt_booking` before `payment.pt_booking_id`).

## The four things that will bite, named in advance

1. **A drop-in is a row in `bookings`, never its own table.** Capacity is enforced by ONE count,
   `bookings.countBySessionIdAndStatus(sessionId, "BOOKED")` at `BookingService.java:58`. A separate
   table makes that count silently stop seeing visitors and **a class can be oversold**. This is Task 5
   and it is orchestrator work for that reason.
2. **The tenancy rule has two halves and the second is what stops a leak.** The directory lists MANY
   boxes, and a `@TenantId` table cannot serve that (`runAsBox` is one box, `runAsRoot` is forbidden on
   a request thread) — so wholly-public tables drop the discriminator. But **drop it only when the
   WHOLE table is public.** `box_photo` qualifies; `post` does not, because it holds both `PUBLIC` and
   `BOX` rows and one missed predicate leaks private content.
3. **Coach tables are keyed on the USER, not the box** — one profile, one calendar, one Stripe account
   per person. Tenant-scoping them makes a coach's profile vanish on box switch, which is TENANCY.md
   failure mode 1. `payment.payee_membership_id` is deliberately a *membership* ("who is owed in this
   box's context") while `coach_stripe` is keyed on the *user*. Two questions, two scopes.
4. **Task 7 has a named unknown with a stop instruction.** Its test code references `AccountService`'s
   export/anonymise API, which the plan's author did not read. The task tells the executor to read it
   first and **escalate rather than invent a fixture**. Honour that.

## Decisions already made — do NOT re-derive or re-open them

All 14 are in spec §2 with reasoning. The ones most likely to be second-guessed:

- **Drop-in → the BOX. PT → the COACH**, and the PT payee is a **per-coach choice** with coach-direct
  the default (`coach_profile.payee`, one column).
- **No credits, no prepaid balance.** Payment attaches to the booking. A credit would make rxed the
  authoritative record of a **liability** — the box owes this person a class — and rxed has never been
  in the money flow. "Paid but didn't come" is already modelled: `NO_SHOW` plus M14a's recorded
  cancellation.
- **A paying visitor never joins the waitlist** (`ck_visitor_not_waitlist`), for the same reason: it
  never creates money owed back.
- **PT consumes no class capacity but IS located in a room** (`pt_booking.room_id`), so the admin
  calendar can show it. Collision detection is M14b's.
- **A coach works at ONE box for now** (D14), but the schema is multi-box-ready, so enabling it later
  needs **no migration** — only the cross-box availability read, which is M26's.
- **No PostGIS.** Plain `lat`/`lng`; the db image is `postgres:16-alpine` and changing it changes the
  VPS deploy and the backup drill.

## The rule this programme keeps relearning

**Run the negative control on every test: break the implementation, watch it go red, revert.** Every
task in the plan specifies its mutation. M21 exists because
`SessionApiTest#sweepFlipsPastBookedToNoShow` **could not fail** — it ran under `actAsBox(boxA)` while
the sweep runs tenant-less, and with the sweep genuinely broken it still reported `Tests run: 1,
Failures: 0`. Green since M2, over a job that would have silently stopped working in every box.
**If you cannot name the mutation a test catches, say so instead of counting it as coverage.**

A schema milestone has one extra gate that matters more than the rest: **the migration chain must
replay from empty.** Task 8's `docker compose down -v` then `up --build` is that proof — the backend
coming up healthy means V1→V27 applied to a blank database, not just as a delta on yours.

## Traps that have already cost time

- **cwd does not persist between commands.** A gate reporting `exit=1` was Maven failing to find a POM
  in the directory a previous command left behind. **Absolute paths in every gate command.**
- **Maven's `-Dtest=` separator is a comma, not a plus.** `-Dtest='A+B'` fails with "No tests matching
  pattern", which reads exactly like a code failure.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **CI runs on `push: main` and `pull_request` only.** Pushing the branch starts nothing. The user's
  standing choice (made at M21) is **merge to `main`, then read the run there.**
- **`README.md` is edited in a separate opencode session.** Do not touch it; if it looks half-reverted,
  ask before restoring anything.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work — Task 5 (capacity + money) and Task 8 are
orchestrator work by name — or trivial glue. Executors and reviewers are **Sonnet**. Executors never
guess: blocked, ambiguous, or plan-conflicts-with-reality goes back to the orchestrator. In M21 a plan
spec was simply wrong (it called `expectOne` twice on one URL and never flushed); catching that was the
orchestrator's job, not the executor's.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only. M22 adds no routes, so it
should need no edits at all. If it goes red, that is a finding to investigate, not a line to adjust.

## After M22

Phase 1 closes. **M13f opens Phase 2.** Order is `M13f → M23 → M14b → M14c → M17 → M24 → M25 → M26`.
**Milestone numbers are allocation labels, not a sequence** — read the order from `docs/HANDOFF.md` or
`docs/ROADMAP-AT-A-GLANCE.md`, never from the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

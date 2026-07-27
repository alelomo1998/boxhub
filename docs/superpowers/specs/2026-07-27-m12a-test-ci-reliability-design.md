# M12a — Test & CI reliability

**Date:** 2026-07-27
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** none. This milestone adds no schema and no routes.

## Why this milestone exists

M11 was merged with every local gate green, and CI immediately failed on three defects the local
gates structurally could not see:

1. Two superadmin-console specs left an unflushed `GET /api/admin/audit`. Karma does not complete
   on the dev machine in a usable time, so those surfaces were verified with `tsc --noEmit` alone —
   and `tsc` is blind to an unflushed `HttpTestingController` expectation.
2. `BoxSignupTest` returned `200 {"full":true}` instead of `201`, because the shared Testcontainer
   accumulates boxes and the suite crossed the 100-box signup cap. Only CI trips it, because
   surefire's class order differs there.
3. `SubscriptionServiceTest` compared an in-memory `Instant` against a value round-tripped through
   Postgres. Linux clocks carry nanoseconds, `timestamptz` stores microseconds. **This had been
   failing CI since M10's own push, unnoticed for six days**, while `docs/HANDOFF.md` claimed "CI
   green on push".

Separately, `e2e/tests/runner.spec.ts` failed three times across two dependency PRs that touch
nothing near its code path, and passed on re-run each time.

The pattern is the point. A suite that goes green locally and red on CI, plus a spec that cries
wolf, teaches everyone to re-run a red pipeline without reading it — which is exactly the habit
that let a real failure sit unexamined for six days. **Until a red build means something, every
later milestone is guessing.** That is why this runs before M12b, M12c and the UX rework.

## Success criterion

**The full e2e suite passes with `retries: 0`, and the committed config ships that way.**

One criterion, objectively checkable. `retries: 1` is load-bearing today — `docs/BACKLOG.md`
records that login/admin-panel/invite specs fail at `--retries=0` and pass with retries — so
removing it is precisely the proof that the underlying isolation problem is gone. It also converts
every future flake from a silent retry into a red build.

## Decisions (locked in brainstorm)

| Question | Decision |
|---|---|
| How far does e2e isolation go? | **Per-run unique data.** Every spec that writes stamps its data with a run id. `workers: 1` stays. |
| Parallel workers? | **No.** Out of scope. Raising workers turns every remaining shared-state assumption into a live race; that is its own milestone if it is ever worth it. |
| DB snapshot/restore per spec? | **No.** New tooling for CI and local, real time cost per spec file, and the run-id pattern solves the actual observed problem. |
| Success bar | **Green at `retries: 0`**, verified across three consecutive fresh-stack runs plus CI. |
| The two hard coverage gaps | **Bounded attempt.** If the test cannot discriminate a broken implementation from a working one, it does not ship — the item moves to Accepted with the reason written down. |
| The SSE flake | **Diagnose, then bound.** Make the test honest regardless; if measurement shows a real delivery problem, record and schedule it, do not fix it here. |

## 1. e2e isolation — the run-id pattern

The suite shares one seeded backend. Specs that write fixed-name data therefore compete with
previous runs and with each other. `runner.spec` creates a TV named `"Runner TV"` and `tv.spec`
creates `"E2E TV"`; both accumulate forever, which is why the backlog records them as passing
"only on a fresh stack".

`memberships.spec` already solved this for itself: a `Date.now()` stamp and a freshly-invited
athlete per run, adopted after a first draft broke on retry against a static seeded account.

**Generalise that pattern.** Introduce `e2e/tests/_support.ts` exporting:

- `runId()` — a stable-per-process suffix used to stamp every written entity.
- `login(page, email)` — currently copy-pasted verbatim into at least three spec files.

Then every spec that creates data stamps it: `` `Runner TV ${runId()}` ``, class names, invited
emails. This is deliberately not a framework; it is one small module removing a duplication that
already exists.

**Explicitly:** seeded read-only fixtures (the demo box, `admin@demo.io`, the seeded weekly
schedule) stay shared. The rule is about data a spec **creates**, not data it reads.

## 2. The `runner.spec` SSE flake

The failing assertion is `expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 15000 })` at line
50 — the TV's giant clock, which appears only after an SSE push carrying the timer state lands.
Asserting on the rendered element conflates three separable things: the coach's ARM request
succeeded, the SSE frame arrived, and the component rendered.

**Two parts, in order.**

**2a — Diagnose.** Measure how long the push actually takes on CI, by capturing the interval
between the ARM response and the frame arriving. This is a measurement, not a fix.

**2b — Make the test honest.** The TV surfaces its stream state (a `data-testid` reflecting that a
timer frame was received), and the spec asserts on that *before* asserting the clock renders. A
failure then says which half broke instead of only "element not found".

**The adjudication, decided up front so it is not improvised later:** if 2a shows the push lands
comfortably inside budget and the failures were rendering/timing noise, 2b is the whole fix. If it
shows the push itself is genuinely slow or occasionally lost, that is a **product** finding about
SSE delivery — it gets written to `docs/BACKLOG.md` against Project 2 (which owns the board) and
scheduled, **not** fixed in this milestone. Milestone lock holds either way; the test ends up
honest either way.

## 3. Backend coverage gaps

Three are straightforward and ship as ordinary tests:

- **`TvStreamService` rejects a `scope=="box"` token.** The existing `boxTokenIsNotATvToken`
  asserts unknown-device instead — it was inherited from the plan's own test code and proves the
  wrong thing.
- **`box-settings` partial-patch branches** — timezone-only and logo-clear, currently untested
  individually.
- **The `register` concurrent-race catch path**, which has no direct test.

Two get a **bounded attempt**, with a pre-agreed exit:

- **The Google double-click race cannot self-verify that the race actually fired** — it relies on
  incidental thread scheduling.
- **`RepositoryTest` cannot detect a join-fetch regression** in `findByUserIdWithBox`.

For both: attempt a test that genuinely discriminates. The honest check is to **break the
implementation deliberately and confirm the test fails**, exactly as M11's authz sweep required of
itself. If no such test can be written within the attempt, the item moves to the Accepted section
of `docs/BACKLOG.md` with the reason recorded, and no test ships. A test that cannot fail is worse
than no test, because it is believed — M11 proved that twice, once in my own OSV scanner config
that passed while scanning nothing.

## 4. Testing and done criteria

Each piece carries the check that would catch its regression:

- **Isolation** — the suite passes **twice in a row against the same stack without a reset**. This
  is the discriminating check: it fails today for the TV specs and cannot pass unless the run-id
  work is real.
- **Flake** — three consecutive full runs at `retries: 0` on a fresh stack, plus CI green. One
  pass proves nothing about a timing flake.
- **New backend tests** — each verified to fail against a deliberately broken implementation before
  being accepted.
- **No regressions** — backend suite green throughout (390 at the start of this milestone).

**Done** = `retries: 0` committed and the suite green under it; the suite survives a same-stack
re-run; the three new backend tests written and negative-controlled; the two hard items either
tested-and-negative-controlled or moved to Accepted with reasoning; `docs/BACKLOG.md` M12a section
emptied.

## Out of scope

- **Parallel workers.** `workers: 1` stays.
- **DB snapshot/restore tooling.**
- **Any product behaviour change.** If §2a surfaces a real SSE delivery defect it is recorded and
  scheduled, not fixed here.
- **Karma's local runtime.** It takes about an hour on this machine and that is an environment
  property, not a test-quality one. CI runs the real Karma gate; the M11 lesson is already recorded
  in `docs/HANDOFF.md`.

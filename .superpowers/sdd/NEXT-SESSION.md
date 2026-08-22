# Next session — open **M28, Launch → Production**.

**M16a is merged and `main` is green.** **The roadmap was re-planned on 2026-08-22** and M28 is now
first, ahead of M23. Read `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` before anything
else — it changes what "the pilot" means.

**The headline: the pilot IS v1.0.** Not a slice — a complete, finished product the box tests in
full. A feature may be **built but idle** (Stripe ships, works and is tested; no money flows because
the pilot is free), **never absent**. Then v1.0.1 is bug fixes, v1.1.0 is what the box asks for.
Twenty milestones, one €99 tier, everything included.

**M28 has NO spec and NO plan — but its scope was already named.**
`docs/superpowers/specs/2026-07-28-m12c-production-readiness-design.md` explicitly deferred one
bullet to Launch → Production and listed it. Start with `superpowers:brainstorming` anyway: the
scope is known, the *decisions* (which SMTP provider, which monitoring, what the restore drill
proves, what the legal docs say) are not.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m28-launch-production
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch is already set in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — that file is gitignored globally, so a fresh clone needs
> it again.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/ROADMAP-AT-A-GLANCE.md`** — M23's one-line scope, and the execution order.
3. **`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — the phase M23 opens.
4. **`docs/HANDOFF.md`** — the M16a section especially, and M21's multi-box tenancy work, which is
   what makes "a person with three gyms" a real state rather than a hypothetical.
5. **`docs/TENANCY.md`** §8 and the **boxless-session contract** — M23 is *about* the boxless and
   multi-box states, so this is not background reading, it is the subject.
6. **`docs/PREFLIGHT.md`** at its four moments.

## What M28 is

The deploy. **It goes first so every milestone after it is deployable and viewable on a real device
on a real domain** — worth a great deal for the fifteen screen milestones that follow.

From M12c's deferred bullet, verbatim: TLS/HSTS, domain, firewall, SSH hardening, **Postgres backups
+ a restore drill**, secrets delivery, log retention, CI deploy on green. Plus: **real SMTP with
SPF/DKIM/DMARC**, error monitoring and uptime, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU PII),
rate limits measured against a class-opening rush, and deleting `/app/dev/components`.

**No overlap with M12c** — compose env files, OAuth nginx locations and log PII masking are done.

**Why it matters more than it looks:** "invoices and password-reset emails don't arrive" is the
loudest complaint against BOTH Wodify and PushPress. Shipping that same bug is the one unforced
error available to us, and it is a bug of *deployment*, not of code.

## State — the baseline to hold

| Gate | Value | Rule |
|---|---|---|
| Backend suite | **535 / 0 / 0** | Grows |
| Migration head | **V28** | One migration per milestone, if any |
| Karma | **419** | Grows — M23 is frontend work |
| e2e | **67 passed, 0 failed, 0 skipped** | Grows |
| `e2e/visual.sh` | **31 specs, zero dirty baselines** | Grows |
| §8.1 greps | all eight zero bytes | Stay zero |

**M28 is INFRASTRUCTURE work.** Expect the test numbers to hold, not grow — but that is not the gate
here. The gate is evidence the deploy works: a **restore drill actually performed**, mail actually
delivered to a real inbox with SPF/DKIM/DMARC passing, TLS actually graded, monitoring actually
alerting. **A checklist ticked without a measurement is not this milestone's output.**

## Settled decisions — do NOT re-litigate these

All user-stated 2026-08-22, recorded in the v1.0 programme spec:

- **Notifications are IN-APP ONLY. No email notifications.** Auth mail is separate and still needs
  M28's SMTP. Real push arrives with M27, inside v1.0.
- **Messaging is staff ↔ member 1:1, both directions, coaches included. No member↔member.**
- **Branding is logo and name only.** Colours and style stay rxed; the design law's dark-only and
  single-accent rules were considered and **not** re-opened.
- **Cut:** API access, heart-rate tracking, 24/7 door access, anything AI, per-gym website builder.
- **Deferred with triggers:** on-demand media library (reopens when rxed earns enough to upgrade the
  server), custom report builder (v1.1).
- **In v1.0 despite earlier "we don't build that":** POS/retail (M16) and lead management + campaigns
  (M32). The box must be able to test everything.

## What M16a left you

- **Eight plan limits** on `Plan` (`entriesPerDay/PerWeek/PerMonth/Total`, `cancellationsPer*`),
  NULL = unlimited, composing with AND. `plan.entitlement` and `plan.weeklyClassLimit` are **gone as
  columns** but still served as derived values.
- **The shim is debt with a named owner.** `PlanController.PlanDto`,
  `SubscriptionController.PlanSummaryDto` and `PlanController.requireWeeklyLimit` exist only to keep
  `plans.page.ts` and `membership.service.ts` working. **M14b or M17 deletes them** — if M23 happens
  to rebuild either screen, it inherits that obligation. See `docs/BACKLOG.md`.
- **A per-box cancellation policy with no UI**: `allow_late_cancel`, `late_cancel_refunds_entry`,
  `count_waitlist_cancellations`, all served and PATCHable on `/api/box/settings`, all defaulting to
  the pre-M16a behaviour. **M15 owns the settings screen for them.**
- **`CANCEL_LIMIT_REACHED` has no copy** in `book.page.ts`'s `reason()`, so a cancellation blocked by
  a plan limit renders "Something went wrong — try again." Owned by M14b/M17.

## The rules this programme keeps relearning — all three fired again in M16a

**Verify every recorded claim against current code before planning against it.** M16a's spec made
three assertions that were false: that regeneration deletes live bookings (it refuses them and
deletes only CANCELLED rows), that its late-cancel rule was reachable (`PAST_CUTOFF` made it dead
code), and that `resolveEntitlement` was pure redundancy (it guards a live screen). The plan then
added two of its own: seven tests were really eight, and `countInWeek` was called dead while
`HomeController` still uses it.

**Weight executor pushback heavily.** Two executors refused to commit around a red test or a count
mismatch, and both were right. That is the designed behaviour, not friction.

**Run the negative control on every test — it is not a formality.** One M16a mutation was a **false
negative**: the fixture sat a year ahead of `now()`, so a `now()`-anchored window contained neither
session and the test stayed green under the exact mutation it existed to catch. Only running the
mutation revealed it. **If you cannot name the mutation a test catches, say so instead of counting
it as coverage.**

**A calendar- or clock-dependent test is a coin flip.** Pin fixtures to an explicit weekday in an
explicit zone. `BookingEngineTest.nextMondayAtTen()` and `EntitlementLimitsTest`'s anchor are the
pattern to copy.

## Traps that have already cost time

- **`docker compose` lives at `docker/docker-compose.yml`, NOT the repo root.**
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **Use `mvn clean test`, not bare `mvn test`,** after reverting anything.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **cwd does not persist between commands.** Absolute paths everywhere.
- **`npm test` alone hangs** (watch mode). Always `-- --watch=false --browsers=ChromeHeadless`.
- **e2e:** `docker compose -f docker/docker-compose.yml build frontend backend`, then `up -d`, then
  `cd e2e && npx playwright test`. Rebuild the image first or you measure a stale bundle.
- **`e2e/visual.sh` runs in a Linux container** — never Playwright locally, or you compare against
  baselines your renderer never wrote.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing. Merge to
  `main`, then **wait for the run and read it**.
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work (tenancy, concurrency, money, the booking engine)
and trivial glue. Executors and reviewers are **Sonnet**. Executors never guess.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only.

**Every box-scoped endpoint gets happy + auth-denied + cross-tenant-denied tests.**

**Every FE feature ships through impeccable** (shape → build → critique ≥28/40, no open P0/P1),
**scoped to one screen at a time** — never once over the milestone at the end. Expect 3–5
look-and-adjust rounds per screen.

## NO LONGER UNOWNED

`Launch → Production` was raised unowned at three consecutive milestone closes. **It is M28, and it
is next.** Do not re-file it in the backlog.

## After M28

`M23 → M29 → M14b → M14c → M17 → analytics brief → M15 → M16 → M30 → M33 → M32 → M24 → M25 → M26 →
Project 2 (The Room) → M18 → M27 → M19 → M20 → v1.0 → pilot`.

Read the order from `docs/ROADMAP-AT-A-GLANCE.md`, never from the number. **M29, M30, M33 and M32
are new** (messaging & notifications; waivers & agreements; **data import & migration** — CSV-first
from Wodify/PushPress/Zen Planner/TeamUp/Mindbody, and the thing that collapses a box's switching
cost; growth & automation), and **Project 2 moved before the beta** — The Room is differentiator #1 and #2, and without it a box will not agree to
test.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

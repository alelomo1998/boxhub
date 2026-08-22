# Next session — open **M23, app entry & shells**.

**M16a is merged and `main` is green.** M23 is next, per `docs/ROADMAP-AT-A-GLANCE.md`
(`M23 → M14b → M14c → M17 → M24 → M25 → M26`). **Read the order from that page, never from the
milestone number.**

**M23 has NO spec and NO plan.** Start with `superpowers:brainstorming`. Do **not** jump to
`writing-plans` — that was right for M16a because its design was already settled in conversation;
it is wrong here. M23 is the first milestone of Phase 2's screen work and the roadmap says it
**ships sketches you can look at before anything is built**.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m23-app-entry-shells
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

## What M23 is, in one line

The container: what a person sees with **no gym**, with **one**, with **three**, and how they move
between them. It decides the shell every later Phase 2 screen lives inside.

## State — the baseline to hold

| Gate | Value | Rule |
|---|---|---|
| Backend suite | **535 / 0 / 0** | Grows |
| Migration head | **V28** | One migration per milestone, if any |
| Karma | **419** | Grows — M23 is frontend work |
| e2e | **67 passed, 0 failed, 0 skipped** | Grows |
| `e2e/visual.sh` | **31 specs, zero dirty baselines** | Grows |
| §8.1 greps | all eight zero bytes | Stay zero |

**M23 is FRONTEND work, so those three frontend numbers must GROW, not hold.** That is the inverse
of M16a, where freezing them was the scope test. Do not copy M16a's gate table without changing it.

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

## STILL UNOWNED — raise it again, this is the third close in a row

**`docs/BACKLOG.md`'s `Launch → Production` block belongs to no milestone.** Real SMTP plus
SPF/DKIM/DMARC (**the entire auth flow depends on mail arriving**), Postgres backups and a restore
drill, TLS/HSTS, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU PII, real money), error monitoring
and uptime (there is none), rate limits never measured against a class-opening rush, and deleting the
`/app/dev/components` gallery. **It must become a real scoped milestone before any box touches the
product.** It was raised at M13f's close and at M16a's close and is still unowned.

## After M23

`M14b → M14c → M17 → M24 → M25 → M26`. Read the order from `docs/ROADMAP-AT-A-GLANCE.md`, never from
the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

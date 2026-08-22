# Next session — open **M16a, the plan entitlement model**.

**M13f is merged and `main` is green** (`e0ce258`, plus the scheduling fix `89bb8c2`). M16a is next,
and it is **inserted before M23**.

**M16a already has a spec. It does NOT have a plan.** Start with `superpowers:writing-plans`, not
brainstorming — the design is settled and every open question was answered by the user on 2026-08-22.
Do not re-brainstorm it and do not jump to code.

**Spec:** `docs/superpowers/specs/2026-08-22-m16a-entitlement-model-design.md` — read it in full
first. It is the authority; this file only orients you.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m16a-entitlement-model
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if
> a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. If the harness blocks edits demanding isolation, the escape hatch is already set in
> `.claude/settings.local.json` (`"worktree": {"bgIsolation": "none"}`) — that file is gitignored
> globally, so a fresh clone needs it again.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **The M16a spec** (above).
3. **`docs/TENANCY.md`** — §8 especially. The new `entitlement_usage` table is `@TenantId`, and
   **since M21 a tenant-less read fails CLOSED and returns empty rather than erroring.**
4. **`docs/HANDOFF.md`** — the M13f section and the scheduling-bug lesson.
5. **`docs/PREFLIGHT.md`** at its four moments.

## What M16a is, in one paragraph

A plan carries **one** limit today: `plan.weekly_class_limit`, behind a two-value `entitlement`
string. M16a replaces that with **eight nullable limits** — entries and cancellations, each × day /
week / month / term — where NULL means unlimited, all of them compose with **AND**, and each resets
on its own period. Plus an **append-only `entitlement_usage` ledger**, because consumption cannot be
counted from `booking`. **Backend only: schema, entities, the entitlement check in `BookingService`,
tests. No screens.**

## The four things most likely to trip you

**1. The ledger exists because `regenerateFrom` DELETES booking rows.**
`SlotRegenerationService` deletes bookings for every session in a regenerated range. Counting entries
from `booking` would mean a coach editing the schedule silently changes every affected athlete's
consumed count. So `entitlement_usage.booking_id` carries **no FK** and `session_start_at` is
**copied, not joined** — a FK would either block that delete or cascade the ledger away with it.
**Write the "regeneration does not alter counts" test FIRST**; it is the entire justification for the
table, and it fails against a `booking`-derived count.

**2. `entitlement` and `weeklyClassLimit` must STAY ON THE WIRE.** The spec's first draft claimed no
frontend consumed them. **That was checked and was false** — `plans.page.ts` binds both,
`admin.service.ts` carries `weeklyClassLimit` on its DTO, four specs reference them. The columns go;
the fields are served as derived values, exactly as M14a kept `wodType` alive as
`timingPreset ?? macro`. Breaking that screen is frontend scope leakage.

**3. Late cancellation refunds nothing.** In-time cancel refunds the entry and spends a cancellation;
a late cancel spends both. `booking.was_late` is already stamped at cancel time from the cutoff in
force (V21). This was an assumption stated at design time — if the user reverses it, it becomes a
per-plan flag, not a change to the rule.

**4. Windows anchor to the SESSION being booked, not to `now`.** Booking next Tuesday counts against
next Tuesday's day and week. Anchoring to `now` lets an athlete drain the wrong week by booking ahead.

## State — the baseline to hold

| Gate | Value | Rule |
|---|---|---|
| Backend suite | **511 / 0 / 0** | Grows. Every limit gets a happy + blocked test. |
| Migration head | **V27 → V28** | Exactly one migration. |
| Karma | **419** | **MUST NOT MOVE** |
| e2e | **67 passed, 0 failed, 0 skipped** | **MUST NOT MOVE** |
| `e2e/visual.sh` | **31 specs, zero dirty baselines** | **MUST NOT MOVE** |
| §8.1 greps | all eight zero bytes | Stay zero |

**The frontend numbers not moving IS this milestone's test on itself** — M14a used exactly that check
for scope leakage and it worked.

## The rule this programme keeps relearning

**Verify every recorded claim against current code before planning against it.** In M13f, two of four
inherited defects no longer existed and the quarantined TV test had been passing since M21. **Seven
plan-vs-reality conflicts were caught by executors** in a plan written hours earlier — including one
where the plan said *Create* a spec file that already held three passing specs. And the M16a spec's
own claim about `entitlement` consumers was false. Weight executor pushback heavily; it has been
right every time.

**Run the negative control on every test: break the implementation, watch it go red, revert.** If you
cannot name the mutation a test catches, say so instead of counting it as coverage.

**And a calendar- or clock-dependent test that is green most days is not coverage, it is a coin
flip.** `SlotRegenerationTest` passed on 2026-08-20 and failed on CI on 2026-08-22 with no code
change between. Pin the condition so the failure is deterministic.

## Traps that have already cost time

- **`docker compose` lives at `docker/docker-compose.yml`, NOT the repo root.** Every invocation
  needs `-f docker/docker-compose.yml`.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **Use `mvn clean test`, not bare `mvn test`,** after reverting anything.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **cwd does not persist between commands.** Absolute paths everywhere.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing. Merge to
  `main`, then **wait for the run and read it** — M13f was reported as done before CI came back, and
  CI was red.
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work — and the entitlement check in `BookingService`
counts as delicate: it is the booking engine, under a pessimistic lock, and a wrong diff there
oversells a class. Executors and reviewers are **Sonnet**. Executors never guess.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only. M16a adds no routes, so it
should not need touching at all.

**Every box-scoped endpoint gets happy + auth-denied + cross-tenant-denied tests.**

## STILL UNOWNED — raise it again

**`docs/BACKLOG.md`'s `Launch → Production` block belongs to no milestone.** Raised at M13f's close;
still unowned. Real SMTP plus SPF/DKIM/DMARC (**the entire auth flow depends on mail arriving**),
Postgres backups and a restore drill, TLS/HSTS, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU PII,
real money), error monitoring and uptime (there is none), rate limits never measured against a
class-opening rush. **It must become a real scoped milestone before any box touches the product.**

## After M16a

`M23 → M14b → M14c → M17 → M24 → M25 → M26`. Read the order from
`docs/ROADMAP-AT-A-GLANCE.md`, never from the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

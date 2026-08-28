# Next session — **M29a messaging. M39 is closed.**

**M39 analytics foundations is DONE and merged to `main`** — all eight tasks, no branch, tree clean.
**CI is green** on `561b5f7` (both `ci` and `dependency-scan`).
The analytics brief that produced it is closed too. Nothing is in flight.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git branch -a   # expect main, and only main
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch lives in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — gitignored, so a fresh clone needs it again.

---

## What M39 changed that you will trip over if you do not know it

Plan: `docs/superpowers/plans/2026-08-27-m39-analytics-foundations.md`. Brief:
`docs/superpowers/specs/2026-08-27-analytics-brief.md`.

- **`V29` is applied.** Six schema changes plus `payment.stripe_payment_intent_id`. Do not write a
  migration to "add" any of them.
- **`membership_event` records JOINED / SUSPENDED / REACTIVATED.** It is `@TenantId` and is written
  **wherever `Subscription` is written** — because both membership-creation paths are tenant-less and
  both already end in a `runAsBox` block. A `@TenantId` row written in the tenant-less half stamps
  the all-zeros sentinel and dies on the foreign key (TENANCY.md failure mode 2).
  **`LEFT` exists and nothing emits it**: the product has no departure flow. Inventing one is M15a's.
- **`subscription.kind`** (PAID/COMPED/TRIAL) replaced "is the plan named `Comped`?". Never infer
  meaning from a plan's name again.
- **A plan's currency IS the box's currency**, and a mismatch is a 400. Changing `boxes.currency`
  once a plan exists in the old one is a 409.
- **`payment.settled_at`** is what revenue filters on — NOT `created_at`, which is the checkout
  attempt. **Refunds are rows in `refund`**, routed from `charge.refunded` by PaymentIntent.
- **Three new standing gates**, all currently zero:
  ```sh
  grep -rn "memberships\.findAll()" backend/src/main/java          # D-3: Membership is NOT @TenantId
  grep -rn "MembershipEvent.LEFT"    backend/src/main/java          # nothing may emit LEFT
  grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'
  ```
- **`ran_by_membership_id` exists and nothing writes it.** Its writer is M34. It is deliberately NOT
  on any DTO yet, and deliberately NOT backfilled from `coach_id`.

### One CI flake fixed after M39 closed (2026-08-28)

`runner.spec.ts` "TV shows the clock when a coach starts a timer" went red once in CI with
`data-timer="none"` — the same SYMPTOM as the M21 tenancy bug, a different cause. **The tenancy
guard is intact** (`TvStreamService.java:86`) and `connect()` sends an initial snapshot, so no event
is lost. The spec's 15s budget was covering tv-shell's **3000ms pairing poll** plus the SSE connect
plus the push. It now waits for the TV to go live first, so 15s measures only the push.

**Not fixed with a retry.** `playwright.config.ts` sets `retries: 0` on purpose and says why:
re-running until green is the failure mode that decision exists to prevent. Do not add retries.

### Two defects M39 fixed, both found by the brief rather than reported

- **D-1**: editing a class's programming used to delete every score logged against it. `ItemInput`
  now carries an item id and `replace()` reconciles instead of deleting. **`wod_id` is not a valid
  matching key** — a session may legitimately hold the same WOD twice.
- **D-3**: `AdminStatsController` counted every membership **on the platform** as the box's
  `activeMembers`. Three more `findAll()` sites of the same shape were fixed with it.

---

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/superpowers/specs/2026-08-27-analytics-brief.md`** — **new.** Read §5 before any backend
   work and §4 before any chart. It changes what M15a, M16d, M17c and M18 can promise.
3. **`docs/ROADMAP-AT-A-GLANCE.md`** — execution order. Milestone numbers are labels, not a
   sequence. **M29a is next.**
4. **`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`** — the pilot IS v1.0.
5. **`docs/POSITIONING.md`** — before writing anything a gym owner reads. **Note: the brief
   corrects its §5** — `subscription`/`payment`/`entitlement_usage` do *not* hold everything LEG
   needs, because nothing records that a member left.
6. **`docs/PREFLIGHT.md`** at its four moments.

---

## What the analytics brief established — do not re-derive it

- **10 named misses**, M-1..M-10, each with `path:line` evidence. **Six force a migration:** an
  append-only `membership_event` table (M-1, without which **LEG and churn cannot be computed at
  all**), `payment.settled_at` (M-2), a `refund` table plus `charge.refunded` on the webhook (M-3),
  an explicit `subscription.kind` (M-4), `boxes.currency` (M-5), and
  `class_sessions.ran_by_membership_id` (M-6, without which the payroll calculator pays people from
  the *assignment* column).
- **Revenue is defined**, and two of its five clauses cannot be written until M-2 and M-3 land.
  Until then any revenue figure is gross, cash-basis, attributed to checkout date — shippable, but
  **only if the screen says so**. Revenue never reads `subscription`. **ARM divides by *paying*
  members**, never by all of them.
- **The categorical chart palette exists and is committed** as `--cat-1..--cat-6` in
  `frontend/src/styles/_tokens.scss`. Six is the **ceiling**, not a starting point; a seventh
  series folds into "Other" or facets. **Charts on analytics screens use no volt at all** — those
  screens are plumbing, and the box switcher already spent the shell's volt budget.
- **Two live defects** were found while auditing: D-1 above, and D-2, `SlotRegenerationService`
  deleting sessions nothing refills — latent today because no controller calls it, and it goes
  live the moment **`M14b`** wires up a schedule-edit flow. Both are in `docs/BACKLOG.md`.

---

## Where things stand

`main` carries M23 and the analytics brief. Gates as measured **this session**, on the tokens change:

| Gate | Value | Measured |
|---|---|---|
| Backend | **567 / 0 / 0 / 0** | ✅ at M39 close |
| Karma | **450 / 450** | ✅ at M39 close |
| Production build | **green** | ✅ at M39 close |
| e2e | **76 passed / 0 failed / 0 skipped** | ✅ re-run 2026-08-28 after the flake fix; **CI green on `561b5f7`** |
| Visual | **33 / 33** | ✅ at M39 close, on a `down -v` stack |
| Eight §8.1 greps | all **0** | ✅ at M39 close |
| Three tenancy/lifecycle greps | all **0** | ✅ at M39 close |
| `AuthzConformanceTest` | **untouched**, 0 lines vs `origin/main` | ✅ at M39 close |

**Every one of these was measured at close. None is inherited.** Backend went 535 → 567.

**Say which numbers you measured.**

### Environment that is already set up — do not rediscover it

- **Claude in Chrome is installed and connecting.** If `tabs_context_mcp` says "not connected", it
  is a dropped connection, not a missing install: check the extension is enabled and signed in to
  the same account, and that the frontmost Chrome window is the `Default` profile.
- **The dev stack runs from `docker/docker-compose.yml`**; the app is at `http://localhost/app/`.
- **Multi-gym demo accounts exist**, all with password `boxhub-demo-2026` — `triple@demo.io`
  (three gyms, a different role in each), `duo@demo.io` (two), `blocked@demo.io` (one active, one
  PENDING, one SUSPENDED — the only way to see both unreachable states), `nobox@demo.io` (none).
  Documented in `README.md`. **Do not change `multi@demo.io`'s memberships** — a visual baseline is
  recorded against them.

---

## The frontend routine (binding — full text in `CLAUDE.md`)

```
shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH
```

Per screen. **`audit` runs first** — deterministic and cheap, and its findings should feed the
design review rather than the reverse. **Both run with Claude in Chrome connected.** If the
extension is unavailable, **stop and ask** — do not score source-only and hand over a number.

**Do not exempt static screens from the bar.** That exemption was proposed and rejected with
evidence: M23's join screen went **1/4 → 3/4** on the help heuristic from one added sentence. The
rubric caps a *lazy* static screen, not a correct one.

### Why the browser half is not optional

Three source-only critiques of M23's three screens missed six defects the first browser-connected
pass caught, including **`margin-block: auto` that centred nothing** (in Angular the flex child of a
shell's `.content` is the component's **host element** — when centring a routed screen, style
`:host`), and **a scrim that had silently drifted in every sheet in the app** (Chrome cannot inherit
`:root` vars into `::backdrop`, so `bh-sheet`'s literal fallback is what renders — **if you change
`--scrim`, change the literal too**).

**A screenshot read is not a source read.** Verify against source before asserting, including
against your own eyes.

---

## Traps that cost real time — do not rediscover them

- **`NODE_OPTIONS` is poisoned in this environment.** Every bare `npm` command dies with
  `MODULE_NOT_FOUND` *before Karma starts*, which reads as a broken project and is not. Always:
  `env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless`
  **Put that line in every executor brief.** It bites `node` and `npx` too, not just `npm` —
  `env -u NODE_OPTIONS npx ng build …`.
- **Bash cwd persists between tool calls.** **Absolute paths, always.** It also silently resets
  after some tool calls, so never rely on a `cd` from a previous call.
- **A grep is only as good as the escaping in the file it searches.** `auth.spec.ts` and
  `onboarding.spec.ts` hid `/auth\/boxes/` from every dependents grep because it is written as an
  escaped regex. Only the full suite found them.
- **A circular hue distance written wrong passes silently.** The palette search in the analytics
  brief produced three near-identical reds on its first run, from a wrong modular-distance formula
  *and* a greedy that gamed the adjacent-only pairlist. **Select a palette on `--pairs all`, then
  order it for adjacency** — and look at the output, because both bugs validated green.
- **`validate_palette.js` names the worst protan/deutan pair, then reports the minimum tritan
  across ALL pairs — unnamed.** Attributing that tritan number to the named pair is wrong. The
  analytics brief shipped that mistake and it was caught only by simulating the two colours and
  seeing they looked nothing alike. **If a number and a picture disagree, re-run the arithmetic.**
- **`ng build` does not compile spec files.** Karma is what catches a spec that does not compile.
- **`tsc` does not type-check Angular templates.** Only `npx ng build --configuration production`.
- **Never pipe a gate for its exit status** — in zsh `$?` after a pipe is the pipe's.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **`docker compose` lives at `docker/docker-compose.yml`**, not the repo root.
- **Run the visual suite on a CLEAN stack** (`down -v` first) — e2e mutates accounts.
- **A verify run immediately after `--update-snapshots` always passes and proves nothing.**
- **`e2e/visual.sh` runs in a Linux container**, never Playwright locally.
- **CI runs on `push: main` and `pull_request` only.**

### The seeder is time-of-day dependent — filed, not fixed

`DevDataSeeder.todaySession()` offsets both demo classes from `Instant.now()` with no clamp to the
box's local day. Seeding within ~40 minutes of midnight pushes one class out of "today" and fails
`programming`, `tracking` or `runner`. **If those fail, check the clock before you check the diff.**
In `docs/BACKLOG.md`.

---

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work and trivial glue. Executors are **Sonnet**, one
per plan task, each brief self-contained and carrying the `NODE_OPTIONS` line.

**Weight executor pushback heavily.** Three M23 executors escalated instead of improvising and all
three were right.

**Verify, do not read a report.** Both analytics-brief subagents returned good work and both were
spot-checked before anything they said was written down — twelve `path:line` citations re-read by
hand. One path in a returned report was wrong (`SessionItemController` is in `programming/`, not
`box/`). Reports are evidence, not conclusions.

**Run the negative control on every test, and believe it.** If you cannot name the mutation a test
catches, say so.

**If a verification method is unavailable, stop and ask** — do not run the weaker one and report
its result as the gate.

**Delete the branch as part of the merge.** `git branch -a` should normally show `main` alone.

---

## Rulings that are closed, so they are not re-argued

- **The box switcher's mark is the shell's one volt element** (M23). A screen inside a shell starts
  with its volt budget spent and must not add its own unless it is on the hero list. The **dock's
  active-tab icon is exempt** — wayfinding chrome, like a focus ring.
- **Charts get no volt, and the categorical palette is cool-only** (analytics brief §4). Not a
  preference: `--danger` 23°, `--warn` 53°, `--volt` 119° and `--good` 159° own the warm and green
  arcs, leaving 184–358°. The four existing hues **fail** the palette gate as a four-series set.
- **`M38` scale readiness** was added to the roadmap, before `M28`. A brief, not a build.

---

## After M29a

**Phase A continues:** M29a → M29b → M14b → M14c-a → M14c-b → M17a → M17b → M17c → M15a → M15b →
M16b → M16c → M16d → M18 → M30 → M32a → M32b → M24 → M25 → M26 → M33 → M27a → M27b → M27c →
**M34–M37** (The Room).
**Phase B:** M38 → M28 → M27d → M19 → M20 → **v1.0 → pilot**.

**M19 (the landing page) starts from nothing.** `oc/m19-landing` was an experiment with a cheaper
model and was deleted on purpose — build it fresh when the milestone arrives.

# Next session — **M39 analytics foundations, tasks 2–6.**

The analytics brief is **closed**. **M39 is IN PROGRESS on `main`** — no branch, nothing to merge,
tree clean. Three of its eight tasks are done and pushed; five remain.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git branch -a   # expect main, and only main
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch lives in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — gitignored, so a fresh clone needs it again.

---

## Where M39 stands

Plan: `docs/superpowers/plans/2026-08-27-m39-analytics-foundations.md`. Read it before anything.

| Task | State |
|---|---|
| 1 — `V29__analytics_foundations.sql` | ✅ done. Applied V1→V29 to a throwaway Postgres, every backfill asserted, negative control on the currency adoption |
| 7 — D-3, `Membership` reads scoped to the caller's box | ✅ done, 4 call sites, negative control `expected:<2> but was:<9>` |
| 8 — D-1, programming edits no longer delete scores | ✅ done, 8 tests, negative control on all of them |
| **2 — M-1 `membership_event` entity + the four write sites** | **next** |
| **3 — M-2/M-3 settlement + refunds (MONEY — tightest brief)** | todo |
| **4 — M-4 `subscription.kind`** | todo |
| **5 — M-5 `boxes.currency` + plan validation** | todo |
| **6 — M-6 `ran_by_membership_id`** | todo |

**The migration has already landed, so tasks 2–6 are Java over an existing schema.** Do not write
another migration; V29 is applied.

### The one rule that governs task 2, already derived — do not re-derive it

Both membership-creation paths are **tenant-less**, and both already end in a `runAsBox` block
(`InviteAcceptTx.accept` says so in its own javadoc; `BoxSignupService:109` does the same for the
owner). A `@TenantId` row written in the tenant-less half is stamped with the all-zeros `NO_TENANT`
sentinel and **dies on the foreign key** — `docs/TENANCY.md` failure mode 2. So:

> **`membership_event` is `@TenantId`, and it is written wherever `Subscription` is written.**

`MemberController.patch` is the exception that proves it: it serves `/api/box/**`, already holds a
real box tenant, and writes its event **strictly inside its existing `@Transactional`**.

**`LEFT` is in the check constraint and nothing emits it, deliberately.** The product has no
departure flow — no LEFT status, no leave endpoint, no admin "remove member". M39 records the
transitions that *exist*. Inventing a departure is **M15a's**.

---

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/superpowers/specs/2026-08-27-analytics-brief.md`** — **new.** Read §5 before any backend
   work and §4 before any chart. It changes what M15a, M16d, M17c and M18 can promise.
3. **`docs/ROADMAP-AT-A-GLANCE.md`** — execution order. Milestone numbers are labels, not a
   sequence. **M39, then M29a.**
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
| Backend | **544 / 0 / 0 / 0** | ✅ this session, by the orchestrator, not read off a report |
| Karma | **450 / 450** | ✅ this session |
| Production build | **green** | ✅ this session |
| Eight §8.1 greps | all **0 hits** | ✅ this session |
| `runAsRoot` in controllers | **0** | ✅ this session |
| `memberships.findAll()` in main | **0** — new standing gate, see D-3 | ✅ this session |
| `AuthzConformanceTest` | **untouched** (0 lines changed vs `origin/main`) | ✅ this session |
| e2e | 76 passed / 0 failed / 0 skipped | **inherited from M23 — NOT re-run. Owed before M39 closes.** |
| Visual | 33 / 33 | **inherited from M23 — NOT re-run. Owed before M39 closes.** |

Backend went 535 → 544: six tests from D-1, one from D-3, two from the orchestrator's correction.

**e2e and the visual suite have NOT been run against M39.** D-1 changed a request body shape and a
frontend page, so e2e genuinely needs to run on a rebuilt image and a `down -v` stack before this
milestone can be called done. That is the largest outstanding risk in the milestone.

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

**Phase A continues:** M39 (finish) → M29a → M29b → M14b → M14c-a → M14c-b → M17a → M17b → M17c → M15a → M15b →
M16b → M16c → M16d → M18 → M30 → M32a → M32b → M24 → M25 → M26 → M33 → M27a → M27b → M27c →
**M34–M37** (The Room).
**Phase B:** M38 → M28 → M27d → M19 → M20 → **v1.0 → pilot**.

**M19 (the landing page) starts from nothing.** `oc/m19-landing` was an experiment with a cheaper
model and was deleted on purpose — build it fresh when the milestone arrives.

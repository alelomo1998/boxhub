# Next session — **the analytics brief. M23 is closed and merged.**

M23 (app entry & shells) is **done, merged to `main`, and its branch deleted**. Nothing is in
flight. Start from a clean `main`.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git branch -a   # expect main, and only main
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch lives in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — gitignored, so a fresh clone needs it again.

---

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/ROADMAP-AT-A-GLANCE.md`** — execution order. **Milestone numbers are labels, not a
   sequence.** The analytics brief is next.
3. **`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`** — the pilot IS v1.0: complete, not
   a slice. Built-but-idle is fine; absent is not.
4. **`docs/POSITIONING.md`** — before writing anything a gym owner reads.
5. **`docs/PREFLIGHT.md`** at its four moments.

---

## What the next task actually is

**The analytics brief is a written brief, not a build.** It has three jobs:

1. **Audit whether Phase 1 ever recorded the data** the reports will need. If it did not, that is a
   finding, and it belongs in the brief rather than being quietly backfilled later.
2. **Define "revenue".** Comped subscriptions carry no `payment` row, so any naive sum is wrong in a
   way nobody notices until a gym owner disputes a number.
3. **Own the categorical chart palette, which does not exist.** There is one accent and three
   semantic hues that already mean something — a five-series chart drawn in volt/green/orange/red
   tells the reader one series is an error. **M17c needs this palette; do not let it improvise one.**

---

## Where things stand

`main` carries M23. Gates as measured at close:

| Gate | Value |
|---|---|
| Karma | **450 / 450** |
| Backend | **535 / 0 / 0 / 0** |
| e2e | **76 passed / 0 failed / 0 skipped** |
| Visual | **33 / 33** (verified twice on a clean stack) |
| Eight §8.1 greps | all **0 bytes** |
| `AuthzConformanceTest` | untouched |

M23's three screens were re-scored with the browser connected and all clear the gate:
**hub 32/40, join 33/40, switcher 36/40, audit 17/18/17 of 20, no open P0/P1.** The hub clears by
exactly zero margin and still carries P2s — treat it as a pass, not a comfortable one.

**These are real numbers, measured this session, not inherited.** The previous handoff carried an
e2e count of 67 marked "inherited and unverified" — it was 67 only because three specs were failing
and five never ran. Say which numbers you measured.

---

## The frontend routine (binding — full text in `CLAUDE.md`)

```
shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH
```

Per screen. **`audit` runs first** — it is deterministic and cheap, and its findings should feed the
design review rather than the reverse. **Both run with Claude in Chrome connected.** If the
extension is unavailable, **stop and ask** — do not score source-only and hand over a number.

Raised from 28 to **32/40** on 2026-08-27: 28 is 7/10 and the bar is 8. Conditional passes
(`harden`, `clarify`, `interaction-design`, `layout`) and the never-routine list are in `CLAUDE.md`.

**Do not exempt static screens from the bar.** That exemption was proposed and rejected with
evidence: the join screen's "help & documentation" heuristic went **1/4 → 3/4 on one added
sentence**, because for a screen whose job *is* documentation, help is satisfied by the copy closing
every loop it opens. The rubric caps a *lazy* static screen, not a correct one.

### Why the browser half is not optional

The three M23 screens had already been critiqued three times from source. The first browser-
connected pass found six defects those had all missed, including:

- **`margin-block: auto` that centred nothing.** In Angular the flex child of a shell's `.content`
  is the component's **host element**, not any panel in its template. Valid CSS, green build,
  passing tests, zero visual effect. **When centring a routed screen, style `:host`.**
- **A scrim that had silently drifted in every sheet in the app** — `bh-sheet`'s `::backdrop`
  literal fallback said `rgba(10,7,4,0.55)` against a token of `rgba(6,9,7,0.62)`, with a comment
  falsely claiming they matched. Chrome cannot inherit `:root` vars into `::backdrop`, so the
  fallback is what renders. **If you change `--scrim`, change the literal too.**
- **A transient AA failure no static check could catch** — `aria-disabled` was set on every row
  during a switch, including the busy one, so the "Opening…" chip rendered at 0.6 opacity (~3.4:1).

**A screenshot read is not a source read.** An orchestrator claim that a screen showed "two volt
stat numbers" was wrong — those elements inherit `--bone`. Verify against source before asserting,
including against your own eyes.

---

## Traps that cost real time — do not rediscover them

- **`NODE_OPTIONS` is poisoned in this environment.** Every bare `npm` command dies with
  `MODULE_NOT_FOUND` *before Karma starts*, which reads as a broken project and is not. Always:
  `cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless`
  **Put that line in every executor brief.** It bit the impeccable helper script too, not just npm.
- **Bash cwd persists between tool calls.** It bit four times across M23, twice producing a
  confidently wrong grep and once making Playwright glob Karma specs. **Absolute paths, always.**
- **A grep is only as good as the escaping in the file it searches.** `auth.spec.ts` and
  `onboarding.spec.ts` hid `/auth\/boxes/` from every dependents grep because it is written as an
  escaped regex. Only the full suite found them.
- **`ng build` does not compile spec files.** Karma is what catches a spec that does not compile.
- **`tsc` does not type-check Angular templates.** Only `npx ng build --configuration production`.
- **Never pipe a gate for its exit status** — in zsh `$?` after a pipe is the pipe's.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **`docker compose` lives at `docker/docker-compose.yml`**, not the repo root.
- **Run the visual suite on a CLEAN stack.** Running it right after the full e2e suite fails on
  login timeouts, because e2e mutates accounts. `down -v` first.
- **A verify run immediately after `--update-snapshots` always passes and proves nothing.** If an
  update rewrites baselines you did not expect, restore the originals and re-run — that is the only
  way to learn which ones actually changed. Eleven were rewritten spuriously in M23 because the
  update ran against a stale container.
- **`e2e/visual.sh` runs in a Linux container**, never Playwright locally.
- **CI runs on `push: main` and `pull_request` only.**

### The seeder is time-of-day dependent — filed, not fixed

`DevDataSeeder.todaySession()` offsets both demo classes from `Instant.now()` with no clamp to the
box's local day. Seeding within ~40 minutes of midnight pushes one class out of "today" and fails
`programming`, `tracking` or `runner` depending on which side of midnight you are. **If those fail,
check the clock before you check the diff.** Recorded in `docs/BACKLOG.md`.

---

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work and trivial glue. Executors are **Sonnet**, one
per plan task, each brief self-contained and carrying the `NODE_OPTIONS` line.

**Weight executor pushback heavily.** Three M23 executors escalated instead of improvising and all
three were right — one refused to stub around a red bundle, one found a plan-supplied spec that
could not pass, one caught a bug the orchestrator had introduced.

**Run the negative control on every test, and believe it.** One M23 control was decoration: it
clicked a row to prove a guard, but that row renders as a `div` with no click handler, so deleting
the guard left it green. **If you cannot name the mutation a test catches, say so.**

**Verify, do not read a report.** An executor reported eleven rewritten baselines as "expected" and
"confirmed stable" — the confirmation was a verify run immediately after its own update, which is
circular. Measuring independently showed 30 of 33 were unchanged.

**If a verification method is unavailable, stop and ask — do not run the weaker one and report its
result.** Disclosing the limitation in a sentence does not undo the fact that the headline number
gets used as if it were the real gate. All three M23 critiques ran source-only because the Chrome
extension was not installed; each said so, and the milestone was still driven to a close on scores
that had never seen a rendered pixel. Say what is missing, what the weaker option would and would
not establish, and let the user choose.

**Delete the branch as part of the merge.** Merge and delete are one step; `git branch -a` should
normally show `main` alone.

---

## Two rulings M23 closed, so they are not re-argued

- **The box switcher's mark is the shell's one volt element.** It sits in all three shell headers on
  every screen, so a screen rendered inside them **starts with its volt budget already spent** and
  must not add its own unless it is on the hero list. `athlete/home.page.ts`'s CTA was demoted to
  `--bone` for this. The **dock's active-tab icon is exempt** — wayfinding chrome, like a focus ring.
- **`M38` scale readiness** was added to the roadmap, before `M28`. A brief, not a build: query-count
  tests on the hot paths, one load scenario, slow-query logging, a written p95 budget. The schema is
  in good shape (49 indexes, 25 covering `box_id`) — the gap is that nothing *measures* performance.

---

## After the analytics brief

**Phase A continues:** M29a → M29b → M14b → M14c-a → M14c-b → M17a → M17b → M17c → M15a → M15b →
M16b → M16c → M16d → M18 → M30 → M32a → M32b → M24 → M25 → M26 → M33 → M27a → M27b → M27c →
**M34–M37** (The Room).
**Phase B:** M28 → M27d → M19 → M20 → **v1.0 → pilot**.

**M19 (the landing page) starts from nothing.** `oc/m19-landing` was an experiment with a cheaper
model and was deleted on purpose — build it fresh when the milestone arrives.

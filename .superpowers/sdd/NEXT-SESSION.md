# Next session — **continue M23, app entry & shells. Resume at Task 4 of 11.**

**This is a mid-milestone handoff, not a milestone close.** M23 is open, shaped, planned, and three
tasks in. Nothing is merged; everything lives on the branch.

```bash
cd ~/dev/boxhub && git checkout m23-app-entry-shells && git log --oneline -1   # expect be90e6c
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch is already set in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — that file is gitignored globally, so a fresh clone needs
> it again.

---

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here. Design law included.
2. **`docs/superpowers/plans/2026-08-25-m23-app-entry-shells.md`** — **the active plan. This is your
   working document.** 11 tasks; T1–T3 are done. Start at Task 4.
3. **`docs/superpowers/specs/2026-08-25-m23-app-entry-shells-design.md`** — why the plan is what it
   is. §6.1 is new and matters: the dev seeder was the one backend file that had to change.
4. **`docs/superpowers/sketches/m23-app-entry-shells.html`** — **open this in a browser before
   Task 5.** Six plates at 375 and 1440, drawn in the product's real tokens. Also published at
   https://claude.ai/code/artifact/a1071188-568b-4eef-8f27-6f3e2aaf2d77
5. **`docs/PREFLIGHT.md`** at its four moments.
6. **`docs/TENANCY.md`** §4 and §8.3 — only if you add a data read to any of these screens. You
   should not need to; see "the tenancy trap" below.

`docs/ROADMAP-AT-A-GLANCE.md` and `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` are the
programme context. **The pilot IS v1.0** — complete, not a slice. Read the order from the roadmap
page, never from a milestone number.

---

## Where M23 stands

**Branch `m23-app-entry-shells`, 9 commits, tree clean, one worktree.**

| Gate | Value | Measured |
|---|---|---|
| Karma | **427 / 427** | this session, independently, after the last commit |
| Backend | **535 / 0 / 0** | this session |
| Migration head | **V28** | this session — unchanged, M23 needs no schema |
| §8.1 greps | **all eight zero bytes** | this session |
| `runAsRoot` in controllers | **0** | this session |
| `AuthzConformanceTest` | **untouched**, empty diff vs `main` | this session |
| e2e | **67 / 0 / 0** | ⚠️ **inherited from the M16a handoff, NOT re-measured.** Task 10 measures it. |
| `e2e/visual.sh` | **31 specs, 88 baselines** | baseline count measured; the suite was not run |

### Done — Tasks 1–3

| Task | Commit | What |
|---|---|---|
| T1 | `7ca563b` | `core/auth/labels.ts` — `roleLabel` / `boxStatusLabel` / `isReachable` |
| T2 | `d6689c4` | Seeder fixtures: box `northside`, `multi@demo.io`, `nobox@demo.io` |
| T3 | `a0d5199` | `bh-shell-header` `[brand]` slot + `customBrand`; `user` icon; gallery example |
| — | `f5bc878` | Comment: why `ng-content` inside `@if` is safe here |

**All three diffs were reviewed by the orchestrator and all three negative controls genuinely went
red.** Do not re-verify them; verify what you build.

### Remaining — Tasks 4–11

4. Hub shell + `/gyms` routes · 5. The hub page · 6. The join page · 7. Entry guard on `/` and `**`
· 8. The dead-end sweep + delete the picker · 9. The box switcher · 10. e2e · 11. Close-out.

**Task 4's production build is EXPECTED to fail** until Tasks 5 and 6 exist, because the route's
`loadComponent` points at files that are not written yet. It is the only red step in the plan and it
is flagged in place. **Tasks 4, 5 and 6 share one commit.** Do not "fix" it by commenting out the
routes.

---

## The six decisions — do NOT re-litigate

All user-stated 2026-08-25, each taken against a drawn alternative, all recorded in the spec §2.

1. **The boxless state gets a full shell with a dock**, not a warning screen.
2. **The boxless home IS the box picker** — one hub at `/gyms`, always reachable, serving zero gyms
   and five. `/auth/boxes` becomes a redirect and `box-picker.page.ts` is deleted.
3. **Box switching only.** Area switching (Admin ↔ Coach ↔ Athlete inside one gym) is **filed to
   `docs/BACKLOG.md`**, not built.
4. **`/` resolves by state and resumes your last gym.** The hub is the fallback, not a toll gate.
   Login keeps auto-selecting when the account holds exactly one membership.
5. **Status copy keys off the role held at that gym**, not the status alone. An admin of a PENDING
   gym is told "In review"; everyone else is told "Unavailable".
6. **Role labels are Athlete / Coach / Admin.** "Owner" was rejected — wrong for a gym whose admin
   is a hired manager.

**Two judgements the user approved rather than decided** (spec §11), re-openable only at critique:

- **The dock's active volt icon is shell chrome and does not spend a screen's volt budget.** The
  alternative reading says every shipped screen is already over budget. If the critique disagrees,
  the fix is one line — the hub's empty-state button goes ghost.
- **Landing on the hub does not clear the active box.** `bh_active_box` survives, so `/` still
  resumes and the hub can mark which gym you are in. That is what makes the `Current` chip mean
  anything.

---

## What the code contradicted — verified, and already acted on

Recorded so nobody re-derives them, and as a standing reminder that **recorded debt decays**.

1. **Boxless is not an edge case — it is the state every account starts in.**
   `identity/AuthService.register` (line 76) creates a `User` and never a `Membership`.
   `features/auth/signup.page.ts:50` already carried the comment *"Signup dead-ends with no gym
   otherwise"*, and the mitigation that shipped was a sentence of warning copy.
2. **The dead end is in three files.** `core/auth/role.guard.ts`,
   `features/account/account-layout.page.ts:141`, and `app.routes.ts`'s `''`/`'**'`.
   `core/auth/superadmin.guard.ts` has the same shape — a signed-in non-superadmin is sent to `/`,
   which sent them to a login form. **Task 8 owns all of it.**
3. **Three pages navigate to the picker, not one.** `login.page.ts:140`, `reset.page.ts:141`,
   `verify.page.ts:159`. The last two were invisible until the dependents grep was run.
4. **Zero cross-shell links exist in the whole app.** `roleGuard` admits a `BOX_ADMIN` to `/coach`
   and `/athlete`, and nothing links there. Filed to BACKLOG, out of scope, **do not build it**.
5. **The e2e fixtures did not exist** — one box, one membership each, so login auto-selected past
   everything. Fixed in T2. Spec §6.1 records why that is not a scope widening.
6. **The dev gallery asserts an exhaustive 20-section list.** The switcher must **NOT** get a
   gallery section — it is a feature component, and a 21st entry fails the build.

---

## Traps — the ones that actually bit, this session and before

- **`NODE_OPTIONS` is poisoned. This cost a whole failed run.** Every bare `npm` command dies with
  `MODULE_NOT_FOUND` *before Karma starts*, which reads as a broken project and is not. Always:
  `cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless`
  **Put this in every executor brief** or an executor will report a broken environment as a red suite.
- **cwd persists between tool calls, and it bit three times in one session** — twice on greps that
  reported a confident wrong answer, once on a `git add` that failed outright. All three came after
  a `cd .../frontend`. **Absolute paths in every command.**
- **`npm test` alone hangs** (watch mode).
- **`tsc` does not type-check Angular templates.** Only `npx ng build --configuration production`.
- **`ng build` does not compile spec files.** A green build is not evidence your specs compile.
- **Never pipe a gate for its exit status** — in zsh `$?` after a pipe is the pipe's.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **`docker compose` lives at `docker/docker-compose.yml`**, not the repo root.
- **e2e:** `build frontend backend`, then `up -d`, then `cd e2e && npx playwright test`. Rebuild the
  image first or you measure a stale bundle. Re-run on a `down -v` stack before blaming a diff —
  `runner`/`tracking`/`tv` are non-idempotent.
- **`e2e/visual.sh` runs in a Linux container**, never Playwright locally. `--update-snapshots` is
  the documented flag (verified).
- **Never put a backtick inside an HTML comment in an Angular template** — `TS1005`.
- **`README.md` is edited in a separate opencode session.** Do not touch it.
- **CI runs on `push: main` and `pull_request` only.** Merge to `main`, then read the run.

### The tenancy trap, stated once because it is the expensive one

Everything the hub renders comes from `/api/me`, and `Membership` is deliberately **not** a
`@TenantId` entity — so the boxless session can read it. **If you add any other data to these
screens, check the entity first.** Since M21 a tenant-less read of a `@TenantId` table returns
**empty**, silently, and a test written under `actAsBox` stays green over it. `docs/TENANCY.md` §8.3
names "my drop-ins across every box" as the first cross-box read that will need a registered native
query — **M23 does not build it, and `runAsRoot` is never the answer on a request thread.**

---

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work (tenancy, concurrency, money, the booking engine)
and trivial glue. Executors and reviewers are **Sonnet**, one per plan task, each given a
self-contained brief: files to touch, exact code from the plan, verification commands, and the
`NODE_OPTIONS` line.

**Executors never guess.** Blocked, ambiguous, or plan-conflicts-with-reality returns to the
orchestrator. **Weight executor pushback heavily** — two M16a executors refused to commit around a
red test and a count mismatch, and both were right. One M23 executor correctly flagged a
concurrently-modified file. That is the design, not friction.

**Run the negative control on every test.** Break the implementation, watch it go red, revert, watch
it go green. All three M23 controls so far went genuinely red. One M16a control was itself a false
negative and only *running* it revealed that. **If you cannot name the mutation a test catches, say
so instead of counting it as coverage.**

**Never edit `AuthzConformanceTest`** as an executor — orchestrator only. M23 should not need to
touch it at all; it adds no Spring route.

**Verify, do not read a report.** A subagent once reported "the void reads as gone" when measurement
showed it had moved 181px. Re-run the gates yourself before believing a number.

---

## Definition of done for M23

- Tasks 4–11 complete, each committed.
- **Karma > 427**, e2e **> 67 with 0 failed and 0 skipped**, visual green with the two `box-picker-*`
  baselines deleted and hub baselines recorded **in the Linux container**.
- All eight §8.1 greps still zero. `AuthzConformanceTest` still untouched. Backend still 535/0/0.
- `grep -rn "box-picker\|BoxPickerPage" frontend/src --include='*.ts'` returns **zero bytes** —
  including the two historical comments in `auth-layout.component.ts:55` and
  `check-email.page.ts:114`, which must be reworded rather than explained away. *A gate you have to
  explain away stops being a gate.*
- **Impeccable critique per screen** — hub, join, switcher — each ≥28/40 with no open P0/P1, scored
  **after** fixes. Expect 3–5 look-and-adjust rounds per screen; every one so far has found a real
  defect. A score measured with a P0 open is not the screen's score.
- Merge to `main`, wait for CI, read the run.
- **Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second.

---

## After M23

**Phase A continues:** analytics brief → M29a → M29b → M14b → M14c-a → M14c-b → M17a → M17b → M17c
→ M15a → M15b → M16b → M16c → M16d → M18 → M30 → M32a → M32b → M24 → M25 → M26 → M33 → M27a →
M27b → M27c → **M34–M37** (The Room).
**Phase B:** M28 → M27d → M19 → M20 → **v1.0 → pilot**.

The **analytics brief is next and it is a written brief, not a build**. It audits whether Phase 1
ever recorded the data, owns defining "revenue" (comped subscriptions carry no `payment` row), and
owns **the categorical chart palette, which does not exist** — one accent and three semantic hues
that already mean something, so a five-series chart in volt/green/orange/red tells the reader one
series is an error. M17c needs that palette.

## Two stale branches, one decision each — ask, do not act

- **`oc/m19-landing`** — 9 real commits. M19 is #37. Starting point, or deleted?
- **`oc/opencode-setup`** — one commit, 220 behind `main`, from the M13d era. Almost certainly delete.

Deleting a branch is not reversible from here.

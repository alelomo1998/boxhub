# Continue **rxed** — M21 is mid-flight, resume at task 6 of 8

Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker Compose behind nginx, GitHub
`alelomo1998/boxhub` private.

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if a
> superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one entry.

**This is a RESUME, not a new milestone.** M21 — identity & tenancy for multi-box — is specced, planned,
and 5 of its 8 tasks are committed on branch **`m21-identity-tenancy`**. Nothing is pushed. Nothing is
merged. `main` is untouched and still green.

```bash
cd ~/dev/boxhub && git checkout m21-identity-tenancy && git log --oneline main..HEAD
```

## Read first

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **The plan:** `docs/superpowers/plans/2026-08-19-m21-identity-tenancy-multi-box.md` — eight tasks,
   each with exact code, exact gate commands, and the mutation every test must catch. **Tasks 6, 7 and 8
   are what remain.**
3. **The spec it argues from:** `docs/superpowers/specs/2026-08-19-m21-identity-tenancy-multi-box-design.md`.
4. **The ledger:** `.superpowers/sdd/2026-08-19-m21-identity-tenancy-multi-box/progress.md` — every task,
   its commits, its negative controls, and what is NOT yet verified. Git-ignored, on disk, survives
   anything except `git clean -fdx`.
5. **`docs/PREFLIGHT.md`** at its four moments. Two of its entries fired during the first half of this
   milestone; see "What already bit" below.

## Done and committed (8 commits, `main..HEAD`)

| Commit | Task | What it does |
|---|---|---|
| `8576e89` | — | spec |
| `ae865ca` | — | plan |
| `4bd12cd` | 1 | one `runAsBox` in `TenantContext`; the seven copy-pasted local versions delegate to it |
| `92044b3` | 5 | `BoxScopeGuard`: `/api/box/**` rejects a request whose `X-Box-Id` header disagrees with its token, `409 STALE_BOX` |
| `79077f2` | 2 | **the flip** — `isRoot(NO_TENANT)` is false, so a tenant-less read sees nothing; `runAsRoot` is the explicit cross-box opt-in |
| `dc6b5bc` | 3 | `BookingMaintenance` declares its cross-box read; the test that could not fail is deleted |
| `384b7c1` | 4 | `InviteRegistrationTest` establishes the invite's real box |
| `99ee184` | 4 | `CoachScoreEntryTest` reads under the seeded box's tenant |

Backend suite reported **494 tests, 0 failures, 0 errors**.

## What is NOT verified — do this before trusting the above

1. **Task 4's diff has had no review** and its green is the executor's number, not the orchestrator's.
   Re-run the suite yourself and read the two commits. The executor reports both failures were bucket
   (a) — tests that relied on fail-open — with no production code touched. Verify that claim rather than
   inheriting it.
   ```bash
   cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m21-verify.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m21-verify.txt | tail -2
   ```
2. **Task 5's diff has had no task review either** (orchestrator-implemented, deliberately deferred so
   both tenancy diffs review together). Its four tests and its negative control did run.

## What remains

**Task 6 — the client half of the box switch.** `frontend/src/app/core/auth/auth.interceptor.ts` sends
`X-Box-Id` on `/api/box/**` from `auth.activeBox()`, and on a `409` whose `detail` is `STALE_BOX`
re-mints via `auth.selectBox(...)` and retries **once** — the same shape it already uses for a 401. Four
specs, given verbatim in the plan. Executor work (Sonnet). Karma must go **408 → 412**, and nothing else.

**Task 7 — rewrite `docs/TENANCY.md`.** A full draft already exists at
`.superpowers/sdd/2026-08-19-m21-identity-tenancy-multi-box/tenancy-draft.md` — every test name in it was
verified to exist by grep before it was written down. Read it, update the box-switch section against what
Task 6 actually shipped, then copy it into place. Then the documents that quote it: `CLAUDE.md`'s tenancy
bullet, `docs/HANDOFF.md`'s Architecture line and gotcha 1 (both still say "fail-OPEN"),
`docs/ROADMAP-AT-A-GLANCE.md`, and the committed `.superpowers/sdd/progress.md`. Gate:
`grep -rniE "fail.?open" docs/ CLAUDE.md` must leave only deliberate historical references.

**Task 8 — gates and merge.** Backend, Karma at 412, production build, the two tenancy greps, e2e on a
`down -v` rebuilt stack (**64 passed + 1 skipped**, unchanged), `e2e/visual.sh` in its Linux container
(**31 specs / 88 baselines, 29 axe cases, zero dirty baselines** — nothing in this milestone renders, so
a dirty baseline means scope leaked), then push and **read the CI run**. Merge via
`superpowers:finishing-a-development-branch`.

## The four decisions M21 rests on — do not re-derive them

1. **Tenant-less reads fail CLOSED.** Accepted trade, in writing: an accidental cross-box read is now
   silent-**empty** (a bug) rather than silent-**everything** (a breach). It is not loud, and a throwing
   version was deliberately not built — the resolver runs for every Hibernate session including ones
   touching no `@TenantId` entity, so it cannot tell which sessions to throw for.
2. **One active box + a staleness guard.** The `X-Box-Id` header can only *reject*, never *resolve* — the
   tenant still comes from the JWT and only from the JWT, so "never trust box ids from request params"
   is intact. Say so explicitly wherever it is documented; it looks like a violation at a glance.
3. **A boxless token writes nothing into a box**, except a closed and individually named list of
   relationship-creating routes. Today that list has exactly one entry: `POST /api/invites/{token}/accept`.
4. **Mechanism, not endpoints.** Phase 1's "no endpoints, no DTOs, no screens" rule holds. **No migration
   — V22 is still free.** If something seems to need schema, that is a plan error, not a licence.

## What already bit, in this milestone, twice

- **`docs/PREFLIGHT.md` moment 2, cwd persistence.** A negative control reported `exit=1` that was Maven
  failing to find a POM in the directory the previous command had left behind. It proved nothing until it
  was re-run with absolute paths. **Absolute paths in every gate command.**
- **Maven's `-Dtest=` separator is a comma, not a plus.** `-Dtest='A+B'` fails with "No tests matching
  pattern", which reads like a code failure and is not.

And the finding this milestone exists to make impossible to repeat:
**`SessionApiTest#sweepFlipsPastBookedToNoShow` could not fail.** It ran under `actAsBox(boxA)` while the
nightly sweep runs tenant-less. With the sweep genuinely broken it still reported `Tests run: 1,
Failures: 0`. Green since M2, over a job that would have silently stopped working in every box. **Run the
negative control on every test: break the implementation, watch it go red, revert. If you cannot name the
mutation a test catches, say so instead of counting it as coverage.**

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and merges,
and implements only genuinely delicate work (tenancy is named in that clause — Tasks 2, 3, 5 and 7 are
orchestrator work) or trivial glue. Executors and reviewers are **Sonnet**. Executors never guess:
blocked, ambiguous, or plan-conflicts-with-reality goes back to the orchestrator. **Never edit
`AuthzConformanceTest` as an executor** — orchestrator only, and in this milestone it should need no
edits at all; if it goes red, that is a finding to investigate, not a line to adjust.

## After M21

**M22 — new-domain schema** closes Phase 1. Then M13f opens Phase 2. Order is
`M14a ✅ → M21 → M22`, then Phase 2. **Milestone numbers are allocation labels, not a sequence** — read
the order from `docs/HANDOFF.md` or `docs/ROADMAP-AT-A-GLANCE.md`, never from the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one
anywhere.

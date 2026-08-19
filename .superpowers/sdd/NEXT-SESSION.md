# Continue **rxed** — M21 is closed. Next is **M22, new-domain schema**.

Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker Compose behind nginx, GitHub
`alelomo1998/boxhub` private.

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if a
> superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one entry.
> Milestone work is a feature branch in this directory, merged to `main` at the end.

```bash
cd ~/dev/boxhub && git checkout main && git pull
```

## Read first

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/ROADMAP-AT-A-GLANCE.md`** — all 18 milestones in **execution order**. Order is
   `M14a ✅ → M21 ✅ → M22`, then M13f opens Phase 2. **Milestone numbers are allocation labels, not a
   sequence.** Never infer order from a number.
3. **`docs/TENANCY.md`** — rewritten in M21 and now the authority. M22 cuts schema for a public
   directory, box profiles and drop-ins, i.e. exactly the cross-box read paths §4 was written for.
   Read §4 (the boxless session contract) and §2 (fail-closed) before designing a single table.
4. **`docs/HANDOFF.md`** — architecture, and the CRITICAL gotchas list.
5. **`docs/PREFLIGHT.md`** at its four moments.
6. **`docs/BACKLOG.md`** and `docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md` —
   M22's scope was filed there.

## What M21 shipped (merged to `main`, 2026-08-19)

**A tenant-less read fails CLOSED.** `isRoot(NO_TENANT)` is false, so a read with no ambient tenant
keeps the `@TenantId` filter on against a sentinel no `boxes` row carries and returns **empty**. Before
M21 it saw **every box**. Accepted trade, in writing: silent-empty (a bug) beats silent-everything (a
breach). It is deliberately not loud — the resolver runs for every Hibernate session, including the
many touching no `@TenantId` entity, so it cannot know which sessions to throw for.

- Cross-box visibility is one explicit, greppable opt-in: `TenantContext.runAsRoot(...)`. Platform jobs
  only, never a thread serving a user request. Its only caller is `BookingMaintenance`.
- `runAsBox` is now **one** implementation in `TenantContext` — it used to be copy-pasted into seven
  classes.
- `/api/box/**` carries an `X-Box-Id` assertion header. It can only **reject** a stale request
  (`409 STALE_BOX`), never resolve a tenant, so "never trust box ids from request params" is intact.
  The Angular interceptor sends it and re-mints once on a 409.
- **No Flyway migration. V22 is still free.**

Gates at merge: backend **494/0/0**, Karma **412/412**, production build clean, both tenancy greps 0,
e2e **64 passed + 1 skipped** on a `down -v` stack (29 axe cases inside it), `visual.sh` **31 specs,
zero dirty baselines**. Full ledger: the M21 section of `.superpowers/sdd/progress.md`.

## What M21 leaves for M22 specifically

1. **A boxless cross-box route declares `CROSS_BOX` in `AuthzConformanceTest.NON_BOX_SCOPE`.** `SELF`
   is wrong for a route that reads other people's boxes. The label and its probe land with the first
   such route — a probe family with no members either asserts a floor of zero or reddens the build.
2. **The leak-marker trap, recorded in advance.** The conformance sweep plants a marker in box A's
   **name** and asserts it never reaches box B. Under a directory a box's name is *legitimately
   public*. A `CROSS_BOX` probe must assert the absence of **private** markers — member email, plan
   name, invite token — and must not assert absence of the box name. Splitting `markers` into private
   and public is the first task on that file.
3. **The payee question is DECIDED (2026-08-19, user's call) — do not re-open it.** For **PT and
   drop-ins the coach owns the money**: their own Stripe account, or cash settled directly with them.
   The gym is **not** in the payment flow and takes **no automatic cut**. Three things follow, and the
   second is the one that will bite:
   - A box wanting a floor fee records an obligation; the platform does not split the payment.
   - **A coach's payout account must NOT be a `@TenantId` entity.** M21 made one person hold several
     boxes and a coach has ONE Stripe account across all of them. Tenant-scoping it duplicates
     credentials per box, or makes the account vanish when the coach switches box — `docs/TENANCY.md`
     failure mode 1, exactly. Key it on the user; read it with an explicit predicate, the
     `Movement`/`Box`/`Membership` pattern in TENANCY.md §4.
   - The coach manages it from a boxless `/api/me/**` route, which TENANCY.md §4's write contract
     already permits: it is their own account, not a box's.

   **One sub-question is still open and is cheap to defer to M22's spec:** BYO secret keys (the
   pattern boxes already use, encrypted at rest, reuses the entire shipped payment path) versus
   Stripe Connect (avoids handing secret keys to many individual coaches, but pulls in onboarding,
   KYC and cross-account refunds). Recommend BYO; decide it in the spec, with the user.
4. **Every new `@TenantId` entity needs a two-box test.** A single-box test passes just as happily
   against a silently-broken version — that is how the same bug shipped three times.

## The rule this program keeps relearning

**Run the negative control on every test: break the implementation, watch it go red, revert.** M21
exists because `SessionApiTest#sweepFlipsPastBookedToNoShow` **could not fail** — it ran under
`actAsBox(boxA)` while the nightly sweep runs tenant-less, and with the sweep genuinely broken it still
reported `Tests run: 1, Failures: 0`. Green since M2, over a job that would have silently stopped
working in every box. Review caught none of M14a's five unfailable tests; the negative control caught
all five. **If you cannot name the mutation a test catches, say so instead of counting it as coverage.**

One honesty example from M21 worth copying: Task 6's fourth spec passed *before* its implementation
existed, because the baseline already behaved that way. It was recorded as a guard against a future
regression, not counted as evidence for the change.

## Two process traps that cost real time in M21

- **cwd does not persist.** A negative control reported `exit=1` that was Maven failing to find a POM
  in the directory a previous command had left behind. It proved nothing until re-run. **Absolute paths
  in every gate command.**
- **Maven's `-Dtest=` separator is a comma, not a plus.** `-Dtest='A+B'` fails with "No tests matching
  pattern", which reads exactly like a code failure and is not.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator (this session) dispatches, reviews every diff, runs the gates,
commits and merges. It implements only genuinely delicate work (tenancy, crypto, concurrency, money) or
trivial glue. Executors and reviewers are **Sonnet**. Executors never guess: blocked, ambiguous, or
plan-conflicts-with-reality goes back to the orchestrator — M21's Task 6 brief had to correct a spec
the plan got wrong, and that correction belonged to the orchestrator, not the executor.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only. If it goes red, that is a
finding to investigate, not a line to adjust.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one
anywhere.

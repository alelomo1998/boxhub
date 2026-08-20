# Next session — open **M13f, consolidation**. It opens Phase 2.

**M22 is merged and Phase 1 is closed.** M13f has **no spec and no plan yet**, so this session starts
with `superpowers:brainstorming`, then `superpowers:writing-plans`, then execution. Do not jump to
code — M13f is the milestone that repairs the shared component layer *before* eight milestones build
on it, and building on a wrong shape is exactly the cost it exists to avoid.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m13f-consolidation
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if
> a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. Milestone work is a feature branch in this directory, merged to `main` at the end.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here. The design rules are the operative half for
   M13f, and `frontend/src/app/ui/` being clean-and-staying-clean is the standing gate.
2. **`docs/HANDOFF.md`** — the M13c entry's "Left behind, and now owned by M13f" paragraph is this
   milestone's actual scope statement.
3. **`docs/ROADMAP-AT-A-GLANCE.md`** — execution order. **Milestone numbers are allocation labels,
   not a sequence.** M13f follows M22 and opens Phase 2; read the order from this page, never from
   the number.
4. **`docs/superpowers/specs/2026-08-06-m13c-component-library-design.md`** — §8.1 lists the greps
   that must return zero. They are the gates M13f inherits.
5. **`docs/PREFLIGHT.md`** at its four moments.

## What M13f is, as recorded when it was deferred

Four things, all found by M13c's own critique and deliberately not fixed then:

1. **`bh-button` gained three inputs in one milestone, and 8 of its 10 variant × flag combinations
   emit a class with no matching rule and fail silently.** A variant that renders nothing is worse
   than one that renders wrong, because nothing looks like a layout bug rather than a component bug.
2. **The cross-section consistency pass was never executed** on the dev gallery.
3. **The delete sheet has no axe coverage.**
4. **The dev gallery's sections are coupled through scroll position, so one edit dirties 54
   unrelated baselines.** This is the velocity tax: it makes the visual suite useless as a signal,
   because a real regression is indistinguishable from the noise.

Brainstorm the scope before assuming that list is complete or still accurate — **verify each claim
against the current code first.** It was written in M13c and three milestones have landed since.

### A fifth thing, added to M13f's scope on 2026-08-20 by decision

**The quarantined `runner.spec` TV-timer test, and the open `runner.spec` data-timer flake.** Both
are in `docs/BACKLOG.md` (the QUARANTINED section dated 2026-08-06 and the "Open flake" section dated
2026-08-05), and **neither has an owning milestone** — they have been sitting unowned since.

They belong here for one reason: **M13f's actual job is making the frontend test signal
trustworthy.** Fixing 54-dirty-baseline coupling while a quarantined test silently runs nothing, and
a flake fires at random, only half-solves that. A quarantined test is not a deferred task — it is
coverage that has already stopped existing, and it reads as green.

The backlog already carries the next diagnostic step, so do not re-derive it:

> Add logging inside `compose()` for the timer lookup specifically, then reproduce with the
> two-runs-one-stack recipe. The question is narrow: at the moment a frame is composed, does
> `timers.findBySessionId(...)` return an empty result, a `PENDING` row, or a `RUNNING` row that is
> lost later in the mapping?

Read the whole QUARANTINED section first — it records evidence, what is established, and one
hypothesis that was **checked and does NOT hold**, specifically so the next person does not spend the
time again. If the fix turns out to be big, that is a finding: report it and let the orchestrator
decide whether it stays in M13f or becomes its own milestone. Do not silently expand.

## State

**M22 is merged and Phase 1 is closed.** Backend suite **510/0/0**. Karma **412**, e2e **64 passed +
1 skipped**, `visual.sh` **31 specs, zero dirty baselines** — all unchanged by M22, which touched no
frontend at all. Migration head is **V27**; the chain replays clean from an empty database (27
migrations, all successful, verified on a `down -v` rebuild).

**Baseline to hold.** M13f is a frontend milestone, so the frontend numbers WILL move — that is the
point. The backend numbers must not: **510/0/0** and migration head **V27** with no new migration,
unless something genuinely needs one, which nothing in the list above does.

## What M22 left you that you will actually trip over

**`docs/TENANCY.md` §8 is new and is the durable output of M22.** Two halves: the directory query
decides (anything read *across* boxes cannot be `@TenantId`), and — the half that stops a leak —
drop the discriminator **only when the whole table is public**.

**The trap, stated once so it is not rediscovered a fourth time.** `GET /api/me/export` is served to
a **boxless** session, and it read `@TenantId` entities through derived queries. Since M21 those fail
**closed**, so the GDPR export had been silently returning `user` and `memberships` and nothing else.
Neither shipped test could fail on it: one asserted keys only against a fixture with no rows, the
other ran under `actAsBox`. Fixed in M22 with nine native `...ForExport` finders, registered in
§6.

**Generalise it: before adding any read to a boxless route, check the entity for `@TenantId`.** It
will not error. It will return empty, and a test written under `actAsBox` stays green over it. This
is now the third time this exact shape has shipped (`SessionApiTest#sweepFlipsPastBookedToNoShow`
was the second).

M22 also named **three cross-box reads it deliberately did not build** — "my drop-ins across every
box" (M23/M24), the coach's real free slots (M26), and the public social feed (M25). Each needs a
**registered native query**, never `runAsRoot` on a request thread. §8.3 has the table.

## The rule this programme keeps relearning

**Run the negative control on every test: break the implementation, watch it go red, revert.** If you
cannot name the mutation a test catches, say so instead of counting it as coverage.

M22 is the case study in why the *shape* of the red matters too. `CoachProfileTenancyTest` goes red
under its stated mutation — but by Hibernate **refusing to boot**, not by filtering, so its cross-box
read assertion passes trivially. That is written down at the point of use in `docs/TENANCY.md` §8.2
rather than counted as a passing tenancy test. Do the same when a control surprises you.

For a frontend milestone the equivalent is sharper: **a screen is not verified until e2e runs on
it.** Karma cannot see a dead binding — specs that call a handler directly test the handler, never
the wiring.

## Traps that have already cost time

- **cwd does not persist between commands.** Absolute paths in every gate command.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **Use `mvn clean test`, not bare `mvn test`,** after reverting anything — a stale `.class` produced
  a false failure four times during M22.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing. The standing
  choice is **merge to `main`, then read the run there**.
- **Run `e2e/visual.sh`, not Playwright locally**, or you compare against baselines your renderer
  never wrote.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work or trivial glue. Executors and reviewers are
**Sonnet**. Executors never guess — blocked, ambiguous, or plan-conflicts-with-reality comes back to
the orchestrator. In M22 the plan's Task 7 test code simply did not compile against the real
`AccountService`, and catching that was the orchestrator's job.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only.

**One screen at a time,** with an impeccable shape pass before and a critique after, scoped to that
screen. Expect 3–5 look-and-adjust rounds per screen; each has historically found a real defect.

## One thing the roadmap does NOT cover, flagged 2026-08-20 — do not let it stay invisible

`docs/BACKLOG.md` is 775 lines and 169 items, but it is **organised by destination**, so almost all of
it is consumed by the milestones as they run. M13f will eat its own section. That is working.

**The exception is the `Launch → Production` block, and nothing in the roadmap will ever pick it
up.** It is not assigned to any milestone, and several of its items are hard launch blockers rather
than polish:

- **Email deliverability** — dev is Mailpit. Without real SMTP plus SPF/DKIM/DMARC, verification,
  reset, invite and receipt mail lands in spam, and **the entire auth flow depends on mail arriving.**
- **Postgres backups and a restore drill**, TLS/HSTS, `BOXHUB_COOKIE_SECURE=true`, SSH/firewall
  hardening, secrets delivery on the host.
- **Terms of service, privacy policy, and a DPA with boxes** — rxed is the processor and the gym is
  the controller. Documented internally, stated to nobody. EU PII and real money.
- **Error monitoring and uptime** — there is none. Today the discovery path for a 6am 500 is a box
  owner sending an email.
- **Rate limits never measured against a class-opening rush** — a whole gym shares one NAT IP, so a
  false 429 at midnight when classes open is a product failure, not a save.

**This does not belong in M13f.** It is recorded here so it is not rediscovered a week before a
pilot. It needs to become a real scoped milestone before any box touches the product; raise it with
the user at M13f's close.

## After M13f

`M23 → M14b → M14c → M17 → M24 → M25 → M26`. Read the order from `docs/ROADMAP-AT-A-GLANCE.md`,
never from the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

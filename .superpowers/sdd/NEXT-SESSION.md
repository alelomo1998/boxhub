Continue rxed at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**This IS a build session.** The milestone is **M14a — class & programming model**. It is specced,
planned and approved. Execute the plan; do not re-brainstorm it, and do not re-open decisions the spec
already records with reasons.

## Do this before anything else

**Merge `worktree-v3-roadmap` into `main`.** It is docs-only — five commits, no code — and it holds the
v3 roadmap, the M14a spec, the M14a plan, and this prompt. If you skip this, the plan you execute is not the plan on
`main`, and the next session inherits the divergence.

## Read before you touch code

1. **`docs/superpowers/plans/2026-08-18-m14a-class-programming-model.md`** — the plan you are
   executing. Eleven tasks, three migrations, real SQL and real test code per task.
2. **`docs/superpowers/specs/2026-08-18-m14a-class-programming-model-design.md`** — the spec the plan
   argues from. **Twelve decisions, each recorded with its reason.** The reasons matter: several
   decisions look arbitrary until you read what the alternative broke. §3 lists what the milestone
   deliberately does NOT model, and that list is binding — building any of it is scope leak.
3. **`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — the programme. Read at
   least "The decisions this document rests on" and Phase 1, so you know why a backend-only milestone
   with no screens exists at all.
4. **`CLAUDE.md`** — binding, and it overrides anything here.
5. **`docs/PREFLIGHT.md`** — read at its four stated moments. The single most repeated failure in this
   project is writing a brief that lists the files a change **is** rather than the files that **depend
   on it**. M14a deletes an entity used by nine files; grep for dependents first.
6. **`docs/TENANCY.md`** — authority for `@TenantId`. The failure mode is a *wrong ambient tenant*, not
   an absent one, and a genuinely tenant-less read fails **OPEN**.

## What M14a actually does

Splits `class_templates` — which holds a class's identity and its weekly slot in one row — into
`class_type` × `schedule_slot`. Gives a programming piece three independent axes (macro, timing, score)
where `wod_type` was one flat list mixing two of them with no TABATA at all. Lets a class own its
programming content by copying on attach, which is the root-cause fix for the filed unbounded-library-
growth bug. And turns cancellation from `bookings.delete()` into a recorded fact.

**Schema, entities and domain services only. No new endpoints, no new DTOs, no screens.** Controllers
are edited exactly as far as required to keep the build and the suite green.

## Traps specific to this milestone

- **`AuthzConformanceTest` must pass with no edit to it.** This milestone adds no route. An edit to
  that file means scope leaked — stop and escalate. Per `CLAUDE.md` the orchestrator, not an executor,
  audits every edit to it.
- **Task 4 is the one that looks mechanical and is not.** `ClassTemplateController` exposes a contract
  that now spans two entities. The brief forbids redesigning it and tells the executor to stop and
  escalate rather than invent API surface. Redesigning it is M14b's work.
- **`schedule_slot.id` deliberately reuses `class_templates.id`** so existing `class_sessions` rows
  need no remapping. Do not let anyone "fix" that into a `gen_random_uuid()`.
- **Two tests guard failures that are invisible without them**, and both are specified in the plan with
  their reasons. `was_late` must not move when a box changes its cutoff afterwards — otherwise the
  late-cancel rate is not a fact but a function of today's settings. And a `CANCELLED` booking must not
  block regeneration — otherwise accumulated cancels freeze a slot permanently, which nobody notices
  for a month.
- **Do not add a mail send to the waitlist promotion path.** It is silent today and that is a real
  defect, but the notification strategy is M17's decision. Adding one here pre-empts it.
- **Do not touch the runner's timer auto-arm.** Coach tour decision 9 puts it in Project 2. M14a
  defines the segment shape; Project 2 consumes it. `ClassTimer.spec_json` is free-form text, so this
  costs no migration.
- **`time_cap_seconds` stays.** It has live consumers including `runner.page.ts:299-301`. M14c folds it
  into `timing_json`.
- **The 1 e2e skip is the quarantined TV/SSE defect.** Project 2 owns it. Do not investigate it.

## How to run the session

- **ALWAYS subagent** (binding, `CLAUDE.md`). The orchestrator dispatches, reviews every diff, runs the
  gates, commits and merges. It implements only genuinely difficult or delicate work and trivial glue.
- Executors are Sonnet subagents, one per plan task, each with a self-contained brief. **Executors
  never guess** — blocked, ambiguous, or plan-conflicts-with-reality goes back to the orchestrator.
  Roughly half the briefs written in a recent session contained a factual error, and every one was
  caught because briefs tell executors to stop rather than improvise.
- **A stop-rule must name what it forbids.** "Do not tune" once made an executor retire a test whose
  fix was one line.
- Build env: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`. The system JDK is 26 and is too new.
- **Check the CI run after every push. A local green is not the gate.**

## Gates to hit before the milestone closes

Karma **408** · backend **439 + whatever M14a adds** · e2e **64 passed + 1 skipped** on a rebuilt
`down -v` stack · axe **29 cases, zero violations** · visual **31 specs / 88 baselines** · production
build clean. Frontend gates should be unchanged — if a frontend number moves, something leaked out of
scope, so find out what before accepting it.

## Two open items that are not yours to decide

- **Dependabot PR #22** (`actions/setup-java` 5 → 5.6.0) has been open since 2026-08-01. Separately,
  `dependency-scan` has been red on `main` since 2026-08-17 on a newly-published advisory against an
  unchanged dependency — read the advisory before reaching for `osv-scanner.toml`.
- **`oc/m19-landing` is checked out in a second worktree at `~/dev/boxhub-oc`**, carrying landing-site
  work including e2e specs. The v3 roadmap places M19 in Phase 5. If that work is live, M19's position
  needs revisiting — ask the user rather than assuming either way.

## After M14a

M14b (schedule & classes surfaces) and M14c (the builder) are next in Phase 2, but **M13f consolidation
opens that phase** — `bh-button`'s silently-broken variant matrix and the gallery's scroll-coupled
baselines are paid by every screen milestone that follows. Both need their own brainstorm → spec → plan
cycle. The v3 roadmap has their scope.

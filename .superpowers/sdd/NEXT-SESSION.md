Continue **rxed** at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**This is NOT a build session.** The next milestone is **M21 — identity & tenancy for multi-box**, and
it is neither specced nor planned. It needs the full arc: brainstorm → spec → writing-plans → execute.
Do not start writing code.

**Check the order before you trust any milestone label.** Milestone numbers in this project are
allocation labels, not a sequence — the v3 roadmap took "the next free labels rather than reshuffling"
and deliberately kept M14–M20 fixed so `docs/BACKLOG.md`'s `### → M15 Admin: people` pointers keep
working. So M14a really is followed by M21. **Phase 1 is `M14a ✅ → M21 → M22`**; M13f opens Phase 2
and comes after both. The previous handoff got this wrong — it announced Phase 2 as next and skipped
M21 and M22 — and the error survived two documents. The order lives in `docs/HANDOFF.md` and the v3
roadmap's phase sections. Never infer it from the number.

## Working agreement, which the last session got wrong

**Work on a feature branch in `~/dev/boxhub` and merge to `main` at the end.** Do NOT create a git
worktree and do NOT run `EnterWorktree`, even if a superpowers skill asks for an "isolated workspace".
The last session made that mistake, the user caught it, and it is now a standing rule in memory.
`git checkout -b m13f-consolidation` and work there.

Everything else is unchanged and binding: **ALWAYS subagent** — the orchestrator dispatches, reviews
every diff, runs the gates, commits and merges, and implements only genuinely delicate work or trivial
glue. Executors are **Sonnet**; reviews and critiques are **Sonnet** too. Executors never guess: blocked
or plan-conflicts-with-reality goes back to the orchestrator.

## Read before anything

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/HANDOFF.md`** — status, gates, the environment traps, and the phase-order table. Its
   milestone-order section exists because this exact ordering was got wrong twice.
3. **`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — the programme. Read the
   **M21 section** and Phase 1's binding rule. M13f, M14b and M14c are Phase 2 and are not yours yet.
4. **`docs/PREFLIGHT.md`** — at its four stated moments, not once at the start.
5. **`docs/TENANCY.md`** — the authority for `@TenantId`, and the document M21 is going to change.
   The failure mode is a *wrong ambient tenant*, and a genuinely tenant-less read fails **OPEN to
   root**. Read it before the brainstorm, not during it.

## What M21 is for, and why it is the dangerous one

The roadmap calls it **the most dangerous milestone in this program**, and explicitly flags it as
**orchestrator-implemented work** under `CLAUDE.md`'s "genuinely difficult or delicate" clause —
tenancy is named in that clause. Do not hand this one to executors wholesale the way M14a was.

**The good news, verified against the code on 2026-08-18 rather than assumed:** multi-box already
works at the identity layer. `Membership` is deliberately **not** `@TenantId`;
`MembershipRepository.findByUserIdWithBox` already returns every box a user belongs to; the box picker
and the user-token → box-token exchange already ship; and `uq_subscription_active` (V14) is unique on
`membership_id`, not on user — so two active subscriptions at two boxes is **already legal today and
needs no migration**.

**The hazard is the cross-box read path.** 42 files carry `@TenantId`, and `docs/TENANCY.md` is
explicit that the failure mode is a *wrong ambient tenant*, and that a genuinely tenant-less read
fails **OPEN to root** rather than closed. A directory reads across all boxes with no box token at
all. So this milestone owns four things, and the roadmap names them:

- a deliberately designed access path for cross-box reads — native SQL or an explicit unfiltered
  projection, decided once and written into `docs/TENANCY.md`, not improvised per feature;
- its own conformance coverage: `AuthzConformanceTest` defaults to DENY, so every boxless route must
  declare its intent in `MIN_ROLE` — and **the orchestrator, not an executor, audits every edit to
  that file**, which applies with unusual force here;
- the boxless session: what a token with no `box_id` claim may read, and what it may never write;
- the box-switch model, and what happens to `TenantContext` when a user holds three boxes.

Read `docs/TENANCY.md` in full before the brainstorm. It is the authority, and this is the milestone
that changes it.

## What just shipped, and the two claims it deliberately does NOT make

**M14a — class & programming model** merged to `main` on 2026-08-19 (`5c1de64`). Backend only.
`class_templates` split into `class_type` × `schedule_slot`; `wod_type` replaced by three independent
axes (`macro`, `timing_preset`, explicit `score_type`) plus `timing_json` segments and a `library` flag;
cancellation became a recorded fact with `was_late` stamped at cancel time; `SlotRegenerationService`
refuses a range holding live bookings rather than cancelling anyone. Flyway **V19, V20, V21**.

Two things it does **not** claim, both recorded in `docs/BACKLOG.md` and owed to **M14c**:

- **The unbounded-library-growth bug is still open.** `WodService.attachToSession` copies a library WOD
  so a class owns its content, and it is tested — but it has **no production caller**. The live path is
  still `SessionItemController.replace`. Wiring it naively reproduces the bug wearing `library = false`,
  because the builder re-sends the id it last received and the second save copies the copy.
- **`wodType` stays on the wire** as `timingPreset ?? macro`, because nine frontend files consume it and
  M14a was forbidden to touch them. That map is lossy for `CIRCUIT`/`CUSTOM`/`SKILL`, so those wods
  reopen with a blank type select. User-accepted on 2026-08-19.

## The lesson M14a paid for, which applies to every milestone after it

**Five tests that could not fail were found, three of them written during that milestone, and every one
was green.** A migration test asserted that migrated data landed correctly — against a container where
Flyway ran on an *empty* database, so nothing migrated and every assertion was satisfied by a foreign
key. `is not null` was asserted on a `NOT NULL` column. One test was primed to fail the moment the next
task ran. And nothing pinned a concrete `was_late`, so flipping `.isBefore` to `.isAfter` passed the
entire suite.

**Review did not catch these. The negative control did.** Break the implementation, watch the test go
red, revert — and if you cannot name the mutation a test catches, say so instead of counting it as
coverage. Put that instruction in every executor brief. Two executors self-reported tests they could
not make fail, and that honesty was worth more than the passing suite.

## Gates — the numbers to beat, and what a moved number means

Karma **408** · backend **486** · e2e **64 passed + 1 skipped** on a rebuilt `down -v` stack · axe
**29 cases, zero violations** · visual **31 specs / 88 baselines** · production build clean.

M21 is backend-and-security work, so **every frontend number must stay put** — Karma 408, axe 29,
visual 31/88. The backend number rises. Any frontend movement means scope leaked, so find out what
before accepting it.

`e2e/visual.sh` runs in a Linux container. Run that, never Playwright locally, or you compare against
baselines your renderer never wrote. **Check the CI run after every push; a local green is not the gate.**

## State of the world

- `main` is green: `ci` and `dependency-scan` both pass. The log4j advisory that had `dependency-scan`
  red is pinned and resolved.
- **Next Flyway is V22.**
- **Dependabot PR #22 was closed, not merged**, and `.github/dependabot.yml` was fixed so it stops
  proposing pins against floating major tags. Reasoning is in the PR comment and the config.
- **A VPS is ORDERED** — `docs/VPS-DEPLOYMENT.md`, OVHcloud VPS-2 Strasbourg, with SMTP, TLS and backups
  as open pre-production blockers. Nothing is deployed, so "no production data exists" still holds. **It
  expires on the first successful deploy** — from V22 on, a destructive migration that was fine in M14a
  becomes a data-loss incident once a box is live.
- **`oc/m19-landing` needs a decision.** Its worktree is gone but the branch and its 9 commits survive
  (landing scaffold, nginx two-builds-in-one-image, sections, e2e spec). The v3 roadmap puts M19 in
  Phase 5. Ask the user whether that work is live before assuming either way; if it is abandoned, delete
  the branch deliberately rather than leaving it to rot.
- **The 1 e2e skip is the quarantined TV/SSE defect. Project 2 owns it — do not investigate it.**

## Start here

Invoke `superpowers:brainstorming` and take M21 to the user. Read `docs/TENANCY.md` and the roadmap's
M21 section first, because the first question is not "what do we build" but **"what is a boxless
session allowed to read, and how does a cross-box query prove it is not an accident?"** — a
tenant-less read failing OPEN to root is the whole risk, and the answer to that question decides the
milestone's shape.

M13f (component-library consolidation) is real and still owed — `bh-button`'s 8-of-10 broken variant
matrix and the gallery's scroll-coupled baselines — but it **opens Phase 2**, after M21 and M22. Do
not start it now.

Continue **rxed** at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**This is NOT a build session.** The next milestone is **M13f — component-library consolidation**, and
it is neither specced nor planned. It needs the full arc: brainstorm → spec → writing-plans → execute.
Do not start writing code, and do not skip the brainstorm because the backlog already lists the
symptoms — the backlog says *what hurts*, not *what the milestone is*.

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
2. **`docs/HANDOFF.md`** — status, gates, the environment traps, and what M13f inherits.
3. **`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — the programme. M13f opens
   Phase 2; M14b and M14c follow it.
4. **`docs/PREFLIGHT.md`** — at its four stated moments, not once at the start.
5. **`docs/BACKLOG.md`** — M13f's raw material is in the M13c/M13e sections.

## What M13f is for

M13e left three things that every screen milestone after it pays for, and they are the seed of the
brainstorm rather than its conclusion:

- **`bh-button` gained three inputs in one milestone and 8 of its 10 variant × flag combinations emit a
  class with no matching rule and fail silently.** A component that ships a broken state matrix is worse
  than one that lacks the state, because the gallery shows it as present.
- **The dev gallery's sections are coupled through scroll position**, so one edit dirtied 54 unrelated
  visual baselines. That is a gate that punishes the wrong person, and it will keep doing so.
- **The cross-section consistency pass was never executed**, and the delete sheet has no axe coverage.

The open question the brainstorm has to answer, and it is genuinely open: is M13f a *repair* milestone
(fix the matrix, decouple the baselines, close the axe gap) or a *contract* milestone (make it
impossible for a component to ship an unrendered state at all)? The second is more work and might be
the cheaper answer over M14b–M18. Do not decide it in the prompt; decide it with the user.

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

M13f is frontend-only, so **the backend number must not move**. If it does, something leaked. The
visual baselines are the interesting ones: M13f may legitimately change them, and if it does, each
changed baseline needs a reason — that is exactly the coupling problem it exists to fix, so a wholesale
"54 baselines updated" is the failure, not the fix.

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

Invoke `superpowers:brainstorming` and take the M13f question to the user. The backlog gives you the
symptoms; the milestone's shape — repair versus contract — is the first thing to settle, because it
decides whether M13f is two days or a week, and M14b cannot start until it lands.

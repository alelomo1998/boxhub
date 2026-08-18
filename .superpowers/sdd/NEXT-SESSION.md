# Next session — rework the roadmap

Paste the block below into a fresh session. Everything it references is committed and on `main`.

---

Continue rxed at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**This session is not a build session. I want to rework the milestone plan** — change some
milestones, add new ones, and restructure the programme. Do not start implementing anything.

**Start with `superpowers:brainstorming`.** This is architectural: it changes how the remaining work
is decomposed and what depends on what. Ask me questions one at a time, propose options, and do not
write a plan until I have approved the shape. When we get to writing, the output is a **revised
roadmap document**, and only then individual milestone specs.

## Read before you ask me anything

1. **`docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`** — the current programme, and
   the thing being reworked. Read all of it, including **"Boundaries that were decided, and are
   binding"** and **"Out of scope for the whole program"**. Some of those boundaries are the reason
   the current shape exists; I may want to overturn some, and you should be able to tell me what
   each one was protecting before I do.
2. **`docs/HANDOFF.md`** — what is actually built and merged, and the current milestone order.
3. **`.superpowers/sdd/progress.md`** — the per-milestone record. The M13d and M13e sections at the
   bottom are the most recent and the most useful.
4. **`docs/BACKLOG.md`** — organised by destination. A roadmap rework is largely a question of what
   comes out of here and into a milestone.
5. `CLAUDE.md` — the operating rules. They are binding on any plan you propose.

## Where the product actually is

**Shipped and merged:** M0–M12 (auth, scheduling and booking, programming, tracking, UX overhaul,
TV, class runner, accounts, onboarding, memberships and payments, security hardening, test/CI
reliability, correctness, production readiness), then the rework programme's M13a (baseline: Angular
22, `/app`, local HTTPS, i18n infrastructure), M13b (design language), M13c (component library),
M13d (ten auth screens), M13e (the account area).

**Gates on `main`:** Karma **408** · backend **439** · e2e **64 passed + 1 skipped** · axe **29
cases, zero WCAG 2.2 AA violations** · visual **31 specs / 88 baselines** · production build clean.
CI and dependency-scan both green. The 1 e2e skip is the quarantined TV/SSE defect — Project 2 owns
it, do not investigate.

**Not yet built, per the current programme:** M14 (class model, schedule and programming schema),
M15 (admin: people), M16 (admin: commerce), M17 (athlete), M18 (superadmin), M19 (landing site),
M20 (2FA/TOTP), Project 2 (The Room), and Launch → Production.

**Current stated order:** M13d → M19 landing → M14 coach. M13e was inserted out of order because it
was deferred out of M13d on review.

## Things worth knowing before proposing a new shape

- **The coach tour spec is done** — `docs/superpowers/specs/2026-08-09-m14-coach-tour.md`. It was
  the stated blocker on M14 and no longer blocks it. Ten decisions taken, six questions deliberately
  left open to be asked at the screen.
- **The design system is real and enforced.** Tokens, a component library with a dev gallery that is
  its contract, 88 visual baselines, axe over 29 cases. Any new milestone that ships screens
  inherits those gates and the per-screen cycle (shape → build → critique ≥28/40, no open P0/P1).
- **Three open items from M13e** are filed in `docs/BACKLOG.md` and are candidates for a small
  consolidation milestone: `bh-button` gained three inputs in one milestone (`ariaDisabled`,
  `dangerBorder`, `solid`) and **8 of its 10 variant×flag combinations now emit a class with no
  matching rule and fail silently**; the account area's cross-section consistency pass was skipped;
  and the delete sheet has no axe coverage.
- **Rough sizing from the two most recent milestones**, for estimating: M13d rebuilt ten screens
  over 21 tasks; M13e built one area of four sections plus two backend changes over 15 tasks, with
  two rounds of rework after review.

## Two lessons that should shape how you plan, not just what

**1. Shape the container, not only the contents.** M13e shaped its four sections but never its own
navigation and chrome — and every defect the user rejected on sight came from that gap, including a
spec rule that structurally contradicted the design the same spec promised. If a milestone
introduces navigation, a shell, or a way of moving between things, that is a design object in its
own right and needs its own shaping, with sketches the user can *see*.

**2. A code review does not discharge the design gate.** M13e passed fourteen code reviews and a
clean whole-branch review and was declared ready to merge without `/impeccable critique` ever being
run. The critique then found three P1s no test caught, because all three were invisible from source.
Any milestone you propose that ships screens must budget for the critique explicitly, not assume
reviews cover it.

## How I want this session to run

- **Questions one at a time.** Multiple choice where it fits.
- **Tell me what each existing boundary was protecting** before I overturn it. Some are load-bearing
  (`every route has exactly one milestone` exists because a first draft left seven unassigned,
  including two hero screens).
- **Say plainly when a proposed milestone is too big**, and where it splits. The current programme
  already learned this once: M13 became M13a–M13e.
- Out-of-scope ideas go to `docs/BACKLOG.md`, one line, not into the plan.
- When the shape is agreed, write the revised roadmap to
  `docs/superpowers/specs/YYYY-MM-DD-v3-roadmap-<topic>.md`, and **retire the v2 document
  explicitly** rather than leaving two live roadmaps — the v2 doc has its own "Why the old numbering
  is retired" section, and the next one needs the same.

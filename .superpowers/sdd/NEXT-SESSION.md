# Next session — open **M23, app entry & shells**.

**M16a is merged, `main` is green, CI is green.** On 2026-08-22 the roadmap was **re-planned and then
fully reviewed**. Read `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` before anything else
— most of what you may have absorbed about the order is from before it.

**The headline: the pilot IS v1.0.** Not a slice — a complete, finished product the box tests in
**full**. A feature may be **built but idle** (Stripe ships, works and is tested; no money flows
because the pilot is free and the box keeps its existing payment method), **never absent**. A feature
the box cannot try is a feature the pilot cannot evaluate. Then v1.0.1 is bug fixes and v1.1.0 is what
the box asks for. **Thirty-four milestones, one €99 tier, everything included.**

**The ordering principle is: build the product, then ship it.** M28 (the deploy) was briefly placed
first and that was wrong — a convenience benefit does not justify building infrastructure for a
product that does not exist. It is Phase B now.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m23-app-entry-shells
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if
> a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch is already set in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — that file is gitignored globally, so a fresh clone needs
> it again.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here. Design law included.
2. **`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`** — the v1.0 programme. What the pilot
   is, the €99 one-tier decision, the Wodify gap audit, and **§9's full order and split rationale**.
3. **`docs/ROADMAP-AT-A-GLANCE.md`** — M23's scope in one row, and the thirty-four-milestone order.
   **Never infer order from a number.**
4. **`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — M23's fuller reasoning
   is there. Its **order** is stale; its **reasoning** is not.
5. **`docs/TENANCY.md`** — §8 and the **boxless-session contract**. M23 is *about* the boxless and
   multi-box states, so this is the subject, not background.
6. **`docs/superpowers/specs/2026-08-19-m21-identity-tenancy-multi-box-design.md`** — M21 built the
   states M23 gives a UI to.
7. **`docs/POSITIONING.md`** — why any of this matters commercially.
8. **`docs/PREFLIGHT.md`** at its four moments.

## What M23 is

**The container, shaped as its own object before anything is put in it.**

Today the app is: log in → pick a box → one of three shells, **all of which assume a box**. A boxless
account has no shell at all. M21 made "no gym" and "several gyms" real, first-class states; M23 is
where they get a UI.

It owns: **the boxless shell**, the **box switcher** for someone holding several, the app's home for
each case, and how a person moves between a box, another box, and no box.

**It ships sketches you can look at — at 375 and 1440 — before any of it is built.** That is a
requirement, not a nicety. It comes from M13e's first lesson, stated by the user: *"I shaped the
sections and not the structure."* Every defect rejected on sight in M13e came from a navigation and
chrome layer that never went through shape — including a spec rule that structurally contradicted the
design the same spec promised.

**M23 defines the shell M27a later wraps natively.** Getting it wrong is expensive twice.

## Gates — M23 is FRONTEND, so these GROW

| Gate | Value | Rule for M23 |
|---|---|---|
| Karma | **419** | **Floor, not ceiling.** Every new component owes specs. |
| e2e | **67 passed, 0 failed, 0 skipped** | **Grows.** A screen is not verified until e2e runs on it. |
| `e2e/visual.sh` | **31 specs, zero dirty baselines** | **Grows.** Run it in the Linux container, never locally. |
| Backend suite | **535 / 0 / 0** | Holds — M23 may need little or no backend. |
| Migration head | **V28** | Only if M23 genuinely needs schema. |
| §8.1 greps | all eight zero bytes | **Stay zero.** `frontend/src/app/ui/` is clean and stays clean. |
| `AuthzConformanceTest` | green, untouched | Orchestrator only. A new route means registering its intent. |

**Every FE feature ships through impeccable** — shape → build → critique ≥28/40, no open P0/P1 —
**scoped to one screen at a time**, never once over the milestone at the end. Expect **3–5
look-and-adjust rounds per screen**; every one so far has found a real defect.

## Settled decisions — do NOT re-litigate

All user-stated 2026-08-22, recorded in the programme spec:

- **Notifications are IN-APP ONLY** (M29b). No email notifications; auth mail is separate. Push
  arrives at **M27c**, and that is where *every* notification type gets routed.
- **Messaging is staff ↔ member 1:1, both directions, coaches included. No member↔member.**
- **Branding is logo and name only.** Colours and style stay rxed; the design law's dark-only and
  single-accent rules were considered and **not** re-opened.
- **Import is CSV-first** (M33) with presets for Wodify, PushPress, Zen Planner, TeamUp, Mindbody.
- **Cut:** public API access, heart-rate tracking, 24/7 door access, anything AI, per-gym website
  builder, per-gym theming.
- **Deferred with triggers:** on-demand media library (server upgrade), custom report builder (v1.1).
- **In v1.0 despite an earlier "we don't build that":** POS/retail (M16c) and lead management +
  campaigns (M32a/b).

## Debt with named owners — do not fix it here

- **M16a's wire shim.** `plan.entitlement` and `plan.weeklyClassLimit` are gone as columns but still
  served, derived, from `PlanController.PlanDto` and `SubscriptionController.PlanSummaryDto`, with
  `requireWeeklyLimit` guarding what `plans.page.ts` can still send. **M16b kills all three.**
- **The eight plan limits have no UI.** **M16b.**
- **The per-box cancellation policy has no UI** — `allow_late_cancel`, `late_cancel_refunds_entry`,
  `count_waitlist_cancellations`. **M15b.**
- **`CANCEL_LIMIT_REACHED` has no copy** in `book.page.ts`'s `reason()`. **M17a.**
- **`home.page.ts:38`** links the next-booking card to `/athlete/book` instead of the
  `/athlete/class/:id` that already exists. **M17a.**

## The rules this programme keeps relearning

**Verify every recorded claim against current code before planning against it.** M16a's spec made
three false assertions and its plan added two more — **five in one milestone**. The review on
2026-08-22 found a sixth: the v3 roadmap tells Project 2 not to forget a quarantined TV/SSE defect
that **M13f found already passing since M21**. Recorded debt decays.

**Weight executor pushback heavily.** Two M16a executors refused to commit around a red test or a
count mismatch. Both were right. That is the design, not friction.

**Run the negative control on every test — it is not a formality.** One M16a mutation was a **false
negative**: the fixture sat a year ahead of `now()`, so a `now()`-anchored window contained neither
session and the test stayed green under the exact mutation it existed to catch. Only *running* it
revealed that. **If you cannot name the mutation a test catches, say so instead of counting it as
coverage.**

**A calendar- or clock-dependent test is a coin flip.** Pin fixtures to an explicit weekday in an
explicit zone — `BookingEngineTest.nextMondayAtTen()` is the pattern.

**An attribute on a component host does not reach the element inside it.** This cost four fixes in
M13c and blocked the form-control migration entirely. A component needing a hook on its inner element
takes an explicit input and binds it there.

**`(ngSubmit)` dies with `FormsModule`.** Rebuilt screens bind the native `(submit)` with
`event.preventDefault()` and keep `novalidate`. This shipped broken on login past 272 green specs —
the password went into the URL.

## Traps that have already cost time

- **`docker compose` lives at `docker/docker-compose.yml`, NOT the repo root.**
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **`npm test` alone hangs** (watch mode). Always `-- --watch=false --browsers=ChromeHeadless`.
- **`tsc` does not type-check Angular templates.** Only `npx ng build --configuration production` does.
- **`ng build` does not compile spec files.** A green production build is not evidence your specs
  compile — Karma is.
- **e2e:** `docker compose -f docker/docker-compose.yml build frontend backend`, then `up -d`, then
  `cd e2e && npx playwright test`. Rebuild the image first or you measure a stale bundle.
- **`e2e/visual.sh` runs in a Linux container** — never Playwright locally, or you compare against
  baselines your renderer never wrote.
- **Never put a backtick inside an HTML comment in an Angular template** — the template is a TS
  template literal and it fails with `TS1005`.
- **cwd does not persist between commands.** Absolute paths everywhere.
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's.
- **CI runs on `push: main` and `pull_request` only.** Merge to `main`, then **wait for the run and
  read it**.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work (tenancy, concurrency, money, the booking engine)
and trivial glue. Executors and reviewers are **Sonnet**. Executors never guess — blocked, ambiguous
or plan-conflicts-with-reality goes back to the orchestrator.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only.

**Every box-scoped endpoint gets happy + auth-denied + cross-tenant-denied tests.**

## After M23

**Phase A (30):** M23 → analytics brief → M29a → M29b → M14b → M14c-a → M14c-b → M17a → M17b →
M17c → M15a → M15b → M16b → M16c → M16d → M18 → M30 → M32a → M32b → M24 → M25 → M26 → M33 →
M27a → M27b → M27c → **M34 → M35 → M36 → M37** (The Room)

**Phase B (4):** M28 → M27d → M19 → M20 → **v1.0 → pilot**

Read the order from `docs/ROADMAP-AT-A-GLANCE.md`, never from a number. Three things to know about it:

- **The analytics brief is #2 on purpose.** It audits whether the data was ever recorded, and a
  migration it forces is cheap now and ruinous at #27. It also owns **defining "revenue"** (comped
  subscriptions carry no `payment` row) and **the categorical chart palette, which does not exist** —
  one accent and three semantic hues that already mean something.
- **The Room is M34–M37 and closes Phase A**, no longer walled off and no longer after the beta. It
  is differentiator #1 and #2 in `POSITIONING.md`; without it a box will not agree to test.
- **M27d (store release) is the one Phase B ordering constraint** — Apple and Google review a native
  app against a real backend, so it cannot precede M28.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

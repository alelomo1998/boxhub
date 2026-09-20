# rxed — postmortem

**Started:** 2026-07-07. **Stopped:** 2026-09-20. **Status:** retired, not shelved. No one is
coming back to finish M17a.

This document exists so that in a year the repo explains itself, and so the next project does not
repeat the one mistake that killed this one. It is written to be read by me, later, with no memory
of the decision.

---

## 1. What rxed was

A multi-tenant SaaS for CrossFit affiliates — "boxes" — at `rxed.app`. Angular 22 + Spring Boot 3.5
/ Java 21 + Postgres 16. Class scheduling, memberships and entitlements, Stripe billing, WOD
authoring and tracking, benchmarks, leaderboards, a live in-class coach runner, and a TV whiteboard.

Positioned CrossFit-only on purpose, against Wodify rather than PushPress, at one flat tier of
**€99/month**, everything included. The thesis, from `docs/POSITIONING.md`:

> the depth of a CrossFit-native product, without the software being the worst part of the day.

## 2. What got built

| | |
|---|---|
| Elapsed | 10.5 weeks, solo (orchestrator/executor with AI subagents) |
| Commits | 1005 |
| Code | ~41.8k lines Java, ~42.8k lines TS/HTML/SCSS |
| Flyway migrations | 36 |
| Test files | 143 backend, 106 frontend specs, 22 e2e |
| Docs | 238 markdown files |
| Milestones | **12 of 39 complete**, stopped mid-#12 (M17a, athlete daily surface) |

Shipped and working on `main`: the class/programming domain model, multi-box tenancy that fails
closed, the entitlement model (eight optional limits over an append-only ledger), the WOD builder
and library, benchmarks with copy-on-use provenance, the schedule and class surfaces, in-app
notifications, analytics foundations, the design system (`bh-*`) with a seven-states dev gallery
gated by axe and 54 visual-regression baselines, and an authz conformance sweep that fails the build
on any route whose authorization intent is undeclared.

It was good work. That is not in dispute anywhere in this document, and it is also not the point.

## 3. Why it stopped

### 3.1 No differentiator survived contact with the market

On 2026-09-20 every edge claimed in `docs/POSITIONING.md` was checked against what competitors
actually ship. None survived.

| Claimed edge | Reality |
|---|---|
| TV whiteboard | **BoxMate Live** — leaderboards, stopwatch, video — free, shipped for years. SugarWOD has one too. |
| Live class runner | **Wodify Coach View + Kiosk+ Coachboard**: workout display, check-in, in-class scoring, bulk complete. |
| Benchmarks with provenance | Wodify, SugarWOD and BTWB all keep benchmark history. |
| Multi-box native | box-mate.com, BoxMate and Wodify all have it. |
| €99 flat, everything | **PushPress has a free tier.** box-mate.com is **€39** for ≤80 members. rxed was the expensive option with no track record. |
| Tenancy rigor, authz sweep, design system | Invisible to a buyer. Zero sales value. |
| Italy as a local wedge | Occupied by **App Palestre**, **FitFlow**, **Managify**, **TeamSystem** — and they do mandatory `fatturazione elettronica`/SDI, which rxed does not. A cost, not an opening. |

Two unrelated products share the BoxMate name, and confusing them wasted a research pass:

- **`boxmateapp.co.uk`** — UK performance/engagement layer, no billing of its own, **acquired by
  TeamUp in September 2025 and rebranded TeamUp Perform**.
- **`box-mate.com`** — unrelated. Solo founder, domain registered **2026-03-30**, iOS app
  `com.boxmatept.app` live **2026-06-23**, Stripe, early-access beta, €39/59/79/129 tiered by member
  count. A direct all-in-one competitor that went from domain to shipped app in **three months**,
  while rxed went 2.5 months to milestone 12 of 39.

### 3.2 The market is shrinking and buys on price

- **~9,900 CrossFit affiliates**, down from **~15,000** in 2018.
- **~1,500 lost in a single year** after the 2024 affiliate fee hike and the Games death.
- **CrossFit HQ itself is for sale.**
- 14+ named competitors in 2026 comparison lists.
- The consensus across those comparisons: switching is *"almost always driven by pricing rather than
  functionality gaps."*

That last line falsifies the thesis on its own terms. rxed was a **quality** argument aimed at a
market that switches on **price**, and the base was contracting ~8%/year.

### 3.3 The access test failed in one message

The plan of last resort was: forget features, get one real box, let them tell you what matters. The
only box within reach was the one I train at. It resolved immediately and negatively:

- they **already pay for App Palestre**;
- the owner is **not a software buyer** — "old style";
- **the gym has no TV**, so rxed's most distinctive surface is literally invisible there.

No box, no differentiator, no route to either. That is the end of the argument.

## 4. Root cause

Not CrossFit. Not the competitors. Not the scope.

**The market was chosen last and the code first.** Every genuinely blocking problem at the end —
who buys this, why, for how much, through what channel — was outside the editor, and none of them
had been touched in 10.5 weeks of disciplined work. The engineering was never the bottleneck and
solving more of it felt like progress while making the real position worse.

Three contributing decisions, each defensible alone:

1. **"The pilot IS v1.0 — complete, not a slice."** Correct about the market: nobody buys a partial
   gym platform. But it set the entry cost at 39 milestones, which is ~a year solo. *A market whose
   minimum viable product is a year of one person's work, against a free incumbent, is a bad market
   for one person.* That sentence should have been written in July.
2. **The per-screen impeccable routine** — shape → build → audit → fix → critique, 3–5 review rounds
   each. Excellent practice. Applied before a single user existed, it is a month-12 discipline paid
   for at month 2.
3. **Positioning written from published reviews, never from a gym owner.** `docs/POSITIONING.md` §9
   says so honestly — *"the weakest evidence in this document"* — and then the roadmap was ordered
   against it anyway for two more months.

**Engineering quality retains customers. It never acquires them.** Solid and fast sells nothing.
It is why people stay, once there are people.

## 5. What was right, and carries forward

- **The multi-tenant skeleton.** JWT auth, tenancy that fails closed with one greppable
  `runAsRoot` opt-in, `AuthzConformanceTest` sweeping the live route table and defaulting to DENY,
  Stripe, Flyway, Docker, CI gates. Months of work that never needs doing again.
- **The Angular design system** — `bh-*` components, token-only styling, the seven-states dev
  gallery, axe and visual-regression baselines, i18n marking.
- **The orchestrator/executor working model** — big model judges, fast model types. It produced
  85k lines in 10.5 weeks solo. Execution was never the problem.
- **`docs/TENANCY.md` and `docs/PREFLIGHT.md`** — both portable, both earned the hard way.

Worth extracting into a template repo: strip the CrossFit domain, keep auth, tenancy, Stripe, the
design system and CI. That starts the next project at week six.

## 6. The rule for next time

> **Pick where you have access or distribution before you pick the problem, and pick the problem
> before you write a line.**

The test is one sentence: *who do I already know who has this problem, and can I message them
today?* If there is no name, it is this project again in a different domain.

Corollaries, all of them paid for:

- Validate with a conversation, not a build. Two weeks of asking beats six months of shipping.
- Prefer a market where **you** are the customer, or where the MVP is small.
- A free incumbent is not a pricing problem, it is a market-selection problem.
- Craft is a reward for having customers, not a strategy for getting them.

## 7. Repo state at stop

- `main` — 12 completed milestones, green.
- `m17a-athlete-daily` — 41 commits ahead of `main`, the athlete daily surface partially built
  (Book and coach Classes closed; class detail and the workout screen built and unscored). Pushed
  and left as-is. **Not merged**: M17a never finished, and merging an incomplete milestone into
  `main` would misrepresent it.
- Tagged `archive/2026-09-20`.

`docs/ROADMAP-AT-A-GLANCE.md` and `docs/POSITIONING.md` are left untouched and **should be read as
historical**. §2, §4, §8 and §9 of the positioning doc are falsified by §3 above.

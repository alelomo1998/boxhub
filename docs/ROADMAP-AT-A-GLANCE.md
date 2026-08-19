# rxed — roadmap at a glance

One line per milestone, in **execution order**. For the reasoning behind any of it, read
`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md` — this page is a map, not the
argument.

**Milestone numbers are labels, not an order.** They were assigned "next free label" so the ~15
backlog entries filed by destination (`→ M15 Admin: people`) keep working. That is why M14a is
followed by M21, and why M13f comes after both. Trust this page's order, never the number.

---

## Phase 1 — Backend foundations
*Schema, domain model, tenancy. No endpoints, no screens. Migrations are one-way, so they go first.*

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 1 | **M14a** class & programming model | Splits a "class" from "when it runs", so a class can be described and scheduled twice. Gives a workout three real axes (what part of class, how it's timed, how it's scored) instead of one muddled list. Makes cancelling a class a recorded fact instead of deleting the row. | ✅ **done** |
| 2 | **M21** identity & tenancy for multi-box | Lets an account exist with **no gym**, and lets one person belong to several. The dangerous part wasn't the login — it was that a query with no gym attached read **everything**. It now reads **nothing** unless it asks: cross-gym visibility is one explicit, greppable opt-in. | ✅ **done** |
| 3 | **M22** new-domain schema | The tables everything in Phase 2 needs: a gym's public profile (location, photos, hours), coach profiles and availability, drop-ins, social posts and ratings, and payout accounts. | ⏭ **next** |

## Phase 2 — Athlete & coach frontend
*Eight screen milestones. Each one ships through the full design gate.*

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 4 | **M13f** consolidation | Repairs the shared component layer before eight milestones build on it — a button whose variants silently render nothing, and a screenshot suite where one edit dirties 54 unrelated baselines. Pure velocity work. | |
| 5 | **M23** app entry & shells | The container: what a person sees with no gym, with one, with three, and how they move between them. Ships **sketches you can look at** before anything is built. | |
| 6 | **M14b** schedule & classes surfaces | The classes page and week calendar. Fixes the day pager that currently takes 13 taps to reach the next open class. | |
| 7 | **M14c** the builder | One page to check, create and build a workout. **Fixes the growing-library bug** M14a only built the mechanism for. Team workouts get designed here, at the screen. | |
| 8 | **M17** athlete | Home, booking, progress, the WOD board and leaderboard. Fixes the silent waitlist promotion — today you get a spot and are never told. **Decides the notification strategy** for the whole product. | |
| 9 | **M24** discovery | Browse gyms on the platform, and buy a drop-in at one you don't belong to. Deliberately reverses M13d's "you need an invite" signup, which was right before this existed. | |
| 10 | **M25** social | A feed of workouts, public or gym-only, with likes and a 1–5 rating. Scoped to workouts on purpose — not a general social network. Needs M14c's builder to author with. | |
| 11 | **M26** coach reservation | A coach publishes availability and a profile; an athlete books them; the coach accepts. Includes the coach choosing how they get paid. | |

## Phase 3 — Analytics brief
*A written brief, not a build.*

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 12 | **Analytics brief** | Asks, per role, what each stats screen must answer — and **audits whether Phase 1 actually recorded the data**. Any migration it forces is a named miss, not a surprise. | |

## Phase 4 — Admin frontend

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 13 | **M15** admin: people | Members, member detail, subscription changes, invites, and gym settings that drive real booking behaviour but have never had a UI (cancellation cutoff, booking horizon). | |
| 14 | **M16** admin: commerce | Plans and their stats, payments, receipts, Stripe setup, and the owner dashboard — after M15 so it can aggregate. | |
| 15 | **M18** superadmin | Platform-wide console and analytics. Was the risky one because a superadmin has no gym attached; **M21 solves that first**, so this consumes that work instead of inventing its own. | |

## Phase 5 — The rest

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 16 | **M27** Capacitor: iOS & Android | Wraps the existing app as native. **Zero UI change** — that's the whole point. Contains real calendar time: app-store review, native Google sign-in, push delivery. | |
| 17 | **M19** landing site | The public marketing site at `/`, app at `/app`. Independent of gym pages, which are sign-in-only. | |
| 18 | **M20** 2FA | Two-factor for gym owners and superadmins. | |

---

## After Phase 5

1. **The beta** — a real gym, on a real deploy. Explicitly a learning exercise: things get added and
   removed as a result. **The Room is walled off** behind an "in development" gate.
2. **Project 2 — The Room** — the coach's live class runner, check-in, and the TV whiteboard. Last on
   purpose: the beta is what supplies the field research it always needed.
3. **v1.0.**

**The production deploy is not a phase.** It happens when you decide. A VPS is ordered
(`docs/VPS-DEPLOYMENT.md`); the readiness list lives in the roadmap.

---

## Things deliberately left open

- **Comments on social posts** — in or out, threaded or flat. You deferred this.
- **Team workout depth** — score entry only, or full roster splitting.
- **What the Room's "in development" gate looks like** — decided before the beta.
- **Whether a drop-in charges through the gym's Stripe** — currently an *assumption*, to be confirmed
  at M22 before its schema is cut.

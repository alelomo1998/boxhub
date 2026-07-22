# BoxHub v1 — Road to launch

**Date:** 2026-07-14
**Status:** Approved (roadmap level). Each milestone below still needs its own brainstorm → spec → plan.
**Supersedes:** the M8/M9 sketch in `2026-07-07-boxhub-design.md` (M0–M7 in that doc remain the record of what shipped).

## The product thesis (everything below follows from this)

**A box that switches to BoxHub does not switch for the booking.**

Every box already has booking, member management, and some analytics. Those are table stakes: necessary to be
considered, never the reason to be chosen. What no incumbent gives them is **the room** — the board on the wall and
the controls in the coach's hand.

Therefore:

> **The plumbing must be correct and unremarkable. The room must be extraordinary.**

The commodity half of the product (booking, memberships, payments, analytics, admin) is built to be *lean and
flawless* — few features, each one right. The room gets the ambition, the time, and the obsession. It is the sale.

## The governing decisions

**1. The pilot is not a learning exercise — it is the launch.** A real box runs a **feature-complete** BoxHub, board
included. The pilot finds bugs and fills gaps; it does not discover which features to build. There is no "ship the
small version, learn, build the rest after."

A pilot without the board would be pitching a box a booking system they already have. So nothing is piloted until the
room exists.

**2. No deadline, and it is binding.** No shareholders, no launch date, no one waiting. Time is unbounded, and
unbounded time means there is no cost to doing it right. **Correctness and solidity beat speed at every single
decision point, without exception.**

Concretely, this rule forbids the following, and every one of them is a bug even when it "works":

- Choosing a design because it is faster to build than the correct one.
- Deferring a known-correct fix to a later milestone because it is inconvenient now.
- Leaving a race, a missing lock, a swallowed error, or an untested branch because it is unlikely to fire.
- Shipping a screen that is merely acceptable when it should be excellent.
- Arguing for a shortcut on the grounds of time, effort, or scope. That argument carries no weight here.

The laziness rule (`ponytail`) still applies — it selects the **simplest correct** solution, and simplest-correct is
frequently also the most solid one. It never selects the *quicker* one over the *right* one. When simplicity and
correctness genuinely conflict, correctness wins and the extra work gets done.

Note the two rules are not in tension for the commodity half: "lean" constrains *scope*, never *quality*. Fewer
features, each one correct.

## Structure: two projects and a launch

| | What | Ends at |
|---|---|---|
| **Project 1 — The Platform** | The table stakes, done perfectly. Auth, onboarding, payments, hardening, the frontend, analytics. | A flawless, unremarkable platform. |
| **Project 2 — The Room** | The wedge. Board, director, heats, hardware and sound. Its own roadmap, milestones, and plans. | The reason a box switches. |
| **Launch** | Production, the marketing site, the pilot. | **v1.0** |

Project 2 gets its own roadmap document when Project 1 is done. It is not scoped here beyond the sketch below, and
that is deliberate — it deserves a full brainstorm of its own, not a paragraph in someone else's spec.

## v1 scope decisions (locked)

| Decision | Answer | Why |
|---|---|---|
| Box pays BoxHub? | **No — free for 2–3 months** | Platform is free at launch; SaaS billing comes after v1. |
| Box cap | **~100 boxes**, enforced in product | Free tier on one small VPS cannot absorb unbounded signups. Signup closes / waitlists at the cap. |
| Athlete pays box? | **Yes — Stripe, model A** | The box brings **its own Stripe keys**; money lands directly in the box's Stripe account. |
| Stripe Connect? | **No** | BoxHub never touches funds → no KYC, no payouts, no platform-fee plumbing, no money-transmitter exposure. Connect only becomes necessary if BoxHub ever takes a cut of athlete payments, which it does not. |
| Offline payments? | **Yes** | Cash and bank transfer are how most boxes actually get paid. The box records a confirmation/receipt against the athlete's subscription. |
| Google SSO? | **Yes, in M8** | A box invites 60 athletes; a password form loses a chunk of them. |
| Heats / teams? | **Yes — Project 2** | Running heats *is* a broadcast-director command. It belongs to the room, not the platform. |
| Kubernetes? | **No** | One small Linux VPS, Docker Compose. Overkill has a cost and buys nothing at this size. |
| Analytics scope | **Lean** | Table stakes. Enough to answer a box owner's real questions, not a BI suite. |

## Gaps found by reading the code (not previously on any roadmap)

All three are launch-blocking:

1. **No password reset.** Not anywhere in the app. A box owner who forgets their password today is locked out
   permanently.
2. **No email delivery.** Invites are "the admin copies a link by hand." A box inviting 60 athletes will not do that
   60 times. Onboarding approval, waitlist-promoted, class-cancelled — all silent today.
3. **No production anything.** Never deployed. No TLS, domain, backups, secrets management, or deploy pipeline.

---

# Project 1 — The Platform

### M8 — Auth & accounts (complete)
Real signup, email verification, password reset, server-side logout/revocation, session and token hygiene,
brute-force / rate-limit review, **Google SSO**. Drags in **SMTP / transactional email** as its foundation — every
milestone below depends on it.

*Today:* accounts exist only via DB seed or the invite chain; no verification, no reset, no revocation, no SSO.

### M9 — Onboarding
Self-serve **"Start your box"** signup; box `status` (PENDING / ACTIVE / SUSPENDED); runtime signup-mode flag
(`OPEN` vs `APPROVAL`); the **100-box cap / waitlist**; a minimal **superadmin approval console**; first-run guidance
for a fresh box. Built on M8's auth. Design already brainstormed and approved in principle (see `docs/HANDOFF.md`);
it now also inherits M8's email and verified-account model.

### M10 — Memberships & payments
The subscription rework — today's `Plan` is a weekly-booking-limit row and nothing else, and it is confusing. A box
**publishes membership plans** (price, period, entitlements) → an athlete **subscribes** → the athlete **pays**.
Rails: **Stripe** (box's own keys, card) and **offline** (cash / bank transfer, recorded by the box with a
confirmation + receipt). Entitlements feed the booking engine.

### M11 — Security hardening
Everything M8's auth work does not cover: media reads behind auth, TV stream token off the query string, purge jobs
(refresh tokens, invites, pairing codes), CSP and security headers, dependency scan, the `@TenantId` native-query
audit, and the payment surface M10 introduces.

*Why here:* every backend domain now exists, so the whole server surface hardens in one pass — and nothing gets built
on top of an un-hardened auth surface.

**Specced 2026-07-21** — `docs/superpowers/specs/2026-07-21-m11-security-hardening-design.md`. The bar is
**public-launch-safe** (hostile internet *and* hostile tenants), scoped to app + secrets handling; infra hardening
stays with Production below. Spine is an automated authz/tenancy **conformance sweep** over Spring's own route
table, so tenancy becomes a standing guarantee rather than a one-time audit. Also adds signed short-lived media
URLs, encryption-key versioning, a minimal superadmin audit log, and per-session kill.

### M12 — Frontend rework
Whole-app pass on structure *and* aesthetic: the three shells and every screen. The current app is over-complicated
and not visually pleasing; this is a rework, not a polish pass. Impeccable gate per surface.

**Explicitly excludes the TV board.** Project 2 owns the board top to bottom; restyling it here only to demolish it
later is building it twice.

### M13 — Analytics
Lean and useful: box economics (real, now that M10 produces revenue data), engagement, class statistics. The admin
dashboard shell + 3 KPIs from M5 are the seed. Table stakes — enough to answer a box owner's actual questions,
no more.

### M14 — MFA & account security
TOTP two-factor for the accounts whose compromise actually hurts — **BOX_ADMIN and superadmin** — with recovery
codes; optional for athletes. A box-admin takeover exposes member PII and lets the attacker swap the box's Stripe
credentials, which is why this is not merely nice-to-have.

*Why here:* it is a real feature with enrollment and recovery UX, not a hardening pass, so M11 deliberately does not
carry it. **Cuttable** if the pilot shows nobody wants it — but it belongs on the map rather than in memory.

**Project 1 exits when the platform is flawless and boring.**

---

# Project 2 — The Room

Gets its own roadmap document, brainstormed from scratch when Project 1 lands. Not scoped here. The shape it will
almost certainly take:

- **Field research (mandatory, non-negotiable).** Watch real classes in real boxes. Sit behind a real coach with a
  real clock running. The command vocabulary and screen grammar are *observed*, never imagined. Because the pilot now
  comes after Project 2, this is the only source of truth available — it cannot be skipped.
- **The board.** The hero surface: legible at 12 meters, in a bright gym, from the back of the room. States for every
  phase of a class. This is where BoxHub's visual identity is actually decided.
- **The director.** The coach's control surface: a phone in a sweaty hand. Glanceable, one-thumb, zero-mistake.
  Latency and reliability outrank features — a command that lands late in front of twenty people is a broken product.
- **Heats, teams, and the theater.** Live leaderboard, PR moments, the 3-2-1.
- **The hardware reality.** Fire Sticks and cheap smart-TV browsers, gym wifi that drops, multiple screens that must
  not drift out of sync, screens that sleep — and **sound**, because a timer nobody can hear over the music is not a
  timer.

Absorbs the old "M7.5 TV command" idea (per-device `tv_devices.view`), which is a subset of this.

**Sell while building:** a board demo needs no signup, no payments, no onboarding. Show it to box owners during
Project 2. If it does not make a coach lean forward, that is the cheapest and most important thing you will ever
learn.

---

# Launch

- **Production.** Small Linux VPS, Docker Compose prod profile, TLS + domain, **firewall + SSH hardening**,
  secrets delivery on the host, Postgres backups **and a restore drill** (a backup nobody has restored is a
  hypothesis), health checks, log access + retention, CI deploy on green. No Kubernetes.
  M11 deliberately defers every item on this line to here, because they need a real host and cannot be proven in CI.
- **Marketing site.** Product presentation, pricing, and the funnel into the "Start your box" signup. Leads with the
  room, because the room is the sale.
- **Pilot.** A real box, two weeks, on the complete product. Bug fixing and gap filling only.

**Exit criterion = v1.0.**

## Process (unchanged, binding)

Per milestone: brainstorm → spec + user approval → writing-plans → subagent-driven execution
(orchestrator = main session, executors = Sonnet subagents) → impeccable gate (≥28/40, no open P0/P1) on every
frontend surface → tenancy tests on every box-scoped endpoint → merge to `main` on green.

Next Flyway migration is **V15** (updated 2026-07-21; M8 took V11–V12, M9 V13, M10 V14).

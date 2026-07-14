# BoxHub v1 — Road to a feature-complete pilot

**Date:** 2026-07-14
**Status:** Approved (roadmap level). Each milestone below still needs its own brainstorm → spec → plan.
**Supersedes:** the M8/M9 sketch in `2026-07-07-boxhub-design.md` (M0–M7 in that doc remain the record of what shipped).

## The governing decision

**The pilot is not a learning exercise — it is the launch.** A real box runs BoxHub for two weeks on a
**feature-complete v1**. The pilot exists to find bugs and fill gaps, not to discover which features to build.

Everything a box needs must therefore ship *before* the pilot. There is no "ship the small version, learn, build
the rest after." That rule killed several tempting shortcuts during this brainstorm and is the reason the roadmap
below is long.

There is **no deadline**. Correctness and quality win over speed at every decision point.

## v1 scope decisions (locked)

| Decision | Answer | Why |
|---|---|---|
| Box pays BoxHub? | **No — free for 2–3 months** | Platform is free at launch; SaaS billing comes after v1. |
| Box cap | **~100 boxes**, enforced in product | Free tier on one small VPS cannot absorb unbounded signups. Signup closes / waitlists at the cap. |
| Athlete pays box? | **Yes — Stripe, model A** | The box brings **its own Stripe keys**; money lands directly in the box's Stripe account. |
| Stripe Connect? | **No** | BoxHub never touches funds → no KYC, no payouts, no platform-fee plumbing, no money-transmitter exposure. Connect only becomes necessary if BoxHub ever takes a cut of athlete payments, which it does not. |
| Offline payments? | **Yes** | Cash and bank transfer are how most boxes actually get paid. The box records a confirmation/receipt against the athlete's subscription. |
| Google SSO? | **Yes, in M8** | A box invites 60 athletes; a password form loses a chunk of them. |
| Heats / teams? | **Yes, inside M12** | Running heats *is* a broadcast-director command. One design, not two. |
| Kubernetes? | **No** | One small Linux VPS, Docker Compose. Overkill has a cost and buys nothing at this size. |
| Analytics before pilot? | **Yes, M13** | Important to the product; placed late because M10 gives it real revenue data to chart. |

## Gaps found during this brainstorm (not previously on any roadmap)

These came out of reading the code, not the backlog. All three are v1-blocking:

1. **No password reset.** Not anywhere in the app. A box owner who forgets their password today is locked out
   permanently.
2. **No email delivery.** Invites are "the admin copies a link by hand." A box inviting 60 athletes will not do that
   60 times. Onboarding approval, waitlist-promoted, class-cancelled — all silent today.
3. **No production anything.** Never deployed. No TLS, domain, backups, secrets management, or deploy pipeline.

## The roadmap

### M8 — Auth & accounts (complete)
Real signup, email verification, password reset, server-side logout/revocation, session and token hygiene,
brute-force / rate-limit review, **Google SSO**. Drags in **SMTP / transactional email** as its foundation — every
milestone below depends on it.

*Today:* accounts exist only via DB seed or the invite chain; no verification, no reset, no revocation, no SSO.

### M9 — Onboarding
Self-serve **"Start your box"** signup; box `status` (PENDING / ACTIVE / SUSPENDED); runtime signup-mode flag
(`OPEN` vs `APPROVAL`); the **100-box cap / waitlist**; a minimal **superadmin approval console**; first-run guidance
for a fresh box. Built on M8's auth. Design already brainstormed and approved in principle (see
`docs/HANDOFF.md` → "Roadmap decisions"); it now also inherits M8's email and verified-account model.

### M10 — Memberships & payments
The subscription rework. A box **publishes membership plans** (price, period, entitlements) → an athlete
**subscribes** → the athlete **pays**. Rails: **Stripe** (box's own keys, card) and **offline** (cash / bank
transfer, recorded by the box with a confirmation + receipt). Entitlements feed the booking engine — this is what
today's `Plan.weeklyLimit` becomes.

*Why here:* placed before the FE rework, because the rework must restyle the subscription screens and those screens
should exist first.

### M11 — Frontend rework
Whole-app pass on structure *and* aesthetic: all three shells, every screen, **including the TV board**. The current
app is over-complicated and not visually pleasing; this is a rework, not a polish pass. Impeccable gate per surface.

*Why before M12:* the command console is built on top of the board. Rework the board first or build it twice.

### M12 — TV command console
The **broadcast director** — the biggest and hardest milestone in v1. The coach commands what the room sees: focus a
module, run/stop AMRAP, start/stop timer, home, show the class, show the WOD, transitions, animations, per-device
views, **heats and teams**. Gets a dedicated research phase into what a CrossFit class actually needs before any spec
is written.

Absorbs the old "M7.5 TV command" idea (per-device `tv_devices.view`), which is a subset of this.

### M13 — Analytics
Box economics (real, now that M10 produces revenue data), engagement, class statistics, coach and athlete insight.
The admin dashboard shell + 3 KPIs from M5 are the seed.

### M14 — Marketing site
Public product presentation, pricing, and the funnel into M9's "Start your box" signup.

### M15 — Security hardening
Everything M8's auth work does not cover: media reads behind auth, TV stream token off the query string, purge jobs
(refresh tokens, invites, pairing codes), CSP and security headers, dependency scan, the `@TenantId` native-query
audit.

### M16 — Production
Small Linux VPS, Docker Compose prod profile, TLS + domain, secrets management, Postgres backups, health checks, log
access, CI deploy on green. First real deployment; expect to fix things it surfaces.

*Why this late:* deliberately deferred by the user. No deadline pressure, so deployment problems get solved when the
product they serve is finished.

### M17 — Pilot
A real box, two weeks, on the feature-complete product. Bug fixing and gap filling only.
**Exit criterion = v1.0.**

## Ordering logic

- Auth is the floor: onboarding, payments, and email all stand on it.
- Onboarding gates everything else — without it, no box can exist without a superadmin doing it by hand.
- Payments before the rework, so the rework restyles screens that exist.
- Board rework before the console that sits on it.
- Analytics after payments, so it has revenue to chart.
- Hardening and production last, immediately before the pilot exposes the product to real humans and real data.

## Process (unchanged, binding)

Per milestone: brainstorm → spec + user approval → writing-plans → subagent-driven execution
(orchestrator = main session, executors = Sonnet subagents) → impeccable gate (≥28/40, no open P0/P1) on every
frontend surface → tenancy tests on every box-scoped endpoint → merge to `main` on green.

Next Flyway migration is **V11**.

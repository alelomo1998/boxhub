# rxed — positioning

**Written:** 2026-08-22, after M16a closed. **Status:** the product's competitive thesis. Not binding
law like `CLAUDE.md`, but milestone ORDER should be argued against it.

**Read it at two moments:** when deciding what to build next, and when writing anything a gym owner
reads (landing page, onboarding copy, sales conversation).

---

## 1. The sentence

> **rxed is the software a CrossFit box actually wants: the depth of a CrossFit-native product,
> without the software being the worst part of the day.**

**We are CrossFit-only. That is a decision, not a limitation** — it is what lets us skip an entire
product surface our competitors carry (see §6) and spend it on depth instead.

---

## 2. The seam we are aiming at

The 2026 market splits into two camps, and **both are compromises**:

| | CrossFit-native | Generalist |
|---|---|---|
| **Who** | Wodify, Zen Planner | PushPress, TeamUp, Mariana Tek |
| **Strength** | WOD tracking, benchmarks, programming depth, leaderboards | Speed, support, member app, ease of setup |
| **Weakness** | Pricing creep, support in *days*, slow updates, overbuilt for a small box, app people dislike | Shallow on the CrossFit layer; the WOD is bolted on top of billing |

**The observed defection tells the whole story: boxes are leaving Wodify for PushPress, and giving up
CrossFit depth to get software that is pleasant to use.** They are choosing worse CrossFit software
because the better CrossFit software is worse software.

**That trade is the seam. Nobody currently makes a box choose between the two.**

Our competitor is **Wodify**, not PushPress. We are not trying to be a cheaper all-in-one; we are
trying to be the reason a Wodify box does not have to downgrade its CrossFit layer to get a product
that respects them.

---

## 3. What we already have that serves this (verified against the codebase, 2026-08-22)

These are real and shipped on `main`. Each is a landing-page claim we can make without lying.

1. **The live class runner** (M7) — one screen: roster strip, server-authoritative timer, per-piece
   score grid. The server persists `{spec, startedAt, pausedElapsed, status}` and **never ticks**;
   clients compute elapsed and render locally, so it is reconnect-safe from the clock. For Time,
   AMRAP, EMOM and Tabata all drive off one shared pure `renderTimer`. **A coach never leaves the
   class to run the class.**
2. **The TV whiteboard** (M6) — SSE, not polling; pairing by 6-digit code; giant-timer takeover; the
   rail shows people and results live. The single most *visible* piece of software in a box.
3. **The CrossFit data model is the real shape** (M5) — CLASS TYPE → CLASS instance → ordered PIECES,
   each piece independently scoreable with its own score type. Not a generic "appointment" with a
   note field.
4. **Benchmarks with provenance** (M3/M4) — ~122 movements and 18 girls/heroes seeded globally,
   copy-on-use into a box's WOD with lineage preserved, so benchmark history is **derived** rather
   than re-entered. Auto-PR on lifts, strictly-greater per movement.
5. **The entitlement model** (M16a) — eight optional limits (entries and cancellations ×
   day/week/month/term), NULL = unlimited, composing with AND, counted from an append-only ledger
   that schedule edits cannot corrupt. **Most of this market ships one "classes per week" integer.**
   A punch-card is just `entries_total = 10`.
6. **Multi-box is native** (M21) — one person holding three gyms is a first-class state, with tenancy
   that fails **closed**. Competitors treat multi-location as an enterprise upsell.
7. **Tenancy is provably safe** (M11) — `AuthzConformanceTest` sweeps Spring's live route table and
   **fails the build** on any route whose authorization intent is undeclared. A standing guarantee,
   not a one-time audit. Almost nothing at our size has this.

---

## 4. The five things that make a box switch

Ranked by how often they appear in defector reviews. **This is the list milestone order should be
argued against.**

| # | Trigger | Where we stand |
|---|---|---|
| 1 | **Notifications** — "you're off the waitlist", class cancelled, payment failed | ❌ Silent today. **Owned by M29**, ordered before M17 so M17 consumes it. **In-app only** by decision; real push arrives with M27, inside v1.0. |
| 2 | **Front-desk check-in speed** on a 6am Monday | ⚠️ Built (photo grid, M5) but **never measured against a real rush**. PushPress wins defectors on tap-to-check-in specifically. Rebuilt in **Project 2**. |
| 3 | **A member app that isn't embarrassing** | ❌ Web-only until **M27** (Capacitor), which is in v1.0. |
| 4 | **Support answered in hours, not days** | ✅ Free advantage while we are one box deep — Wodify's slowness is a *scale* problem we do not have yet. An operating commitment, not a feature. |
| 5 | **Two-Brain metrics** — LEG (length of engagement), ARM (average revenue per member) | ❌ Not built. **Owned by the analytics brief → M15 (LEG, at-risk) and M16 (ARM).** Affiliate owners are trained on these numbers and nobody reports them well; `subscription` + `payment` + `entitlement_usage` already hold everything needed. |

**#5 stays the cheapest real wedge** — a reporting feature, not a platform one, speaking the exact
language an affiliate owner already thinks in.

---

## 5. What we must NOT claim yet

Honesty here is not modesty — a claim that fails in the first week costs more than the feature.

- **"Production ready."** `docs/BACKLOG.md`'s `Launch → Production` block is still unowned at its
  third consecutive milestone close. No real SMTP, no backups + restore drill, no TLS/HSTS, no error
  monitoring, no uptime checks, `BOXHUB_COOKIE_SECURE` still false, no ToS/privacy/DPA.
- **"Reliable email."** Dev uses Mailpit. **Both Wodify and PushPress are loudly criticised for
  invoices and password-reset mail not arriving** — shipping that same bug ourselves is the one
  unforced error available to us, and it is a bug of *deployment*, not of code. Real SMTP with
  SPF/DKIM/DMARC before any box touches this.
- **"Battle-tested."** Zero real boxes. Everything above is an engineering claim, not a field claim.
- **Anything about scale.** Rate limits have never been measured against a class-opening rush.

---

## 6. What we deliberately do NOT build

Being CrossFit-only is what pays for §3. Say no to these on purpose, and say so out loud:

- **Anything AI** — no assistant, no credits, no MCP surface.
- **A per-gym website builder** (a documented source of PushPress complaints).
- **Per-gym theming.** Branding is **logo and name only**; colours and style stay rxed. The design
  law's dark-only and single-accent rules were considered and **not** re-opened.
- **Martial-arts curriculum and rank/belt tracking** (Zen Planner's genuine differentiator).
- **Generic multi-vertical scheduling** — spas, salons, appointment businesses.

**Cut from v1.0:** API access, heart-rate tracking, 24/7 door access control (hardware partnerships,
not code). **Deferred with a trigger:** the on-demand media library (reopens when rxed earns enough
to upgrade the server) and the custom report builder (v1.1).

**Reversed 2026-08-22, and worth naming:** POS/retail and lead management + campaigns were on this
list. **They are now in v1.0** — M16 and M32 — because the pilot must let a box test *everything*.
Being CrossFit-only still means we skip the verticals above; it no longer means we skip what a
CrossFit box actually does on a Tuesday.

---

## 7. Landing-page raw material

Not copy — the true claims copy must be built from. **Every line here is verifiable in the codebase
today**; nothing from §5.

**Headline territory:** the box runs on the screen, not on the software.

- *Run the class from one screen.* Roster, timer, scores. The coach never leaves the class.
- *The whiteboard, live on the TV.* Pair it with a six-digit code. It updates itself.
- *Benchmarks that remember.* Fran in March and Fran in November are the same Fran.
- *Memberships that fit how you actually sell.* Per day, per week, per month, per term — entries and
  cancellations, any combination, or no limit at all. Punch-cards are just a total.
- *Cancellation rules you set, not ones you inherit.* How late is late, whether a late cancel costs a
  session, whether leaving a waitlist counts.
- *Own three gyms? It was built that way.* Not an enterprise tier.

**Tone:** it is a gym, not an enterprise. Direct, unhedged, prescription-voice for anything measured
(see the design law's mono/Archivo split — the landing page should obey it too).

**The comparison to make, if we make one:** not feature-count against PushPress — we lose that and
should. It is *"CrossFit depth without the CrossFit-software tax"*, aimed at a Wodify box that is
considering downgrading.

---

## 8. Pricing — one tier, everything, €99/month

**User-stated 2026-08-22.** No Essentials/Accelerate/Ultimate, no add-ons, no metering. Maximum
**€99/month**, and it includes all of rxed.

**Why this is a strong position and not merely a cheap one: Wodify gates Performance Tracking to
Ultimate, its top tier.** A box paying Wodify $99 gets billing, scheduling, waivers and messaging —
**no WOD tracking, no leaderboards, no benchmarks.** The thing Wodify is named for is an upsell or a
paid add-on. At the same price we are not competing with their entry plan; we are competing with
their Ultimate on the only axis a CrossFit box cares about.

**Metering is their weakness, not their strength** — "2 automations / 15 automations / unlimited",
AI credits, add-ons for the headline feature. One tier, everything, is a categorically different
promise, and it is cheap for us to keep because we do not carry a CRM suite, a website builder or AI.

**Never discount below €99 to win a deal.** Wodify's $199→$99 "for life" offer means their real
number is $199 and they are buying market share. Matching a discount funds their product with our
margin.

## 9. What would falsify this

Written down so it can be checked rather than defended:

1. **A pilot box says the CrossFit depth is not why they'd switch** — then §2's seam is imaginary and
   we are simply a smaller PushPress.
2. **Notifications turn out not to matter** to a real coach — then §4's ranking is wrong and M17's
   priority argument collapses.
3. **Wodify ships a modern app and fixes support** — the seam closes, and the entitlement model plus
   multi-box become the whole differentiation rather than the topping.

**Every claim in §2 and §4 comes from published reviews and comparison sites, not from talking to a
single affiliate owner.** That is the weakest evidence in this document. **The next real input is one
box, not more research** — which is what the v1.0 programme exists to reach
(`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`).

**Note on §4 and §5, updated 2026-08-22:** every gap named there is now owned by a milestone in that
programme, and the pilot is **v1.0 — complete, not a slice**. §5's "what we must NOT claim" still
holds until M28 lands; it is no longer unowned.

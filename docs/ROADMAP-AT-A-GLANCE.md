# rxed — roadmap at a glance

One line per milestone, in **execution order**. For the reasoning, read
`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` — the v1.0 programme, which supersedes the
ORDER in `2026-08-18-v3-roadmap-platform-expansion.md` (that doc's reasoning still stands; its phase
order and its placement of the beta do not). This page is a map, not the argument.

**The pilot IS v1.0.** Not a slice — a complete, finished product the box tests in full. Features can
be *built but idle* (Stripe ships and works; no money flows because the pilot is free), never absent.
Then v1.0.1 is bug fixes and v1.1.0 is what the box asks for.

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
| 3 | **M22** new-domain schema | The tables everything in Phase 2 needs: a gym's public profile (location, photos, hours), coach profiles and availability, drop-ins, social posts and ratings, and payout accounts. Also **rooms**, added at spec time. | ✅ **done** |

## Phase 2 — v1.0 (19 milestones, in order)
*Everything ships before the pilot. Each screen milestone goes through the full design gate.*

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 4 | **M13f** consolidation | Made the frontend signal trustworthy before the screen milestones build on it: two standing gates that were red on clean code, a button that silently dropped states, and a dev gallery whose seven-states contract is now **enforced by Karma**. | ✅ **done** |
| 4.5 | **M16a** plan entitlement model | Eight optional limits (entries and cancellations × day/week/month/term) replacing a single `weekly_class_limit`, plus an append-only usage ledger and a per-box cancellation policy. Backend only. Pulled ahead of the screen milestones that edit plans. **Left a debt: the eight limits have no UI — M16 owns it.** | ✅ **done** |
| 5 | **M28** Launch → Production | The deploy. TLS/HSTS, domain, firewall, SSH, **Postgres backups + a restore drill**, secrets delivery, log retention, CI deploy on green, **real SMTP + SPF/DKIM/DMARC**, error monitoring and uptime, `BOXHUB_COOKIE_SECURE`, ToS/privacy/DPA, rate limits under a class-opening rush, and deleting the dev gallery. **Scope was named and deferred by M12c in July.** Goes FIRST so everything after it is deployable and viewable on a real device. | |
| 6 | **M23** app entry & shells | The container: what a person sees with no gym, with one, with three, and how they move between them. Ships **sketches you can look at** before anything is built. | |
| 7 | **M29** messaging & notifications | Staff ↔ member 1:1 threads both directions (coaches included, **no member↔member**), announcements with segments, an **in-app** notification inbox, and an SMS channel. **No email notifications** — auth mail is separate. Before M17 so M17 consumes it rather than designing it. | |
| 8 | **M14b** schedule & classes surfaces | The classes page and week calendar. Fixes the day pager that takes 13 taps to reach the next open class. | |
| 9 | **M14c** the builder | One page to check, create and build a workout. Fixes the growing-library bug M14a built the mechanism for. Team workouts get designed here. | |
| 10 | **M17** athlete | Home, booking, progress, WOD board, leaderboard, **plus weekly streaks**. Fixes the silent waitlist promotion using M29's system. | |
| 11 | **Analytics brief** | **Moved up from Phase 3.** Asks, per role, what each stats screen must answer — and **audits whether the data was ever recorded**. Must run BEFORE M15/M16 build dashboards, or a missing column is found with the screen already on top of it. | |
| 12 | **M15** admin: people | Members, member detail, subscription changes, invites, gym settings that drive booking (cancel cutoff, booking horizon, M16a's three cancellation-policy flags), **at-risk identification, LEG**, and branding — **logo and name only**. | |
| 13 | **M16** admin: commerce | Plans and their stats, payments, receipts, Stripe setup, owner dashboard, **plus POS/retail, add-to-invoice, family groups & shared payments, the staff payroll calculator, ARM** — and **the eight-limit plan editor that kills M16a's compatibility shim**. | |
| 14 | **M30** waivers & agreements | Templates, e-signature at join, **versioning and re-signature when terms change**, admin view of signed state. Kept separate on purpose: the one item with legal consequence, and the thing that gets under-built as a sub-item. | |
| 15 | **M32** growth & automation | Lead management + conversion board, campaign builder with email/SMS templates, the **automation rules engine** (trigger → condition → action), at-risk conversion. **Not metered** — Wodify sells 2/15/unlimited by tier; we include them. | |
| 16 | **M24** discovery | Browse gyms on the platform, buy a drop-in at one you don't belong to. | |
| 17 | **M25** social | A feed of workouts, public or gym-only, likes and a 1–5 rating. Scoped to workouts on purpose. | |
| 18 | **M26** coach reservation | A coach publishes availability and a profile; an athlete books them; the coach accepts, and chooses how they get paid. | |
| 19 | **Project 2 — The Room** | The coach's live class runner, check-in, and the TV whiteboard — **rebuilt**. **No longer walled off, and no longer after the beta.** It is differentiator #1 and #2 in POSITIONING.md; without it a box will not agree to test. The trade: it runs without the field research it was sequenced to receive. | |
| 20 | **M18** superadmin | Platform-wide console and analytics. Consumes M21's boxless-identity work. | |
| 21 | **M27** Capacitor: iOS & Android | Wraps the existing app as native. **Zero UI change.** Brings **real push**, closing M29's in-app-only gap. Contains calendar time you don't control: app-store review, native Google sign-in, push certificates. | |
| 22 | **M19** landing site | The public marketing site at `/`, app at `/app`. Built from `docs/POSITIONING.md` §7. | |
| 23 | **M20** 2FA | Two-factor for gym owners and superadmins. | |

---

## Then

1. **v1.0 → the pilot** — one friendly box, **free**, real usage. Real classes, members and coaches;
   not billing through rxed, and not shadowing their old tool. Commerce is **built but idle**.
2. **v1.0.1** — bugs the pilot finds.
3. **v1.1.0** — what the box asks for, plus what v1.0 deferred: the **custom report builder**, and the
   **on-demand media library** when rxed earns enough to upgrade the server.

## Pricing — one tier, everything, €99/month

No Essentials/Accelerate/Ultimate, no add-ons, no metering. **Wodify gates Performance Tracking to its
TOP tier**, so at the same price we are not competing with their entry plan — we are competing with
their Ultimate on the only axis a CrossFit box cares about. **Never discount below €99**: their
$199→$99 "for life" offer means their real number is $199.

## Cut from v1.0

**API access, heart rate tracking, 24/7 door access control** (hardware partnerships, not code), and
anything **AI**. **Per-gym website builder** and **per-gym theming** — branding is logo and name only;
the design law's dark-only and single-accent rules were **not** re-opened.

---

## Things deliberately left open

- **Comments on social posts** — in or out, threaded or flat. Deferred.
- **Team workout depth** — score entry only, or full roster splitting.
- **Importing the pilot box's existing members** — no import tooling exists anywhere in this plan.
  Possibly an M15 line item, possibly a one-off script. **Flagged, not scoped.**
- **SMS provider and cost model** — M29. The one channel with a variable bill.
- **Sending gym mail from the gym's own domain** — folded into M28; how far it goes is M28's call.
- ~~**Whether a drop-in charges through the gym's Stripe**~~ — **DECIDED 2026-08-19: it does not.**
  For **PT and drop-ins the coach owns the money** — their own Stripe, or cash settled directly. The
  gym is not in the payment flow. Consequences M22's schema carries:
  - **There is no automatic gym cut.** A box wanting a floor fee records an obligation; the platform
    does not split the payment. Say it out loud — "the gym takes a percentage" is the assumption
    everyone brings, and it is false.
  - **A coach's payout account must NOT be `@TenantId`.** One person, several boxes, ONE Stripe
    account — tenant-scoping it is `docs/TENANCY.md` failure mode 1 exactly. Key it on the user.
  - **The coach manages it from a boxless route** (`/api/me/**`), per TENANCY.md §4.
  - **Still open:** BYO secret keys vs Stripe Connect. Decide at M26's spec.

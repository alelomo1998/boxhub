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

## Phase A — build the product (30 milestones, in order)
*Every screen milestone inherits the design gates: tokens only, the `bh-*` library, the dev-gallery
contract, axe, visual baselines, i18n marking, and **shape → build → critique ≥28/40, no open
P0/P1**, scoped to one screen at a time.*

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 4 | **M13f** consolidation | Made the frontend signal trustworthy before the screen milestones build on it: two standing gates that were red on clean code, a button that silently dropped states, and a dev gallery whose seven-states contract is now **enforced by Karma**. | ✅ **done** |
| 4.5 | **M16a** plan entitlement model | Eight optional limits (entries and cancellations × day/week/month/term) replacing a single `weekly_class_limit`, plus an append-only usage ledger and a per-box cancellation policy. Backend only. **Left a debt: the eight limits have no UI — M16b owns it.** | ✅ **done** |
| 5 | **M23** app entry & shells | The container, shaped as its own object before anything is put in it: the **boxless shell**, the box switcher for someone holding several, and how a person moves between a box, another box, and no box. Today all three shells assume a box. **Ships sketches you can look at at 375 and 1440 before anything is built** — M13e's lesson, *"I shaped the sections and not the structure."* | |
| 6 | **Analytics brief** | **A written brief, not a build**, and moved early on purpose. Asks per role what each stats surface must answer — and **audits whether Phase 1 ever recorded the data**; any migration it forces is a named miss, and a migration is cheap now and ruinous at #27. Owns two questions nothing else does: **"revenue" must be defined before it is charted** (comped subscriptions carry no `payment` row) and **the categorical chart palette does not exist** — one accent and three semantic hues that already mean something, so a five-series chart in volt/green/orange/red tells the reader one series is an error. M17c needs that palette. | |
| 7 | **M29a** messaging | Staff ↔ member 1:1 threads, **both directions, coaches included** — **no member↔member**. Staff shared inbox. Announcements grown up: segments (everyone, one class's roster, expiring members), from the existing `Announcement` entity. | |
| 8 | **M29b** notifications | The event system and the **in-app** inbox with unread badges — waitlist promotion, class cancelled, subscription expiring, new message. **No email notifications** (auth mail is separate). Per-type preferences. Push is **M27c**; the strategy is decided here, so the transport never chooses the product. Before M17 so M17 consumes it. | |
| 9 | **M14b** schedule & classes surfaces | The classes page, the week calendar, `bh-week-calendar` (deferred out of M13c because its API depends on scheduling interactions that did not exist yet), and the admin class-detail modal. Fixes the filed day-pager complaint: no swipe, chevrons outside the thumb zone, no week strip with availability dots — **paging to the next open class can take 13 taps**. | |
| 10 | **M14c-a** the builder | One page for checking a WOD, creating one, and building a class (tour decision 3). Blocks of blocks at two levels, the presets UI over the segment sequence, swipe reorder replacing the arrows, a replacement for the scored checkbox, and **team WOD authoring**. Fixes the filed unbounded-`wod` growth bug at its root: **a block is local to its class unless explicitly saved to the library, default off; re-saving an edited local block updates in place** (tour decision 4). | |
| 11 | **M14c-b** library, benchmarks & types | **The Benchmarks page is deleted** — the WOD library gains a history tab and benchmarks become library entries flagged as such (tour decision 6). **The Types page becomes admin-only** and moves to M15b (tour decision 5 — *"we are permitting our workers to change the structure of the classes? i dont think so"*). Removal of the duplicate function. | |
| 12 | **M17a** athlete: home, book, class detail | The daily surface. Carries the filed defect at `home.page.ts:38` — the next-booking card links to `/athlete/book` instead of `/athlete/class/:id`, which already exists. | |
| 13 | **M17b** WOD board & leaderboard | **Two of the five hero screens**, given their own milestone because identity lives in hero screens and they are where the design language has to be at its best. `athlete/wod` and `athlete/board/:itemId`. | |
| 14 | **M17c** progress, membership & athlete analytics | Progress, membership, athlete profile (`athlete/profile/:membershipId`), **weekly streaks**, and athlete analytics: entries used against the plan's entitlement, attendance, whether the membership is being used to its full value. Also the **RX load category** on the athlete's scoring identity, deferred here from M15's signup-field question — CrossFit RX loads are gendered, and that belongs with leaderboards, not with the account. | |
| 15 | **M15a** admin: members & member detail | Members table, member detail (attendance history, most-frequented classes, entry counts, cancellations now that M14a records them), **subscription change** — an action performed *on a person* — invites (resend, notes, a real view of what was sent), and **at-risk identification + LEG**. Carries the filed responsive defects: the members table clips at 375 and pushes `VISITS` off-screen at **768, a real coach-tablet width**; `bh-data-table`'s card mode exists for exactly this and **nothing adopts it**; the search placeholder truncates to `"Search by name or em"`; and `members.page` search fires **one request per keystroke**. | |
| 16 | **M15b** admin: box settings & public profile | Box settings that drive real booking behaviour and have **never had any UI** — `cancel_cutoff_min`, `booking_horizon_weeks`, and M16a's three cancellation-policy flags. **Branding: logo and name only.** The **Types page**, now admin-only, arriving from M14c-b. The box public-profile editing surface — a box edits its own public page, and that is an admin screen. | |
| 17 | **M16b** admin: plans & entitlements | Plans with per-plan statistics, and **the eight-limit editor** — the first UI able to express a punch-card or a daily cap. **Kills M16a's compatibility shim**: `PlanController.PlanDto`, `SubscriptionController.PlanSummaryDto` and `requireWeeklyLimit` all die here. | |
| 18 | **M16c** admin: payments & commerce | The payment flow, Stripe configuration **including Connect for the box side**, the receipt page (`/receipts/:paymentId`), **POS / mobile retail / add-to-upcoming-invoice**, and **family groups & shared payments**. Carries the filed items: `INVALID_PLAN` / `INVALID_MEMBERSHIP` have no friendly copy; **six mail subject lines are Java literals that never pass through `messages.properties`**, so a German recipient gets an English subject above a German body; and the mail templates duplicate the accent hex across 8 CTA buttons — **the text colour must be centralised with it**, or the next accent change silently reintroduces a 1.1:1 button. | |
| 19 | **M16d** owner dashboard & commerce analytics | The admin dashboard, placed after M15/M16b/M16c so it can aggregate. **ARM** and the **staff payroll calculator** (coach hours from class assignments). Fixes `dashboard.page.ts:89`, which still tells box owners that full analytics "lands with milestone M8". | |
| 20 | **M18** superadmin | Platform console rebuild, cross-box visibility and management, platform analytics (revenue, subscriptions, renewals versus lapses, geography). **The delicate part was never the charts** — a superadmin holds no `box_id` claim, so every `@TenantId` query they trigger used to fail open; **M21 designed that access path**, so this consumes it rather than inventing its own. Carries the filed shared-signal defect where per-row approve/reject actions re-enable each other mid-flight. | |
| 21 | **M30** waivers & agreements | Templates, e-signature at join, **versioning and re-signature when terms change**, admin view of signed state, retention rules. Kept as its own milestone on purpose: the one item with legal consequence, and the thing that gets under-built as a sub-item of a screen. **Must precede M33** — waiver state is an import target. | |
| 22 | **M32a** leads & conversion | Lead capture, the trial → member conversion board, lead notes and ownership. The box's growth loop, and what owners judge software on after month one. | |
| 23 | **M32b** automation & campaigns | The **automation rules engine** — trigger → condition → action — plus the campaign builder and email/SMS templates. Needs M29a/M29b's channels. **Not metered**: Wodify sells 2 / 15 / unlimited automations by tier; we include them. | |
| 24 | **M24** discovery | The box public page, the directory, search, and drop-in purchase and booking for a non-member. Signed-in only. **Knowingly reverses M13d**, which removed "create a box account" and told signups *"you'll need an invite from your gym"* — correct then, exactly backwards once discovery exists: a gym-less account becomes the intended entry path and the box picker's empty state becomes a directory. **Needs brainstorming before planning — four questions are open**: does a box opt in to being listed, who edits the public page, is there location search (and therefore geocoding), and does it reuse M9's PENDING/ACTIVE/SUSPENDED lifecycle rather than inventing a second one. | |
| 25 | **M25** social | The feed, the post composer (authoring through M14c-a's builder, which is why it cannot precede it), public-or-box-only visibility, likes, and the 1–5 dumbbell workout rating. Authoring is coach and box; reading is all three roles. **Comments remain an open product question**, not a scoped deliverable. | |
| 26 | **M26** coach reservation | The coach profile and its builder — strong points, weak points, price. The availability calendar the coach manages. The athlete-facing view of a box's coaches. The request → coach-accepts flow. And **Connect onboarding for a coach who chooses to be paid directly**, with box-collects as the alternative. **Watch for a split at spec time** — this is five surfaces. | |
| 27 | **M33** data import & migration | **CSV-first**, with presets for **Wodify, PushPress, Zen Planner, TeamUp and Mindbody** plus a generic mapping. Dry run → review → commit; idempotent; matching explicit, never guessed. Imports people, subscriptions, the plan catalogue, **attendance history** (LEG depends on it), **performance — WOD scores, benchmark results, lift PRs**, waiver state, class types and schedule, and payment history. **Performance history is the real switching cost for a CrossFit box** — an athlete with four years of Fran times resists a move harder than the owner does. **Last of the data milestones by necessity**: every target schema must be final. APIs are v1.1 at the earliest — Wodify gates API access to its top tier and PushPress's is partner-gated, so a box often *cannot* grant it. | |
| 28 | **M27a** native shell | Capacitor project, iOS and Android builds, safe areas, status bar, back-button, deep links and associated-domain config, offline and error states, and the base-href/routing pass since the app no longer lives at `rxed.app/app`. **Zero UI change** — the design system, component library, gallery contract, baselines and axe suite all survive untouched. That is the entire point. | |
| 29 | **M27b** native auth & storage | **Native Google SSO**, because the current `/oauth2` + `/login/oauth2` redirect chain does not work inside a webview and needs the native plugin. Tokens in Keychain/Keystore rather than cookies. App-level session resume. | |
| 30 | **M27c** push & ALL notifications | FCM and APNs, certificates, device-token registration, the backend push service — and **every notification type routed through it**: waitlist promotion, class cancelled, new message, subscription expiring, announcements. **This is where M29b's in-app-only gap closes.** | |
| 31 | **M34** The Room: the runner | Roster strip, server-authoritative timer, per-piece coach score grid — rebuilt on the current design language. **Auto-arms its timer from the programmed piece with a coach override** (tour decision 9); M14a defined the spec shape in `ClassTimer.spec_json`, and this consumes it. The double entry a coach suffers today ends here. | |
| 32 | **M35** The Room: check-in | The check-in surface, rebuilt. **Measure it against a real 6am Monday rush** — front-desk speed is the thing PushPress wins defectors on, and ours has never been measured. | |
| 33 | **M36** The Room: heats & teams | Heat assignment and running a class in heats; team scoring and roster splitting. **The seam with M14c-a: authoring a team WOD is the builder; assigning heats and running teams is The Room.** Resolves the team-WOD depth question the v3 roadmap left open. | |
| 34 | **M37** The Room: the TV | The whiteboard rebuilt — per-device views, sound, and the giant-timer takeover. The most *visible* piece of software in a box. | |

## Phase B — ship it (4 milestones)

| | Milestone | What it actually does | Status |
|---|---|---|---|
| 35 | **M28** Launch → Production | The deploy, once there is a product to deploy. TLS/HSTS, domain, firewall, SSH hardening, **Postgres backups + a restore drill**, secrets delivery, log retention, CI deploy on green, **real SMTP + SPF/DKIM/DMARC**, error monitoring and uptime, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU PII — and it must cover M33's import, where the box is controller and rxed is processor), rate limits under a class-opening rush, gym-domain mail, and deleting `/app/dev/components`. **Scope was named and deferred by M12c in July — read that spec first or you will rebuild its work.** **`deploy/deploy.sh` has NEVER successfully run**: M12c added a sentinel guard to a script that has never executed, so expect to debug the script as well as the deploy. The two nginx configs must be unified first — `docker/nginx-tls.conf` is a 154-line hand-maintained copy of `docker/nginx.conf`. | |
| 36 | **M27d** store release | Listings, screenshots, privacy declarations, TestFlight and internal testing, review submission. **Cannot precede M28** — Apple and Google review the app against a real backend, not localhost. Mostly calendar time and fixing rejections. | |
| 37 | **M19** landing site | The public marketing site at `/`, application under `/app`. Built from `docs/POSITIONING.md` §7. Independent of box pages, which stay signed-in-only. The natural forcing point for **icon assets beyond the favicon** — no `apple-touch-icon`, no web manifest, no `theme-color` today, and M27a wants them too. **Decide first what happens to the `oc/m19-landing` branch and its 9 commits.** | |
| 38 | **M20** 2FA / TOTP | Two-factor for box owners and superadmins. Small, independent, no reason to be earlier. | |

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

- **Comments on social posts** — in or out, threaded or flat. Deferred by the user.
- **M24's four questions** — box opt-in to listing, who edits the public page, location search and
  geocoding, and whether it reuses M9's PENDING/ACTIVE/SUSPENDED lifecycle. **Brainstorm before
  planning M24.**
- **Which platform presets ship in M33** — Wodify, PushPress, Zen Planner, TeamUp and Mindbody are
  named; whether all five ship or the pilot box's own platform ships first is M33's call.
- **API connectors for import** — v1.1 at the earliest, demand-driven.
- **SMS provider and cost model** — M29a/M32b. The one channel with a variable bill.
- **Sending gym mail from the gym's own domain** — folded into M28; how far it goes is M28's call.
- **The `oc/m19-landing` branch** — 9 commits, still alive. Starting point or deleted? M19 decides.
- **The six questions the coach tour left open** — coach visibility of other coaches' classes and
  tracking who actually *ran* a class versus who was assigned it; what "admin sees everything" means
  screen by screen; what replaces the scored checkbox; whether swipe reorder applies to both block
  levels; team WOD depth (**now answered by the M14c-a / M36 seam**); and the mobile basics pass
  across the programming pages.
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

## Corrections to the v3 roadmap, found 2026-08-22

- **The quarantined TV/SSE defect is FIXED.** The v3 doc tells Project 2 not to forget `runner.spec`'s
  `test.fixme()`'d TV half; M13f found it **passing since M21**. Recorded debt that no longer exists —
  the same decay M13f found in half its inherited list. **Verify before planning against it.**
- **The beta no longer walls off The Room, and Project 2 no longer follows the beta.**
- **The production deploy is no longer unscheduled.** It is M28.

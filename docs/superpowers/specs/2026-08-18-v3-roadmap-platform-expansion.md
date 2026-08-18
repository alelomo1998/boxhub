# v3 roadmap — the platform program (2026-08-18)

**Supersedes `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md` in full.** That
document is retired. Do not plan against it; it is kept only as the record of how the box product
was decomposed.

**Also deletes `PROJECT 3 (proposed) · Box discovery` from `docs/BACKLOG.md` as a separate project.**
Its content is absorbed here whole, on the user's instruction: *"i want to DELETE part 3 and migrate
all in part 1 because i recognize them like a core function of rxed."* Nothing in that backlog
section is lost — every concern it raised is carried into M21, M22, M23 and M24 below.

This is a **decomposition**, not a spec. It fixes the phases, the order, the boundaries and what
each milestone owns. Each milestone still gets its own brainstorm → spec → plan → execute cycle.

---

## Why v2 is retired, and why its NUMBERING is not

v2 was not wrong. It was a decomposition of the **box product** — the thing rxed was on 2026-08-02 —
and it executed cleanly: M13a, M13b, M13c, M13d and M13e all shipped against it.

It is retired because on **2026-08-18** the product's definition changed. rxed is no longer a
platform a box runs; it is a platform a *person* uses, which may or may not involve a box they
belong to. Four pillars were added, and all four land **before** the beta:

1. **Multi-box and discovery.** An account can exist with no box. A user browses boxes registered on
   the platform, holds active subscriptions at more than one, switches between them, and buys a
   drop-in at a box they do not belong to.
2. **Social, scoped strictly to workouts.** A coach or a box publishes a workout built in the coach's
   own builder — public, or visible only to that box's members. Likes, a 1–5 dumbbell rating, and a
   feed. Deliberately not a general-purpose social network.
3. **Personal reservation with a coach.** A coach publishes their own availability; an athlete of
   that box books a session; the coach accepts. A coach profile page carries strong points, weak
   points and price.
4. **Native iOS and Android**, via Capacitor. `rxed.app/app` keeps working unchanged.

**The v2 numbering is deliberately NOT retired a second time.** v2 retired v1's numbers because their
*content* no longer existed. Here the opposite is true: M14 through M20 keep their contents almost
unchanged, and roughly fifteen entries in `docs/BACKLOG.md` are filed by destination milestone
(`→ M15 Admin: people`, `→ M16 Admin: commerce`, `→ M17 Athlete`, `→ M18 Superadmin`). Renumbering
would invalidate every one of those labels and buy nothing. **The order changes; the labels do not.**

| v2 milestone | Fate in v3 |
|---|---|
| M14 class model, schedule, all program schema | **Split three ways** — M14a (model), M14b (schedule surfaces), M14c (builder). Its "carries every schema change" rule is overturned; see Boundaries. |
| M15 admin: people | Unchanged. Moves to Phase 4, after the analytics brief. |
| M16 admin: commerce | Unchanged, **plus Stripe Connect configuration**. Phase 4. |
| M17 athlete | Unchanged. Moves **earlier**, into Phase 2 with the rest of the athlete-facing work. |
| M18 superadmin | Unchanged. Phase 4. |
| M19 landing site | Unchanged and **still independent** — box pages are signed-in-only, so they do not merge with it. Phase 5. |
| M20 2FA / TOTP | Unchanged. Phase 5. |
| Project 2 — The Room | **Moves to last**, after the beta. Gated behind an "in development" wall while the beta runs. |
| Launch → Production | **Dissolved.** The production deploy is unscheduled and user-triggered; the beta is its own phase; v1.0 follows Project 2. |

**New milestone numbers**, taking the next free labels rather than reshuffling:
M13f, M21, M22, M23, M24, M25, M26, M27.

---

## The decisions this document rests on

Taken 2026-08-18, in one brainstorming session, and recorded here so that no later milestone has to
re-derive them.

| # | Decision | Why it matters later |
|---|---|---|
| 1 | **All four pillars ship before the beta.** | Named cost, accepted: the beta moves out by roughly the size of M0–M13e again, and discovery and social are built against zero real usage. Raised, reaffirmed, proceeding. |
| 2 | **Stripe Connect enters scope. The coach chooses their payout path** — the box's Stripe collects and the box pays them, or the coach holds their own connected account and is paid directly. | Overturns a locked decision. See Boundaries. Brings connected-account onboarding, KYC, payouts, disputes and tax reporting into the product. |
| 3 | **A drop-in charges through the box's own Stripe**, not Connect — a drop-in is a box product. | **Assumption, not a stated decision.** Confirm at M22 before its schema is cut. |
| 4 | **A coach is always a member of a box**, booked through that box, and a membership or a drop-in is required to book them. Their profile is publicly visible on the box's public page. | Keeps the coach pillar one milestone instead of two, keeps Connect opt-in rather than mandatory infrastructure, and avoids a second cold-start problem — a coach directory with six coaches reads worse than a box directory with six boxes. |
| 5 | **Capacitor only. No Ionic.** | Ionic is a UI component library; adopting it would discard M13b and M13c — the tokens, the `bh-*` component library, the dev gallery that is their contract, 88 visual baselines and 29 axe cases. Capacitor is the native runtime and changes no UI. |
| 6 | **Discovery is signed-in only.** No SSR, no prerendering, no render server. | Keeps Angular a client-rendered SPA behind nginx, keeps M19 independent, and keeps box pages in product register rather than marketing register. Trade accepted: a box cannot share its rxed page with a non-user. |
| 7 | **The 1–5 dumbbell rating attaches to workouts only.** Boxes and coaches show objective facts — schedule, location, photos, plans, who coaches there. | No public-reputation moderation surface on day one: no takedown queue, no right of reply, no policy for a coach's first one-star. Revisit when there are enough boxes for an average to mean anything. |
| 8 | **"Backend first" means schema, domain model and tenancy — NOT endpoints.** | Migrations are one-way and expensive to get wrong; endpoints and DTOs are cheap to change and are exactly what suffers from being designed screen-blind. See the Phase 1 rule below. |
| 9 | **The Room is last**, after the beta, walled behind an "in development" gate while the beta runs. | What that gate actually looks like is an open question, recorded below, not decided here. |
| 10 | **The production deploy is unscheduled and user-triggered.** | It is not a phase and has no position in this document. Readiness list below. |

---

## The program

### Phase 1 — Backend foundations

Schema, domain model and tenancy. **No endpoints, no DTOs, no screens.**

**The binding rule for this phase.** The coach tour already decided the opposite instinct, in these
words: *"Team WODs are scoped in M14, designed at the screen. Deliberately not modelled against no
screen — that is how `bh-stat` happened."* Phase 1 models three pillars' worth of schema before any
of their screens exist, so it carries a mitigation rather than pretending the tension away:

> **Every Phase 1 milestone must state, in its spec, what it deliberately does NOT model** — and why
> that shape is a screen's decision rather than a table's. Phase 3's analytics brief is the
> checkpoint that catches what Phase 1 missed. Any migration Phase 3 forces is recorded as a named
> exception, not discovered as a surprise.

**M14a — class & programming model.** Split `class_templates` into `class_type` × `schedule_slot`.
That table currently holds a class's identity (`name`, `image_path`, `coach_id`) and its weekly slot
(`weekday`, `start_time`, `duration_min`, `capacity`) in one row, which is why there is no page that
can describe a class and no way to schedule the same class twice. Then, from the coach tour
(`2026-08-09-m14-coach-tour.md`, decisions 1, 2, 7, 8): the three-axis piece — **macro + timing +
score**, score set explicitly rather than derived; **block nesting at exactly two levels**, macro
block → exercise blocks; **timing as a segment sequence**, a segment being `(duration, kind:
work/rest, optional movement/label)`; and AMRAP / EMOM / Tabata / For-time as **presets over that
sequence, not types**. Note that `PieceTypes.ALL` today is one flat list mixing timing schemes with
section kinds, and has no TABATA in it at all.

Also carries, because they are one-way and cheap to batch here:

- **Cancellation history.** `BookingService.java:79` does `bookings.delete(booking)` — cancel
  destroys the row. "Who cancels a lot", "late-cancel rate", "cancellations this month" are
  therefore not hard but *impossible*, and every day without this is history that never existed.
- **Country**, for M18's geographic analytics. Nothing stores it today.

Deliberately not modelled here: **team WOD depth** (tour decision 10), and the runner's timer spec —
`ClassTimer.spec_json` is a free-form text column, so a richer spec needs no migration.

**M21 — identity & tenancy for multi-box.** The most dangerous milestone in this program.

The good news, verified against the code on 2026-08-18 rather than assumed: **multi-box already
works at the identity layer.** `Membership` is deliberately **not** `@TenantId`;
`MembershipRepository.findByUserIdWithBox` already returns every box a user belongs to; the box
picker and the user-token → box-token exchange already ship; and `uq_subscription_active` (V14) is
unique on **`membership_id`**, not on user. Membership is per `(user, box)`. **Two active
subscriptions at two boxes is already legal in the schema today** and needs no migration.

What is genuinely new is the **boxless account** and the **cross-box read path**, and the second one
is the hazard. 42 files carry `@TenantId`, and `docs/TENANCY.md` is explicit that the failure mode is
a *wrong ambient tenant*, and that a genuinely tenant-less read fails **OPEN to root** rather than
closed. A directory reads across all boxes with no box token at all. So this milestone owns:

- A deliberately designed access path for cross-box reads — native SQL or an explicit unfiltered
  projection, decided here and documented in `docs/TENANCY.md`, not improvised per feature.
- Its own conformance coverage. `AuthzConformanceTest` defaults to DENY, so every new boxless route
  must declare its intent in `MIN_ROLE`. **The orchestrator, not an executor, audits every edit to
  that file** — this is a `CLAUDE.md` rule and it applies with unusual force here.
- The boxless session: what a token with no `box_id` claim may read, and what it may never write.
- The box-switch model, and what happens to `TenantContext` when a user holds three boxes.

This milestone is a strong candidate for orchestrator-implemented work rather than executor work,
under `CLAUDE.md`'s "genuinely difficult or delicate" clause — tenancy is named in it explicitly.

**M22 — new-domain schema.** Box public profile (location and therefore geo, photos, description,
opening hours, whatever a consultable page needs); coach profile and availability; the drop-in;
social posts, likes and workout ratings; Connect connected-account records.

Two constraints inherited from the deleted Project 3 section, carried so they are not rediscovered:

- **M11 made media reads signed and short-lived. A public box page contradicts that** and must
  resolve it here, not at the screen.
- **Staff names and photos are personal data belonging to people who are not the account holder.**
  `GET /api/me/export` and the anonymizing `DELETE /api/me` must cover whatever this milestone adds.
  The project is the processor and EU gyms are the controllers; these flows are not optional extras.

Deliberately not modelled here: **comment threading on social posts** — the user has explicitly left
comments open (*"the comment idk if it's good to integrate them we will think about"*), and a thread
model built against no screen is exactly what the Phase 1 rule forbids.

### Phase 2 — Athlete and coach frontend

Eight milestones. Every one of them ships screens, so every one inherits the design gates: tokens
only, the `bh-*` component library, the dev gallery contract, axe, visual baselines, i18n marking,
and the per-screen cycle **shape → build → critique ≥28/40, no open P0/P1**.

**M13f — consolidation.** Opens the phase because everything below renders with it. Closes the debt
M13c/M13d/M13e left in the shared layer:

- **`bh-button`'s variant matrix.** Three inputs arrived in one milestone (`ariaDisabled`,
  `dangerBorder`, `solid`), each individually justified and reviewed. Judged together, **8 of the 10
  variant × flag combinations emit a class with no matching rule and fail silently.** This is the
  component every screen in Phases 2 and 4 is built from. Fold the flags into `variant`.
- **The dev gallery's `data-gallery` sections are coupled through scroll position**, so any edit
  changing one section's height cascades dirty baselines for every section after it — M13e's `solid`
  addition dirtied 54 unrelated files this way. Decouple by resetting scroll/viewport per section
  screenshot. This is a velocity item: every milestone below pays it otherwise.
- **The account area's cross-section consistency pass**, skipped when Task 14 was never executed —
  button sizes differing across four sections, heading→content spacing differing, and `t-h3`
  resolving to `--fs-body` so no heading tier is actually in use.
- **The delete sheet has no axe coverage.**
- Small filed items that belong to the shared layer rather than to a screen:
  `passwordErrorMessage()` returning unmarked English for two codes (six consumers), and
  `AccountService.startEmailChange` sending mail from **inside** an `@Transactional` method, against
  the house rule.

**M23 — app entry & shells.** The container, shaped as its own object before anything is put in it.

Today the app is: log in → pick a box → one of three shells, **all of which assume a box**. A boxless
account has no shell at all. This milestone owns the boxless shell, the box switcher for a user
holding several, the app's home for each case, and how a person moves between a box, another box,
and no box.

> **This milestone exists because of M13e's first lesson**, and the v3 doc states it rather than
> assuming it: *"I shaped the sections and not the structure."* Every defect the user rejected on
> sight in M13e came from a navigation and chrome layer that never went through shape — including a
> spec rule that structurally contradicted the design the same spec promised. **M23 ships sketches
> the user can see, at 375 and 1440, before any of it is built.**

**M14b — schedule & classes surfaces.** The classes page, the week calendar, `bh-week-calendar`
(deferred out of M13c because its API is decided by scheduling interactions that did not exist yet),
and the admin class-detail modal. Carries the filed day-pager complaint: no swipe, chevrons outside
the thumb zone, no week strip with availability dots — paging to the next open class can take 13 taps.

**M14c — the builder.** One page for checking a WOD, creating one, and building a class (tour
decision 3). Blocks of blocks at two levels. The presets UI over the segment sequence. Swipe reorder
on mobile, replacing the arrows. A replacement for the scored checkbox. Team WODs, **scoped here and
designed at the screen**. Removal of the duplicate function. And the fix for the filed unbounded-`wod`
growth bug, which exists precisely because one page did two jobs implicitly: **a block is local to its
class unless explicitly saved to the library, default off; re-saving an edited local block updates in
place** (tour decision 4).

Two reassignments from the tour land here or adjacent: **the Types page becomes admin-only** (tour
decision 5 — *"we are permitting our workers to change the structure of the classes? i dont think
so"*), moving to M15; and **the Benchmarks page is deleted**, the WOD library gaining a history tab,
with benchmarks becoming library entries flagged as such (tour decision 6).

**M14c is the social layer's authoring tool**, so M25 cannot precede it.

**M17 — athlete.** Home, book, progress, membership, the WOD board (`athlete/wod`) and the
leaderboard (`athlete/board/:itemId`) — two of the five hero screens — class detail
(`athlete/class/:id`) and athlete profile (`athlete/profile/:membershipId`). Athlete analytics:
entries used against the plan's entitlement, attendance, whether the membership is being used to its
full value.

Carries two known defects:

- `home.page.ts:38` links the next-booking card to `/athlete/book` instead of `/athlete/class/:id`,
  which already exists.
- **Waitlist promotion is silent.** `BookingService` promotes `WAITLIST` → `BOOKED` at line 85 and
  contains **zero** Mailer references; there is no `waitlist-promoted` template among the eleven. An
  athlete gets a spot and is never told — so they either arrive not knowing they are in, or stay away
  while holding a place someone else wanted. Live since M2. Mail fires strictly after commit.

Also **decides the notification strategy** for the whole product — today rxed can reach an athlete
only by email, and only for account events. **Delivery of push is M27's job; the strategy is decided
here**, and that seam is deliberate: deciding notifications inside the native milestone would let the
transport choose the product.

**M24 — discovery.** The box public page, the directory, search, and the drop-in purchase and booking
for a non-member. Signed-in only.

**This milestone reverses a decision M13d shipped**, and must do so knowingly: M13d removed "Create a
box account" from login and added *"you'll need an invite from your gym"* to signup, because signing
up without a gym dead-ended on an empty box picker. **Under discovery that is exactly backwards** — a
gym-less account becomes the intended entry path and the box picker's empty state becomes a directory.
Both changes were correct for the product as it stood.

Open at spec time, carried from the deleted Project 3 section: does a box opt in to being listed?
Who edits the public page — the box or the platform? Is there search by location, and does that mean
geocoding? Does the public page hang off M9's existing PENDING/ACTIVE/SUSPENDED lifecycle and
superadmin approval queue rather than inventing a second one?

**M25 — social.** The feed, the post composer (authoring via M14c's builder), public-or-box-only
visibility, likes, and the 1–5 dumbbell workout rating. Authoring is coach and box; reading is all
three roles. Roughly 100 characters of caption plus the WOD. **Comments are an open product
question**, not a scoped deliverable.

**M26 — coach reservation.** The coach profile page and its builder — strong points, weak points,
price. The availability calendar the coach manages. The athlete-facing view of a box's coaches and
their calendars. The request → coach-accepts flow. And **Connect onboarding for a coach who chooses
to be paid directly**, with the box-collects path as the alternative.

### Phase 3 — Analytics brief

**A written brief, not a build.** What each admin and superadmin analytics surface actually needs to
answer, per role — *"an athlete asks am I getting my money's worth, an owner asks who is lapsing and
which classes fill, the platform asks what is revenue by geography"* — and, for each, whether Phase 1
actually recorded the data.

It is also **the audit of Phase 1**. Any migration it forces is a named exception to Phase 1's
completeness, recorded as such. Two known questions it must answer: **"revenue" must be defined
before it is charted**, since comped subscriptions carry no `payment` row; and **the categorical
chart palette does not exist** — there is one accent and three semantic hues, all three of which
already mean something, so charting a five-series breakdown in volt/green/orange/red tells the reader
one series is an error and another is a warning. Constraints for whoever designs that ramp are in
design law v3 §17.

### Phase 4 — Admin frontend

**M15 — admin: people.** Members table, member detail (attendance history, most-frequented classes,
entry counts, cancellations now that M14a records them), **subscription change** — an action performed
*on a person*, so it lives here — invites (resend, notes, a real view of what was sent), and box
settings including `cancel_cutoff_min` and `booking_horizon_weeks`, which exist in the schema, drive
real booking behaviour, and have never had any UI. Plus **the Types page**, now admin-only, and **the
box public profile editing surface** — a box edits its own public page, and that is an admin screen.

Carries the filed responsive defects found by the M13c critique: the members table clips below its
designed width at 375 and pushes `VISITS` off-screen entirely at 768 — a real coach-tablet width —
and `bh-data-table`'s card mode exists precisely for this and **nothing adopts it**. Adopting it is
this milestone's job. Also: the search placeholder truncates at 768 to `"Search by name or em"`, and
`members.page` search fires one request per keystroke.

Also owns the deferred **signup field question** — birthday, gender, address — where the standing
analysis is that *gender is probably not a signup field at all*: CrossFit RX loads are gendered, so
what the product needs is an RX load category on the athlete's scoring identity, which belongs with
leaderboards in M17, not with the account.

**M16 — admin: commerce.** Plans with per-plan statistics, the payment flow, Stripe configuration
**including Connect for the box side**, the receipt page (`/receipts/:paymentId`), and the admin
dashboard — placed after M15 so it can aggregate. Carries the filed items: `INVALID_PLAN` /
`INVALID_MEMBERSHIP` have no friendly copy; six mail **subject lines** are Java literals that never
pass through `messages.properties`, so a German recipient gets an English subject above a German
body; the mail templates duplicate the accent hex across 8 CTA buttons and **the text colour must be
centralised with it**, or the next accent change silently reintroduces a 1.1:1 button; and
`dashboard.page.ts:89` still tells box owners that full analytics "lands with milestone M8".

**M18 — superadmin.** Console rebuild, cross-box visibility and management, platform analytics
(revenue, subscriptions, renewals versus lapses, geography). **The delicate part was never the
charts** — a superadmin holds no `box_id` claim, so every `@TenantId` query they trigger fails open.
**M21 has now designed that access path**, which is the single biggest change to this milestone's
risk profile: it consumes M21's work rather than inventing its own. Carries the filed shared-signal
defect where per-row approve/reject actions re-enable each other mid-flight.

### Phase 5 — The rest

**M27 — Capacitor: iOS and Android.** Wrap the existing Angular build. **No UI change** — the design
system, the component library, the gallery contract, the baselines and the axe suite all survive
untouched, which is the entire point of decision 5.

What this milestone actually contains, none of which is optional: Apple and Google developer accounts
and their review cycles, which are **calendar time, not work time**; a **native Google SSO flow**,
because the current `/oauth2` + `/login/oauth2` redirect chain does not work inside a webview and
needs the native plugin; FCM and APNs to deliver the notifications **M17 already decided**;
associated-domain configuration for deep links; and a base-href and routing pass, since the app no
longer lives at `rxed.app/app`.

**M19 — landing site.** The public marketing site at `/`, application under `/app`. Still
independent of the box pages, because decision 6 made those signed-in-only. The `Components` sections
of the 74 reference systems in `docs/design-md/` are exactly this material: hero bands, pricing tiers,
feature grids, testimonials, logo walls, CTA banners, footers. Also the natural forcing point for
**icon assets beyond the favicon** — there is no `apple-touch-icon`, no web manifest and no
`theme-color` today, and M27 will want them too.

**M20 — 2FA / TOTP.** For box owners and superadmins. Relocated intact from the old v1 M14.

### The beta

A real box, on a real deploy. **The Room is walled behind an "in development" gate**; everything else
is complete and working on web, iOS and Android.

**The beta is explicitly a learning exercise** — *"the beta test is needed to fix bugs and
implements/remove functionality."* This overturns a v1 rule; see Boundaries. Functionality may be
added or removed as a result of it, and that is the point rather than a failure.

### Project 2 — The Room

Coach runner, check-in, TV, heats and teams, per-device views, sound. Field research in real boxes
was always step one of this project, and the beta is what supplies it.

The coach's *programming* surfaces are explicitly **not** here — they are M14a/M14c.

**Carried in, and it must not be forgotten:** `runner.spec`'s TV half is `test.fixme()`d because a
coach starts a timer and the TV never learns about it over SSE — frames arrive carrying
`data-timer="none"`. **A real defect in shipped code**, quarantined as a scope decision, not a verdict
that it is minor. Evidence, reproduction recipe and re-enable trigger are at the top of
`docs/BACKLOG.md`.

**Amendment to the "coach splits in two" boundary**, needed because the coach tour crossed it:
tour decision 9 says *"the runner auto-arms its timer from the programmed piece, with a coach
override"*, which is a change to the runner, and the runner is Project 2. **Resolution: M14a defines
the timer spec shape** — `ClassTimer.spec_json` is a free-form text column, so this costs no
migration — **and Project 2 consumes it and builds the auto-arm.** The double entry the coach suffers
today survives until then, which is a stated cost rather than an oversight.

### v1.0

After Project 2.

---

## The production deploy is unscheduled

**It happens when the user decides, on their timing.** It is not a phase and has no position in this
document. The readiness list is recorded here only so that whenever it is called, the work is
enumerated rather than discovered:

- **`deploy/deploy.sh` has never successfully run.** M12c added a sentinel guard to a script that has
  never executed. Whoever runs it first should expect to debug the script as well as the deploy.
- **The Google OAuth `redirect_uri`** only breaks against a real `https://` registration in the
  Google console. It shipped broken from M8 to M12c, and M13a changed that exact value again.
- **Whether email arrives.** Mailpit accepts everything. A real provider without SPF/DKIM/DMARC drops
  verification links into spam and **the entire auth flow dies silently.**
- `BOXHUB_COOKIE_SECURE`, HSTS, the security headers and the CSP under TLS are all provable locally
  via the `tls` compose profile, and that check has been available since M13a.
- The two nginx configs must be unified first, or drift bites here: `docker/nginx-tls.conf` is a
  154-line hand-maintained copy of `docker/nginx.conf`.

---

## Boundaries — carried forward, and what each protects

- **Every route has exactly one milestone.** Load-bearing: v2's first draft left seven screens
  unassigned, including two of the five hero screens. When a screen is added, it gets a milestone in
  the same commit. **This applies with full force to the new pillars** — every discovery, social and
  coach-reservation screen is named above.
- **Analytics is per-role, never a milestone.** An athlete asks "am I getting my money's worth", an
  owner asks "who is lapsing and which classes fill", the platform asks "what is revenue by
  geography". Three different products. Phase 3's brief is a *brief*, not a milestone, precisely to
  keep this true.
- **Actions on a person live with the person.** Changing a subscription is M15, not M16 — v2's first
  draft split that flow across two milestones.
- **Coach splits in two.** Runner, check-in and TV are Project 2. Types, WOD library, Builder and
  Movements are programming, and belong with the entities they edit. **Amended above** for the timer
  spec seam.
- **Shape the container, not only the contents.** M13e's first lesson, now a boundary. If a milestone
  introduces navigation, a shell, or a way of moving between things, that is a design object in its
  own right, needs its own shaping, and needs sketches the user can *see*. M23 exists because of this
  rule.
- **A code review does not discharge the design gate.** M13e's second lesson, also now a boundary.
  M13e passed fourteen code reviews and a clean whole-branch review and was declared ready to merge
  without `/impeccable critique` ever running; the critique then found three P1s no test caught,
  because all three were invisible from source. **Every milestone that ships screens budgets for the
  critique explicitly.** Both lessons are the same shape: running the ceremony on the parts and not
  on the whole.
- Everything binding in `CLAUDE.md` — milestone lock, Flyway-only schema, tenancy resolved only from
  the JWT, the authz conformance sweep, mail-after-commit and audit-inside-transaction, the design
  law, the i18n obligation on every rebuilt screen, and the orchestrator/executor model.

## Boundaries — discharged, and therefore deleted

These were live constraints in v2 and are now satisfied. They are recorded as done so that no future
document reprints them as if they still bind.

- **"No product screen is redesigned before M13c."** M13c shipped 2026-08-06.
- **"The `/app` migration is plumbing, and lands early, in M13a."** Done.
- **"The name must be settled before M13b starts."** Done — the product is **rxed**.

## Boundaries — overturned, and what each was protecting

- **"M14 is the schema milestone, and carries every schema change the program needs."**
  *Protected:* dribbling one migration per milestone, and letting analytics screens get built before
  anyone asked what data they need. *Why it breaks:* the new pillars need schema in domains M14 knows
  nothing about — box profiles, coach availability, posts, ratings, connected accounts — and batching
  them into M14 means designing social's schema before social has a screen, which is the `bh-stat`
  mistake the coach tour explicitly refused to repeat. *Replacement, which keeps the reason:*
  **schema is designed against a screen, and batched within its own milestone rather than dribbled
  per task.** Phase 1 is the deliberate, bounded exception, and carries the "state what you did not
  model" rule to pay for it.
- **"Athletes pay boxes via the box's own Stripe keys — no Connect, rxed never touches funds."**
  *Protected:* no KYC, no payouts, no disputes, no tax reporting, no money-handling code, and no
  platform liability. *Why it breaks:* decision 2 lets a coach be paid directly, and there is no way
  to do that without a connected account. *Cost, stated:* rxed becomes a platform of record for at
  least some flows, with the compliance surface that implies.
- **"Pilot = the launch, not a learning exercise."** *Protected:* shipping a half-product to a real
  box and calling the resulting scramble "learning". *Why it breaks:* the user has defined the beta as
  the place where bugs are fixed and functionality is added or removed. *Replacement:* the product is
  complete **except the Room**, the Room is explicitly gated rather than broken, and **v1.0 comes
  after the beta and after Project 2** — so the original rule's protection is preserved by the
  completeness requirement rather than by the pilot's name.
- **"The first real VPS deploy happens when Project 1 is complete."** *Protected:* a half-built
  product being exposed to the internet. *Why it breaks:* the user owns this timing. *Replacement:*
  the readiness list above, maintained, so the deploy is enumerated work whenever it is called.
- **`PROJECT 3 (proposed) · Box discovery` as a separate project.** Deleted; absorbed into M21, M22,
  M23 and M24.

---

## Open questions, deliberately not answered here

Recorded rather than guessed, per the standing rule that a UI decision is asked at the screen.

- **Comments on social posts** — in or out, and if in, threaded or flat. User has explicitly deferred.
- **Team WOD depth** — score entry only, or roster split, which overlaps heats/teams in Project 2.
- **What the Room's "in development" gate actually is** — a feature flag, a placeholder screen, a
  hidden route. Decided before the beta, not now.
- **Whether a drop-in charges through the box's Stripe** — assumed in decision 3, confirm at M22.
- The six questions the coach tour left open at §4: coach visibility of other coaches' classes and
  tracking who actually *ran* a class versus who was assigned it; what "admin sees everything" means
  screen by screen and whether it is editable; what replaces the scored checkbox; whether swipe
  reorder applies to both block levels; team WOD depth; and the mobile basics pass across all the
  programming pages.
- The four questions carried from the deleted Project 3 section, listed under M24.

## Out of scope for the whole program

Everything in `docs/BACKLOG.md` under Watch-list and Accepted. Items retired from the old v1
M15/M16/M17 stay in the backlog, unscheduled, until something forces them. Ratings on boxes and
coaches, and any moderation, reporting or right-of-reply machinery, are out until decision 7 is
revisited. Search-engine indexing of box pages, and therefore SSR, is out until decision 6 is
revisited.

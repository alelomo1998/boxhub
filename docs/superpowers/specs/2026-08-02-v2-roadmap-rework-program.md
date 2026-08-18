# v2 roadmap — the rework program (2026-08-02)

> # RETIRED — 2026-08-18
>
> **Superseded in full by `docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`.
> Do not plan against this document.**
>
> It is kept only as the record of how the box product was decomposed, and because M13a–M13e were
> executed against it. Its milestone *numbering* carries forward into v3 unchanged — M14 through
> M20 keep their labels — so backlog entries filed by destination are still valid. What changed is
> the **order**, the **phasing**, and the addition of four product pillars that did not exist when
> this was written: multi-box and discovery, workout-scoped social, coach personal reservation, and
> native iOS/Android via Capacitor.
>
> Four boundaries below are **overturned** in v3 and are no longer binding: *"M14 carries every
> schema change the program needs"*, *"no Connect, rxed never touches funds"*, *"the first real VPS
> deploy happens when Project 1 is complete"*, and v1's *"pilot = the launch, not a learning
> exercise"*. Three more are **discharged** rather than overturned, because they were satisfied:
> the pre-M13c redesign freeze, the `/app` migration, and settling the product name. v3 records
> what each one was protecting.

**Supersedes the M12–M17 half of `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.**
Project 2 (The Room) and the Launch phase in that document stand unchanged.

This is a **decomposition**, not a spec. It fixes the order, the boundaries and the numbering.
Each milestone below gets its own brainstorm → spec → plan → execute cycle.

> **Revised the same day, after a hard review.** The first draft of this document had real holes:
> seven screens with no milestone (including two of the five hero screens), a milestone boundary
> that split a single user flow in half, no i18n anywhere, and an Angular upgrade that silently
> contained a test-runner migration. Those are fixed below. The review is the reason the program is
> worth anything; it found more in an hour than the first pass did in three.

## Why the old numbering is retired

M13–M17 on the v1 roadmap were one-line sketches, never specced, written before a full tour of the
built product. A tour on 2026-08-02 replaced them with concrete, observed requirements. The old
numbers are retired rather than renamed, because their content no longer exists in that shape:

| Old | Fate |
|---|---|
| M13 analytics (lean) | **Absorbed.** Analytics is not a milestone — it is a section of each role's milestone, because the questions an athlete, a box owner and the platform operator ask have nothing in common. |
| M14 2FA / TOTP | **Relocated intact** to M20. |
| M15 programming & tracking depth | **Partly absorbed** into M14 (the class-model refactor). The rest stays in `docs/BACKLOG.md`, unscheduled. |
| M16 payments depth | **Partly absorbed** into M16-new. Stripe recurring, class-packs, refunds and proration stay in the backlog. |
| M17 platform & accounts | **Partly absorbed** into M18. Box deletion and the full audit log stay in the backlog. |

## The program

### M13 — Foundations *(a phase, not a milestone — split M13a–M13d)*

Too large to run as one unit: three Angular majors plus a test-runner migration, a URL migration,
i18n from zero, a re-opened visual language, ~22 components, and eleven screens. Split following the
M12a/b/c pattern this project already uses. **The order is forced**, not stylistic: i18n must precede
components (every component carrying user-facing text needs markers), and the language must precede
components (components encode it).

**M13a — Baseline.** Angular 19.2→22, **including the Karma→Vitest migration** (Angular 20
deprecated Karma, 21 defaulted to Vitest, **22 removes Karma entirely** — our 184 specs run on it).
The `/app` migration with the `BOXHUB_APP_URL` split and permanent redirects for already-sent
emailed links. Full i18n infrastructure: `@angular/localize`, locale-aware dates, numbers and
currency, and per-locale mail templates. **Zero visual change** — every screen must look identical
before and after, which is precisely what makes this milestone verifiable.

**M13b — Design language.** The visual language is **re-opened, assuming replacement**: warm
broadcast is treated as a first draft. Input is the 74 extracted design systems in `docs/design-md/`
(their Colors, Typography, Layout, Elevation, Shapes and Do's-and-Don'ts sections — their Components
sections document marketing sites and are M19 material), plus `ui-ux-pro-max`. Deliverables: a
decided direction proven on a real screen, a new `_tokens.scss`, a rewritten `DESIGN.md`, and a
design law superseding `2026-07-08-design-system-design.md`.

> **The identity BRIEF carries forward; only its EXECUTION is up for replacement.** "Gyms are dark,
> the room is the product, identity lives in hero screens while plumbing stays
> conventional-and-excellent" is product thinking, not a palette. Discarding warm espresso and race
> red does not require discarding that.
>
> **i18n constrains this work.** Italian and German strings run 20–35% longer than English, so a type
> scale and control sizing chosen against English breaks under translation. Another reason M13a comes first.

**M13c — Component library.** ~22 components against the decided language, the dev-only gallery at
`/app/dev/components`, plus visual-regression and axe-core WCAG checks (both restored — they were
cut with a schedule argument, and there is no schedule).

**M13d — Auth & account screens.** Eleven screens as the library's first real consumer: login,
signup, start-a-box, box picker, check-email, verify, forgot, reset, join, `account/security`,
`account/email`.

### Local HTTPS check in M13a — the production deploy stays at the end of Project 1

**The first real VPS deploy happens when Project 1 is complete**, per the v1 roadmap. That is
unchanged and deliberate. An earlier draft of this document scheduled a staging deploy after M13a;
that was corrected on 2026-08-02.

What M13a does instead is a **local HTTPS setup** — self-signed certificate plus a hosts entry, so
the dev stack runs on `https://` — costing an afternoon, no external host, no domain, nothing to
maintain. It proves three of the four production-only failure modes:

- `BOXHUB_COOKIE_SECURE`, wired in M12c and **never once exercised**, because dev is plain HTTP.
- HSTS, and the security headers under TLS.
- The CSP under TLS.

**Two things it still cannot prove, and they stay open until the real deploy:**

- **The Google OAuth `redirect_uri`.** It only breaks against a real `https://` registration in the
  Google console. This shipped broken from M8 to M12c, and M13a changes that exact value again.
- **Whether email arrives.** Mailpit accepts everything. A real provider without SPF/DKIM/DMARC
  drops verification links into spam and the entire auth flow dies silently. Filed under
  Launch → Production; revisit when the deploy is planned.

`deploy/deploy.sh` has still never successfully run — M12c added a sentinel guard to a script that
has never executed. That remains true until the end of Project 1, and whoever runs it first should
expect to debug the script as well as the deploy.

### The product needs a new name — decide it before M13b

`boxhub.com` and `boxhub.io` are both unavailable, so the product will be renamed. Recorded
2026-08-02.

**This is a frontal change only.** Measured: **18 user-facing occurrences** — 8 in `frontend/src`
(the `<title>`, four shells, the login page), 9 across seven mail templates, and one
`BOXHUB_MAIL_FROM` default in `application.yml`. Plus a logo and the domain in configuration.

**Internal namespaces never change**: `com.boxhub.*`, `BOXHUB_*` env vars, the `bh-*` CSS prefix,
database and image names. Nobody sees them, and churning them is pure risk for zero gain.

**The timing constraint is real:** M13b re-opens the visual language, and a wordmark is part of it.
Designing a logotype for a name about to be abandoned is waste, and M13b is the one milestone where
the brand *is* the deliverable. **The name must be settled before M13b starts.** It does not block
M13a.

**Mitigation, free, in M13a:** that milestone already extracts every string for i18n. Brand strings
ride along — one frontend constant, one `boxhub.brand.name` backing the mail templates. The rename
then costs two values and a logo asset, whenever the name lands.

### M14 — Class model, schedule, and all program schema

Split `class_templates` into `class_type` × `schedule_slot`. That table currently holds a class's
identity (`name`, `image_path`, `coach_id`) and its weekly slot (`weekday`, `start_time`,
`duration_min`, `capacity`) in one row, which is why there is no page that can describe a class and
no way to schedule the same class twice. Then the classes page, the week calendar, the admin
class-detail modal, and `bh-week-calendar` itself (deferred here from M13c because its API is
decided by scheduling interactions that do not exist yet).

Coach's programming surfaces — Types, WOD library, Benchmarks, instance Builder — and the admin
Movements page come here, because they edit these entities and the refactor breaks them otherwise.

**M14 is the schema milestone, and carries every schema change the program needs**, batched by
design rather than dribbled one migration per milestone:

- **Cancellation history.** `BookingService.java:79` does `bookings.delete(booking)` — cancel
  destroys the row. "Who cancels a lot", "late-cancel rate", "cancellations this month" are
  therefore not hard but *impossible*, and every day without this is history that never existed.
- **Country**, for M18's geographic analytics. Nothing stores it today.
- Anything else M15–M18's analytics need, decided during M14's brainstorm.

> **Before M14 is specced, the coach programming screens need an actual tour.** They were skipped as
> "part 2", then split, and the half pulled into M14 has never been reviewed. Its scope currently
> rests on inference and stale backlog entries.

### M15 — Admin: people

Members table, member detail (attendance history, most-frequented classes, entry counts,
cancellations once M14 records them), **subscription change** — an action performed *on a person*,
so it lives here rather than in M16 — invites (resend, notes, a real view of what was sent), and box
settings, including `cancel_cutoff_min` and `booking_horizon_weeks`, which exist in the schema,
drive real booking behaviour, and have never had any UI.

### M16 — Admin: commerce

Plans with per-plan statistics, the payment flow, Stripe configuration, the receipt page
(`/receipts/:paymentId`), and the admin dashboard (`/admin/dashboard`) — placed last among the admin
milestones so it can aggregate what M15 and M16 built.

### M17 — Athlete

Home, book, progress, membership, **the WOD board (`athlete/wod`) and the leaderboard
(`athlete/board/:itemId`) — two of the five hero screens**, plus class detail (`athlete/class/:id`)
and athlete profile (`athlete/profile/:membershipId`). Athlete analytics: entries used against the
plan's entitlement, attendance, whether the membership is being used to its full value.

Carries two known bugs:

- `home.page.ts:38` links the next-booking card to `/athlete/book` instead of `/athlete/class/:id`,
  which already exists.
- **Waitlist promotion is silent.** `BookingService` promotes `WAITLIST` → `BOOKED` at line 85 and
  contains **zero** Mailer references; there is no `waitlist-promoted` template among the eleven. An
  athlete gets a spot and is never told — so they either arrive not knowing they are in, or stay away
  while holding a place someone else wanted. Live since M2, and the entire point of a waitlist is
  finding out. Fixed here alongside whatever notification strategy this milestone settles on; the
  house rule applies, mail fires strictly after commit.

Also the milestone where **notifications** get decided at all. Today the product can reach an athlete
only by email, and only for account events — nothing for a class starting, a coach cancelling, or a
membership about to lapse. Whether that becomes push, a PWA, or stays email is an open product
question, not a foregone one.

### M18 — Superadmin

Console rebuild, cross-box visibility and management, platform analytics (revenue, subscriptions,
renewals versus lapses, geography). **The delicate part is not the charts** — a superadmin holds no
`box_id` claim, so every `@TenantId` query they trigger fails *open* (see `docs/TENANCY.md`).
Cross-box read, and especially cross-box *write*, needs a designed access path. Also: "revenue" must
be defined before it is charted, since comped subscriptions carry no `payment` row.

### M19 — Landing site

The public marketing site at `/`, with the application under `/app`. The `Components` sections of all
74 reference systems are exactly this: hero bands, pricing tiers, feature grids, testimonials, logo
walls, CTA banners, footers.

### M20 — 2FA / TOTP

For box owners and superadmins. Relocated from the old M14, unchanged.

### Project 2 — The Room

Coach runner, check-in, TV, heats and teams, per-device views, sound. Coach's *programming* surfaces
are explicitly **not** here — they are in M14.

> **Named tension, so it is a choice rather than a drift.** The v1 roadmap's thesis is that *"a box
> does not switch for the booking — they already have booking. They switch for the room."* The Room
> is the stated wedge, and it sits after six milestones of plumbing. The counter-argument is real —
> M6/M7 already shipped a working TV and server-authoritative timer, and the room deserves to be
> built on foundations that are not embarrassing. But we are deferring the wedge, deliberately.

### Launch → Production

Unchanged. See `docs/BACKLOG.md`.

## Boundaries that were decided, and are binding

- **Coach splits in two.** Runner, check-in and TV are The Room. Types, WOD library, Benchmarks,
  Builder and Movements are programming CRUD, and belong to M14 with the entities they edit.
- **Analytics is per-role, never a milestone.** An athlete asks "am I getting my money's worth", an
  owner asks "who is lapsing and which classes fill", the platform asks "what is revenue by
  geography". Three different products.
- **Actions on a person live with the person.** Changing a subscription is M15, not M16 — the first
  draft of this document split that flow across two milestones.
- **No product screen is redesigned before M13c**, except M13d's auth set, which is the library's
  first real consumer.
- **Every route has exactly one milestone.** The first draft left seven unassigned, including two
  hero screens. When a screen is added, it gets a milestone in the same commit.
- **The `/app` migration is plumbing, and lands early**, in M13a.

## Out of scope for the whole program

Everything in `docs/BACKLOG.md` under Watch-list and Accepted, plus the Launch → Production section.
Items retired from the old M15/M16/M17 stay in the backlog, unscheduled, until something forces them.

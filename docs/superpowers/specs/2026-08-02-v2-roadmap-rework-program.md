# v2 roadmap — the rework program (2026-08-02)

**Supersedes the M12–M17 half of `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.**
Project 2 (The Room) and the Launch phase in that document stand unchanged.

This is a **decomposition**, not a spec. It fixes the order, the boundaries and the numbering.
Each milestone below gets its own brainstorm → spec → plan → execute cycle.

## Why the old numbering is retired

M13–M17 on the v1 roadmap were one-line sketches, never specced, written before a full tour of the
built product. A tour on 2026-08-02 replaced them with concrete, observed requirements. The old
numbers are retired rather than renamed, because their content no longer exists in that shape:

| Old | Fate |
|---|---|
| M13 analytics (lean) | **Absorbed.** Analytics is not a milestone — it is a section of each role's milestone, because the questions an athlete, a box owner and the platform operator ask have nothing in common. |
| M14 2FA / TOTP | **Relocated intact** to M20. Unchanged in scope, just later than the rework. |
| M15 programming & tracking depth | **Partly absorbed** into M14 (the class-model refactor is its headline item). The rest — movement media, WOD versioning, snapshot-on-publish, load units — stays in `docs/BACKLOG.md` unscheduled. |
| M16 payments depth | **Partly absorbed** into M16-new (per-plan stats, subscription management). Stripe recurring, class-packs, refunds and proration stay in the backlog. |
| M17 platform & accounts | **Partly absorbed** into M18 (superadmin console + cross-box management). The superadmin *account model* moves there too; box deletion and the full audit log stay in the backlog. |

## The program

**M13 — Foundations.** Angular 19→22 (19 is EOL; it moves every file's baseline, so nothing else
can start first). The component library. A real icon set. One shared app shell. The `/app` route
migration. **No product screens are redesigned here** — this milestone exists so the ones that
follow are assembling parts rather than inventing them.

**M14 — Class model & schedule.** Split `class_templates` into `class_type` × `schedule_slot`. That
table currently holds a class's identity (`name`, `image_path`, `coach_id`) and its weekly slot
(`weekday`, `start_time`, `duration_min`, `capacity`) in one row, which is why there is no page that
can describe a class and no way to schedule the same class twice. Then: the classes page
(description, photos), the week calendar, the class-detail modal. Coach's Types, WOD library,
Benchmarks and instance Builder come along, because they edit these same entities and the refactor
breaks them otherwise.

**M15 — Admin: people.** Members table, member detail (attendance history, most-frequented classes,
entry counts), invites (resend, notes, a real view of what was sent), box settings — including
`cancel_cutoff_min` and `booking_horizon_weeks`, which exist in the schema, drive real booking
behaviour, and have never had any UI.

**M16 — Admin: commerce.** Plans with per-plan statistics, subscription management, the payment
flow. Split from M15 so the money screens get their own review pass.

**M17 — Athlete.** Home, progress, membership. Plus the athlete's own analytics: entries used
against the plan's entitlement, attendance, whether the membership is being used to its full value.

**M18 — Superadmin.** Console rebuild, cross-box visibility and management, platform analytics
(revenue, subscriptions, renewals versus lapses, geography). **The delicate part is not the charts**
— it is that a superadmin holds no `box_id` claim, so every `@TenantId` query they trigger fails
*open* (see `docs/TENANCY.md`). Cross-box read, and especially cross-box *write*, needs a designed
access path, not an incidental one.

**M19 — Landing site.** The public marketing site at `/`, with the application under `/app`. After
foundations, so the front door and the product share one visual language.

**M20 — 2FA / TOTP** for box owners and superadmins. Relocated from the old M14.

**Project 2 — The Room.** Coach runner, check-in, TV, heats and teams, per-device views, sound.
Unchanged from the v1 roadmap. Coach's *programming* surfaces are explicitly **not** here — they
are in M14.

**Launch → Production.** Unchanged. See `docs/BACKLOG.md`.

## Boundaries that were decided, and are binding

- **Coach splits in two.** Runner, check-in and TV are The Room (Project 2). Types, WOD library,
  Benchmarks and Builder are programming CRUD, and belong to M14 with the entities they edit.
- **Analytics is per-role, never a milestone.** An athlete asks "am I getting my money's worth", an
  owner asks "who is lapsing and which classes fill", the platform asks "what is revenue by
  geography". Three different products; one "analytics milestone" would serve none of them.
- **No new screen is built before M13.** The whole point of the ordering is that no UI is paid for
  twice. A screen built now, in the current design language, is a screen rebuilt later.
- **The `/app` migration is plumbing, and lands early.** It touches every emailed link, the OAuth
  `redirect_uri`, the Stripe return URLs, nginx and `APP_BASE_HREF`. Cheaper while the app is small.

## Out of scope for the whole program

Everything in `docs/BACKLOG.md` under Watch-list and Accepted, plus the Launch → Production section.
Items retired from the old M15/M16/M17 stay in the backlog, unscheduled, until something forces them.

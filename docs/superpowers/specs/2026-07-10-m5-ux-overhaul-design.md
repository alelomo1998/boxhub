# M5 — Product UX Overhaul — design spec

**Date:** 2026-07-10. **Milestone:** M5 (new — postpones the old M5–M7). **Status:** approved, ready for plan.
**Depends on:** M0–M4 + athlete rebuild (2026-07-10) + `PRODUCT.md` / `DESIGN.md`.
**Reference:** `docs/reference/ScreenRecording_07-10-2026 14-51-21_1.mp4` — the box's current app ("APP palestre"). Ugly, but the structure is right: big icons/buttons, class cards with photos, avatar-grid booked list, info-hub home. We adopt the concept with BoxHub's own identity.

## Roadmap change (binding)

| Old | New |
|---|---|
| — | **M5 Product UX overhaul** (this spec) |
| M5 TV display | **M6** |
| M6 Coach class runner | **M7** |
| — | **M8 Full SaaS analytics** (economics, engagement, class stats — own spec when reached) |
| M7 Hardening & pilot | **M9** |

## Goal & acceptance

Rework the product around a mobile-first, photo-rich experience for athletes and coaches, a modular class model for programming, and a SaaS-grade admin shell — while codifying the frontend rules every future feature must follow.

**Acceptance:**
- Athlete books a CLASS from a photo class-card list, opens the class detail (coach on top, athlete avatar grid), and taps into an athlete profile.
- Home is an info hub (announcement, next booking, class teaser, stats) — no "TODAY" title, no RX/Fitness tabs on home.
- Coach fills a class instance from its skeleton (e.g. warmup + EMOM + final WOD) on a phone in under 2 minutes; the desktop builder is a first-class two-pane editor.
- Coach checks in a 12-athlete class from the avatar grid in under 30 seconds.
- Athlete logs a score per scored piece of their class; strength pieces feed the lift log/PRs.
- Admin desktop is a SaaS dashboard shell with 3 live KPIs; admin works on a phone.
- Every surface passes an impeccable critique ≥ 28/40 before merge.

## The class model (core concept — terminology is binding)

- **CLASS TYPE** (`class_templates`, extended): what admin/coach creates — "Muscle Class", "Burn It", "WOD Class". Carries the schedule slots (weekday+time, repeats weekly — M2 machinery) **and a standard SKELETON**: an ordered list of piece placeholders (label + piece type only, e.g. warmup → strength circuit 1 → strength circuit 2 → stretching). The skeleton is a speed mock-up, never shown to athletes.
- **CLASS (instance)** = one generated `class_session` (Monday 18:00 Muscle Class). **The athlete books a CLASS, never a WOD.** Programming lives INSIDE the instance: when the coach opens an unprogrammed instance, the builder pre-seeds from the type's skeleton; the coach fills exercises or restructures freely — **the instance changes, the skeleton doesn't**. Instances of the same type (even same day) can differ.
- **PIECE** (`wod` table keeps its name in code; UI says "piece"): a modular element inside a class — warmup, strength, EMOM, AMRAP, for-time ("WODs"), interval, circuit, skill, custom. Reusable via the library and benchmarks as in M3.
- **Publish** per instance: pieces invisible to athletes until the coach publishes that instance's programming.
- **Leaderboard** per scored piece per class instance.

## Key decisions (locked)

1. **Programming attaches to the class instance** (`session_item`: session_id, wod_id, sort_order, scoreable, score_type override). Skeleton lives on the class type (`template_piece`: template_id, sort_order, label, wod_type) and only pre-seeds the builder — no copy-on-generate job. `wod_score` moves to `session_item`. **Tracks and `program_slot` are retired** (class types are the lane; RX/scaled survives as the M4 score-level flag). **No production deployment exists → V7 drops the slot/track model and wipes existing demo scores; the seeder rebuilds demo data on the new model. No data migration.**
2. **Piece types extend `wod_type`:** + `WARMUP`, `CIRCUIT`, `SKILL` (existing: FOR_TIME, AMRAP, EMOM, INTERVAL, STRENGTH, CUSTOM). Default score type per type — FOR_TIME→TIME, AMRAP→ROUNDS_REPS, INTERVAL→ROUNDS_REPS, EMOM→NONE (completion), STRENGTH→lift-log (movement-linked), WARMUP/CIRCUIT/SKILL→NONE — **coach can override any piece's score type** (e.g. a scored EMOM). CIRCUIT = rounds of work, no cap, completion-only by default.
3. **Photos = VPS volume + nginx.** `POST /api/box/media` (multipart; jpeg/png/webp; ≤5 MB; random filename; box-scoped subdir), files on a docker volume, nginx serves `/media/**`, DB stores the path. Used by class-template images and athlete avatars. No S3 (BACKLOG if pilot outgrows it).
4. **Athlete profile:** self-uploaded avatar; `private` flag on membership. Public profile shows photo+name always; +benchmark PRs, lift PRs, attendance streak when not private. Per-score private flag (M4) still governs leaderboards.
5. **Class detail is member-visible:** coach on top, booked athletes as avatar grid with "Active" / "In queue" sections (reference's Booked list). Members see names+photos only; coach additionally gets check-in controls.
6. **Announcement:** one active message per box, admin/coach CRUD, shown as home card.
7. **Athlete tabs: Home · Book · WOD · Progress.** Profile+theme in a header avatar sheet.
8. **Coach: full rebuild** — mobile-light modular class building + desktop two-pane builder + rapid photo check-in. TV command is M7, not here.
9. **Admin: mobile-friendly restyle + desktop SaaS shell** with 3 KPIs (active members, week attendance/fill, expiring plans). Full analytics = M8.
10. **Impeccable is part of the process:** shape before building each surface, critique after, ≥28/40 gate.

## Backend

### Flyway V7
```
-- new model (no prod deploy exists: drop-and-replace, no data migration)
session_item (id, box_id, session_id FK class_sessions, wod_id FK wod, sort_order int,
              scoreable bool not null, score_type text null,  -- null = derive from wod_type
              created_at)
  unique (box_id, session_id, sort_order)
class_sessions: add programming_status text not null default 'DRAFT' check in ('DRAFT','PUBLISHED')
template_piece (id, box_id, template_id FK class_templates, sort_order int, label text, wod_type text)
wod: widen wod_type check (+WARMUP, CIRCUIT, SKILL)
class_templates: add image_path text
memberships: add avatar_path text, private bool not null default false
announcement (id, box_id, body text, updated_by, updated_at) -- one row per box (unique box_id)
wod_score: rebuild -> references session_item_id (existing demo rows deleted),
           unique (box_id, session_item_id, membership_id)
drop table program_slot; drop table track  -- retired (M3 slots/tracks)
```
`@TenantId` on `session_item`, `template_piece`, `announcement`. Media paths are plain columns.

### API (all `/api/box/**`, standard role rules, RFC7807)
- **Class programming (staff writes):** `PUT /sessions/{id}/items` — replace-items semantics, ordered `[{wodId, scoreable, scoreType?}]`; `PATCH /sessions/{id}/programming` publish/unpublish; `GET /sessions/{id}/items` (staff sees drafts; members only when PUBLISHED). Builder pre-seed: `GET /class-templates/{id}/skeleton` + skeleton CRUD on the template.
- **Board (athlete "WOD" tab + home teaser):** `GET /my-class-today` — the caller's booked session today (else today's sessions list) with published items, each with wod dto, effective score type, my-score state.
- **Scores:** `PUT /sessions/items/{itemId}/score`, `GET .../score`, `GET .../leaderboard` — M4 semantics per item (published instances only). Leaderboard entries gain `avatarPath`.
- **Media:** `POST /media` (multipart) → `{path}`; validation: content type whitelist, ≤5 MB, image decode sanity; stored under `/media/{boxId}/{uuid}.{ext}`. Served by nginx (no auth on read — paths are unguessable UUIDs; acceptable for gym photos, noted in spec).
- **Profile:** `GET /members/{membershipId}/profile` (member-visible; masks stats when private), `PUT /me/avatar` (multipart or media path), `PATCH /me/profile {private}`.
- **Session detail:** `GET /sessions/{id}/detail` — class info + image + coach (name, avatar) + booked grid (name, avatar, status BOOKED/WAITLIST/CHECKED_IN) for any ACTIVE member.
- **Announcement:** `GET /announcement`, `PUT /announcement` (staff).
- **Home:** `GET /home` — next booking (w/ class image + participant avatars), announcement, today's items teaser + my logged state, mini stats (check-ins this week, streak weeks, plan days left, last PR).
- **Templates:** `PATCH /class-templates/{id}` accepts `imagePath`.

### Tenancy & tests (binding, as always)
Every new endpoint: happy + auth-denied + cross-tenant-denied. Plus: private-profile masking test; media upload rejects oversize/wrong-type; draft programming invisible to athletes (publish gate test); score against a DRAFT instance → 404; per-item leaderboard ordering reuses M4 `Leaderboard` tests; skeleton pre-seed returns placeholders without touching the instance.

## Frontend

### Athlete (tabs: Home · Book · WOD · Progress)
- **Home**: announcement card · next-booking card (class photo, big time block, participant avatar row, cancel) · today's WOD teaser (first scored piece + logged state → WOD tab) · mini-stats strip (check-ins this week, streak, plan days left, last PR) · plan-expiry warning when ≤7 days · header = box name + avatar button → profile sheet (avatar upload, private toggle, theme, logout).
- **Book**: date pager (‹ day ›, swipeable), class cards: image, name, time block, spots left, participant-avatars peek, Book / booked=Cancel / full=Waitlist states (states styled per our law, not the reference's green/red). Card → **class detail**: image hero, coach on top (avatar+name), athlete avatar grid Active/In-queue, my booking action. Avatar tap → **athlete profile** (photo+name always; PRs/streak if public).
- **WOD**: your booked class today (fallback: pick from today's classes) — ordered pieces: type tag, content (lines/text); scoreable pieces get Log (score sheet, per-piece score type) + leaderboard (per class instance, with avatars); STRENGTH piece → inline quick lift-log (feeds PRs). No track switcher — the class IS the lane.
- **Progress**: as-is + entry point to own profile.

### Coach (same app shell pattern: bottom tabs mobile / rail desktop)
- **Tabs: Classes (sessions+check-in+programming entry) · Build (library/pieces) · Benchmarks · Types (class types + skeletons).**
- **Check-in**: today's classes list → class → avatar grid (Active/queue), tap toggles check-in (ring state), long-press no-show, count chip. <30s for 12 athletes.
- **Instance builder (mobile)**: open a class instance → pre-seeded skeleton stack (label + type placeholders) → fill each piece (movement datalist lines + free text, from library/benchmarks or scratch) → scoreable toggle/score type → reorder up/down → publish. <2 min from skeleton.
- **Instance builder (desktop)**: two-pane — left: piece library + benchmarks (search, click to add), right: the class canvas (skeleton stack, inline editing); keyboard friendly, "perfect, intuitive, not rigid". Impeccable `shape` then `craft` this screen specifically.
- **Class types & skeletons**: create/edit types (name, image, schedule slots — existing template editor extended) + skeleton editor (ordered label+type placeholders).
- **Week view**: classes-by-day grid showing programming status (skeleton-only vs published) per instance; tap → instance builder.

### Admin
- **Desktop SaaS shell**: side nav + top bar + content grid; dashboard = 3 KPI cards (active members, week attendance/fill %, expiring plans ≤14d) + shortcuts; existing pages (members/invites/plans/schedule/movements/settings — tracks page removed with the model) inside the shell; class-type editor gains image upload + skeleton.
- **Mobile**: same nav collapses to bottom tabs (Dashboard · Members · Schedule · More-sheet); tables become cards on narrow viewports.

### FE rules — design law v2 (binding for ALL future frontend)
Appended to the design-law spec + CLAUDE.md:
1. Tokens only, incl. `--fs-*`, `--tap` (44px min targets), `--scrim`; raw hex/px-type outside tokens = bug.
2. Every fetch: loading + error + empty states. Every save: pending → success/inline-error with values preserved. State is never silent.
3. WCAG AA: contrast ≥4.5:1, focus-visible rings, wired labels, reduced-motion alternatives.
4. Phone-first roles (athlete, coach) = bottom-tab app shells; desktop = rail/SaaS shell. Overlays = `bh-sheet`. Screens compose `bh-*`.
5. Red rationed: live / primary / winning. Glow rationed: primary hover, live, focus.
6. **Every FE feature ships through impeccable: `shape` (brief) → build → `critique` ≥28/40 (fix P0/P1) before merge.**

## Impeccable integration (process, in the plan)
- Before each surface: `/impeccable shape <surface>` brief (compact) driven by this spec.
- After each surface: `/impeccable critique <surface>`; gate ≥28/40, no P0/P1 open.
- `PRODUCT.md`/`DESIGN.md` updated where this spec changes them (tabs, coach register notes, admin SaaS shell).

## Seeding
Demo box rebuilt on the new model: 2-3 class types with images + skeletons (bundled placeholder assets), weekly schedule, published modular programming on this week's instances (warmup + strength + metcon), avatars for demo athletes, scores on today's pieces, one announcement — every new screen renders full on a fresh volume.

## Testing
- Backend: per-endpoint triple + the specials above. Full suite green.
- FE: services + score/sheet/check-in component specs; build; no-hex grep.
- e2e (serial): book via card → class detail shows coach+grid → athlete profile opens; coach photo check-in; coach builds modular class on mobile viewport → athlete logs per-piece score; admin dashboard KPIs render. Update existing specs for new selectors.
- Impeccable critique per surface, scores recorded in `.impeccable/`.

## Scope cuts → BACKLOG
Booking-open windows ("bookings open at 05:00") · notification bell/push · messages, multimedia, purchases, cards (reference drawer) · multi-box switcher UI · timer · TV command (M7) · full analytics (M8) · S3/object storage · media auth on read (unguessable path accepted for pilot) · EXIF stripping.

## Out of scope
TV (M6), class runner (M7), full analytics (M8), hardening (M9).

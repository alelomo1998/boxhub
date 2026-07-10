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
- Athlete books from a photo class-card list, opens a class detail (coach on top, athlete avatar grid), and taps into an athlete profile.
- Home is an info hub (announcement, next booking, WOD teaser, stats) — no "TODAY" title, no RX/Fitness tabs on home.
- Coach builds a modular class (e.g. warmup + EMOM + final WOD) on a phone in under 2 minutes, and the desktop builder is a first-class two-pane editor.
- Coach checks in a 12-athlete class from the avatar grid in under 30 seconds.
- Athlete logs a score per scored piece; strength pieces feed the lift log/PRs.
- Admin desktop is a SaaS dashboard shell with 3 live KPIs; admin works on a phone.
- Every surface passes an impeccable critique ≥ 28/40 before merge.

## Key decisions (locked)

1. **Data model = evolve M3/M4 (approach A).** `wod` remains the reusable piece entity. A day's programming is ordered pieces: new `slot_item` (slot_id, wod_id, sort_order, scoreable). `wod_score` moves from slot to item. V7 migrates each existing slot to exactly one item; M4 data preserved.
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
slot_item (id, box_id, slot_id FK program_slot, wod_id FK wod, sort_order int,
           scoreable bool, score_type text nullable override, created_at)
  unique (box_id, slot_id, sort_order)
-- migrate: insert one slot_item per existing program_slot (sort 0, scoreable=true, score_type null)
wod_score: add slot_item_id FK (backfill via the migrated items), drop old unique,
           new unique (box_id, slot_item_id, membership_id); keep slot_id column dropped after backfill
wod: widen wod_type check (+WARMUP, CIRCUIT, SKILL)
class_templates: add image_path text
memberships: add avatar_path text, private bool not null default false
announcement (id, box_id, body text, updated_by, updated_at) -- one row per box (unique box_id)
```
`@TenantId` on `slot_item`, `announcement` (standard box scoping). Media paths are plain columns.

### API (all `/api/box/**`, standard role rules, RFC7807)
- **Program (coach/staff writes):** `PUT /program` upsert slot now accepts ordered items `[{wodId, scoreable, scoreType?}]`; `PATCH /program/{slotId}` status unchanged; item add/remove/reorder via the same PUT (replace-items semantics — simplest correct thing).
- **Board:** `GET /wod-board` returns per track: slot + ordered items (each with wod dto, scoreable, effective score type, my-score state).
- **Scores:** `PUT /program/items/{itemId}/score`, `GET .../score`, `GET .../leaderboard` — same semantics as M4 but per item. Leaderboard entries gain `avatarPath`.
- **Media:** `POST /media` (multipart) → `{path}`; validation: content type whitelist, ≤5 MB, image decode sanity; stored under `/media/{boxId}/{uuid}.{ext}`. Served by nginx (no auth on read — paths are unguessable UUIDs; acceptable for gym photos, noted in spec).
- **Profile:** `GET /members/{membershipId}/profile` (member-visible; masks stats when private), `PUT /me/avatar` (multipart or media path), `PATCH /me/profile {private}`.
- **Session detail:** `GET /sessions/{id}/detail` — class info + image + coach (name, avatar) + booked grid (name, avatar, status BOOKED/WAITLIST/CHECKED_IN) for any ACTIVE member.
- **Announcement:** `GET /announcement`, `PUT /announcement` (staff).
- **Home:** `GET /home` — next booking (w/ class image + participant avatars), announcement, today's items teaser + my logged state, mini stats (check-ins this week, streak weeks, plan days left, last PR).
- **Templates:** `PATCH /class-templates/{id}` accepts `imagePath`.

### Tenancy & tests (binding, as always)
Every new endpoint: happy + auth-denied + cross-tenant-denied. Plus: private-profile masking test; media upload rejects oversize/wrong-type; V7 migration test proves M4 scores land on migrated items (count parity); per-item leaderboard ordering reuses M4 `Leaderboard` tests.

## Frontend

### Athlete (tabs: Home · Book · WOD · Progress)
- **Home**: announcement card · next-booking card (class photo, big time block, participant avatar row, cancel) · today's WOD teaser (first scored piece + logged state → WOD tab) · mini-stats strip (check-ins this week, streak, plan days left, last PR) · plan-expiry warning when ≤7 days · header = box name + avatar button → profile sheet (avatar upload, private toggle, theme, logout).
- **Book**: date pager (‹ day ›, swipeable), class cards: image, name, time block, spots left, participant-avatars peek, Book / booked=Cancel / full=Waitlist states (states styled per our law, not the reference's green/red). Card → **class detail**: image hero, coach on top (avatar+name), athlete avatar grid Active/In-queue, my booking action. Avatar tap → **athlete profile** (photo+name always; PRs/streak if public).
- **WOD**: ordered pieces for the day/track (track switcher stays here, segmented); each piece: type tag, content (lines/text), scoreable pieces get Log (score sheet, per-piece score type) + leaderboard (per item, with avatars); STRENGTH piece → inline quick lift-log (feeds PRs).
- **Progress**: as-is + entry point to own profile.

### Coach (same app shell pattern: bottom tabs mobile / rail desktop)
- **Tabs: Classes (sessions+check-in) · Program (calendar) · Build (library/builder) · Benchmarks.**
- **Check-in**: sessions today list → class → avatar grid (Active/queue), tap toggles check-in (ring state), long-press no-show, count chip. <30s for 12 athletes.
- **Builder mobile**: a day's class = stack of piece cards; add piece → type picker → content editor (movement datalist lines + free text) → scoreable toggle/score type; reorder up/down; save to library or program directly.
- **Builder desktop**: two-pane — left: library + benchmarks (search, drag/click to add), right: day canvas with the piece stack; inline editing; keyboard friendly. Impeccable `shape` then `craft` this screen specifically.
- **Calendar**: week grid stays, cells now show piece count + titles.

### Admin
- **Desktop SaaS shell**: side nav + top bar + content grid; dashboard = 3 KPI cards (active members, week attendance/fill %, expiring plans ≤14d) + shortcuts; existing pages (members/invites/plans/schedule/tracks/movements/settings) inside the shell; schedule/template editor gains class-image upload.
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
Demo box: class-template images (bundled placeholder assets), avatars for demo athletes, one announcement, a modular demo day (warmup + strength + metcon) so every new screen renders full.

## Testing
- Backend: per-endpoint triple + the specials above. Full suite green.
- FE: services + score/sheet/check-in component specs; build; no-hex grep.
- e2e (serial): book via card → class detail shows coach+grid → athlete profile opens; coach photo check-in; coach builds modular class on mobile viewport → athlete logs per-piece score; admin dashboard KPIs render. Update existing specs for new selectors.
- Impeccable critique per surface, scores recorded in `.impeccable/`.

## Scope cuts → BACKLOG
Booking-open windows ("bookings open at 05:00") · notification bell/push · messages, multimedia, purchases, cards (reference drawer) · multi-box switcher UI · timer · TV command (M7) · full analytics (M8) · S3/object storage · media auth on read (unguessable path accepted for pilot) · EXIF stripping.

## Out of scope
TV (M6), class runner (M7), full analytics (M8), hardening (M9).

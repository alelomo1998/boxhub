# M5 Product UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) steps.
> **This project's pace (CLAUDE.md):** inline execution by the main thread; tests+build+greps are the gate; commit in batches. Impeccable gates are explicit steps.

**Goal:** Class-centric product: bookable CLASSES with per-instance modular programming (skeletons on class types), photos everywhere (class images, avatars, photo check-in), info-hub home, coach full rebuild, admin SaaS shell — and the FE rules codified.

**Architecture:** V7 drops M3's slot/track model (no prod deploy → demo wiped): programming attaches to `class_sessions` via `session_item`; skeletons on `class_templates` via `template_piece`; scores per item. Media on a docker volume served by nginx `/media/**`. FE: athlete tabs Home·Book·WOD·Progress; coach tabs Classes·Build·Benchmarks·Types; admin SaaS shell.

**Tech Stack:** as before + multipart upload (Spring), nginx static media location, compose volume.

## Global Constraints
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for backend mvn. Flyway **V7** next; never edit applied migrations.
- Tenancy: `TenantContext` only; every box endpoint happy+auth+cross-tenant tests; membership/self always from JWT.
- Design law v2 (spec §FE rules): tokens only (`--fs-*`, `--tap`, `--scrim`), every fetch loading/error/empty, every save pending+inline-error+preserved, WCAG AA, bottom-tab app shells (athlete/coach) + SaaS shell (admin desktop), `bh-sheet` overlays, red/glow rationed, screens compose `bh-*`.
- **Impeccable:** compact `shape` confirm before each FE surface group; `critique` after; ≥28/40 and no open P0/P1 to merge.
- Commits conventional, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Progress in `.superpowers/sdd/progress.md`.

**Spec:** `docs/superpowers/specs/2026-07-10-m5-ux-overhaul-design.md`.

---

## Backend

### T1 — V7 migration + new entities/repos
Files: `V7__class_model.sql`; `programming/SessionItem.java|Repository`, `programming/TemplatePiece.java|Repository`, `box/Announcement.java|Repository`; modify `box/ClassSession` (+programmingStatus), `box/ClassTemplate` (+imagePath), `identity/Membership` (+avatarPath, +privateProfile), `performance/WodScore` (sessionItemId replaces slotId); MigrationTest (update v4 assertions — program_slot/track dropped; add v7).
SQL per spec §Flyway V7 (session_item, template_piece, programming_status, image_path, avatar_path/private, announcement, wod_type +WARMUP/CIRCUIT/SKILL, wod_score rebuild → session_item_id, drop program_slot+track).
- [ ] Migration + entities/repos compile; old Track/ProgramSlot Java stays temporarily (dropped in T2).
- [ ] MigrationTest green. Commit.

### T2 — programming rework: items API, skeleton CRUD, retire slots/tracks
Files: rewrite `programming/ProgramController|ProgramService|WodBoardController` → `programming/SessionItemController` (`PUT/GET /sessions/{id}/items`, `PATCH /sessions/{id}/programming` publish), `programming/SkeletonController` (`GET/PUT /class-templates/{id}/skeleton`), `programming/MyClassController` (`GET /my-class-today`); delete `Track|TrackRepository|TrackService|TrackController|ProgramSlot|ProgramSlotRepository`; update `BoxAdminController`/`DevDataSeeder` (no seedDefaults; new-model seed: types+skeletons+images-later+published instances+scores); delete stale tests (Track/Program/WodBoard), new `SessionItemApiTest`, `SkeletonApiTest`, `MyClassApiTest`.
Interfaces: `ItemDto(id, wodId, wod WodDto, sortOrder, scoreable, scoreType /*effective*/, myScore?)`; replace-items PUT `[{wodId, scoreable, scoreType?}]` (staff); items GET member-visible only when PUBLISHED (staff always); `my-class-today` → `{session? (booked), sessions[] (fallback), items[]}`.
Effective score type helper: item.scoreType ?? default-by-wod_type map (spec §Key decisions 2).
- [ ] Tests: replace/reorder items; publish gate (athlete sees DRAFT → 404/empty); skeleton CRUD + pre-seed endpoint returns placeholders w/o touching instance; cross-tenant on all. Full backend green. Commit.

### T3 — scores per item
Files: `performance/ScoreService|ScoreController|LeaderboardController|HistoryController` → item-based (`PUT/GET /sessions/items/{itemId}/score`, `GET .../leaderboard`); leaderboard `Entry` +`avatarPath`; history joins item→session→wod; tests reworked (`ScoreControllerTest`, `LeaderboardApiTest`, `HistoryControllerTest` — DRAFT-instance score → 404).
- [ ] Full backend green. Commit.

### T4 — media upload
Files: `shared/MediaController.java` (`POST /api/box/media` multipart → `{path}`), `shared/MediaStorage.java` (whitelist jpeg/png/webp, ≤5MB, image decode sanity, `/media/{boxId}/{uuid}.{ext}` on `boxhub.media-dir`); compose: `media` volume mounted backend `/data/media` + nginx `/media/` alias ro; `docker/nginx.conf` location; application.yml `boxhub.media-dir`; `MediaApiTest` (happy jpg, reject oversize, reject type, auth-denied).
- [ ] Green. Commit.

### T5 — profile + session detail
Files: `identity/ProfileController` (`GET /api/box/members/{membershipId}/profile` masks stats when private — photo+name always; `PUT /api/box/me/avatar` (media path), `PATCH /api/box/me/profile {private}`); `box/SessionDetailController` (`GET /sessions/{id}/detail`: class info+image+coach(name,avatar)+grid entries(name, avatar, membershipId, status BOOKED/WAITLIST/CHECKED_IN)); stats reuse performance repos (benchmark best, lift PRs, streak = distinct weeks w/ checked-in in last 8). Tests: masking, member-visible, cross-tenant.
- [ ] Green. Commit.

### T6 — announcement + home + admin KPIs
Files: `box/AnnouncementController` (`GET/PUT /api/box/announcement`, staff write); `box/HomeController` (`GET /api/box/home`: nextBooking(w/ image+participant avatars), announcement, todayClass teaser(items+myScore state), stats{checkinsThisWeek, streakWeeks, planDaysLeft, lastPr}); `box/AdminStatsController` (`GET /api/box/admin-stats`: activeMembers, weekAttendance{checkins, capacity, fillPct}, expiringPlans≤14d list-count). Tests: triple + private data correctness.
- [ ] Green. Commit.

### T7 — seeder + assets + full backend gate
Files: `DevDataSeeder` complete rewrite (per spec §Seeding: 2-3 types w/ skeleton+image, weekly schedule, published instances this week, avatars, scores today, announcement); bundle placeholder images in `backend/src/main/resources/seed-media/*` copied to media dir at seed.
- [ ] Full `mvn test` green. Commit. Update progress.md.

## Frontend

### T8 — FE services/models rework
Files: rewrite `features/programming/programming.service.ts` (classes/items/skeleton: `sessionItems(sessionId)`, `putItems(sessionId, items)`, `publishProgramming(sessionId, status)`, `skeleton(templateId)`, `putSkeleton(...)`, `myClassToday()`; wods/benchmarks/movements survive; tracks/program/board methods die); `features/performance/performance.service.ts` per item; new `core/media.service.ts` (upload), `features/athlete/home.service.ts` (`home()`), `profile.service.ts` (profile/avatar/private), `session-detail` in booking.service; `admin.service.ts` +adminStats. Update service specs.
- [ ] Karma green (services). Commit.

### T9 — athlete Home + shell (impeccable shape → build → critique)
Files: `athlete-shell.page.ts` (tabs Home·Book·WOD·Progress; header avatar→profile sheet w/ upload+private+theme+logout), `features/athlete/home.page.ts` (announcement card, next-booking card w/ image+avatars+cancel, class teaser, stats strip, plan-expiry warn), profile sheet component.
- [ ] Shape confirm (compact, from spec). Build. States per law. Critique athlete home ≥28. Commit.

### T10 — Book rework + class detail + athlete profile
Files: `book.page.ts` (date pager + class cards w/ image, spots, avatar peek, book/cancel/waitlist states), `class-detail.page.ts` (hero image, coach top, avatar grid Active/In-queue, my action), `athlete-profile.page.ts` (photo+name always; PRs/streak when public); routes.
- [ ] Build, states, keep e2e testids (`book-btn`, `cancel-btn`, `session-`). Critique ≥28. Commit.

### T11 — athlete WOD tab per booked class
Files: `wod.page.ts` (my-class-today: pieces ordered, type tags, scoreable→score sheet per effective type + leaderboard w/ avatars, STRENGTH→inline lift-log), reuse `score-form`/`bh-sheet`.
- [ ] Build. Critique ≥28 (athlete surface whole). Commit.

### T12 — coach full rebuild
Files: `coach-shell.page.ts` (tabs Classes·Build·Benchmarks·Types), `coach/classes.page.ts` (today+week list w/ programming status), `coach/checkin.page.ts` (avatar grid, tap toggle, long-press no-show), `coach/instance-builder.page.ts` (skeleton-seeded piece stack; mobile stack + desktop two-pane w/ library left; publish), `coach/types.page.ts` (class types + image upload + skeleton editor); wod-library/benchmarks pages adapted into Build/Benchmarks tabs; calendar page replaced by classes week view.
- [ ] Shape confirm for builder (desktop two-pane). Build. Critique coach surface ≥28, no P0/P1. Commit.

### T13 — admin SaaS shell
Files: `admin-shell.page.ts` (desktop: side nav+top bar SaaS shell; mobile: bottom tabs Dashboard·Members·Schedule·More-sheet), `admin/dashboard.page.ts` (3 KPI cards + shortcuts), tables→cards on narrow, class-type editor w/ image upload + skeleton, remove tracks page, keep member/invite/plan/settings/movements inside shell.
- [ ] Build. Critique admin desktop+mobile ≥28. Commit.

### T14 — design law v2 + docs
Files: append FE rules v2 to `docs/superpowers/specs/2026-07-08-design-system-design.md`, update `CLAUDE.md` (rules + impeccable gate), `DESIGN.md`, `PRODUCT.md` (tabs/coach/admin register notes).
- [ ] Commit.

### T15 — e2e rework + final gate
Files: update all e2e specs (login lands Home; booking via cards + class detail; tracking → per-piece score on WOD tab; programming → coach instance builder flow; new: photo check-in, admin dashboard renders KPIs).
- [ ] Fresh volume stack; full e2e green serial. Full backend+FE+no-hex. HANDOFF/BACKLOG/progress updated. finishing-a-development-branch (merge→main, push).

## Self-review
Spec coverage: class model T1-3; media T4; profile/detail T5; announcement/home/KPIs T6; seed T7; athlete T8-11; coach T12; admin T13; rules T14; e2e+gates T15. Types consistent (ItemDto/score endpoints named identically in T2/T3/T8/T11). No placeholders.

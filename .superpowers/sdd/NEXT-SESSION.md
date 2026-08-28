# Next session — **M29a messaging, MID-FLIGHT. 7 of 11 tasks done.**

**This is not a fresh milestone.** M29a is half-built on `main`, all green, all pushed. The entire
backend and the frontend service layer are done. **What remains is three screens and one e2e spec.**

```bash
cd ~/dev/boxhub && git checkout main && git pull && git log --oneline -1   # expect bfb6351
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. Escape hatch lives in `.claude/settings.local.json` (`"worktree": {"bgIsolation": "none"}`),
> gitignored, so a fresh clone needs it again.

**Spec:** `docs/superpowers/specs/2026-08-28-m29a-messaging-design.md` — approved, 8 numbered
decisions D-1..D-8. **Plan:** `docs/superpowers/plans/2026-08-28-m29a-messaging.md` — 11 tasks,
**repaired three times during execution**; the repairs are in it, trust the plan over your memory.

---

## Gates, measured at the end of this session — none inherited

| Gate | Value | When |
|---|---|---|
| Backend | **594 / 0 / 0 / 0** | after Task 6 |
| Karma | **462 / 462** | after Task 7 (was 450 baseline; +12 service specs) |
| Production build | **green** | after Task 7 |
| Four standing greps | all **0** | after Task 6 |
| `AuthzConformanceTest` | edits are **MIN_ROLE + pathIds + bodies only** | audited per task |
| e2e / visual | **NOT RUN this session** | Task 11 owns them |

**A fourth standing grep joined the three from M39** (spec §4) — all four must stay empty:
```sh
grep -rn "memberships\.findAll()" backend/src/main/java
grep -rn "MembershipEvent.LEFT" backend/src/main/java
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'
grep -rn "messageThreads\.findAll()\|messages\.findAll()\|announcementRecipients\.findAll()" backend/src/main/java
```

---

## What is DONE (Tasks 1–7, 19 commits, `fc3e59b`..`bfb6351`)

- **`V30` is APPLIED.** `message_thread`, `message`, `announcement_recipient`; `announcement` lost
  its `box_id` UNIQUE and gained `segment`/`segment_ref`, with `updated_at/by` renamed to
  `sent_at/by`. **Do not write a migration to add any of it.**
- **Member thread API** — `/api/box/me/thread{,/messages,/read}`. **No path ids anywhere**, by
  design: the membership comes from the JWT, so no member can name another member. That is what
  makes "no member↔member" structural rather than a rule.
- **Staff shared inbox** — `/api/box/threads{,/{membershipId}{,/messages,/read}}`, `requireStaff()`
  on every method, **one shared staff read marker** (D-3). "Needs reply" is derived, never stored.
- **Segments + announcements** — `SegmentResolver` (EVERYONE / CLASS_ROSTER incl. **WAITLIST** /
  EXPIRING at 14 days), `AnnouncementService.send` freezes the audience into recipient rows,
  `/api/box/announcements` (staff) and `/api/box/me/announcements` (member).
- **`GET`/`PUT`/`DELETE /api/box/announcement` (singular) are RETIRED** and removed from `MIN_ROLE`.
- **Athlete home** now reads the latest announcement **addressed to me**. `HomeDto.AnnouncementView`
  still has the component `updatedAt` — **that is the live wire contract** the frontend reads. Do
  not rename it.
- **`frontend/src/app/features/messaging/`** — `messaging.models.ts` + `messaging.service.ts`, all
  11 URLs verified against the live controllers, 12 specs.

---

## What is LEFT — Tasks 8, 9, 10, 11

Read the plan's task sections; each carries a full screen contract (routes, testids, states, form
idiom, type, i18n). Summary:

| Task | Screen | Routes |
|---|---|---|
| 8 | **Athlete Messages** | `/athlete/messages` + an envelope in the athlete shell header. **Dock stays at five tabs** (D-6). |
| 9 | **Staff Inbox** | `/coach/inbox` + `/admin/messages` — ONE component, two route entries |
| 10 | **Announcements** | `/coach/announcements` + `/admin/announcements` — ONE component, two entries (coaches may send, D-8) |
| 11 | e2e round-trip + full gate sweep | member sends → staff sees needs-reply → replies → member sees |

**Every screen goes through the full impeccable routine, browser connected:**
`shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH`.
**If Claude in Chrome is unavailable, STOP AND ASK** — do not score source-only.

**No volt on any of these screens** — plumbing, and the box switcher already spent the shell's volt
budget. Message bodies are prose → **Archivo**; counts and timestamps → mono, tabular.

---

## The stack is UP and CURRENT as of this session's end

`docker compose -f docker/docker-compose.yml up -d` was run on a **`down -v` fresh volume** at
~00:55. All four containers healthy, app 200 at `http://localhost/app/`, 30 migrations applied,
demo data seeded. **The backend image contains all of Tasks 1–7.** After Task 8 changes frontend
code you must **rebuild the frontend image** before the browser passes mean anything.

---

## Traps found THIS session — every one cost real time, none is in any other doc

### 1. `ddl-auto: validate` makes schema, entity, finders and JPQL ALL atomic — and with call sites

`application.yml:12` is `validate`, and Spring Data validates derived finder names **and `@Query`
property references at CONTEXT STARTUP**, not compile time. Consequences, all hit for real:

- A renamed column with a stale `@Column` fails **every** `@SpringBootTest` at bootstrap, and the
  cached-context failure threshold then poisons the whole run. It is not scoped to the tests that
  touch that table.
- `findAllByOrderBySentAtDesc()` and a `@Query` saying `order by a.sentAt` both fail to BOOT while
  the entity field is still `updatedAt`. **`mvn compile` catches neither.**
- Because the module must compile, **an accessor rename is atomic with its call sites**. The
  `Announcement` rename had to land with `AnnouncementController`, `HomeController:79` and
  **`DevDataSeeder:471`** in one commit — and the seeder was a caller the plan had missed.

**The plan was repaired three times for this one root cause.** When splitting work, ask whether the
context can boot at the split point, not just whether it compiles.

### 2. A green suite says NOTHING about `@Profile("dev")` code

`DevDataSeeder` never runs under test. Task 6 correctly routed its announcement through
`AnnouncementService.send()` so recipient rows get written — and `send()` stamped `sent_by` from
`TenantContext.userId()`. Inside `TenantContext.runAsBox` the synthetic JWT carries
`subject(UUID.randomUUID())`, and `announcement.sent_by references users(id)`. **The dev seed would
have died on the foreign key and the whole stack would not come up**, surfacing in Task 11 as every
e2e spec failing at once — looking like a frontend regression.

`send()` now takes the author explicitly: the 3-arg form reads `TenantContext.userId()` for real
request threads; **system/seed callers use the 4-arg form** and pass a real id, or null.
**Proven on a `down -v` stack**: 15 recipient rows written by the seeder, `sent_by` → `coach@demo.io`.

### 3. `@TenantId` is BOX-scoping, never MEMBER-scoping

Both sides of a member-to-member leak sit in the same box, so the tenant filter passes it, and
`AuthzConformanceTest.java:95` documents (verified, against `LiftController`) that its probe (d) is
cross-box only and **cannot see an intra-box leak**. `SecurityConfig.java:87` gates `/api/box/**` at
`SCOPE_box` alone — any authenticated member of any box — so role enforcement is **per-handler only**.
A finder that loses `AND membership_id = :me` leaks private correspondence past a green suite.
Hence spec §4's three countermeasures and the **fourth per-endpoint test: cross-member-denied.**

### 4. Registering a route is often NOT enough for the conformance sweep

Two separate stops this milestone:

- **Validation runs before authz.** `@Valid @RequestBody` with `@NotBlank` rejects the probe's `{}`
  with a **400 before `RoleGuard` executes**, and the sweep says so verbatim: *"400 means validation
  ran before authz"*. A 400 does not prove a route is guarded. Fix is the sweep's own `bodies` map.
- **A `{id}` route needs a seeded resource AND the row the handler looks up.** `{id}` resolves off
  the **preceding path segment** (`concrete()`, line ~642), so the seed goes in under `announcements`.
  And the **positive control** re-issues every denied probe with box A's own admin token and requires
  a non-404 — so that admin needed a real `announcement_recipient` row, or the control fails against
  a perfectly correct handler.

Cumulative edits to that file this milestone: **MIN_ROLE entries, `pathIds`, `bodies` only.** Four
deletions, all retired routes. No assertion weakened. `MIN_PROBES` floors deliberately untouched —
they are minimums and still satisfied.

### 5. A GET must not write

`MessagingService.threadFor()` saves. Both the member `GET /me/thread` and the staff
`GET /threads/{membershipId}` called it, so merely **opening** the Messages screen would create a
thread row — and the shared inbox lists threads, so it would fill with empty conversations nobody
started. It happened not to write only because `@Transactional(readOnly)` sets flush mode MANUAL and
swallowed the insert; **deleting that one flag took row count 4 → 5.** Both paths now resolve
without creating, and `markRead` no-ops when there is no thread. Two guard tests, mutations named.

### 6. Bash cwd resets, and a redirect will hide it

`mvn` ran from the repo root twice and died with *"no POM in this directory"* — once with the error
sent to `/dev/null`, which made a stale surefire report look like a passing run (identical
`Time elapsed` was the tell). **Put the `cd` in the same command as the tool, and always check the
exit code. Never redirect a gate's stderr away without checking `$?`.**

### 7. A pre-existing flake, fixed

`SubscriptionLapseTest` built an email by interpolating `Math.random()`. Below 1e-3 (~0.1% of runs)
`Double.toString` renders an **uppercase `E`** while registration stores the address lowercased, so
the Mockito verify missed on a case difference. Hit for real. Last touched in M16a; fixed in its own
commit.

---

## M40 is a NEW milestone, filed this session

**`docs/ROADMAP-AT-A-GLANCE.md` row 35b — write-path limits.** Raised by the user while reviewing
messaging: *can a logged-in user hammer the endpoint?* Yes. Checked whether it collapses into an
existing milestone — it does not. **M28 owns tuning** rate limits for a class-opening rush; **M38
owns measuring** performance; **nobody owned coverage.**

Measured 2026-08-29: **47 POST endpoints, 4 rate-limited. 41 request records, 11 with `@Size`.**
Every bucket keys on **IP, never user**. Worst shape is `POST /api/box/lifts` — ATHLETE-reachable,
unbounded rows, free-text `notes` with **no cap at all** — and it pre-dates M29a. Full numbers and
the reasoning are in `docs/BACKLOG.md`.

**Do NOT "fix" it by widening `WRITE_PATTERNS`.** That bucket is per-IP and already holds `booking`;
`application.yml` records that it has never been measured against a real rush, so widening it makes
a false 429 on booking *more* likely. The limit has to be **per-membership**, keyed on `TenantContext`.

---

## Still open, still not yours — the TV lost-push bug

A TV SSE push can go missing. **OPEN in `docs/BACKLOG.md`, owned by M37**, not root-caused. M29a
deliberately uses **polling, not SSE** (D-5) precisely so messaging does not inherit it. If
`runner.spec.ts` reds in Task 11, `TvStreamService.push()`'s WARN on a dropped connection is the
first place to look. **Do not add retries** — `playwright.config.ts` sets `retries: 0` and says why.

---

## Environment — do not rediscover

- **`NODE_OPTIONS` is poisoned.** Every bare `npm`/`npx`/`node` dies with `MODULE_NOT_FOUND` before
  anything starts. Always `env -u NODE_OPTIONS …`. **Put that line in every executor brief.**
- **There is NO `./mvnw`.** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Absolute paths everywhere**, `cd` in the same command (see trap 6).
- **Never `git add -A`** while an executor is running — it swallowed two executors' diffs in M39.
- **Never pipe a gate for its exit status** — in zsh `$?` after a pipe is the pipe's.
- `docker compose` lives at `docker/docker-compose.yml`, app at `http://localhost/app/`.
- **Run visual on a CLEAN stack** (`down -v`); `e2e/visual.sh` runs in a Linux container.
- **`ng build` does not compile spec files** — Karma is what catches a spec that will not compile.
- **`tsc` does not type-check Angular templates** — only `ng build --configuration production`.
- **The seeder is time-of-day dependent**: seeding before 00:20 or after 23:20 local puts a class on
  the wrong local day and fails `programming`/`tracking`/`runner`. **Check the clock before the diff.**
- Demo accounts, password `boxhub-demo-2026`: `triple@demo.io` (3 gyms), `duo@demo.io` (2),
  `blocked@demo.io` (PENDING + SUSPENDED), `nobox@demo.io` (none). **Do not change
  `multi@demo.io`'s memberships** — a visual baseline is recorded against them.

---

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits,
merges. It implements only genuinely delicate work (tenancy, concurrency, money, anything where a
wrong diff is expensive) and trivial glue. Executors are **Sonnet**, one per plan task, each brief
self-contained and carrying the `NODE_OPTIONS` line.

**Do not offer the user an execution-mode choice** — "always subagent" is settled in `CLAUDE.md` and
asking again wastes a turn.

**Verify, do not read a report.** Every executor this milestone returned "green" and every one was
spot-checked; that is how traps 2 and 5 were caught. An executor's green suite is evidence about the
suite, not about code the suite never runs.

**Weight executor pushback heavily.** Task 1's executor stopped and escalated a plan/reality conflict
rather than improvising, and was right — two more defects of the same class were found afterwards.

**Run the negative control on every test, and believe it.** Every guard test this milestone was
proven by breaking the thing it guards and watching it go red. If you cannot name the mutation a
test catches, say so.

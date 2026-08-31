# Next session — **M29a messaging. Screens done and signed off. Task 10 + 11 remain.**

**Not a fresh milestone.** M29a is mostly built on `main`, all green, all pushed. The messaging
model was **rewritten mid-milestone** on the user's ruling, both messaging screens are **finished,
reviewed by the user and past their gates**, and the announcements **backend** is done. What remains
is **one screen** and **the e2e/gate sweep**.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git log --oneline -1   # expect a147d88
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`.
> `git worktree list` must show exactly one entry.

**Spec:** `docs/superpowers/specs/2026-08-28-m29a-messaging-design.md` — read D-1..D-8 **and then
AMENDMENT A1, A1.7, A1.8, A1.9 at the end, which supersede large parts of it.**
**Plan:** `docs/superpowers/plans/2026-08-28-m29a-messaging.md` — **Tasks 8 and 9 in it are obsolete**
(they describe the superseded shared-thread model). Task 10 and 11 still stand, with the changes below.

---

## Gates, measured at the end of this session — none inherited

| Gate | Value |
|---|---|
| Backend | **620 / 0 / 0 / 0** |
| Karma | **505 / 505** |
| Production build | **green** |
| Four standing greps | all **0** |
| `AuthzConformanceTest` | registrations only; **no assertion ever weakened** |
| Conversations screen | audit **19/20**, critique **33/40**, no open P0/P1 |
| e2e / visual | **NOT RUN this session** — Task 11 owns them |

---

## THE BIG ONE: messaging was rewritten mid-milestone

The user saw Task 8 rendered and rejected the model. **Amendment A1** replaced it:

- **Person-to-person conversations.** An athlete messages a specific coach or the box admin; staff
  message anyone in the box. The shared "one thread per member, any staff answers" model is **gone**.
- **`V31` dropped and recreated `message_thread` and `message`.** A conversation is an unordered
  **pair** of memberships in canonical order under a check constraint, so the unique constraint
  means "one thread per pair" — the database guarantees it. Read state is per participant.
- **One `ConversationController`** replaced `MyThreadController` + `StaffInboxController`.
- **One `ConversationsPage`** serves `/athlete/messages`, `/coach/inbox` and `/admin/messages`.

### The security property that changed — understand this before touching messaging
The old design made "no athlete↔athlete" **structural**: the endpoint had no path ids, so it could
not be expressed on the wire. Naming a recipient reintroduced that wire, so the guarantee is now a
**rule** in one place, `MessagingService.assertMayMessage`, and the **cross-member-denied tests are
the only thing holding it**. `@TenantId` cannot help — both sides of a leak sit in the same box.
Verified live against the running stack: an athlete GET/POST/read against another athlete's
membershipId all return **403**, a coach's returns 200, and the athlete's contact list contains
**zero athletes**.

---

## What is DONE

**Backend** — `V30` + `V31` applied. `ConversationController` (5 routes), `MessagingService` with
`assertMayMessage`, per-participant read markers, `counterpartLastReadAt` for Read/Sent.
Announcements: segments, frozen audience, history with read counts, **and the new coach restriction
(below)**.

**Frontend** — `ConversationsPage`, finished and user-approved. It carries a lot of hard-won detail;
**do not "simplify" any of it** (see the trap list).

**The auth fix** (`ff91038`) — unrelated to M29a but it was blocking all review: an expired box token
answers **403, not 401**, so the interceptor's refresh-and-re-mint path never fired and the app
wedged 15 minutes after picking a gym, showing "Couldn't load" on every screen while `/api/me` still
returned 200. Box-scoped 403s now re-mint once and retry.

### Announcements: D-8 was narrowed (`a147d88`)
The user asked whether coaches should send announcements at all, was shown that D-8 exists for the
"coach cancels their own 6am" case, and chose the middle path:
- **BOX_ADMIN**: any segment — EVERYONE, CLASS_ROSTER, EXPIRING.
- **COACH**: **only CLASS_ROSTER, and only for a session they coach.**
Enforced in `AnnouncementController.assertMaySendToSegment`. **`class_sessions.coach_id` references
`users(id)`, NOT `memberships(id)`** — comparing a membership id would deny every coach while looking
correct. A null `coach_id` is unassigned: admin only.

---

## WHAT IS LEFT

### Task 10 — the announcements SCREEN (the only screen left)
**It does not exist. Nothing in `features/admin/` or `features/coach/` mentions announcements, and
`git log -S` says staff never had such a UI.** `messaging.service.ts` has `sendAnnouncement()` and
`announcements()` and **nothing calls either** — so right now an announcement can only be created by
the dev seeder. This screen is what makes the whole announcements feature reachable.

Agreed shape (**already chosen by the user — do not re-ask**): **composer on top, history below**,
one column. History rows show segment, sent time, and **`readCount` of `sentCount`**, mono/tabular.

Still open, and worth asking the user:
- **How the coach's class picker looks.** A coach may only pick a session they coach, so the picker
  should list *their own upcoming sessions*, not every class. `BookingService.listSessions(from, to)`
  exists and is what `coach/classes.page.ts` uses.
- Whether the coach route exists at all now (`/coach/announcements`) or whether coaches reach it
  some other way. The backend permits a coach to send, so a route for them is coherent.

Contract that still holds: sending is irreversible and fans out to real people, so **confirm before
sending, naming the recipient count**. Segment select is `bh-select` bound with `[(value)]` — it is
NOT a `ControlValueAccessor`. EVERYONE and EXPIRING must send `segmentRef: null`.

### Task 11 — e2e round-trip and the full gate sweep
- Write `e2e/tests/messaging.spec.ts`: member sends → staff sees it → staff replies → member sees it.
  Plus a segmented announcement reaching its roster and not reaching a non-member of it.
- **Rebuild both images and run on a `down -v` stack.** `retries: 0` stays — do not add retries.
- **Playwright is where two things finally get verified**, both currently unknown, neither a failure:
  1. **Rendering at 320px.** Chrome would not size its window below 500px this session, so the
     responsive audit dimension is held at 3/4 on an *unknown*, not a fail.
  2. **The narrow-viewport dock behaviour** — dock hidden inside a conversation, back restores it.
     Unit-specced with a stubbed `matchMedia`; never seen at a real narrow viewport.
- **Add an e2e guard that a conversation opens scrolled to its NEWEST message.** Three
  implementations shipped looking fine and were silently broken; the unit test passes regardless
  because it stubs the element and asserts the value *written*. Only a browser caught it.
- Then the full sweep: backend, Karma, production build, the four standing greps, the §8.1 greps,
  and `git diff origin/main -- .../AuthzConformanceTest.java` showing registrations only.
- Add spec §10's deferred items to `docs/BACKLOG.md`.

---

## Traps found THIS session — every one cost real time

### 1. A backtick inside an Angular `template:` or `styles:` string closes it
Cost two failed builds, both in comments I wrote. The errors never point at the comment: you get
`NG1002`, `Cannot find name 'styles'`, `No value exists in scope for the shorthand property '<a word
from your own comment>'`. **Diagnose with `grep -n '\`' <file>`** — backticks must appear only in the
pairs opening and closing `template:` and `styles: [`. Write those comments in plain prose.

### 2. `$localize` placeholder names must follow the expression IMMEDIATELY
`` `:@@id:${n} unread messages:count:` `` does **not** parse `:count:` as a placeholder — it ships as
literal text. The envelope's aria-label read **"5 unread messages:count:"** aloud, past Karma *and*
the production build. Correct form is `` `:@@id:${n}:count: unread messages` ``. Rendering the string
is the only way to catch it.

### 3. Scheduling against Angular's render: `afterNextRender`, not a microtask or a timer
Scroll-to-newest shipped broken **twice**. `queueMicrotask` runs before change detection writes the
rows; a `setTimeout(0)` macrotask can still beat the render, leaving the `@ViewChild` unresolved.
Both left `scrollTop` at 0 with 21 messages rendered and `scrollHeight` 2295. **The unit spec passed
all three times** because it stubs `Element.prototype` and asserts the value written, not where the
thread ends up.

### 4. A height chain cannot resolve against `min-height: 100dvh`
The shells set `min-height`, which is not a definite height, so `height: 100%` fell back to auto, the
thread grew instead of scrolling, and the composer drifted and hid under the dock. Fixed by an
**opt-in viewport lock** (`ShellChromeService.viewportLocked`) rather than changing `.app`/`.content`
globally — those are shared by ~15 screens. **Both shell flags are released unconditionally in
`ngOnDestroy`; leaking either breaks the whole app** (no navigation, or no scrolling).

### 5. `UUID.compareTo` is signed; Postgres orders `uuid` unsigned
They disagree for about half of random v4 UUIDs, which intermittently violated `V31`'s pair-order
check constraint. Order pairs with `toString()`.

### 6. A negative control can be invalid
`if (false && …)` removed TypeScript's narrowing and broke the **build** — a compile error proves
nothing about a test. Mutate a *value* (`err.status === 9999`), not the reachability. Separately, one
backend assertion was too lenient (`isAfterOrEqualTo`) and stayed green under the bug, because two
`Instant.now()` calls can land on the same instant.

### 7. `--faint` passes on `--ground` and fails on `--surface-2`
5.07:1 vs **4.27:1**, under AA. It only showed on the *selected* row. `search-bar.component.ts`
already recorded that exact number and the fix: `--bone-dim`, 7.17:1.

### 8. Measuring the wrong element looks like a pass
An avatar-centring check measured the **hidden spacer** avatar that collapsed runs leave behind and
reported 0px offset. Re-measured on visible avatars only: **10px off** on every message that showed a
timestamp.

---

## Working agreement (binding, reinforced this session)

- **ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits.
  Every executor this session reported green; spot-checking caught real defects in several.
- **Verify in the browser, not only in Karma.** Karma passed while the composer was volt, the
  aria-label was broken, the scroll never landed, and the composer hid under the dock.
- **Run the negative control and believe it** — see trap 6.
- **The user reviews the rendering BEFORE audit/critique** (memory: `user-visual-signoff-before-audit`).
  **Give a click path, never a screenshot.**
- **A new screen gets 3–4 real layout options for the user to choose from** (memory:
  `shape-options-for-new-screens`); a repeat of an agreed shape is the orchestrator's to decide.
- **Do not adjust scores yourself.** Mid-session I reported a "re-scored" critique that was really me
  adjusting two heuristics by hand; the user caught it. Re-running means re-running.
- **The user's answers can reverse the spec.** D-1, D-3 and D-8 were all overturned this session.
  When that happens, **amend the spec in the same commit** — a stale spec line caused a critique to
  file a P1 against perfectly correct code (A1.9).

---

## Environment — do not rediscover

- **`NODE_OPTIONS` is poisoned.** Every bare `npm`/`npx`/`node` dies with `MODULE_NOT_FOUND`.
  Always `env -u NODE_OPTIONS …`. **Put that line in every executor brief.**
- **There is NO `./mvnw`.** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Never pipe a gate and read `$?`** — that is the pipe's status. Redirect to a file, `echo $?`, grep it.
- Absolute paths, `cd` in the same command as the tool.
- **Never `git add -A`** while an executor is running; stage explicit paths.
- `docker compose -f docker/docker-compose.yml`, app at `http://localhost/app/`.
  **Rebuild the frontend image before any browser pass means anything.**
- **Chrome will not size its window below ~500px**, so 320px cannot be checked by hand — Playwright
  sets its own viewport.
- **The assistant does not log in on the user's behalf.** Ask the user to log in; the session cookie
  is httpOnly and per-profile, so it persists across tabs. `admin@demo.io` (BOX_ADMIN) reaches all
  three shells. Demo password is in the repo docs; accounts: `athlete@demo.io`, `coach@demo.io`,
  `admin@demo.io`, `triple@demo.io`, `duo@demo.io`, `blocked@demo.io`, `nobox@demo.io`.
  **Do not change `multi@demo.io`'s memberships** — a visual baseline is recorded against them.
- The seeder is time-of-day dependent: seeding before 00:20 or after 23:20 local puts a class on the
  wrong local day and fails `programming`/`tracking`/`runner`. **Check the clock before blaming a diff.**

## Still open, still not yours — the TV lost-push bug
A TV SSE push can go missing. OPEN in `docs/BACKLOG.md`, owned by **M37**. M29a uses polling, not
SSE, deliberately. If `runner.spec.ts` reds, look at `TvStreamService.push()`'s WARN — and **do not
add retries**.

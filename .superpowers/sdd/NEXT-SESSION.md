# Next session — **M29b is IN PROGRESS on branch `m29b-notifications`. Resume at Task 19.**

**Tasks 1–18 are done, committed and green.** The whole backend exists (event model, every emitter,
three jobs, retention, both APIs, authz registration) and so does all the frontend plumbing (service,
models, `bell` icon, `bh-notification-bell` in all three shells, the copy map).

**What is left is the two screens and the closing gates** — and both screens need YOU, because each
owes the full impeccable routine with Claude in Chrome connected.

| | |
|---|---|
| Branch | `m29b-notifications`, **local only, never pushed** |
| HEAD | `a2cc3ad` |
| Working tree | clean apart from this file and `progress.md` |
| Backend suite | **749 / 0 / 0 / 0**, BUILD SUCCESS |
| Karma | **568 SUCCESS** |
| Production build | clean, **zero warnings** |

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M29b.

cd ~/dev/boxhub && git checkout m29b-notifications && git status
# expect a2cc3ad, clean tree

Do NOT create a worktree and do NOT run EnterWorktree — git worktree list must
show exactly one entry. Do NOT branch off again; this branch IS the work. The
branch is local only and has never been pushed.

Tasks 1-18 are committed and green. Confirm all three baselines before
building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test     # 749/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                   # 0 warnings
Expect 749 / 0 / 0 / 0, TOTAL: 568 SUCCESS, and a build with zero warnings.
The "Mailer ... Couldn't connect to host, port: localhost, 1025" ERROR lines
are pre-existing SMTP log noise — judge only by "Tests run:" and "BUILD
SUCCESS".

The plan is docs/superpowers/plans/2026-09-03-m29b-notifications.md — start at
Task 19 (line 3890). The spec is
docs/superpowers/specs/2026-09-03-m29b-notifications-design.md; §2's fourteen
decisions are recorded so they are not re-argued, and §10 governs both screens.

START AT TASK 19, THE FEED PAGE. Remaining: 19 the feed page, 20 the
preferences page, 21 e2e, 22 baselines + full gate sweep + merge.

TASKS 19 AND 20 ARE NEW SCREENS AND EACH NEEDS THE FULL IMPECCABLE ROUTINE:
  shape -> build -> SHOW ME THE RENDER -> audit >=16/20 -> critique >=32/40
  -> fix every P0/P1 -> re-run BOTH
Both gates need Claude in Chrome connected. If the browser is unavailable,
STOP AND ASK — do not score anyway. Give me a CLICK PATH, not a screenshot.
Never adjust a score by hand; re-running a gate means re-running it. Ask me
before inventing any UI element. `harden` also applies to the feed (it renders
real user-supplied data — a long class name, a long gym name).

Neither screen has a route yet: app.routes.ts is untouched on purpose, so the
bell's routerLink does not resolve until Task 19 adds it. That is expected.

Two things that must not be undone:
1. NEW_ANNOUNCEMENT rows delegate read state to announcement_recipient.read_at
   and leave notification.read_at null forever. ONE read marker per
   announcement. ReadStateDelegationTest proves it in both directions.
2. The feed excludes messages — the envelope keeps them, with its own badge
   and its own read marker. Two badges counting one message is the same bug
   twice.

NotificationService.emit is @Transactional(propagation = MANDATORY). If a task
seems to need it relaxed to REQUIRED, that task forgot to open a transaction —
give it a TransactionTemplate, never relax the propagation.

ALWAYS subagent: dispatch one Sonnet executor per plan task, review every diff
yourself, run the gates yourself, commit yourself. Executors return BEFORE
their own background suite finishes — this happened repeatedly — so verify
suite results from the output file rather than from the agent's summary, and
never conclude from one git log that an executor did nothing.

TASK 22 IS ORCHESTRATOR-ONLY (visual baselines, the full gate sweep, merge).
Any further edit to AuthzConformanceTest is orchestrator-only too; all six
M29b routes are already registered and it is green.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. Never pipe a gate and read $?. `-Dtest` takes a COMMA-separated
list, not `+`. Compose from the repo root, Playwright from e2e/. Rebuild the
frontend image before any browser pass AND verify the testid is in the served
bundle, not just the source.
```

---

## The fifteen commits of the last session

| Commit | What |
|---|---|
| `e6cd395` | T5 booking emitters (+ a `markNoShow` double-fire guard the plan missed) |
| `60606e4` | T6 session emitters; `patch` gains `@Transactional` |
| `0108857` | T7 announcements — the D-3 delegation at the emit site |
| `f593ada` | **T9 the no-show sweep off `runAsRoot`** (tenancy, orchestrator) |
| `895ecf4` | T8 membership / payment / invite emitters |
| `8476524` | docs: `NEW_MEMBER_JOINED` has no trigger |
| `6c221cf` | T10 `SubscriptionExpiringJob` |
| `4bb7349` | T11 `ClassReminderScheduler` + the registry §5.5/§4.1 amendments |
| `187f462` | **fix: a booking with no membership must not break a fan-out** |
| `4a496a4` | T12 retention + the reminder-sweep measurement |
| `14276f3` | T13 the feed API + four routes registered in the authz sweep |
| `5ea65aa` | T14 preferences API + the last two routes |
| `70e6fd1` | T16 service, models, `bell` icon |
| `590e085` | T17 the header bell in all three shells |
| `a2cc3ad` | T18 the copy map |

---

## What Task 19 and Task 20 have to work with (all built and green)

**API, all six routes registered in `AuthzConformanceTest` and passing:**

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/box/notifications?cursor=` | `{ rows: FeedRow[], nextCursor }` — 30 per page, `showsInFeed` types only |
| `GET` | `/api/box/notifications/unread-count` | `{ count }` |
| `POST` | `/api/box/notifications/{id}/read` | marks one read; **routes to `announcement_recipient` for `NEW_ANNOUNCEMENT`** |
| `POST` | `/api/box/notifications/read-all` | marks the feed read across BOTH tables |
| `GET`/`PUT` | `/api/box/me/notification-prefs` | effective per-type state; PUT takes `[{type, channel, enabled}]` |

**Frontend:** `NotificationService` (`unread` signal, `refreshUnread`, `list(cursor?)`, `markRead`,
`markAllRead`, `prefs`, `savePrefs`), `notification.models.ts`, `notification-copy.ts`
(`NOTIFICATION_COPY[type] → { icon, title(p), body(p) }`, every string `$localize`d),
`bh-notification-bell` in all three shell headers.

**Still to add in Task 19/20:** the routes in `app.routes.ts` under all three shells
(`notifications` and `notifications/settings`), the two pages themselves.

Spec §10 describes both screens: the feed is day-grouped (Today / Yesterday / date), per-type icon,
unread rows carry a bone dot and a heavier title, timestamps in mono, "Mark all read" in a sticky
header, announcement rows open a detail sheet in place rather than navigating. The preferences page
is one row per type grouped by the registry's four categories, mandatory types rendered **locked with
the reason stated**, never as a disabled control with no explanation.

---

## Findings from the last session that changed the plan

- **`NEW_MEMBER_JOINED` has no trigger and ships unemitted.** Production code has exactly two
  membership-creation paths: `InviteAcceptTx` (that is `INVITE_ACCEPTED`'s) and `BoxSignupTx`, which
  creates a box **together with its owner** — so the only ACTIVE admin at that instant is the person
  who just signed up, and the row would tell them they joined their own gym. There is no route by
  which somebody joins an *existing* box other than an invite. Identical failure to
  `PR_CONGRATULATED`. The enum constant, icon, link, copy entry and preference row all stay; one line
  when self-signup ships. Recorded in spec §5.3, `docs/NOTIFICATIONS.md` and `docs/BACKLOG.md`.
- **A drop-in visitor would have broken four fan-outs.** Since M22 `bookings.membership_id` is
  nullable (V26 `ck_booking_subject`) while `notification.membership_id` is NOT NULL, so a roster
  mapped straight to membership ids aborts its caller's whole transaction: **a coach could not cancel
  a class containing a drop-in**, and one overnight visitor booking would kill a box's entire no-show
  sweep. Guarded once in `NotificationService.emitAll` — a guard per caller is one caller away from
  being forgotten. Latent today; nothing creates visitor bookings yet.
- **A per-minute cron DOES fire inside the test suite.** Every other job here is a 3am cron, so nobody
  had hit it. `ClassReminderScheduler` is now driven by `boxhub.class-reminder-cron`, set to `-`
  (`Scheduled.CRON_DISABLED`) in `AbstractIntegrationTest`.
- **`SessionController.patch` had no transaction at all**, so `emit`'s MANDATORY propagation would
  have thrown. It gets `@Transactional`, matching `AnnouncementController` / `MemberController`.
- **The reminder sweep is measured, not asserted.** 300k sessions across 300 boxes → Bitmap Index
  Scan on `(box_id, start_at)`, 9 buffers, **0.047 ms**; ~14 ms per 300-box sweep. Spec §13 risk closed.
- **The plan's Task 15 seeding advice was backwards.** The authz sweep's positive control re-issues
  denied probes with box A's **OWNER** token and the route resolves `{id}` against the caller's own
  membership, so the seeded notification must belong to the owner, not the athlete.

---

## Traps that cost time last session

1. **An executor returns before its own background gate finishes.** Happened repeatedly. Verify the
   suite result yourself from the output file, never from the agent's summary.
2. **AssertJ passes vacuously on an empty list** — `allSatisfy`, `noneSatisfy`, `doesNotContain`,
   `extracting`. Six such assertions were written across three tasks, each of which would have
   survived emission breaking completely. Assert the row COUNT first, then the property.
3. **`AbstractIntegrationTest` has ONE Postgres container per JVM and NO rollback or cleanup.** Every
   other class's rows are present. Isolation is a fresh box per test plus `@TenantId` filtering; never
   assert a global count.
4. **An anonymous non-GET returns 403, not 401** — the CSRF filter rejects before authentication, so
   the auth check under test is never reached. Add `.with(csrf())`, as the authz sweep does.
5. **The dev gallery forbids API calls**, and a `providedIn:'root'` service means every instance on
   the page shares one signal. `dev-gallery.page.spec.ts` hard-codes the section list and must be
   updated in the same commit that adds a section.
6. **A backtick in a component's template/styles comment closes the string** and the errors never
   point at it.
7. Pre-existing `Mailer ... Couldn't connect ... 1025` ERROR lines are SMTP noise, not failures.

---

## Not yours

- **The TV SSE lost-push bug** — open in `docs/BACKLOG.md`, owned by **M37**. If `runner.spec.ts`
  reds, read `TvStreamService.push()`'s WARN. Do not add retries.
- Three product questions parked in `docs/BACKLOG.md` under "Found during M29a, not owned by it",
  plus the M29b entry on `NEW_MEMBER_JOINED`.

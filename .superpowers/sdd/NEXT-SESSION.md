# Next session — **M29b is IN PROGRESS on branch `m29b-notifications`. Resume at Task 4's review.**

M29b (notifications) is brainstormed, specced, planned and part-executed. **Tasks 1–3 are done and
committed. Task 4 is written but UNCOMMITTED and its full-suite gate never finished** — the session
ended mid-run. Nothing is on `origin`; the branch is local only.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M29b.

cd ~/dev/boxhub && git checkout m29b-notifications && git status

Do NOT create a worktree and do NOT run EnterWorktree — git worktree list must
show exactly one entry. Do NOT branch off again; this branch is the work.

FIRST THING, before anything else: there is uncommitted work in the tree from
Task 4 (NotificationService). Its targeted tests passed 9/9 but the full
backend suite was still running when the session ended, so it is UNVERIFIED.
Re-run the full suite yourself, review the diff, and only then commit it.
Do not trust the 9/9 — it does not cover regressions elsewhere.

The plan is docs/superpowers/plans/2026-09-03-m29b-notifications.md, 22 tasks,
each with real code and its own gates. The spec is
docs/superpowers/specs/2026-09-03-m29b-notifications-design.md — read §2's
decisions before touching anything; they are recorded so they are not
re-argued.

ALWAYS subagent: dispatch one Sonnet executor per plan task, review every diff
yourself, run the gates yourself, commit yourself. Executors have been
reporting green while leaving real defects — every diff this session needed
something.

TWO TASKS ARE ORCHESTRATOR-ONLY, never dispatched:
- Task 9, the runAsRoot restructure of BookingMaintenance (tenancy).
- Task 15, registering six routes in AuthzConformanceTest (additions only).

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. Never pipe a gate and read $?. Compose from the repo root,
Playwright from e2e/.
```

---

## State at hand-off

| | |
|---|---|
| Branch | `m29b-notifications`, **local only, never pushed** |
| HEAD | `b1b0d6a` |
| Working tree | **DIRTY** — Task 4's `NotificationService.java`, `NotificationServiceTest.java`, and a modified `docs/NOTIFICATIONS.md` |
| Backend suite | **667 / 0 / 0 / 0** as of `b1b0d6a`. Task 4 adds 9, so it should reach 676 |
| Frontend | untouched so far |

### Commits so far

| Commit | What |
|---|---|
| `3015ea0` | The design spec |
| `64336fa` | Deferred `PR_CONGRATULATED` to M25 |
| `e1d8994` | The 22-task plan |
| `8aac1e5` | Task 1 — `HomeController`'s `<= 7` becomes `<= EXPIRING_SOON_DAYS` (executor) |
| `50531bd` | Task 1 follow-up — two dependents the executor missed (orchestrator) |
| `8aac672` | Plan correction: there are no shared test fixtures |
| `b1b0d6a` | Tasks 2+3 — `V32`, both entities, both repositories, `NotificationType` |

### Task 4, uncommitted

`NotificationService` with `emit` / `emitAll`, both `@Transactional(propagation = Propagation.MANDATORY)`
— verified present. Targeted run was **9/9 green**. The full suite was mid-run at hand-off, so
**re-run it before committing.** `docs/NOTIFICATIONS.md` §5.1 was also amended in the same working
tree and belongs in the same commit.

---

## What M29b is

Fourteen declared events, twelve of which write a feed row; a bell beside the existing messages
envelope in all three shell headers; a routed day-grouped feed page; a per-type, per-channel
preferences page. `docs/NOTIFICATIONS.md` is the registry it implements.

**The two decisions that must not be undone:**

1. **`NEW_ANNOUNCEMENT` rows delegate read state to `announcement_recipient.read_at`** and leave
   `notification.read_at` null forever. There is exactly ONE read marker per announcement. Two of
   them would disagree the first time someone read an announcement from the feed instead of the home
   card. Task 13 carries the test that proves it in both directions — it is the milestone's single
   most important assertion.
2. **The feed excludes messages.** `bh-messages-envelope` keeps its own badge and its own read
   marker. A message row in the feed would mean two badges counting one message — the announcement
   bug, in a second place.

---

## Findings from this session that changed the plan

- **`PR_CONGRATULATED` cannot be built.** The registry claims *"PostLike exists already"*. The entity
  and repository do, but **nothing in the codebase ever inserts one** —
  `grep -rn "postLikes.save\|new PostLike" backend/src/main/java` is empty, and the only references
  are in `PerformanceQueries`' GDPR export. There is no endpoint to like a post. Deferred to **M25
  (social)**, which owns likes. This was an error in the approved spec: an emit site was listed
  without being verified.
- **`BookingMaintenance` runs the no-show sweep under `runAsRoot`**, and its own comment states the
  precondition that emitting a notification breaks: *"never INSERTs a `@TenantId` row"*. Under root
  the rows take the sentinel `box_id` and are invisible to their own readers. A nested `runAsBox`
  cannot fix it — setting the tenant on an open Hibernate session is a no-op. **Task 9 restructures
  it to iterate boxes; orchestrator only.**
- **`AdminStatsController` had a third expiry literal**, `plusDays(15)`. It was NOT a disagreement:
  `isBefore(+15)` and `!isAfter(+14)` select the same days, 0..14. It was `EXPIRING_SOON_DAYS + 1` by
  coincidence of a strict bound and would have diverged the moment anyone changed the constant.
  Folded in behaviour-preservingly in `50531bd`.
- **There are no shared test fixtures.** `AbstractIntegrationTest` supplies only the Testcontainer and
  properties. Every integration test class writes its own `newBox` / `member` / `actAsBox`. Every
  `seedX()` in the plan is a fixture the executor must write — copy
  `backend/src/test/java/com/boxhub/notify/NotificationEntityTest.java`, which now has a working one.

---

## Remaining tasks

5–8 emitters · 9 the `runAsRoot` restructure (**orchestrator**) · 10–12 jobs and retention ·
13–14 the API · 15 `AuthzConformanceTest` (**orchestrator**) · 16–18 frontend service, bell, copy ·
19 the feed page · 20 the preferences page · 21 e2e · 22 baselines, gates, docs, merge.

**Tasks 19 and 20 are new screens** and each needs the full impeccable routine —
`shape → build → user sign-off on the render → audit ≥16/20 → critique ≥32/40 → fix every P0/P1 →
re-run BOTH`. Both gates need Claude in Chrome connected; a source-only pass is provisional. Show the
user a **click path, not a screenshot**, and never adjust a score by hand.

---

## Traps that cost time this session

1. **An executor reported "full suite still running" and returned anyway.** Its commit landed a minute
   later, after I had already inspected the tree and concluded nothing was committed. **Check
   `git log` again before concluding an executor did nothing.**
2. **An executor's finding can be real with the wrong diagnosis.** The `AdminStatsController` catch was
   good; its claim that the surface "can still disagree" was false. Verify the reasoning, not just
   the location.
3. **`grep -c` returning 0 exits non-zero** and silently breaks an `&&` chain, so the next check in
   the chain never runs and its absence looks like a pass. Separate the commands.
4. **A stale comment is a dependent.** `SegmentResolver`'s javadoc said the athlete banner *"is a
   different question and stays at 7"* — the reverse of what shipped. Grep comments, not just code.
5. Pre-existing `Mailer ... Couldn't connect to host, port: localhost, 1025` ERROR lines are SMTP log
   noise in every backend run. They are **not** failures. Judge by `Tests run:` and `BUILD SUCCESS`.

---

## Not yours

- **The TV SSE lost-push bug** — open in `docs/BACKLOG.md`, owned by **M37**. If `runner.spec.ts`
  reds, read `TvStreamService.push()`'s WARN. Do not add retries.
- Three product questions parked in `docs/BACKLOG.md` under "Found during M29a, not owned by it".

# Next session — **M29a. All screens built and USER-APPROVED. Audit + critique + Task 11 remain.**

**Not a fresh milestone, and not a design session.** Every screen M29a owns is built, reviewed in the
browser by the user, and signed off — *"all the screens are good"* (2026-09-01). What is left is the
**scoring** the impeccable routine requires, and the **e2e/visual sweep**.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git log --oneline -1
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`.
> `git worktree list` must show exactly one entry.

**Spec:** `docs/superpowers/specs/2026-08-28-m29a-messaging-design.md` — read D-1..D-8, then
**AMENDMENTS A1, A1.7–A1.12 at the end, which supersede large parts of everything above them.**
A1.10, A1.11 and A1.12 are all from 2026-08-31/09-01 and are the most recent law.
**Plan:** `docs/superpowers/plans/2026-08-28-m29a-messaging.md` — Tasks 8/9 obsolete, Task 10 **done**,
**Task 11 is what remains.**

---

## Gates, measured at the end of this session — none inherited

| Gate | Value |
|---|---|
| Backend | **656 / 0 / 0 / 0** |
| Karma | **553 / 553** |
| Production build | green, **zero warnings** |
| Four standing greps | all **0** |
| §8.1 `ui/` greps | all **0** |
| `AuthzConformanceTest` | 3 `MIN_ROLE` entries + 1 `query` entry + 1 fixture seed — **orchestrator-audited, no assertion touched** |
| e2e / visual | **NOT RUN** — Task 11 owns them |
| audit / critique | **NOT RUN** — see below |

**All three re-measured by the orchestrator at session end, not inherited from an executor's report.**
Re-run them anyway before building on top — it costs minutes and the whole point of this file is that
nothing is taken on trust:

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/be.log 2>&1; echo $?; grep -E "Tests run:" /tmp/be.log | tail -1
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless > /tmp/k.log 2>&1; echo $?; grep TOTAL /tmp/k.log
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production > /tmp/b.log 2>&1; echo $?
```

---

## WHAT IS LEFT — two things

### 1. `audit` (≥16/20) then `critique` (≥32/40), per screen

**Deferred purely for time, not because anything is unresolved.** The user hit a usage limit and said
*"the audit and critique we will do them another time"*.

Screens to score — **`audit` BEFORE `critique`** (audit is deterministic and cheap, and its findings
should inform the review, not the reverse):

- `/admin/announcements` and `/coach/announcements` (one component, two routes)
- the athlete home announcements card + sheet (`athlete/home.page.ts`)

**Both passes need Claude in Chrome connected.** A source-only pass is provisional — `critique`
scores Nielsen heuristics, ~36 of its 40 points earnable without seeing a pixel. If the browser is
unavailable, **stop and ask; do not score anyway.**

**YOU MAY LOG IN.** The user ruled this on 2026-09-01, reversing the old "assistant does not log in
on the user's behalf" line: log into `http://localhost/app/` with the seeded demo accounts yourself.
Password is in `docs/HANDOFF.md:433`. Do not paste it into chat. This covers the LOCAL dev stack
only. **Do not change `multi@demo.io`'s memberships** — a visual baseline is recorded against them.

**Never adjust a score by hand.** Re-running a gate means re-running it — this was caught being
faked once already.

### 2. Task 11 — e2e round-trip and the full sweep

- Write `e2e/tests/messaging.spec.ts`: member sends → staff sees → staff replies → member sees.
  Plus a segmented announcement reaching its roster and not a non-member of it.
- **Add an e2e guard that a conversation opens at its NEWEST message.** Three implementations
  shipped looking correct; the unit spec passes regardless because it stubs the element and asserts
  the value *written*, not where the thread lands. Only a browser catches it.
- **Add an e2e guard that the class picker's day pager does not move.** Assert the pager button's
  bounding box is *identical* before and after paging days. A unit test cannot see this; the user
  found the bug by hand (cards slid under their finger and selected a class by mistake).
- **Two things remain UNKNOWN, not passing** — Chrome will not size its window below ~500px, so
  neither has ever been seen: **rendering at 320px**, and the **narrow-viewport dock behaviour**.
  Playwright sets its own viewport and is where both finally get answered.
- **Rebuild both images and run on a `down -v` stack.** `retries: 0` stays.
- Then the full sweep, and add spec §10's deferred items to `docs/BACKLOG.md`.

**Visual baselines — smaller than it looks.** `visual.spec.ts` captures auth + account screens and
components rendered **standalone in the dev gallery**. **No baseline captures a real shell or athlete
home**, so the new header envelope, the coach's four-tab dock and the home card break nothing. What
**does** need regenerating is **`button-{phone,tablet,desktop}.png`** — the gallery gained `lg` and
`lg + full` cells. Regenerate deliberately; a verify run straight after `--update-snapshots` always
passes and proves nothing.

---

## What this session built (all user-approved)

**Task 10 is DONE.** The announcements screen exists and the feature is reachable — before this,
`sendAnnouncement()` and `announcements()` had no callers and only the seeder could create one.

### The composer was REJECTED once and rebuilt — read A1.11 before touching it
The first build used native `<select>`s. The user rejected it and the reason is now **binding
project law** (CLAUDE.md, "MOBILE FIRST IS BINDING"): rxed ships to the App Store via Capacitor, and
on iOS a `<select>` collapses to a one-line wheel, so a class's name, time, coach and audience all
become `Fri 5 Sep · 06:0…`. **Design at 360px first; nothing scrolls horizontally at 320px; a
native select is banned for anything richer than a short plain label; primary actions are
full-width.** `docs/design-ref/` is the arbiter of "app-like" and had gone unread since 2026-08-19.

Rebuilt as: **To** = tappable radio-label rows; **class picker** = a `bh-sheet` with `bh-day-pager`
and **full-bleed image cards** (structure taken from `docs/design-ref/screens/booking-screen-example.webp`
— text over a `--scrim` on the image, *not* a thumbnail beside text); **Send** = `class="full"
size="lg"`.

### The picker's fixed height is a BUG FIX, do not "simplify" it
Days hold different numbers of classes, so a content-sized list made the sheet grow and shrink as
you paged — and a rapid tap on the arrow selected a class that slid under the finger. `.picker-body`
is `height: 55vh; max-height: 460px; overflow-y: auto`. **The height must not depend on its
contents.** Same treatment on the detail sheet's recipient list and the athlete list.

### Announcements are an OUTBOX, and read counts finally mean something
- `GET /api/box/announcements` is **mine-only** (`sentBy = userId()`), coach and admin alike (A1.12.1).
  Backfilled/seeded rows have a null `sentBy` and belong to nobody's outbox — **correct, tested,
  do not "fix"**.
- `GET /api/box/announcements/{id}/recipients` returns the announcement + an optional `ClassBrief` +
  recipients, **sender-only**. A null `sentBy` matches nobody.
- **The athlete side had NEVER marked anything read.** `GET /api/box/me/announcements` and
  `POST .../read` had zero frontend callers, so every `readCount` staff saw was 0 and always would
  be. The athlete card + sheet is what makes the whole read-count feature real.

### Two badge bugs fixed
- Coach and admin had **no unread indicator at all** — the envelope was only ever built into the
  athlete shell. Now one shared `bh-messages-envelope` in all three headers. **User ruling: header
  only, never the dock** — *"let mantain the identity"*. The coach's Inbox dock tab was removed
  (dock is now four); `/coach/inbox` lives on behind the envelope.
- The badge did not clear on read. `refreshUnread()` now lives inside `MessagingService.markRead`,
  so no caller can forget it.

### Shared-component changes (both owe the gallery, both done)
- `--tap-lg: 56px` in `_tokens.scss`; `bh-button` gained `size="lg"`; dev gallery gained `lg` and
  `lg + full` cells **and its stale note was corrected** — it claimed "both sizes keep the same
  min-height", no longer true.
- Style budget raised **6/8 kB → 12/20 kB** (`angular.json`). The old cap predated screens with
  sheets in them and was 1.1 kB from failing the build.

---

## Traps hit THIS session — all cost real time

1. **I rebuilt the image before an executor finished, then told the user to look.** They saw a stale
   bundle and reported the feature missing. **After any frontend change, rebuild AND verify the
   testid is in the served bundle**, not just the source:
   `docker compose -f docker/docker-compose.yml exec -T frontend sh -c "grep -rl '<testid>' /usr/share/nginx/html/*.js"`
2. **I piped a gate and read `$?`** and reported a false result. That is the pipe's status. Redirect
   to a file, `echo $?`, then grep the file. It is in the rules and I still did it.
3. **An executor's assertion was `count >= 0`** — passes for any number including zero, so it would
   have stayed green under the exact bug it existed to catch. Read every assertion an executor
   writes; a loose one is worse than none.
4. **The authz sweep 400s before `RoleGuard` runs** when a route has a required `@RequestParam`, so
   the role check is never exercised. The fix is the file's own `query` map (line ~374), which its
   failure message names. That is a sanctioned edit; **the orchestrator makes it, never an executor.**
5. **The sweep's seeded announcement had no `sentBy`.** Once "only the sender may read recipients"
   existed, the positive control took a legitimate 403 — indistinguishable from a broken route.
   Fixture now seeds the owner-admin as sender.
6. **`GET /api/box/me/announcements` had an N+1** that had never run because the endpoint had no
   caller. It was about to go live as 30 round trips. Fixed to one `findAllById`.
7. **A sort test that passes under the wrong rule tests nothing.** "Alphabetical" and "read-first
   then alphabetical" both pass a naive fixture; the test needs an unread name that sorts *before* a
   read one.
8. **I decided a screen's shape without asking** and the user caught it (*"no shape for the detail?
   are you confident to do it yourself?"*). A new surface gets 3–4 real options. Asking what it
   *shows* is not asking what it *is*.

---

## Working agreement (unchanged, reinforced)

- **ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits.
  Spot-checks caught real defects in several executors again this session.
- **Verify in the browser, not only in Karma**, and **verify the served bundle, not the source**.
- **A new screen gets 3–4 real layout options**; a repeat of an agreed shape is the orchestrator's.
- **The user reviews the rendering BEFORE audit/critique.** Give a click path, never a screenshot.
- **Do not adjust scores by hand.**
- **The user's answers reverse the spec** — amend the spec in the same commit. A1.10.4 was
  overturned by A1.11 within a day.

## Environment — do not rediscover

- **`NODE_OPTIONS` is poisoned.** Always `env -u NODE_OPTIONS …`. Put it in every executor brief.
- **There is NO `./mvnw`.** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Never pipe a gate and read `$?`** (trap 2).
- `docker compose -f docker/docker-compose.yml`, app at `http://localhost/app/`.
- **Chrome will not size its window below ~500px** — 320px is Playwright's job.
- The seeder is time-of-day dependent: seeding before 00:20 or after 23:20 local puts a class on the
  wrong local day and fails `programming`/`tracking`/`runner`. **Check the clock before blaming a diff.**

## Not yours

- **The TV SSE lost-push bug** — OPEN in `docs/BACKLOG.md`, owned by **M37**. If `runner.spec.ts`
  reds, read `TvStreamService.push()`'s WARN. **Do not add retries.**
- **The bell and the notifications page are M29b** (execution position 8, the next milestone).
  `docs/NOTIFICATIONS.md` is the new registry — §4.2.1 records exactly what M29a left ready for
  `NEW_ANNOUNCEMENT`, including that M29b must **share `announcement_recipient.read_at`, not invent
  a second read state**.

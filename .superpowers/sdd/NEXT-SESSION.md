# Next session — **M29a is CLOSED and PUSHED. Start M29b (notifications).**

M29a is finished: every task done, every gate green and measured, both screens user-approved and
past `audit` and `critique` with no open P0/P1. Everything is on `origin/main` at `d9b9d3c`. There
is nothing left to build in M29a.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and start M29b — notifications.

cd ~/dev/boxhub && git checkout main && git pull   # expect d9b9d3c, clean tree

Do NOT create a git worktree and do NOT run EnterWorktree — git worktree list
must show exactly one entry.

M29a closed cleanly, so this is a FRESH milestone: brainstorm → spec → plan →
execute, not a continuation. Two documents are the input and you must read both
before proposing anything:

- docs/NOTIFICATIONS.md — the registry I asked for. It lists every notification
  the product should fire with trigger, audience, channel and owning milestone,
  and §4.2.1 records exactly what M29a left ready for NEW_ANNOUNCEMENT.
- docs/superpowers/specs/2026-08-28-m29a-messaging-design.md §1 — the M29a/M29b
  boundary table. M29a owns thread state and emits nothing, deliberately.

The hard rule M29b must not break: the in-app feed SHARES
announcement_recipient.read_at. Do not invent a second read state — two of them
disagree the first time someone reads an announcement from the feed instead of
the home card.

Also settle before SUBSCRIPTION_EXPIRING ships: HomeController's 7-day athlete
banner vs EXPIRING_SOON_DAYS = 14. They currently answer different questions for
different readers, and a badge that disagrees with the banner on screen is worse
than either.

Ask me before inventing any UI element. A new screen gets 3-4 real layout
options; a repeat of an agreed shape is yours to decide. Show me the rendering
BEFORE audit or critique, and give me a CLICK PATH, not a screenshot. Never
adjust a score yourself — re-running a gate means re-running it.

ALWAYS subagent: dispatch executors, review every diff, run the gates yourself.
Critiques run inline on Sonnet and must be forbidden from spawning sub-agents.

You may log into the local dev stack yourself; the password is in
docs/HANDOFF.md. Environment: NODE_OPTIONS is poisoned, always
`env -u NODE_OPTIONS`. There is no ./mvnw. Never pipe a gate and read $?.
Rebuild the frontend image before any browser pass AND verify the testid is in
the served bundle, not just the source.

The traps at the end of this file cost real time last session. Read them before
writing an executor brief.
```

---

## Gates at close — all measured by the orchestrator, none inherited

| Gate | Value |
|---|---|
| Backend | **656 / 0 / 0 / 0** |
| Karma | **556 / 556** |
| Production build | green, **zero warnings** |
| e2e `messaging.spec.ts` | **4 / 4**, green on two consecutive runs at `retries: 0` |
| Visual suite | **33 passed**, 39 baselines regenerated, every change explained |
| Four standing greps + §8.1 `ui/` greps | all **0** |
| `AuthzConformanceTest` | registrations + request-shaping + one fixture seed. **No assertion weakened, no allowlist, no probe removed.** |
| Announcements screen | `audit` **19/20**, `critique` **36/40**, no open P0/P1 |
| Push | `origin/main` at **`d9b9d3c`**, clean tree |

**CI was still running at hand-off** (`ci` and `dependency-scan`, started 2026-09-02T21:04Z).
Check it: `gh run list --limit 3`.

---

## What M29a ended up being

Started as "messaging". Became messaging **plus** a rebuilt announcements system, because the
feature was unreachable: `sendAnnouncement()` and `announcements()` had no callers and only the dev
seeder could create an announcement.

**Messaging was rewritten mid-milestone** (amendment A1): person-to-person conversations replaced
the shared box thread. The security property changed with it — "no athlete↔athlete" used to be
structural (no path ids on the wire) and is now a **rule in one place**,
`MessagingService.assertMayMessage`, held up by cross-member-denied tests. `@TenantId` cannot help:
both sides of such a leak sit in the same box.

**Announcements** gained segments, a frozen audience, an outbox, a recipients view, and the athlete
side that makes read counts mean anything — before this, nothing in the app had ever called the
mark-read endpoint, so every `12/14 read` a coach saw would have been `0` forever.

**Two rules became binding project law**, both from the user rejecting rendered work:
- **MOBILE FIRST** (CLAUDE.md, amendment A1.11) — rxed ships to the App Store through Capacitor, and
  a native `<select>` collapses on iOS to a one-line wheel. 360px first, nothing scrolls at 320px,
  no native select for rich choices, primary actions full-width. `docs/design-ref/` is the arbiter
  of "app-like"; it had gone unread since 2026-08-19.
- **`bh-button variant="strong"`** — a screen's ONE primary action, `--bone` fill, at most one per
  screen. `solid` measured 1.1:1 against its own card and read as an empty box; `strong` is 15.9:1
  and still not volt.

---

## Traps from this session — every one cost real time

1. **I rebuilt the image before an executor finished and told the user to look.** They saw a stale
   bundle and reported the feature missing. After any frontend change, rebuild **and verify the
   testid is in the served bundle**:
   `docker compose -f docker/docker-compose.yml exec -T frontend sh -c "grep -rl '<testid>' /usr/share/nginx/html/*.js"`
2. **I piped a gate and read `$?`** and reported a false zero — after writing that exact rule into a
   brief. Redirect to a file, `echo $?`, grep the file.
3. **A false PASS and a false POSITIVE in the same audit.** First I measured card text against the
   scrim's own colour (8.96:1) instead of the scrim **composited over the photo** (2.57:1 — a real
   AA failure). Then my corrected sweep flagged a 4.27:1 label that was screen-reader-only and
   visually hidden; "fixing" it would have changed correct code. Exclude `clip-path: inset(50%)`,
   1×1 and zero-opacity nodes before believing a contrast sweep.
4. **A data-dependent WCAG failure is invisible in dev.** Seeded class images are dark, so card
   contrast passed at 6.13:1. Against a bright photo — which a real gym uploads — it was 2.57:1.
5. **A stale session makes correct code look broken.** A long-lived tab whose token had expired
   rendered the admin "To" chooser on the coach screen, from a cached `activeBox`. `/api/me` was
   returning 401 the whole time. **Check the session before filing a UI bug**; a fresh coach login
   showed the correct render.
6. **An executor asserted `count >= 0`**, which passes for any number including zero and would have
   stayed green under the exact bug it existed to catch. Read every assertion an executor writes.
7. **A sort test that passes under the wrong rule tests nothing.** "Alphabetical" and "read-first
   then alphabetical" both pass a naive fixture; it needs an unread name sorting *before* a read one.
8. **The authz sweep 400s before `RoleGuard` runs** when a route has a required `@RequestParam`, so
   the role check is never exercised. The remedy is the file's own `query` map, which its failure
   message names. **The orchestrator makes that edit, never an executor.**
9. **The sweep's seeded announcement had no `sentBy`**, so once "only the sender may read
   recipients" existed the positive control took a legitimate 403 — indistinguishable from a broken
   route. Fixture now seeds the owner-admin.
10. **An N+1 that had never run.** `GET /api/box/me/announcements` did one `findById` per row and had
    no caller until this session; it was about to go live as 30 round trips.
11. **A 1px text shift looks structural.** Visual baselines changed with a 255 channel delta over 124
    rows, which reads like a regression until you compare the images and find the content identical,
    one pixel lower, because the page above got taller.
12. **The visual suite was already red before this session** — `mail` entered the icon set in
    `05219e3` and the baseline was never regenerated, because Task 11 runs the suite and had not been
    reached. **A gate nobody runs is a gate that is already failing.**
13. **`npx playwright` from the repo root resolves the wrong Playwright.** There is no root
    `package.json`. Run `cd e2e && env -u NODE_OPTIONS node_modules/.bin/playwright test ...`.
14. **The impeccable plugin's own scripts need `env -u NODE_OPTIONS`** too.

---

## Working agreement (unchanged)

- **ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits.
  Spot-checks caught real defects in executors again this session.
- **Critiques run inline on Sonnet** and must be forbidden from fanning out — two prior fan-outs
  died on session limits and returned nothing. Hand the agent every measurement already taken, plus
  the design law, so it does not file findings against deliberate choices.
- **A new screen gets 3–4 real layout options.** Asking what a surface *shows* is not asking what it
  *is* — the user caught that omission here.
- **Do not adjust scores by hand.** Re-running a gate means re-running it.
- **You may log in** to the local dev stack (user ruling, 2026-09-01). Password in
  `docs/HANDOFF.md:433`; don't paste it into chat. **Do not change `multi@demo.io`'s memberships.**
- **The user's answers reverse the spec** — amend it in the same commit. A1.10.4 was overturned by
  A1.11 within a day.

## Environment — do not rediscover

- **`NODE_OPTIONS` is poisoned.** Always `env -u NODE_OPTIONS …`. Put it in every executor brief.
- **There is NO `./mvnw`.** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Never pipe a gate and read `$?`.**
- `docker compose -f docker/docker-compose.yml`, app at `http://localhost/app/`. Compose commands
  run from the **repo root**, not from `frontend/`.
- **Chrome will not size its window below ~500px** — 320px is Playwright's job and remains
  **unverified**, which is why the audit's responsive dimension is held at 3 rather than scored as a
  pass. Do not report it as checked.
- Visual regression runs **only** through `./e2e/visual.sh` (Linux container). A verify run straight
  after `--update-snapshots` always passes and proves nothing; review the image diff instead.
- The seeder is time-of-day dependent: seeding before 00:20 or after 23:20 local puts a class on the
  wrong local day. **Check the clock before blaming a diff.** `messaging.spec.ts`'s empty-day leg
  depends on today's classes having already started — recorded in its own commit message.

## Not yours

- **The TV SSE lost-push bug** — OPEN in `docs/BACKLOG.md`, owned by **M37**. If `runner.spec.ts`
  reds, read `TvStreamService.push()`'s WARN. **Do not add retries.**
- Three product questions parked in `docs/BACKLOG.md` under "Found during M29a, not owned by it":
  the confirm sheet not restating the message body, no resend/duplicate of a past announcement, and
  the `:focus-within` ring firing on mouse click.

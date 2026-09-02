# Next session — **M29a is COMPLETE. Merge it, then start M29b.**

Every task is done, every gate is green and measured, both screens are user-approved and past
`audit` and `critique`. There is **nothing left to build in M29a**.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git log --oneline -1
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`.
> `git worktree list` must show exactly one entry.

---

## Gates at close — all measured by the orchestrator, none inherited from an executor's report

| Gate | Value |
|---|---|
| Backend | **656 / 0 / 0 / 0** |
| Karma | **556 / 556** |
| Production build | green, **zero warnings** |
| e2e `messaging.spec.ts` | **4 / 4**, green on two consecutive runs at `retries: 0` |
| Visual suite | **green**, 26 baselines regenerated and every change explained in `3469472` |
| Four standing greps | all **0** |
| §8.1 `ui/` greps | all **0** |
| `AuthzConformanceTest` | registrations + request-shaping + one fixture seed. **No assertion weakened, no allowlist, no probe removed.** |
| Announcements screen | `audit` **19/20**, `critique` **36/40**, **no open P0/P1** |

---

## The one thing waiting on the user

**`bh-button`'s `solid` variant reads as barely a button** when it is a screen's single primary
action — measured `#1d231e` on a `#151a16` card, separated by a 1px hairline. The critique raised it
twice (P2) and it was **deliberately not fixed**: the remedy is a new shared treatment
(`--bone`-filled, dark text, still not volt) that every zero-volt screen inherits, so it owes a
dev-gallery section and new visual baselines, and it is a product call. Full write-up in
`docs/BACKLOG.md` under "Found during M29a, not owned by it". **Ask before building it.**

---

## What is actually left

1. **Push** — 30+ commits sit unpushed on `main`. The user has not asked for a push; ask first.
2. **Close the milestone** and move to **M29b** (notifications), execution position 8. Read
   `docs/NOTIFICATIONS.md` first — it is the registry M29b exists to consume, and **§4.2.1 records
   exactly what M29a left ready for `NEW_ANNOUNCEMENT`**, including the one rule that matters:
   **M29b must share `announcement_recipient.read_at`, not invent a second read state.** Two read
   states for one announcement disagree the first time someone reads it from the feed.

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

**Mobile-first became binding project law** after the user rejected the first composer: rxed ships
to the App Store through Capacitor, and a native `<select>` collapses on iOS to a one-line wheel.
See CLAUDE.md and amendment A1.11. `docs/design-ref/` is the arbiter of "app-like" — it had gone
unread since 2026-08-19.

---

## Traps from this session — every one cost real time

1. **I rebuilt the image before an executor finished and told the user to look.** They saw a stale
   bundle and reported the feature missing. After any frontend change, rebuild **and verify the
   testid is in the served bundle**, not just the source:
   `docker compose -f docker/docker-compose.yml exec -T frontend sh -c "grep -rl '<testid>' /usr/share/nginx/html/*.js"`
2. **I piped a gate and read `$?`** and reported a false zero — after writing that exact rule into a
   brief. Redirect to a file, `echo $?`, grep the file.
3. **A false PASS and a false POSITIVE in the same audit.** First I measured card text against the
   scrim's own colour (8.96:1) instead of the scrim **composited over the photo** (2.57:1 — a real
   AA failure). Then my corrected sweep flagged a 4.27:1 label that turned out to be
   screen-reader-only and visually hidden; "fixing" it would have changed correct code. Exclude
   `clip-path: inset(50%)`, 1×1 and zero-opacity nodes before believing a contrast sweep.
4. **A data-dependent WCAG failure is invisible in dev.** The seeded class images happen to be dark,
   so the card contrast passed at 6.13:1. Against a bright photo — which a real gym will upload — it
   was 2.57:1. Test the worst case, not the fixture.
5. **An executor asserted `count >= 0`**, which passes for any number including zero and would have
   stayed green under the exact bug it existed to catch. Read every assertion an executor writes.
6. **A sort test that passes under the wrong rule tests nothing.** "Alphabetical" and "read-first
   then alphabetical" both pass a naive fixture; it needs an unread name sorting *before* a read one.
7. **The authz sweep 400s before `RoleGuard` runs** when a route has a required `@RequestParam`, so
   the role check is never exercised. The remedy is the file's own `query` map, which its failure
   message names. **The orchestrator makes that edit, never an executor.**
8. **The sweep's seeded announcement had no `sentBy`**, so once "only the sender may read
   recipients" existed the positive control took a legitimate 403 — indistinguishable from a broken
   route. Fixture now seeds the owner-admin.
9. **An N+1 that had never run.** `GET /api/box/me/announcements` did one `findById` per row and had
   no caller until this session; it was about to go live as 30 round trips.
10. **A 1px text shift looks structural.** 17 visual baselines changed with a 255 channel delta over
    124 rows, which reads like a regression until you compare the images and find the content
    identical, one pixel lower, because the page above got taller.
11. **The visual suite was already red before this session** — `mail` entered the icon set in
    `05219e3` and the baseline was never regenerated, because Task 11 is what runs the suite and it
    had not been reached. A gate nobody runs is a gate that is already failing.
12. **`npx playwright` from the repo root resolves the wrong Playwright.** There is no root
    `package.json`. Run `cd e2e && env -u NODE_OPTIONS node_modules/.bin/playwright test ...`.

---

## Working agreement (unchanged)

- **ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits.
  Spot-checks caught real defects in executors again this session.
- **Critiques run inline on Sonnet** and must be forbidden from fanning out — two prior fan-outs
  died on session limits and returned nothing. Hand the agent every measurement already taken.
- **A new screen gets 3–4 real layout options**; a repeat of an agreed shape is the orchestrator's.
  Asking what a surface *shows* is not asking what it *is* — the user caught that omission here.
- **Do not adjust scores by hand.** Re-running a gate means re-running it.
- **You may log in** to the local dev stack yourself (user ruling, 2026-09-01). Password in
  `docs/HANDOFF.md:433`; don't paste it into chat. **Do not change `multi@demo.io`'s memberships.**
- **The user's answers reverse the spec** — amend it in the same commit. A1.10.4 was overturned by
  A1.11 within a day.

## Environment — do not rediscover

- **`NODE_OPTIONS` is poisoned.** Always `env -u NODE_OPTIONS …`, including for the impeccable
  plugin's own scripts. Put it in every executor brief.
- **There is NO `./mvnw`.** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Never pipe a gate and read `$?`.**
- `docker compose -f docker/docker-compose.yml`, app at `http://localhost/app/`. Compose commands
  must run from the repo root, not from `frontend/`.
- **Chrome will not size its window below ~500px** — 320px is Playwright's job, and remains
  **unverified**, which is why the audit's responsive dimension is held at 3 rather than scored as a
  pass.
- Visual regression runs **only** through `./e2e/visual.sh` (Linux container). A verify run straight
  after `--update-snapshots` always passes and proves nothing; review the image diff instead.
- The seeder is time-of-day dependent: seeding before 00:20 or after 23:20 local puts a class on the
  wrong local day. **Check the clock before blaming a diff.** `messaging.spec.ts`'s empty-day leg
  depends on today's classes having already started — recorded in its own commit message.

## Not yours

- **The TV SSE lost-push bug** — OPEN in `docs/BACKLOG.md`, owned by **M37**. If `runner.spec.ts`
  reds, read `TvStreamService.push()`'s WARN. **Do not add retries.**

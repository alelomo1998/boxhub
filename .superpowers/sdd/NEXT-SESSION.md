# Next session — **M17a: athlete home, book, class detail — and the shared class row**

| | |
|---|---|
| Branch | none yet — cut `m17a-athlete-daily` from `main` |
| Spec | **none yet** — start with `superpowers:brainstorming` |
| Plan | none yet |
| Roadmap | `docs/ROADMAP-AT-A-GLANCE.md` row 12 |
| Backend | **852 / 0 / 0 / 0** at M14c-b close |
| Karma | **1018 SUCCESS** at M14c-b close |
| e2e | **102 / 102** on a `down -v` stack at M14c-b close |
| Visual | 33 baselines from `76d2615`; not re-run since (no gallery change after). `pick-sheet` has none. |

**Never quote these numbers — re-run them first.**

## What M17a is

Read roadmap row 12, then `docs/POSITIONING.md` §4. In short:

- **Athlete Home, Book and class detail**, rebuilt through the impeccable routine (per screen).
- **The class row/card as ONE shared component across athlete Book and coach Classes**, actions
  differing by role (user-ruled 2026-09-06). Today each screen draws its own row.
- **`docs/design-ref/screens/booking-screen-example.webp` is the binding card shape** — full-bleed
  image, text on a scrim over it, not a thumbnail beside text. Nothing implements it yet.
- Filed defect: `athlete/home.page.ts` — the next-booking card links to `/athlete/book` instead of
  `/athlete/class/:id`.
- Grep `docs/BACKLOG.md` for `M17a` and `M17` before shaping — several entries are filed there by
  destination (Book's plain-string pill labels, `LIMIT_REACHED` copy, the missing
  `CANCEL_LIMIT_REACHED` case, the per-limit 409 reason).

## Rules the shared row MUST keep (shipped in M14c-b, user-ruled)

- **Past day** (`isPastDay` in `features/booking/session-window.ts` — calendar day before today, local):
  coach row shows **Check-in only** (no Build, no Run); athlete card shows **"Finished"**, an
  **"Attended"** pill if checked in, the **Booked** pill if booked, **no spots line, no Book**.
- **Today, started:** athlete sees "Started HH:mm" + Attended/Booked. **Checked-in athletes never see
  Book or Cancel.**
- Calendars reach **ten years back** (`[min]="-3650"`) and jump by month/year (`[jump]="true"`);
  announcements stays forward-only. Sessions load a window around the selected day
  (`sessionWindow`/`covers`) — keep that, don't go back to one fixed fetch.
- `bookedCount` includes CHECKED_IN (`BookingRepository.IN_CLASS`). Any new count of "who is in the
  class" uses that constant.

## Process (binding — see CLAUDE.md)

- brainstorm → spec → plan → per screen: **shape (3–4 options for a new screen) → build → user visual
  sign-off → audit ≥16/20 → fix P0/P1 → critique ≥32/40 in Chrome** → the user picks fixes → one batch.
- Always subagent (Sonnet) for plan tasks; short brief pointing at the plan; executors never commit.
- Critiques run inline with the DEGRADED banner; the impeccable detector is CSP-blocked — say so.
- Chrome cannot size below ~500px and its synthetic keys don't reach the page: keyboard/focus and
  320/360/393 measurements go through a **throwaway Playwright spec**, deleted after.
- Verify navigation end-to-end, never by asserting route config.

## Traps (still bite)

- Dev stack is `http://localhost` (nginx :80). Rebuild with `cd docker && docker compose up -d --build`.
  **`down -v` before a full e2e run** — `runner`/`tracking`/`tv`/`schedule` fail on a dirty stack.
- **The seed has no past classes.** To see past days, copy the next 7 days' sessions back 7 days and add a
  CHECKED_IN booking for athlete@demo.io (SQL in `progress.md`'s M14c-b notes is the shape; tables are
  `class_sessions` and `bookings`).
- `schedule.spec.ts` `revealDay` pages TOWARD its target; don't reintroduce a walk-back.
- Raw `page.request` writes need the `X-XSRF-TOKEN` header (see `library.spec.ts` `csrfHeaders`).
- DB score type is `NONE`, not `NOT_SCORED` (that is only the editor's label).
- `bh-sheet` is a native `<dialog>`; `bh-button [loading]` renders native `disabled` (restore focus with
  `afterNextRender`). A mouse drag is not a touch swipe (CDP, see `sheet-swipe.spec.ts`).
- No backticks in Angular template/style comments. `env -u NODE_OPTIONS` for npm. `JAVA_HOME` for mvn.
  `-Dtest=A,B` (comma). A zsh glob in `--include=*.ts` fails unquoted, and a failed glob aborts a `&&` chain.
- Signing in: the user signs in to Chrome; never type a password. Playwright may use the demo accounts
  (`boxhub-demo-2026`). A coach Chrome session bounces off `/admin/**` — the guard, not a bug.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and start M17a.

cd ~/dev/boxhub && git checkout main && git pull && git status
# expect a CLEAN tree at the M14c-b merge (or later).

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 852/0/0/0, TOTAL: 1018 SUCCESS, zero warnings.

THEN: git checkout -b m17a-athlete-daily, and brainstorm M17a (superpowers:brainstorming) from
roadmap row 12, the BACKLOG entries filed to M17a/M17, and docs/design-ref/. The shared class row
must keep the past-day rules listed in the handoff.

ALWAYS SUBAGENT (Sonnet) for plan tasks. Per-screen impeccable routine, browser-verified.
```

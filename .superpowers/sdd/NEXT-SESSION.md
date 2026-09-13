# Next session — **M14c-a is merged. Start M14c-b.**

| | |
|---|---|
| Branch | **`main`** at `a0512aa` — M14c-a merged (`f09d574`, 2026-09-13), `m14c-a-builder` deleted locally and on origin. |
| CI | **GREEN on `main`** at `a0512aa` — first green `ci` since 2026-09-07 (see below). |
| Next milestone | **M14c-b** library, benchmarks & types — roadmap row 11. **No spec, no plan yet**: starts at brainstorming. |
| Backend | 821 / 0 / 0 / 0, `BUILD SUCCESS` (re-run 2026-09-13) |
| Karma | 874 SUCCESS |
| Production build | zero warnings |
| Playwright e2e | **92 passed, 0 failed** on a fresh `down -v` stack |
| Visual regression | 33 passed (gallery untouched since) |
| Piece editor | `audit` 19/20, `critique` 35/40 |
| Class stack | `audit` 20/20, `critique` 34/40 |

## Ruled by the user at the close (2026-09-13)

1. **Piece editor's 38px collapsed name field** — stays filed in `docs/BACKLOG.md` ("M14c-a §10"). Not scheduled.
2. **Routine order amended in `CLAUDE.md`:** `audit → fix → critique`.

## CI was red on `main` from 2026-09-07 to 2026-09-13 — fixed, and why it hid

`SessionNotificationTest` (2 tests) failed ONLY on the Linux runner. Linux `Instant.now()` carries
nanoseconds, Postgres `timestamptz` stores microseconds, macOS clocks are micro-precision — so the
test's seeded value differed from the row it read back on CI and matched locally. Fixed `a0512aa` by
truncating to `ChronoUnit.MICROS`. **Trap for any new test: an `Instant` compared after a DB
round-trip must be truncated to MICROS, or it is green on a Mac and red in CI.** Because the backend
job was red, **the e2e CI job was SKIPPED for that whole week** — it ran again on `a0512aa`.

## After M14c-b

**M17a** (row 12) reworks both main pages: athlete home / book / class detail, and the ONE shared
class row for athlete Book and coach Classes (user-ruled 2026-09-06), implementing
`docs/design-ref/screens/booking-screen-example.webp`. Coach Classes' week strip already landed in M14b.

## What M14c-b inherits from M14c-a

- **`POST /api/box/wods/{id}/duplicate`** — the builder no longer calls it; the library page is its
  last caller. M14c-b decides its fate.
- **The seven remaining `wodType` consumers** — some are M14c-b's.
- **The library list already excludes class-owned copies** (`e978f55`); a standalone wod at
  `/coach/wods/new` IS a library row. The piece editor serves both `wods/new` and `wods/:id`.
- **`--faint` on `--surface-2` fails AA (4.27:1)** — a live trap for any new sheet or list row.
- **Disabled `bh-button` label is 2.18:1** — system-wide decision, still open.

## Environment traps (unchanged, still bite)

- `env -u NODE_OPTIONS` always. No `./mvnw`, no `timeout`; `JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
- Backend image needs `up -d --build` — the jar is baked in.
- `down -v` before a full e2e run — `runner`/`tracking`/`tv`/`schedule`/`booking-flow` are
  non-idempotent.
- Gallery change → the WHOLE visual set churns (scroll offset sets glyph sub-pixel phase). The
  per-section loop aborts at its first failure; run `./visual.sh --update-snapshots` TWICE.
- Never chain a grep gate with `&&`. Commit messages through a quoted heredoc. No backticks in
  comments inside Angular `template:`/`styles:` literals.
- Subagents: short brief, ONE file, detail in a contract file on disk; foreground only; ignore the
  graphify hook; leave the stack up.
- A seeded class may already be `PUBLISHED` — an e2e asserting the LIVE pill after a publish click
  proves nothing. Assert the outcome the click alone produces.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and start M14c-b: library, benchmarks & types
(roadmap row 11). Read the roadmap row and docs/ROADMAP-AT-A-GLANCE.md for order.

cd ~/dev/boxhub && git checkout main && git pull && git status
# expect a CLEAN tree at a0512aa (or later), CI green

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 821/0/0/0, TOTAL: 874 SUCCESS, zero warnings. The "Mailer ... port:
localhost, 1025" ERROR lines are pre-existing SMTP noise -- judge only by
"Tests run:" and "BUILD SUCCESS".

NO SPEC, NO PLAN EXISTS. Start at superpowers:brainstorming. Branch
m14c-b-library off main (a branch, never a worktree). A new screen gets 3-4
real layout options to pick from; ask, never invent a button/tab/field.

Per screen: shape -> build -> my visual sign-off -> audit (>=16/20) -> fix
every P0/P1 -> critique (>=32/40). A SCORED PASS NEEDS CLAUDE IN CHROME, not
just Playwright and never just source. MEASURE AT 320 / 360 / 393 / 768 /
1024 / 1280. Mobile first at 360px is binding.

ALWAYS SUBAGENT. One executor per task. The orchestrator dispatches, reviews
every diff, runs every gate ITSELF, and commits. NEVER accept an executor's
reported test numbers.

SUBAGENTS STALL ON THIS REPO. Short brief naming ONE file, detail in a
contract file on disk. Tell them: run everything in the FOREGROUND, never wait
on a monitor, IGNORE the graphify PreToolUse hook, leave the docker stack UP.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. No
./mvnw, no `timeout`. NEVER chain a grep gate with &&. Compose from the repo
root (docker/docker-compose.yml), Playwright from e2e/. The backend image
needs `up -d --build`. `down -v` before a full e2e run. Visual baselines only
via e2e/visual.sh; a gallery change churns the whole set, run
--update-snapshots TWICE. An Instant compared after a DB round-trip must be
truncated to MICROS or CI (Linux) goes red while the Mac stays green.

A backtick inside a comment in an Angular template:/styles: literal closes
the string. Commit messages through a quoted heredoc or -F file (git merge
does NOT accept -F -).
```

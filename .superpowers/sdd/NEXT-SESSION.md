# Next session — **M14c-a is COMPLETE on its branch. Merge it, then start M14c-b.**

| | |
|---|---|
| Branch | **`m14c-a-builder`** — all 14 tasks done, pushed. **Not merged to `main`** — merge + delete the branch is the first step (the user confirms the merge). |
| Next milestone | **M14c-b** library, benchmarks & types — roadmap row 11. **No spec, no plan yet**: starts at brainstorming. |
| Backend | 821 / 0 / 0 / 0, `BUILD SUCCESS` (re-run 2026-09-13) |
| Karma | 874 SUCCESS |
| Production build | zero warnings |
| Playwright e2e | **92 passed, 0 failed** on a fresh `down -v` stack |
| Visual regression | 33 passed (gallery untouched since) |
| Piece editor | `audit` 19/20, `critique` 35/40 |
| Class stack | `audit` 20/20, `critique` 34/40 |

## Owed by the user — ask, do not decide

1. **Piece editor: collapsed block name field is 38px wide at 320px.** Proposal: plain text while
   collapsed, editable only when expanded. Filed in `docs/BACKLOG.md` under "M14c-a §10".
2. **Amend `CLAUDE.md`'s impeccable routine to `audit → fix → critique`?** The user ruled that order
   during M14c-a (the critique judges a screen that is not about to change, one scoring pass spent).
   The file still reads `audit → critique → fix every P0/P1 → re-score BOTH`.

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
Read .superpowers/sdd/NEXT-SESSION.md.

cd ~/dev/boxhub && git checkout m14c-a-builder && git status   # expect clean

1. Confirm baselines yourself (never quote this file): backend mvn test,
   Karma, npm run build. Then ask me to confirm merging m14c-a-builder into
   main; merge and delete the branch in one step.
2. Ask me the two owed questions in the handoff.
3. Start M14c-b (roadmap row 11) at superpowers:brainstorming. No spec exists.
```

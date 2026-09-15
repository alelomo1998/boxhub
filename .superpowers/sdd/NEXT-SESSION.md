# Next session — **M14c-b in progress. Resume at the Library critique.**

| | |
|---|---|
| Branch | **`m14c-b-library`**, 39 commits ahead of `main`, tree clean at `214f3cb`. **Local only — never pushed.** |
| Spec | `docs/superpowers/specs/2026-09-13-m14c-b-library-design.md` — D1–D12, then **§8 Revision 1: D13–D23** (wins over §1–§7). |
| Plan | `docs/superpowers/plans/2026-09-13-m14c-b-library.md` — Tasks 1–9, then R1–R7 and addenda R6b–R6e. |
| Backend | 843 / 0 / 0 / 0 (last full run after R3; no backend change since) |
| Karma | 958 SUCCESS |
| Build | zero warnings |
| Visual | 33 passed (baselines re-taken through R6e) |
| e2e | **full suite NOT run on this branch yet** (only `sheet-swipe.spec.ts` and ad-hoc smoke) |
| Library audit | **16/20** — `docs/superpowers/reviews/2026-09-15-m14c-b-library-audit.md`; P1 + four P2s fixed and re-verified in Chrome (`44bb945`) |
| Library critique | **PAUSED mid-walkthrough** (usage limit) — notes in `docs/superpowers/reviews/2026-09-15-m14c-b-library-critique-NOTES.md`. No score yet. |

## Where the work stands

**Done and user-signed-off:** backend R1–R3 (history by day, structured benchmarks + legacy
deletion + seeder, paged/filtered `GET /api/box/library`), `ui/` R4–R5 (segmented `stretch`, week
calendar `min` + opt-in `jump`, `bh-filter-sheet`), the Library page R6 with review fixes R6b–R6e
(movement multi-pick, calendar jump + "Calendar" title, sticky shell header hiding on scroll down
on phones, sheets: hidden X + swipe-to-close below 720px), then the audit and its fixes.

**Remaining, in this order:**
1. **Finish the Library critique** in Claude in Chrome (≥32/40, no open P0/P1). Walk what the notes
   list as not yet walked, score the 10 heuristics, write
   `docs/superpowers/reviews/2026-09-15-m14c-b-library-critique.md`. Candidate P2s already observed:
   no feedback under 3 search characters; every search blanks the list to "Loading the library…";
   History gives no hint which days have pieces; active filters only a count badge. Any P0/P1 → fix
   → re-critique.
2. **Task 6** — Delete in the piece editor (standalone only). New surface → per-screen routine.
3. **Task 7** — benchmarks in the class stack's slot picker + the pending-pick fix ("Edit this
   piece" on an unsaved library pick patches the library row). Picker still uses
   `libraryEntries()`/`mergeLibrary`.
4. **Task 8** — routes/dock/admin nav: delete the Benchmarks page, `/coach/benchmarks`→`wods`,
   `/coach/types`→`classes`, Types moves to `/admin/types`; dock loses Bench and Types (the "Build"→
   "Library" label is already done).
5. **R6d** — enable `[jump]="true"` on every other `bh-week-calendar` (book, classes, schedule,
   announcements) and check each label reads identically. User-ruled 2026-09-14.
6. **R7** — `e2e/tests/library.spec.ts` (supersedes Task 9; keep `sheet-swipe.spec.ts`), then a full
   `down -v` e2e run.
7. **Close:** BACKLOG entries (audit P3s: desktop top-nav links 40px, h1→h3 skip, duplicate
   `nav[Coach]` landmarks, shell header `offsetHeight` per scroll, week-strip day 38px at 320;
   piece-editor's duplicated macro/preset label maps; slot picker onto `GET /library`), roadmap row
   11 → done, rewrite this file, `graphify update .`, merge to `main`, delete the branch.

**Open user question, unanswered twice:** drop "Workout" from benchmark eyebrows
(`BENCHMARK · GIRL · WORKOUT · FOR TIME`)? Ask once in the critique; do not decide it.

## Rules the user enforced THIS milestone (binding)

- **The per-screen gate is sacred:** build → *user visual sign-off* → audit → fix P0/P1 → critique.
  After a review round: **ONE batch of fixes → verify → hand the click path back → STOP.** A change
  the user asks for mid-review queues behind their sign-off. (Memory updated.)
- **Audit and critique run in Claude in Chrome on the live page — never `impeccable detect` on
  source.** The user stopped a source scan mid-run. Chrome can't size below 500px: score in Chrome
  at 500/768/1024/1280+; take raw measurements at 320/360/393 in Playwright only.
- **Signing in:** the user signs in to Chrome themselves; the Claude tab shares the session cookie
  (navigate straight to `/app/coach/wods`). Never type a password into the browser.
- **impeccable's in-page detector cannot load** — app CSP is `script-src 'self'`. Say so in the
  critique report (degraded/inline banner) rather than skipping silently.
- Hand over **click paths**, not screenshots.

## Traps hit this milestone (still bite)

- **A mouse drag is not a touch swipe.** Swipe-to-close passed a Playwright mouse check and failed on
  the user's phone (`touch-action` missing → `pointercancel`). Gestures get a real touch test
  (CDP `Input.dispatchTouchEvent`, see `e2e/tests/sheet-swipe.spec.ts`).
- **Karma asserting a class ≠ the layout working.** `bh-segmented` stretch passed Karma and didn't
  stretch; the visual baseline caught it. Measure widths inside the kind of parent that breaks it.
- **`DevDataSeeder` is invisible to the suite** (`@Profile("dev")`): after any seeder-reachable
  change boot a `down -v` stack and read the backend log (PREFLIGHT Moment 4). `runAsBox`'s subject is
  a random UUID — never stamp it into a `users(id)` FK.
- **`-Dtest=A,B`** (comma) — `+` does nothing on this Surefire.
- **Hibernate `Expression.as()` emits no SQL cast**; use `JpaExpression.cast()` (jsonb LIKE).
- **Never chain a commit after a test run with `;`** — gate on the result (a red commit landed once).
- **A shell command that reads stdin hangs** (`cat >> file` with no heredoc). 120s timeout, then kill.
- **Usage limits** stop executors and the browser mid-task; commit partial notes early.
- Everything from the previous handoff still applies: `env -u NODE_OPTIONS`; no `./mvnw`/`timeout`;
  backend image needs `up -d --build`; `down -v` before full e2e; `e2e/visual.sh --update-snapshots`
  twice after a gallery change; MICROS on round-tripped Instants; no backticks in Angular template
  comments; subagents: short brief pointing at a contract file, foreground only, ignore the graphify
  hook, never commit; stage explicit paths.

## Stack state

The dev stack is up with **55 "Smoke piece N" library rows** seeded for scroll-loading checks — a
`down -v` clears them. Two Chrome tabs are open on `/app/coach/wods` (500px and 1024px windows).

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and resume M14c-b on branch m14c-b-library.

cd ~/dev/boxhub && git checkout m14c-b-library && git status
# expect a CLEAN tree at 214f3cb (or later). The branch is local only.

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 843/0/0/0, TOTAL: 958 SUCCESS, zero warnings.

THEN finish the Library critique (step 1 in the handoff) IN CLAUDE IN CHROME on the live page,
from docs/superpowers/reviews/2026-09-15-m14c-b-library-critique-NOTES.md. I am signed in to
Chrome; navigate your tab to http://localhost/app/coach/wods. Never run impeccable detect on
source. Score >=32/40, no open P0/P1; fix and re-critique if needed. Then STOP and bring me the
report before Task 6.

Per screen: shape -> build -> my visual sign-off -> audit (>=16/20) -> fix P0/P1 -> critique
(>=32/40). After I review: ONE batch of fixes, verify, hand me the click path, STOP.

ALWAYS SUBAGENT (Sonnet) for plan tasks; short brief pointing at the plan; foreground only; ignore
the graphify hook; never commit. The orchestrator reviews every diff and runs every gate itself.
Gesture changes get a real touch test, not a mouse drag.
```

# Next session — M13e is complete

Paste the block below into a fresh session. Everything it references is committed.

---

Continue rxed at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**M13d (auth screens) and M13e (the account area) are both complete.** Do not reopen either.

## Read first

1. `.superpowers/sdd/progress.md` — the M13e section at the bottom is the record. Read the M13d
   section above it too; between them they carry every trap this program has paid for.
2. `docs/BACKLOG.md` — organised by destination. The account-area block now says SHIPPED; the
   genuinely open items are individual lines above it.
3. `CLAUDE.md` — loaded automatically. Its rules were bought expensively; none are stylistic.
4. `docs/PREFLIGHT.md` — a checklist keyed to four decision moments.

## What M13e shipped

`/account` is a routed area behind a **session-only guard** (any signed-in user, no active box
required — previously a membership-less or suspended-box user could not reach their own account at
all). Four sections: password, change-email, sessions, danger. Lateral nav at desktop, list → detail
on phone. Plus a **notification mail after a password change**, and a **readable device label** on
the sessions list.

**Gates:** Karma **405** · backend **439** · e2e **64 passed + 1 skipped** · axe **29 cases, zero
violations** · visual **31 specs / 88 baselines** · production build clean. The 1 e2e skip is the
quarantined TV/SSE defect — Project 2 owns it, do not investigate.

## The lesson worth carrying, and it cost a rebuild

**The four sections were shaped; the AREA's structure never was.** Its layout, chrome and navigation
came from a brainstorm and went straight to a plan. Every one of the three defects the user rejected
on review traced to that gap — including a spec rule ("one markup tree, layout switched by CSS")
that structurally could not express the list → detail the same spec had promised.

**Shape the container, not only the contents.** If a milestone introduces navigation, a shell, or a
way of moving between things, that is a design object in its own right and needs shaping — with
sketches the user can *see*, not a description they have to imagine. The zero-volt decision was
approved in words and rejected on sight.

## The next obvious pieces of work

- **`bh-button` consolidation.** It gained three inputs in one milestone (`ariaDisabled`,
  `dangerBorder`, `solid`), each fine alone. Together the API is incoherent: `dangerBorder` is a
  boolean on a component whose look already lives in a 5-value enum, and 8 of the 10 variant × flag
  combinations emit a class with no matching rule and **fail silently**. Fold it into `variant`.
- **The account area's cross-section pass**, which M13e never ran (Task 14 was skipped). Button
  sizes differ across the four sections, heading→content spacing differs, and `t-h3` resolves to
  `--fs-body` so no heading tier is in use at all.
- **The delete sheet has no axe coverage** — the highest-consequence surface in the area.
- `docs/HANDOFF.md` order was **M13d → M19 landing → M14 coach**.

## Environment traps

- **Bash cwd PERSISTS between tool calls.** Absolute paths. It has produced false-clean gates, a
  Playwright run from the repo root reporting "No tests found", and bogus file-not-found errors.
- **`ng build` does NOT compile spec files**; `tsc` does not type-check Angular templates. Only
  Karma catches a broken spec; only the production build catches a broken template.
- **Never `npm test` bare** — it hangs. Always `-- --watch=false --browsers=ChromeHeadless`.
- **Never a backtick inside an HTML comment in an Angular template** (`TS1005`, pointing several
  lines away).
- **Visual regression runs ONLY via `e2e/visual.sh`** (Linux container). macOS baselines enforced on
  Linux is no check at all. The gallery's sections are **coupled through scroll position** — adding
  to one section dirties every baseline after it.
- **After `up -d --build`, wait ~100s** before running e2e; `DevDataSeeder` is still seeding and a
  short wait produces a failure that looks exactly like a real defect.
- **`runner`/`tracking`/`tv` are non-idempotent** — re-run on `down -v` before blaming a diff.
- Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Never alongside Karma.

## The two patterns that keep paying

**Roughly half of executor briefs contain a factual error — every one the orchestrator's, every one
caught because executors are told to stop rather than improvise.** The recurring shape: listing the
files a change IS, not the files that DEPEND on it. M13e's own plan had Task 3 registering routes
for components that did not exist yet; the pre-flight scan caught it before dispatch.

**Eight tests that could not fail have now been found.** Two were in M13e, both deferred by the
orchestrator as minors and both promoted by the final whole-branch review after it *proved* them by
mutation — including one guarding the branch's central claim, where swapping the guard back left the
whole suite green. When you defer a weak assertion, you are betting nothing important rests on it.

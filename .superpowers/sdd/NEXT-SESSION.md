# Next session — M13e is merged

Paste the block below into a fresh session. Everything it references is committed and on `main`.

---

Continue rxed at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**M13d (auth screens) and M13e (the account area) are both merged to `main`.** Do not reopen either.
There is no milestone in flight — the first thing to do is decide what the next one is.

## Read first, in this order

1. `docs/HANDOFF.md` — the state of the product and the milestone order.
2. `.superpowers/sdd/progress.md` — the M13d and M13e sections at the bottom. Between them they
   carry every trap this program has paid for, in the words of the sessions that paid.
3. `docs/BACKLOG.md` — organised by destination. The open follow-ups from M13e are individual lines.
4. `CLAUDE.md` (loaded automatically) and `docs/PREFLIGHT.md` — the checklist keyed to four
   decision moments.

## Where things stand

**Gates on `main`:** Karma **408** · backend **439** · e2e **64 passed + 1 skipped** · axe **29
cases, zero WCAG 2.2 AA violations** · visual **31 specs / 88 baselines** · production build clean.
The 1 e2e skip is the quarantined TV/SSE defect — Project 2 owns it, do not investigate.

**CI and `dependency-scan` are both green on `main`.** The scan had been red since 2026-08-17 from
a newly-published advisory (GHSA-qv9r-c865-cp47) against `log4j-api` 2.24.3, a transitive neither
milestone touched. It was **not reachable** — this app logs through Logback, `log4j-api` arrives
only under `log4j-to-slf4j`, and `log4j-core` is not on the classpath — but it was pinned to 2.25.5
rather than ignored, because a same-line patch on an API jar is cheap and a green gate people trust
beats an ignore entry people stop reading. `backend/pom.xml` carries the reasoning and the standing
rule: **drop the override once Boot's managed version catches up**.

## Candidate next milestones

- **M19 landing**, then **M14 coach** — the order `docs/HANDOFF.md` records. The coach tour spec
  (`docs/superpowers/specs/2026-08-09-m14-coach-tour.md`) is done and no longer blocking M14.
- **A small consolidation pass** on what M13e left: `bh-button` gained three inputs in one milestone
  (`ariaDisabled`, `dangerBorder`, `solid`) and the API is no longer coherent — `dangerBorder` is a
  boolean on a component whose look already lives in a 5-value enum, and **8 of its 10 variant×flag
  combinations emit a class with no matching rule and fail silently**. Folding it into `variant`
  costs one call site, one gallery cell and one spec. The account area's cross-section consistency
  pass was also skipped, and the delete sheet has no axe coverage.

Ask the user which, rather than assuming.

## The two lessons M13e cost, and they are the same lesson

**1. Shape the container, not only the contents.** The four sections were shaped by an agent; the
area's layout, chrome and navigation went from a brainstorm straight to a plan. Every one of the
three things the user rejected on sight came from that gap — including a spec rule ("one markup
tree, layout switched by CSS") that structurally could not express the list→detail the same spec
had promised. If a milestone introduces navigation, a shell, or a way of moving between things,
that is a design object in its own right.

**And show it.** The zero-volt decision was approved in words and rejected on sight, because
"zero volt" was described and never drawn. Bring sketches at 375 and 1440.

**2. A code review does not discharge the design gate.** M13e passed fourteen code reviews and a
clean whole-branch review, and the orchestrator declared it ready to merge without ever running
`/impeccable critique`. The user asked "have you thrown impeccable critique?" and the answer was no.
It then found **three P1s**, all invisible from source and none caught by 408 unit specs, 64 e2e
cases or 29 axe cases:

- a **cold load** of `/app/account` never redirected on desktop — because the redirect ran from a
  component lifecycle and started a second navigation that raced the initial one and lost.
  **In-app navigation always worked**, which is exactly why every test passed over it.
- Angular **collapsed the whitespace** between a message and its link on two screens. The source
  read correctly; only rendered `textContent` showed it.
- **focus fell to `<body>`** after an error in the delete sheet.

§16 is shape → build → **critique ≥28/40, no open P0/P1**. Run all three.

## Environment traps, all hit for real

- **Bash cwd PERSISTS between tool calls.** Absolute paths. It has produced false-clean gates, a
  Playwright run from the repo root reporting "No tests found", and bogus file-not-found errors.
- **`ng build` does NOT compile spec files**; `tsc` does not type-check Angular templates. Only
  Karma catches a broken spec; only the production build catches a broken template.
- **Never `npm test` bare** — it hangs in watch mode. Always
  `-- --watch=false --browsers=ChromeHeadless`.
- **Never a backtick inside an HTML comment in an Angular template** (`TS1005`, pointing several
  lines from the cause).
- **Visual regression runs ONLY via `e2e/visual.sh`** (Linux container). macOS baselines enforced on
  Linux is no check at all. The gallery's sections are **coupled through scroll position** — adding
  to one dirties every baseline after it (54 files in one M13e commit).
- **After `up -d --build`, wait ~100s** before running e2e; `DevDataSeeder` is still seeding and a
  short wait produces a failure that looks exactly like a real defect.
- **`runner`/`tracking`/`tv` are non-idempotent** — re-run on `down -v` before blaming a diff.
- Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Never alongside Karma.
- The app is on **port 80**, not 8080.

## The two patterns that keep paying

**Roughly half of executor briefs contain a factual error — every one the orchestrator's, every one
caught because executors are told to stop rather than improvise.** The shape recurs: listing the
files a change IS, not the files that DEPEND on it. M13e's own plan had a task registering routes
for components that did not exist yet; the pre-flight scan caught it before dispatch. **Grep for
dependents before writing the brief.**

**Eight tests that could not fail have now been found.** Two were in M13e, both deferred by the
orchestrator as minors and both promoted by the final review after it *proved* them by mutation —
including one guarding the branch's central claim, where swapping the guard back left the whole
suite green. **When you defer a weak assertion you are betting nothing important rests on it.**

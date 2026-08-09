Continue rxed (formerly BoxHub) at ~/dev/boxhub. Angular 22 + Spring Boot 3.5 / Java 21 +
Postgres 16, Docker Compose behind nginx, GitHub alelomo1998/boxhub private.

The product was renamed BoxHub → rxed (rxed.app) in M13b. Internal namespaces deliberately did
NOT change: `com.boxhub.*`, `BOXHUB_*` env vars, the `bh-*` CSS prefix, database and image names.

Read first, in order:
1. `docs/HANDOFF.md` — master brief. "Immediate next step" is current. **CI is GREEN again** as of
   2026-08-09, first time since before M13a; the old "CI has stopped scheduling" note is corrected
   in place. Note that `main` was RED at `70a7565` before M13c merged onto it, so a future red run
   should be compared against that signature before being blamed on new work.
2. `docs/BACKLOG.md` — **read the top section first**, it is not the usual backlog. It documents a
   real unfixed defect (the TV never learns a coach started a timer) with a reproduction recipe and
   a hypothesis that was checked and DISPROVED. Below that it is organised by destination milestone.
3. `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md` — **design law v3, binding.**
4. `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` — **what the component
   library is and why.** §3.7 and §3.8 matter most: what "migrate the call sites" does and does not
   mean, and why the form-control migration was deferred to you.
5. `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md` — the CURRENT roadmap. It
   renumbers everything; do not trust milestone numbers in older docs. **One deliberate departure
   from its order is recorded in HANDOFF** — see below.
6. `CLAUDE.md` (caveman + ponytail comms, ALWAYS subagent, tokens-only, tenancy, i18n, and the new
   binding `ui/` conventions) and `docs/TENANCY.md`.
7. `.superpowers/sdd/progress.md` — task→SHA ledger. Read the M13c section: it records **thirteen**
   factual errors in the orchestrator's own briefs, every one caught because executors were told to
   stop rather than improvise, plus every environment trap this project has hit.

State: M0–M13c merged. `main` at `0c5117e`, CI green on both workflows. Backend **428** / frontend
**245** / e2e **35 passed + 1 skipped** at `retries: 0` / axe **7/7** zero WCAG 2.2 AA violations /
visual regression **54 baselines**. Next Flyway is **V19** — M13c added no migration. The app lives
at `/app`; the API at `/api`; the OAuth chain at `/oauth2` + `/login/oauth2`, both at the server
root, deliberately. `GET /` still 301s to `/app/` — that slot is reserved for the landing site.

**Task: M13d — auth & account screens.** Eleven screens as the component library's first real
consumer: login, signup, start-a-box, box picker, check-email, verify, forgot, reset, join,
`account/security`, `account/email`. Start with the superpowers flow: brainstorming → spec + my
approval → writing-plans → subagent-driven execution.

**Three things M13d inherits, all filed rather than left to be rediscovered:**
* **Whether `bh-field` becomes a `ControlValueAccessor` is YOUR decision.** M13c deliberately did not
  build that contract: 13 of the 16 screens still on the legacy `.bh-input` wrap their inputs in a
  template-driven `<form>` with `[(ngModel)]`, and all 16 are rebuilt by a later milestone — **seven
  by you**. Building it against forms about to be deleted was the double work this program exists to
  avoid. The legacy `.bh-input` / `.bh-select` classes survive, annotated with each consumer's owning
  milestone, and their gate is a **cap (≤54, currently 53)**, not a zero.
* **`bh-button` cannot render as an anchor.** `routerLink` on its host silently produces **no
  `href`**, so a link styled as a button loses ctrl/cmd-click, open-in-new-tab and the correct role.
  `wod-library.page.ts:15` works around it by nesting `<bh-button>` inside `<a>` — a `<button>`
  inside an `<a>`, an invalid content model. Your eleven screens are full of links styled as buttons.
* **A second, different error message on `bh-field`/`bh-select` may not be announced.** `@if (error())`
  only recreates the node across the falsy↔truthy boundary, so "Required" → "Invalid format" mutates
  the same node, and `role="alert"` announces reliably only on fresh insertion. Re-validation
  producing a second message is the normal case on a form screen, not an edge case.

**Also inherited, and it is a real one:** `a { color: var(--volt) }` in `styles.scss:14` is GLOBAL,
so every link in the product is volt. Measured on the real login screen: **four** volt elements where
design law §2.3 says exactly one. Filed to M13d because you rebuild the screens that prove the fix;
changing a global anchor colour repaints ~40 screens and the visual baselines cover only the gallery.

**Ordering, decided 2026-08-09 and departing from the roadmap in one place:** the landing site (M19)
was considered next — M13a's `/app` move exists precisely to free `/` for it. It is deferred to
**after M13d** because it is *brand* register and needs a largely disjoint component set M13c
correctly did not build, because its central claim depends on The Room (Project 2, unbuilt) so the
hero copy would be written twice, and because its CTAs land on the very auth screens M13d rebuilds.
Order is **M13d → M19 landing → M14 coach**.

**The coach tour is DONE and no longer blocks M14** —
`docs/superpowers/specs/2026-08-09-m14-coach-tour.md`. Ten decisions taken, six questions left
deliberately open to be asked at the screen. Read it when you spec M14, not before M13d. Its
headline: `PieceTypes.ALL` conflates timing schemes with section kinds, blocks are one level deep,
interval structure does not exist, and the timer can only run uniform rounds — so AMRAP/EMOM/Tabata
become **presets over one segment sequence**, and the runner arms itself from what was programmed.

Environment:
* `cp docker/.env.example docker/.env` before any stack command, or compose refuses to start.
* `npm test` ALONE HANGS (watch mode). Use `npm test -- --watch=false --browsers=ChromeHeadless`.
  ~13 seconds, 245 specs.
* **`ng` is NOT on PATH.** Use `npx ng build --configuration production` — the only gate that
  type-checks Angular templates. It now emits **zero** budget warnings; if one appears, it is yours.
* Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`, ~102s, 428/0/0. Never run it
  concurrently with Karma. **A wall of `Could not initialize class AbstractIntegrationTest` means the
  DOCKER DAEMON IS DOWN, not your diff** — `open -a Docker`, wait, re-run.
* **A Docker `DeadlineExceeded` is a REGISTRY timeout for an image that was never pulled locally,
  not a build failure.** `docker pull nginx:1.31-alpine` once and it stops. I lost real time
  misdiagnosing this as a broken compose builder.
* **Rebuild the frontend image after EVERY frontend commit before measuring anything in a browser** —
  the container serves a built bundle. An e2e run in M13c reported 28 passed against a stale image
  because a failed build was mistaken for a successful one.
* **Never trust the exit code of a wrapper around a gate.** `cmd; echo "exit=$?"` makes the shell
  succeed while the command failed. Redirect to a log, then grep the log. Same reason `$?` after a
  pipe is the pipe's in zsh.
* **Never pipe a gate through `grep`/`tail`.** macOS has no `timeout`. `sed -i ''` is the macOS form.
* `down -v` before an e2e run after any seeder change. `runner`/`tv` specs are not idempotent.
* Visual regression runs ONLY in the Linux container: `e2e/visual.sh` (`--update-snapshots` to
  regenerate). Never `npx playwright test visual.spec.ts` locally — `snapshotPathTemplate` drops
  `{platform}` on purpose and the spec is excluded from the default run.
* After a fresh clone: `npx playwright install chromium`.
* `graphify query "<question>"` before grepping code — a hook enforces it, for subagents too.
* **Do not commit while a subagent has files staged**, and **`git status` + `git diff` a dead
  subagent's tree before doing anything else** — one died mid-negative-control in M13c and left a
  design-law violation uncommitted.

Process (binding): you are the orchestrator — dispatch a subagent per plan task, review every diff,
run the gates yourself, commit and merge. Implement only genuinely difficult/delicate work or
trivial glue. Executors get self-contained briefs and are told to stop and escalate rather than
improvise; in M13c that caught thirteen factual errors in my own briefs, including one where my CSS
was simply wrong. **Write gates as commands that must come back empty**, not as lists of files.

**Two rules stated by me and now binding on every remaining milestone:**
* **BUILD SCREEN BY SCREEN, ONE TAB AT A TIME.** M14–M18 are product surface; a milestone built on
  one wrong assumption is a milestone rebuilt. I do not care how many hours it takes. Do not batch
  several screens into one brief because they look similar, and expect the shaping per screen to
  take longer than the build.
* **ASK, NEVER GUESS A UI DECISION.** Not "I'll assume a button here and flag it" — stop and ask.
  This does not apply to mechanics with an objectively correct answer (which token, which ARIA role);
  those are yours to get right.

Conventional commits ending: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

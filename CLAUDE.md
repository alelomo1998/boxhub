# BoxHub — project instructions

CrossFit box platform, **rxed** (`rxed.app`). Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16. Multi-tenant.

## Authoritative docs (read before working)
- **Master spec / roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` — milestones M0–M7, the operating rules.
- **Design law:** `docs/superpowers/specs/2026-07-08-design-system-design.md` — binding for ALL frontend work.
- **Milestone plans:** `docs/superpowers/plans/` — the active plan governs current work.
- **Backlog:** `docs/BACKLOG.md` — deferred items; out-of-scope ideas go here, one line.
- **VPS/deployment context:** `docs/VPS-DEPLOYMENT.md` — agreed OVH target, storage/backup limits and pre-production blockers.
- **Notification registry:** `docs/NOTIFICATIONS.md` — every notification the product should fire, with its trigger, audience, channel and owning milestone. Read before designing the in-app feed (M29b), a push payload (M27c) or an automation rule (M32b), and **before writing any code that fires a notification** — §5's rules are binding on new events.
- **Positioning:** `docs/POSITIONING.md` — who rxed is for and who it competes with. **CrossFit-only, on purpose; the competitor is Wodify, not PushPress.** Read before arguing milestone order and before writing anything a gym owner reads. §4's five switch triggers are the ranking product decisions should be argued against.
- **v1.0 programme:** `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` — **the pilot IS v1.0**: complete, not a slice. Features may be *built but idle* (Stripe ships and works; no money flows because the pilot is free), never absent. One tier, everything, €99/month. Supersedes the ORDER in the v3 roadmap doc.
- **Roadmap at a glance:** `docs/ROADMAP-AT-A-GLANCE.md` — all 18 milestones in **execution order**, one line each. Milestone numbers are allocation labels, NOT a sequence (M14a is followed by M21; M13f opens Phase 2). Never infer order from a number.
- **Next-session prompt:** `.superpowers/sdd/NEXT-SESSION.md` — the ONLY one. It is rewritten at each milestone close. Do not create a second under `docs/`; a stale `docs/NEXT-SESSION-PROMPT.md` survived from M13d to M14a and was deleted 2026-08-19.

## Workflow rules
- **Milestone lock:** work only the active milestone. Out-of-scope ideas → `docs/BACKLOG.md`, don't build them.
- **Schema changes only via Flyway.** Never edit an applied migration.
- **Every box-scoped endpoint** gets happy + auth-denied + cross-tenant-denied tests.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`, never from request params. `@TenantId` entities (Plan, Invite): any query that must be tenant-agnostic needs NATIVE SQL — JPQL/derived queries (incl. bulk updates) are silently filtered to the caller's box. **Since M21 a tenant-less read fails CLOSED** — no ambient tenant means the filter stays on with a sentinel no row carries, so the read returns **empty**, where before M21 it saw every box. Cross-box visibility is now one explicit, greppable opt-in, `TenantContext.runAsRoot(...)`, for platform jobs only — never on a thread serving a user request (`grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'` must be empty). `/api/box/**` also carries an `X-Box-Id` assertion header that can only **reject** a stale request (`409 STALE_BOX`), never resolve a tenant — "never trust box ids from request params" is intact. Full rule, both failure modes, `runAsBox`/`runAsRoot`, the boxless-session contract, the switch model and the native-method table: `docs/TENANCY.md`.
- **The authz conformance sweep is a standing guarantee (M11, binding).** `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` sweeps Spring's live route table and defaults to DENY: a new route fails the build until someone declares its intent in `MIN_ROLE`, or allowlists it by METHOD+pattern with a written justification. **That failure is the design, not a broken test.** The only permitted edit is registering a route (plus seeding a real id in `pathIds` if it takes a path variable). Never weaken an assertion, allowlist around one, or restructure it — and the orchestrator, not an executor, audits every edit to it.
- **No secret gets a working default.** A missing secret must fail startup, never fall back; `SecretDefaultsTest` enforces this over `application.yml` and `@Value` annotations both. A blank-but-set env var counts as missing — validate for it at the consumer.
- **Mail fires strictly AFTER commit; an audit row is written strictly INSIDE the transaction.** Both exist so the record matches reality: a mail sent in a tx that rolls back is a lie, and an audit row surviving a rolled-back transition is also a lie.
- Conventional commits. `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for backend builds (system JDK is 26, too new).

## Design rules (binding — see `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md` for detail)
- **Tokens only.** No component or screen hardcodes a color / font / radius / spacing. Everything reads a CSS custom property. A raw hex outside `frontend/src/styles/_tokens.scss` is a bug (the one sanctioned exception is the HTML mail templates, which cannot read custom properties).
- **Dark only** (`--ground: #0d110e`, chalkboard black, never warm, never pure black). No light theme, no `data-theme`, no `prefers-color-scheme`, no `ThemeService` — all deleted in M13b. Re-open trigger, recorded rather than implied: a pilot box asks for it, or an accessibility need surfaces.
- **Volt (`--volt`) is the only accent, and means live / now / primary / winning — nothing else.** Never decorative, never a status fill, never a label. The rule is about *questions*: a plumbing screen gets exactly one volt element; a hero screen may mark one thing per distinct question it answers. Volt is also bounded by area — a row, chip, button, bar or badge, **never a card, panel, page background or sheet**.
- **The box switcher's mark is the shell's one volt element (ruled 2026-08-27).** Since M23 it sits
  in the header of all three shells, on every screen, meaning *the gym you are in now*. A screen
  rendered inside those shells therefore **starts with its volt budget already spent** and must not
  add its own unless it is on the hero list (WOD board, leaderboard, PR page, live class runner,
  TV). `athlete/home.page.ts`'s "Book your next session" was demoted to `--bone` for exactly this —
  it stays primary by size, weight and case. The **dock's active-tab icon is exempt**: it is
  persistent wayfinding chrome, like a focus ring, not a screen's expressive choice.
- **THE BUILDER IS ON THE HERO LIST (user-ruled 2026-09-08).** The piece editor and the class stack
  were built as plumbing under the rule above and came back as four grey pill groups — *"zero
  identity, we lost all the colors"*. The reason the rule failed here: the builder is where a coach
  spends real time writing the workout, and what they are writing IS the WOD board. **A piece being
  authored gets the same expressive treatment as a piece being read.** So volt is available on both
  builder screens, bounded as always by area (a row, chip, bar, badge — never a card, panel, page
  background or sheet) and still answering only *one question per volt element*. Control chrome
  (inputs, remove buttons, add affordances) stays `--bone`/`--surface`; the **prescription** — the
  block the coach is writing, the selected macro/timing, the live segment — is what may carry it.
  This does NOT reopen volt on genuinely plumbing screens (account, settings, admin forms).
- **THE LIBRARY'S "NEW PIECE" IS VOLT (user-ruled 2026-09-14, M14c-b D14).** The first build put a
  `strong` "New WOD" first on the page and it was sent back as *"orrible and misleading"*: it creates
  a piece, and it is the one thing a coach does on that screen. It is a volt `+` at the end of the
  search row. Same boundary as the builder ruling: one element, a button, never a card or panel.
- **A screen's ONE primary action is `bh-button variant="strong"` when it has no volt to spend.**
  Volt means live / now / winning, so a plumbing screen's save never gets it — but `solid` is the
  wrong answer for a lone primary action: it is `--surface-2` on a `--surface` card, one token step
  apart with a hairline between, and measured **1.1:1** against its own container on the
  announcements composer, where it read as an empty box until you found the label (critique P2,
  twice). `strong` is a `--bone` fill with `--on-bone` ink — **15.9:1 against the card, and still
  not volt**. Rules: **at most one per screen** (a second is two primary actions, the same mistake
  in a different colour); it pairs with `size="lg"` and `class="full"` on mobile; and its focus ring
  inverts to `--focus-inv` inside the button, because `--focus` IS volt and volt on a near-white
  fill is invisible — the same trap `primary` already documents. `solid` remains correct for screens
  with several **co-equal** actions, e.g. account's section saves.
- **EVERY SCREEN CARRIES A TITLE (user-ruled 2026-09-18, binding).** A screen opens with a visible
  `<h1>` naming it — the same words as its dock/nav label and its `route.title` — before any
  control, strip or list. An app screen without one reads as a fragment: the athlete lands mid-page
  with only a date strip for context, and a screen reader's first landmark is a widget. Sheets and
  dialogs already have their own `title`; this rule is about the page. **A screen being rebuilt adds
  its own title; nobody converts another screen's** — same rule as the signal/Eager conversions, and
  the untitled pre-rework screens are filed in `docs/BACKLOG.md`.
- **A SCREEN THAT IS NOT A DOCK TAB IS A DETAIL SCREEN: NO DOCK, A BACK ARROW (user-ruled
  2026-09-18, binding).** The dock is for the five (or fewer) top-level destinations. Anything
  reached *from* one of them — class detail, a leaderboard, another athlete's profile, notification
  settings — hides the dock and puts a back control at the top left of the shell header, returning
  to the screen it was opened from (its parent tab, not `history.back()` when that would leave the
  app). It reclaims the dock's bottom gutter for its own primary action. **The screen still carries
  its `<h1>`** — back arrow and title are not alternatives. Athlete detail screens today:
  `class/:id`, `board/:itemId`, `profile/:membershipId`, `notifications`,
  `notifications/settings`, `messages/*` thread views. The mechanism (route `data` flag read by the
  shell, vs. a per-screen input) is decided by the first milestone that implements it — M17a, on
  class detail — and every later screen follows that one. Screens not yet converted are filed in
  `docs/BACKLOG.md`.
- **THE DETAIL HEADER IS SETTLED (user-ruled 2026-09-18, M17a class detail, binding for EVERY
  non-dock screen).** Decided against rendered options (`docs/superpowers/sketches/m17a-class-detail-r3.html`).
  The header is: **back arrow · the screen's `<h1>` title · the shell's usual right-side actions
  (mail, notifications, avatar)**. Only the **box switcher** is dropped — on a detail screen the gym
  name is the redundant part, not the actions. The screen's body therefore must **not repeat the
  title**; class detail's hero carries the photo, the badge and the date/time, and no name.
  - **A detail screen has NO volt at all.** The switcher's mark was the shell's one volt element and
    the back arrow is what replaced it. This is a deliberate amendment to "the switcher's mark is the
    shell's one volt element, on every screen" — that rule now reads *on every screen that has a
    switcher*. Do not re-litigate it per screen.
  - **The header keeps its existing hide-on-scroll behaviour** (`bh-shell-header`: sticky, below
    768px it slides away on scroll-down and returns on scroll-up past an 8px threshold, whenever
    `scrollY` is back within the header height, and on `focusin`). Weighed and kept deliberately even
    though the back arrow is a detail screen's only way back: it returns on any upward scroll and on
    focus, the primary action is pinned at the bottom regardless, and pinning the header would cost
    56px of viewport permanently on the smallest screens.
  - **Opening a detail screen is a shared-element transition** (user-asked, ruled 2026-09-18): the
    tapped card's photo grows into the hero and collapses back **to the row it opened from**, and the
    class name is *one element that travels* between the row and the header title slot. 280ms on
    `--ease-move`, symmetric both ways. Two traps, both already paid for in the sketch: the source
    row must stay `visibility: hidden` until the morph **lands** (revealing it on a timer double-images
    and pops), and completion must NOT depend on `transitionend` alone — under
    `prefers-reduced-motion` the transition is removed, the event never fires, and the screen
    deadlocks half-open. Use the event as the fast path with a duration timeout as the guarantee.
- **`--danger` may fill a button or a chip** (never a row/card/panel) — the control that *opens* a destructive flow is a danger-bordered ghost, the control that *executes* it is filled. `--on-danger` is dark, not white (white on `--danger` fails AA).
- **No glow, no gradients, no shadows on flat surfaces, no fake textures, no skeuomorphism.** Shadows are permitted only on things that physically float (the dock, `bh-sheet`, dialogs). The focus ring is a solid 2px outline, and **inverts to `--focus-inv` on a volt surface** — a volt ring on the volt primary button is invisible.
- **Identity lives in hero screens** (WOD board, leaderboard, PR page, live class runner, TV) — plumbing (buttons, tables, forms) stays conventional-and-excellent.
- **Mono (JetBrains Mono) is the prescription voice** — anything measured, prescribed or counted (scores, loads, clocks, eyebrows, table meta, codes) — and is **banned from prose**. Archivo carries anything written or named.
- **Numbers are tabular.** Screens are built from shared `bh-*` components; re-implementing a component's markup in a screen is a bug.
- **`frontend/src/app/ui/` is clean and stays clean (M13c, binding).** Inside it: **signal inputs only** (`input()`, `model()`, `output()`) — no `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager` — and no raw px type sizes and no raw hex. Feature screens still carry decorators and the Eager pin; **each surface milestone converts its own, and none converts another's.** The gates are greps that must return zero, listed in `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` §8.1.
- **An attribute written on a component's host does not reach the element inside it.** This cost four separate fixes in M13c — `bh-button`'s `aria-label`, and `data-testid` on `bh-field`, `bh-select` and `bh-data-table` — and it is what blocked the form-control migration entirely, because Playwright's `.fill()` requires the located node to *be* an `<input>`. A component that needs a hook on its inner element takes an explicit input and binds it there.
- **Every component owes seven states, and the dev gallery at `/app/dev/components` IS that contract** — each section renders every state, notes the ones only checkable by hand, and **explicitly declares the ones the component cannot have**. An omitted state is indistinguishable from a forgotten one. axe-core and 54 visual-regression baselines gate the page; run `e2e/visual.sh` (Linux container) rather than Playwright locally, or you compare against baselines your renderer never wrote.
- Type: display/body/UI = Archivo (400/500/700/800), prescription/numeric = JetBrains Mono (400/700). Self-hosted via `@fontsource` (CSP blocks font CDNs).
- **Form contract (M13d, binding): `(ngSubmit)` DIES WITH `FormsModule`.** It is an output of the
  `NgForm` directive. Rebuilt screens drop `FormsModule`, so a form must bind the **native** event:
  `<form (submit)="submit($event)" novalidate>` with `event.preventDefault()`. Keep `novalidate` —
  `NgForm` used to supply it and validation lives in the component. This shipped broken on login:
  the button never authenticated and **the password went into the URL**, browser history and server
  logs, past 272 green Karma specs. `bh-field`/`bh-select` are **not** `ControlValueAccessor`s;
  bind `[(value)]` against signals. Full reasoning: `2026-08-10-m13d-auth-account-screens-design.md` §4.2.
- **A disabled button guards ONE path, never the action.** Enter in a form submits regardless of any
  button's `[disabled]`, and a native `disabled` attribute also drops the pressed control out of the
  a11y tree, sending focus to `<body>`. Put the guard in the handler, and move focus onto whatever
  replaced the control. Four M13d screens needed this; three needed it twice.
- **A gate you have to explain away stops being a gate.** The greps match comments too, so never
  name `ngSubmit`/`FormsModule` (or any token a gate hunts) in a comment on a clean file — the next
  person reads the red as noise. Same rule for a spec: `ng build` does NOT compile spec files, so a
  green production build is not evidence your specs compile. Karma is what catches that.
- **axe does not protect a label on a field that has a placeholder** — its `label` rule accepts a
  non-empty placeholder as a fallback. Most `bh-field` consumers carry one. Verified by trying to
  make the gate fail and watching it pass.
- **A screen is not verified until e2e runs on it.** Karma cannot see a dead submit binding: specs
  that call `submit()` directly test the handler, never the wiring. `e2e/tests/login.spec.ts` catches
  it in seconds. Rebuild the frontend image first, and re-run on a `down -v` stack before blaming a
  diff — `runner`/`tracking`/`tv` are non-idempotent and fail on a dirty stack for unrelated reasons.
- **i18n (M13a, binding): every new or rebuilt screen ships i18n-marked.** The infrastructure
  (`@angular/localize`, runtime locale loading, locale-aware date/number/currency, the brand
  constant) landed in M13a. The ~390 strings on pre-rework screens were deliberately **not** marked
  then, because M13c–M18 rewrite those screens and marking twice is the double-work this program
  exists to avoid. So the obligation moved onto the rewrite: **a screen is not done unless its
  strings are marked and its dates/money go through locale-aware formatting.** No new hardcoded
  user-facing string, ever. No new hand-written `€`.
- **MOBILE FIRST IS BINDING (user-ruled 2026-08-31).** rxed ships to the App Store through
  Capacitor, and an interface that is merely "responsive" gets rejected as not native-quality. Every
  screen is designed at **360px first** and allowed to grow, never a desktop layout that survives a
  media query. Concretely:
  - **A native `<select>` with more than a handful of trivial options is banned.** On iOS it collapses
    to a wheel picker showing one truncated line, so a class's name, time, coach and audience size all
    become `Fri 5 Sep · 06:0…`. Anything richer than a plain short label picks from a **`bh-sheet`**
    with real rows. This is what got the first Task 10 build rejected.
  - **Choosing from a list of domain objects means tappable rows or cards**, not `<option>`s — full
    width, `--tap` minimum, showing the fields needed to choose confidently.
  - **A primary action is full-width and tall on mobile**, not a small right-aligned button.
  - Bottom-of-viewport space belongs to the dock; a second sticky bar below the fold stacks against it.
  - `docs/design-ref/` holds the user's own references and **is the arbiter of what "app-like" means
    here** — `screens/booking-screen-example.webp` is the class-card reference (full-bleed image with
    the text on a scrim over it, not a thumbnail beside text). Look before designing a new surface.
- **Design law v2 (M5, binding):** type scale/`--tap`/`--scrim` tokens only; every fetch has loading/error/empty and every save pending+inline-error with input preserved; WCAG AA (4.5:1, focus rings, labels, reduced-motion); bottom-tab app shells for athlete/coach + SaaS shell for admin; overlays via `bh-sheet`, avatars via `bh-avatar`; **every FE feature ships through the impeccable routine below**.

## The impeccable routine (binding, raised 2026-08-27)

**Per screen, not per milestone. Not a menu — the gate is all four steps.**

```
shape → build → audit (≥16/20) → fix every P0/P1 → critique (≥32/40)
```

- **`audit` runs BEFORE `critique`.** It is deterministic and cheap, and its findings should inform
  the design review rather than the reverse. M23 needed three critique passes to catch two WCAG AA
  contrast failures (4.27:1, then 2.18:1) — both sit in `audit`'s accessibility dimension.
- **Fix BETWEEN audit and critique, not after both (user-ruled 2026-09-13, M14c-a).** The critique
  then judges a screen that is not about to change under it, and only one scoring pass is spent.
  If the critique itself raises a P0/P1, fix it and re-run the critique — its score is not the
  screen's score while one is open.
- **Both run with Claude in Chrome connected.** A source-only pass is provisional: `critique` scores
  Nielsen heuristics, so ~36 of its 40 points can be earned without anyone seeing a rendered pixel.
  **If the browser is unavailable, stop and ask — do not score anyway.**
- **≥32/40, not 28.** 28 is 7/10; the bar is 8. A score measured with a P0 or P1 still open is not
  the screen's score.

### Shape is RENDERED, never described (binding, user-ruled 2026-09-17, M17a)

A new screen's or component's options are shown to the user as **real renders in the browser**, not
ASCII or prose. M17a's class card went four options → three revisions → a pick, and every revision
the user asked for came from looking at pixels ("big shadow", "too bold", "redundant badge") — none
of it was visible in a description. The method:

1. **One static HTML sketch per round** at `docs/superpowers/sketches/<milestone>-<surface>[-rN].html`.
   Tokens copied verbatim from `_tokens.scss` into `:root`; **360px phone frames** with the real shell
   context (header with the switcher's volt mark, week strip or equivalent, dock); **the same data in
   every option**; each option captioned with its trade-off (height, cards per screen, risk).
2. **Realistic content, including the ugly cases:** stand-in photos and avatars, long names, empty,
   past/finished, no-image. Where legibility over an image matters, add a **stress case (pure white
   upload) with contrast measured by script on the page** — a claim of "readable" is not a render.
3. **Show it:** serve the folder (`python3 -m http.server 8765` in `docs/superpowers/sketches`), open
   it in the user's Chrome tab, and send a full-width **Playwright PNG** (Chrome's window can't fit
   several 360px frames). Check the render yourself before sending.
4. **Iterate as new files**, never overwrite a rejected round — the rejected rounds are the record of
   why the pick is what it is. A requested change that breaks the design law (e.g. volt as decoration)
   is rendered **beside** a law-safe variant, and the user rules.
5. **On decision:** vendor every external image into `docs/superpowers/sketches/<milestone>-assets/`,
   save the PNGs the user judged, write `<milestone>-README.md` (round → file → render → what was
   decided), write the decision into the spec with a pointer to the chosen file **and column**, and
   commit. Build briefs point executors at that render as the reference to match.
6. The design hook's findings on sketch files are suppressed per file (`hooks ignore-value <rule> "*"
   --file <sketch>`): they are a decision record, not shipped UI.

A **repeat** of an already-decided shape is still the orchestrator's call — no new sketch.

**Conditional passes — when the trigger applies, not by default:**

| Command | Trigger |
|---|---|
| `harden` | The screen renders real data. A long gym name already pushed a page into horizontal scroll at 200% zoom on the old box picker. |
| `clarify` | The screen is mostly copy. M23's join screen was ~90% prose and had real copy defects. |
| `interaction-design` | A new component. Its eight states map onto the seven-states + dev-gallery contract. |
| `layout` | Only after audit or critique flags spacing or hierarchy — it is a fix command, not a review. |

**Never routine:** `bolder`, `delight`, `overdrive`, `distill` — identity/hero screens only, never
plumbing. **`live` does not work here**: it needs a dev server with HMR and the app is served
through Docker/nginx.

**impeccable and superpowers are separate plugins with no cross-references** — only this file joins
them, and `superpowers:brainstorming` overlaps `impeccable shape`.

## Pre-flight (binding) — `docs/PREFLIGHT.md`

**Read it at four moments: before writing an executor brief, before running a shell gate, before
accepting a test, and before claiming anything is done.** It is a checklist keyed to those moments,
not a log — every entry on it recurred *after* being recorded somewhere else, which is the whole
point. The single most repeated failure is writing a brief that lists the files a change **is**
rather than the files that **depend on it**; grep for dependents first.

## Communication (binding)
- **Caveman mode, level `full` (not ultra):** terse prose, drop articles/filler/pleasantries, fragments OK. All technical substance stays. Code, commits, PRs, security warnings written normally. Goal: cut token burn, not clarity.

## Process pace — orchestrator/executor (binding from M6)
Keep the superpowers arc (brainstorm → writing-plans → execute → finish). Execution model:
- **Orchestrator = main session (Fable/Opus).** Owns the plan, dispatches tasks, reviews diffs, runs the gates (tests, build, tenancy greps, impeccable), commits, merges. Executors never self-merge.
- **Executor = Sonnet subagents** (`Agent` tool with `model: "sonnet"`), one per plan task, each given a self-contained brief: files to touch, exact code from the plan, verification commands.
- **Escalation:** executors never guess. Blocked / ambiguous / plan-conflicts-with-reality → return the question to the orchestrator instead of improvising; the orchestrator answers (or asks the user) and re-dispatches.
- **ALWAYS subagent (binding, user-stated 2026-07-27).** The orchestrator does NOT implement plan tasks. It dispatches, reviews every diff, runs the gates, commits, merges. The orchestrator implements only two things itself: **genuinely difficult or delicate work** (crypto, tenancy, concurrency, money, anything where a wrong diff is expensive) and **trivial glue** (one-line fixes, doc edits, commit mechanics). Everything in between goes to an executor — don't do an executor's job because it feels faster.
- Commit in batches (several plan tasks per commit is fine). Track progress in `.superpowers/sdd/progress.md`.
- History: M0/M1 used heavy per-task implement+review+fix loops (too slow); M2–M5.5 ran fully inline (fast but burns the big model on mechanical work). This model is the middle: big model judges, fast model types.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

# rxed — M13c: the component library

**Date:** 2026-08-06 · **Milestone:** M13c · **Status:** approved direction, pre-build

Third of four M13 sub-milestones: M13a baseline ✅ → M13b design language ✅ → **M13c components** →
M13d auth screens.

**Governed by design law v3** (`docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`),
which is binding and is not restated here. This document decides *which components exist*, *what
they owe*, *how far into live screens the work reaches*, and *what proves it*.

---

## 1. The finding that shapes this milestone

The hand-off records that `bh-stat` has zero call sites. Measured on 2026-08-06 by **import**, not by
tag name — a tag-name grep finds a component's own definition and reads as a call site:

```
grep -rl "<Name>Component" frontend/src/app | grep -v 'app/ui/'
```

| Component | Files importing it |
|---|---|
| `ButtonComponent` | 32 |
| `AvatarComponent` | 10 |
| `PillComponent` | 6 |
| `SheetComponent` | 4 |
| `DayPagerComponent` | 2 |
| `WordmarkComponent` | 2 |
| `TagComponent` | **0** |
| `PanelComponent` | **0** |
| `FieldComponent` | **0** |
| `BoardRowComponent` | **0** |
| `StatComponent` | **0** |

**Five of the eleven are dead, not one.** Six are rendered.

Two consequences follow, and they point in opposite directions:

- `leaderboard.page.ts:26` hand-rolls `.row` / `.rank` / `.win` — a line-for-line reimplementation of
  `bh-board-row`, which it does not import. The component exists, the screen ignores it.
- `bh-field` was never adopted, and the global `.bh-input` in `styles.scss` took its place. **They
  have drifted**: `bh-field` sets `padding: 11px 13px` and `.bh-input` sets `9px 12px`, and both
  claim to be the application's text input.

So "restyle the component library" is not the work. Roughly half the library has no consumer, the
real primitives live in global CSS, and the screens that need components most are the ones that
reimplemented them. **M13c decides what should exist, builds that, and migrates the call sites onto
it.**

## 2. The scope rule

A component ships in M13c if and only if one of these is true:

1. **Something renders it today.**
2. **M13d's eleven auth screens need it** — M13d is the library's first real consumer and starts
   immediately after this milestone.
3. **`docs/BACKLOG.md` records a defect it fixes**, with a named existing consumer.

Nothing is built against an imagined consumer. That is exactly what `bh-stat` already is, and
restyling a component nothing renders is the purest form of the double work this rework program
exists to avoid.

The roadmap's "~22 components" is an estimate written before any inventory. It is not a target.

## 3. The inventory — 18 components

### 3.1 Rebuild (6) — has call sites

| Component | Call sites | What changes, beyond design law v3 |
|---|---|---|
| `bh-button` | 32 | **No loading state exists.** §11.1 owes seven states; it has four. Loading is the one that matters — every save in the product is a button that must show pending (§11.6). |
| `bh-avatar` | 10 | The stale-`computed()` defect, §3.5. Signal inputs make it structurally impossible. |
| `bh-pill` | 6 | Tones re-mapped onto `--good` / `--warn` / `--danger`; `--danger` may now fill a chip (law §3.1). |
| `bh-sheet` | 4 | Two filed a11y defects: no focus trap beyond native `<dialog>`, and the discard bar does not move focus when it appears. Its three strings are unmarked for i18n. |
| `bh-day-pager` | 2 | Tokens; `‹` / `›` become `bh-icon`; the two aria-labels are unmarked. |
| `bh-wordmark` | 2 | Shipped in M13b against law v3. **Verify only** — the expected diff is zero, and a zero diff is the correct outcome, not a skipped task. |

### 3.2 Build (12) — M13d demand, or a filed defect with a named consumer

| Component | Justification under §2 |
|---|---|
| `bh-field` | Rule 2 — all eleven M13d screens are forms. Absorbs `.bh-input`, ending the drift in §1. |
| `bh-select` | Rule 2. Absorbs `.bh-select`. |
| `bh-panel` | Rule 2 — M13d's screens are cards. 12 lines; kept rather than deleted because the consumer is one milestone away, not hypothetical. |
| `bh-alert` | Rule 1 and 2 — `class="err"` appears **42 times** across features, and every M13d status screen (check-email, verify, forgot, reset) renders a standing message. |
| `bh-empty` | Rule 1 — `class="empty"` appears **13 times**. |
| `bh-skeleton` | Rule 3 — law §5.1 prescribes an opacity pulse specifically because gradients are banned, and §11.6 makes loading states mandatory. Nothing implements it. |
| `bh-icon` | Rule 3 — BACKLOG: "Unicode glyph icons (⎋ ⌘ ◐) read as a placeholder icon system." §5. |
| `bh-app-shell` | Rule 3 — BACKLOG: "Header CSS is ~90% duplicated across three shells." Three consumers. §6.3. |
| `bh-data-table` | Rule 1 and 3 — `.bh-table` has 7 consumers; BACKLOG: "Admin tables on phone are scroll-tables, not cards." |
| `bh-segmented` | Rule 1 and 3 — `score-form.component.ts:16,18` uses `role="radio"` with no roving tabindex or arrow keys. Filed. |
| `bh-switch` | Rule 1 — `score-form.component.ts:33,63`, two hand-rolled `.switch` toggles. |
| `bh-search-bar` | Rule 1 and 3 — three hand-rolled `.search` inputs (`wod-library`, `movements`, `members`); BACKLOG: "`members.page` search fires one request per keystroke — no debounce." |

### 3.3 Delete (3) — zero call sites, zero M13d demand

`bh-stat` · `bh-board-row` · `bh-tag`.

The board row and the RX tag are **hero-screen** parts. **M17 extracts them from the real leaderboard
when it rebuilds it**, against real data and real tie/rank behaviour. Rebuilding them now means
designing a leaderboard row with no leaderboard in front of you, and then doing it again in M17.

**Nothing on screen changes when these three are deleted, and that was verified rather than assumed.**
The only `RX` badge in the codebase is `board-row.component.ts:9`, inside the dead component itself.
`score-form.component.ts:16` renders the string `RX`, but that is the segmented control's *label*
(RX vs. Scaled), a different thing, and it stays — it becomes `bh-segmented`. Law §6.2 keeps calling
for a mono `RX` / `SC` badge; M17 builds it when a screen actually needs one.

### 3.4 What every component owes

Design law §11.1's seven states — **default, hover, focus, active, disabled, loading, error** — are
not a checklist to assert. **They are the gallery's structure** (§7): a component's gallery section
renders each state it can have, so a missing state is missing from the page. A component that cannot
be in a state (a `bh-panel` has no loading state) says so in its section rather than omitting it
silently.

Plus, per law: tokens only, no raw hex, mono only for prescription/measured content, `--tap` 44px
minimum, `prefers-reduced-motion` alternative, focus ring inverting to `--focus-inv` on a volt
surface, and colour never the only signal.

### 3.5 The `bh-avatar` defect, recorded because it is a class and not an instance

`avatar.component.ts:33`:

```ts
@Input() name = '';
initials = computed(() => this.name.split(/\s+/)...);
```

`this.name` is a plain field, so this `computed()` has **zero signal dependencies**. It evaluates
once and caches forever. Change `name` on a reused DOM node — an `@for` member list re-rendering, an
avatar grid paging to another class — and the initials are stale while the photo is right.

Invisible to every gate: it type-checks, it renders, and a spec that constructs the component once
passes. **This is the argument for §4's signal inputs**, and the same shape (`computed()` reading a
decorator input) is worth grepping for during the milestone.

## 4. Conventions — decided once, so eighteen briefs do not each decide

| Decision | Applies to |
|---|---|
| **Signal inputs** — `input()`, `input.required()`, `model()`, `output()` | The 18 rebuilt `ui/` components only. Feature screens keep `@Input()` until their own milestone. |
| **`ChangeDetectionStrategy.Eager` is dropped** | The 18 rebuilt components only. The 45 feature components keep M13a's pin. CD strategy is per-component; a mixed tree is normal, not a half-migration. |
| **`withXhr()` stays** on `provideHttpClient` | Unchanged. It is `app.config.ts` plus ~33 spec files and has nothing to do with components. Stays filed. |
| **i18n ids: `@@ui.<component>.<element>`** | Law §12.1 fixes the shape as `@@<feature>.<screen>.<element>`; `ui` is the feature for components. Template text uses the `i18n` attribute, TS strings use `$localize`. |
| **Flat `src/app/ui/`, one file per component, no barrel** | A barrel costs tree-shaking and buys nothing at 18 components. |

Signal inputs and dropping the pin are **one decision, not two**: signal inputs are what makes the
newer change-detection default correct rather than merely tolerated, and §3.5 is what happens when a
component is signal-shaped on the inside and decorator-shaped at its boundary.

## 5. The icon set

**Lucide, inlined.** The ~20 SVG paths the product needs are taken from `lucide-static` (v1.28.0,
ISC — an SVG-file package with no Angular runtime) and inlined into a single `bh-icon` component
with a `name` union type.

Why not the `lucide-angular` wrapper: it couples the icon layer to a third party's Angular 22
support, and M13a already lost a task to trusting an ecosystem claim without checking the package.
Why not hand-drawn: twenty icons at 16–24px is real design work with a low ceiling, and inconsistent
stroke weights across a set are what read as amateur.

Only the icons in use ship. Adding one later is one entry in the map. There is no CSP question,
because nothing is fetched.

**What it replaces**, measured 2026-08-06:

- Shell nav glyphs, which are transparently placeholders — `▮▮` = Home, `$` = Plan, `＋` = Book,
  `◎` = WOD, `⌘` = Types, `◉` = Members, `▲` = Progress, `⋯` = More.
- Inline: `‹` `›` (9 + 6), `✓` (9), `→` (7), `✕` / `×` (5), `⚙` (3), `⎋` (2), `↑` `↓` (4), `🔒`, `←`.

`…` (82 occurrences) is **not** an icon — it is an ellipsis in copy and in `placeholder` text, and it
stays text.

Every icon is `aria-hidden` and accompanied by a text label, per law §11 ("colour is never the only
signal", and neither is a glyph).

## 6. How far into live screens this reaches

### 6.1 The rule

**M13c migrates call sites mechanically. It redesigns no screen.**

A *mechanical* migration is a markup swap producing the same information in the same layout:
`<table class="bh-table">` becomes `<bh-data-table>`, `<input class="search">` becomes
`<bh-search-bar>`. Anything that changes what a screen **says** or how it is **laid out** belongs to
that screen's own milestone (M14 / M15 / M16 / M17 / Project 2). `members.page` looks the same after
the migration as before it.

The alternative — leave the global CSS alive and have components wrap it — was considered and
rejected. It is what produced §1's `bh-field` / `.bh-input` drift, and two sources of truth for one
control is a defect generator, not a smaller diff.

### 6.2 The global stylesheet after M13c

| Global CSS | Fate |
|---|---|
| `.bh-input`, `.bh-select` | into `bh-field` / `bh-select` |
| `.bh-table`, `.bh-table-wrap` | into `bh-data-table` (7 screens) |
| `.bh-dock`, `.bh-dock-item` | into `bh-app-shell` (3 shells) |
| `.bh-section`, `.bh-section-head` | **stay** — layout utilities, not components |
| `.t-eyebrow`, `.t-eyebrow-tight`, `.t-h2`, `.num` (`_fonts.scss`) | **stay** — type utilities, correct as global classes |

`styles.scss` ends as: reset, `body`, `a`, `:focus-visible`, `::selection`, the reduced-motion block,
and `.bh-section*`.

### 6.3 The three tasks that touch live screens

These are the milestone's risk, and each gets its own dispatch and its own diff review:

- **`bh-app-shell` across athlete, coach and admin.** All three are e2e-covered. It is the only
  component that cannot be proven in the gallery, because its failure modes are compositional.
- **`bh-data-table` across 7 screens** — `members`, `movements`, `schedule`, `wod-library`,
  `progress`, `athlete-profile`, `superadmin/console`.
- **`bh-segmented` + `bh-switch` in `score-form`.** Score-form lives inside a `bh-sheet` behind a
  dirty-form discard guard — the fiddliest interaction in the product, and one where a focus bug is
  invisible to a passing spec.

### 6.4 Raw `font-size` in px — the split, and why it is a split

Measured 2026-08-06: **105** occurrences of `font-size: Npx` in `frontend/src/app`.

| Where | Count | In M13c? |
|---|---|---|
| `app/ui/` | 18 | **Yes** — mandatory. A rebuilt component shipping `font-size: 46px` is not rebuilt. |
| `app/features/`, size **on** the scale (11/13/15/20/40) | 36 | **Yes** — mechanical, exact. |
| `app/features/`, size **off** the scale | 51 | **No.** |

The 51 are the reason this is a split rather than a sweep. `17px` appears 8 times and **no token is
17px** — the scale is 40 / 28 / 20 / 15 / 13 / 11. Converting one means choosing 15 or 20, which
visibly changes the screen. That is ~51 design decisions across ~30 screens under no other pressure,
and nothing in M13c's gates can see a wrong choice.

The 36 on-scale ones have a payoff beyond tidiness. Afterwards,
`grep 'font-size: *[0-9]*px' frontend/src/app/features` returns **only off-scale values** — which
converts "people typed px" into a documented list of *sizes the scale does not have*, handed to
M14–M18 as real questions.

**One honest caveat, stated so nobody claims more than is true:** `--fs-sm` is `0.8125rem`, and `rem`
resolves against `<html>`, which sets no font-size (`body` sets `16px`, which does not affect `rem`).
So `13px` → `var(--fs-sm)` renders identically at browser default and *scales* for a user who raised
theirs. That is an accessibility improvement, not a regression — but it is **not** literally
pixel-identical, and the visual-regression baselines are generated after the swap, not across it.

## 7. The gallery

**One route, grown, not split:** `/app/dev/components`, which M13b created early for its two proof
screens. Those two proofs **stay** — they are the language proof and the font-pipeline canary that
caught M5.5's class of bug.

Each component gets a section wrapped in a stable `data-gallery="<name>"` element, rendering **every
state that component can be in** (§3.4). Screenshots target those wrappers, not the page, so a change
to one component churns one baseline rather than one 3000px-tall one.

The gallery is fabricated data, no API call, no guard, unlinked from the product. Its deletion at
launch is already filed in `docs/BACKLOG.md`; that entry stays accurate — one route, one eventual
deletion.

## 8. The gates

### 8.1 Written as commands that must come back empty

M13b's Task 2 lesson, applied deliberately: a gate phrased as *"this grep must return nothing"* knows
about the file you forgot; a gate phrased as a list of files to change does not. That is how
`tv-shell.page.ts` was caught after being dropped from a brief.

```
grep -rnE 'class="[^"]*\bbh-(input|select|table|table-wrap|dock|dock-item)\b' frontend/src/app
grep -rnE '\.bh-(input|select|table|dock)\b' frontend/src/styles.scss frontend/src/styles
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui
grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features
grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/ui
grep -rn '@Input()\|@Output()' frontend/src/app/ui
grep -rn 'StatComponent\|BoardRowComponent\|TagComponent' frontend/src
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features \
  --exclude=receipt.page.ts
```

Each must produce **zero bytes**.

**Every one of these was run on `main` at `70a7565` before being written down**, because a gate that
has never been seen fail proves nothing — the hand-off's own most expensive lesson, and the reason
M13b's font guard passed for a whole milestone while asserting a deleted typeface. Baseline:

| Gate | Hits today | After M13c |
|---|---|---|
| `class="… bh-input/select/table/dock …"` in `app/` | **79** | 0 |
| `.bh-input/select/table/dock` defined in `styles/` | **20** | 0 |
| `font-size: Npx` in `app/ui` | **18** | 0 |
| on-scale `font-size` px in `app/features` | **36** | 0 |
| `ChangeDetectionStrategy.Eager` in `app/ui` | **9** | 0 |
| `@Input()` / `@Output()` in `app/ui` | **35** | 0 |
| `StatComponent` / `BoardRowComponent` / `TagComponent` | **3** | 0 |
| raw hex in `app/ui` + `app/features`, print excluded | **0** | 0 |

The first seven fall to zero, so they discriminate. **The eighth is zero today and must stay zero** —
it is a standing guarantee, not a migration, and it is the one on this list that can pass vacuously.
It is kept because law §2.1 makes a raw hex a bug and because M13c writes eighteen new stylesheets,
which is precisely when one would reappear.

The 79 is also the honest size of §6.1's mechanical migration.

**The `--exclude` on the hex gate is load-bearing and is not a carve-out for convenience.**
`receipt.page.ts:93-98` holds four hex lines inside its `@media print` block, and they are correct:
law §3.2 requires the receipt to invert to ink-on-paper for the one document this product puts on
paper, and a print stylesheet cannot express white-paper values as dark-theme tokens. Verified
2026-08-06 — those four lines are the **only** raw hex in `app/ui` and `app/features` combined, so
without the exclusion this gate fails on legitimate code and gets weakened by whoever hits it first.
That is how a gate stops being read. Per the hand-off's standing rule: **never pipe a gate through
`grep`/`tail`** — in zsh `$?` after a pipe is the pipe's. Redirect to a file, check `$?` on the next
line.

### 8.2 The real gates

- `npm test -- --watch=false --browsers=ChromeHeadless` — never bare `npm test`, which hangs in watch
  mode. Baseline **182** specs; every rebuilt component owes at least one.
- `ng build --configuration production` — the only gate that type-checks Angular templates.
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` — **428/0/0, as a regression check.** M13c
  changes no backend code. Never run concurrently with Karma.
- e2e **28 passed + 1 skipped** at `retries: 0`, on a `down -v` rebuilt stack.
- **axe-core**, §8.4.
- **Visual regression**, §8.5.
- The **impeccable** gate (law §16): shape → build → critique ≥ 28/40, no open P0/P1, before merge.

### 8.3 The style budget — decided once, with the reason written down

`angular.json` today: `anyComponentStyle` warning **4 kB**, error **8 kB**.

**The warning rises to 6 kB. The error stays at 8 kB.** The reason goes in the file, not only here:

> The budget counts **uncompressed** bytes, but the wire cost is brotli. `var(--fs-meta)` is eleven
> characters longer than `11px` and a component repeating it eleven times compresses to almost
> nothing. At 4 kB the budget was actively arguing for a raw value over its token — M13b's admin
> members proof went over budget purely by tokenising two literals — which puts a build setting in
> opposition to design law §2.1. The 8 kB **error** is untouched, so genuine bloat still fails.

**Two things this deliberately does not do**, so neither is discovered as a surprise:

- It **silences the three known warnings** (`instance-builder.page.ts` +456 B, `tv-shell.page.ts`
  +256 B, `progress.page.ts` +17 B). That is the honest cost of the change. They stay filed in
  `docs/BACKLOG.md` against M14, Project 2 and M17 respectively; the fix is each screen's rebuild,
  not a bigger budget.
- It does **not** close the real hole: **inline `style=""` in template markup does not count toward
  `anyComponentStyle` at all.** Recorded in the BACKLOG so it is known as a fact rather than
  discovered as a workaround. M13c does not use inline styles to dodge the budget, and reviewers
  should treat a new inline `style=""` in a component as a smell.

### 8.4 axe-core — scoped, so it cannot become a screen-fixing milestone

`@axe-core/playwright@4.12.1`, one new dev dependency in `e2e/`. Zero WCAG 2.2 AA violations.

**Two targets, and the scoping is the design:**

1. **The gallery, whole page.** It renders all 18 components in all their states, so this audits
   exactly what M13c owns.
2. **The three shells, `.include()`-scoped to the shell chrome only** — header, nav, dock — never the
   page body.

The second exists because `bh-app-shell` is the one component that cannot be proven in the gallery:
its failures are compositional (focus order through a nav, landmark structure, ids duplicated across a
header rendered three times). A component that passes in isolation and breaks in place has not been
tested.

Scoping is what keeps M13c a component milestone. **Anything axe would report inside a screen body is
out of scope by construction, not by triage** — there is no judgement call to get wrong.

Design law v2 §11 has required AA since M5 and it has been reviewed by hand ever since. Two known
violations are fixed here because they live in components being rebuilt: `role="radio"` without
roving tabindex (`bh-segmented`) and the sheet discard bar not moving focus (`bh-sheet`).

### 8.5 Visual regression — baselines from the same renderer that enforces them

Playwright `toHaveScreenshot()` over each `data-gallery="<name>"` wrapper, at **375 / 768 / 1440**.

**Dark only.** The BACKLOG entry says "both themes"; that entry predates M13b, which deleted the
light theme. Correct it when this lands.

**The trap, handled rather than discovered:** Playwright suffixes snapshot paths by platform, so a
baseline generated on macOS is `…-darwin.png` and one generated on Linux is `…-linux.png`. Committed
macOS baselines are therefore invisible to CI, and CI's are invisible locally — the check silently
tests nothing on one side and fails wholesale on the other.

The resolution:

- Baselines are **generated and verified inside a Linux container** (`mcr.microsoft.com/playwright`),
  against the local Docker stack, reached at `http://host.docker.internal` — `baseURL` already reads
  `E2E_BASE_URL`, so no config change is needed for that half.
- `snapshotPathTemplate` is set explicitly to omit `{platform}`, so there is exactly one baseline per
  component per viewport.
- The visual spec is **tagged and excluded from the default run**, and is executed only by the
  container script. A macOS `npx playwright test` must never compare against Linux baselines — that
  is the failure mode this section exists to prevent, and excluding it is more honest than tuning a
  threshold until it passes.

**Ordering: this is the last task of the milestone.** Baselines churning while components are still
being designed is the stated reason it was cut once already. It lands when the 18 components are
final.

**CI is currently not scheduling runs** (see the hand-off — a private repo on a free plan, almost
certainly exhausted Actions minutes). This approach works regardless: the container runs on the
developer's machine. When CI resumes it compares against the same renderer's output.

## 9. What M13c does NOT ship

- **No screen is redesigned.** §6.1.
- **The 51 off-scale `font-size` values in features stay**, and become a documented list for M14–M18.
- **`bh-week-calendar`** — already deferred to M14 by the v2 roadmap; its API is decided by
  scheduling interactions that do not exist yet.
- **The hero-screen components** — board row, RX badge, the leaderboard's rank column. Deleted here,
  extracted by M17 from the real screen.
- **The categorical chart palette** — law §17. Filed; it needs real data, and a ramp designed against
  imaginary data is a ramp that gets redesigned.
- **`withXhr()`** stays. **`ChangeDetectionStrategy.Eager` stays on the 45 feature components.**
- **Backend untouched. No Flyway. Next migration stays V19.**
- **The quarantined TV/SSE defect is not investigated.** Project 2 owns it; the reproduction recipe is
  at the top of `docs/BACKLOG.md`.
- **No new locale, no `PATCH /api/me/locale`.** Components are marked; nothing is translated.

### 9.1 Two M13b claims verified in passing, not as tasks

M13b left two things computed rather than seen, and both are recorded in the hand-off as unverified:
the receipt page's `@media print` block was never printed to PDF and looked at, and the mail accent
was never opened in Mailpit. **Neither is a component.** Both are verified during M13c's gate run
because the stack is up anyway and each costs minutes; neither is a task and neither gates the
milestone. If either turns out to be wrong, it is filed against the milestone that owns the screen
(M16 for both), not fixed here.

## 10. Execution

Orchestrator/executor per `CLAUDE.md`, binding since M6. The orchestrator dispatches one Sonnet
executor per plan task with a self-contained brief, reviews every diff, runs the gates, commits and
merges. Executors never self-merge and are told to **stop and escalate rather than improvise**.

Two rules carried forward because they earned it in M13b, where five of six executors returned a real
finding and three of those were factual errors in the orchestrator's own briefs:

- **Do not assert an exact string, signature, line number or schema in a brief without opening the
  file.** Half of M13b's briefs contained an unverified specific asserted from a grep.
- **Do not commit while an executor has files staged.** `git commit` takes the whole index; in M13b a
  commit labelled "docs" silently swallowed 89 lines of deleted TypeScript.

Task ordering is fixed by two dependencies and is otherwise free: **`bh-icon` precedes anything that
renders an icon** (`bh-app-shell`, `bh-day-pager`, `bh-search-bar`, `bh-alert`, `bh-empty`), and
**visual regression is last** (§8.5).

## 11. Open, and deliberately not decided here

- **Whether `bh-data-table`'s phone card mode is one component or two.** The BACKLOG asks for cards on
  phone rather than a scroll-table; whether that is a `mode` input or a separate component is decided
  when the seven real tables are in front of the implementer, not now.
- **Whether `bh-alert` and `bh-empty` should be one component.** They are one shape (icon + message +
  optional action) with different semantics (`role="alert"` vs. none). Kept separate on the grounds
  that a component whose `kind` input changes its ARIA role is a component doing two jobs — revisit
  if the two implementations turn out identical.
- **`bh-search-bar`'s debounce interval.** 250–300ms is the conventional range; the exact value is
  measured against the real `members.page` request, not asserted here.

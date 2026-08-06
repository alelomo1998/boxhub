# M13b — Design Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BoxHub's warm-broadcast visual language with rxed's chalkboard-black-and-volt language — new tokens, new faces, dark-only, a typographic wordmark, and both halves of the language proven on a real screen.

**Architecture:** The token file is the only place values live, and the token *names* are preserved (`--ground`, `--surface`, `--bone`…), so changing values recolours every existing screen without touching it. Only `--red` and its relatives are renamed, because after this milestone they would be lying. A transitional alias block keeps the application coherent between the token swap (Task 1) and the last call-site migration (Task 5) — at no point is `main` left with an app that fails to render.

**Tech Stack:** Angular 22.1.0, TypeScript 6.0.3, SCSS with CSS custom properties, `@fontsource` self-hosted webfonts, Karma/Jasmine (184 specs), Playwright (28 e2e), Spring Boot 3.5 / Thymeleaf for mail.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`.

- **The spec is the design law.** Read it before starting any task. Where this plan and the spec disagree, **stop and escalate to the orchestrator** — do not reconcile them yourself.
- **Tokens only.** A raw hex outside `frontend/src/styles/_tokens.scss` is a bug. The single sanctioned exception is the HTML mail templates (Task 8), which cannot read CSS custom properties.
- **Dark only.** There is no light theme, no `data-theme`, no `prefers-color-scheme`, no `ThemeService`.
- **Palette:** `--ground #0d110e` · `--surface #151a16` · `--surface-2 #1d231e` · `--hairline #2a322c` · `--bone #f2f4ef` · `--bone-dim #a7b0a6` · `--faint #7c8779` · `--volt #dfff4e` · `--on-volt #0d110e` · `--good #3fcf8e` · `--warn #f0883e` · `--danger #e5484d` · `--disabled #4a5249`.
- **Volt means live / now / primary / winning, and nothing else.** One volt element per screen, and a volt fill may be a row, chip, button, bar or badge — **never a card, panel, page background or sheet**.
- **No glow, no gradients, no shadows on flat surfaces, no textures.** Shadows are permitted only on things that physically float: the dock, `bh-sheet`, dialogs.
- **Faces:** Archivo (400/500/700/800) for names, headlines, body, buttons. JetBrains Mono (400/700) for workouts, scores, clocks, eyebrows, table meta, codes. Saira Condensed is deleted. **Mono is banned from prose.**
- **Radius:** `--r-xs 4px` · `--r-ctl 8px` · `--r-card 12px` · `--r-lg 12px` · `--r-full 999px`. `--edge` stays an alias of `--r-ctl`.
- **Focus ring:** `outline: 2px solid var(--focus); outline-offset: 2px` — and `var(--focus-inv)` when the focused element sits **on a volt surface**, because a volt ring on a volt button is invisible.
- **No product screen is redesigned in this milestone.** The proof screens (Tasks 9–10) live at a dev-only route with fabricated data. Existing screens recolour automatically and are **not** hand-corrected; some will look wrong and that is expected.
- **Brand:** `rxed`, lowercase, always. Internal namespaces never change — `com.boxhub.*`, `BOXHUB_*`, `bh-*`, database and image names, the `boxhub_tv_paired` storage key.
- **i18n:** every user-facing string in new code is i18n-marked. No new hardcoded string, ever. No new hand-written `€`.
- **Gates.** `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless` (~13s — it does **not** hang; watch mode does). `ng build --configuration production` is the **only** gate that type-checks Angular templates. Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. **Never pipe a gate through `grep`/`tail`** — `exit=$?` after a pipe is the pipe's. **macOS has no `timeout`.**
- **Before running any stack command:** `cp docker/.env.example docker/.env`.
- **Executors: run `graphify query "<question>"` before reading or grepping source files** — a hook enforces it.
- **Escalate, never improvise.** Blocked, ambiguous, or the plan contradicts what is actually in the file → return the question to the orchestrator. Do not widen a rule, retire a test, or bend production code to match a brief. Roughly half the briefs written in M13a contained a factual error and every one was caught this way.

---

## File Structure

**Frontend — the language itself**
- `frontend/src/styles/_tokens.scss` — the only place values live. Full rewrite (Task 1).
- `frontend/src/styles/_fonts.scss` — type-scale utility classes. Rewritten for the new faces (Task 1).
- `frontend/src/styles.scss` — global element styles, focus ring, `::selection`, dock, skeleton (Task 1).
- `frontend/angular.json`, `frontend/package.json` — font delivery (Task 1).

**Frontend — deletions**
- `frontend/src/app/core/theme/` — the whole directory goes (Task 2).
- `frontend/src/app/app.component.ts`, `app.config.ts`, `features/admin/admin-shell.page.ts`, `features/coach/coach-shell.page.ts`, `features/athlete/profile-sheet.component.ts` — unwired (Task 2).

**Frontend — call-site migration** (Tasks 3–5): 53 files outside `_tokens.scss` reference `--red`.

**Frontend — new**
- `frontend/src/app/ui/wordmark.component.ts` — the logo, as type rather than an asset (Task 6).
- `frontend/public/favicon.svg` — hand-drawn, no font dependency (Task 6).
- `frontend/src/app/features/dev/` — the proof route and its two screens (Tasks 9–10).

**Backend**
- `shared/Brand.java`, `application.yml`, 8 mail templates (Tasks 7–8).

**Docs** (Task 12): `DESIGN.md`, `CLAUDE.md`, `PRODUCT.md`, `docs/HANDOFF.md`, `docs/BACKLOG.md`, `.superpowers/sdd/progress.md`.

---

### Task 1: Tokens, faces, and global styles

The foundation. Everything else depends on it, and it is atomic — a half-swapped palette is not a state worth committing.

**Files:**
- Modify: `frontend/src/styles/_tokens.scss` (full rewrite, currently 69 lines)
- Modify: `frontend/src/styles/_fonts.scss` (full rewrite, currently 9 lines)
- Modify: `frontend/src/styles.scss` (lines 15, 16, 23, 43, 44 plus additions)
- Modify: `frontend/angular.json` (the `styles` array at lines 38–45)
- Modify: `frontend/package.json` (dependencies)

**Interfaces:**
- Produces: every token named in Global Constraints, plus the transitional aliases `--red`, `--on-red`, `--red-glow`, which Tasks 3–5 remove. Produces the utility classes `.t-eyebrow`, `.t-eyebrow-tight`, `.t-display`, `.t-h2`, `.t-h3`, `.t-figure`, `.t-body`, `.num`, `.bh-skel`.

- [ ] **Step 1: Swap the font packages**

```bash
cd frontend && npm remove @fontsource/saira-condensed && npm install @fontsource/jetbrains-mono
```

Expected: `package.json` loses `@fontsource/saira-condensed`, gains `@fontsource/jetbrains-mono`. `@fontsource/archivo` is untouched.

- [ ] **Step 2: Point `angular.json` at the new faces**

Replace the three `saira-condensed` entries and add the two new ones. The `styles` array at `frontend/angular.json:38` becomes:

```json
"styles": [
  "node_modules/@fontsource/archivo/400.css",
  "node_modules/@fontsource/archivo/500.css",
  "node_modules/@fontsource/archivo/700.css",
  "node_modules/@fontsource/archivo/800.css",
  "node_modules/@fontsource/jetbrains-mono/400.css",
  "node_modules/@fontsource/jetbrains-mono/700.css",
  "src/styles.scss"
],
```

There is a second `styles` array in the `test` target (around line 110) containing only `"src/styles.scss"`. **Leave it alone** — Karma does not need webfonts, and adding them there slows every run for nothing.

- [ ] **Step 3: Rewrite `_tokens.scss`**

Replace the entire file:

```scss
/* rxed design tokens — design law v3, docs/superpowers/specs/2026-08-06-m13b-design-language-design.md
   This is the ONLY file where raw colour / size / duration values may live.
   Dark only, deliberately: there is no light theme (spec §2.1 records the re-open trigger). */
:root {
  /* Fixes native date/time pickers, scrollbars, form controls and Chrome's autofill
     in one declaration. Unconditional because there is no other theme to branch on. */
  color-scheme: dark;

  /* GROUND — chalkboard black. A trace of green; never warm, never pure #000. */
  --ground: #0d110e;
  --surface: #151a16;
  --surface-2: #1d231e;
  --hairline: #2a322c;

  --bone: #f2f4ef;      /* 17.2:1 on --ground */
  --bone-dim: #a7b0a6;  /*  8.4:1 */
  --faint: #7c8779;     /*  5.1:1 */

  /* VOLT — the only accent. live / now / primary / winning. Never decorative.
     16.9:1 on --ground, and identically 16.9:1 inverted, so inversion is contrast-neutral. */
  --volt: #dfff4e;
  --on-volt: #0d110e;

  /* Semantics stay quiet. Every hue is deliberately far from volt's ~72deg chartreuse:
     a status colour next to the accent reads as a weak accent, not as a status. */
  --good: #3fcf8e;
  --warn: #f0883e;
  --danger: #e5484d;
  /* 2.4:1 — WCAG 1.4.3 exempts inactive controls, and a disabled control that passes
     4.5:1 does not read as disabled. This is correct; do not "fix" it. */
  --disabled: #4a5249;

  --scrim: rgba(6, 9, 7, 0.62);
  --focus: var(--volt);       /* focus ring on any non-volt surface */
  --focus-inv: var(--ground); /* focus ring ON a volt surface — see spec §11.2 */

  /* TRANSITIONAL — deleted in Task 5 once all 53 call-site files are migrated.
     They exist so the app never renders uncoloured between Task 1 and Task 5. */
  --red: var(--volt);
  --on-red: var(--on-volt);
  --red-glow: rgba(223, 255, 78, 0.30);

  --font-display: "Archivo", system-ui, -apple-system, sans-serif;
  --font-body: "Archivo", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* Radius — squarer than M5.5's 10/14/20. --r-lg shares --r-card's value on purpose;
     the names stay separate so a future divergence costs one line. */
  --r-xs: 4px;
  --r-ctl: 8px;
  --r-card: 12px;
  --r-lg: 12px;
  --r-full: 999px;
  --edge: var(--r-ctl); /* legacy alias, 48 call sites, kept deliberately */
  --shadow-float: 0 8px 28px rgba(3, 5, 4, 0.55);

  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 40px; --sp-10: 64px;

  --fs-hero: 2.5rem;      /* 40 */
  --fs-display: 1.75rem;  /* 28 */
  --fs-h2: 1.25rem;       /* 20 */
  --fs-body: 0.9375rem;   /* 15 */
  --fs-sm: 0.8125rem;     /* 13 */
  --fs-meta: 0.6875rem;   /* 11 */

  --tap: 44px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur: 200ms;
}
```

- [ ] **Step 4: Rewrite `_fonts.scss`**

```scss
/* @fontsource css (woff2, self-hosted) is added via angular.json styles — the CSP blocks font CDNs.
   Type-scale utility classes, all token-driven. Screens read these, never raw px. */

/* Mono is the prescription voice: eyebrows, meta, codes. Uppercase and tracked. */
.t-eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--faint); }

/* Same voice at table density. Mono is ~15% wider than Archivo, uppercase adds more, and German
   adds 20-35% on top — 0.18em on six column headers is a horizontal scrollbar. See spec §6.3. */
.t-eyebrow-tight { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--faint); }

/* Archivo carries anything written or named. NOT uppercase: names read better in mixed case,
   and German uppercase is punishingly long. Uppercase now belongs to the mono eyebrows only. */
.t-display { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.02em;
  line-height: 1.02; text-wrap: balance; }
.t-h2 { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
  letter-spacing: -0.01em; }
.t-h3 { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body);
  letter-spacing: -0.005em; }
.t-body { font-family: var(--font-body); font-weight: 400; }

/* Figures are mono, so their digits already align. */
.t-figure { font-family: var(--font-mono); font-weight: 700; font-variant-numeric: tabular-nums; }
/* Archivo digits do NOT align by default — any number in a column needs this. */
.num { font-variant-numeric: tabular-nums; }

/* Loading. The usual skeleton shimmer is a moving gradient and gradients are banned (spec §5.1),
   so this pulses opacity instead. Under reduced motion it rests at the dim value. */
.bh-skel { background: var(--surface-2); border-radius: var(--r-xs);
  animation: bh-pulse 1.2s var(--ease-out) infinite; }
@keyframes bh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .bh-skel { animation: none; opacity: 0.55; } }
```

- [ ] **Step 5: Update the five colour references in `styles.scss`**

Change these lines in `frontend/src/styles.scss`, leaving everything else untouched:

```scss
/* line 15 */ a { color: var(--volt); text-decoration: none; }
/* line 16 */ :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* line 23 */ .bh-input:focus, .bh-select:focus { outline: 2px solid var(--focus); outline-offset: 2px; border-color: var(--volt); }
/* line 43 */ .bh-dock-item.active .glyph { color: var(--volt); }
/* line 44 */ .bh-dock-item:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
```

Line 23 loses its `box-shadow: 0 0 0 3px var(--red-glow)` — that was the glow, and it is now an outline. Line 44's offset is **negative** because the dock clips at its own rounded edge; a positive offset would be cut off.

- [ ] **Step 6: Add `::selection` after line 16**

```scss
::selection { background: var(--volt); color: var(--on-volt); }
```

The browser default is a blue that exists nowhere else in the product.

- [ ] **Step 7: Run the frontend suite**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: **184 specs, all passing.** Takes about 13 seconds.

If `theme.service.spec.ts` fails here, **stop and escalate** — Task 2 deletes it, and it failing early means Task 1 changed something it should not have.

- [ ] **Step 8: Run the production build**

Run: `cd frontend && npx ng build --configuration production`
Expected: exit 0. This is the only gate that type-checks Angular templates.

Watch the **budget** warnings: the styles bundle changes size with the font swap. Archivo 800 and JetBrains Mono 400/700 replace three Saira weights, so it should be roughly flat. **If a budget fails, stop and escalate** rather than raising the budget.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/styles frontend/src/styles.scss frontend/angular.json frontend/package.json frontend/package-lock.json
git commit -m "feat(design): chalkboard-black and volt tokens, Archivo + JetBrains Mono

Design law v3 tokens. Token names are preserved, so every existing
screen recolours without being touched; only --red and its relatives
need renaming, and they survive here as transitional aliases until the
last call site moves in Task 5.

Saira Condensed is dropped and JetBrains Mono added, no net font weight.
color-scheme: dark fixes native pickers, scrollbars and autofill in one
declaration - unconditional now that there is no other theme to branch
on. The focus ring becomes a solid outline: it was already 51 focus
rings wearing a glow's clothing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Delete the light theme and `ThemeService`

**Files:**
- Delete: `frontend/src/app/core/theme/theme.service.ts`
- Delete: `frontend/src/app/core/theme/theme.service.spec.ts`
- Modify: `frontend/src/app/app.component.ts` (line 4 import, line 15 `inject`)
- Modify: `frontend/src/app/app.config.ts` (line 7 import, lines 21–26 comment + `provideAppInitializer`)
- Modify: `frontend/src/app/app.config.spec.ts`
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts` (line 3 import, line 18 button, line 111 `inject`, plus the `.theme` CSS rule)
- Modify: `frontend/src/app/features/coach/coach-shell.page.ts` (line 3 import, line 22 button, line 73 `inject`)
- Modify: `frontend/src/app/features/athlete/profile-sheet.component.ts` (line 5 import, line 40 button, line 85 `inject`)
- Modify: `frontend/src/app/features/tv/tv-shell.page.ts` (line 18 `data-theme="dark"` attribute, line 210 `setAttribute` call and its comment)
- Modify: `frontend/src/app/features/admin/admin-shell.page.spec.ts` if it references the toggle

**Corrected 2026-08-06 during execution.** `tv-shell.page.ts` was missing from this list — it appeared
in the orienting grep and was dropped when the list was written. It never used `ThemeService`; it
force-writes `data-theme="dark"` directly, because the wall screen had to opt out of a user's light
preference. With no light preference to opt out of, that code has no subject, and after Task 1 no
`[data-theme]` selector survives to read it. Both lines are deleted with no replacement, in **this**
task's commit rather than a follow-up: Step 5's grep is the task's own definition of done, and a
write-only attribute is worse than inert — it advertises a mechanism that no longer exists, and the
next reader will design around a phantom.

`admin-shell.page.spec.ts` turned out **not** to reference the toggle, so that conditional step is a
verified no-op rather than an open question.

**Interfaces:**
- Consumes: Task 1's `_tokens.scss`, which already has no light values and no `data-theme` selectors.
- Produces: nothing. This task only removes.

**The current implementation, for reference** — `theme.service.ts` is 23 lines, writes `document.documentElement.dataset['theme']`, persists to `localStorage` under the key `bh_theme`, and is force-instantiated by `provideAppInitializer(() => { inject(ThemeService); })` in `app.config.ts:26`.

- [ ] **Step 1: Read every consumer before editing**

Run: `graphify query "ThemeService theme toggle data-theme"` then open each file listed under **Files** above.

The three toggle buttons are **not identical** — `admin-shell.page.ts:18` uses `class="theme"`, `coach-shell.page.ts:22` uses `class="iconbtn"`, and `profile-sheet.component.ts:40` uses `class="row asbtn"` and is a labelled row inside a sheet rather than an icon button. Each needs its own removal, including any now-orphaned CSS rule for that class. **Do not assume the markup matches between them.**

- [ ] **Step 2: Delete the service and its spec**

```bash
git rm frontend/src/app/core/theme/theme.service.ts frontend/src/app/core/theme/theme.service.spec.ts
```

If the `core/theme/` directory is then empty, remove it too.

- [ ] **Step 3: Unwire the five consumers**

Remove the import, the `inject(ThemeService)` field, the toggle button markup, and any CSS rule that only styled that button. In `app.config.ts` remove the `provideAppInitializer` line **and the comment above it**, which explains why the theme had to initialise synchronously — a comment describing a deleted mechanism is worse than no comment.

**`localStorage` key `bh_theme` is deliberately left behind on users' devices.** It is inert, and writing migration code to delete a string nobody reads is the kind of work this project does not do.

- [ ] **Step 4: Fix the specs**

`app.config.spec.ts` references `ThemeService` and will not compile. Read it and remove only the theme assertions — **if the spec asserts something else through the theme provider, stop and escalate** rather than deleting a test that was covering two things.

Do the same for `admin-shell.page.spec.ts` if it drives the toggle.

- [ ] **Step 5: Verify nothing references the theme any more**

```bash
cd frontend && grep -rn 'ThemeService\|data-theme\|prefers-color-scheme\|bh_theme' src
```

Expected: **no output at all.** Any hit is unfinished work.

- [ ] **Step 6: Run the suite**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: passing, with a **lower total than 184** — `theme.service.spec.ts` is gone. Record the new number; it goes in the hand-off.

- [ ] **Step 7: Production build**

Run: `cd frontend && npx ng build --configuration production`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "feat(design)!: delete the light theme and ThemeService

Dark only. The service, its spec, the data-theme mechanism, the
prefers-color-scheme block and three separate toggle buttons all go.

Recorded in the spec rather than implied: the re-open trigger is a pilot
box asking for it or an accessibility need surfacing, and the reversal
is one mixin plus a toggle because the token file is the only place the
values live.

The bh_theme localStorage key is left behind on users' devices. It is
inert, and code to delete a string nobody reads is not worth writing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rename `--red` → `--volt` and `--on-red` → `--on-volt`

Purely mechanical, and verifiable by a grep that must return nothing. Kept separate from Tasks 4 and 5 precisely *because* it is mechanical — a reviewer can approve it at a glance, which they cannot do once judgment is mixed in.

**Files:** 53 files under `frontend/src` outside `_tokens.scss`. Do not enumerate them by hand; the commands below find them.

**Interfaces:**
- Consumes: Task 1's aliases. After this task `--red` and `--on-red` still exist in `_tokens.scss` but have zero consumers.
- Produces: a codebase where the accent is called `--volt` everywhere.

- [ ] **Step 1: Record the starting counts**

```bash
cd frontend && grep -rho -- '--red[a-z-]*\|--on-red' src | sort | uniq -c
```

Expected: **`95 --red`, `54 --red-glow`, `11 --on-red`**, across **52 files** outside `_tokens.scss`.

These are re-measured at `63726f4`, i.e. **after Tasks 1 and 2**. They are lower than the `100 / 57 / 11` this plan was originally written against, and the drift is accounted for: Task 1 collapsed two `--red-glow` definitions into one alias, and Task 2's three toggle-button removals took the rest with them.

**If the numbers differ from 95 / 54 / 11, stop and escalate** — the tree has moved again and the task's assumptions need re-checking.

- [ ] **Step 2: Rename, longest token first**

Three things make this trickier than it looks, and getting any of them wrong is silent:

1. `--on-red` contains `--red` as a substring, so it must be replaced **first**.
2. `--red-glow` must survive for Task 4, so the bare replacement must not match it.
3. **`_tokens.scss` must be excluded.** It contains the alias lines `--red: var(--volt);` and `--on-red: var(--on-volt);` — a blind `sed` turns the first into `--volt: var(--volt);`, a self-referential custom property that resolves to nothing and silently drains the colour out of the entire application.

```bash
cd frontend/src
grep -rl --include='*.ts' --include='*.scss' --include='*.html' -- '--on-red' . \
  | grep -v '_tokens.scss' | xargs sed -i '' 's/--on-red/--on-volt/g'
grep -rl --include='*.ts' --include='*.scss' --include='*.html' -- '--red' . \
  | grep -v '_tokens.scss' | xargs sed -i '' 's/--red\([^-a-z]\)/--volt\1/g; s/--red$/--volt/g'
```

The `[^-a-z]` guard is what spares `--red-glow`. The `--include` filters keep `xargs` away from `.DS_Store` and anything else binary. **`sed -i ''` is the macOS form** — the empty argument is required and is not a typo.

Leave `_tokens.scss` exactly as Task 1 wrote it. Its aliases are deleted in Task 5, by hand.

- [ ] **Step 3: Verify the rename is complete and `--red-glow` survived**

```bash
cd frontend && grep -rho -- '--red[a-z-]*\|--on-red\|--volt\|--on-volt' src | sort | uniq -c
```

Expected: `--red` appears **exactly twice** and `--on-red` **exactly once** — all three are the alias lines inside `_tokens.scss`, which this task deliberately did not touch (`--on-red:` contains `--red` as a substring, which is why the count is two and not one). `--red-glow` is still **57**. `--volt` and `--on-volt` carry the counts `--red` and `--on-red` had.

Then confirm the alias block is intact and did **not** become self-referential:

```bash
cd frontend && grep -n -- '--red\|--on-red' src/styles/_tokens.scss
```

Expected exactly:
```
  --red: var(--volt);
  --on-red: var(--on-volt);
```

**If either line reads `--volt: var(--volt)`, revert the whole task and escalate** — that property resolves to nothing and drains the colour out of every screen, and it does it without any error.

- [ ] **Step 4: Run the suite and the build**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Then:
```bash
cd frontend && npx ng build --configuration production
```
Expected: both pass. A `sed` that mangled a selector shows up as a build failure or a spec failure, not as a wrong colour.

- [ ] **Step 5: Skim the diff for collateral damage**

```bash
git diff --stat
```

Expected: ~53 files, and every hunk is a token name. **If `sed` touched anything that is not a CSS custom property reference — a string literal, a comment, a class name — stop and escalate.**

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(design): rename --red to --volt across every call site

Mechanical, and the completion test is that grep finds nothing. Split
out from the semantic work in Tasks 4 and 5 so a reviewer can approve it
at a glance.

--red-glow is deliberately left behind: it is not a colour rename, it is
51 focus rings and 4 decorative glows that need different treatment.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Turn `--red-glow` into a real focus ring

51 of its 55 uses are focus rings wearing a glow's clothing. Four are decorative and lose the effect entirely.

**Files:** every file matching `--red-glow` under `frontend/src`.

**Interfaces:**
- Consumes: `--focus` and `--focus-inv` from Task 1.
- Produces: a codebase with no `--red-glow`, and a focus ring that is visible on volt-filled controls.

- [ ] **Step 1: List the patterns before changing any of them**

```bash
cd frontend && grep -rho '[^;{]*--red-glow[^;]*' src | sed 's/^ *//' | sort | uniq -c | sort -rn
```

Expected, re-measured at `63726f4` (after Tasks 1 and 2):

```
  46 box-shadow: 0 0 0 3px var(--red-glow)          <- outer focus rings
   3 box-shadow: inset 0 0 0 3px var(--red-glow)    <- inset focus rings
   2 box-shadow: 0 6px 24px var(--red-glow)         <- decorative, delete
   1 box-shadow: 0 0 14px var(--red-glow)           <- decorative, delete
   1 box-shadow: 0 0 12px var(--red-glow)           <- decorative, delete
   1 --red-glow: rgba(223, 255, 78, 0.30)           <- the Task 1 alias line itself
```

So: **49 focus rings and 4 decorative glows.** The original plan said 51 and 4 — Task 2's toggle-button removals took two focus rings with them.

**If the shapes differ from this, stop and escalate.** A shape this plan does not list means somebody used the glow for something neither of us has looked at.

- [ ] **Step 2: Replace the 47 outer focus rings**

Each `box-shadow: 0 0 0 3px var(--red-glow);` becomes:

```css
outline: 2px solid var(--focus); outline-offset: 2px;
```

If the same rule already sets `outline: none` (a common pairing, since the glow was replacing the native ring), **delete that `outline: none`** — leaving it wins the cascade and silently removes the focus ring you just added. This is the most likely way to break accessibility in this task.

- [ ] **Step 3: Replace the 4 inset focus rings**

`box-shadow: inset 0 0 0 3px var(--red-glow);` becomes:

```css
outline: 2px solid var(--focus); outline-offset: -2px;
```

Inset existed because those elements clip at their own rounded edge. A negative offset is the outline equivalent.

- [ ] **Step 4: Delete the 4 decorative glows**

The `0 6px 24px`, `0 0 14px` and `0 0 12px` shadows are removed with no replacement — spec §4.1. Open each site: if the element is volt-filled it already inverts, and **inversion is the emphasis**. If removing the shadow leaves a rule with no declarations, delete the rule.

- [ ] **Step 5: Fix the ring on volt surfaces**

Find every control that is **volt-filled** and also focusable — primary buttons and the selected segment of a segmented control are the certain ones:

```bash
cd frontend && graphify query "primary button volt fill segmented control selected"
```

On those, and only those, the ring must invert:

```css
&:focus-visible { outline: 2px solid var(--focus-inv); outline-offset: 2px; }
```

A volt ring on a volt button is invisible, and this is the highest-traffic control in the product.

- [ ] **Step 6: Delete the `--red-glow` token**

Remove the `--red-glow` line from `_tokens.scss`. Then:

```bash
cd frontend && grep -rn -- '--red-glow' src
```

Expected: **no output.**

- [ ] **Step 7: Verify the ring by keyboard, not by reading CSS**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && docker compose -f docker/docker-compose.yml up -d --build
```

Open `http://localhost/app`, log in as `admin@demo.io` / `boxhub-demo-2026`, and **press Tab through a form and a primary button.** Confirm the ring is visible on both, including on the volt-filled button. A screenshot of the focused primary button goes in the task report.

This is a manual check on purpose: Karma renders components without the global stylesheet's cascade, so it cannot see a focus ring that lost to `outline: none`.

- [ ] **Step 8: Suite, build, commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
```bash
cd frontend && npx ng build --configuration production
```
```bash
git add -A frontend/src
git commit -m "feat(design): focus rings become outlines, decorative glow deleted

--red-glow was 51 focus rings and 4 decorative glows. The rings become
solid 2px outlines - more visible, and they survive forced-colors mode.
The decorative four are removed with no replacement: those elements
already invert, and inversion is the emphasis.

The ring inverts to --focus-inv on volt-filled controls. A volt ring on
a volt button is invisible, and that is the primary button on every
screen in the product. Verified by tabbing the running app, because
Karma renders without the global cascade and cannot see a ring that lost
to outline: none.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Split error states off the accent onto `--danger`

The judgment task. Under the old law `--red` was both the brand accent and the only warm signal, so error states borrowed the brand colour — `color: var(--red)` alone appeared **84 times**. After Task 3 those all say `--volt`, which now means *primary*. Every one that actually meant *this failed* is currently lying.

**Files:** the subset of Task 3's 53 files where volt is used for an error, a destructive action, or a validation failure.

**Interfaces:**
- Consumes: `--danger` from Task 1.
- Produces: `--red` and `--on-red` are deleted from `_tokens.scss`; nothing in `frontend/src` references them.

- [ ] **Step 1: Find every candidate**

```bash
cd frontend && grep -rn 'volt' src --include='*.ts' --include='*.scss' --include='*.html' | grep -i 'err\|fail\|invalid\|danger\|delete\|remove\|destruct\|warn\|revoke\|cancel'
```

This finds sites whose *surrounding* names suggest failure. It is a starting list, not the answer — **read each one in its component**.

- [ ] **Step 2: Classify each site by what it means, not by what it looks like**

Move to `--danger` when the element means **something went wrong or something will be destroyed**: validation messages, inline save errors, fetch-failure states, `Delete`/`Remove`/`Revoke`/`Suspend` buttons and their confirmations.

Keep `--volt` when the element means **primary, live, now, or winning**: the primary action of a form (even a form that can fail), the live indicator, the leading leaderboard row, the current workout line, active navigation.

**The ambiguous case, decided here so it is not decided three different ways:** a *destructive primary* — the confirm button inside a "Delete this class?" dialog — is `--danger`, not volt. The screen's one volt element is spent elsewhere or not at all; a volt confirm button on a destroy dialog invites the click you least want.

- [ ] **Step 3: Apply, one component at a time, and list them in the task report**

For each file changed, the report names the file and the reason in a few words — `invites.page.ts: inline send-failure message`. A reviewer needs to check the judgment, and they cannot do that from a diff of colour tokens.

- [ ] **Step 4: Delete the transitional aliases**

Remove the `--red` and `--on-red` lines from `_tokens.scss`, along with the `TRANSITIONAL` comment block.

- [ ] **Step 5: The completion test**

```bash
cd frontend && grep -rni -- '--red\|--on-red\|saira' src angular.json package.json
```

Expected: **no output at all.** This single command is the migration's completion test for Tasks 1, 3, 4 and 5 together.

- [ ] **Step 6: Suite, build, commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
```bash
cd frontend && npx ng build --configuration production
```
```bash
git add -A frontend/src
git commit -m "feat(design): errors move to --danger, freeing volt to mean primary

Under the old law --red was both the brand accent and the only warm
signal available, so error states borrowed the brand colour:
color: var(--red) appeared 84 times, mixing 'this is primary' with
'this is broken'. Red now means danger and nothing else, which is the
first time in this codebase it has meant anything at all.

Decided once here so it is not decided three ways later: a destructive
primary - the confirm button in a delete dialog - is --danger, not volt.
A volt confirm button invites the click you least want.

The transitional aliases are gone; grep for --red, --on-red or saira
across frontend/src now returns nothing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: The wordmark, the mark, and the favicon

**The logo is type, not an asset.** It renders in the product's own webfont, themes and scales for free, and needs no export pipeline. Only the favicon has to be a file, and it is hand-drawn so it carries no font dependency at all.

**Files:**
- Create: `frontend/src/app/ui/wordmark.component.ts`
- Create: `frontend/public/favicon.svg`
- Delete: `frontend/public/favicon.ico`
- Modify: `frontend/src/index.html` (line 10, the icon link)

**Interfaces:**
- Produces: `<bh-wordmark [variant]="'chrome' | 'hero'" [size]="'sm' | 'md' | 'lg'" />`, standalone, imported wherever the logo appears.

- [ ] **Step 1: Write the component**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BRAND_NAME } from '../core/brand';

/**
 * The rxed wordmark: "rx" plain, "ed" inside the volt highlighter block — the same inversion
 * device the rest of the product runs on, so the logo is not a separate visual idea.
 *
 * It is type rather than an SVG asset, so it renders in the product's own webfont, inherits
 * the tokens, and scales without an export step.
 *
 * `variant` is not decoration. A volt-filled logo in the app header is a second volt element
 * competing with the screen's actual primary action, which design law v3 §2.3 forbids — so app
 * chrome gets `chrome` (monochrome bone) and only login, mail, the landing site and the TV idle
 * screen get `hero`. See spec §10.2.
 */
@Component({
  selector: 'bh-wordmark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="wm" [class.hero]="variant() === 'hero'" [attr.data-size]="size()">
      <span class="a">rx</span><span class="b">ed</span>
      <span class="sr">{{ brand }}</span>
    </span>
  `,
  styles: [`
    .wm { display: inline-flex; align-items: baseline; font-family: var(--font-mono);
      font-weight: 700; letter-spacing: -0.05em; line-height: 1; color: var(--bone);
      user-select: none; }
    .wm[data-size="sm"] { font-size: var(--fs-h2); }
    .wm[data-size="md"] { font-size: var(--fs-display); }
    .wm[data-size="lg"] { font-size: var(--fs-hero); }
    .b { background: var(--bone); color: var(--ground); padding: 0.06em 0.1em;
      border-radius: var(--r-xs); margin-left: 0.02em; }
    .wm.hero { color: var(--bone); }
    .wm.hero .b { background: var(--volt); color: var(--on-volt); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class WordmarkComponent {
  readonly variant = input<'chrome' | 'hero'>('chrome');
  readonly size = input<'sm' | 'md' | 'lg'>('sm');
  protected readonly brand = BRAND_NAME;
}
```

The visually-hidden `<span class="sr">` carries the brand name for screen readers and for anything that reads the accessible name — the visible letters are split across two elements and would otherwise announce as two words.

**`BRAND_NAME` is `'BoxHub'` until Task 7 changes it.** That is correct ordering: this component reads the constant rather than hardcoding, so Task 7 fixes it everywhere at once. The visible glyphs are deliberately literal — the wordmark is a drawn shape that happens to be made of letters, not a rendering of a variable.

- [ ] **Step 2: Verify `ChangeDetectionStrategy` matches the codebase**

Run: `graphify query "component change detection strategy"` and open two existing `ui/` components.

M13a's Angular 22 migration pinned all 56 components to `ChangeDetectionStrategy.Eager`. **If the existing components use `Eager`, use `Eager` here too** and note it in the task report — matching the surrounding code matters more than being right ahead of schedule, and dropping the pin is a filed M13c task covering all 56 at once. **Do not mix the two.**

- [ ] **Step 3: Draw the favicon**

Create `frontend/public/favicon.svg`. Hand-drawn paths, no `<text>` element — an SVG favicon cannot load a webfont, so `<text>` would render in whatever mono the browser picks.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#dfff4e"/>
  <!-- r -->
  <rect x="6" y="11" width="4" height="14" fill="#0d110e"/>
  <rect x="9" y="11" width="6" height="4" fill="#0d110e"/>
  <!-- x -->
  <path d="M17 11h4.4l2.1 3.6 2.1-3.6H30l-4.2 6.6L30 25h-4.4l-2.1-3.8L21.4 25H17l4.2-7.4z"
        fill="#0d110e"/>
</svg>
```

The hexes are literal here and that is sanctioned: an SVG asset loaded via `<link rel="icon">` is outside the document, so it cannot read a CSS custom property. Note it in the file's sibling docs, not as a token violation.

- [ ] **Step 4: Point `index.html` at it and delete the old icon**

`frontend/src/index.html:10` currently reads:

```html
<link rel="icon" type="image/x-icon" href="favicon.ico">
```

Replace with:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```

```bash
git rm frontend/public/favicon.ico
```

SVG favicons are supported by every browser this product targets. `apple-touch-icon`, a web manifest and `theme-color` are **not** added here — spec §10.2 files them rather than smuggling them in.

- [ ] **Step 5: Check it renders at 16px**

Rebuild the stack and open `http://localhost/app`. **Look at the browser tab.** The two letters must be distinguishable, not a green smear. Screenshot goes in the task report.

If they smear, **escalate** — the fix is a heavier or wider drawing, which is a design decision, not an executor's call.

- [ ] **Step 6: Suite, build, commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
```bash
cd frontend && npx ng build --configuration production
```
```bash
git add -A frontend/src frontend/public
git commit -m "feat(brand): the wordmark as a component, and an SVG favicon

The logo is type, not an asset: it renders in the product's own webfont,
inherits the tokens, and needs no export step. 'rx' plain and 'ed' in
the highlighter block, which reads the name as the verb it is.

The variant input is not decoration. A volt-filled logo in the app
header is a second volt element competing with every screen's primary
action, so chrome renders monochrome and the volt cut is reserved for
login, mail, the landing site and the TV idle screen.

The favicon is hand-drawn rather than set in type, because an SVG
favicon cannot load a webfont and would fall back to whatever mono the
browser picks. Its hexes are literal by necessity - the file is outside
the document and cannot read a custom property.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Rename BoxHub → rxed

**Four real values.** The v2 roadmap's "18 user-facing occurrences, 9 in mail templates" is stale — M13a routed the templates through `messages.properties` with `{0}` brand parameters, so those strings are non-rendering Thymeleaf fallbacks.

**Files:**
- Modify: `frontend/src/app/core/brand.ts:17` — `BRAND_NAME`
- Modify: `frontend/src/index.html:8` — the pre-boot `<title>`
- Modify: `backend/src/main/java/com/boxhub/shared/Brand.java:17` — `Brand.NAME`
- Modify: `backend/src/main/resources/application.yml:68` — the `BOXHUB_MAIL_FROM` default
- Modify: 8 mail templates — the `th:text` fallback strings only
- Check: `SecretDefaultsTest`, `MailTemplatesI18nTest`, `MailerLocaleResolutionTest`, `OAuth2RedirectUriTest`

- [ ] **Step 1: Change the four values**

```ts
export const BRAND_NAME = 'rxed';
```

```html
<title>rxed</title>
```

```java
public static final String NAME = "rxed";
```

```yaml
    from: ${BOXHUB_MAIL_FROM:rxed <no-reply@rxed.app>}
```

The sender domain moves with the name. `boxhub.local` was a placeholder; `rxed.app` is the real domain and this is only a *default* — production supplies `BOXHUB_MAIL_FROM`. The env var itself keeps its `BOXHUB_` name: internal namespaces do not change.

- [ ] **Step 2: Rewrite the two javadoc/comment blocks**

`brand.ts` and `Brand.java` both say a rename is "coming before M13b". It has happened. Rewrite both to describe the constant's purpose in the present tense, and keep the list of things that deliberately do **not** change (`BOXHUB_*`, `com.boxhub.*`, `bh-*`, database and image names, the `boxhub_tv_paired` key).

`application.yml:65-67`'s comment explaining that the literal must be hand-synced with `Brand.NAME` stays true and stays put.

- [ ] **Step 3: Update the 8 template fallbacks**

In each of `reset.html`, `register-attempt.html`, `email-change.html`, `invite.html`, `box-approved.html` (two occurrences), `box-rejected.html`, `verify.html`, the literal `BoxHub` inside the `th:text` element body becomes `rxed`. These never render — the real copy is `messages.properties` — so this is for the developers who read them.

- [ ] **Step 4: Check whether the four test files assert the string**

```bash
cd backend && grep -n 'BoxHub' src/test/java/com/boxhub/security/SecretDefaultsTest.java src/test/java/com/boxhub/shared/MailTemplatesI18nTest.java src/test/java/com/boxhub/shared/MailerLocaleResolutionTest.java src/test/java/com/boxhub/shared/OAuth2RedirectUriTest.java
```

Read every hit. A test that asserts the *brand string* updates. **A test that asserts brand strings are not hardcoded, or that the mail-from default is what it is, must not be weakened — if updating one looks like loosening it, stop and escalate.**

- [ ] **Step 5: Run both suites**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: **428 tests, 0 failures, 0 skips.** Takes about 102 seconds; no `rm -rf target` ritual is needed.

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src backend/src
git commit -m "feat(brand)!: BoxHub is now rxed

boxhub.com and boxhub.io were both unavailable. rxed.app is registered.

Four real values, not the eighteen the roadmap estimated: the frontend
constant, the pre-boot title, the backend constant, and the mail-from
default. M13a had already routed the mail templates through
messages.properties with {0} brand parameters, so the BoxHub strings
left in them are non-rendering Thymeleaf fallbacks - updated here for
the developers who read them, not for any user.

Internal namespaces deliberately unchanged: com.boxhub.*, BOXHUB_*,
bh-*, database and image names, boxhub_tv_paired. Nobody sees them and
churning them is risk for no gain.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: The mail accent

**Files:** the 8 mail templates under `backend/src/main/resources/templates/mail/` containing `#D7263D`.

- [ ] **Step 1: Find every occurrence with its context**

```bash
cd backend/src/main/resources/templates && grep -rn 'D7263D\|#fff\|#ffffff' mail/
```

`#D7263D` appears 8 times — the retired race red, pointing at a colour that now exists nowhere in the product.

- [ ] **Step 2: Replace, and fix the text colour on it**

`#D7263D` becomes `#dfff4e`. **Every `color:#fff` or `color:#ffffff` that sits on that accent becomes `#0d110e`.** White on volt is unreadable; this is the whole reason the swap is not a find-and-replace.

The known case is `box-approved.html:7`, whose CTA anchor carries `background:#D7263D;color:#fff`. **Check all eight** — read each, do not assume they share a shape.

- [ ] **Step 3: Verify in a real mail client**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && docker compose -f docker/docker-compose.yml up -d --build
```

Trigger a mail (registering a new account sends a verification mail) and open it in **Mailpit at `http://localhost:8025`**. Confirm the CTA button is legible. Screenshot goes in the task report.

Email cannot read CSS custom properties, so this is the one sanctioned place raw hex lives — and the only way to check it is to look at it.

- [ ] **Step 4: Backend suite and commit**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

```bash
git add -A backend/src/main/resources/templates
git commit -m "feat(design): mail accent moves to volt, with legible text on it

#D7263D appeared 8 times across the mail templates - the retired race
red, now pointing at a colour that exists nowhere else in the product.

Not a find-and-replace: the CTA set color:#fff on that accent, and white
on volt is unreadable. Text on the accent becomes #0d110e. Verified by
opening a real message in Mailpit, which is the only way to check
something no test renders.

Email clients cannot use CSS custom properties, so these hexes are the
one sanctioned exception to tokens-only. Centralising them is filed
against M16.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: The proof route and the WOD board

The hero half of the proof. Fabricated data inside the real application — real CSP, real self-hosted fonts, real tokens, real Angular. That is what makes it a proof rather than a picture: M5.5's font P0, where the brand faces 404'd for an entire milestone, is exactly the class of bug a static mockup cannot catch.

**Files:**
- Create: `frontend/src/app/features/dev/dev-gallery.page.ts` — the route's shell, with a nav between proofs
- Create: `frontend/src/app/features/dev/proof-wod-board.component.ts`
- Create: `frontend/src/app/features/dev/dev-gallery.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: every token from Task 1, `bh-wordmark` from Task 6.
- Produces: the route `/app/dev/components`, which Task 10 adds a second proof to and M13c grows into the full component gallery.

- [ ] **Step 1: Read the route file's conventions first**

Run: `graphify query "app routes lazy loadComponent guards"` then open `frontend/src/app/app.routes.ts` (87 lines).

Every route uses `loadComponent: () => import(...).then(m => m.X)`. Role-guarded routes use `canActivate: [roleGuard([...])]`. **The dev route takes no guard** — it renders fabricated data, makes no API call, and needs to be reachable on a real device against the real CSP, which is the entire point. It is unlisted and unlinked, and `docs/BACKLOG.md` already files its deletion at launch.

- [ ] **Step 2: Add the route**

```ts
{ path: 'dev/components', loadComponent: () => import('./features/dev/dev-gallery.page').then(m => m.DevGalleryPage) },
```

Place it with the other top-level routes, before the shell routes.

- [ ] **Step 3: Write the failing spec**

`frontend/src/app/features/dev/dev-gallery.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { DevGalleryPage } from './dev-gallery.page';

describe('DevGalleryPage', () => {
  it('renders the WOD board proof with a single volt-marked live line', async () => {
    await TestBed.configureTestingModule({ imports: [DevGalleryPage] }).compileComponents();
    const fixture = TestBed.createComponent(DevGalleryPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('[data-proof="wod-board"]').length).toBe(1);
    // The accent budget, asserted rather than trusted: exactly one line is live.
    expect(el.querySelectorAll('[data-live="true"]').length).toBe(1);
  });
});
```

The second assertion is the one that earns its keep: "one volt element per screen" is a rule nobody can enforce by eye once a screen grows, and this makes it a build failure.

- [ ] **Step 4: Run it and watch it fail**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './dev-gallery.page'`.

- [ ] **Step 5: Build the two components**

`proof-wod-board.component.ts` renders a WOD board against the language:

- panel on `--ground` with a **2px `--volt` border** — the one element on screen promoted to *subject*
- eyebrow in `.t-eyebrow` (mono, uppercase, tracked): the date and the class type
- the WOD name in `.t-display` (Archivo 800)
- a mono chip carrying the score type and cap, inverted: `--volt` fill, `--on-volt` text
- the movement lines in `var(--font-mono)`, reps bolder than movement names
- **exactly one line carrying `data-live="true"`**, rendered as a volt fill with `--on-volt` text — the highlighter marking where the class is now
- a leaderboard strip below it: rank and score in mono tabular, names in Archivo, leader row inverted

All strings are i18n-marked with `i18n` attributes, per the binding rule — the proof is new code and gets no exemption. Fabricated data is defined as a `readonly` array in the component, clearly named so nobody mistakes it for a fixture that talks to an API.

`dev-gallery.page.ts` is a thin shell: a `bh-wordmark`, a heading, and the proof components stacked. Task 10 adds to it.

- [ ] **Step 6: Run the spec and watch it pass**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS, and the suite total goes up by 1.

- [ ] **Step 7: Look at it on a real device**

Rebuild the stack, open `http://localhost/app/dev/components`, **and open it on a phone on the same network.** Check that JetBrains Mono and Archivo actually loaded — if the fonts 404 under the real CSP, this screen is where it shows, and that is the specific bug this route exists to catch. Confirm in DevTools that the computed `font-family` resolves to the webfont, not a fallback. Screenshots, desktop and phone, in the task report.

- [ ] **Step 8: Build and commit**

```bash
cd frontend && npx ng build --configuration production
```
```bash
git add -A frontend/src
git commit -m "feat(design): the WOD board proof, at a dev-only route

The hero half of M13b's proof: fabricated data inside the real
application, so the direction is checked against the real CSP, the real
self-hosted fonts and the real tokens. M5.5's font P0 - the brand faces
404'd for a whole milestone - is precisely the class of bug a static
mockup cannot catch.

No product screen is touched. M13c rebuilds the component library and
M17 rebuilds the athlete surface; restyling the real board now means
building it twice.

The spec asserts exactly one live element on the screen. 'One volt
element' is a rule nobody enforces by eye once a screen grows, so it is
a build failure instead.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: The admin members proof

The plumbing half, and the more important one. A hero screen cannot prove the language stays calm; that failure — identity bleeding into ordinary screens — is a stated reason the previous direction was retired.

**Files:**
- Create: `frontend/src/app/features/dev/proof-admin-members.component.ts`
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`
- Modify: `frontend/src/app/features/dev/dev-gallery.page.spec.ts`

**Interfaces:**
- Consumes: Task 1's tokens and utility classes, Task 9's gallery shell.

- [ ] **Step 1: Extend the spec first**

Add to `dev-gallery.page.spec.ts`:

```ts
it('keeps the members proof calm — at most one volt element on the whole screen', async () => {
  await TestBed.configureTestingModule({ imports: [DevGalleryPage] }).compileComponents();
  const fixture = TestBed.createComponent(DevGalleryPage);
  fixture.detectChanges();
  const proof: HTMLElement = fixture.nativeElement.querySelector('[data-proof="admin-members"]');

  expect(proof).toBeTruthy();
  expect(proof.querySelectorAll('[data-accent="volt"]').length).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `proof` is null.

- [ ] **Step 3: Build the members proof**

A dense admin table against the language:

- a collapsible left sidebar in its **collapsed and expanded** states — icon-only with tooltips collapsed, mono uppercase section labels (`MAIN`, `SETTINGS`), nested items with indent guides, user card pinned bottom. Spec §9.
- a page header with the screen title in `.t-h2` and **exactly one** primary action carrying `data-accent="volt"`
- a search field and two filter selects, using the existing `.bh-input` / `.bh-select` globals
- a table: column headers in `.t-eyebrow-tight` (**not** `.t-eyebrow` — this is the density case §6.3 exists for), member names in Archivo, numbers in mono tabular, status as a quiet `--good` / `--warn` label with text beside it, never a fill
- rows hover by climbing one rung of the surface ladder, never by turning volt
- a `.bh-skel` loading row and an empty state, because §11.1 requires seven states and these are the two everyone forgets

**Include one German string among the fabricated rows** — a long status or plan name — so §12's translation penalty is visible in the proof rather than discovered in M15.

All strings i18n-marked.

- [ ] **Step 4: Run the spec and watch it pass**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Check it at three widths and by keyboard**

Open `http://localhost/app/dev/components` at **1440px, 768px and 375px**. The sidebar collapses, the table does not force the page body to scroll sideways (wide content scrolls inside its own container), and the German string does not blow the column out.

Tab through it. Every control shows a ring; the primary button's ring is `--focus-inv` and visible.

Screenshots at all three widths in the task report.

- [ ] **Step 6: Build and commit**

```bash
cd frontend && npx ng build --configuration production
```
```bash
git add -A frontend/src
git commit -m "feat(design): the admin members proof — the plumbing half

The more important half of the proof. A hero screen cannot demonstrate
that the language stays calm, and identity bleeding into ordinary
screens is one of the three stated reasons the previous direction was
retired.

Dense table, quiet semantics, one volt element on the whole screen, and
the spec asserts that upper bound rather than trusting it. Column
headers use the tight mono treatment, because monospaced uppercase at
0.18em plus a German translation penalty is a horizontal scrollbar on
the admin's main screen - so a German string sits in the fabricated data
where it can be seen.

Includes the skeleton and empty states, which are two of the seven
required states and the two everyone forgets.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Fix printing on the receipt page

A pre-existing bug this milestone stops being able to ignore. Verified 2026-08-06: `receipt.page.ts:82` is the page's entire print handling — `@media print { .no-print { display: none; } }`. Browsers drop background colours when printing, so the dark ground vanishes and the page prints `--bone` (near-white) text onto white paper.

**Files:**
- Modify: `frontend/src/app/features/receipt/receipt.page.ts`

- [ ] **Step 1: Read the whole component first**

Run: `graphify query "receipt page print payment"` then open `frontend/src/app/features/receipt/receipt.page.ts`. Note which elements carry `.no-print`, and which tokens the receipt body uses — **the print block has to override exactly those, and asserting a token that is not used there is how this gets shipped still broken.**

- [ ] **Step 2: Replace the print block**

Extend the existing `@media print` rule so the document inverts to ink-on-paper. Override the tokens **at the receipt's root element**, not on `:root` — a print rule that reaches `:root` is a light theme returning through the back door, and that is not what was agreed:

```css
@media print {
  .no-print { display: none; }
  :host {
    --ground: #ffffff;
    --surface: #ffffff;
    --surface-2: #ffffff;
    --hairline: #cccccc;
    --bone: #000000;
    --bone-dim: #333333;
    --faint: #555555;
    --volt: #000000;
    --on-volt: #ffffff;
  }
}
```

`--volt` going to black is deliberate: a volt accent on white paper is illegible, and a receipt has no live element to mark.

**If the receipt renders through a global class rather than `:host`, use whatever its actual root selector is** — read the component, do not assume.

- [ ] **Step 3: Print it to PDF and look at the PDF**

Rebuild the stack, sign in as `admin@demo.io`, record a payment for a member, open the receipt at `/app/receipts/:paymentId`, and print to PDF from the browser.

**Open the PDF.** Confirm black text on white, no black rectangle, no invisible text, and that the buttons are gone. The PDF or a screenshot of it goes in the task report.

There is no automated instrument for this. Karma cannot evaluate `@media print`, and asserting the CSS text would only prove the string exists.

- [ ] **Step 4: Suite, build, commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
```bash
cd frontend && npx ng build --configuration production
```
```bash
git add frontend/src/app/features/receipt/receipt.page.ts
git commit -m "fix(receipt): print as ink on paper instead of invisibly

Pre-existing, and older than this milestone. The page's entire print
stylesheet hid the buttons; browsers drop background colours when
printing, so it has always printed near-white text onto white paper.
Boxes use this page for bookkeeping.

Dark-only does not cause the bug, it removes the imaginary workaround -
'the user could switch themes first' - that kept it unexamined.

The overrides are scoped to the receipt's root, not :root. A print rule
reaching :root is a light theme returning through the back door.
Verified by printing to PDF and opening it, because Karma cannot
evaluate @media print and asserting the CSS text would only prove the
string exists.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Documentation

The last task, so it describes what actually shipped rather than what was planned.

**Files:**
- Rewrite: `DESIGN.md` (repo root, currently 67 lines)
- Modify: `CLAUDE.md` (the "Design rules" block)
- Modify: `PRODUCT.md` (brand and palette references)
- Modify: `docs/HANDOFF.md` (Status, Immediate next step, test counts)
- Modify: `docs/BACKLOG.md`
- Modify: `.superpowers/sdd/progress.md` (task → SHA ledger)

- [ ] **Step 1: Rewrite `DESIGN.md`**

It currently describes warm espresso, race red, `--edge: 4px` and a first-class light theme. Rewrite it to describe the shipped system, keeping its existing shape (Theme / Color / Typography / Spacing & Shape / Effects / Components / Layout / Motion / Hard rules) so anyone who knows the file can still navigate it.

It **describes**; `_tokens.scss` **defines**; the spec is **binding**. Point at both.

- [ ] **Step 2: Update `CLAUDE.md`'s design block**

Every one of these bullets is now wrong and must be replaced, not amended:

- "Warm dark is the home theme (`--ground: #17120D`, never cold blue-black). Light theme is first-class but dark is default."
- "Race red (`--red`) is the only accent"
- "Glow is rationed — primary-button hover, live indicator, focus ring."
- The design-law reference now points at `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`.

Add the rules that did not exist before: dark only, volt bounded by area, mono is the prescription voice and banned from prose, the focus ring inverts on volt.

- [ ] **Step 3: Update `docs/HANDOFF.md`**

Add M13b to Status with what shipped. Replace "Immediate next step" with M13c, and carry forward the two things still owed by the user: **the coach programming tour, which blocks M14's spec**, and nothing else — the brand name is now settled.

Record the **real** test counts from the final run. Frontend is no longer 184: Task 2 removed `theme.service.spec.ts` and Tasks 9–10 added specs. **Report the number the suite prints, not an arithmetic guess.**

- [ ] **Step 4: Update `docs/BACKLOG.md`**

- The "→ M13c Component library — Angular 22 compatibility shims" section grows the `ChangeDetectionStrategy.Eager` note if Task 6 confirmed the codebase still pins it.
- The Launch → Production entry for deleting `/app/dev/components` is now real rather than forward-looking — the route exists.
- File **the categorical chart palette** (spec §17) against M16, with its constraints: new hues, must not reuse `--good`/`--warn`/`--danger`, 4.5:1 on `--ground`, distinguishable from volt.
- File `apple-touch-icon` / web manifest / `theme-color` as a small Launch item.
- File the **three standing `anyComponentStyle` budget warnings** found during Task 1 and confirmed
  pre-existing: `instance-builder.page.ts` (+456 B), `tv-shell.page.ts` (+256 B) and
  `progress.page.ts` (+17 B) all exceed the 4 kB component-style warning budget (the 8 kB *error*
  budget is not breached, which is why the build is green). Each of those screens is rebuilt in a
  later milestone — M14, Project 2 and M17 respectively — so the fix is not to raise the budget but
  to let the rebuild shrink them. Filed because a build that prints three warnings nobody has
  recorded is a build that trains people to stop reading warnings.
- The M16 entry about mail templates duplicating `#D7263D` updates to the volt hex.

- [ ] **Step 5: Update the progress ledger**

Add an M13b section to `.superpowers/sdd/progress.md` mapping each task to its commit SHA, in the format the M12c and M13a sections already use. **Open the file and match the existing format** rather than inventing one.

- [ ] **Step 6: Full gate run before the milestone closes**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
```bash
cd frontend && npx ng build --configuration production
```
```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d --build
```
```bash
cd e2e && npx playwright test
```

Expected: frontend green, build exit 0, backend **428 / 0 failures / 0 skips**, e2e **28 passing at `retries: 0`**.

The e2e suite includes the **font smoke test** added after M5.5's P0. It is the gate that matters most here: the font swap is exactly the change that test exists to catch.

`down -v` is mandatory before the e2e run — the seeder self-skips when the demo box already exists, and `runner`/`tv` specs are not idempotent.

**A local green is not the gate. Check the CI run after pushing.** M13a passed 28/28 locally and went red on CI.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(m13b): design law v3 through the milestone gate

DESIGN.md rewritten, CLAUDE.md's design block replaced rather than
amended - warm dark, race red, rationed glow and a first-class light
theme were four separate binding rules and all four are now wrong.

Hand-off carries the real suite counts from the final run rather than
arithmetic: Task 2 removed a spec and Tasks 9-10 added some.

Filed rather than solved, so it is not discovered mid-milestone: this
palette has one accent and three semantics that all already mean
something, so it cannot draw a chart, and M16 and M18 both ship
analytics.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** — every section of design law v3 maps to a task:

| Spec | Task |
|---|---|
| §2.1 dark only, §3 colour, §3.2 `color-scheme`/`::selection`, §5.1 skeleton, §6.1 faces, §6.3 scale, §7 radius | 1 |
| §2.1 the deletion itself | 2 |
| §3.1 red freed, §14.4 rename | 3, 5 |
| §4.1 glow deleted, §11.2 ring on volt | 4 |
| §10.2 wordmark, mark, favicon | 6 |
| §10.1, §10.3 rename | 7 |
| §10.4 mail accent | 8 |
| §4 devices, §8 hero surfaces, §15 proof-not-redesign | 9 |
| §9 shells, §6.3 table density, §11.1 seven states, §12 i18n | 10 |
| §3.2 print | 11 |
| §14.8–10 docs, §17 filed items | 12 |
| §11 accessibility | 4, 9, 10 — verified by keyboard, not asserted |

**Not covered, deliberately:** §17's open items (chart palette, TV type scale, icon set) are filed in Task 12, not built. §9's admin SaaS shell is *drawn in the proof* (Task 10), **not applied to the live admin shell** — §15 forbids redesigning a product screen here.

**Type consistency:** `--focus` / `--focus-inv` are defined in Task 1 and consumed in Tasks 4, 9, 10. `.t-eyebrow-tight` is defined in Task 1 and consumed in Task 10. `bh-wordmark`'s `variant` / `size` inputs are defined in Task 6 and consumed in Task 9. `data-live` / `data-accent` / `data-proof` attributes are asserted in Tasks 9–10's specs and produced by the same tasks' components.

**Ordering hazard, stated once:** Tasks 1→3→4→5 must run in order. Task 1's transitional aliases are what keep the application coherent in between, and Task 5 deletes them. Running 5 before 3 leaves 53 files referencing tokens that no longer exist.

**Where this plan is not TDD, and why.** Tasks 1, 3, 4, 8 and 11 change presentation, and no honest unit test asserts them — a spec asserting a hex is a spec asserting the token file to itself. Their real instruments are the production build, a grep that must return nothing, and looking at the result: a keyboard-tab for the focus ring, Mailpit for the mail accent, a printed PDF for the receipt. Tasks 9 and 10 are properly test-first, and their tests assert the rule most likely to erode — the accent budget — rather than the appearance.

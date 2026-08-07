# M13c — Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a component folder half of which nothing renders with 18 `bh-*` components built against design law v3, migrate the 79 global-CSS call sites onto them, and prove the whole set with a gallery, axe-core and visual regression.

**Architecture:** Components live flat in `frontend/src/app/ui/`, one file each, no barrel. The global stylesheet's control CSS (`.bh-input`, `.bh-select`, `.bh-table`, `.bh-dock`) is *absorbed* into components rather than wrapped, so there is exactly one implementation of each control. Rebuilt components use signal inputs and drop M13a's `ChangeDetectionStrategy.Eager` pin; the 45 feature components keep it. Every user-facing pixel that changes does so because a component moved, never because a screen was redesigned.

**Tech Stack:** Angular 22.1.0, TypeScript 6.0.3, SCSS with CSS custom properties, Karma/Jasmine (182 specs), Playwright 1.61.1 (28 e2e + 1 skipped), `lucide-static@1.28.0` (ISC) for icon geometry, `@axe-core/playwright@4.12.1`.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` and design law v3 (`docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`).

- **Design law v3 is binding and is not restated here. Read it before starting any task.** Where this plan and either spec disagree, **stop and escalate to the orchestrator** — do not reconcile them yourself.
- **Tokens only.** A raw hex outside `frontend/src/styles/_tokens.scss` is a bug. The only sanctioned exceptions are the HTML mail templates and `receipt.page.ts`'s `@media print` block.
- **Volt means live / now / primary / winning, and nothing else.** Plumbing screens get exactly one volt element: the primary action. A volt fill may be a row, chip, button, bar or badge — **never a card, panel, page background or sheet**.
- **`--danger` may fill a button or a chip**, never a row/card/panel. `--on-danger` is dark (`#0d110e`), not white — white on `--danger` is 3.9:1 and fails AA.
- **Focus ring:** `outline: 2px solid var(--focus); outline-offset: 2px`, and `var(--focus-inv)` when the focused element sits **on a volt surface**.
- **No glow, no gradients, no shadows on flat surfaces.** Shadows only on things that float: the dock, `bh-sheet`, dialogs.
- **Mono (`--font-mono`) is the prescription voice and is banned from prose.** Archivo carries anything written or named.
- **Every interactive component owes seven states:** default, hover, focus, active, disabled, loading, error. A component that cannot have a state says so in its gallery section rather than omitting it.
- **`--tap: 44px` minimum** on every interactive target. `prefers-reduced-motion` alternative for every animation. Colour is never the only signal.
- **Signal inputs only in `frontend/src/app/ui/`** — `input()`, `input.required()`, `model()`, `output()`. No `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager`. Feature screens keep their decorators; do not convert them.
- **i18n:** every user-facing string in a component is marked, with explicit ids of the shape **`@@ui.<component>.<element>`**. Template text uses the `i18n` attribute (`i18n-aria-label` for an aria-label); TypeScript strings use `$localize`. Proper nouns are NOT marked. No new hardcoded user-facing string, ever.
- **No screen is redesigned.** Migrations are markup swaps producing the same information in the same layout. **"Migrate the call sites" means the global-CSS call sites only** — `.bh-input`, `.bh-select`, `.bh-table`, `.bh-dock`. Per-component classes that merely look alike (`class="err"`, `class="empty"`) are **not** in scope; see spec §3.7.
- **No backend change. No Flyway. Next migration stays V19.**
- **Gates.** `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless` (~13s; bare `npm test` HANGS in watch mode). `ng build --configuration production` is the **only** gate that type-checks Angular templates. **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's, and `PIPESTATUS` does not behave as in bash. Redirect to a file, check `$?` on the next line. **macOS has no `timeout`.** `sed -i ''` is the macOS form.
- **Before any stack command:** `cp docker/.env.example docker/.env`.
- **Executors: run `graphify query "<question>"` before reading or grepping source files** — a hook enforces it.
- **Git hygiene: never `git add` a path you did not change, and never run `git commit` while another change is staged.** `git commit` takes the whole index; in M13b a commit labelled "docs" silently swallowed 89 lines of deleted TypeScript.
- **Escalate, never improvise.** Blocked, ambiguous, or the plan contradicts what is actually in the file → return the question to the orchestrator. Do not widen a rule, retire a test, loosen a gate, or bend production code to match a brief. Roughly half the briefs written in M13a and M13b contained a factual error, and every one was caught this way.

### Three e2e selectors that must survive

These are asserted by the Playwright suite and are load-bearing. Changing them turns a green suite red for no product reason:

- `button[aria-label="Next day"]` and `button[aria-label="Previous day"]` — `bh-day-pager` (`booking-flow.spec.ts:25,42`, `memberships.spec.ts:99`). Marking them `i18n-aria-label` is fine: the English value is unchanged.
- `button[aria-label="Log out"]` — the coach and admin shells (`onboarding.spec.ts:99`).
- `data-testid="admin-security-link"` and `data-testid="coach-security-link"` — the shells' settings link.

---

## File Structure

**New — `frontend/src/app/ui/`** (one file per component, plus a `.spec.ts` each)
- `icon.component.ts` — the lucide set and the `IconName` union (Task 1)
- `field.component.ts`, `select.component.ts`, `panel.component.ts` (Task 3)
- `alert.component.ts`, `empty.component.ts` (Task 4)
- `data-table.component.ts` (Task 5)
- `shell-header.component.ts`, `dock.component.ts` (Task 6)
- `segmented.component.ts`, `switch.component.ts` (Task 7)
- `search-bar.component.ts` (Task 8)

**Rebuilt — `frontend/src/app/ui/`**
- `button.component.ts` (Task 2) · `avatar.component.ts`, `pill.component.ts`, `day-pager.component.ts` (Task 9) · `wordmark.component.ts` (Task 9, verify only)

**Deleted**
- `ui/stat.component.ts`, `ui/board-row.component.ts`, `ui/tag.component.ts` (Task 9)
- `ui/field.component.ts` is *replaced*, not deleted — same path, new contents (Task 3)
- `frontend/src/styles/_table.scss` (Task 5); `.bh-input` / `.bh-select` from `styles.scss` (Task 3); `.bh-dock*` from `styles.scss` (Task 6)

**Screens touched — mechanically, no redesign**
- 7 `.bh-table` screens (Task 5) · 3 shells (Task 6) · `score-form.component.ts` (Task 7) · 3 search screens (Task 8) · whichever screens use `.bh-input` / `.bh-select` (Task 3)

**Gallery** — `frontend/src/app/features/dev/dev-gallery.page.ts` plus per-component sections (Task 11)

**Config** — `frontend/angular.json` budgets (Task 10), `frontend/package.json` (Tasks 1, 12), `e2e/playwright.config.ts` (Task 13)

**Tests** — `e2e/tests/a11y.spec.ts` (Task 12), `e2e/tests/visual.spec.ts` (Task 13)

**Docs** (Task 14) — `DESIGN.md`, `docs/HANDOFF.md`, `docs/BACKLOG.md`, `.superpowers/sdd/progress.md`

---

### Task 1: `bh-icon` — the icon set

Everything that renders an icon depends on this, so it goes first. The BACKLOG's complaint is exact: Unicode glyphs read as a placeholder system, and the shells prove it — `▮▮` means Home, `$` means Plan.

**Files:**
- Create: `frontend/src/app/ui/icon.component.ts`
- Create: `frontend/src/app/ui/icon.component.spec.ts`
- Modify: `frontend/package.json` (add `lucide-static` as a **devDependency** — its SVGs are copied at authoring time; nothing ships from it at runtime)

**Interfaces:**
- Produces: `IconComponent` (`selector: 'bh-icon'`), and the exported type
  ```ts
  export type IconName =
    | 'house' | 'calendar' | 'calendar-plus' | 'clipboard-list' | 'dumbbell'
    | 'trending-up' | 'credit-card' | 'users' | 'layout-grid' | 'plus'
    | 'ellipsis' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down'
    | 'check' | 'x' | 'arrow-right' | 'arrow-left' | 'settings' | 'log-out'
    | 'lock' | 'search' | 'triangle-alert' | 'circle-alert' | 'info' | 'inbox';
  ```
  Inputs: `name = input.required<IconName>()`, `size = input(20)`.
- Consumed by: Tasks 3, 4, 5, 6, 8, 9.

- [ ] **Step 1: Install the geometry source**

```bash
cd frontend && npm install --save-dev lucide-static@1.28.0
```

Expected: `package.json` `devDependencies` gains `"lucide-static": "1.28.0"`. Verified 2026-08-06: version 1.28.0, licence ISC, ships 2007 SVGs under `node_modules/lucide-static/icons/`.

- [ ] **Step 2: Read the 27 source SVGs**

```bash
cd frontend && for n in house calendar calendar-plus clipboard-list dumbbell trending-up \
  credit-card users layout-grid plus ellipsis chevron-left chevron-right chevron-up \
  chevron-down check x arrow-right arrow-left settings log-out lock search \
  triangle-alert circle-alert info inbox; do
  echo "=== $n ==="; cat "node_modules/lucide-static/icons/$n.svg"; done
```

All 27 names were verified to exist on 2026-08-06. **If any file is missing, stop and escalate** — do not substitute a similar icon, because the name is part of the public type.

Each file looks like this (`house.svg`, verbatim):

```html
<!-- @license lucide-static v1.28.0 - ISC -->
<svg class="lucide lucide-house" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
</svg>
```

**Copy the child elements verbatim.** Do not retype, round, or "tidy" any `d` attribute — a hand-edited path is a silently wrong icon. Note that not every icon is paths only: `users.svg` ends with `<circle cx="9" cy="7" r="4" />`. Copy whatever children the file has.

- [ ] **Step 3: Write the failing test**

Create `frontend/src/app/ui/icon.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  standalone: true,
  imports: [IconComponent],
  template: `<bh-icon name="house" [size]="24" /><bh-icon name="users" />`,
})
class Host {}

describe('IconComponent', () => {
  it('renders inline SVG geometry, sized and decorative', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const svgs = f.nativeElement.querySelectorAll('svg');

    expect(svgs.length).toBe(2);
    // Geometry is real, not an empty shell.
    expect(svgs[0].querySelectorAll('path, circle, line, polyline, rect').length).toBeGreaterThan(0);
    expect(svgs[1].querySelectorAll('path, circle, line, polyline, rect').length).toBeGreaterThan(0);
    // Icons never carry meaning on their own (law §11).
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    // Colour follows text, so one component works on every surface including a volt fill.
    expect(svgs[0].getAttribute('stroke')).toBe('currentColor');
    expect(svgs[0].getAttribute('width')).toBe('24');
    expect(svgs[1].getAttribute('width')).toBe('20'); // default
  });

  it('renders DIFFERENT geometry for different names', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const svgs = f.nativeElement.querySelectorAll('svg');
    // Negative control: without this, a @switch with a broken default renders one icon for
    // every name and every other assertion above still passes.
    expect(svgs[0].innerHTML).not.toBe(svgs[1].innerHTML);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t1.log 2>&1; echo "exit=$?"
```

Expected: FAIL — `Cannot find module './icon.component'`.

- [ ] **Step 5: Write the component**

Create `frontend/src/app/ui/icon.component.ts`. The shape is a single `@switch` with the copied children per case — verbose, but it needs no `DomSanitizer` bypass, no namespace workaround, and no runtime dependency:

```ts
import { Component, input } from '@angular/core';

/**
 * The product's icon set. Geometry is lucide (lucide-static@1.28.0, ISC), copied at authoring time
 * into this template — there is no runtime dependency, nothing is fetched, and the CSP is not
 * involved. Replaces the Unicode placeholder glyphs the BACKLOG flagged, where "▮▮" meant Home.
 *
 * Icons are ALWAYS aria-hidden and always accompanied by a text label: design law §11 says colour
 * is never the only signal, and a glyph is not either.
 *
 * Adding an icon is three lines: the name in IconName, a @case here with the children copied
 * verbatim from node_modules/lucide-static/icons/<name>.svg. Never retype a `d` attribute.
 */
export type IconName =
  | 'house' | 'calendar' | 'calendar-plus' | 'clipboard-list' | 'dumbbell'
  | 'trending-up' | 'credit-card' | 'users' | 'layout-grid' | 'plus'
  | 'ellipsis' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down'
  | 'check' | 'x' | 'arrow-right' | 'arrow-left' | 'settings' | 'log-out'
  | 'lock' | 'search' | 'triangle-alert' | 'circle-alert' | 'info' | 'inbox';

@Component({
  selector: 'bh-icon',
  standalone: true,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('house') {
          <!-- children copied verbatim from node_modules/lucide-static/icons/house.svg -->
        }
        @case ('calendar') {
          <!-- … one @case per IconName, children copied verbatim … -->
        }
      }
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; }
    svg { display: block; }
  `],
})
export class IconComponent {
  name = input.required<IconName>();
  size = input(20);
}
```

**Every one of the 27 names needs a `@case`.** There is deliberately no `@default`: a name outside the union cannot type-check, and a silent fallback icon is worse than an empty one.

- [ ] **Step 6: Run the tests**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t1.log 2>&1; echo "exit=$?"
```

Expected: `exit=0`, **184 specs** (182 + 2).

- [ ] **Step 7: Verify every name renders — the gate that catches a missed `@case`**

The spec above proves two names differ. This proves all 27 are wired, which a spot check cannot:

```bash
cd frontend && for n in house calendar calendar-plus clipboard-list dumbbell trending-up \
  credit-card users layout-grid plus ellipsis chevron-left chevron-right chevron-up \
  chevron-down check x arrow-right arrow-left settings log-out lock search \
  triangle-alert circle-alert info inbox; do
  grep -q "@case ('$n')" src/app/ui/icon.component.ts || echo "MISSING CASE: $n"; done
```

Expected: **no output.** Any line printed is a name in the type with no geometry behind it — it would render an empty `<svg>` and pass every other check.

- [ ] **Step 8: Production build**

```bash
cd frontend && ng build --configuration production > /tmp/m13c-t1-build.log 2>&1; echo "exit=$?"
```

Expected: `exit=0`, with the **three known pre-existing** `anyComponentStyle` warnings (`instance-builder.page.ts`, `tv-shell.page.ts`, `progress.page.ts`) and no others.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/ui/icon.component.ts frontend/src/app/ui/icon.component.spec.ts \
        frontend/package.json frontend/package-lock.json
git commit -m "feat(ui): add bh-icon, replacing the placeholder glyph set

Geometry is lucide (lucide-static@1.28.0, ISC) copied into the template at
authoring time. No runtime dependency, nothing fetched, CSP uninvolved.
27 icons, one @switch case each, no @default — a name outside the union
cannot type-check, and a silent fallback icon is worse than an empty one."
```

---

### Task 2: `bh-button` — rebuilt, with the loading state it never had

32 files import this. The **public API must stay source-compatible** — `variant`, `size`, `type`, `disabled` keep their names and accepted values — so no call site changes. It gains `loading`, and `variant="icon"` so Task 6 can retire the shells' `.iconbtn` / `.theme`.

**Files:**
- Modify: `frontend/src/app/ui/button.component.ts` (full rewrite, currently 31 lines)
- Modify: `frontend/src/app/ui/button.component.spec.ts` (currently 21 lines)

**Interfaces:**
- Produces: `ButtonComponent`. `variant = input<'primary'|'ghost'|'danger'|'icon'>('primary')`, `size = input<'md'|'sm'>('md')`, `type = input<'button'|'submit'>('button')`, `disabled = input(false)`, `loading = input(false)`. Content is projected via `<ng-content />`.
- Consumed by: all 32 existing call sites unchanged, plus Tasks 4, 6, 8, 11.

- [ ] **Step 1: Read the current component and its spec**

```bash
cd frontend && cat src/app/ui/button.component.ts src/app/ui/button.component.spec.ts
```

The existing `:host(.full)` rules are load-bearing — screens apply `class="full"` to the host. **Keep them.**

- [ ] **Step 2: Write the failing tests**

Replace `frontend/src/app/ui/button.component.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  d = signal(false);
  l = signal(false);
}

describe('ButtonComponent', () => {
  let f: any;
  const btn = (): HTMLButtonElement => f.nativeElement.querySelector('button');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects content and defaults to a primary button', () => {
    expect(btn().textContent).toContain('Save');
    expect(btn().className).toContain('primary');
    expect(btn().type).toBe('button');
    expect(btn().disabled).toBe(false);
  });

  it('reacts to a changed input — signal inputs, not a cached decorator field', () => {
    f.componentInstance.v.set('danger');
    f.detectChanges();
    expect(btn().className).toContain('danger');
    expect(btn().className).not.toContain('primary');
  });

  it('loading disables the button and announces itself', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(btn().getAttribute('aria-busy')).toBe('true');
    // A pending save must not be submittable twice.
    expect(btn().disabled).toBe(true);
    // The label survives — a button that swaps its text for a spinner loses its accessible name.
    expect(btn().textContent).toContain('Save');
  });

  it('is not aria-busy when idle', () => {
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });

  it('disabled and loading are independent', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t2.log 2>&1; echo "exit=$?"
```

Expected: FAIL on the `loading` tests — `Can't bind to 'loading'`.

- [ ] **Step 4: Rewrite the component**

```ts
import { Component, input } from '@angular/core';

/**
 * The product's button. 32 call sites, so the input names and their accepted values are a public
 * API — `loading` and `variant="icon"` are additions, nothing was renamed.
 *
 * Seven states, per design law §11.1. `loading` is the one this component shipped without, and it
 * is the one that matters: every save in the product is a button that must show pending (§11.6).
 */
@Component({
  selector: 'bh-button',
  standalone: true,
  template: `
    <button [type]="type()" [class]="'btn ' + variant() + ' ' + size()"
            [disabled]="disabled() || loading()" [attr.aria-busy]="loading()">
      @if (loading()) { <span class="spin" aria-hidden="true"></span> }
      <ng-content />
    </button>`,
  styles: [`
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
      border: none; border-radius: var(--edge); font-family: var(--font-body);
      font-weight: 700; font-size: var(--fs-sm); letter-spacing: 0.01em; cursor: pointer;
      min-height: var(--tap); }
    .btn.sm { padding: 0 13px; }
    .btn.md { padding: 0 17px; }
    .btn.primary { background: var(--volt); color: var(--on-volt); }
    .btn.ghost { background: transparent; color: var(--bone); border: 1px solid var(--hairline); }
    /* Destructive confirms only — the click you least want. Never the action that merely OPENS a
       destroy flow; that one is a danger-bordered ghost, so the pair reads as an escalation. */
    .btn.danger { background: var(--danger); color: var(--on-danger); }
    /* Absorbs the shells' .iconbtn / .theme — the same control under two names in two files. */
    .btn.icon { background: transparent; color: var(--faint); min-width: var(--tap); padding: 0; }

    /* Hover is a rung on the surface ladder, never volt: a thing that turns volt has become
       live, and hovering it has not. Law §5. */
    .btn.ghost:hover:not(:disabled) { background: var(--surface-2); }
    .btn.icon:hover:not(:disabled) { color: var(--bone); background: var(--surface-2); }
    .btn.primary:hover:not(:disabled), .btn.danger:hover:not(:disabled) { filter: brightness(1.08); }
    .btn:active:not(:disabled) { transform: translateY(1px); }

    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn[aria-busy="true"] { cursor: progress; }

    .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A volt ring on the volt-filled primary is invisible — law §11.2, the single
       highest-traffic control in the product. */
    .btn.primary:focus-visible { outline-color: var(--focus-inv); }

    /* No gradient (law §2.4): the spinner is a ring with one transparent side. */
    .spin { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      border: 2px solid currentColor; border-right-color: transparent;
      animation: bh-spin 700ms linear infinite; }
    @keyframes bh-spin { to { transform: rotate(360deg); } }
    /* Reduced motion: the ring stays, it just stops. aria-busy still announces the state, so
       nothing is lost for anyone. */
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

    :host(.full) { display: block; }
    :host(.full) .btn { width: 100%; }
  `],
})
export class ButtonComponent {
  variant = input<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  size = input<'md' | 'sm'>('md');
  type = input<'button' | 'submit'>('button');
  disabled = input(false);
  loading = input(false);
}
```

- [ ] **Step 5: Run the tests**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t2.log 2>&1; echo "exit=$?"
```

Expected: `exit=0`, **188 specs** — 185, minus the 2 tests the old `button.component.spec.ts` held, plus 5. (Measured on `main`: button 2, day-pager 2, field 2, pill 1, sheet 5, timer 5. Task 1's review fix added a third icon spec, so every expectation from here on is one higher than this plan's first draft said.)

- [ ] **Step 6: Prove the 32 call sites still compile**

```bash
cd frontend && ng build --configuration production > /tmp/m13c-t2-build.log 2>&1; echo "exit=$?"
```

Expected: `exit=0`. This is the step that matters — Karma does not compile the screens, and `ng build` is the only gate that type-checks Angular templates. A renamed input would surface here as `NG8002`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/ui/button.component.ts frontend/src/app/ui/button.component.spec.ts
git commit -m "feat(ui): rebuild bh-button with loading, hover and an icon variant

Signal inputs, no Eager pin. The API is source-compatible: variant, size,
type and disabled keep their names and values, so none of the 32 call sites
change. Adds the loading state the component never had — every save in the
product is a button that must show pending (law §11.6) — plus the hover rung
and an icon variant that Task 6 uses to retire the shells' duplicated
.iconbtn / .theme.

Spinner is a ring with one transparent side, not a gradient (law §2.4), and
it stops rather than disappears under reduced motion."
```

---

### Task 3: `bh-field`, `bh-select`, `bh-panel` — and the end of `.bh-input`

`bh-field` exists and **nothing imports it**; the global `.bh-input` took its place, and the two drifted (`11px 13px` vs `9px 12px` padding, both claiming to be the app's text input). This task collapses them into one implementation and deletes the global classes.

**Files:**
- Modify: `frontend/src/app/ui/field.component.ts` (full rewrite, currently 33 lines)
- Modify: `frontend/src/app/ui/field.component.spec.ts` (currently 23 lines)
- Create: `frontend/src/app/ui/select.component.ts`, `frontend/src/app/ui/select.component.spec.ts`
- Modify: `frontend/src/app/ui/panel.component.ts` (currently 12 lines)
- Modify: `frontend/src/styles.scss` — delete the `.bh-input` / `.bh-select` block (currently lines 21–27)
- Modify: every screen using `class="bh-input"` or `class="bh-select"` — enumerate with the Step 1 command, do not work from a remembered list

**Interfaces:**
- Produces: `FieldComponent` — `label = input('')`, `type = input('text')`, `value = model('')`, `placeholder = input('')`, `error = input<string | undefined>(undefined)`, `disabled = input(false)`.
- Produces: `SelectComponent` — `label = input('')`, `value = model('')`, `disabled = input(false)`, `error = input<string | undefined>(undefined)`; `<option>` elements are projected.
- Produces: `PanelComponent` — `padded = input(true)`.

- [ ] **Step 1: Enumerate the real call sites**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && \
  grep -rn 'bh-input\|bh-select' frontend/src/app frontend/src/styles.scss > /tmp/m13c-t3-sites.txt; \
  wc -l /tmp/m13c-t3-sites.txt; cat /tmp/m13c-t3-sites.txt
```

**Work from this file, not from this plan.** The plan does not enumerate them because a stale list in a brief is how M13b nearly shipped a missed file.

- [ ] **Step 2: Write the failing tests**

Replace `frontend/src/app/ui/field.component.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { FieldComponent } from './field.component';

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" [(value)]="v" [error]="e()" [disabled]="d()" />`,
})
class Host {
  v = signal('');
  e = signal<string | undefined>(undefined);
  d = signal(false);
}

describe('FieldComponent', () => {
  let f: any;
  const input = (): HTMLInputElement => f.nativeElement.querySelector('input');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('wires the label to the input programmatically', () => {
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBeTruthy();
    expect(label.htmlFor).toBe(input().id);
  });

  it('two-way binds the value', () => {
    input().value = 'a@b.io';
    input().dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('a@b.io');
  });

  it('an error is announced, not merely coloured', () => {
    f.componentInstance.e.set('Required');
    f.detectChanges();
    // Law §11: colour is never the only signal.
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const describedBy = input().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const msg = f.nativeElement.querySelector('#' + describedBy);
    expect(msg.textContent).toContain('Required');
  });

  it('has no aria-invalid and no describedby when valid', () => {
    expect(input().getAttribute('aria-invalid')).toBe('false');
    expect(input().getAttribute('aria-describedby')).toBeNull();
  });

  it('disables the input', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(input().disabled).toBe(true);
  });

  it('generates a unique id per instance', async () => {
    const g = TestBed.createComponent(Host);
    g.detectChanges();
    expect(g.nativeElement.querySelector('input').id).not.toBe(input().id);
  });
});
```

Create `frontend/src/app/ui/select.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SelectComponent } from './select.component';

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" [(value)]="v">
    <option value="a">A</option><option value="b">B</option>
  </bh-select>`,
})
class Host { v = signal('a'); }

describe('SelectComponent', () => {
  let f: any;
  const sel = (): HTMLSelectElement => f.nativeElement.querySelector('select');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects options and wires its label', () => {
    expect(sel().querySelectorAll('option').length).toBe(2);
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(sel().id);
  });

  it('two-way binds on change', () => {
    sel().value = 'b';
    sel().dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('b');
  });
});
```

- [ ] **Step 3: Run and watch them fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t3.log 2>&1; echo "exit=$?"
```

Expected: FAIL — `select.component` not found, and `bh-field` has no `error`/`disabled` binding shape.

- [ ] **Step 4: Write `bh-field`**

Replace `frontend/src/app/ui/field.component.ts`:

```ts
import { Component, computed, input, model } from '@angular/core';

let seq = 0;

/**
 * The product's text input. This component existed before M13c and NOTHING imported it — screens
 * used a global `.bh-input` class instead, and the two drifted apart on padding while both claimed
 * to be the app's text input. There is now one implementation.
 *
 * The label is wired with for/id rather than by wrapping, because an error message needs
 * aria-describedby and that needs an id anyway.
 */
@Component({
  selector: 'bh-field',
  standalone: true,
  template: `
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <input class="input" [id]="id" [type]="type()" [value]="value()"
             [placeholder]="placeholder()" [disabled]="disabled()"
             [attr.aria-invalid]="!!error()"
             [attr.aria-describedby]="error() ? id + '-err' : null"
             (input)="value.set($any($event.target).value)" />
      @if (error()) {
        <span class="err" [id]="id + '-err'" role="alert">{{ error() }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .input { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 13px; min-height: var(--tap); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); width: 100%; }
    .input::placeholder { color: var(--faint); }
    .input:hover:not(:disabled) { border-color: var(--faint); }
    .input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .input:disabled { color: var(--disabled); cursor: not-allowed; }
    .input[aria-invalid="true"] { border-color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-meta); }
  `],
})
export class FieldComponent {
  label = input('');
  type = input('text');
  value = model('');
  placeholder = input('');
  error = input<string | undefined>(undefined);
  disabled = input(false);

  /** Per-instance, so two fields on one screen never collide on for/id or aria-describedby. */
  readonly id = `bh-f${seq++}`;
}
```

- [ ] **Step 5: Write `bh-select`**

Create `frontend/src/app/ui/select.component.ts`:

```ts
import { Component, input, model } from '@angular/core';

let seq = 0;

/** The product's select. Options are projected, so callers keep full control of their contents. */
@Component({
  selector: 'bh-select',
  standalone: true,
  template: `
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <select class="sel" [id]="id" [disabled]="disabled()"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="error() ? id + '-err' : null"
              [value]="value()" (change)="value.set($any($event.target).value)">
        <ng-content />
      </select>
      @if (error()) {
        <span class="err" [id]="id + '-err'" role="alert">{{ error() }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .sel { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 13px; min-height: var(--tap); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); width: 100%; cursor: pointer; }
    .sel:hover:not(:disabled) { border-color: var(--faint); }
    .sel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .sel:disabled { color: var(--disabled); cursor: not-allowed; }
    .sel[aria-invalid="true"] { border-color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-meta); }
  `],
})
export class SelectComponent {
  label = input('');
  value = model('');
  error = input<string | undefined>(undefined);
  disabled = input(false);
  readonly id = `bh-s${seq++}`;
}
```

**`color-scheme: dark` on `:root` (law §3.2) is what makes the native option list dark.** Do not restyle the dropdown itself; it is OS chrome.

- [ ] **Step 6: Convert `bh-panel` to signal inputs**

`frontend/src/app/ui/panel.component.ts` becomes:

```ts
import { Component, input } from '@angular/core';

/** A card. Deliberately thin — law §5 says depth is a surface ladder plus hairlines, not shadows. */
@Component({
  selector: 'bh-panel',
  standalone: true,
  template: `<div class="panel" [class.padded]="padded()"><ng-content /></div>`,
  styles: [`
    .panel { background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-card); }
    .panel.padded { padding: var(--sp-6); }
  `],
})
export class PanelComponent { padded = input(true); }
```

- [ ] **Step 7: Do NOT migrate the call sites — add the `testId` hook instead**

**Revised 2026-08-07 after this task's first executor stopped with evidence.** See spec §3.8. The 54 call sites are **not** mechanical: 13 of the 16 files wrap their inputs in a template-driven `<form>` with `required` / `minlength` / `name` / `[(ngModel)]`, and `bh-field` is not a `ControlValueAccessor`, so `ngModel` does not work on it at all. Nearly every site also carries a `data-testid` the e2e suite drives with Playwright `.fill()`, which requires the node to *be* an `<input>` — and an attribute on `<bh-field>` lands on the host, not the inner control.

All 16 files are rebuilt by a later milestone, **seven of them by M13d**. Migrating them now designs a form contract against screens about to be deleted.

So instead, add a `testId` input to **both** `bh-field` and `bh-select`, bound onto the inner control so the hook lands where Playwright needs it:

```ts
testId = input('');
```
```html
<input class="input" [attr.data-testid]="testId() || null" … />
```

Use `|| null` for the same reason `bh-button` does: an empty attribute is not the same as an absent one. Add one spec per component asserting the attribute lands on the **inner** `<input>`/`<select>` and is absent when `testId` is not given.

- [ ] **Step 8: Mark the global classes legacy rather than deleting them**

Leave `.bh-input` and `.bh-select` in `frontend/src/styles.scss` and put a comment above the block naming why they survive and who kills each consumer:

```scss
/* LEGACY, scheduled for deletion — do NOT use in new code; use <bh-field> / <bh-select>.
   These survive because their 54 call sites sit inside template-driven <form>s with ngModel and
   carry data-testids the e2e suite drives with .fill(); bh-field is deliberately not a
   ControlValueAccessor yet (that is M13d's decision). Each consumer dies with its own milestone:
   M13d — join, signup, reset, verify, forgot, start-box, account/security
   M14  — schedule        M15 — invites, members, settings
   M16  — box-stripe, subscriptions, plans                M18 — superadmin console
   Spec: docs/superpowers/specs/2026-08-06-m13c-component-library-design.md §3.8 */
```

**Leave `.bh-section` and `.bh-section-head` alone** — layout utilities, not controls.

- [ ] **Step 9: Gates — the form-control gate is a CAP, not a zero**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rcE 'class="[^"]*\bbh-(input|select)\b' frontend/src/app > /dev/null
grep -rnE 'class="[^"]*\bbh-(input|select)\b' frontend/src/app > /tmp/m13c-t3-cap.txt
echo "form-control sites: $(wc -l < /tmp/m13c-t3-cap.txt) (must be <= 54, and must never grow)"
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t3.log 2>&1; echo "test exit=$?"
npx ng build --configuration production > /tmp/m13c-t3-build.log 2>&1; echo "build exit=$?"
```

Expected: **54 or fewer**; tests `exit=0` at **199 specs** (197 + 2 testId); build `exit=0`.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/ui/field.component.ts frontend/src/app/ui/field.component.spec.ts \
        frontend/src/app/ui/select.component.ts frontend/src/app/ui/select.component.spec.ts \
        frontend/src/app/ui/panel.component.ts frontend/src/styles.scss
git add <each screen from /tmp/m13c-t3-sites.txt that you changed>
git commit -m "feat(ui): bh-field, bh-select, bh-panel — migration deferred, see spec 3.8

bh-field existed and nothing imported it; the global .bh-input took its place
and the two drifted (11px/13px padding vs 9px/12px), both claiming to be the
app's text input. There is one component now, though the legacy class survives
until its last pre-rework consumer does.

The label is wired with for/id rather than by wrapping, because an error
message needs aria-describedby and that needs an id anyway — so an invalid
field is announced, not merely outlined in red (law 11).

testId puts the e2e hook on the inner control: an attribute on <bh-field>
lands on the host, and Playwright .fill() needs a real <input>.
"
```

---

### Task 4: `bh-alert` and `bh-empty`

Built here, shown in the gallery, **first consumed by M13d** — whose eleven screens all render standing messages. Per spec §3.7 this task migrates **no** existing screen: the 42 `class="err"` and 13 `class="empty"` sites are per-component classes defined locally, nothing breaks if they stay, and editing thirty screens is not what "migrate the call sites" means.

**Files:**
- Create: `frontend/src/app/ui/alert.component.ts`, `frontend/src/app/ui/alert.component.spec.ts`
- Create: `frontend/src/app/ui/empty.component.ts`, `frontend/src/app/ui/empty.component.spec.ts`

**Interfaces:**
- Produces: `AlertComponent` — `tone = input<'danger'|'warn'|'good'|'info'>('danger')`. Message projected.
- Produces: `EmptyComponent` — `icon = input<IconName>('inbox')`, `title = input('')`, `message = input('')`. An optional action is projected.
- Consumes: `IconComponent`, `IconName` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/ui/alert.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AlertComponent } from './alert.component';

@Component({
  standalone: true,
  imports: [AlertComponent],
  template: `<bh-alert [tone]="t()">Something went wrong</bh-alert>`,
})
class Host { t = signal<'danger' | 'warn' | 'good' | 'info'>('danger'); }

describe('AlertComponent', () => {
  let f: any;
  const box = (): HTMLElement => f.nativeElement.querySelector('.alert');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('announces a danger alert assertively', () => {
    expect(box().getAttribute('role')).toBe('alert');
    expect(box().textContent).toContain('Something went wrong');
  });

  it('carries an icon as well as colour', () => {
    // Law §11: --good / --warn / --danger always accompany text or an icon, never stand alone.
    expect(box().querySelector('svg')).toBeTruthy();
  });

  it('a non-urgent tone is a status, not an alert', () => {
    f.componentInstance.t.set('info');
    f.detectChanges();
    // role="alert" interrupts a screen reader. "Check your inbox" must not.
    expect(box().getAttribute('role')).toBe('status');
  });

  it('changes tone class reactively', () => {
    expect(box().className).toContain('danger');
    f.componentInstance.t.set('good');
    f.detectChanges();
    expect(box().className).toContain('good');
    expect(box().className).not.toContain('danger');
  });
});
```

Create `frontend/src/app/ui/empty.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { EmptyComponent } from './empty.component';

@Component({
  standalone: true,
  imports: [EmptyComponent],
  template: `<bh-empty title="No classes" message="Nothing booked yet.">
    <button>Book one</button>
  </bh-empty>`,
})
class Host {}

describe('EmptyComponent', () => {
  it('renders title, message, icon and a projected action', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;

    expect(el.textContent).toContain('No classes');
    expect(el.textContent).toContain('Nothing booked yet.');
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.querySelector('button')?.textContent).toContain('Book one');
    // Empty is a state, not an error — it must not interrupt.
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t4.log 2>&1; echo "exit=$?"
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write `bh-alert`**

```ts
import { Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/**
 * A standing message. Semantic colours stay quiet (law §3.1): a thin left rule and an icon, never
 * a filled row or card — a --danger fill is permitted on a button or a chip and nothing larger.
 *
 * role is derived from tone rather than fixed. role="alert" interrupts a screen reader mid-sentence,
 * which is right for a failed save and wrong for "check your inbox".
 */
@Component({
  selector: 'bh-alert',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="alert {{ tone() }}" [attr.role]="role()">
      <bh-icon [name]="icon()" [size]="16" />
      <span class="msg"><ng-content /></span>
    </div>`,
  styles: [`
    .alert { display: flex; align-items: flex-start; gap: var(--sp-2);
      padding: var(--sp-3); border: 1px solid var(--hairline);
      border-left-width: 3px; border-radius: var(--r-ctl);
      background: var(--surface); font-size: var(--fs-sm); color: var(--bone); }
    .msg { flex: 1; }
    .danger { border-left-color: var(--danger); } .danger bh-icon { color: var(--danger); }
    .warn   { border-left-color: var(--warn); }   .warn   bh-icon { color: var(--warn); }
    .good   { border-left-color: var(--good); }   .good   bh-icon { color: var(--good); }
    .info   { border-left-color: var(--faint); }  .info   bh-icon { color: var(--faint); }
  `],
})
export class AlertComponent {
  tone = input<'danger' | 'warn' | 'good' | 'info'>('danger');

  role = computed(() => (this.tone() === 'danger' || this.tone() === 'warn' ? 'alert' : 'status'));

  icon = computed<IconName>(() => {
    switch (this.tone()) {
      case 'danger': return 'circle-alert';
      case 'warn': return 'triangle-alert';
      case 'good': return 'check';
      default: return 'info';
    }
  });
}
```

- [ ] **Step 4: Write `bh-empty`**

```ts
import { Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/**
 * The empty state. Law §11.6 makes this mandatory for every fetch — a list that renders nothing
 * when it has nothing is indistinguishable from a list that failed.
 */
@Component({
  selector: 'bh-empty',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="empty">
      <bh-icon [name]="icon()" [size]="28" />
      @if (title()) { <p class="t">{{ title() }}</p> }
      @if (message()) { <p class="m">{{ message() }}</p> }
      <ng-content />
    </div>`,
  styles: [`
    .empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
      padding: var(--sp-8) var(--sp-4); text-align: center; color: var(--bone-dim); }
    bh-icon { color: var(--faint); }
    .t { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      color: var(--bone); margin: 0; }
    .m { margin: 0; font-size: var(--fs-sm); max-width: 34ch; }
  `],
})
export class EmptyComponent {
  icon = input<IconName>('inbox');
  title = input('');
  message = input('');
}
```

- [ ] **Step 5: Run the tests and the build**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t4.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t4-build.log 2>&1; echo "build exit=$?"
```

Expected: tests `exit=0` at **199 specs** (193 + 4 alert + 1 empty); build `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/ui/alert.component.ts frontend/src/app/ui/alert.component.spec.ts \
        frontend/src/app/ui/empty.component.ts frontend/src/app/ui/empty.component.spec.ts
git commit -m "feat(ui): add bh-alert and bh-empty

Built here, first consumed by M13d — its eleven screens all render standing
messages. Per spec §3.7 no existing screen is migrated: the 42 class=\"err\"
and 13 class=\"empty\" sites are per-component classes defined locally, so
nothing breaks if they stay, and they belong to each screen's own rebuild.

bh-alert derives its ARIA role from its tone rather than fixing role=\"alert\".
role=\"alert\" interrupts a screen reader mid-sentence: right for a failed
save, wrong for \"check your inbox\"."
```

---

### Task 5: `bh-data-table` — and the end of `.bh-table`

`.bh-table` is global CSS with 7 consumers. It becomes a component providing the table chrome, and it ships the phone card-mode CSS **available but unused** — the BACKLOG's "admin tables on phone are scroll-tables, not cards" is solvable once the component exists, and a screen opts in during its own rebuild by adding `data-label` to its cells. **No screen's layout changes in this task.**

**Files:**
- Create: `frontend/src/app/ui/data-table.component.ts`, `frontend/src/app/ui/data-table.component.spec.ts`
- Delete: `frontend/src/styles/_table.scss`
- Modify: `frontend/src/styles.scss` — remove `@use "styles/table";`
- Modify: the 7 consumers — `features/admin/members.page.ts`, `features/admin/movements.page.ts`, `features/admin/schedule.page.ts`, `features/programming/wod-library.page.ts`, `features/athlete/progress.page.ts`, `features/athlete/athlete-profile.page.ts`, `features/superadmin/console.page.ts`

**Interfaces:**
- Produces: `DataTableComponent` (`selector: 'bh-data-table'`) — `caption = input('')`. `<thead>` and `<tbody>` are projected. Card mode activates per-cell when a `<td>` carries `data-label`.
- Preserves the `.mname`, `.memail` and `.num` cell classes, which the 7 screens use.

- [ ] **Step 1: Read the current global table styles and one real consumer**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cat frontend/src/styles/_table.scss && \
  grep -n 'bh-table' -A 20 frontend/src/app/features/admin/members.page.ts | head -50
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/app/ui/data-table.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { DataTableComponent } from './data-table.component';

@Component({
  standalone: true,
  imports: [DataTableComponent],
  template: `
    <bh-data-table caption="Members">
      <thead><tr><th>Name</th><th>Status</th></tr></thead>
      <tbody><tr><td data-label="Name">Ada</td><td data-label="Status">Active</td></tr></tbody>
    </bh-data-table>`,
})
class Host {}

describe('DataTableComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects a real table, not a grid of divs', () => {
    const table: HTMLTableElement = f.nativeElement.querySelector('table');
    expect(table).toBeTruthy();
    expect(table.querySelectorAll('thead th').length).toBe(2);
    expect(table.querySelectorAll('tbody td').length).toBe(2);
  });

  it('names the table for assistive technology', () => {
    // A caption is how a screen-reader user knows which of several tables they are in.
    expect(f.nativeElement.querySelector('caption')?.textContent).toContain('Members');
  });

  it('wraps for horizontal overflow', () => {
    expect(f.nativeElement.querySelector('.wrap')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t5.log 2>&1; echo "exit=$?"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

```ts
import { Component, input } from '@angular/core';

/**
 * The product's table. Replaces the global .bh-table, which had 7 consumers and no way to become
 * anything else.
 *
 * Column headers use .t-eyebrow-tight, not .t-eyebrow: mono is ~15% wider than Archivo, uppercase
 * adds more, and German adds 20-35% on top, so 0.18em across six headers is a horizontal scrollbar
 * on the admin's primary screen. Law §6.3 weakens the eyebrow here deliberately.
 *
 * CARD MODE is shipped and unused. A <td data-label="…"> becomes a labelled row on a phone instead
 * of a cell in a scroll-table — the BACKLOG's "admin tables on phone are scroll-tables, not cards".
 * No screen adopts it in M13c, because adding data-label to a screen's cells changes that screen's
 * phone layout, and M13c redesigns no screen. Each screen opts in during its own rebuild.
 */
@Component({
  selector: 'bh-data-table',
  standalone: true,
  template: `
    <div class="wrap">
      <table>
        @if (caption()) { <caption>{{ caption() }}</caption> }
        <ng-content />
      </table>
    </div>`,
  styles: [`
    .wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; font-size: var(--fs-sm); }
    caption { text-align: left; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint);
      padding-bottom: var(--sp-2); }
    ::ng-deep thead th { text-align: left; padding: 9px 12px; font-family: var(--font-mono);
      font-size: var(--fs-meta); letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--faint); font-weight: 500; border-bottom: 2px solid var(--hairline);
      white-space: normal; }
    ::ng-deep tbody td { padding: 13px 12px; border-bottom: 1px solid var(--hairline); }
    ::ng-deep tbody tr:last-child td { border-bottom: none; }
    /* Hover is a rung on the surface ladder (law §5), never volt. */
    ::ng-deep tbody tr:hover td { background: var(--surface); }
    ::ng-deep .mname { font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-body); letter-spacing: -0.005em; }
    ::ng-deep .memail { color: var(--faint); font-size: var(--fs-meta);
      font-family: var(--font-mono); }
    ::ng-deep .num { font-variant-numeric: tabular-nums; }

    @media (max-width: 719px) {
      ::ng-deep tbody td[data-label] { display: flex; justify-content: space-between;
        gap: var(--sp-4); padding: 8px 12px; border-bottom: none; }
      ::ng-deep tbody td[data-label]::before { content: attr(data-label);
        font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--faint); }
      ::ng-deep tbody tr:has(td[data-label]) { display: block; border: 1px solid var(--hairline);
        border-radius: var(--r-card); margin-bottom: var(--sp-3); padding: var(--sp-2) 0; }
      ::ng-deep thead:has(~ tbody td[data-label]) { display: none; }
    }
  `],
})
export class DataTableComponent { caption = input(''); }
```

`::ng-deep` is required and is not a shortcut: the `<thead>` and `<tbody>` are **projected content**, so they carry the *consumer's* emulated-encapsulation attribute, not this component's. Scoped selectors cannot reach them. It is bounded by `.wrap`'s subtree in practice because nothing else projects into this component.

- [ ] **Step 5: Migrate the 7 consumers**

For each of the seven files, the swap is:

```html
<!-- before -->
<div class="bh-table-wrap">
  <table class="bh-table"><thead>…</thead><tbody>…</tbody></table>
</div>
<!-- after -->
<bh-data-table caption="…">
  <thead>…</thead><tbody>…</tbody>
</bh-data-table>
```

Add `DataTableComponent` to that component's `imports`. **Do not add `data-label` attributes** — that is card mode, and adopting it changes the screen's phone layout. **Do not change any cell's contents, classes, or order.** If a screen's table has something this component cannot host — a `<tfoot>`, a `colspan` empty-state row, a nested table — **stop and escalate**.

The `caption` is new text and is therefore **user-facing**, so it is marked — but note the trap in law §12.1: **an `i18n` attribute cannot translate content arriving through a binding.** Pass the caption as a *static* attribute on the screen and mark it with `i18n-caption`, never as `[caption]="someSignal()"`:

```html
<bh-data-table caption="Members" i18n-caption="@@admin.members.tableCaption">
```

If a screen already has a visible heading naming the table, pass no caption rather than duplicating it — a caption and an `<h2>` saying the same thing is announced twice.

- [ ] **Step 6: Delete the global stylesheet**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git rm frontend/src/styles/_table.scss
```

Then remove the `@use "styles/table";` line from `frontend/src/styles.scss`.

- [ ] **Step 7: Gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE 'class="[^"]*\bbh-table(-wrap)?\b' frontend/src/app > /tmp/m13c-t5-gate.txt; echo "lines=$(wc -l < /tmp/m13c-t5-gate.txt)"
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t5.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t5-build.log 2>&1; echo "build exit=$?"
```

Expected: gate file **empty**; tests `exit=0` at **202 specs** (199 + 3); build `exit=0`.

- [ ] **Step 8: Look at all seven screens**

Bring the stack up and open each of the seven in a browser at 1440 and at 375. **Compare against what they looked like before.** A `::ng-deep` selector that fails to reach projected content produces an unstyled table that every automated gate passes — this is the check no command can do for you.

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml up -d --build
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/ui/data-table.component.ts frontend/src/app/ui/data-table.component.spec.ts \
        frontend/src/styles.scss frontend/src/styles/_table.scss
git add <the 7 migrated screens>
git commit -m "feat(ui): bh-data-table replaces the global .bh-table

7 consumers migrated mechanically — same columns, same cells, same order.
Column headers drop to 0.06em tracking per law §6.3: mono is ~15% wider than
Archivo, uppercase adds more, and German adds 20-35%, so a tracked uppercase
mono header across six columns is a horizontal scrollbar on the admin's
primary screen.

Card mode ships available and unused. Adding data-label to a screen's cells
changes that screen's phone layout, and M13c redesigns no screen; each opts
in during its own rebuild.

::ng-deep is required rather than lazy: thead and tbody are projected, so they
carry the consumer's encapsulation attribute and scoped selectors cannot reach
them."
```

---

### Task 6: `bh-shell-header` + `bh-dock` — the triplicated chrome

**The highest-risk task in the milestone.** All three shells are e2e-covered, and the three e2e selectors in Global Constraints live here.

What is genuinely triplicated: the `.brand` block, the `.top` bar rules, `.bh-dock` + `.bh-dock-item`, and coach's `.iconbtn` versus admin's `.theme` — the same control under two names. What is **not** shared: page layout. Athlete and coach are `flex column`; admin is a CSS grid with a side nav and a PENDING banner. **Each shell keeps its own layout.**

**Files:**
- Create: `frontend/src/app/ui/shell-header.component.ts`, `frontend/src/app/ui/shell-header.component.spec.ts`
- Create: `frontend/src/app/ui/dock.component.ts`, `frontend/src/app/ui/dock.component.spec.ts`
- Modify: `frontend/src/app/features/athlete/athlete-shell.page.ts` (102 lines)
- Modify: `frontend/src/app/features/coach/coach-shell.page.ts` (87 lines)
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts` (147 lines)
- Modify: `frontend/src/styles.scss` — delete the `.bh-dock` / `.bh-dock-item` block (currently inside the `@media (max-width: 719px)` block)

**Interfaces:**
- Produces: `ShellHeaderComponent` (`selector: 'bh-shell-header'`) — `boxName = input.required<string>()`, `area = input('')`. Slots: `<ng-content select="[nav]" />` and `<ng-content select="[actions]" />`.
- Produces: `DockComponent` (`selector: 'bh-dock'`) — `tabs = input.required<DockTab[]>()`, `label = input('')`; extra items projected via `<ng-content />`. Exports:
  ```ts
  export interface DockTab { link: string; label: string; icon: IconName; }
  ```
- Consumes: `IconComponent`, `IconName` (Task 1); `ButtonComponent` with `variant="icon"` (Task 2).

- [ ] **Step 1: Read all three shells end to end**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && \
  cat frontend/src/app/features/athlete/athlete-shell.page.ts \
      frontend/src/app/features/coach/coach-shell.page.ts \
      frontend/src/app/features/admin/admin-shell.page.ts
```

Note the four-line `boxName` / `boxInitial` derivation, copied verbatim into all three **including its comment**. That comment records a real bug — the mark used to be a hardcoded `B` for BoxHub and survived the rename because a single letter does not look like a brand string. **Carry the comment into the component**; it is the only place that history survives.

- [ ] **Step 2: One accepted visual delta, and it needs your eyes**

The coach header currently reads `{{ boxName }} · Coach` inside `.bn`. Admin renders the box name and then a separate mono `.area` eyebrow reading `Admin`. Unifying on the admin treatment means **coach's header changes from "Demo Box · Coach" to "Demo Box" plus a "COACH" eyebrow.**

That is a real, if small, visual change to a live screen. It is accepted because it is the unification the task exists to perform, and because the mono eyebrow is what law §6.2 prescribes for a section label. **Screenshot the coach header before and after and look at both.** If it reads worse, stop and escalate rather than choosing for yourself.

- [ ] **Step 3: Write the failing tests**

Create `frontend/src/app/ui/shell-header.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ShellHeaderComponent } from './shell-header.component';

@Component({
  standalone: true,
  imports: [ShellHeaderComponent],
  template: `<bh-shell-header boxName="Demo Box" area="Coach">
    <nav nav aria-label="Coach"><a href="#">Classes</a></nav>
    <button actions aria-label="Log out">x</button>
  </bh-shell-header>`,
})
class Host {}

describe('ShellHeaderComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('derives the mark from the box name, not from the brand', () => {
    // It was a hardcoded "B" for BoxHub until M13b, and survived the rename because one letter
    // does not look like a brand string.
    expect(f.nativeElement.querySelector('.mark').textContent.trim()).toBe('D');
    expect(f.nativeElement.querySelector('.bn').textContent).toContain('Demo Box');
  });

  it('renders the area as a separate label, not glued to the box name', () => {
    expect(f.nativeElement.querySelector('.bn').textContent).not.toContain('Coach');
    expect(f.nativeElement.querySelector('.area').textContent).toContain('Coach');
  });

  it('projects nav and actions into their slots', () => {
    expect(f.nativeElement.querySelector('[nav]')).toBeTruthy();
    expect(f.nativeElement.querySelector('[actions]')).toBeTruthy();
  });

  it('is a banner landmark exactly once', () => {
    expect(f.nativeElement.querySelectorAll('header').length).toBe(1);
  });
});
```

Create `frontend/src/app/ui/dock.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DockComponent, DockTab } from './dock.component';

@Component({
  standalone: true,
  imports: [DockComponent],
  template: `<bh-dock [tabs]="tabs" label="Athlete">
    <button>More</button>
  </bh-dock>`,
})
class Host {
  tabs: DockTab[] = [
    { link: 'home', label: 'Home', icon: 'house' },
    { link: 'book', label: 'Book', icon: 'calendar' },
  ];
}

describe('DockComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([])],
    }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('renders one item per tab, each with an icon AND a text label', () => {
    const items = f.nativeElement.querySelectorAll('a.item');
    expect(items.length).toBe(2);
    // Law §11: a glyph is never the only signal. The placeholder set this replaces used "$" for
    // "Plan" and "▮▮" for "Home", which is exactly why the label is not optional.
    expect(items[0].querySelector('svg')).toBeTruthy();
    expect(items[0].textContent).toContain('Home');
  });

  it('names the navigation landmark', () => {
    expect(f.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe('Athlete');
  });

  it('projects extra items after the tabs', () => {
    expect(f.nativeElement.querySelector('button')?.textContent).toContain('More');
  });
});
```

- [ ] **Step 4: Run and watch them fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t6.log 2>&1; echo "exit=$?"
```

Expected: FAIL — modules not found.

- [ ] **Step 5: Write `bh-shell-header`**

```ts
import { Component, computed, input } from '@angular/core';

/**
 * The top bar, shared by all three shells. It owns the bar and the brand block only — NOT the page
 * layout, because there isn't a shared one: athlete and coach are flex columns, admin is a grid
 * with a side nav and a PENDING banner. One shell component would have fitted none of them.
 */
@Component({
  selector: 'bh-shell-header',
  standalone: true,
  template: `
    <header class="top">
      <div class="brand">
        <span class="mark" aria-hidden="true">{{ initial() }}</span>
        <span class="bn">{{ boxName() }}</span>
      </div>
      @if (area()) { <span class="area">{{ area() }}</span> }
      <ng-content select="[nav]" />
      <div class="acts"><ng-content select="[actions]" /></div>
    </header>`,
  styles: [`
    .top { display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-5); border-bottom: 1px solid var(--hairline);
      position: sticky; top: 0; z-index: 20; background: var(--ground); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    /* The one volt element in the chrome. It is the box's identity, not an accent — but law §2.3
       still budgets it, which is why the wordmark renders monochrome in app chrome (law §10.2). */
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      flex-shrink: 0; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .area { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .acts { display: flex; gap: 2px; margin-left: auto; }
  `],
})
export class ShellHeaderComponent {
  boxName = input.required<string>();
  /** Rendered as a mono eyebrow beside the box name — "Coach", "Admin". Empty for athlete. */
  area = input('');

  /* The badge beside a box's name is the box's own initial. It used to be a hardcoded "B" for
     BoxHub, which survived the rename because a single letter does not look like a brand string —
     the same way the mail subject lines did. */
  initial = computed(() => (this.boxName() || '').trim().charAt(0).toUpperCase());
}
```

Note the mark is `aria-hidden`: the box name sits right beside it in text, so announcing the initial reads as `"D Demo Box"`. This is the same accessible-name bug M13b fixed on the wordmark, where the split glyphs computed as `"rxedrxed"`.

- [ ] **Step 6: Write `bh-dock`**

```ts
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent, IconName } from './icon.component';

export interface DockTab { link: string; label: string; icon: IconName; }

/**
 * The floating pill dock — mobile primary navigation for all three shells. Absorbs the global
 * .bh-dock / .bh-dock-item classes from styles.scss.
 *
 * A dock item is an icon AND a text label, never an icon alone: the placeholder set this replaces
 * used "$" for Plan and "▮▮" for Home, which is the argument in one glyph.
 *
 * The shadow is sanctioned — law §5 permits shadows on things that physically float, and the dock
 * is one of the three.
 */
@Component({
  selector: 'bh-dock',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="dock" [attr.aria-label]="label()">
      @for (t of tabs(); track t.link) {
        <a class="item" [routerLink]="t.link" routerLinkActive="active"
           ariaCurrentWhenActive="page">
          <bh-icon [name]="t.icon" [size]="20" />
          <span class="tlabel">{{ t.label }}</span>
        </a>
      }
      <ng-content />
    </nav>`,
  styles: [`
    .dock { display: none; }
    @media (max-width: 719px) {
      .dock { position: fixed; left: var(--sp-4); right: var(--sp-4);
        bottom: calc(var(--sp-3) + env(safe-area-inset-bottom)); z-index: 30;
        display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px;
        background: var(--surface); border: 1px solid var(--hairline);
        border-radius: var(--r-full); padding: 6px; box-shadow: var(--shadow-float);
        max-width: 480px; margin: 0 auto; }
      .item, ::ng-deep .dock > button { display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 3px; min-height: 56px; border-radius: var(--r-full);
        color: var(--bone-dim); text-decoration: none; background: none; border: none;
        cursor: pointer; font: inherit; }
      .tlabel, ::ng-deep .dock > button .tlabel { font-family: var(--font-mono);
        font-size: var(--fs-meta); letter-spacing: 0.08em; text-transform: uppercase; }
      .item.active { background: var(--surface-2); color: var(--bone); }
      .item.active bh-icon { color: var(--volt); }
      .item:focus-visible, ::ng-deep .dock > button:focus-visible {
        outline: 2px solid var(--focus); outline-offset: -2px; }
    }
  `],
})
export class DockComponent {
  tabs = input.required<DockTab[]>();
  label = input('');
}
```

- [ ] **Step 7: Migrate the three shells**

Each shell: import `ShellHeaderComponent` and `DockComponent`, replace its `<header>` and its `<nav class="bh-dock">`, delete the now-dead `.top` / `.brand` / `.mark` / `.bn` / `.area` / `.acts` / `.iconbtn` / `.theme` style rules, and delete its local `boxInitial` field. Replace coach's and admin's icon buttons with `<bh-button variant="icon">`.

**Preserve exactly:**
- `aria-label="Log out"` on the logout button (coach and admin) — e2e asserts it
- `data-testid="coach-security-link"` and `data-testid="admin-security-link"`
- admin's PENDING banner, its side nav, its grid layout, its More sheet and `moreLinks`
- athlete's profile button with `bh-avatar` and its `bh-sheet`
- every `routerLink` target and every tab's label text

**Tab icons** — the mapping from the placeholder glyphs, decided here so three shells do not each choose:

| Shell | Tab | Was | Icon |
|---|---|---|---|
| athlete | Home | `▮▮` | `house` |
| athlete | Book | `＋` | `calendar-plus` |
| athlete | WOD | `◎` | `clipboard-list` |
| athlete | Progress | `▲` | `trending-up` |
| athlete | Plan | `$` | `credit-card` |
| coach | Classes | `▮▮` | `calendar` |
| coach | Build | `＋` | `clipboard-list` |
| coach | Bench | `◎` | `dumbbell` |
| coach | Types | `⌘` | `layout-grid` |
| admin | Home | `▮▮` | `house` |
| admin | Members | `◉` | `users` |
| admin | Schedule | `＋` | `calendar` |
| admin | More | `⋯` | `ellipsis` |

Admin's side nav stays **text-only**. Adding icons to it is a redesign.

- [ ] **Step 8: Delete the global dock CSS**

Remove `.bh-dock`, `.bh-dock-item`, `.bh-dock-item .glyph`, `.bh-dock-item .tlabel`, `.bh-dock-item.active`, `.bh-dock-item.active .glyph` and `.bh-dock-item:focus-visible` from `frontend/src/styles.scss`. The `@media (max-width: 719px)` wrapper goes with them if nothing else remains inside it.

- [ ] **Step 9: Gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE 'class="[^"]*\bbh-dock(-item)?\b' frontend/src/app > /tmp/m13c-t6-gate1.txt; echo "lines=$(wc -l < /tmp/m13c-t6-gate1.txt)"
grep -rnE '\.bh-dock' frontend/src/styles.scss > /tmp/m13c-t6-gate2.txt; echo "lines=$(wc -l < /tmp/m13c-t6-gate2.txt)"
grep -rn 'boxInitial' frontend/src/app/features > /tmp/m13c-t6-gate3.txt; echo "lines=$(wc -l < /tmp/m13c-t6-gate3.txt)"
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t6.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t6-build.log 2>&1; echo "build exit=$?"
```

Expected: all three gate files **empty**; tests `exit=0` at **209 specs** (202 + 4 shell-header + 3 dock); build `exit=0`.

- [ ] **Step 10: Run the full e2e suite — this task is why it exists**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml down -v && \
  docker compose -f docker/docker-compose.yml up -d --build && \
  sleep 45 && cd e2e && npx playwright test > /tmp/m13c-t6-e2e.log 2>&1; echo "exit=$?"
```

Expected: **28 passed, 1 skipped**. The skip is the quarantined TV timer defect (`runner.spec`), which is Project 2's and not yours — **do not investigate it, do not un-skip it.**

- [ ] **Step 11: Look at all three shells, desktop and phone**

Open athlete, coach and admin at 1440 and at 375. Check the dock, the header, the active tab's volt icon, and that keyboard-tabbing reaches every nav item with a visible ring. Capture the coach header for Step 2's before/after.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app/ui/shell-header.component.ts frontend/src/app/ui/shell-header.component.spec.ts \
        frontend/src/app/ui/dock.component.ts frontend/src/app/ui/dock.component.spec.ts \
        frontend/src/styles.scss \
        frontend/src/app/features/athlete/athlete-shell.page.ts \
        frontend/src/app/features/coach/coach-shell.page.ts \
        frontend/src/app/features/admin/admin-shell.page.ts
git commit -m "feat(ui): bh-shell-header + bh-dock end the triplicated chrome

Not one bh-app-shell: athlete and coach are flex columns, admin is a grid with
a side nav and a PENDING banner, so a single shell component would have fitted
none of them. What was actually triplicated moves — the brand block (including
four lines of boxName/boxInitial copied verbatim with their comment), the top
bar, the dock, and coach's .iconbtn vs admin's .theme, the same control under
two names. Each shell keeps its own layout.

Placeholder glyphs are gone: Home was '▮▮' and Plan was '\$'. Every dock item
carries an icon AND a text label — law §11, and that glyph pair is the
argument.

One accepted visual delta: coach's header was 'Demo Box · Coach' and is now
'Demo Box' plus a mono COACH eyebrow, matching admin and law §6.2."
```

---

### Task 7: `bh-segmented` + `bh-switch`

Two controls hand-rolled inside `score-form.component.ts`, which lives in a `bh-sheet` behind a dirty-form discard guard — the fiddliest interaction in the product. The segmented control carries a filed a11y defect: `role="radio"` with no roving tabindex and no arrow keys.

**Files:**
- Create: `frontend/src/app/ui/segmented.component.ts`, `frontend/src/app/ui/segmented.component.spec.ts`
- Create: `frontend/src/app/ui/switch.component.ts`, `frontend/src/app/ui/switch.component.spec.ts`
- Modify: `frontend/src/app/features/performance/score-form.component.ts`

**Interfaces:**
- Produces: `SegmentedComponent` — `options = input.required<SegOption[]>()`, `value = model.required<string>()`, `label = input('')`; exports `export interface SegOption { value: string; label: string; }`.
- Produces: `SwitchComponent` — `checked = model(false)`, `label = input('')`, `hint = input('')`, `disabled = input(false)`.

- [ ] **Step 1: Read the current implementation**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cat frontend/src/app/features/performance/score-form.component.ts
```

The RX/Scaled control is at lines 16 and 18; the two toggles are at lines 33 and 63. **Read the whole file** — the discard guard's dirty tracking may depend on how these controls emit.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/app/ui/segmented.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SegmentedComponent, SegOption } from './segmented.component';

@Component({
  standalone: true,
  imports: [SegmentedComponent],
  template: `<bh-segmented [options]="opts" [(value)]="v" label="Effort" />`,
})
class Host {
  opts: SegOption[] = [{ value: 'rx', label: 'RX' }, { value: 'sc', label: 'Scaled' }];
  v = signal('rx');
}

describe('SegmentedComponent', () => {
  let f: any;
  const radios = (): HTMLButtonElement[] =>
    Array.from(f.nativeElement.querySelectorAll('[role="radio"]'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('is a named radiogroup', () => {
    const g = f.nativeElement.querySelector('[role="radiogroup"]');
    expect(g).toBeTruthy();
    expect(g.getAttribute('aria-label')).toBe('Effort');
    expect(radios().length).toBe(2);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('uses a ROVING tabindex — the filed defect', () => {
    // Before M13c both buttons were tabbable, so Tab walked through the group instead of past it.
    // A radiogroup is ONE tab stop; arrows move within it.
    expect(radios()[0].tabIndex).toBe(0);
    expect(radios()[1].tabIndex).toBe(-1);
  });

  it('ArrowRight selects and focuses the next option', () => {
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
    expect(radios()[1].tabIndex).toBe(0);
    expect(radios()[0].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(radios()[1]);
  });

  it('ArrowLeft wraps from the first option to the last', () => {
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
  });

  it('clicking selects', () => {
    radios()[1].click();
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
  });
});
```

Create `frontend/src/app/ui/switch.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SwitchComponent } from './switch.component';

@Component({
  standalone: true,
  imports: [SwitchComponent],
  template: `<bh-switch [(checked)]="c" label="Private" hint="off the leaderboard" />`,
})
class Host { c = signal(false); }

describe('SwitchComponent', () => {
  let f: any;
  const sw = (): HTMLElement => f.nativeElement.querySelector('[role="switch"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('exposes its state and its accessible name', () => {
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(sw().textContent).toContain('Private');
    expect(sw().textContent).toContain('off the leaderboard');
  });

  it('toggles on click and reflects it in aria-checked', () => {
    sw().click();
    f.detectChanges();
    expect(f.componentInstance.c()).toBe(true);
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });

  it('meets the 44px target', () => {
    // Law §11.5. A 20px-tall toggle is the classic miss.
    expect(getComputedStyle(sw()).minHeight).toBe('44px');
  });
});
```

- [ ] **Step 3: Run and watch them fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t7.log 2>&1; echo "exit=$?"
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Write `bh-segmented`**

```ts
import { Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface SegOption { value: string; label: string; }

/**
 * A segmented control. The pre-M13c version used role="radio" with NO roving tabindex and no arrow
 * keys — filed in docs/BACKLOG.md — so every option was a tab stop and Tab walked THROUGH the group
 * instead of past it. A radiogroup is one tab stop; arrows move within it.
 */
@Component({
  selector: 'bh-segmented',
  standalone: true,
  template: `
    <div class="seg" role="radiogroup" [attr.aria-label]="label()">
      @for (o of options(); track o.value; let i = $index) {
        <button #opt type="button" class="opt" role="radio"
                [class.on]="o.value === value()"
                [attr.aria-checked]="o.value === value()"
                [tabIndex]="o.value === value() ? 0 : -1"
                (click)="value.set(o.value)"
                (keydown)="onKey($event, i)">{{ o.label }}</button>
      }
    </div>`,
  styles: [`
    .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-full); }
    .opt { min-height: var(--tap); padding: 0 var(--sp-4); border: none; background: transparent;
      color: var(--bone-dim); font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); border-radius: var(--r-full); cursor: pointer; }
    .opt:hover:not(.on) { color: var(--bone); }
    /* Inversion is how the design says "this one" (law §4). */
    .opt.on { background: var(--volt); color: var(--on-volt); }
    .opt:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A volt ring on the volt-filled selected segment is invisible — law §11.2. */
    .opt.on:focus-visible { outline-color: var(--focus-inv); }
  `],
})
export class SegmentedComponent {
  options = input.required<SegOption[]>();
  value = model.required<string>();
  label = input('');

  private opts = viewChildren<ElementRef<HTMLButtonElement>>('opt');

  onKey(ev: KeyboardEvent, i: number) {
    const n = this.options().length;
    let next = i;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % n;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = n - 1;
    else return;

    ev.preventDefault();
    this.value.set(this.options()[next].value);
    // Selection follows focus, which is the WAI-ARIA radiogroup pattern.
    this.opts()[next]?.nativeElement.focus();
  }
}
```

- [ ] **Step 5: Write `bh-switch`**

```ts
import { Component, input, model } from '@angular/core';

/**
 * A toggle. role="switch" on a real <button>, so Space and Enter work without any key handling of
 * our own — a div with a click listener does not.
 */
@Component({
  selector: 'bh-switch',
  standalone: true,
  template: `
    <button type="button" class="sw" role="switch" [attr.aria-checked]="checked()"
            [disabled]="disabled()" (click)="checked.set(!checked())">
      <span class="txt">
        <span class="lab">{{ label() }}</span>
        @if (hint()) { <span class="hint">{{ hint() }}</span> }
      </span>
      <span class="track" aria-hidden="true"><span class="knob"></span></span>
    </button>`,
  styles: [`
    .sw { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      width: 100%; min-height: var(--tap); padding: 0; background: none; border: none;
      color: var(--bone); font: inherit; text-align: left; cursor: pointer; }
    .txt { display: flex; flex-direction: column; gap: 2px; }
    .lab { font-family: var(--font-body); font-size: var(--fs-body); }
    .hint { font-size: var(--fs-meta); color: var(--faint); }
    .track { width: 44px; height: 26px; border-radius: var(--r-full); flex-shrink: 0;
      background: var(--surface-2); border: 1px solid var(--hairline); padding: 2px;
      display: flex; transition: background var(--dur) var(--ease-out); }
    .knob { width: 20px; height: 20px; border-radius: var(--r-full); background: var(--faint);
      transition: transform var(--dur) var(--ease-out), background var(--dur) var(--ease-out); }
    .sw[aria-checked="true"] .track { background: var(--volt); border-color: var(--volt); }
    .sw[aria-checked="true"] .knob { transform: translateX(18px); background: var(--on-volt); }
    .sw:disabled { opacity: .5; cursor: not-allowed; }
    .sw:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-ctl); }
    @media (prefers-reduced-motion: reduce) { .track, .knob { transition: none; } }
  `],
})
export class SwitchComponent {
  checked = model(false);
  label = input('');
  hint = input('');
  disabled = input(false);
}
```

The focus ring stays `--focus` rather than inverting: it is on the *button*, whose background is the sheet surface, not on the volt track. M13b's Task 4 hit exactly this and split the rule by state — inverting unconditionally makes the ring invisible half the time.

- [ ] **Step 6: Migrate `score-form.component.ts`**

Replace the RX/Scaled buttons with `<bh-segmented>` and the two `.switch` labels with `<bh-switch>`. **Same labels, same hint text, same order, same emitted values.** Delete the now-dead `.seg`, `.switch`, `.sw-lab` and `.hint` style rules.

**The discard guard is the risk.** `bh-sheet`'s `confirmClose` shows "Discard your entry?" when the form is dirty. If dirty tracking watches the old controls' events, rewire it to the new `model()` signals and **verify by hand**: open the score sheet, change RX to Scaled, press Escape, and confirm the discard bar appears. A silently broken guard loses a user's entry, and no spec in this repo covers it.

- [ ] **Step 7: Gates**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t7.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t7-build.log 2>&1; echo "build exit=$?"
```

Expected: tests `exit=0` at **217 specs** (209 + 5 segmented + 3 switch); build `exit=0`.

- [ ] **Step 8: Drive the score sheet by hand, then by e2e**

Log in as `athlete@demo.io` (`boxhub-demo-2026`), open a class, log a score. Check: RX/Scaled toggles with arrow keys as one tab stop; both switches toggle with Space; the discard guard fires on Escape after an edit; the ring is visible on the selected volt segment.

```bash
cd e2e && npx playwright test tracking.spec.ts > /tmp/m13c-t7-e2e.log 2>&1; echo "exit=$?"
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/ui/segmented.component.ts frontend/src/app/ui/segmented.component.spec.ts \
        frontend/src/app/ui/switch.component.ts frontend/src/app/ui/switch.component.spec.ts \
        frontend/src/app/features/performance/score-form.component.ts
git commit -m "feat(ui): bh-segmented and bh-switch, with the roving tabindex

The RX/Scaled control used role=\"radio\" with no roving tabindex and no arrow
keys (filed in docs/BACKLOG.md), so every option was a tab stop and Tab walked
THROUGH the group instead of past it. A radiogroup is one tab stop; arrows
move within it, and selection follows focus per WAI-ARIA.

Both controls are real <button>s, so Space and Enter work without any key
handling of our own.

bh-switch keeps a --focus ring rather than inverting: the ring is on the
button against the sheet surface, not on the volt track. M13b hit this exact
case and split the rule by state — inverting unconditionally makes the ring
invisible half the time."
```

---

### Task 8: `bh-search-bar`

Three screens hand-roll a `.search` input, and `members.page` fires one request per keystroke — filed in `docs/BACKLOG.md`.

**Files:**
- Create: `frontend/src/app/ui/search-bar.component.ts`, `frontend/src/app/ui/search-bar.component.spec.ts`
- Modify: `frontend/src/app/features/programming/wod-library.page.ts` (`.search` at line 16), `frontend/src/app/features/admin/movements.page.ts` (line 22), `frontend/src/app/features/admin/members.page.ts`

**Interfaces:**
- Produces: `SearchBarComponent` — `placeholder = input('')`, `label = input('')`, `debounceMs = input(250)`, `value = model('')`, `search = output<string>()`.

- [ ] **Step 1: Measure the real request pattern before choosing a delay**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -n 'search\|onSearch' \
  frontend/src/app/features/admin/members.page.ts \
  frontend/src/app/features/admin/movements.page.ts \
  frontend/src/app/features/programming/wod-library.page.ts
```

250ms is the default in this plan. If the measured behaviour argues for a different value, say so in the commit rather than changing it silently.

- [ ] **Step 2: Write the failing test**

```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SearchBarComponent } from './search-bar.component';

@Component({
  standalone: true,
  imports: [SearchBarComponent],
  template: `<bh-search-bar label="Search members" placeholder="Search…"
                            [(value)]="v" (search)="hits.push($event)" />`,
})
class Host { v = signal(''); hits: string[] = []; }

describe('SearchBarComponent', () => {
  let f: any;
  const input = (): HTMLInputElement => f.nativeElement.querySelector('input');
  const type = (s: string) => { input().value = s; input().dispatchEvent(new Event('input')); };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('is a labelled search field', () => {
    expect(input().type).toBe('search');
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(input().id);
  });

  it('debounces — the filed defect was one request per keystroke', fakeAsync(() => {
    type('a'); tick(100);
    type('ad'); tick(100);
    type('ada'); tick(100);
    expect(f.componentInstance.hits.length).toBe(0);
    tick(250);
    expect(f.componentInstance.hits).toEqual(['ada']);
  }));

  it('updates the bound value immediately, so the input is never laggy', () => {
    type('ad');
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('ad');
  });

  it('does not re-emit an unchanged term', fakeAsync(() => {
    type('ada'); tick(300);
    type('ada'); tick(300);
    expect(f.componentInstance.hits.length).toBe(1);
  }));
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t8.log 2>&1; echo "exit=$?"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

```ts
import { Component, DestroyRef, inject, input, model, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';

let seq = 0;

/**
 * A debounced search field. members.page fired one request per keystroke — filed in
 * docs/BACKLOG.md — which on a slow connection also means responses arriving out of order.
 *
 * The bound value updates on every keystroke so the input is never laggy; only the `search` output
 * is debounced, and it does not re-emit an unchanged term.
 */
@Component({
  selector: 'bh-search-bar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="sb">
      <label class="sr" [attr.for]="id">{{ label() }}</label>
      <bh-icon name="search" [size]="16" />
      <input class="in" [id]="id" type="search" [value]="value()"
             [placeholder]="placeholder()"
             (input)="onInput($any($event.target).value)" />
    </div>`,
  styles: [`
    .sb { display: flex; align-items: center; gap: var(--sp-2); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 0 var(--sp-4);
      min-height: var(--tap); max-width: 340px; color: var(--faint); }
    .sb:focus-within { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .in { flex: 1; min-width: 0; background: none; border: none; color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); min-height: var(--tap); }
    .in:focus { outline: none; } /* the ring is on .sb, so the control reads as one thing */
    .in::placeholder { color: var(--faint); }
    /* A visible label above a search field costs a line and buys nothing; the placeholder is not
       an accessible name, so the real label is present and visually hidden. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
      white-space: nowrap; }
  `],
})
export class SearchBarComponent {
  placeholder = input('');
  label = input('');
  debounceMs = input(250);
  value = model('');
  search = output<string>();

  readonly id = `bh-sb${seq++}`;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastEmitted = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  onInput(v: string) {
    this.value.set(v); // immediate: the field must never lag behind typing
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.lastEmitted() === v) return;
      this.lastEmitted.set(v);
      this.search.emit(v);
    }, this.debounceMs());
  }
}
```

- [ ] **Step 5: Migrate the three screens**

Replace each `.search` input with `<bh-search-bar>`, wiring the existing handler to `(search)` rather than `(input)`. **The visible placeholder text must not change** — it is user-facing copy, already rendered, and changing it is out of scope. Add the `label` as new i18n-marked text (`@@<feature>.<screen>.searchLabel`), since the placeholder was never an accessible name. Delete the now-dead `.search` style rules.

- [ ] **Step 6: Gates**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t8.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t8-build.log 2>&1; echo "build exit=$?"
```

Expected: tests `exit=0` at **221 specs** (217 + 4); build `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/ui/search-bar.component.ts frontend/src/app/ui/search-bar.component.spec.ts \
        frontend/src/app/features/programming/wod-library.page.ts \
        frontend/src/app/features/admin/movements.page.ts \
        frontend/src/app/features/admin/members.page.ts
git commit -m "feat(ui): bh-search-bar, debounced

members.page fired one request per keystroke (filed in docs/BACKLOG.md), which
on a slow connection also means responses arriving out of order. The bound
value still updates on every keystroke so the field never lags; only the
search output is debounced, and an unchanged term does not re-emit.

The three screens gain a real accessible name — a placeholder is not one."
```

---

### Task 9: Rebuild `bh-avatar`, `bh-pill`, `bh-day-pager`; delete the three dead components

**Files:**
- Modify: `frontend/src/app/ui/avatar.component.ts` (35 lines), `frontend/src/app/ui/pill.component.ts` (28), `frontend/src/app/ui/day-pager.component.ts` (39)
- Modify: `frontend/src/app/ui/pill.component.spec.ts` (14), `frontend/src/app/ui/day-pager.component.spec.ts` (29)
- Create: `frontend/src/app/ui/avatar.component.spec.ts`
- Delete: `frontend/src/app/ui/stat.component.ts`, `frontend/src/app/ui/board-row.component.ts`, `frontend/src/app/ui/tag.component.ts`
- Modify: `frontend/src/app/ui/wordmark.component.ts` — **verify only; the expected diff is zero**

**Interfaces:**
- `AvatarComponent` — `path = input<string | null>(null)`, `name = input('')`, `size = input<'sm'|'md'|'lg'|'xl'>('md')`.
- `PillComponent` — `tone = input<'active'|'suspended'|'live'|'warn'|'danger'>('active')`, `label = input('')`.
- `DayPagerComponent` — `offset = model(0)`, `max = input(13)`.

- [ ] **Step 1: Write the failing test that pins the avatar defect**

Create `frontend/src/app/ui/avatar.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AvatarComponent } from './avatar.component';

@Component({
  standalone: true,
  imports: [AvatarComponent],
  template: `<bh-avatar [name]="n()" [path]="null" size="md" />`,
})
class Host { n = signal('Ada Lovelace'); }

describe('AvatarComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('falls back to initials', () => {
    expect(f.nativeElement.querySelector('.init').textContent.trim()).toBe('AL');
  });

  it('RECOMPUTES initials when the name changes', () => {
    // THE DEFECT THIS TEST EXISTS FOR. Before M13c, `name` was a plain @Input() field read inside
    // computed(), so the computed had ZERO signal dependencies: it evaluated once and cached
    // forever. An @for member list reusing a DOM node showed the previous athlete's initials.
    // It type-checked, it rendered, and a spec that built the component once passed.
    f.componentInstance.n.set('Grace Hopper');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.init').textContent.trim()).toBe('GH');
  });

  it('keeps an accessible name on the initials fallback', () => {
    expect(f.nativeElement.querySelector('.init').getAttribute('aria-label')).toBe('Ada Lovelace');
  });
});
```

- [ ] **Step 2: Run it and watch the second assertion fail**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t9.log 2>&1; echo "exit=$?"
```

Expected: FAIL — `Expected 'AL' to be 'GH'`. **This failure is the whole point of the task.** If it passes before you change anything, stop and escalate: the defect is not what the plan says it is.

- [ ] **Step 3: Convert the three components to signal inputs**

`avatar.component.ts` — `path`, `name`, `size` become `input()`; `broken` stays a plain `signal`; `initials` stays a `computed()` and now actually tracks `this.name()`. Drop `ChangeDetectionStrategy.Eager`.

**The four raw `font-size` values (`11px`, `16px`, `24px`, `32px`) become ONE ratio, not four tokens.** Decided at pre-flight, because the obvious fix was a redesign in disguise: `.lg` is 24px and `.xl` is 32px, and **no token is either size** — the scale is 40/28/20/15/13/11. Mapping them onto `--fs-display` (28) and `--fs-hero` (40) would visibly enlarge the initials on the athlete profile and the class-detail avatar grid, which is precisely the move Task 10 refuses to make for the 51 off-scale feature values.

An initials badge is not type on the type scale — it is a glyph filling a circle, and it should scale *with that circle*:

```css
.av  { font-size: 36%; }        /* one rule, all four sizes; % of the box, not of the type scale */
.sm  { width: 28px; height: 28px; }
.md  { width: 44px; height: 44px; }
.lg  { width: 72px; height: 72px; }
.xl  { width: 96px; height: 96px; }
```

`36%` of 28 / 44 / 72 / 96 is 10.1 / 15.8 / 25.9 / 34.6 against today's 11 / 16 / 24 / 32 — within a pixel at the two small sizes, and slightly larger at `lg` and `xl`. **Tune the percentage until all four match today's rendering as closely as one number can, then look at all four in the gallery before committing.** A fifth avatar size later needs no new number at all.

This is neither a raw px nor a type token, and that is correct: the raw-px gate exists to stop hardcoded *type sizes*, and a ratio is not one.

`pill.component.ts` — signal inputs; add a `danger` tone (law §3.1 permits `--danger` to fill a chip). Keep the `live` tone's volt fill and its pulsing dot, and keep the reduced-motion alternative.

`day-pager.component.ts` — `offset` becomes `model(0)` (the `@Output() offsetChange` disappears; `model()` provides it), `max` becomes `input(13)`. The `‹` and `›` glyphs become `<bh-icon name="chevron-left">` / `chevron-right`. **`aria-label="Previous day"` and `aria-label="Next day"` must survive verbatim** — e2e asserts both. Mark them `i18n-aria-label` with ids `@@ui.dayPager.prev` and `@@ui.dayPager.next`; the English value is unchanged, so the selectors hold.

- [ ] **Step 4: Delete the three dead components**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && \
  git rm frontend/src/app/ui/stat.component.ts \
         frontend/src/app/ui/board-row.component.ts \
         frontend/src/app/ui/tag.component.ts
```

Verified 2026-08-06: none is imported anywhere. `board-row`'s job is reimplemented inline at `leaderboard.page.ts:26`, and the only `RX` badge in the codebase is inside `board-row` itself. **M17 extracts both from the real leaderboard.** If `grep` now finds an importer, **stop and escalate** — do not restore the file and do not rewrite the screen.

- [ ] **Step 5: Verify `bh-wordmark` needs no change**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cat frontend/src/app/ui/wordmark.component.ts
```

M13b built it against law v3. Check: tokens only, no raw hex, `aria-hidden` on the split glyphs (the accessible name computed as `"rxedrxed"` before that fix), monochrome `--bone` in the `chrome` variant, volt only where the logo is the subject. **A zero diff is the correct outcome, not a skipped step.** Report which of those you checked. Convert it to signal inputs only if it has decorator inputs — check rather than assume.

- [ ] **Step 6: Gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn 'StatComponent\|BoardRowComponent\|TagComponent' frontend/src > /tmp/m13c-t9-gate1.txt; echo "lines=$(wc -l < /tmp/m13c-t9-gate1.txt)"
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/m13c-t9-gate2.txt; echo "lines=$(wc -l < /tmp/m13c-t9-gate2.txt)"
grep -rn '@Input()\|@Output()' frontend/src/app/ui > /tmp/m13c-t9-gate3.txt; echo "lines=$(wc -l < /tmp/m13c-t9-gate3.txt)"
grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/ui > /tmp/m13c-t9-gate4.txt; echo "lines=$(wc -l < /tmp/m13c-t9-gate4.txt)"
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t9.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t9-build.log 2>&1; echo "build exit=$?"
```

Expected: **all four gate files empty** — this is the first point at which the whole `ui/` folder is clean; tests `exit=0` at **at least 224 specs** (221 + 3 avatar). The pill and day-pager specs are rewritten in this task and today hold 1 and 2 tests, so the exact total depends on what you write; build `exit=0`.

- [ ] **Step 7: e2e, because the day pager is asserted by three specs**

```bash
cd e2e && npx playwright test booking-flow.spec.ts memberships.spec.ts > /tmp/m13c-t9-e2e.log 2>&1; echo "exit=$?"
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/ui/avatar.component.ts frontend/src/app/ui/avatar.component.spec.ts \
        frontend/src/app/ui/pill.component.ts frontend/src/app/ui/pill.component.spec.ts \
        frontend/src/app/ui/day-pager.component.ts frontend/src/app/ui/day-pager.component.spec.ts \
        frontend/src/app/ui/stat.component.ts frontend/src/app/ui/board-row.component.ts \
        frontend/src/app/ui/tag.component.ts
git commit -m "fix(ui): avatar initials were cached forever; delete three dead components

bh-avatar read a plain @Input() field inside computed(), so the computed had
ZERO signal dependencies — it evaluated once and cached. An @for member list
reusing a DOM node showed the previous athlete's initials next to the right
photo. It type-checked, it rendered, and a spec that built the component once
passed. The test added here fails on the old code and is the reason signal
inputs are a milestone convention rather than a preference.

bh-stat, bh-board-row and bh-tag are deleted: zero importers, verified by
import rather than by tag name. board-row's job is reimplemented inline at
leaderboard.page.ts:26 and the only RX badge in the codebase was inside
board-row itself — M17 extracts both from the real leaderboard, against real
tie and rank behaviour. Restyling them now means designing a leaderboard row
with no leaderboard in front of you.

ui/ is now free of @Input, Eager and raw px."
```

---

### Task 10: The style budget, and the 36 on-scale `font-size` sites

**Files:**
- Modify: `frontend/angular.json` (the `budgets` array in the `production` configuration)
- Modify: whichever feature files the Step 2 command lists

- [ ] **Step 1: Raise the warning budget, with the reason in the file**

In `frontend/angular.json`, the `anyComponentStyle` budget becomes:

```json
{
  "type": "anyComponentStyle",
  "maximumWarning": "6kB",
  "maximumError": "8kB"
}
```

JSON has no comments, so the reason goes in `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` §8.3 (already written) **and** in this commit message. Do not invent a `_comment` key.

The reason, restated so it is not lost: the budget counts **uncompressed** bytes but the wire cost is brotli; `var(--fs-meta)` is eleven characters longer than `11px` and compresses to almost nothing. At 4 kB the budget actively argued for a raw value over its token — M13b's members proof went over budget purely by tokenising two literals. **The 8 kB error is untouched, so genuine bloat still fails.**

**State the cost honestly in the commit:** this silences the three known warnings (`instance-builder.page.ts` +456 B, `tv-shell.page.ts` +256 B, `progress.page.ts` +17 B). They stay filed against M14, Project 2 and M17; the fix is each screen's rebuild, not a bigger budget.

- [ ] **Step 2: List the 36 on-scale sites**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && \
  grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features > /tmp/m13c-t10-sites.txt; \
  wc -l /tmp/m13c-t10-sites.txt; cat /tmp/m13c-t10-sites.txt
```

Expected: **36 lines**. If the count differs, an earlier task changed one — reconcile before editing, and report the difference.

- [ ] **Step 3: Swap each one to its exact token**

| px | token |
|---|---|
| `40px` | `var(--fs-hero)` |
| `20px` | `var(--fs-h2)` |
| `15px` | `var(--fs-body)` |
| `13px` | `var(--fs-sm)` |
| `11px` | `var(--fs-meta)` |

**Only these five values. Do not touch any other size** — 9, 10, 12, 14, 16, 17, 18, 19, 21, 22, 24, 34 and 44px have no token, converting one means *choosing* a nearby size, and that is a visible design decision on a screen nobody is redesigning. They stay, deliberately, as a documented list for M14–M18.

`28px` (`--fs-display`) is absent from the table because it does not occur in features. If you find one, it maps to `var(--fs-display)`.

- [ ] **Step 4: Gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features > /tmp/m13c-t10-gate.txt; echo "lines=$(wc -l < /tmp/m13c-t10-gate.txt)"
grep -rn 'font-size: *[0-9]*px' frontend/src/app/features > /tmp/m13c-t10-remaining.txt; echo "remaining=$(wc -l < /tmp/m13c-t10-remaining.txt)"
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t10.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t10-build.log 2>&1; echo "build exit=$?"
```

Expected: gate file **empty**; `remaining` **51**, every one off-scale; tests `exit=0`; build `exit=0` **with no `anyComponentStyle` warnings at all** — the three known ones now sit under 6 kB.

- [ ] **Step 5: Commit**

```bash
git add frontend/angular.json
git add <the feature files from /tmp/m13c-t10-sites.txt>
git commit -m "chore(ui): raise the style-budget warning to 6kB; tokenise 36 on-scale sizes

The anyComponentStyle warning goes 4kB -> 6kB. The error stays at 8kB, so
genuine bloat still fails. The budget counts uncompressed bytes but the wire
cost is brotli: var(--fs-meta) is eleven characters longer than 11px and
compresses to nothing, so at 4kB the budget was actively arguing for a raw
value over its token — M13b's members proof went over budget purely by
tokenising two literals.

The honest cost: this silences the three known warnings
(instance-builder.page.ts +456 B, tv-shell.page.ts +256 B, progress.page.ts
+17 B). They stay filed against M14, Project 2 and M17; the fix is each
screen's rebuild, not a bigger budget.

36 feature sites whose px value IS on the scale swap to their exact token.
The other 51 do NOT: 17px appears 8 times and no token is 17px, so converting
one means choosing 15 or 20, which is a visible design decision on a screen
nobody is redesigning. Afterwards, grepping font-size in features returns only
off-scale values — a documented list of sizes the scale lacks, handed to
M14-M18 as real questions."
```

---

### Task 11: The gallery

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts` (49 lines)
- Modify: `frontend/src/app/features/dev/dev-gallery.page.spec.ts` (25 lines)

**Interfaces:**
- Consumes: every component from Tasks 1–9.
- Produces: one `data-gallery="<name>"` wrapper per component — the anchor Tasks 12 and 13 target.

- [ ] **Step 1: Keep the two M13b proofs**

`proof-wod-board` and `proof-admin-members` **stay exactly as they are**. They are the language proof and the font-pipeline canary — M13b confirmed the faces load through the real nginx container from `/app/bundle-media/`, which is the exact path class that 404'd for a whole milestone in M5.5. Do not fold them into a component section and do not restyle them.

- [ ] **Step 2: Add one section per component**

Each of the 18 gets:

```html
<section class="gsec" data-gallery="button">
  <h2 class="t-eyebrow" i18n="@@dev.gallery.buttonHeading">Button</h2>
  <div class="states">
    <div class="state"><span class="t-eyebrow-tight" i18n="@@dev.gallery.stateDefault">Default</span>
      <bh-button>Save</bh-button></div>
    <div class="state"><span class="t-eyebrow-tight" i18n="@@dev.gallery.stateDisabled">Disabled</span>
      <bh-button [disabled]="true">Save</bh-button></div>
    <div class="state"><span class="t-eyebrow-tight" i18n="@@dev.gallery.stateLoading">Loading</span>
      <bh-button [loading]="true">Save</bh-button></div>
    <!-- …one .state per state this component can be in… -->
  </div>
</section>
```

**The section IS the seven-state contract** (law §11.1, spec §3.4). A component that cannot have a state renders a `.state` saying so — for example `bh-panel` gets a "Loading: n/a — a panel has no fetch of its own". **An omitted state is indistinguishable from a forgotten one, which is how the state list quietly stopped being true before.**

Hover and active cannot be shown statically. Render those `.state` blocks with a note naming the selector to check by hand (`:hover` climbs the surface ladder, `:active` translates 1px), so the reviewer knows to check rather than assuming they are absent.

Every heading and state label is user-facing text in a real route: **mark all of it**, ids `@@dev.gallery.*`.

- [ ] **Step 3: Extend the spec**

Keep both existing tests verbatim — they assert the volt budget on the two proofs and they still hold. Add:

```ts
it('has a section for every component in the library', async () => {
  await TestBed.configureTestingModule({ imports: [DevGalleryPage] }).compileComponents();
  const f = TestBed.createComponent(DevGalleryPage);
  f.detectChanges();
  const names = Array.from(
    f.nativeElement.querySelectorAll('[data-gallery]') as NodeListOf<HTMLElement>
  ).map(e => e.dataset['gallery']);

  // The full inventory from spec §3. A component added to ui/ without a gallery section is a
  // component with no visual-regression baseline and no axe coverage.
  expect(names.sort()).toEqual([
    'alert', 'avatar', 'button', 'data-table', 'day-pager', 'dock', 'empty', 'field',
    'icon', 'panel', 'pill', 'search-bar', 'segmented', 'select', 'shell-header',
    'switch', 'wordmark',
  ]);
});
```

That is **17** names: `bh-sheet` is the eighteenth and cannot render statically — it is a modal `<dialog>`. Give it a section containing a button that opens it, and exclude it from the list above with a comment saying why.

- [ ] **Step 4: Gates**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-t11.log 2>&1; echo "test exit=$?"
ng build --configuration production > /tmp/m13c-t11-build.log 2>&1; echo "build exit=$?"
```

Expected: tests `exit=0`; build `exit=0`.

- [ ] **Step 5: Open it on a real device**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml up -d --build
```

Open `http://localhost/app/dev/components` at 1440, 768 and 375, and **on a phone on the same network** if you can. This route exists precisely because a static mockup cannot catch a font 404 under the real CSP.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/dev/dev-gallery.page.ts \
        frontend/src/app/features/dev/dev-gallery.page.spec.ts
git commit -m "feat(dev): grow the gallery into the real component gallery

One data-gallery section per component, each rendering every state that
component can be in. The section IS law §11.1's seven-state contract rather
than a doc asserting it: a state that cannot exist says so, because an omitted
state is indistinguishable from a forgotten one.

A spec asserts the section list against the full inventory, so a component
added to ui/ without a gallery section — and therefore with no
visual-regression baseline and no axe coverage — fails the build.

M13b's two proof screens are untouched. They are the language proof and the
font-pipeline canary for the path class that 404'd for a whole milestone."
```

---

### Task 12: axe-core

**Files:**
- Modify: `e2e/package.json` (add `@axe-core/playwright`)
- Create: `e2e/tests/a11y.spec.ts`

- [ ] **Step 1: Install**

```bash
cd e2e && npm install --save-dev @axe-core/playwright
```

Verified 2026-08-06: `@axe-core/playwright@4.12.1` exists.

- [ ] **Step 2: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login } from './_support';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the component gallery has zero WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/app/dev/components');
  await page.waitForSelector('[data-gallery="button"]');

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
});

// The shells are scoped to their CHROME. bh-shell-header and bh-dock are the only components that
// cannot be proven in the gallery, because their failure modes are compositional — focus order
// through a nav, landmark structure, ids duplicated across a header rendered three times.
//
// The scoping is the design, not a convenience: anything axe would report inside a screen BODY is
// out of scope by construction rather than by triage, which is what keeps M13c a component
// milestone instead of a screen-fixing one. Screen bodies belong to M14-M18.
const SHELLS = [
  { who: 'athlete@demo.io', at: '/app/athlete/home' },
  { who: 'coach@demo.io', at: '/app/coach/classes' },
  { who: 'admin@demo.io', at: '/app/admin/dashboard' },
];

for (const shell of SHELLS) {
  test(`${shell.who} shell chrome has zero WCAG 2.2 AA violations`, async ({ page }) => {
    await login(page, shell.who);
    await page.goto(shell.at);

    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include('bh-shell-header')
      .include('bh-dock')
      .analyze();

    expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });
}
```

**Read `e2e/tests/_support.ts` before writing this** — `login()` was deduped out of 8 specs in M12a and its exact signature is there. The call above is a guess at the shape and **must be corrected against the real one**; if it does not match, use the real one rather than changing `_support.ts`.

Mapping violations to `id: N node(s)` rather than asserting `toHaveLength(0)` is deliberate: a failure then names *what* broke in the diff, instead of `expected 3 to be 0`.

- [ ] **Step 3: Run it and expect findings**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml up -d --build && sleep 45 && \
  cd e2e && npx playwright test a11y.spec.ts > /tmp/m13c-t12-axe.log 2>&1; echo "exit=$?"
```

**Expect the first run to fail**, and triage strictly:

- **In a component we built** → fix it in the component, in this task.
- **In a screen body** → impossible by construction; the scoping excludes it. If one appears anyway, the `.include()` is wrong — fix the scoping, not the screen.
- **Ambiguous** → stop and escalate. Do not widen `TAGS`, do not add a `.exclude()`, do not disable a rule. Escalating is the behaviour that caught five real findings in M13b.

- [ ] **Step 4: Prove the test can fail**

A gate never seen fail proves nothing, and this project has shipped exactly that mistake — M13b's font guard passed for a whole milestone while asserting a deleted typeface.

Temporarily add `<img src="/favicon.svg">` (no `alt`) to a gallery section, re-run, and confirm the gallery test fails with `image-alt`. **Then revert it.** Record the observed failure text in the commit message.

- [ ] **Step 5: Commit**

```bash
git add e2e/package.json e2e/package-lock.json e2e/tests/a11y.spec.ts
git commit -m "test(e2e): axe-core gates the gallery and the shell chrome

Zero WCAG 2.2 AA violations. Design law has required AA since M5 and it has
been reviewed by hand ever since.

Two targets, and the scoping IS the design. The gallery whole, because it
renders every component in every state — exactly what M13c owns. The three
shells .include()-scoped to bh-shell-header and bh-dock only, because those
are the two components whose failures are compositional and therefore
invisible in the gallery: focus order through a nav, landmark structure, ids
duplicated across a header rendered three times.

Anything axe would report inside a screen body is out of scope by
construction rather than by triage, which is what keeps this a component
milestone. Screen bodies belong to M14-M18.

Negative control run and reverted: an alt-less img in a gallery section fails
the gallery test with <observed text>."
```

---

### Task 13: Visual regression — **last task, after the components stop moving**

This was cut once with a schedule argument. It lands now because the 18 components are final; baselines churning mid-design is the only real objection to it.

**Files:**
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/tests/visual.spec.ts`
- Create: `e2e/visual.sh`
- Modify: `e2e/package.json` (a script entry)
- Create: baseline PNGs under `e2e/tests/visual.spec.ts-snapshots/`

- [ ] **Step 1: Understand the trap before writing anything**

Playwright suffixes snapshot paths **by platform**. A baseline generated on macOS is `…-darwin.png`; one generated on Linux is `…-linux.png`. Commit macOS baselines and CI sees none of them — the check silently tests nothing. Commit Linux baselines and a local `npx playwright test` fails wholesale.

Two changes resolve it, and both are required:

1. `snapshotPathTemplate` omits `{platform}`, so there is exactly one baseline per component per viewport.
2. The visual spec is **excluded from the default run** and executed only inside the container. A macOS run must never compare against Linux baselines — **that is the failure this task exists to prevent, and the fix is not a looser threshold.**

- [ ] **Step 2: Configure**

`e2e/playwright.config.ts` gains:

```ts
  // One baseline per component per viewport. {platform} is deliberately ABSENT: baselines are
  // generated and enforced inside the Linux container (visual.sh), so a macOS run must never
  // compare against them — and it never does, because visual.spec.ts is excluded below.
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',

  // The default run is the functional suite. Visual regression is container-only.
  testIgnore: process.env.BH_VISUAL ? [] : ['**/visual.spec.ts'],
```

Everything else — `retries: 0`, `workers: 1`, the `baseURL` reading `E2E_BASE_URL` — is untouched. `baseURL` already being env-driven is why the container needs no config of its own.

- [ ] **Step 3: Write the spec**

```ts
import { test, expect } from '@playwright/test';

// Dark only. The BACKLOG entry that requested this said "both themes"; that entry predates M13b,
// which deleted the light theme outright. Corrected in Task 14.
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`component gallery is visually unchanged at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/app/dev/components');

    // Fonts must be settled, or the first baseline captures fallback metrics and every later run
    // diffs against a screenshot of the wrong typeface.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[data-gallery="button"]');

    const sections = page.locator('[data-gallery]');
    const n = await sections.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const section = sections.nth(i);
      const name = await section.getAttribute('data-gallery');
      // Per-section, not per-page: a change to one component churns ONE baseline instead of one
      // 3000px-tall screenshot that tells you nothing about which component moved.
      await expect(section).toHaveScreenshot(`${name}-${vp.name}.png`, {
        animations: 'disabled',
      });
    }
  });
}
```

`animations: 'disabled'` matters: the button spinner and the live pill's pulsing dot are both running animations, and without it every run diffs on a different frame.

- [ ] **Step 4: Write the container runner**

Create `e2e/visual.sh`:

```bash
#!/usr/bin/env bash
# Visual regression runs ONLY here, inside the same Linux renderer that enforces it.
#
# Baselines generated on macOS and enforced on Linux is not a stricter check, it is no check at
# all: Playwright suffixes snapshot paths by platform, so each side silently ignores the other's
# files. snapshotPathTemplate drops {platform}, and this script is the only thing that writes them.
#
#   ./visual.sh          verify against the committed baselines
#   ./visual.sh --update regenerate them (review the diff before committing)
set -euo pipefail

cd "$(dirname "$0")"

# host.docker.internal reaches the compose stack from inside the container. --network host does
# not work on Docker Desktop for macOS, which is why baseURL is env-driven.
docker run --rm \
  -v "$PWD:/e2e" -w /e2e \
  -e BH_VISUAL=1 \
  -e E2E_BASE_URL=http://host.docker.internal \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  npx playwright test visual.spec.ts "$@"
```

```bash
chmod +x e2e/visual.sh
```

**Pin the image tag to the installed Playwright version.** Confirm it before running:

```bash
cd e2e && node -e "console.log(require('@playwright/test/package.json').version)"
```

A container Playwright newer or older than the local one renders differently, which produces baseline churn that looks like a real regression. If the version is not `1.61.1`, use the matching tag and say so in the commit.

- [ ] **Step 5: Generate the baselines**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml up -d --build && sleep 45 && \
  cd e2e && ./visual.sh --update-snapshots > /tmp/m13c-t13-gen.log 2>&1; echo "exit=$?"
```

Then **open several of the generated PNGs and look at them.** A baseline captured mid-load, with fallback fonts, or of an empty section is a baseline that locks in the bug. This is the step that cannot be automated, because the baseline is by definition whatever was rendered.

- [ ] **Step 6: Verify the check actually verifies**

```bash
cd e2e && ./visual.sh > /tmp/m13c-t13-verify.log 2>&1; echo "exit=$?"
```

Expected: `exit=0`, all baselines match.

Now the negative control. Temporarily change one token in `frontend/src/styles/_tokens.scss` — `--r-card: 12px` to `20px` — rebuild the frontend, re-run `./visual.sh`, and confirm the panel and card sections **fail**. **Then revert the token and rebuild.** Record the observed failure in the commit message.

Without this step the suite is 54 screenshots that have never been seen to disagree with anything.

- [ ] **Step 7: Confirm the default run still ignores it**

```bash
cd e2e && npx playwright test > /tmp/m13c-t13-default.log 2>&1; echo "exit=$?"
```

Expected: **28 passed, 1 skipped** — the functional suite, with `visual.spec.ts` not run and no baseline compared on macOS. If a visual test appears here, `testIgnore` is wrong.

- [ ] **Step 8: Commit**

```bash
git add e2e/playwright.config.ts e2e/tests/visual.spec.ts e2e/visual.sh e2e/package.json \
        e2e/tests/visual.spec.ts-snapshots/
git commit -m "test(e2e): visual regression on the gallery, baselines from the Linux renderer

Per component section, three viewports, dark only — the BACKLOG entry said
'both themes' and predates M13b deleting the light theme.

Playwright suffixes snapshot paths by platform, so macOS baselines enforced on
Linux is not a stricter check, it is NO check: each side silently ignores the
other's files. snapshotPathTemplate drops {platform}, visual.sh is the only
thing that writes them, and visual.spec.ts is excluded from the default run so
a macOS npx playwright test can never compare against them.

Per-section rather than per-page: one component changing churns one baseline
instead of one 3000px screenshot that cannot say which component moved.
animations: 'disabled' because the button spinner and the live pill's dot are
both running.

Negative control: --r-card 12px -> 20px fails the panel and card sections with
<observed text>. Reverted. 54 screenshots that have never been seen to
disagree with anything would not be a gate."
```

---

### Task 14: Docs, the milestone gate, and merge — **orchestrator only**

Per `CLAUDE.md`, executors never self-merge.

**Files:**
- Modify: `DESIGN.md`, `docs/HANDOFF.md`, `docs/BACKLOG.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: Run every gate, from a clean tree**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git status --porcelain
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m13c-final-fe.log 2>&1; echo "fe exit=$?"
ng build --configuration production > /tmp/m13c-final-build.log 2>&1; echo "build exit=$?"
cd ../backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m13c-final-be.log 2>&1; echo "be exit=$?"
```

Backend must be **428/0/0** — M13c changes no backend code, so anything else is a real regression. **Never run this concurrently with Karma**; it starves `MailerTest`'s `@Async` assertion.

- [ ] **Step 2: The empty-gate sweep, all eight**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE 'class="[^"]*\bbh-(input|select|table|table-wrap|dock|dock-item)\b' frontend/src/app > /tmp/g1.txt
grep -rnE '\.bh-(input|select|table|dock)\b' frontend/src/styles.scss frontend/src/styles > /tmp/g2.txt
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/g3.txt
grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features > /tmp/g4.txt
grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/ui > /tmp/g5.txt
grep -rn '@Input()\|@Output()' frontend/src/app/ui > /tmp/g6.txt
grep -rn 'StatComponent\|BoardRowComponent\|TagComponent' frontend/src > /tmp/g7.txt
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts > /tmp/g8.txt
wc -l /tmp/g?.txt
```

Every one must be **0**. Baselines on `main` at `70a7565` were 79 / 20 / 18 / 36 / 9 / 35 / 3 / 0 — the first seven fall to zero, the eighth was already zero and is a standing guarantee.

- [ ] **Step 3: e2e on a rebuilt stack, then axe, then visual**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && cp docker/.env.example docker/.env && \
  docker compose -f docker/docker-compose.yml down -v && \
  docker compose -f docker/docker-compose.yml up -d --build && sleep 45 && \
  cd e2e && npx playwright test > /tmp/m13c-final-e2e.log 2>&1; echo "e2e exit=$?"
./visual.sh > /tmp/m13c-final-visual.log 2>&1; echo "visual exit=$?"
```

Expected: **28 passed, 1 skipped** (the quarantined TV timer defect, Project 2's), axe green inside that run, visual green.

- [ ] **Step 4: The impeccable gate**

Law §16: shape → build → critique **≥ 28/40**, no open P0/P1, before merge.

- [ ] **Step 5: Verify M13b's two computed-not-seen claims**

Neither is a component and neither gates this milestone, but the stack is up and each costs minutes:

- **The receipt print block.** Open `/app/receipts/<paymentId>` for a real seeded payment, print to PDF, **open the PDF**. It must be ink on paper, not near-white on white. M13b wrote the CSS and never looked at the output.
- **The mail accent.** Open Mailpit at `http://localhost:8025`, find a verification or receipt mail, and **look at a CTA button**. It must be volt with dark text. White on volt is 1.1:1, and the old templates set `color:#fff` on the accent.

If either is wrong, **file it against M16** (which owns both screens) rather than fixing it here. Record what you saw either way — "verified" and "computed" are different claims, and conflating them is what put this step in the plan.

- [ ] **Step 6: Update the docs**

- **`DESIGN.md`** — the real component inventory, replacing whatever list is there.
- **`docs/HANDOFF.md`** — status, the new test counts, and a new "Immediate next step" pointing at **M13d**. Note that CI's state is still unverified unless runs have resumed.
- **`docs/BACKLOG.md`** — delete the items M13c closed: `bh-stat`'s zero call sites, the budget-versus-tokens tension, `ChangeDetectionStrategy.Eager` (partially — the 45 feature components remain, so **amend rather than delete**), the icon set, the shared shell, admin table card mode, the segmented roving tabindex, the sheet discard focus, the members search debounce, and the two Post-M13 frontend quality gates. **Correct the visual-regression entry's "both themes"** — there is one theme. **Add** the 51 off-scale `font-size` values as a documented list for M14–M18.
- **`.superpowers/sdd/progress.md`** — an M13c section: task → SHA, every executor finding, and every place this plan was wrong. Three of M13b's five findings were errors in the orchestrator's own briefs, and recording them is why the next milestone's briefs are better.

- [ ] **Step 7: Merge**

```bash
git checkout main && git merge --no-ff m13c-component-library
```

Then push and **check the Actions tab**. CI stopped scheduling runs on 2026-08-06 (a private repo on a free plan, almost certainly exhausted minutes), so **an empty run list means "nothing ran", not "nothing broke"**. If no run appears, say so in the hand-off rather than reporting green.

---

## Self-review

**Spec coverage.** Every section of `2026-08-06-m13c-component-library-design.md` maps to a task: §3.1 → Tasks 2, 9; §3.2 → Tasks 1, 3, 4, 5, 6, 7, 8; §3.3 → Task 9; §3.4 → Task 11; §3.5 → Task 9 Step 1; §3.6 → Tasks 1, 6; §3.7 → Task 4; §4 → all tasks via Global Constraints; §5 → Task 1; §6.1–6.3 → Tasks 3, 5, 6, 7, 8; §6.4 → Tasks 9, 10; §7 → Task 11; §8.1 → every task's gate step plus Task 14 Step 2; §8.2 → Task 14; §8.3 → Task 10; §8.4 → Task 12; §8.5 → Task 13; §9 → the exclusions stated throughout; §9.1 → Task 14 Step 5; §10 → Global Constraints; §11 → Tasks 5, 4, 8 respectively.

**Spec §11's three open items are each resolved in the task that meets them**, with the reasoning at the point of decision: `bh-data-table`'s card mode is a `data-label` opt-in rather than a second component (Task 5 Step 4); `bh-alert` and `bh-empty` stay separate because the ARIA role differs by tone (Task 4 Step 3); the debounce is 250ms, measured first (Task 8 Step 1).

**Type consistency.** `IconName` is defined once in Task 1 and consumed by Tasks 4, 6, 8, 9. `DockTab` is defined in Task 6. `SegOption` in Task 7. `value` is a `model()` on field, select, segmented, switch, search-bar and day-pager; `checked` on switch; `offset` on day-pager. No task references a symbol another task does not export.

**Counts.** Spec counts are carried verbatim and every one was measured on `main` at `70a7565`: 79 global-CSS call sites, 18 raw px in `ui/`, 36 on-scale px in features, 51 off-scale, 9 `Eager` in `ui/`, 35 decorators in `ui/`, 3 dead components, 0 raw hex outside the print block. Running spec totals, derived from the measured per-file `it()` counts on `main` (button 2, day-pager 2, field 2, pill 1, sheet 5, timer 5): 182 → 184 → 185 (T1 review fix) → 188 → 194 → 199 → 202 → 209 → 217 → 221 → ~224+. **Treat these as expectations, not assertions** — a divergence means a step added or replaced a spec and should be reconciled, not forced.

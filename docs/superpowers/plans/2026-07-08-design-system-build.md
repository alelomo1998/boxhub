# Design System Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Execution is LEAN: batch the tasks below as written (each task already groups several components), one review pass per task, deep review only where noted. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the raw-HTML BoxHub frontend into the warm-dark broadcast/heritage design system: token file, embedded fonts, theme service, shared `bh-*` components, and every existing screen restyled against them.

**Architecture:** One SCSS token file is the single source of truth for color/type/spacing (both themes). Fonts self-hosted via `@fontsource` (the real app has no font-CDN CSP — the data-URI note in the design law was artifact-only; self-hosted woff2 bundled by Angular is the correct, cleaner path). A theme service toggles `data-theme` on `<html>` (dark default, persisted). Presentational logic lives in small standalone `bh-*` components with fixed APIs; screens consume them and never re-implement their markup.

**Tech Stack:** Angular 19 (standalone, signals), SCSS, `@fontsource/saira-condensed` + `@fontsource/archivo`, Karma specs, Playwright.

## Global Constraints (from design law — `docs/superpowers/specs/2026-07-08-design-system-design.md`)

- **Tokens only.** No raw hex / font / radius / spacing value anywhere except `frontend/src/styles/_tokens.scss`. Components and screens reference `var(--…)`. A raw hex outside the token file is a defect.
- **Warm dark is the home theme** (`--ground: #17120D`). Light is first-class but dark is default. Toggle sets `data-theme`; explicit choice wins over OS in both directions; persist in localStorage.
- **Race red (`--red`) is the only accent** — live / primary / winning only. Never decorative or a status fill.
- **Glow rationed** to primary-button hover, live indicator, focus ring. No gradients, drop-shadows-for-energy, fake textures.
- **Numbers tabular** (`font-variant-numeric: tabular-nums`) for times/loads/reps/ranks/dates/counts.
- **Respect `prefers-reduced-motion`** — all motion disables under it.
- Type: display = Saira Condensed (600/700/800), body/UI = Archivo (400/500/700), eyebrows = system `ui-monospace`.
- Radius single value `--edge: 4px`. Layout editorial (rules + margins), tables read as league boards.
- Angular standalone components + signals. Backend build needs `JAVA_HOME=/opt/homebrew/opt/openjdk@21` (not touched here). Node 26 warnings ignored. Conventional commits. Never commit `.DS_Store`. Work on branch `design-system`.
- Karma test command: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`. Build: `npm run build`.

---

### Task 1: Tokens, fonts, global base, theme service

**Files:**
- Create: `frontend/src/styles/_tokens.scss`
- Create: `frontend/src/styles/_fonts.scss`
- Modify: `frontend/src/styles.scss`
- Modify: `frontend/angular.json` (add @fontsource css to styles array)
- Create: `frontend/src/app/core/theme/theme.service.ts`
- Test: `frontend/src/app/core/theme/theme.service.spec.ts`
- Modify: `frontend/src/app/app.component.ts` (init theme on startup)

**Interfaces:**
- Consumes: nothing
- Produces:
  - CSS custom properties (dark on `:root`, light overrides) — exact names/values below. All later CSS uses these.
  - `ThemeService` — signal `theme: Signal<'dark'|'light'>`; methods `toggle(): void`, `set(t: 'dark'|'light'): void`; on construction reads `localStorage['bh_theme']` (default `'dark'`) and sets `document.documentElement.dataset.theme`; `toggle`/`set` update the attribute, the signal, and localStorage.
  - Font families available: `--font-display` (Saira Condensed), `--font-body` (Archivo), `--font-mono` (system).

- [ ] **Step 1: Install fonts**

Run: `cd frontend && npm i @fontsource/saira-condensed @fontsource/archivo`
Expected: added to package.json + package-lock.json.

- [ ] **Step 2: Write `_tokens.scss`** (the ONLY place raw values live)

`frontend/src/styles/_tokens.scss`:
```scss
:root {
  /* DARK — home theme. Warm espresso near-black, never cold blue-black. */
  --ground: #17120d;
  --surface: #201a13;
  --surface-2: #2a231a;
  --hairline: #3a3124;
  --bone: #ece3d2;
  --bone-dim: #a99d86;
  --faint: #6f6552;
  --red: #ec4326;
  --on-red: #ffffff;
  --red-glow: rgba(236, 67, 38, 0.38);
  --good: #63a45f;
  --warn: #e0a32e;

  --font-display: "Saira Condensed", system-ui, sans-serif;
  --font-body: "Archivo", system-ui, -apple-system, sans-serif;
  --font-mono: "SF Mono", ui-monospace, "Menlo", monospace;

  --edge: 4px;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 40px; --sp-10: 64px;
}

@mixin light-tokens {
  --ground: #f1ece0;
  --surface: #f9f5ea;
  --surface-2: #eee7d6;
  --hairline: #d9d0be;
  --bone: #1a1712;
  --bone-dim: #5f5849;
  --faint: #8a806c;
  --red: #d5351d;
  --red-glow: rgba(213, 53, 29, 0.16);
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { @include light-tokens; }
}
:root[data-theme="light"] { @include light-tokens; }
:root[data-theme="dark"] { /* dark base already on :root; explicit wins over OS */ }
```

- [ ] **Step 3: Write `_fonts.scss`** (self-hosted @font-face via @fontsource css imports done in angular.json; here define the type-scale helper classes)

`frontend/src/styles/_fonts.scss`:
```scss
/* @fontsource css (woff2, self-hosted) is added via angular.json styles.
   Type-scale utility classes — used by components/screens, all token-driven. */
.t-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--faint); }
.t-display { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.9; }
.t-h2 { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 30px; letter-spacing: -0.01em; }
.t-h3 { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 20px; letter-spacing: -0.005em; }
.t-figure { font-family: var(--font-body); font-weight: 700; font-variant-numeric: tabular-nums; }
.t-body { font-family: var(--font-body); font-weight: 400; }
.num { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Wire global styles** — replace `frontend/src/styles.scss` contents:
```scss
@use "styles/tokens";
@use "styles/fonts";

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--ground);
  color: var(--bone);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--red); text-decoration: none; }
:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; } }
```
Note: `@use "styles/tokens"` resolves `src/styles/_tokens.scss` because `src` is a Sass load path in Angular by default; if the build can't resolve it, use relative `@use "./styles/tokens"`.

- [ ] **Step 5: Add fonts to `angular.json`** — in `projects.frontend.architect.build.options.styles`, add before `src/styles.scss`:
```json
"node_modules/@fontsource/saira-condensed/600.css",
"node_modules/@fontsource/saira-condensed/700.css",
"node_modules/@fontsource/saira-condensed/800.css",
"node_modules/@fontsource/archivo/400.css",
"node_modules/@fontsource/archivo/500.css",
"node_modules/@fontsource/archivo/700.css",
```

- [ ] **Step 6: Write the failing theme service test**

`frontend/src/app/core/theme/theme.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  it('defaults to dark and sets data-theme', () => {
    const s = TestBed.inject(ThemeService);
    expect(s.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('toggle flips theme, persists, updates attribute', () => {
    const s = TestBed.inject(ThemeService);
    s.toggle();
    expect(s.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('bh_theme')).toBe('light');
  });

  it('restores persisted theme on construction', () => {
    localStorage.setItem('bh_theme', 'light');
    const s = TestBed.inject(ThemeService);
    expect(s.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
```

- [ ] **Step 7: Run to verify fail**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — ThemeService not found.

- [ ] **Step 8: Implement ThemeService**

`frontend/src/app/core/theme/theme.service.ts`:
```ts
import { Injectable, signal } from '@angular/core';

type Theme = 'dark' | 'light';
const KEY = 'bh_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  constructor() {
    const saved = localStorage.getItem(KEY) as Theme | null;
    this.apply(saved === 'light' ? 'light' : 'dark');
  }

  toggle(): void { this.apply(this.theme() === 'dark' ? 'light' : 'dark'); }
  set(t: Theme): void { this.apply(t); }

  private apply(t: Theme): void {
    this.theme.set(t);
    document.documentElement.dataset['theme'] = t;
    localStorage.setItem(KEY, t);
  }
}
```

- [ ] **Step 9: Init theme at app startup** — in `frontend/src/app/app.component.ts`, inject ThemeService so it constructs on boot. Add to the component class:
```ts
  private theme = inject(ThemeService);
```
(add `import { inject } from '@angular/core';` if missing and `import { ThemeService } from './core/theme/theme.service';`). No template change.

- [ ] **Step 10: Run tests + build**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`
Expected: theme specs pass, existing specs stay green, build succeeds (fonts bundled). If SCSS `@use` path errors, switch to `@use "./styles/tokens"` / `"./styles/fonts"`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/styles frontend/src/styles.scss frontend/angular.json frontend/src/app/core/theme frontend/src/app/app.component.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(design): tokens, self-hosted fonts, warm-dark theme service"
```

---

### Task 2: Core input components — bh-button, bh-field

**Files:**
- Create: `frontend/src/app/ui/button.component.ts`
- Create: `frontend/src/app/ui/field.component.ts`
- Test: `frontend/src/app/ui/button.component.spec.ts`
- Test: `frontend/src/app/ui/field.component.spec.ts`

**Interfaces:**
- Consumes: tokens (Task 1)
- Produces:
  - `ButtonComponent` selector `bh-button` — inputs `variant: 'primary'|'ghost' = 'primary'`, `size: 'md'|'sm' = 'md'`, `type: 'button'|'submit' = 'button'`, `disabled = false`; projects content; renders a native `<button>`; host emits native clicks. Primary = red bg + `--on-red`, hover box-shadow `0 6px 24px var(--red-glow)`. Ghost = transparent + hairline border.
  - `FieldComponent` selector `bh-field` — inputs `label: string`, `type = 'text'`, `value = ''`, `placeholder = ''`, `error?: string`; output `valueChange: EventEmitter<string>`; renders mono uppercase label + token-styled input (focus → red border + `0 0 0 3px var(--red-glow)`); shows `error` in `--red` when present.

- [ ] **Step 1: Write failing specs**

`frontend/src/app/ui/button.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({ standalone: true, imports: [ButtonComponent],
  template: `<bh-button [variant]="v" (click)="clicks=clicks+1">Go</bh-button>` })
class Host { v: 'primary'|'ghost' = 'primary'; clicks = 0; }

describe('ButtonComponent', () => {
  it('renders projected content and a native button', () => {
    const f = TestBed.createComponent(Host); f.detectChanges();
    const btn = f.nativeElement.querySelector('button');
    expect(btn.textContent.trim()).toBe('Go');
  });
  it('applies variant class', () => {
    const f = TestBed.createComponent(Host); f.detectChanges();
    expect(f.nativeElement.querySelector('button').className).toContain('primary');
    f.componentInstance.v = 'ghost'; f.detectChanges();
    expect(f.nativeElement.querySelector('button').className).toContain('ghost');
  });
});
```

`frontend/src/app/ui/field.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { FieldComponent } from './field.component';

describe('FieldComponent', () => {
  it('renders label and emits valueChange on input', () => {
    const f = TestBed.createComponent(FieldComponent);
    f.componentRef.setInput('label', 'Email');
    let emitted = '';
    f.componentInstance.valueChange.subscribe((v: string) => (emitted = v));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Email');
    const input = f.nativeElement.querySelector('input');
    input.value = 'a@b.io'; input.dispatchEvent(new Event('input'));
    expect(emitted).toBe('a@b.io');
  });
  it('shows error text when set', () => {
    const f = TestBed.createComponent(FieldComponent);
    f.componentRef.setInput('label', 'Email');
    f.componentRef.setInput('error', 'Required');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Required');
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test …` → components not found.

- [ ] **Step 3: Implement button**

`frontend/src/app/ui/button.component.ts`:
```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-button',
  standalone: true,
  template: `<button [type]="type" [class]="'btn ' + variant + ' ' + size" [disabled]="disabled"><ng-content /></button>`,
  styles: [`
    .btn { border: none; border-radius: var(--edge); font-family: var(--font-body);
      font-weight: 700; font-size: 14px; letter-spacing: 0.01em; cursor: pointer; }
    .btn.sm { padding: 8px 13px; font-size: 13px; }
    .btn.md { padding: 11px 17px; }
    .btn.primary { background: var(--red); color: var(--on-red); transition: box-shadow .18s; }
    .btn.primary:hover:not(:disabled) { box-shadow: 0 6px 24px var(--red-glow); }
    .btn.ghost { background: transparent; color: var(--bone); border: 1px solid var(--hairline); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
  `],
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'ghost' = 'primary';
  @Input() size: 'md' | 'sm' = 'md';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
}
```

- [ ] **Step 4: Implement field**

`frontend/src/app/ui/field.component.ts`:
```ts
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'bh-field',
  standalone: true,
  template: `
    <label class="field">
      <span class="lab">{{ label }}</span>
      <input class="input" [type]="type" [value]="value" [placeholder]="placeholder"
             (input)="valueChange.emit($any($event.target).value)" />
      @if (error) { <span class="err">{{ error }}</span> }
    </label>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .input { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 11px 13px; color: var(--bone);
      font-family: var(--font-body); font-size: 15px; }
    .input::placeholder { color: var(--faint); }
    .input:focus { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }
    .err { color: var(--red); font-size: 12px; }
  `],
})
export class FieldComponent {
  @Input() label = '';
  @Input() type = 'text';
  @Input() value = '';
  @Input() placeholder = '';
  @Input() error?: string;
  @Output() valueChange = new EventEmitter<string>();
}
```

- [ ] **Step 5: Run tests + build** — all pass, build green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/ui
git commit -m "feat(design): bh-button and bh-field components"
```

---

### Task 3: Presentational atoms — bh-pill, bh-tag, bh-stat, bh-board-row

**Files:**
- Create: `frontend/src/app/ui/pill.component.ts`
- Create: `frontend/src/app/ui/tag.component.ts`
- Create: `frontend/src/app/ui/stat.component.ts`
- Create: `frontend/src/app/ui/board-row.component.ts`
- Test: `frontend/src/app/ui/pill.component.spec.ts`

**Interfaces:**
- Consumes: tokens
- Produces:
  - `PillComponent` `bh-pill` — inputs `tone: 'active'|'suspended'|'live'|'warn'`, `label: string`. `live` = red bg + pulse dot + glow; `active` = good; `suspended` = faint; `warn` = amber. Dot pulse disabled under reduced-motion (global rule handles it).
  - `TagComponent` `bh-tag` — projects content; mono, dim (roles/scaling).
  - `StatComponent` `bh-stat` — inputs `label: string`, `value: string`, `unit?: string`, `accent = false`. Big tabular figure; `accent` → red.
  - `BoardRowComponent` `bh-board-row` — inputs `rank: number|string`, `name: string`, `score: string`, `rx = false`, `lead = false`. Leaderboard unit; `lead` → red rank.

- [ ] **Step 1: Write failing pill spec** (representative; atoms are trivial, one spec covers the tone→class contract)

`frontend/src/app/ui/pill.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { PillComponent } from './pill.component';

describe('PillComponent', () => {
  it('renders label and tone class', () => {
    const f = TestBed.createComponent(PillComponent);
    f.componentRef.setInput('tone', 'live');
    f.componentRef.setInput('label', 'Live now');
    f.detectChanges();
    const el = f.nativeElement.querySelector('.pill');
    expect(el.className).toContain('live');
    expect(el.textContent).toContain('Live now');
  });
});
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement the four atoms**

`frontend/src/app/ui/pill.component.ts`:
```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-pill',
  standalone: true,
  template: `<span class="pill {{ tone }}"><span class="d"></span>{{ label }}</span>`,
  styles: [`
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
      border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
    .d { width: 6px; height: 6px; border-radius: 50%; }
    .active { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent);
      background: color-mix(in srgb, var(--good) 13%, transparent); }
    .active .d { background: var(--good); }
    .suspended { color: var(--faint); border-color: var(--hairline); }
    .suspended .d { background: var(--faint); }
    .warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 34%, transparent);
      background: color-mix(in srgb, var(--warn) 14%, transparent); }
    .warn .d { background: var(--warn); }
    .live { color: var(--on-red); background: var(--red); box-shadow: 0 0 14px var(--red-glow); }
    .live .d { background: var(--on-red); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  `],
})
export class PillComponent {
  @Input() tone: 'active' | 'suspended' | 'live' | 'warn' = 'active';
  @Input() label = '';
}
```

`frontend/src/app/ui/tag.component.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-tag',
  standalone: true,
  template: `<span class="tag"><ng-content /></span>`,
  styles: [`.tag { font-family: var(--font-mono); font-size: 12px; color: var(--bone-dim); letter-spacing: 0.04em; }`],
})
export class TagComponent {}
```

`frontend/src/app/ui/stat.component.ts`:
```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-stat',
  standalone: true,
  template: `
    <div class="stat">
      <span class="k">{{ label }}</span>
      <span class="v" [class.accent]="accent">{{ value }}@if (unit) { <span class="u">{{ unit }}</span> }</span>
    </div>`,
  styles: [`
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
    .v { font-family: var(--font-body); font-weight: 700; font-variant-numeric: tabular-nums;
      font-size: 46px; line-height: 1; letter-spacing: -0.01em; color: var(--bone); }
    .v.accent { color: var(--red); }
    .u { font-size: 15px; color: var(--bone-dim); font-weight: 500; }
  `],
})
export class StatComponent {
  @Input() label = '';
  @Input() value = '';
  @Input() unit?: string;
  @Input() accent = false;
}
```
Note: `*ngIf` requires `CommonModule`; instead use `@if`. Replace the `<span class="u" *ngIf="unit">` line with `@if (unit) { <span class="u">{{ unit }}</span> }` (no import needed with Angular control flow).

`frontend/src/app/ui/board-row.component.ts`:
```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-board-row',
  standalone: true,
  template: `
    <div class="row" [class.lead]="lead">
      <span class="rank">{{ rank }}</span>
      <span class="nm">{{ name }}@if (rx) { <span class="rx">RX</span> }</span>
      <span class="sc">{{ score }}</span>
    </div>`,
  styles: [`
    .row { display: flex; align-items: center; gap: 14px; padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .rank { font-family: var(--font-display); font-weight: 800; font-size: 22px; width: 30px;
      color: var(--faint); font-variant-numeric: tabular-nums; }
    .lead .rank { color: var(--red); }
    .nm { flex: 1; font-family: var(--font-display); font-weight: 800; text-transform: uppercase;
      font-size: 20px; letter-spacing: -0.01em; }
    .rx { font-family: var(--font-mono); font-size: 10px; color: var(--red);
      border: 1px solid color-mix(in srgb, var(--red) 45%, transparent); border-radius: 3px; padding: 1px 5px; margin-left: 8px; }
    .sc { font-family: var(--font-body); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 20px; }
  `],
})
export class BoardRowComponent {
  @Input() rank: number | string = '';
  @Input() name = '';
  @Input() score = '';
  @Input() rx = false;
  @Input() lead = false;
}
```

- [ ] **Step 4: Run tests + build** — pass, green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/ui
git commit -m "feat(design): bh-pill, bh-tag, bh-stat, bh-board-row atoms"
```

---

### Task 4: App shell components + table styling — bh-panel, bh-rail, bh-nav-item, .bh-table

**Files:**
- Create: `frontend/src/app/ui/panel.component.ts`
- Create: `frontend/src/app/ui/rail.component.ts` (exports `RailComponent` `bh-rail` + `NavItemComponent` `bh-nav-item`)
- Create: `frontend/src/styles/_table.scss`
- Modify: `frontend/src/styles.scss` (add `@use "styles/table";`)
- Test: `frontend/src/app/ui/rail.component.spec.ts`

**Interfaces:**
- Consumes: tokens
- Produces:
  - `PanelComponent` `bh-panel` — projects content; surface + hairline + `--edge`; input `padded = true`.
  - `RailComponent` `bh-rail` — projects nav items + a brand slot; the left rail chrome (border-right, padding, flex column). On narrow screens becomes a horizontal scroller.
  - `NavItemComponent` `bh-nav-item` — inputs `label: string`, `active = false`, `link?: string` (routerLink). Active = surface-2 bg + red left-border.
  - `.bh-table` SCSS class set — league-board table: `thead th` mono uppercase faint with 2px bottom rule; `td` hairline rows; helper classes `.bh-table .mname` (display caps), `.bh-table .memail` (mono faint), `.bh-table .num` (tabular).

- [ ] **Step 1: Write failing rail spec**

`frontend/src/app/ui/rail.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RailComponent, NavItemComponent } from './rail.component';

@Component({ standalone: true, imports: [RailComponent, NavItemComponent],
  template: `<bh-rail><bh-nav-item label="Members" [active]="true" link="/admin/members" /></bh-rail>` })
class Host {}

describe('RailComponent', () => {
  it('renders nav item label with active class', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(Host); f.detectChanges();
    const item = f.nativeElement.querySelector('.nav-item');
    expect(item.textContent).toContain('Members');
    expect(item.className).toContain('active');
  });
});
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement panel + rail + nav-item**

`frontend/src/app/ui/panel.component.ts`:
```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-panel',
  standalone: true,
  template: `<div class="panel" [class.padded]="padded"><ng-content /></div>`,
  styles: [`
    .panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--edge); }
    .panel.padded { padding: var(--sp-6); }
  `],
})
export class PanelComponent { @Input() padded = true; }
```

`frontend/src/app/ui/rail.component.ts`:
```ts
import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'bh-rail',
  standalone: true,
  template: `<nav class="rail"><ng-content /></nav>`,
  styles: [`
    .rail { border-right: 1px solid var(--hairline); padding: var(--sp-5) var(--sp-4);
      display: flex; flex-direction: column; gap: 3px; }
    @media (max-width: 720px) {
      .rail { flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--hairline); }
    }
  `],
})
export class RailComponent {}

@Component({
  selector: 'bh-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (link) {
      <a class="nav-item" [class.active]="active" [routerLink]="link" routerLinkActive="active">{{ label }}</a>
    } @else {
      <span class="nav-item" [class.active]="active">{{ label }}</span>
    }`,
  styles: [`
    .nav-item { display: block; padding: 9px 12px; border-radius: var(--edge); color: var(--bone-dim);
      font-size: 14px; font-weight: 500; border-left: 2px solid transparent; margin-left: -2px; cursor: pointer; }
    .nav-item.active { background: var(--surface-2); color: var(--bone); border-left-color: var(--red); }
  `],
})
export class NavItemComponent {
  @Input() label = '';
  @Input() active = false;
  @Input() link?: string;
}
```

- [ ] **Step 4: Write table SCSS**

`frontend/src/styles/_table.scss`:
```scss
.bh-table-wrap { overflow-x: auto; }
.bh-table { border-collapse: collapse; width: 100%; font-size: 14px; }
.bh-table thead th { text-align: left; padding: 9px 12px; font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint);
  font-weight: 500; border-bottom: 2px solid var(--hairline); }
.bh-table tbody td { padding: 13px 12px; border-bottom: 1px solid var(--hairline); }
.bh-table tbody tr:last-child td { border-bottom: none; }
.bh-table .mname { font-family: var(--font-display); font-weight: 800; text-transform: uppercase;
  font-size: 17px; letter-spacing: -0.005em; }
.bh-table .memail { color: var(--faint); font-size: 12px; font-family: var(--font-mono); }
.bh-table .num { font-family: var(--font-body); font-variant-numeric: tabular-nums; }
```
Add `@use "styles/table";` to `styles.scss` after the fonts line.

- [ ] **Step 5: Run tests + build** — pass, green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/ui frontend/src/styles/_table.scss frontend/src/styles.scss
git commit -m "feat(design): bh-panel, bh-rail/nav-item, league-board table styles"
```

---

### Task 5: Restyle auth screens — login + box-picker

**Files:**
- Modify: `frontend/src/app/features/auth/login.page.ts`
- Modify: `frontend/src/app/features/auth/box-picker.page.ts`

**Interfaces:**
- Consumes: `ButtonComponent`, `FieldComponent`, `ThemeService`
- Produces: same behavior/`data-testid`s as today (`login-form`? the e2e uses `input[name="email"]`, `input[name="password"]`, `button[type="submit"]`, `login-error`) — **preserve those selectors** so `e2e/tests/login.spec.ts` keeps passing. Visual = design system.

- [ ] **Step 1: Restyle login** — replace `login.page.ts` template + styles, keep the component class logic. CRITICAL: keep `input[name="email"]`, `input[name="password"]`, `button[type="submit"]`, and `data-testid="login-error"` so existing e2e passes. Because e2e depends on native `name` attributes, use plain styled `<input>` here (not bh-field) OR ensure bh-field forwards `name`. Simplest safe path: use native inputs styled with the token classes + `<bh-button type="submit">`:
```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'bh-login',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <form class="card" (ngSubmit)="submit()">
        <div class="brand"><span class="mark">B</span><span class="name">BoxHub</span></div>
        <label class="f"><span>EMAIL</span>
          <input name="email" type="email" [(ngModel)]="email" required placeholder="you@email.com"></label>
        <label class="f"><span>PASSWORD</span>
          <input name="password" type="password" [(ngModel)]="password" required></label>
        @if (error()) { <p class="error" data-testid="login-error">{{ error() }}</p> }
        <bh-button type="submit">Log in</bh-button>
        <p class="cta">No account? <a href="/auth/login">Join with your box invite link.</a></p>
      </form>
    </main>`,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-4); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: var(--sp-2); }
    .mark { width: 34px; height: 34px; border-radius: var(--edge); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 21px; }
    .name { font-family: var(--font-display); font-weight: 800; font-size: 19px; text-transform: uppercase; letter-spacing: 0.02em; }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .f input { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 11px 13px; color: var(--bone); font-family: var(--font-body); font-size: 15px; }
    .f input:focus { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }
    .error { color: var(--red); font-size: 13px; margin: 0; }
    .cta { text-align: center; color: var(--bone-dim); font-size: 13px; margin: 0; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = ''; password = ''; error = signal('');
  submit() {
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        if (res.memberships.length === 1) {
          const m = res.memberships[0];
          this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
        } else { this.router.navigateByUrl('/auth/boxes'); }
      },
      error: () => this.error.set('Invalid email or password'),
    });
  }
}
```
NOTE: preserve the actual current login logic if it differs (e.g. returnUrl handling from M1-T14). Read the current file first and keep ALL its behavior — only swap the template/styles. If returnUrl logic exists, keep it.

- [ ] **Step 2: Restyle box-picker** — apply the same card/token treatment; keep the `data-testid="box-<slug>"` buttons and behavior. Read current file, swap presentation only, use `<bh-button>` for the box buttons.

- [ ] **Step 3: Run e2e-relevant checks + build**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`
Expected: specs green, build green. (Full e2e runs in Task 7 against compose.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/auth
git commit -m "feat(design): restyle login and box-picker on the design system"
```

---

### Task 6: Restyle admin — shell nav, members, invites, plans, settings

**Files:**
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts`
- Modify: `frontend/src/app/features/admin/members.page.ts`
- Modify: `frontend/src/app/features/admin/invites.page.ts`
- Modify: `frontend/src/app/features/admin/plans.page.ts`
- Modify: `frontend/src/app/features/admin/settings.page.ts`

**Interfaces:**
- Consumes: `bh-rail`/`bh-nav-item`, `bh-button`, `bh-pill`, `bh-tag`, `.bh-table`, `ThemeService`
- Produces: same behavior + all existing `data-testid`s preserved (member-search, member-`<email>`, expiring, invite-*, plan-*, settings-*). Visual = design system. Admin shell gains a theme toggle button (calls `ThemeService.toggle()`).

- [ ] **Step 1: Restyle admin-shell** — use `bh-rail` + `bh-nav-item` (links to children), brand block, and a small theme toggle in the rail footer. Read current file; keep `<router-outlet />` and the child nav structure. Example shell template:
```ts
// imports: RouterOutlet, RailComponent, NavItemComponent, inject ThemeService
template: `
  <div class="admin">
    <bh-rail>
      <div class="brand"><span class="mark">B</span><span class="nm">BoxHub</span></div>
      <bh-nav-item label="Members" link="members" />
      <bh-nav-item label="Invites" link="invites" />
      <bh-nav-item label="Plans" link="plans" />
      <bh-nav-item label="Settings" link="settings" />
      <button class="theme" (click)="theme.toggle()">◐ theme</button>
    </bh-rail>
    <main class="content"><router-outlet /></main>
  </div>`
```
with `.admin { display: grid; grid-template-columns: 210px 1fr; min-height: 100vh; }` and tokenized brand/theme styles (mirror the login brand). `theme` is `inject(ThemeService)` (public).

- [ ] **Step 2: Restyle members** — replace the raw table with `<table class="bh-table">` inside `.bh-table-wrap`; member name → `<td><div class="mname">…</div><div class="memail">…</div></td>`; role → `<bh-tag>`; status select stays functional but wrap the current value display with `<bh-pill [tone]="…" [label]="…">` where read-only, keeping the inline `<select>` for editing (preserve patch behavior + testids). Expiring badge → `<bh-pill tone="warn" label="expiring">`. Search input keeps `data-testid="member-search"`. Title uses `.t-h2`.

- [ ] **Step 3: Restyle invites, plans, settings** — wrap each in a titled section (`.t-h2` heading), forms use native inputs styled like login's `.f` (or `bh-field` where no `name`-selector constraint), actions use `<bh-button>`. Invites: the link box + Copy button styled with tokens, `bh-button` for create/copy/revoke. Plans: list + create form + archive `bh-button`. Settings: form + save `bh-button` + saved indicator. PRESERVE every existing `data-testid` and all behavior — read each file, swap presentation only.

- [ ] **Step 4: Run specs + build**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`
Expected: 12 specs green, build green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/admin
git commit -m "feat(design): restyle admin shell and pages on the design system"
```

---

### Task 7: Restyle join page + verification (both themes, motion, no raw hex, e2e)

**Files:**
- Modify: `frontend/src/app/features/join/join.page.ts`
- Modify: `frontend/src/app/features/athlete/athlete-shell.page.ts`, `coach/coach-shell.page.ts`, `tv/tv-shell.page.ts` (placeholder shells — give them a minimal on-brand empty state, still placeholders)
- Test: `e2e/tests/theme.spec.ts`

**Interfaces:**
- Consumes: all `bh-*` components, tokens
- Produces: join page on the design system (keep testids join-name/email/password/register/accept/error/invalid + returnUrl link); role shells show a branded "coming soon" placeholder; a Playwright check that the theme toggle flips `data-theme` and the ground color changes.

- [ ] **Step 1: Restyle join page** — read current file, keep ALL logic (preview, register-and-join chain, acceptExisting, error/invalid signals, testids), swap template/styles to the card/token treatment + `bh-button`.

- [ ] **Step 2: Brand the placeholder shells** — athlete/coach/tv shells: replace bare `<h1>` with a centered branded empty state using `.t-display` + a muted line, e.g. `<main class="soon"><h1 class="t-display">Athlete</h1><p>Your WODs and PRs land here soon.</p></main>`. Still placeholders; just not raw.

- [ ] **Step 3: Guard against raw hex** — run a check that no hex literal exists in component styles outside the token file:

Run: `cd frontend && grep -rnE '#[0-9a-fA-F]{3,6}\b' src/app src/styles.scss | grep -v '_tokens.scss' || echo "clean: no raw hex outside tokens"`
Expected: `clean` (or only token file). If any hex found in a component, replace with the appropriate `var(--…)` token. `color-mix(... var(--x) ...)` is allowed (not a raw hex).

- [ ] **Step 4: Write e2e theme check**

`e2e/tests/theme.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('app boots dark and login renders on warm ground', async ({ page }) => {
  await page.goto('/auth/login');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // warm near-black #17120D → rgb(23, 18, 13)
  expect(bg).toBe('rgb(23, 18, 13)');
});
```

- [ ] **Step 5: Run full verification against a rebuilt stack**

```bash
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```
Expected: all specs pass — existing login/admin/invite flows (selectors preserved) + the new theme check. Then `docker compose -f docker/docker-compose.yml down`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features e2e/tests/theme.spec.ts
git commit -m "feat(design): restyle join + branded placeholder shells, theme e2e check"
```

---

## Design-law coverage check

- Tokens only / single token file — Task 1 (`_tokens.scss`), enforced by Task 7 Step 3 grep.
- Warm dark home theme + light + toggle + persist — Task 1 (ThemeService, tokens), Task 6 (toggle in shell), Task 7 (e2e proof).
- Race red only accent; glow rationed — encoded in every component's styles (primary hover, live pill, focus ring only).
- Numbers tabular — `.num`, stat, board-row, table `.num`.
- reduced-motion — global rule in `styles.scss` (Task 1).
- Fonts Saira Condensed + Archivo, self-hosted — Task 1 (correction: @fontsource, not data-URI; no app CSP).
- Component inventory §9 — Tasks 2–4 (table delivered as `.bh-table` class set rather than a component: deliberate lean choice, class names are the stable contract).
- Identity in hero screens — hero surfaces are M2+ milestone work; this plan styles plumbing + restyles existing screens only.

## M0/M1 e2e safety
Existing e2e depends on: `input[name="email"]`, `input[name="password"]`, `button[type="submit"]`, `login-error`, `box-<slug>`, `member-search`, `member-<email>`, `expiring`, `invite-email/create/link/copy/revoke-<email>`, `plan-name/create/archive-<name>`, `settings-save/saved`, `join-name/email/password/register/accept/error/invalid`. **Every restyle task preserves these — read the current file and swap only presentation.**

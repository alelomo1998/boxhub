# M13d — Auth & Account Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the eleven auth and account screens as the component library's first real consumer, on a shared layout, a signal-based form contract, and a corrected global link colour.

**Architecture:** Phase 1 builds the shared contract with complete code — two component changes, one new layout component, one global stylesheet change, two backend one-liners. Phase 2 rebuilds eleven screens, one task each, each through the full impeccable cycle (`shape` → ask the user → build → `critique`) because **no screen's design is decided yet and inventing one is forbidden**. Phase 3 extends the automated gates over the finished set and closes the docs.

**Tech Stack:** Angular 22.1.0 · TypeScript 6.0.3 · Karma/Jasmine · Playwright + `@axe-core/playwright` · Spring Boot 3.5.16 / Java 21 · Flyway (**not used — next migration stays V19**)

**Spec:** `docs/superpowers/specs/2026-08-10-m13d-auth-account-screens-design.md`. Read it before Task 1.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Environment — each of these has cost real time before:**
- `cp docker/.env.example docker/.env` once, before any stack command.
- **`npm test` alone HANGS** (watch mode). Always `npm test -- --watch=false --browsers=ChromeHeadless`. ~13s, baseline **245** specs.
- **`ng` is NOT on PATH.** Use `npx ng build --configuration production`. It is the only gate that type-checks Angular templates, and it currently emits **zero** budget warnings.
- Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`, ~102s, baseline **428/0/0**. **Never run concurrently with Karma.** A wall of `Could not initialize class AbstractIntegrationTest` means the **Docker daemon is down**, not your diff.
- **Rebuild the frontend image after every frontend commit before measuring anything in a browser** — the container serves a built bundle.
- **`down -v` before an e2e run** after any seeder change. `runner`/`tv` specs are not idempotent.
- Visual regression runs **only** in the Linux container: `e2e/visual.sh`. Never `npx playwright test visual.spec.ts` locally.
- macOS has no `timeout`. `sed -i ''` is the macOS form.

**Gate discipline — binding:**
- **Never pipe a gate through `grep`/`tail` for its exit status.** In zsh `$?` after a pipe is the pipe's. Redirect to a file, then check.
- **zsh does NOT word-split unquoted parameters.** `D="a b"; grep -rn pat $D` passes one nonexistent filename, warns on stderr, and reports **zero matches** — every gate then looks clean having inspected nothing. Use an array: `D=(a b)`.
- **Never trust a wrapper's exit code.** `cmd; echo "exit=$?"` makes the shell succeed while the command failed.

**Design law v3 (`docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`) — binding:**
- **Tokens only.** A raw hex outside `_tokens.scss` is a bug. No raw px type sizes.
- **Dark only.** No light theme, no `data-theme`, no `prefers-color-scheme`.
- **Exactly one volt element per plumbing screen** — the primary action. Volt bounded by area: a row, chip, button, bar or badge, **never a card, panel, page background or sheet**.
- `--danger` may fill a **button or chip** only; the control that *opens* a destructive flow is a danger-bordered ghost, the one that *executes* it is filled. `--on-danger` is dark, not white.
- No glow, no gradients, no shadows on flat surfaces. Focus ring is a solid 2px outline, inverting to `--focus-inv` on a volt surface.
- **Mono (JetBrains Mono) is the prescription voice and is banned from prose.** Numbers tabular.
- **`frontend/src/app/ui/` stays clean:** signal inputs only (`input()`, `model()`, `output()`), no `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager`, no raw hex, no raw px type sizes.
- **An attribute on a component's host does not reach the element inside it.** A component needing a hook on its inner element takes an explicit input and binds it there. This cost four separate fixes in M13c.
- **i18n:** every string marked, ids `@@auth.<screen>.<element>`. Template text uses the `i18n` attribute, TS strings use `$localize`. No new hardcoded user-facing string, ever. German and Italian run 20–35% longer than English.
- **Tokens available:** `--sp-1..6,8,10` (4/8/12/16/20/24/40/64px) · `--fs-hero|display|h2|body|sm|meta` · `--r-xs|ctl|card|lg|full` · `--tap` 44px · `--bw-accent` · `--dur`. The house breakpoint is **720px** (8 uses of `max-width: 720px`, 6 of `719px`, 1 of `min-width: 720px`).

**Process — binding since M6:**
- Orchestrator dispatches, reviews every diff, runs gates, commits, merges. **Executors never self-merge.**
- **Executors stop and escalate rather than improvise.** Blocked, ambiguous, or plan-conflicts-with-reality → return the question. In M13c this caught thirteen factual errors in the orchestrator's own briefs. Escalating is the system working.
- **A stop-rule names what it forbids.** "Do not tune" once made an executor retire a test whose fix was one line.
- **Do not commit while an executor has files staged.** `git commit` takes the whole index.
- `graphify query "<question>"` before grepping code — a hook enforces it, for subagents too. Include that instruction in every subagent prompt involving code exploration.
- **`AuthzConformanceTest` is a standing guarantee.** No task in this plan adds a route, so none may edit it. If a task appears to need a `MIN_ROLE` entry, **stop and escalate** — that is the orchestrator's call, never an executor's.

**Commits:** conventional, body ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit `.DS_Store`.

---

## The Phase 2 cycle — how every screen task runs

**Tasks 8–18 all run these five steps.** They are stated once here, in full; each screen task adds only its own measured inventory, gates and open questions. Nothing is deferred by this — the procedure is complete, and the design input arrives at step 1 of the task itself.

This is design law §16 (`shape → build → critique ≥28/40, no open P0/P1`) run **per screen**. Every milestone through M13c ran only the critique half, once, at the end.

**Step A — shape (orchestrator).** `/impeccable shape <the screen>`. `PRODUCT.md` and `DESIGN.md` both exist at the repo root, so it will not divert into `init`. Output is that screen's design: hierarchy, copy, field order, every state.

**Step B — ask (orchestrator → user).** Bring the user **only** the choices shape could not settle from design law and `PRODUCT.md`. Shape proposes; the user decides. Use the brainstorm browser companion where the question is visual. This is `ask-never-guess-ui` applied to a shape run — *"not 'I'll assume a button here and flag it' — stop and ask."* It does **not** apply to mechanics with an objectively correct answer (which token, which ARIA role); those are the implementer's to get right.

**Step C — build (executor).** One Sonnet executor, self-contained brief carrying the agreed design, the file list, this plan's Global Constraints, and the screen's gates. The executor writes the screen and its Karma specs.

**Step D — gates (orchestrator).** Review the diff. Run the screen's own gates (below), then `npm test -- --watch=false --browsers=ChromeHeadless` and `npx ng build --configuration production`.

**Step E — critique (orchestrator).** `/impeccable critique <the screen>`. Fix P0/P1. **The screen is not done until this is clean.** Then commit.

**Every screen task's gates**, with `PATH` substituted:

```bash
# 1. No test id may DISAPPEAR. Additions are fine; removals break the e2e suite.
comm -23 <(git show HEAD:PATH | grep -oE 'data-testid\]?="[^"]*"' | sort -u) \
         <(grep -oE 'data-testid\]?="[^"]*"' PATH | sort -u)

# 2. Legacy form classes gone from this file
grep -nE 'class="[^"]*\bbh-(input|select)\b' PATH

# 3. Template forms gone (§4 of the spec)
grep -n 'FormsModule\|ngModel' PATH

# 4. Eager pin dropped — each surface milestone converts its own
grep -n 'ChangeDetectionStrategy.Eager' PATH

# 5. Every <form> owns its validation (§4.1) — NgForm no longer supplies novalidate
grep -n '<form' PATH | grep -v novalidate

# 6. No plain hrefs; internal navigation is routerLink
grep -nE '\[?href\]?="' PATH | grep -v 'oauth2/authorization/google'

# 7. Every user-facing string marked
grep -nE '>[A-Za-z][^<>{}]{3,}<' PATH | grep -v 'i18n'
```

Gates 1–6 must produce **zero bytes**. Gate 7 is a **reading aid, not a pass/fail** — it over-matches on bound expressions; the orchestrator reads its output and confirms each hit is either marked or genuinely not user-facing.

**A note that applies to every screen task:** design law v3 outranks impeccable's generic guidance wherever they disagree. Concrete case already known: impeccable flags `--bone` **by name** as a warm-neutral "AI default" token tell, but rxed's `--bone` is `#F2F4EF` — **primary text on a dark ground**, 17.2:1 — not a body background. Do not "fix" it. An executor finding a real conflict **escalates instead of choosing**.

---

# Phase 1 — the shared contract

## Task 1: `bh-field` and `bh-select` — `name`, `autocomplete`, `required`, and the error-remount fix

**Files:**
- Modify: `frontend/src/app/ui/field.component.ts`
- Modify: `frontend/src/app/ui/select.component.ts`
- Test: `frontend/src/app/ui/field.component.spec.ts`
- Test: `frontend/src/app/ui/select.component.spec.ts`

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: `bh-field` inputs `label`, `type`, `value` (`model<string>`), `placeholder`, `error`, `disabled`, `testId`, **`name`**, **`autocomplete`**, **`required`**. `bh-select` gains **`name`** and **`required`** (no `autocomplete` — it has no case here). Every one of the three new inputs binds to the **inner control**, never the host. Tasks 8–18 all consume these.

**Why `name` is not optional:** `e2e/tests/_support.ts:21-22` drives login with `input[name="email"]` and `input[name="password"]`, and that helper is used by eight specs. Emitting `name` on the inner input means **the helper needs zero changes**.

**Why `autocomplete` is not optional:** **not one of the eleven screens sets it today.** That is a password-manager failure across the entire auth surface.

- [ ] **Step 1: Write the failing test — the second-error-message defect**

Append to `frontend/src/app/ui/field.component.spec.ts`, inside the existing `describe('FieldComponent')`:

```ts
  it('re-announces a SECOND, different error by remounting the alert node', () => {
    f.componentInstance.e.set('Required');
    f.detectChanges();
    const first = f.nativeElement.querySelector('[role="alert"]');
    expect(first.textContent).toContain('Required');

    f.componentInstance.e.set('Invalid format');
    f.detectChanges();
    const second = f.nativeElement.querySelector('[role="alert"]');
    expect(second.textContent).toContain('Invalid format');

    // role="alert" announces reliably only on FRESH INSERTION, not when an already-mounted
    // node's text changes (bh-alert's own JSDoc states this mechanism). @if only tears the node
    // down across the falsy<->truthy boundary, so "Required" -> "Invalid format" mutated the SAME
    // node and the second message was silent. Re-validation producing a second message is the
    // normal case on eleven form screens, not an edge case.
    expect(second).not.toBe(first);
  });
```

Add a host with the new inputs and a test for them, in the same file:

```ts
@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" name="email" autocomplete="username" [required]="true" />`,
})
class AttrHost {}
```

Register it in the `beforeEach` imports array alongside `Host` and `TestIdHost`, then:

```ts
  it('puts name, autocomplete and required on the INNER input, never the host', () => {
    const g = TestBed.createComponent(AttrHost);
    g.detectChanges();
    const gInput: HTMLInputElement = g.nativeElement.querySelector('input');
    expect(gInput.getAttribute('name')).toBe('email');
    expect(gInput.getAttribute('autocomplete')).toBe('username');
    expect(gInput.required).toBe(true);
    // An attribute written on a component's host does not reach the element inside it — the
    // failure that cost M13c four separate fixes.
    expect(g.nativeElement.getAttribute('name')).toBeNull();
    expect(g.nativeElement.getAttribute('autocomplete')).toBeNull();
  });

  it('omits name and autocomplete entirely when unset', () => {
    expect(input().getAttribute('name')).toBeNull();
    expect(input().getAttribute('autocomplete')).toBeNull();
    expect(input().required).toBe(false);
  });
```

- [ ] **Step 2: Run the tests and verify they FAIL**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: the remount test fails with `Expected <span> not to be <span>` (the same node is reused), and the attribute tests fail with `Expected null to be 'email'`. **If the remount test passes before the fix, stop and escalate** — it means the defect is not where the spec says and the whole task needs re-deriving. A test never seen to fail proves nothing.

- [ ] **Step 3: Implement `bh-field`**

`frontend/src/app/ui/field.component.ts` — change the import line, the template, and the class:

```ts
import { Component, computed, input, model } from '@angular/core';
```

Template — replace the `<input>` and the `@if` block:

```html
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <input class="input" [id]="id" [type]="type()" [value]="value()"
             [attr.name]="name() || null"
             [attr.autocomplete]="autocomplete() || null"
             [required]="required()"
             [placeholder]="placeholder()" [disabled]="disabled()"
             [attr.aria-invalid]="!!error()"
             [attr.aria-describedby]="error() ? id + '-err' : null"
             [attr.data-testid]="testId() || null"
             (input)="value.set($any($event.target).value)" />
      @for (msg of errors(); track msg) {
        <span class="err" [id]="id + '-err'" role="alert">{{ msg }}</span>
      }
    </div>
```

Class — add three inputs and the computed:

```ts
  name = input('');
  autocomplete = input('');
  required = input(false);

  /**
   * A 0-or-1 array tracked BY THE MESSAGE, not an @if. A changed message is a different track
   * key, therefore a new node, therefore a fresh insertion — which is the only way role="alert"
   * announces reliably. @if only remounts across the falsy<->truthy boundary, so a second,
   * different validation message was silent. Filed against M13d in docs/BACKLOG.md.
   */
  protected readonly errors = computed(() => (this.error() ? [this.error()!] : []));
```

Use `[required]` (the property binding), not `[attr.required]`: it sets the IDL property and reflects the attribute, and native `required` already maps to the accessibility API, so no separate `aria-required` is needed.

- [ ] **Step 4: Implement `bh-select` identically**

`frontend/src/app/ui/select.component.ts` — add `computed` to the import, add `name` and `required` inputs plus the same `errors` computed, bind `[attr.name]="name() || null"` and `[required]="required()"` on the `<select>`, and replace its `@if (error())` block with the same `@for`. **`bh-select` does not gain `autocomplete`.** Leave the `ngAfterContentChecked` projected-options logic and its comment completely untouched — it documents two hooks that were tried and rejected with reasons.

Mirror both new specs into `select.component.spec.ts`, adapted to `<select>` (`querySelector('select')`, and the attribute host projects one `<option value="">`).

- [ ] **Step 5: Run the tests and verify they PASS**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, with the suite total risen from **245** by the number of specs added (4 in `field`, 4 in `select` → **253**).

- [ ] **Step 6: Verify the `ui/` standing guarantees still hold**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE '^\s*@(Input|Output)\(' frontend/src/app/ui
grep -rnE '^\s*changeDetection: *ChangeDetectionStrategy\.Eager' frontend/src/app/ui
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui
```

Expected: all four produce zero bytes.

> These gates are **anchored to declaration shape on purpose.** M13c §8.1 wrote the first one as `grep -rn '@Input()\|@Output()'` and recorded it as returning 0; on `main` at `0c5117e` it returns **2** — `avatar.component.spec.ts:26` and `sheet.component.ts:12`, both the string `@Input()` inside a **comment** documenting the defect signal inputs fixed. The guarantee is intact; the gate matched its own documentation. Do not revert to the loose form.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/ui/field.component.ts frontend/src/app/ui/select.component.ts \
        frontend/src/app/ui/field.component.spec.ts frontend/src/app/ui/select.component.spec.ts
git commit -m "feat(ui): bh-field/bh-select take name, autocomplete, required; remount the alert

The error <span> moves from @if to a @for tracked by the message, so a second,
different validation message is a NEW node and role=alert actually announces it.
@if only remounts across the falsy<->truthy boundary. Covered by a spec that
fails against the old @if.

name is what e2e/tests/_support.ts:21-22 drives (input[name=email]) across eight
specs, so the helper needs no change. autocomplete was set by none of the eleven
auth screens, which is a password-manager failure across the whole surface.

All three bind to the inner control, never the host.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `bh-button` renders as an anchor when given `href`

**Files:**
- Modify: `frontend/src/app/ui/button.component.ts`
- Test: `frontend/src/app/ui/button.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `bh-button` gains `href = input('')`. When non-empty the component renders `<a [href]>` carrying the identical classes; otherwise `<button>` exactly as today. Consumed by the login and signup tasks for "Continue with Google".

**Scope, stated as what it forbids:** do **not** add `routerLink` support. The backlog says decide with real consumers in front of you, and M13d's internal navigation is **text links** (`<a routerLink>`), not links styled as buttons. Do **not** touch `wod-library.page.ts:15`'s `<button>`-inside-`<a>` workaround; it belongs to M14.

**The projection trap this task must prove it avoided:** `<ng-content />` is projected **once, statically**. Writing it inside two `@if` branches does **not** reliably give both branches the content. The template below declares it once in an `<ng-template>` and renders that template in each branch via `ngTemplateOutlet`. **Step 2's spec is what proves this actually works.** If content renders in one mode and not the other, **stop and escalate** rather than duplicating `<ng-content>`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/app/ui/button.component.spec.ts`:

```ts
@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button href="/oauth2/authorization/google">Continue with Google</bh-button>`,
})
class LinkHost {}

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button>Log in</bh-button>`,
})
class PlainHost {}

describe('ButtonComponent as a link', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkHost, PlainHost] }).compileComponents();
  });

  it('renders an anchor with a real href when href is set', () => {
    const f = TestBed.createComponent(LinkHost);
    f.detectChanges();
    const a: HTMLAnchorElement = f.nativeElement.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('/oauth2/authorization/google');
    expect(f.nativeElement.querySelector('button')).toBeNull();
    // Same visual contract as the button it replaces.
    expect(a.className).toContain('btn');
  });

  it('projects its content in BOTH modes', () => {
    // <ng-content> projects once, statically. Two @if branches each containing their own
    // <ng-content> silently leaves one of them empty. This assertion is the reason the template
    // declares it once in an <ng-template>.
    const link = TestBed.createComponent(LinkHost);
    link.detectChanges();
    expect(link.nativeElement.textContent).toContain('Continue with Google');

    const plain = TestBed.createComponent(PlainHost);
    plain.detectChanges();
    expect(plain.nativeElement.textContent).toContain('Log in');
  });

  it('still renders a button when href is unset', () => {
    const f = TestBed.createComponent(PlainHost);
    f.detectChanges();
    expect(f.nativeElement.querySelector('button')).toBeTruthy();
    expect(f.nativeElement.querySelector('a')).toBeNull();
  });
});
```

Add `Component` to the file's `@angular/core` import if it is not already there.

- [ ] **Step 2: Run the tests and verify they FAIL**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `Expected null to be truthy` on the anchor query, because `href` is not an input yet.

- [ ] **Step 3: Implement**

`frontend/src/app/ui/button.component.ts`:

```ts
import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
```

Add `imports: [NgTemplateOutlet]` to the decorator, and replace the template:

```html
    <ng-template #body><ng-content /></ng-template>

    @if (href()) {
      <!-- A link styled as a button must BE an anchor: routerLink/href on a bh-button host emits
           no href at all, losing ctrl/cmd-click, open-in-new-tab and the correct role. Two real
           consumers: the Google control on login and on signup. -->
      <a [href]="href()" [class]="'btn ' + variant() + ' ' + size()"
         [attr.aria-label]="label() || null">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <button [type]="type()" [class]="'btn ' + variant() + ' ' + size()"
              [disabled]="disabled() || loading()" [attr.aria-busy]="loading()"
              [attr.aria-label]="label() || null">
        @if (loading()) { <span class="spin" aria-hidden="true"></span> }
        @if (!(loading() && variant() === 'icon')) { <ng-container [ngTemplateOutlet]="body" /> }
      </button>
    }
```

Add to the class:

```ts
  /** Set to render an <a> instead of a <button>. For real navigation only — an OAuth start, an
   *  external destination. Internal navigation is a text link with routerLink, not this. */
  href = input('');
```

Add one style rule so the anchor matches the button, since `.btn` was written for a `<button>`:

```css
    a.btn { text-decoration: none; }
```

Leave every other style rule and every existing comment untouched.

- [ ] **Step 4: Run the tests and verify they PASS**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, suite total **256**.

- [ ] **Step 5: Verify no existing call site regressed**

```bash
cd frontend && npx ng build --configuration production
```

Expected: exit 0, **zero** budget warnings. `bh-button` has 32 call sites and all must still compile.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/ui/button.component.ts frontend/src/app/ui/button.component.spec.ts
git commit -m "feat(ui): bh-button renders an anchor when given href

routerLink on a bh-button host emits no href at all, so a link styled as a button
loses ctrl/cmd-click, open-in-new-tab and the correct role. Two real consumers in
M13d: the Continue-with-Google control on login and signup, each of which is a
hand-rolled anchor with ~10 duplicated CSS lines today.

routerLink support is deliberately NOT added — M13d's internal navigation is text
links, so there is no consumer for it yet.

<ng-content> is declared once in an ng-template and rendered per branch: projecting
into two @if branches leaves one silently empty. A spec asserts content renders in
both modes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `bh-auth-layout` — the shared frame

**Files:**
- Create: `frontend/src/app/ui/auth-layout.component.ts`
- Create: `frontend/src/app/ui/auth-layout.component.spec.ts`
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts` (add its gallery section)

**Interfaces:**
- Consumes: `bh-wordmark` (`variant: 'chrome' | 'hero'`, `size: 'sm' | 'md' | 'lg'` — verified at `wordmark.component.ts:44-45`).
- Produces: `<bh-auth-layout [variant]="'split' | 'narrow'">` with a **`panel` content slot** (eyebrow + headline) and the default slot (the form). Consumed by Tasks 8–17 (ten screens). Task 18 (`account/security`) does **not** consume it.

**The variant assignment is fixed by the spec §2.1 and is not the executor's to change:**
- `split` — login, signup, start-box, join. The four screens a stranger arrives at from outside.
- `narrow` — box-picker, check-email, verify, forgot, reset, account/email.
- **Per screen, never per state.** Four of them change shape as they run; keying the variant on state would make them change layout mid-flight.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/ui/auth-layout.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  standalone: true,
  imports: [AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="split">
      <div panel><p class="eyebrow">Welcome back</p><h1>Log in to your box.</h1></div>
      <form><input /></form>
    </bh-auth-layout>`,
})
class SplitHost {}

@Component({
  standalone: true,
  imports: [AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <div panel><h1>All set.</h1></div>
      <p>Your email address has been updated.</p>
    </bh-auth-layout>`,
})
class NarrowHost {}

describe('AuthLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SplitHost, NarrowHost] }).compileComponents();
  });

  it('renders both slots in the split variant', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Welcome back');
    expect(f.nativeElement.textContent).toContain('Log in to your box.');
    expect(f.nativeElement.querySelector('form')).toBeTruthy();
  });

  it('renders the panel slot in the narrow variant too — it is never dropped', () => {
    // On phone the split collapses to stacked and the panel content moves ABOVE the form. It is
    // not hidden: dropping it would cost `join` its "You're invited / <box name>" on the primary
    // device, which is the one piece of context that screen exists to deliver.
    const f = TestBed.createComponent(NarrowHost);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('All set.');
  });

  it('marks the variant on the root so CSS, not TypeScript, does the layout', () => {
    const split = TestBed.createComponent(SplitHost);
    split.detectChanges();
    expect(split.nativeElement.querySelector('[data-variant="split"]')).toBeTruthy();

    const narrow = TestBed.createComponent(NarrowHost);
    narrow.detectChanges();
    expect(narrow.nativeElement.querySelector('[data-variant="narrow"]')).toBeTruthy();
  });

  it('renders exactly one main landmark', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('main').length).toBe(1);
  });

  it('renders the wordmark once, not once per variant branch', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('bh-wordmark').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `frontend/src/app/ui/auth-layout.component.ts`:

```ts
import { Component, input } from '@angular/core';
import { WordmarkComponent } from './wordmark.component';

/**
 * The frame every auth screen sits in. Ten consumers on day one; before this, nine files each
 * carried a copy-pasted `.auth` / `.card` block.
 *
 * Two variants, assigned PER SCREEN and never per state (spec §2.1). Four of the screens change
 * shape as they run — forgot is a form until submitted, verify goes pending -> expired, reset has
 * an expired branch, join has an invalid branch — and keying the variant on state would make them
 * change layout mid-flight.
 *
 *  - `split`  — brand panel left, form right, above 720px. login / signup / start-box / join: the
 *               four screens a stranger arrives at from OUTSIDE the app.
 *  - `narrow` — one centred column at every width. The six mid-flow screens.
 *
 * Below 720px `split` collapses to `narrow`'s stacking, with the panel content ABOVE the form.
 * The panel is never dropped — see the spec's §2.2 and this component's spec file.
 *
 * The panel carries the SCREEN'S OWN eyebrow + headline, never a brand claim. That is deliberate:
 * a product claim written here would be written again when M19's landing site settles it.
 */
@Component({
  selector: 'bh-auth-layout',
  standalone: true,
  imports: [WordmarkComponent],
  template: `
    <main class="wrap" [attr.data-variant]="variant()">
      <div class="panel">
        <bh-wordmark variant="hero" size="md" />
        <div class="panel-copy"><ng-content select="[panel]" /></div>
      </div>
      <div class="body"><ng-content /></div>
    </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
      gap: var(--sp-6); padding: var(--sp-6) var(--sp-4); }
    .panel { display: flex; flex-direction: column; gap: var(--sp-6); }
    .panel-copy { display: flex; flex-direction: column; gap: var(--sp-2); }
    .body { display: flex; flex-direction: column; gap: var(--sp-4); }

    /* Stacked-and-centred is the base case, so phone needs no override and the narrow variant
       needs no rules at all. Only the split's desktop form is an addition. */
    .wrap[data-variant="narrow"], .wrap[data-variant="split"] {
      align-items: stretch; max-width: 420px; margin: 0 auto; }

    /* 720px is this codebase's breakpoint — 8 uses of max-width:720px, 6 of 719px, 1 of
       min-width:720px. Do not introduce a new one. */
    @media (min-width: 720px) {
      .wrap[data-variant="split"] { flex-direction: row; align-items: stretch; max-width: none;
        margin: 0; padding: 0; gap: 0; }
      .wrap[data-variant="split"] .panel { flex: 0 0 42%; justify-content: space-between;
        background: var(--surface); border-right: 1px solid var(--hairline);
        padding: var(--sp-8); }
      .wrap[data-variant="split"] .body { flex: 1; justify-content: center;
        max-width: 420px; padding: var(--sp-8); }
    }
  `],
})
export class AuthLayoutComponent {
  variant = input<'split' | 'narrow'>('narrow');
}
```

No `changeDetection` field — Angular 22's implicit default when omitted is `OnPush`, confirmed in the compiler, which only emits the field when it differs from `OnPush`.

- [ ] **Step 4: Run and verify it passes**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, suite total **261**.

- [ ] **Step 5: Add the gallery section**

Design law makes the dev gallery at `/app/dev/components` **the seven-state contract**, not a page about it: each section renders every state a component can have, notes the ones only checkable by hand, and **explicitly declares the ones the component cannot have.** An omitted state is indistinguishable from a forgotten one.

Add a section to `frontend/src/app/features/dev/dev-gallery.page.ts` wrapped in `data-gallery="auth-layout"` (matching the existing sections' convention), rendering **both** variants with representative panel and body content, and stating in the section's own prose that `bh-auth-layout` **has no hover, focus, active, disabled, loading or error states** — it is a layout, and those belong to the controls inside it. Read the file's existing sections first and match their structure exactly.

- [ ] **Step 6: Verify the build and the gallery render**

```bash
cd frontend && npx ng build --configuration production
```

Expected: exit 0, zero budget warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/ui/auth-layout.component.ts frontend/src/app/ui/auth-layout.component.spec.ts \
        frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(ui): bh-auth-layout, the shared frame for the auth screens

Ten consumers on day one; nine files each carried a copy-pasted .auth/.card block.

Two variants assigned per screen and never per state: split (brand panel left,
above 720px) for the four screens a stranger arrives at from outside — login,
signup, start-box, join — and narrow for the six mid-flow ones. Four screens change
shape as they run, so a state-keyed variant would change layout mid-flight.

Below 720px the split stacks and the panel content moves above the form. It is
never dropped: that would cost join its 'You're invited / <box>' on phone.

Gallery section declares the six states this component cannot have, rather than
omitting them.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: the global link colour, and the sweep that verifies it

**Files:**
- Modify: `frontend/src/styles.scss:14`

**Interfaces:**
- Consumes: nothing.
- Produces: a base anchor style every screen in the product inherits.

**What is wrong today:** `frontend/src/styles.scss:14` is `a { color: var(--volt); text-decoration: none; }` — a bare element selector, so **every link in the product is volt**. The M13c critique measured **four** volt elements on the real login screen (the Log in button, correctly, **plus** "Forgot password?", "Create a box account" and "Start your box") where design law §2.3 allows exactly one.

**Why the underline is load-bearing:** removing colour as the affordance without adding one would break **WCAG 1.4.1 (Use of Colour)**. The underline replaces it.

**Blast radius is ~40 screens and the visual baselines cover only the gallery.** Step 3 is therefore a real step, not a formality.

- [ ] **Step 1: Make the change**

`frontend/src/styles.scss`, replacing line 14:

```scss
/* Links are not primary actions. Volt means live / now / primary / winning (law §2.3) and is
   reserved for the ONE control that answers a screen's question — spending it on every anchor put
   four volt elements on the login screen where the law allows one. The underline is not
   decoration: it replaces colour as the affordance, so WCAG 1.4.1 still holds. */
a { color: var(--bone); text-decoration: underline; text-underline-offset: 2px; }
```

- [ ] **Step 2: Verify nothing hardcoded a volt anchor to compensate**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn 'a { color\|a:link\|a:visited' frontend/src/styles.scss frontend/src/styles
```

Expected: only the new rule. If another rule re-colours anchors globally, **stop and escalate** — that changes what this task is.

- [ ] **Step 3: Sweep every screen that has links, in a real browser**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
```

Then walk the app at `http://localhost/app` as `admin@demo.io`, `coach@demo.io`, `athlete@demo.io` (password `boxhub-demo-2026`) and `super@demo.io`, and look at every screen that renders a link. **Write down what changed.** The orchestrator does this, not an executor, and reports the findings to the user **before merge**.

Expected failure mode to look for specifically: a link that was only findable *because* it was volt, and now reads as body text with an underline. That is a screen-level fix filed against that screen's own milestone, **not** a reason to revert this rule.

- [ ] **Step 4: Run the existing gates**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npx ng build --configuration production
```

Expected: 261 passing, build clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles.scss
git commit -m "fix(design): links are bone with an underline, not volt

a { color: var(--volt) } was a bare element selector, so every link in the product
was volt. Measured by the M13c critique on the real login screen: four volt
elements — the Log in button correctly, plus Forgot password, Create a box account
and Start your box — where design law §2.3 allows exactly one on a plumbing screen.

The underline is load-bearing, not decoration: removing colour as the affordance
without replacing it breaks WCAG 1.4.1.

Blast radius is ~40 screens and the visual baselines cover only the gallery, so
this was verified by walking the app in a browser rather than by the gate suite.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: backend — self-serve box signup reads `Accept-Language`

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java:147-154`
- Modify: `backend/src/main/java/com/boxhub/box/BoxSignupService.java:69,82`
- Modify: `backend/src/main/java/com/boxhub/box/BoxSignupTx.java:53-61`
- Test: `backend/src/test/java/com/boxhub/box/` — the existing box-signup integration test

**Interfaces:**
- Consumes: `AuthController.primaryLanguageTag(String)` — already exists, private static, at `AuthController.java:122`. It returns the bare language subtag (`"it"` out of `"it-IT,it;q=0.9,en;q=0.8"`) or `null`.
- Produces: `BoxSignupService.signup(String boxName, String name, String email, String password, String locale)` and `BoxSignupTx.createOwnerAndBox(String boxName, String slug, String ownerName, String normalizedEmail, String passwordHash, String boxStatus, String locale)`.

**What is wrong today, verified by reading the files:** `BoxSignupTx.java:61` calls `registerTx.insertUser(normalizedEmail, passwordHash, ownerName, false, "en")` — a **hardcoded `"en"`**, with a comment at `:58-60` naming this exact gap and pointing at the backlog. M13a T8 wired the header at `AuthController#register` only (`AuthController.java:107-109`). `RegisterTx.java:42` already falls back to `"en"` for null or blank, so nothing downstream needs a guard.

**No route is added, so `AuthzConformanceTest` is not touched.** If it appears to need an edit, **stop and escalate.**

- [ ] **Step 1: Write the failing test**

Find the existing box-signup integration test (`graphify query "box signup integration test"`, then confirm by reading). Add:

```java
    @Test
    void selfServeOwnerGetsTheBrowsersLanguage() throws Exception {
        mvc.perform(post("/api/auth/signup-box")
                        .header("Accept-Language", "it-IT,it;q=0.9,en;q=0.8")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"boxName":"Locale Box","name":"Owner","email":"locale-owner@demo.io",
                             "password":"correct-horse-battery"}"""))
                .andExpect(status().isCreated());

        var owner = users.findByEmail("locale-owner@demo.io").orElseThrow();
        assertThat(owner.getLocale()).isEqualTo("it");
    }

    @Test
    void selfServeOwnerFallsBackToEnglishWithNoHeader() throws Exception {
        mvc.perform(post("/api/auth/signup-box")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"boxName":"No Header Box","name":"Owner","email":"no-header@demo.io",
                             "password":"correct-horse-battery"}"""))
                .andExpect(status().isCreated());

        assertThat(users.findByEmail("no-header@demo.io").orElseThrow().getLocale()).isEqualTo("en");
    }
```

Match the surrounding test class's existing conventions for `mvc`, `users` and CSRF exactly — read them first rather than assuming. Note the M8 trap: `.with(csrf())` reflectively swaps the singleton `CsrfFilter`'s tokenRepository and never restores it; if the class has a `@BeforeEach` reset, leave it alone.

- [ ] **Step 2: Run and verify it fails**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='<TheTestClass>'
```

Expected: FAIL — `expected "it" but was "en"`. **If it passes, stop and escalate**: the gap the comment describes would not exist and the task's premise is wrong.

> A wall of `Could not initialize class AbstractIntegrationTest` means the **Docker daemon is down**, not your diff. `open -a Docker`, wait, re-run.

- [ ] **Step 3: Thread the locale through all three files**

`AuthController.java` — add the request to the signature and pass the tag:

```java
    @PostMapping("/signup-box")
    public ResponseEntity<?> signupBox(@Valid @RequestBody SignupBoxRequest req, HttpServletRequest http) {
        var outcome = boxSignup.signup(req.boxName(), req.name(), req.email(), req.password(),
                primaryLanguageTag(http.getHeader(HttpHeaders.ACCEPT_LANGUAGE)));
        if (outcome.full()) return ResponseEntity.ok(new FullResponse(true));
        // Body from the request only — echoing anything persisted is an enumeration oracle (M8 T5).
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new SignupBoxResponse(req.email().toLowerCase().trim(), req.name()));
    }
```

`BoxSignupService.java:69` — add the parameter and forward it at `:82`:

```java
    public SignupOutcome signup(String boxName, String name, String email, String password, String locale) {
```
```java
                result = tx.createOwnerAndBox(boxName.trim(), uniqueSlug(boxName), name, normalized, hash, boxStatus, locale);
```

Leave the surrounding bounded 3-attempt taken-vs-slug retry and its `SIGNUP_RETRY` 503 completely untouched.

`BoxSignupTx.java:53-61` — add the parameter, pass it, and **replace the stale comment**:

```java
    @Transactional
    Result createOwnerAndBox(String boxName, String slug, String ownerName, String normalizedEmail,
                            String passwordHash, String boxStatus, String locale) {
        // Self-serve box signup never carries an invite token — always unverified; the caller
        // sends the verify mail once this transaction has committed (see BoxSignupService).
        // Accept-Language now reaches here the same way it reaches AuthController#register
        // (M13d). RegisterTx#insertUser falls back to "en" for null/blank, so no guard here.
        User owner = registerTx.insertUser(normalizedEmail, passwordHash, ownerName, false, locale);
```

- [ ] **Step 4: Run the full backend suite**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: **430/0/0** (428 baseline + the two new tests). Never run this concurrently with Karma.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/AuthController.java \
        backend/src/main/java/com/boxhub/box/BoxSignupService.java \
        backend/src/main/java/com/boxhub/box/BoxSignupTx.java \
        backend/src/test/java/com/boxhub/box/
git commit -m "fix(identity): self-serve box signup reads Accept-Language

BoxSignupTx hardcoded \"en\" with a comment naming this exact gap — M13a T8 wired
the header at AuthController#register only, so every owner created through
/api/auth/signup-box got users.locale='en' regardless of their browser.

start-box is an M13d screen, so the gap closes with it. No route added, so
AuthzConformanceTest is untouched. RegisterTx already falls back to 'en' for
null/blank, so no new guard was needed.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: backend — the admin invite link stops taking a redirect hop

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/AppUrls.java`
- Modify: `backend/src/main/java/com/boxhub/box/InviteAdminController.java:76-77`
- Test: the existing invite-admin integration test

**Interfaces:**
- Consumes: `AppUrls`, which today exposes `appLink(String)` (absolute: `origin + base + path`) and `origin()`.
- Produces: `AppUrls.appPath(String path)` returning **`base + path`** — a path, not an absolute URL.

**What is wrong today, verified by reading:** `InviteAdminController.java:77` returns `"/join/" + created.rawToken()` in `CreatedInviteResponse`, and `invites.page.ts:109` builds the displayed and copied link as `location.origin + inv.link`. After M13a's `/app` move that still works — `/join/` is one of the permanently-redirected prefixes — but it lands via a **301** instead of directly. The *emailed* invite is already correct because it goes through `mailer.link()` and therefore `AppUrls.appLink()` (`InviteAdminController.java:75`).

**Why a path and not an absolute URL:** the frontend prepends `location.origin`. Returning an absolute URL would produce `origin + origin + …`, and changing the frontend means editing `invites.page.ts` — an **M15-owned screen**. This fix must not touch it.

- [ ] **Step 1: Write the failing test**

In the existing invite-admin test class, add:

```java
    @Test
    void createdInviteLinkIsAppPrefixedSoTheCopiedUrlSkipsTheRedirect() throws Exception {
        // invites.page.ts builds the copied link as location.origin + link, so this must stay a
        // PATH. An absolute URL here would render as origin+origin. The emailed link is separate
        // and already correct — it goes through Mailer.link()/AppUrls.appLink().
        mvc.perform(post("/api/box/invites") /* + this class's existing auth + csrf setup */
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"email":"invitee@demo.io","role":"ATHLETE"}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.link").value(startsWith("/app/join/")));
    }
```

Read the class first and match its existing box-token/auth/CSRF setup exactly — do not invent it.

- [ ] **Step 2: Run and verify it fails**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='<TheTestClass>'
```

Expected: FAIL — the link is `/join/…`, not `/app/join/…`.

- [ ] **Step 3: Implement**

`AppUrls.java` — add a third method, and extend the class javadoc's list to three entries so the "deliberately named so the choice is obvious at every call site" promise still holds:

```java
    /** Path into the Angular app WITHOUT an origin, e.g. appPath("/join/abc") -> "/app/join/abc".
     *  For responses a client will prefix with its own origin. Returning appLink() there would
     *  produce origin+origin. */
    public String appPath(String path) {
        return base + path;
    }
```

`InviteAdminController.java` — inject `AppUrls` following the class's existing constructor-injection style, and change line 77:

```java
        return new CreatedInviteResponse(i.getId(), i.getEmail(), i.getRole(), i.getPlanId(),
                i.getExpiresAt(), appUrls.appPath("/join/" + created.rawToken()));
```

Leave line 75's `mailer.link("/join/" + created.rawToken())` **exactly as it is** — the emailed link is already correct and this task must not change it.

- [ ] **Step 4: Run the full backend suite**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: **431/0/0**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/shared/AppUrls.java \
        backend/src/main/java/com/boxhub/box/InviteAdminController.java \
        backend/src/test/java/com/boxhub/box/
git commit -m "fix(box): admin invite link is /app-prefixed, so the copied URL skips a 301

InviteAdminController returned a bare /join/<token> and invites.page.ts builds the
copied link as location.origin + link, so after M13a's /app move it worked only via
a permanent redirect. The emailed link was already correct — it goes through
Mailer.link()/AppUrls.appLink().

AppUrls gains appPath(): base + path, no origin. Returning appLink() here would
render as origin+origin in the client, and changing the client means editing
invites.page.ts, which M15 owns.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Phase 1 checkpoint — full gate run

**Files:** none modified. This task is a gate, and it exists because Phase 2 has eleven tasks stacked on Phase 1 and a defect found at Task 18 is eleven screens of rework.

- [ ] **Step 1: Frontend**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: **261** passing; build exit 0 with **zero** budget warnings.

- [ ] **Step 2: Backend**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: **431/0/0**. Not concurrently with Step 1.

- [ ] **Step 3: e2e on a rebuilt stack**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```

Expected: **35 passed + 1 skipped** at `retries: 0`. The skip is `runner.spec`'s TV half — a **quarantined real defect** owned by Project 2, documented at the top of `docs/BACKLOG.md`. Do not un-skip it and do not investigate it.

**The frontend image must be rebuilt before this runs** — the container serves a built bundle, and an M13c e2e run once reported 28 passed against a stale image because a failed build was mistaken for a successful one.

- [ ] **Step 4: The standing greps**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE '^\s*@(Input|Output)\(' frontend/src/app/ui
grep -rnE '^\s*changeDetection: *ChangeDetectionStrategy\.Eager' frontend/src/app/ui
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts
```

Expected: all zero bytes.

- [ ] **Step 5: Push and check CI**

```bash
git push
gh run list --limit 2
```

**A local green is not the gate.** Three M11 failures appeared only on Linux CI, and one had been failing silently since M10's push, unnoticed for six days while the hand-off claimed CI was green. Also compare any red against `main`'s pre-existing signature before blaming it on this work.

---

# Phase 2 — the eleven screens

**Every task below runs the five-step cycle in "The Phase 2 cycle" section above, and that section's seven gates.** Each task states only what is specific to its screen: its files, its measured inventory, its states, and the questions that must reach the user at Step B.

**Order is fixed:** the four `split` screens first, so the new layout component is exercised by its hardest consumer early, then the six `narrow` ones, then `account/security` last because it takes neither variant and is the largest file in the set.

**One task per screen. Do not batch two screens into one brief because they look similar** — that is the standing rule this whole milestone is paced by.

---

## Task 8: `login` — split

**Files:**
- Modify: `frontend/src/app/features/auth/login.page.ts` (135 lines today)
- Test: `frontend/src/app/features/auth/login.page.spec.ts` (93 lines today)

**Interfaces:**
- Consumes: `bh-auth-layout` (Task 3), `bh-field` `name`/`autocomplete` (Task 1), `bh-button` `href` (Task 2), `bh-wordmark` (rendered by the layout — remove login's own).
- Produces: nothing consumed by later tasks.

**Variant: `split`.** Panel carries login's own eyebrow + headline.

**Measured inventory (on `main` at `0c5117e`):**
- **Test ids present:** `login-form`, `login-error`, `login-resend`, `login-resend-error`, `login-google`. The email and password inputs carry **no test id** — they are driven by `input[name="email"]` / `input[name="password"]` from `e2e/tests/_support.ts:21-22`, used by eight specs. **Both `name` attributes must survive**, via `bh-field`'s `name` input. This is the single highest-risk change in the milestone: breaking it breaks eight specs at once.
- **`ChangeDetectionStrategy.Eager`** at line 40 — drop it.
- **`FormsModule` + `[(ngModel)]`** — drop both; bind `[(value)]` against signals.
- **Legacy classes:** none (login uses local `.f input` styles, not `.bh-input`).
- **Plain hrefs:** 4 — `/oauth2/authorization/google` (line 33, becomes `bh-button [href]`), `/auth/forgot` and `/auth/signup` (both on line 35), `/auth/start` (line 36). The three internal ones become `routerLink`.
- **Dead CSS to delete:** `.mark` (line 46, `font-size: 21px`) and `.bn` (line 48, `font-size: 19px`) style elements the template stopped rendering when login adopted `<bh-wordmark>`. Two of the milestone's four off-scale raw px values **delete rather than convert**.
- **The `.google` block** (lines 56–59) is deleted — `bh-button [href]` replaces it.

**Behaviour that must survive verbatim — read the file before touching it:**
- `showGoogle()` is opt-in per environment and a failed `providers()` lookup keeps it hidden (`ngOnInit`, and the `error: () => {}` arm is deliberate).
- Two OAuth failure codes land back here as query params: `google_email_unverified` and `google`.
- On success with **exactly one** membership, login auto-selects the box; the `selectBox` error arm exists because box-token mint 403s a SUSPENDED/REJECTED box (M9) and without it a user who typed correct credentials sits on the form with no feedback.
- `EMAIL_NOT_VERIFIED` (403) reveals the resend control; **the password is checked first so this is not an enumeration oracle** — do not reorder it.
- 429 has its own message.

**Volt budget: exactly one** — the `Log in` submit. "Continue with Google" is a ghost, and the three text links are bone.

**Questions that must reach the user at Step B:** the panel's eyebrow + headline; whether "Continue with Google" sits above or below the primary action; whether the three text links stay on two lines as today.

---

## Task 9: `signup` — split

**Files:**
- Modify: `frontend/src/app/features/auth/signup.page.ts` (87 lines)
- Test: `frontend/src/app/features/auth/signup.page.spec.ts` (72 lines)

**Interfaces:** consumes Tasks 1–3. Produces nothing downstream.

**Variant: `split`.**

**Measured inventory:**
- **Test ids:** `signup-form`, `signup-name`, `signup-email`, `signup-password`, `signup-password-error`, `signup-error`, `signup-submit`, `signup-google`. `e2e/tests/auth.spec.ts:76-78` fills `signup-name`, `signup-email`, `signup-password` with Playwright `.fill()`, **which requires the located node to be an `<input>`** — so all three must ride `bh-field`'s `testId` input onto the inner control, never the host.
- **3 legacy `.bh-input`** sites → 0.
- **Eager** at line 39 → drop. **`FormsModule`/`ngModel`** → drop.
- **Plain hrefs:** 3 — `/oauth2/authorization/google` (line 32 → `bh-button [href]`), `/auth/login` (34), `/auth/start` (35).
- **`.google` block** (lines 49–52) deleted.

**Behaviour that must survive:** `register` returns **201 always**, even for an already-registered address — a taken address mails the real owner instead, and the 201 body is built from the request only. **Do not add a "that email is taken" message**; it would be an enumeration oracle. `passwordErrorMessage(e.error?.detail)` maps backend codes to copy; anything unmapped falls back to the generic message.

**Autocomplete required:** `name` → `name`, `email` → `username`, `password` → `new-password`.

**Volt budget: one** — `Create account`.

**Questions for Step B:** panel eyebrow + headline; whether the password rule ("min 10 characters") stays a placeholder or becomes a persistent hint (a placeholder disappears the moment someone types, which is when the rule matters).

---

## Task 10: `start-box` — split

**Files:**
- Modify: `frontend/src/app/features/auth/start-box.page.ts` (150 lines)
- Test: `frontend/src/app/features/auth/start-box.page.spec.ts` (105 lines)

**Interfaces:** consumes Tasks 1–3, and Task 5's backend change is what makes this screen's owner get the right locale.

**Variant: `split`.**

**Measured inventory:**
- **Test ids (18, the most of any screen):** `start-loading`, `start-fetch-error`, `start-retry`, `start-form`, `start-box-name`, `start-name`, `start-email`, `start-password`, `start-password-error`, `start-error`, `start-submit`, `start-full-copy`, `start-waitlist-success`, `waitlist-form`, `waitlist-box-name`, `waitlist-email`, `waitlist-error`, `waitlist-submit`. `e2e/tests/onboarding.spec.ts` drives several with `.fill()`.
- **6 legacy `.bh-input`** sites → 0. **Eager** line 68 → drop. **`FormsModule`/`ngModel`** → drop.
- **1 plain href:** `/auth/login` (line 43) → `routerLink`.

**This screen has four modes**, not states-of-one-form: `loading`, `error` (with a Retry), `open` (the real signup form), `full` (the waitlist form, which itself has a submitted state). All four must render, and the mode is resolved live from `signupMode()`.

**Behaviour that must survive:** the mode can flip between load and submit — `res.body?.full` swaps to the waitlist form **carrying what the user already typed** (name and password aren't needed there). `503 SIGNUP_RETRY` gets "Try again in a moment", not the generic error: it is the bounded 3-attempt taken-vs-slug retry giving up, and it is retryable.

**Volt budget: one per mode** — `Create your box` in `open`, `Join waitlist` in `full`. The `Retry` in `error` is a ghost.

**Questions for Step B:** panel eyebrow + headline, and **whether the panel changes between the `open` and `full` modes** — "Open your box" and "Join the waitlist" are different propositions and the panel is where that would read.

---

## Task 11: `join` — split

**Files:**
- Modify: `frontend/src/app/features/join/join.page.ts` (108 lines)
- Create: `frontend/src/app/features/join/join.page.spec.ts` — **this screen has no spec file today.** It is the only one of the eleven without one.

**Interfaces:** consumes Tasks 1–3. Task 6 changes the link that reaches this screen from the admin page.

**Variant: `split`.** This is the screen whose panel names the **box**, and the reason the panel content stacks rather than disappears on phone.

**Measured inventory:**
- **Test ids:** `join-invalid`, `join-accept`, `join-name`, `join-email`, `join-password`, `join-register`, `join-error`. `e2e/tests/invite-flow.spec.ts` drives `join-name`, `join-password`, `join-register`.
- **3 legacy `.bh-input`** → 0. **Eager** line 45 → drop. **`FormsModule`/`ngModel`** → drop.
- **1 `[href]` binding:** line 38, `'/auth/login?returnUrl=/join/' + token` → `routerLink` with `[queryParams]`.
- **Raw `font-size: 44px`** at line 50 — one of the two **live** off-scale values in the milestone. Deciding which `--fs-*` token it should be is a **question for Step B**, not the executor's call: no token on the scale is 44px, so choosing one is a visible design change. `--fs-hero` is 2.5rem/40px.

**Three approved behaviour fixes — this is the only screen carrying any:**
1. **`minlength="8"` → the real floor.** Line 34 says 8 while the backend rejects under 10, so the form invites a password the server refuses. Every other password field in the product says 10.
2. **Stop rendering raw backend codes at the user.** Lines 95 and 105 both do `e.error?.detail ?? 'Could not join — try again'`, so a backend code reaches the screen as user-facing copy. Map the codes the way `passwordErrorMessage` does elsewhere, and fall back to real prose.
3. **Add a pending state to both submit paths.** `registerAndJoin()` and `acceptExisting()` have **no `pending` signal at all**, against design law §11.6 (every save shows pending + inline error with input preserved). Both are multi-step `switchMap` chains, so the window is long.

**Behaviour that must survive:** `previewInvite` prefills `email` from the invite and a failure sets `invalid()`. `registerAndJoin` is a four-stage chain — register → login → accept → refresh+selectBox — and registering through a valid invite for that address **lands the user verified** (M8 T11). `loggedIn` is read once at construction.

**Volt budget: one** — `Create account & join`, or `Join <box>` in the logged-in branch.

**Questions for Step B:** panel eyebrow + headline and how the box name reads there; whether the role and plan line stays in the body or moves to the panel; the 44px decision above.

---

## Task 12: `box-picker` — narrow

**Files:**
- Modify: `frontend/src/app/features/auth/box-picker.page.ts` (60 lines)
- Test: `frontend/src/app/features/auth/box-picker.page.spec.ts` (39 lines)

**Variant: `narrow`.**

**Measured inventory:**
- **Test ids:** `box-picker-error`, and the dynamic `[attr.data-testid]="'box-' + m.boxSlug"`. **The dynamic one must keep its exact expression** — `e2e/tests/_support.ts`-driven specs select boxes by slug.
- **Eager** line 29 → drop. No `FormsModule`, no legacy classes, no hrefs.
- **Raw `font-size: 14px`** at line 35 (`.empty`) — the second **live** off-scale value. `--fs-sm` is 0.8125rem/13px and `--fs-body` is 0.9375rem/15px; neither is 14px, so this is a **question for Step B**.

**One approved behaviour change: give the screen a way out.** It has no sign-out and no back link today, so a user who lands here on the wrong account — or whose only box is suspended, which is an error this screen already renders at line 17 — has no control on the page. **This is new UI: its shape is a Step B question, not the executor's invention.**

**Behaviour that must survive:** the empty state ("No memberships yet — ask your box admin for an invite") and the `selectBox` error arm, which exists because box-token mint 403s a SUSPENDED or REJECTED box.

**Volt budget: one.** Note the risk: the list is `@for`-rendered, so "volt the primary action" cannot mean volt per row. `.box:hover { border-color: var(--volt) }` at line 41 already exists — whether hover may be volt here is worth checking against law §5, which says a thing that turns volt has become *live*, and hovering it has not.

---

## Task 13: `check-email` — narrow

**Files:**
- Modify: `frontend/src/app/features/auth/check-email.page.ts` (72 lines)
- Test: `frontend/src/app/features/auth/check-email.page.spec.ts` (58 lines)

**Variant: `narrow`.**

**Measured inventory:** test ids `check-email-copy`, `check-email-resent`, `check-email-error`, `check-email-resend`. **Eager** line 27 → drop. One plain href, `/auth/login` (line 23) → `routerLink`. No legacy classes, no `FormsModule`.

**Behaviour that must survive:** the 60s resend cooldown (`RESEND_COOLDOWN_MS`) and its reason — the backend limit is 3/h per email, so a bare re-enable lets a frustrated user hammer it into a 429. `ngOnDestroy` clears the timer. The address comes from a query param and may be empty.

**Volt budget: one** — the `Resend` control is the only action on the screen. Note it is currently `variant="ghost"`; whether the single action on a screen should be the primary is a Step B question.

---

## Task 14: `verify` — narrow

**Files:**
- Modify: `frontend/src/app/features/auth/verify.page.ts` (103 lines)
- Test: `frontend/src/app/features/auth/verify.page.spec.ts` (67 lines)
- Modify: `e2e/tests/onboarding.spec.ts` — see the behaviour fix below

**Variant: `narrow`.** Three states: `pending`, `expired` (which grows an email field and a resend), `error`.

**Measured inventory:** test ids `verify-pending`, `verify-expired`, `verify-resend-email`, `verify-resent`, `verify-resend-error`, `verify-resend`, `verify-error`. **1 legacy `.bh-input`** (line 28) → 0. **Eager** line 46 → drop. **`FormsModule`/`ngModel`** → drop. One plain href, `/auth/signup` (line 40) → `routerLink`.

**One approved behaviour fix: auto-select a single box.** Line 78 navigates to `/` on success, which lands the user on a box picker holding **one item** when they have exactly one membership. Login already auto-selects in that case (`login.page.ts:96-103`) — copy that shape, including its `selectBox` error arm for a SUSPENDED box. Pre-existing since M8.

**`e2e/tests/onboarding.spec.ts` routes through `/auth/boxes` specifically to work around this** and must be updated in the same commit. **Do not weaken its assertions** — change the navigation expectation only. If the spec cannot be updated without loosening what it proves, **stop and escalate.**

**Behaviour that must survive:** cookies are already set by the verify response, so the redirect re-syncs the session mirror rather than logging in again. `410` means expired, anything else means invalid. The 60s resend cooldown, as in Task 13.

**Volt budget: one.**

---

## Task 15: `forgot` — narrow

**Files:**
- Modify: `frontend/src/app/features/auth/forgot.page.ts` (59 lines)
- Test: `frontend/src/app/features/auth/forgot.page.spec.ts` (46 lines)

**Variant: `narrow`** — permanently, in both its form state and its submitted state. **Do not key the variant on `submitted()`.**

**Measured inventory:** test ids `forgot-confirm`, `forgot-form`, `forgot-email`, `forgot-submit`. `e2e/tests/auth.spec.ts:110-112` drives `forgot-email` with `.fill()` and asserts `forgot-confirm`. **1 legacy `.bh-input`** → 0. **Eager** line 32 → drop. **`FormsModule`/`ngModel`** → drop. One plain href, `/auth/login` (line 28) → `routerLink`.

**Behaviour that must survive, and it is a security property, not a style choice:** both the success and the error arms set `submitted()` and render the **identical sentence**. The backend returns 202 always and 429 on rate-limit, and both look the same to the user by design. The existing comment at lines 16–17 says *"Never branch on the response here."* **Keep that comment and that behaviour.** Adding a distinct error message here would turn the screen into an account-enumeration oracle.

**Volt budget: one** — `Send reset link`. The submitted state has **no** volt element, and that is correct: it answers no question that needs marking.

---

## Task 16: `reset` — narrow

**Files:**
- Modify: `frontend/src/app/features/auth/reset.page.ts` (84 lines)
- Test: `frontend/src/app/features/auth/reset.page.spec.ts` (53 lines)

**Variant: `narrow`**, in both the form and expired branches.

**Measured inventory:** test ids `reset-expired`, `reset-form`, `reset-password`, `reset-password-error`, `reset-error`, `reset-submit`. `e2e/tests/auth.spec.ts:116` drives `reset-password` with `.fill()`. **1 legacy `.bh-input`** → 0. **Eager** line 39 → drop. **`FormsModule`/`ngModel`** → drop. One plain href, `/auth/forgot` (line 20) → `routerLink`.

**Behaviour that must survive:** a missing token sets `expired()` at init rather than letting a submit fail. `410` on submit also means expired. Cookies are set by the response, so success navigates to `/` and the session mirror re-syncs. A successful reset **revokes every session** (backend) — worth knowing when writing the copy.

**Autocomplete required:** `new-password`.

**Volt budget: one** — `Set new password`. The expired branch's "Request a new link" is a text link.

---

## Task 17: `account/email` — narrow

**Files:**
- Modify: `frontend/src/app/features/account/email-confirm.page.ts` (72 lines)
- Test: `frontend/src/app/features/account/email-confirm.page.spec.ts`

**Variant: `narrow`.** The only screen in the set with **no form in any state**: `pending`, `done`, `expired`, `error`.

**Measured inventory:** test ids `email-confirm-pending`, `email-confirm-done`, `email-confirm-expired`, `email-confirm-error`. **Eager** line 47 → drop. **Already uses `routerLink`** (line 31) — no href conversion needed. No `FormsModule`, no legacy classes.

**Behaviour that must survive:** the page is `permitAll` on the backend and **never assumes a session** — the link is clicked from an inbox, possibly on a device that has never logged in. It posts the token and reports what happened, nothing more. The javadoc at lines 8–13 records this; keep it.

**Volt budget: at most one** — the `done` state's "Go to login" is the only candidate. `pending`, `expired` and `error` have **no** volt element, and that is correct.

---

## Task 18: `account/security` — its own layout

**Files:**
- Modify: `frontend/src/app/features/account/security.page.ts` (389 lines — the largest in the set)
- Test: `frontend/src/app/features/account/security.page.spec.ts`

**Interfaces:** consumes Tasks 1 and 2. **Does NOT consume `bh-auth-layout`** — it is an in-app settings page reached from all three shells with a back control, not an auth screen.

**Measured inventory:**
- **35 test ids**, the most in the milestone. `e2e/tests/security.spec.ts` asserts several. Run the "no test id may disappear" gate on this file with particular care.
- **6 legacy `.bh-input`** sites → 0 — the most in the set.
- **Eager** line 160 → drop. **`FormsModule`/`ngModel`** → drop, across **four** separate forms plus the delete sheet's two fields.
- **Already uses `routerLink`** for the two forgot-password links.

**Five sections:** Password · Email · Sessions · Danger zone · the delete `bh-sheet`. **Restructuring them is out of scope** (spec §7.2) — this task rebuilds against the new contract and shapes the existing structure, it does not split the page into routes.

**Behaviour that must survive — this screen has the most of it, and several are security properties:**
- **The delete flow sends no password first.** A `422 WRONG_PASSWORD` back means "this account has a password and it wasn't supplied", which is what reveals the field. A Google-only account never sees the field because it never gets that 422. The comment at lines 222–224 explains it; keep both.
- **Second-attempt copy differs**: once the field is already visible and the user typed something, the message is "That password is wrong", not "Enter your password" — telling them to do the thing they just did.
- `LAST_ADMIN` (409) names the box and says what to do about it.
- **`canDelete()` requires the literal string `DELETE`** plus a password when needed.
- **`revokingId` is keyed per row**, deliberately — a single boolean would disable every button. Revoking the session you are currently holding ends it, so that branch clears and navigates to login.
- **`NO_PASSWORD_SET` (409)** on either password or email change reveals the Google-only message.
- Changing the password **signs out other devices**; changing the email is confirmed **at the new address** and the current one stays active until then. Both facts are in the visible copy.
- The export builds a Blob client-side and names it from `BRAND_NAME`.

**Design law on the destructive controls, and it is exact:** the control that **opens** the delete flow is a **danger-bordered ghost** (`.deletebtn` at line 185 already is), and the control that **executes** it is **filled** (`variant="danger"` at line 154 already is). `--danger` may fill a **button or chip** and nothing larger — never the section. `--on-danger` is dark, not white.

**Volt budget:** this is a settings page with four independent saves and no single primary action. **Ask at Step B** — the honest reading of law §2.3 is that a screen answering no single question may legitimately have **zero** volt elements, and this is the screen where that case first arises.

**Questions for Step B:** the volt question above; whether the four saves keep their current per-section placement; whether the sessions list adopts `bh-data-table`'s card mode on phone (`bh-data-table` shipped it in M13c and **nothing adopts it yet** — this is a candidate, but adopting it changes the phone layout, so it is the user's call).

---

# Phase 3 — closing the milestone

## Task 19: extend axe-core over all eleven screens

**Files:**
- Modify: `e2e/tests/a11y.spec.ts`

**Interfaces:** consumes every screen from Tasks 8–18.

M13c scoped axe to the dev gallery plus the three shells' chrome, deliberately, so that milestone could not become a screen-fixing one. M13d ships the first real screens, so they are audited.

- [ ] **Step 1: Read the existing spec and match its structure**

`e2e/tests/a11y.spec.ts` today audits the gallery whole-page and the three shells `.include()`-scoped to chrome only. **Read it before adding anything.** Note the M13c lesson recorded in its own spec: the first version audited `bh-dock` at desktop where it is `display: none` and therefore inspected **zero nodes**. Audit each part at the width it actually renders at.

- [ ] **Step 2: Add the eleven screens**

Each screen gets a whole-page audit at the widths it is designed for — the four `split` screens at **375 and 1440** (the split only exists above 720px, so a desktop-only audit would miss the stacked layout and vice versa), the seven others at **375**.

Screens needing state to reach: `verify` and `account/email` need a token query param to reach their `expired`/`error` states; `check-email` needs an `email` query param; `join` needs a real invite token; `account/security` needs a session. Follow `e2e/tests/_support.ts`'s `login()` and `runId()` conventions — **every entity a spec creates must carry the run id**, so a rerun against the same stack cannot collide.

- [ ] **Step 3: Run**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test a11y.spec.ts
```

Expected: **zero WCAG 2.2 AA violations.** A violation here is a real defect in a screen this milestone just built — fix the screen, never the assertion.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/a11y.spec.ts
git commit -m "test(e2e): axe-core covers all eleven auth and account screens

M13c scoped axe to the gallery and shell chrome so it could not become a
screen-fixing milestone. M13d ships the first real screens, so they are audited —
split screens at 375 and 1440, since the split layout only exists above 720px and
a single-width audit would miss one of the two.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 20: visual-regression baselines for the eleven screens

**Files:**
- Modify: `e2e/tests/visual.spec.ts`
- Create: `e2e/tests/visual.spec.ts-snapshots/` — ~22 new PNG baselines

**This task is LAST, and that ordering is not negotiable.** Baselines churning while screens are still being designed is the stated reason this gate was cut once already (M13c §8.5).

- [ ] **Step 1: Add the screens to the spec**

Two widths per screen, ~22 baselines on top of the existing **54**. Match the existing spec's `data-gallery` wrapper convention where it applies, and its `threshold: 0` / `maxDiffPixels: 100` sensitivity — **tuned by measurement, not taste**: the default `0.2` could not see a `--r-card` 12→20px change on this dark-on-dark palette. Noise floor ≤29px, radius signal ≥298px.

- [ ] **Step 2: Generate the baselines INSIDE the Linux container**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e
./visual.sh --update-snapshots
```

**Never `npx playwright test visual.spec.ts` locally.** `snapshotPathTemplate` drops `{platform}` on purpose and the spec is excluded from the default run — macOS baselines enforced on Linux is not a stricter check, it is **no check**.

- [ ] **Step 3: Verify they enforce**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e
./visual.sh
```

Expected: all **76** pass with no `--update-snapshots`.

- [ ] **Step 4: Prove one baseline actually discriminates**

Change one screen's `--r-card` or a heading size, re-run `./visual.sh`, and confirm it **fails**. Revert. A baseline never seen to fail proves nothing — this milestone's own spec has two examples of gates that passed vacuously for months.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/visual.spec.ts e2e/tests/visual.spec.ts-snapshots
git commit -m "test(e2e): visual baselines for the eleven auth and account screens

54 -> 76 baselines, two widths each, generated and enforced only inside the Linux
container. Known cost, accepted: a deliberate copy change to any auth screen now
needs e2e/visual.sh --update-snapshots, and these screens have more copy churn
ahead than the gallery does. It is the only automated proof that the global
link-colour change did what it should.

One baseline was verified to fail on a deliberate change before being trusted.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 21: the consistency pass, the docs, and the merge

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/BACKLOG.md`
- Modify: `.superpowers/sdd/progress.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: The cross-screen consistency pass**

**The eleven per-screen critiques do not cover this and must not be reported as if they did.** A critique scoped to one screen is blind to whether `forgot` and `reset` read as siblings and whether the four panel headlines cohere as a set. Look at the eleven together — this is a look at the set, not a re-critique — and fix what only appears at that level.

- [ ] **Step 2: Full gate run**

Repeat every step of Task 7, plus `./visual.sh` and `a11y.spec.ts`. Expected: frontend **≥261** plus every screen's specs, backend **431/0/0**, e2e **35 passed + 1 skipped** plus the new axe cases, visual **76**, build clean with zero budget warnings.

Then the milestone's own capped gate:

```bash
grep -rnoE 'class="[^"]*\bbh-(input|select)\b' frontend/src/app | wc -l
```

Expected: **≤32** (53 today, minus the 21 in M13d's seven files).

- [ ] **Step 3: Update `docs/BACKLOG.md`**

- **Delete** the `### → M13d Auth & account screens` section — the standing instruction is to delete a finished milestone's section rather than strike items through.
- Move to the archive, with what actually happened: the global link colour (fixed, verified by sweep), the second-error-message defect (fixed with a negative control), the invite redirect hop (fixed), the `signup-box` Accept-Language gap (fixed).
- **Update, do not delete, the `bh-button` anchor entry**: record that `href` was built for two real consumers and that **`routerLink` support was deliberately not built**, so M14 does not re-derive the decision. `wod-library.page.ts:15`'s `<button>`-inside-`<a>` is still open and still M14's.
- Update the 41-off-scale-px entry: **four fewer** — two deleted as dead CSS in `login.page.ts`, two decided in `box-picker` and `join`.
- Update the legacy `.bh-input` cap from 53 to its measured new value.
- `verify` auto-select and the join defects: closed.
- **Leave the quarantined TV/SSE defect at the top untouched.**

- [ ] **Step 4: Update `docs/HANDOFF.md`**

Add the M13d status entry with measured test counts, and rewrite "Immediate next step" for **M19, the landing site** — the order decided on 2026-08-09 is M13d → M19 → M14. Record honestly: what the browser sweep found, anything left unverified, and that the per-screen impeccable cycle ran for the first time and whether it was worth it.

- [ ] **Step 5: Update `CLAUDE.md`**

Two rules earned during this milestone belong in the binding file, stated as rules rather than history:
- **The form contract**: `bh-field`/`bh-select` are not `ControlValueAccessor`s; screens bind `[(value)]` against signals and every form carries an explicit `novalidate`, because `NgForm` was the thing supplying it. Binds M14–M18.
- **The impeccable cycle runs per screen** — `shape` before, `critique` after — not once per milestone.

- [ ] **Step 6: Update `.superpowers/sdd/progress.md`** with the task→SHA ledger and every trap hit.

- [ ] **Step 7: Merge**

Use `superpowers:finishing-a-development-branch`. **Executors never self-merge.** Push, then **check the CI run** — a local green is not the gate — and compare any red against `main`'s pre-existing signature before blaming it on this work.

---

## Self-review

**Spec coverage** — every section maps to a task: §2/§3 → Task 3 · §4/§4.1 → Task 1 + every Phase 2 task's gates 3 and 5 · §5.1 → Task 1 · §5.2 → Task 1 · §5.3 → Task 2 · §6 → Task 4 · §7.1 → Task 5 + Task 6 · §7.2 → excluded in Tasks 12 and 18 · §7.3 (the three behaviour fixes) → Tasks 11, 12, 14 · §8 → each Phase 2 task's measured inventory · §9 → the Phase 2 cycle section · §9.1 → Task 21 Step 1 · §9.2 → the Phase 2 cycle section · §10 → gates 1 and 7 · §11 → Tasks 7, 19, 20, 21 · §12 → stated as exclusions throughout · §13 → the Step B questions on each screen task.

**One deliberate deviation from the writing-plans skill, named so it is a decision and not an oversight:** Tasks 8–18 carry no template code. That is not a placeholder — spec §1 and §13 leave every screen's design undecided until its shaping turn, on the user's standing instruction. Writing markup for eleven undesigned screens is precisely the guessing this milestone is paced to avoid. What those tasks *do* carry is complete: measured inventory, exact test ids at risk, the behaviour that must survive with its reasons, the volt budget, the gates, and the questions that must reach the user.

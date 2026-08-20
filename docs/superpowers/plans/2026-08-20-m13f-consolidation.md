# M13f Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend signal trustworthy — every standing gate green on clean code, `bh-button` unable to express a state it silently drops, the dev gallery's seven-states contract machine-checkable, the destructive flow axe-scanned, and the quarantined TV test diagnosed.

**Architecture:** Five independent repairs, ordered so each makes the next one's evidence readable. The gates are repaired first (nothing below can be verified while they are red). `bh-button`'s invalid states are made *unrepresentable* by folding a boolean flag into the variant union rather than guarding it. The gallery's freeform prose state-notes become a uniform data-driven **state ledger**, which turns a prose obligation into a structure a Karma spec can assert — written test-first, so the gate fails for all 20 sections before any are filled in.

**Tech Stack:** Angular 22 (signal inputs, `@if`/`@for`, `NgTemplateOutlet`), Karma/Jasmine, Playwright + `@axe-core/playwright`, SCSS custom properties, `@angular/localize`.

**Spec:** `docs/superpowers/specs/2026-08-20-m13f-consolidation-design.md`

## Global Constraints

- **Branch, not worktree.** Work in `~/dev/boxhub` on `m13f-consolidation`. `git worktree list` must show exactly one entry throughout. Never run `EnterWorktree`.
- **Backend must not move:** `510 / 0 / 0`. Migration head stays **V27**. No new migration. Any backend movement is a scope leak.
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** on every backend command; the system JDK is 26. Use `mvn clean test`, never bare `mvn test`, after reverting anything.
- **Tokens only.** No raw hex, no raw px font-size, no hardcoded color/radius/spacing. `frontend/src/app/ui/` is signal-inputs-only: no `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager`.
- **Every new user-facing string ships i18n-marked.** In templates use `i18n="@@id"`; in TypeScript use `$localize` with an explicit `:@@id:` prefix. No new hardcoded user-facing string, ever.
- **Never pipe a gate through `grep`/`tail`.** In zsh `$?` after a pipe is the pipe's. Redirect to a file, check `$?` on the next line.
- **Never edit `AuthzConformanceTest`** — orchestrator only. No route changes in this milestone.
- **`README.md` is edited in a separate opencode session.** Do not touch it.
- **Karma:** `npm test -- --watch=false --browsers=ChromeHeadless`, never bare `npm test` (hangs in watch mode).
- **Visual:** `e2e/visual.sh` (Linux container), never Playwright locally — local runs compare against baselines this renderer never wrote.
- **Negative control on every test added.** Break the implementation, watch it go red, revert. If you cannot name the mutation a test catches, say so instead of counting it as coverage.
- **Escalate, never guess.** Blocked, ambiguous, or plan-conflicts-with-reality returns to the orchestrator.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `frontend/src/app/ui/sheet.component.ts` | Modify comment only (gate false positive) | 1 |
| `frontend/src/app/ui/avatar.component.spec.ts` | Modify comment only (gate false positive) | 1 |
| `frontend/src/app/ui/field.component.spec.ts` | Modify fixture only (gate false positive) | 1 |
| `frontend/src/app/ui/button.component.ts` | Variant union absorbs `dangerBorder`; `href` branch honours disabled/loading | 2 |
| `frontend/src/app/ui/button.component.spec.ts` | Specs for the new variant and the fixed anchor branch | 2 |
| `frontend/src/app/features/account/danger.page.ts` | Sole `dangerBorder` call site → `variant="ghost-danger"` | 2 |
| `frontend/src/app/features/account/danger.page.spec.ts` | Comment references the removed input | 2 |
| `frontend/src/app/features/dev/dev-gallery.page.ts` | State-ledger data + template; per-section ledgers; new button coverage | 3, 4, 5, 6 |
| `frontend/src/app/features/dev/dev-gallery.page.spec.ts` | **Create** — the ledger completeness gate | 3 |
| `e2e/tests/a11y.spec.ts` | Second `SCREENS` entry scanning the open delete sheet | 7 |
| `backend/src/main/java/com/boxhub/display/TvStateService.java` | Temporary diagnostic logging in `compose()` | 8 |
| `docs/BACKLOG.md`, `docs/HANDOFF.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/NEXT-SESSION.md` | Milestone close | 9 |

---

## Task 1: Repair the two red gates

Two of the eight standing §8.1 gates return non-zero on clean `main`. All three hits are false positives — two comments and one spec fixture. **No grep is weakened, narrowed, or given an `--exclude`**: adding an exclusion would carve spec files out of a guarantee that must cover them, since a spec can reintroduce a banned pattern as easily as a component. The matched *text* is what changes.

**Files:**
- Modify: `frontend/src/app/ui/sheet.component.ts:12`
- Modify: `frontend/src/app/ui/avatar.component.spec.ts:26`
- Modify: `frontend/src/app/ui/field.component.spec.ts:44`

**Interfaces:**
- Consumes: nothing.
- Produces: a green eight-gate baseline that every later task re-runs unchanged.

- [ ] **Step 1: Confirm the two gates are red right now**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/g1.txt; echo "px gate hits: $(wc -l < /tmp/g1.txt)"
grep -rn '@Input()\|@Output()' frontend/src/app/ui > /tmp/g2.txt; echo "decorator gate hits: $(wc -l < /tmp/g2.txt)"
cat /tmp/g1.txt /tmp/g2.txt
```

Expected: `px gate hits: 1`, `decorator gate hits: 2`, listing exactly `field.component.spec.ts:44`, `avatar.component.spec.ts:26`, `sheet.component.ts:12`.

If the counts differ, **stop and report to the orchestrator** — the baseline has moved and the plan needs re-verifying.

- [ ] **Step 2: Reword the `sheet.component.ts` comment**

The current line 12 reads:

```
 * re-run the effect — the sheet will not reopen. This isn't new: the old `@Input() set open` had
```

Replace with:

```
 * re-run the effect — the sheet will not reopen. This isn't new: the pre-M13c decorator-based
 * setter had
```

Merge it into the surrounding sentence so the paragraph still reads naturally — the following line begins `* the same requirement.` The point being preserved is that the requirement predates the signal-input rewrite.

- [ ] **Step 3: Reword the `avatar.component.spec.ts` comment**

The current line 26 reads:

```
    // THE DEFECT THIS TEST EXISTS FOR. Before M13c, `name` was a plain @Input() field read inside
```

Replace with:

```
    // THE DEFECT THIS TEST EXISTS FOR. Before M13c, `name` was a plain decorator-based input field
    // read inside
```

Merge into the following line, which begins `// computed(), so the computed had ZERO signal dependencies`. The defect being described is unchanged; only the banned token is removed.

- [ ] **Step 4: Fix the `field.component.spec.ts` fixture**

The current line 44 reads:

```html
      <a labelAction data-testid="action" style="font-size: 12px">¿Olvidaste tu contraseña?</a>
```

Replace with:

```html
      <a labelAction data-testid="action" style="font-size: 0.75rem">¿Olvidaste tu contraseña?</a>
```

`0.75rem` renders identically to `12px` at the default root font size, so the overlap condition this fixture reproduces (320px width, long Spanish string, small action text) is preserved exactly. Only the unit changes.

- [ ] **Step 5: Run all eight §8.1 gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
fail=0
check(){ eval "$2" > /tmp/gate.txt 2>&1; n=$(wc -l < /tmp/gate.txt); if [ "$n" -ne 0 ]; then echo "RED  $1 ($n)"; cat /tmp/gate.txt; fail=1; else echo "green $1"; fi; }
check "bh-table/dock classes" "grep -rnE 'class=\"[^\"]*\bbh-(table|table-wrap|dock|dock-item)\b' frontend/src/app"
check "bh-table/dock styles"  "grep -rnE '\.bh-(table|dock)\b' frontend/src/styles.scss frontend/src/styles"
check "px font-size in ui"    "grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui"
check "on-scale px features"  "grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features"
check "Eager in ui"           "grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/ui"
check "decorators in ui"      "grep -rn '@Input()\|@Output()' frontend/src/app/ui"
check "dead components"       "grep -rn 'StatComponent\|BoardRowComponent\|TagComponent' frontend/src"
check "raw hex"               "grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts"
echo "---"; [ "$fail" -eq 0 ] && echo "ALL EIGHT GREEN" || echo "GATES STILL RED"
```

Expected: `ALL EIGHT GREEN`.

Note the shape: each grep redirects to a file and `wc -l` reads that file. Nothing is piped, so no `$?` is ever the pipe's.

- [ ] **Step 6: Negative control — prove the px gate can still fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
printf '\n/* temp */\n.x { font-size: 12px; }\n' >> frontend/src/app/ui/panel.component.ts
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/nc.txt; echo "hits: $(wc -l < /tmp/nc.txt)"
git checkout -- frontend/src/app/ui/panel.component.ts
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/nc2.txt; echo "after revert: $(wc -l < /tmp/nc2.txt)"
```

Expected: `hits: 1`, then `after revert: 0`. The mutation this gate catches: a raw px font-size reintroduced anywhere under `app/ui`.

Repeat the same shape for the decorator gate by temporarily adding `// @Input()` to a `ui/` file. Expected: red, then green after revert.

- [ ] **Step 7: Run Karma to confirm the fixture change broke nothing**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: 412 specs, 0 failures.

- [ ] **Step 8: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/ui/sheet.component.ts frontend/src/app/ui/avatar.component.spec.ts frontend/src/app/ui/field.component.spec.ts
git commit -m "fix(gates): all eight §8.1 greps green on clean code

Two of the eight standing gates returned non-zero on clean main, on three
false positives: two comments naming the token their own gate hunts, and a
spec fixture carrying a raw px font-size. A gate you have to explain away
stops being a gate — the next person reads the red as noise.

No grep is weakened, narrowed or excluded. The matched text changed:
comments reworded, and the fixture's 12px became 0.75rem, which renders
identically and preserves the overlap condition it reproduces."
```

---

## Task 2: `bh-button` — fold the flag into the variant union, fix the `href` branch

Two changes to one component.

**(a) `dangerBorder` is deleted and absorbed into `variant`.** It is a boolean meaningful on exactly one variant, which is what makes four of ten combinations emit an inert `danger-border` class. Folding it in makes the invalid states **unrepresentable**: `primary + dangerBorder` cannot be typed at all, and `ng build --configuration production` — the only gate that type-checks Angular templates — rejects future misuse at compile time instead of rendering nothing at runtime. The component *loses an input* rather than gaining a check.

**(b) The `href` branch honours `disabled`, `loading`, `aria-busy` and `aria-disabled`.** Today it honours none of them: `<bh-button href="…" [loading]="true">` renders a clickable link with no spinner and no busy state. Latent — both live `href` sites are plain ghosts — but it is the combination that actually fails silently, and it is the one real defect in this component.

**Files:**
- Modify: `frontend/src/app/ui/button.component.ts`
- Modify: `frontend/src/app/ui/button.component.spec.ts`
- Modify: `frontend/src/app/features/account/danger.page.ts:40`
- Modify: `frontend/src/app/features/account/danger.page.spec.ts:88` (comment only)
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts:119-120, 197` (gallery cell + note)

**Interfaces:**
- Consumes: Task 1's green gate baseline.
- Produces: `ButtonComponent` with
  `variant = input<'primary' | 'ghost' | 'ghost-danger' | 'danger' | 'icon' | 'solid'>('primary')`,
  **no `dangerBorder` input**, and an anchor branch that drops `href` when disabled or loading.
  Tasks 4–6 render this component in the gallery and must use `variant="ghost-danger"`.

- [ ] **Step 1: Write the failing specs**

Add to `frontend/src/app/ui/button.component.spec.ts`. First update the existing `Host` (lines 5-17), which currently binds the input being deleted:

```ts
@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()" [label]="lbl()" [ariaDisabled]="ad()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'ghost-danger' | 'danger' | 'icon' | 'solid'>('primary');
  d = signal(false);
  l = signal(false);
  lbl = signal('');
  ad = signal(false);
}
```

Then add these hosts beside the existing `LinkHost` / `PlainHost` block:

```ts
@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button href="/oauth2/authorization/google" [loading]="l()" [disabled]="d()">Google</bh-button>`,
})
class LinkStateHost {
  l = signal(false);
  d = signal(false);
}
```

And these specs:

```ts
describe('ButtonComponent ghost-danger variant', () => {
  let f: any;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  // The danger-bordered ghost is now a variant, not a ghost+flag pair, so a border can no
  // longer be requested on a variant that has no rule for it.
  it('emits both ghost and the danger border in one class', () => {
    f.componentInstance.v.set('ghost-danger');
    f.detectChanges();
    const cls = f.nativeElement.querySelector('button').className;
    expect(cls).toContain('ghost-danger');
    expect(cls).not.toContain('primary');
  });
});

describe('ButtonComponent as a link, disabled and loading', () => {
  let f: any;
  const a = (): HTMLAnchorElement => f.nativeElement.querySelector('a');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkStateHost] }).compileComponents();
    f = TestBed.createComponent(LinkStateHost);
    f.detectChanges();
  });

  it('carries an href and is not busy by default', () => {
    expect(a().getAttribute('href')).toBe('/oauth2/authorization/google');
    expect(a().getAttribute('aria-busy')).toBe('false');
    expect(a().getAttribute('aria-disabled')).toBeNull();
  });

  // THE DEFECT THIS TEST EXISTS FOR. An anchor cannot be natively disabled, so a loading link
  // stayed fully clickable with no spinner and no busy state — the one combination of this
  // component's inputs that silently did nothing.
  it('drops href, announces busy and shows the spinner while loading', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(a().getAttribute('href')).toBeNull();
    expect(a().getAttribute('aria-busy')).toBe('true');
    expect(a().getAttribute('aria-disabled')).toBe('true');
    expect(a().querySelector('.spin')).toBeTruthy();
  });

  it('drops href and announces disabled, without a spinner, when disabled', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(a().getAttribute('href')).toBeNull();
    expect(a().getAttribute('aria-disabled')).toBe('true');
    expect(a().getAttribute('aria-busy')).toBe('false');
    expect(a().querySelector('.spin')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the specs to verify they fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL. The `ghost-danger` spec fails because the variant does not exist; the three link-state specs fail because the anchor branch ignores `loading` and `disabled`. Compilation may also fail on the `Host` template if `dangerBorder` is still declared — that is expected at this step.

- [ ] **Step 3: Rewrite the component template and class**

In `frontend/src/app/ui/button.component.ts`, replace the anchor branch (currently lines 19-26) with:

```html
    @if (href()) {
      <!-- A link styled as a button must BE an anchor: routerLink/href on a bh-button host emits
           no href at all, losing ctrl/cmd-click, open-in-new-tab and the correct role. Two real
           consumers: the Google control on login and on signup.
           An anchor cannot be natively disabled, so the guard is to withhold `href` entirely —
           without it the element is not activatable and drops out of the tab order, which is the
           behaviour `disabled` gives the <button> branch. -->
      <a [attr.href]="inert() ? null : href()"
         [class]="'btn ' + variant() + ' ' + size()"
         [attr.aria-busy]="loading()"
         [attr.aria-disabled]="inert() ? 'true' : null"
         [attr.aria-label]="label() || null" [attr.data-testid]="testId() || null">
        @if (loading()) { <span class="spin" aria-hidden="true"></span> }
        @if (!(loading() && variant() === 'icon')) { <ng-container [ngTemplateOutlet]="body" /> }
      </a>
    } @else {
```

Replace the `<button>` branch's class binding (line 28) with the flag-free form:

```html
      <button [type]="type()" [class]="'btn ' + variant() + ' ' + size()"
```

Update the class:

```ts
export class ButtonComponent {
  variant = input<'primary' | 'ghost' | 'ghost-danger' | 'danger' | 'icon' | 'solid'>('primary');
  size = input<'md' | 'sm'>('md');
  type = input<'button' | 'submit'>('button');
  disabled = input(false);
  loading = input(false);
  /** Visual/aria-only guard — never the native `disabled` attribute. For a control whose row must
   *  stay in the a11y tree while its action is pending (see the CSS comment above); the real guard
   *  against a double-fire belongs in the click handler, not here. */
  ariaDisabled = input(false);
  label = input('');
  /** Set to render an <a> instead of a <button>. For real navigation only — an OAuth start, an
   *  external destination. Internal navigation is a text link with routerLink, not this. */
  href = input('');
  testId = input('');

  /** An anchor honours disabled/loading by losing its href, which is the only way to make one
   *  genuinely unactivatable. The <button> branch uses the native attribute instead. */
  protected readonly inert = computed(() => this.disabled() || this.loading());
}
```

Add `computed` to the Angular import on line 1:

```ts
import { Component, computed, input } from '@angular/core';
```

Update the CSS rule (currently `.btn.ghost.danger-border`) to the new variant, and make the anchor inherit ghost's own styling:

```css
    /* ghost-danger is a variant rather than a ghost + boolean pair: the flag was only ever valid
       on one variant, so four of ten variant x flag combinations emitted a class with no matching
       rule. A variant that renders nothing looks like a layout bug, not a component bug. */
    .btn.ghost-danger { background: transparent; color: var(--danger);
      border: 1px solid var(--danger); }
    .btn.ghost-danger:hover:not(:disabled) { background: var(--surface-2); }
    .btn.ghost-danger[aria-disabled="true"]:hover { background: transparent; }
```

Delete the old `.btn.ghost.danger-border` rule.

Finally, correct the stale count in the file's JSDoc (line 5): `32 call sites` becomes `100 call sites`.

- [ ] **Step 4: Update the three consumers**

`frontend/src/app/features/account/danger.page.ts:40`:

```html
      <bh-button variant="ghost-danger" size="sm" (click)="openDelete()" testId="delete-open">
```

`frontend/src/app/features/dev/dev-gallery.page.ts` — the ghost row's danger-bordered cell (lines 119-120) moves out of the ghost row into its own variant subsection, since it is no longer a ghost state:

```html
        <p class="gsub" i18n="@@dev.gallery.button.variant.ghostDanger">Ghost-danger</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost-danger" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost-danger" [disabled]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost-danger" [loading]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
        </div>
```

And its note (line 197) is rewritten, keeping the design-law meaning and dropping the deleted input:

```html
        <p class="note" i18n="@@dev.gallery.button.note.ghostDanger">
          Ghost-danger is its own variant, not a ghost plus a flag — the flag was only ever valid
          on one variant, so most variant/flag pairs emitted a class with no rule behind it and
          rendered nothing. For the control that OPENS a destructive flow (account danger zone's
          "Delete my account"), escalating against the filled variant="danger" control that
          EXECUTES it.
        </p>
```

`frontend/src/app/features/account/danger.page.spec.ts:88` — the comment currently reads `` `[dangerBorder]="true"`, a signal input bh-button's own template consumes. `` Reword to `` `variant="ghost-danger"`, a signal input bh-button's own template consumes. `` Do not change the assertion.

- [ ] **Step 5: Run the specs to verify they pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, 412 + 4 = 416 specs, 0 failures.

- [ ] **Step 6: Verify no `dangerBorder` reference survives, and the template type-checks**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn 'dangerBorder\|danger-border' frontend/src > /tmp/db.txt; echo "dangerBorder refs: $(wc -l < /tmp/db.txt)"; cat /tmp/db.txt
cd frontend && npx ng build --configuration production
```

Expected: `dangerBorder refs: 0`, and a successful production build. The build is the only gate that type-checks Angular templates — a surviving `[dangerBorder]` binding fails here.

- [ ] **Step 7: Negative control**

Name the mutation each new spec catches, and prove it:

```bash
# Remove the aria-busy binding from the anchor branch, run Karma, expect the
# "drops href, announces busy" spec to go red, then revert.
cd /Users/alessandrolomonaco/dev/boxhub
git diff --stat   # confirm clean starting point before mutating
```

Mutations to run one at a time, reverting after each:
1. Delete `[attr.aria-busy]="loading()"` from the anchor → "drops href, announces busy and shows the spinner while loading" must fail.
2. Change `[attr.href]="inert() ? null : href()"` back to `[href]="href()"` → both the loading and disabled link specs must fail on the href assertion.
3. Rename the CSS rule `.btn.ghost-danger` to `.btn.ghost-dangerX` → the ghost-danger spec still passes (it asserts the class, not the rule). **Record this**: the class-name spec does not prove a rule exists behind it. That is what the visual baseline in Task 6 covers, and saying so is the point — a control that surprises you gets written down rather than counted as a pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/ui/button.component.ts frontend/src/app/ui/button.component.spec.ts \
        frontend/src/app/features/account/danger.page.ts frontend/src/app/features/account/danger.page.spec.ts \
        frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "fix(bh-button): ghost-danger is a variant; the href branch honours disabled and loading

dangerBorder was a boolean valid on exactly one variant, so four of ten
variant x flag combinations emitted a class with no matching rule and
rendered nothing. Folding it into the variant union makes those states
unrepresentable — ng build now rejects at compile time what used to fail
silently at runtime. The component loses an input rather than gaining a check.

Separately, the anchor branch honoured none of disabled, loading, aria-busy
or aria-disabled: <bh-button href loading> rendered a clickable link with no
spinner. An anchor cannot be natively disabled, so it now withholds href,
which also drops it from the tab order.

Also corrects the JSDoc's stale '32 call sites' — there are 100."
```

---

## Task 3: The state ledger — infrastructure and its failing gate

The design law is binding and precise: *every component owes seven states, and the dev gallery IS that contract — each section renders every state, notes the ones only checkable by hand, and explicitly declares the ones the component cannot have. An omitted state is indistinguishable from a forgotten one.*

Today each section discharges this in freeform prose, in its own vocabulary. Some cover every state (`button`), some cover several (`data-table`: *"No focus, active, disabled or loading state of its own"*), some say only that the component has no state contract (`icon`). **You cannot tell at a glance whether all seven are accounted for**, which is exactly the failure mode the law names.

This task replaces prose with a uniform **state ledger** — a data structure per section, rendered identically everywhere — and writes the completeness gate **first**, so it fails for all 20 sections before any are filled in.

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`
- Create: `frontend/src/app/features/dev/dev-gallery.page.spec.ts`

**Interfaces:**
- Consumes: Task 2's `variant="ghost-danger"`.
- Produces, for Tasks 4–5 to populate:
  - `type Disposition = 'rendered' | 'hand' | 'na'`
  - `interface StateEntry { state: StateName; how: Disposition; why?: string }`
  - `type StateName = 'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error'`
  - `protected readonly ledgers: Record<string, StateEntry[]>` keyed by the section's `data-gallery` value
  - an `#ledger` `ng-template` invoked once per section as
    `<ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'icon' }" />`

- [ ] **Step 1: Write the failing gate spec**

Create `frontend/src/app/features/dev/dev-gallery.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DevGalleryPage, STATE_NAMES } from './dev-gallery.page';

/**
 * THE GATE THIS FILE EXISTS FOR. Design law: every component owes seven states, and this gallery
 * IS that contract — an omitted state is indistinguishable from a forgotten one. Prose notes
 * cannot enforce that, because nothing fails when one is missing. A ledger can: every section
 * must account for all seven states, as rendered, hand-checked, or explicitly not applicable.
 */
describe('DevGalleryPage state ledgers', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevGalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
    f = TestBed.createComponent(DevGalleryPage);
    f.detectChanges();
  });

  const sectionKeys = (): string[] =>
    Array.from(f.nativeElement.querySelectorAll('[data-gallery]'))
      .map((el: any) => el.getAttribute('data-gallery'));

  it('renders a ledger for every component section', () => {
    const missing = sectionKeys().filter(
      k => !f.nativeElement.querySelector(`[data-ledger="${k}"]`),
    );
    expect(missing).toEqual([]);
  });

  it('accounts for all seven states in every ledger', () => {
    const gaps: string[] = [];
    for (const key of sectionKeys()) {
      const ledger = f.nativeElement.querySelector(`[data-ledger="${key}"]`);
      const declared = ledger
        ? Array.from(ledger.querySelectorAll('[data-state]')).map((el: any) => el.getAttribute('data-state'))
        : [];
      for (const state of STATE_NAMES) {
        if (!declared.includes(state)) gaps.push(`${key}: ${state}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  // A state declared 'na' without a reason is an omission wearing a label. The reason is the
  // whole point: it is what distinguishes "this component cannot have an error state" from
  // "nobody got round to the error state".
  it('gives every not-applicable state a written reason', () => {
    const bare = Array.from(f.nativeElement.querySelectorAll('[data-how="na"]'))
      .filter((el: any) => !el.textContent.trim().includes('—'))
      .map((el: any) => el.getAttribute('data-state'));
    expect(bare).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL to compile — `STATE_NAMES` is not exported yet. That is the correct first failure.

- [ ] **Step 3: Add the ledger types and the shared template**

In `frontend/src/app/features/dev/dev-gallery.page.ts`, add to the imports on line 1:

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
```

Add `NgTemplateOutlet` to the component's `imports` array.

Above the `@Component` decorator, add the exported contract:

```ts
/** Design law §11.1's seven states, in the order every ledger lists them. */
export const STATE_NAMES = ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error'] as const;
export type StateName = (typeof STATE_NAMES)[number];

/**
 * How a section discharges its obligation for one state.
 * - `rendered` — a labelled cell on this page shows it
 * - `hand`     — real but not capturable statically (hover, focus, active); check it by hand
 * - `na`       — the component cannot have it, and `why` says why
 */
export type Disposition = 'rendered' | 'hand' | 'na';

export interface StateEntry {
  state: StateName;
  how: Disposition;
  /** Required when `how` is 'na'. Rendered after an em dash; the completeness spec asserts it. */
  why?: string;
}
```

Add the shared template as the first element inside the `<div class="gallery">`:

```html
      <ng-template #ledger let-key>
        <ul class="ledger" [attr.data-ledger]="key">
          @for (e of ledgers[key]; track e.state) {
            <li [attr.data-state]="e.state" [attr.data-how]="e.how" [class]="'lg lg-' + e.how">
              <span class="lg-state">{{ e.state }}</span>
              <span class="lg-how">{{ e.how }}</span>
              @if (e.why) { <span class="lg-why">— {{ e.why }}</span> }
            </li>
          }
        </ul>
      </ng-template>
```

The state names and disposition words are identifiers, not prose, and follow the precedent already set in this file for icon names and fabricated data — they are **not** i18n-marked. The `why` strings are prose and **are** marked, via `$localize` in the class (Tasks 4–5).

Add the styles beside the existing `.stlabel` rule:

```css
    /* The state ledger: a uniform, machine-checkable declaration of all seven states per
       component, replacing per-section freeform prose. dev-gallery.page.spec.ts asserts that
       every section accounts for every state, so an omission fails the build instead of looking
       identical to a deliberate "this component cannot have it". */
    .ledger { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
      gap: var(--sp-1); }
    .lg { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .lg-state { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--faint); min-width: 9ch; }
    .lg-how { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    .lg-na .lg-how { color: var(--faint); }
    .lg-why { max-width: 52ch; }
```

Add an empty ledger map to the class, so the spec compiles and fails on content rather than on types:

```ts
  protected readonly ledgers: Record<string, StateEntry[]> = {};
```

- [ ] **Step 4: Run the spec to verify it fails for the right reason**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL, and the failure message must name **all 20 sections** — `icon`, `button`, `field`, `select`, `panel`, `alert`, `empty`, `data-table`, `sheet`, `shell-header`, `dock`, `segmented`, `switch`, `search-bar`, `avatar`, `pill`, `day-pager`, `wordmark`, `auth-layout`, `benchmark-board`. If fewer than 20 are named, the section-key query is wrong; stop and report.

- [ ] **Step 5: Commit the failing gate**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/features/dev/dev-gallery.page.ts frontend/src/app/features/dev/dev-gallery.page.spec.ts
git commit -m "test(gallery): state-ledger contract and its completeness gate (red)

Design law makes the gallery the seven-states contract, but the contract was
discharged in per-section freeform prose, so nothing failed when a state went
undeclared — which is precisely the 'an omitted state is indistinguishable
from a forgotten one' failure the law names.

This adds the ledger structure and the spec that asserts every section
accounts for all seven states, with a written reason behind every
not-applicable. Committed RED, naming all 20 sections; Tasks 4 and 5 fill it in."
```

---

## Task 4: Declare the seven undeclared sections

The seven sections that render no labelled state cells at all. Each gets a ledger; the completeness gate should go from 20 sections failing to 13.

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`

**Interfaces:**
- Consumes: Task 3's `ledgers` map, `StateEntry`, and the `#ledger` template.
- Produces: ledger entries for `icon`, `data-table`, `shell-header`, `dock`, `day-pager`, `auth-layout`, `benchmark-board`.

- [ ] **Step 1: Add the seven ledgers to the class**

Replace the empty `ledgers` map with:

```ts
  protected readonly ledgers: Record<string, StateEntry[]> = {
    icon: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.hover:decorative and always aria-hidden — the control around it owns every interaction` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.focus:never focusable; it is never the interactive element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.active:never pressed directly` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.disabled:inherits currentColor, so the disabled host dims it` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.loading:renders a static path; it fetches nothing` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.error:an unknown name is a build-time type error, not a runtime state` },
    ],
    'data-table': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.focus:rows are not focusable; any focusable control inside a cell owns its own ring` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.active:rows are not pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.disabled:presentational — it renders whatever rows it is given` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.loading:the screen owns the fetch and renders bh-empty or a spinner in its place` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.error:the screen renders bh-alert beside it; a table does not own an error` },
    ],
    'shell-header': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'hand' },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.disabled:chrome is never disabled; it is present or it is not rendered` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.loading:renders synchronously from the already-resolved session` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.error:chrome has nothing to fail at; the routed screen renders its own error` },
    ],
    dock: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'rendered', why: undefined },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.disabled:a tab a role cannot reach is omitted, never shown disabled` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.loading:a static tab list; it fetches nothing` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.error:navigation chrome has nothing to fail at` },
    ],
    'day-pager': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'hand' },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.dayPager.loading:it emits a date; the screen beside it owns the fetch and its spinner` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.dayPager.error:a date cannot fail to be a date; the screen renders any fetch error` },
    ],
    'auth-layout': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.hover:a layout frame with no interactive surface of its own` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.focus:never focusable; the projected form owns focus` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.disabled:a frame is not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.loading:the projected screen renders its own pending state inside the panel` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.error:the projected screen renders bh-alert inside the panel` },
    ],
    'benchmark-board': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.hover:a read-only board; nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.focus:contains no focusable element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.active:nothing is pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.disabled:presentational — it renders the rows it is given` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.loading:the screen owns the fetch` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.error:the screen renders bh-alert beside it` },
    ],
  };
```

**Before writing any `na` reason, read the component.** These reasons are assertions about real behaviour, and a wrong one is worse than a missing one — it looks discharged. If a component's actual behaviour contradicts the reason drafted above, **stop and report to the orchestrator** rather than writing a reason you cannot support.

Remove the `why: undefined` on `dock`'s `active` entry — it is written above only to show the field is optional; a `rendered` entry needs no reason.

- [ ] **Step 2: Invoke the ledger from each of the seven sections**

Add this line immediately before each section's closing `</section>`, substituting the section's own `data-gallery` value:

```html
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'icon' }" />
```

Do this for `icon`, `data-table`, `shell-header`, `dock`, `day-pager`, `auth-layout`, `benchmark-board`.

Where a section's existing prose note now duplicates its ledger, delete the duplicated clause and keep only what the ledger does not carry. Example — `data-table`'s note currently reads *"Hover a row to check: background climbs to --surface. No focus, active, disabled or loading state of its own — data-label card mode ships deliberately unused, no screen has adopted it yet."* The first two sentences are now ledger entries; keep only:

```html
        <p class="note" i18n="@@dev.gallery.dataTable.note.cardMode">
          Data-label card mode ships deliberately unused — no screen has adopted it yet.
        </p>
```

- [ ] **Step 3: Run the gate and confirm it fails for exactly 13 sections**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: still FAIL, but the "renders a ledger for every component section" failure must now name exactly the 13 remaining sections — `button`, `field`, `select`, `panel`, `alert`, `empty`, `sheet`, `segmented`, `switch`, `search-bar`, `avatar`, `pill`, `wordmark`. The "not-applicable state" spec must pass for the seven done so far.

The count going 20 → 13 is the evidence this task worked; a different number means a ledger key does not match its `data-gallery` value.

- [ ] **Step 4: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(gallery): state ledgers for the seven undeclared sections

icon, data-table, shell-header, dock, day-pager, auth-layout and
benchmark-board rendered no labelled state at all, so 'this component cannot
have an error state' and 'someone forgot the error state' looked identical.

Each now declares all seven, with a written reason behind every
not-applicable. Completeness gate goes 20 sections failing to 13."
```

---

## Task 5: Declare the remaining thirteen sections

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`

**Interfaces:**
- Consumes: Task 4's `ledgers` map.
- Produces: a green completeness gate — all 20 sections account for all seven states.

- [ ] **Step 1: Read each of the thirteen components before writing its ledger**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend/src/app/ui
for c in button field select panel alert empty sheet segmented switch search-bar avatar pill wordmark; do
  echo "===== $c ====="; sed -n '1,60p' "$c.component.ts"
done
```

For each, answer the seven questions from the source, not from the gallery's existing prose: does it have a hover rule, a focus-visible rule, an `:active` rule, a disabled path, a loading path, an error path. A `rendered` claim must correspond to a labelled cell that actually exists in that section; a `hand` claim must correspond to a real CSS rule; an `na` claim must be true of the component.

- [ ] **Step 2: Add the thirteen ledgers**

Extend the `ledgers` map with one entry per section, in the same shape as Task 4. Two worked examples, to fix the standard:

```ts
    button: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'hand' },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'rendered' },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.button.error:a button does not own an error; the field or alert beside it renders it` },
    ],
    alert: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.hover:a message, not a control — nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.focus:not focusable; it is announced by role, not reached by tab` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.active:nothing is pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.disabled:a message is shown or it is not rendered` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.loading:renders synchronously from the text it is given` },
      { state: 'error', how: 'rendered', why: undefined },
    ],
```

`alert`'s `error` is `rendered`, not `na` — the danger tone **is** the error state, and it is already a labelled cell. Drop the `why: undefined`.

Where a component genuinely has a state the section does not currently render, prefer adding the labelled cell over declaring it `hand`. `hand` is for states that cannot be captured by setting an input — hover, focus, active — not for states nobody got round to.

- [ ] **Step 3: Invoke the ledger from each of the thirteen sections**

As in Task 4 Step 2, one `ng-container` before each closing `</section>`, with the section's own key.

- [ ] **Step 4: Delete prose that the ledgers now carry**

Re-read every `class="note"` paragraph. Keep the ones carrying information no ledger entry does — `button`'s `note.solid` (when to reach for the variant), `note.ariaDisabled` (why it differs from disabled), `note.ghostDanger`, `dock`'s breakpoint note, `auth-layout`'s framing note. Delete clauses that now merely restate a ledger row, and delete the localized message ids that go with them from any locale files that carry them.

`button`'s `note.hoverActiveFocus` is the one to keep in full despite overlapping the ledger: it names the *specific* rule for each variant (ghost/icon climb the surface ladder, primary/danger brighten by filter, the ring inverts on volt), which the ledger's one-word `hand` cannot express.

- [ ] **Step 5: Run the gate and confirm it passes**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS. All three ledger specs green; 20 sections × 7 states accounted for.

- [ ] **Step 6: Negative control**

```bash
# Delete one entry from one ledger and confirm the gate names exactly that gap.
```

1. Remove the `error` entry from `button`'s ledger → expect a failure naming `button: error`, and nothing else.
2. Change one `na` entry's `why` to an empty string → expect the "written reason" spec to name that state.
3. Add a new `<section class="gsec" data-gallery="temp">` with no ledger → expect a failure naming `temp`. **This is the mutation that matters most**: it proves a future component added to the gallery cannot skip the contract.

Revert after each.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(gallery): state ledgers for the remaining thirteen sections — gate green

All 20 sections now account for all seven states as rendered, hand-checked,
or explicitly not applicable with a written reason. The cross-section
consistency pass deferred from M13c is executed, and it is now enforced:
a section added without a ledger, or a ledger missing a state, fails Karma.

Prose notes that merely restated a ledger row are deleted; the ones carrying
per-variant specifics a one-word disposition cannot express are kept."
```

---

## Task 6: Gallery coverage for `size="sm"`, `href`, and `href` × `loading`

`size="sm"` has **52 call sites** and zero gallery presence. `href` has zero presence — including the combination Task 2 just fixed, which is the one that used to fail silently.

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`

**Interfaces:**
- Consumes: Task 2's fixed anchor branch; Task 5's green ledger gate.
- Produces: gallery cells whose visual baselines are generated in Task 9.

- [ ] **Step 1: Add a size subsection to the button section**

Place it after the `Ghost-danger` row, before the notes:

```html
        <p class="gsub" i18n="@@dev.gallery.button.size.heading">Size</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.md">md</span>
            <bh-button variant="primary" size="md" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.sm">sm</span>
            <bh-button variant="primary" size="sm" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.smGhost">sm ghost</span>
            <bh-button variant="ghost" size="sm" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.size">
          Both sizes keep the same min-height (--tap): sm narrows the horizontal padding only, so a
          small button is never a small tap target. 52 call sites use sm.
        </p>
```

- [ ] **Step 2: Add a link subsection**

```html
        <p class="gsub" i18n="@@dev.gallery.button.link.heading">As a link</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost" href="/app/dev/components" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost" href="/app/dev/components" [loading]="true" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost" href="/app/dev/components" [disabled]="true" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.link">
          With href set, bh-button renders a real anchor — routerLink or href on the host emits no
          href at all, losing ctrl/cmd-click and open-in-new-tab. An anchor cannot be natively
          disabled, so the loading and disabled cells withhold href entirely, which also drops them
          out of the tab order. Tab through this row to confirm only the first cell is reachable.
        </p>
```

The `href` points at the gallery's own route so the cells are inert to click during a visual run and no navigation is triggered.

- [ ] **Step 3: Run Karma and the production build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend
npm test -- --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: PASS and a successful build. The ledger gate must stay green — `button`'s ledger already declares all seven states and new cells do not change that.

- [ ] **Step 4: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(gallery): cover size=sm, the anchor form, and href x loading

size=sm has 52 call sites and had no gallery presence; href had none either,
including the href x loading combination Task 2 fixed — the one that used to
render a clickable link with no spinner.

The link row's loading and disabled cells withhold href, so tabbing the row
is itself the check: only the default cell is reachable."
```

---

## Task 7: Axe coverage for the open delete sheet

`a11y.spec.ts:167-174` scans `/app/account/danger` with the sheet **closed**, and its comment says the sheet's contents are excluded on purpose. So the product's single destructive flow is unscanned — an explanation paragraph, an export button with its own loading state, a conditional password field, a type-DELETE-to-confirm field, two conditional alerts, and a `variant="danger"` submit carrying both `disabled` and `loading` (`danger.page.ts:45-86`).

**Files:**
- Modify: `e2e/tests/a11y.spec.ts`

**Interfaces:**
- Consumes: the existing `SCREENS` array and its `{ name, path, widths, ready, needsLogin }` shape; the loop already awaits `screen.ready(page)` after `goto`, so no harness change is needed.
- Produces: two new e2e tests (`account-danger-delete-sheet` at mobile and desktop).

- [ ] **Step 1: Add a second `SCREENS` entry**

Immediately after the existing `account-danger` entry, add:

```ts
  {
    // The closed-state entry above stays: both states are real and neither substitutes for the
    // other. This one opens the sheet, which is where the product's only destructive flow lives —
    // an explanation, an export button with its own pending state, a conditional password field,
    // the type-DELETE confirm field, two conditional alerts and a filled danger submit. All of it
    // was unscanned because it does not exist in the DOM until openDelete() runs.
    name: 'account-danger-delete-sheet', path: '/app/account/danger',
    widths: [MOBILE, SCREEN_DESKTOP],
    ready: async page => {
      await page.locator('[data-testid="delete-open"]').click();
      await expect(page.locator('[data-testid="delete-confirm-text"]')).toBeVisible();
    },
    needsLogin: true,
  },
```

Also update the existing `account-danger` entry's comment, which currently says the sheet's contents "are not this task's scope" — they are now covered by the entry below it. Reword to say the closed state is scanned here and the open state in the entry that follows.

- [ ] **Step 2: Run the a11y suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose down -v && docker compose up -d --build
cd e2e && npx playwright test tests/a11y.spec.ts
```

Expected: the two new tests pass with zero WCAG 2.2 AA violations, alongside the existing ones.

If they **fail**, that is a real finding, not a broken test — the sheet has genuine a11y defects that were never scanned. Fix the sheet, not the scan, and report what was found to the orchestrator.

- [ ] **Step 3: Negative control**

Break the label on the confirm field and confirm the new scan goes red:

```bash
# In danger.page.ts, blank the confirm field's label:
#   <bh-field label="" i18n-label=... type="text" name="deleteConfirm" ... testId="delete-confirm-text" />
# Re-run tests/a11y.spec.ts, expect the two new tests to fail on a label violation, then revert.
```

**Known trap, check for it explicitly:** axe's `label` rule accepts a non-empty **placeholder** as a fallback, and most `bh-field` consumers carry one. If blanking the label does **not** turn the scan red, do not count the test as coverage — find a mutation axe genuinely catches (removing the `aria-modal`/`role` from the dialog, or the accessible name from the sheet), record which mutation worked and which did not, and report both.

- [ ] **Step 4: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add e2e/tests/a11y.spec.ts
git commit -m "test(a11y): scan the OPEN delete sheet, not just the closed danger page

The product's only destructive flow — explanation, export button, conditional
password field, type-DELETE confirm, two alerts and a filled danger submit —
existed in the DOM only after openDelete(), so axe had never seen any of it.

A second SCREENS entry opens the sheet before scanning. The closed-state entry
stays; neither substitutes for the other."
```

---

## Task 8: TV timer — timeboxed diagnostic

**Scope decision (user, 2026-08-20): diagnostic, timeboxed.** TV is Project 2, which Project 1 does not ship. Execute the backlog's stated next step and no more. Small fix ships. **If the fix is structural, that is a finding** — write it down, leave the `fixme`, and recommend whether it becomes its own milestone. Do not silently expand.

**The two backlog entries are one bug.** The "QUARANTINED" section (2026-08-06) and the "Open flake" section (2026-08-05) describe the same failure; the flake entry is the earlier record of what was later quarantined.

**Do not re-derive what is established.** Frames arrive and carry no timer (`data-frames` 0→1→2, `data-timer` `none` throughout) across three failures — that eliminates SSE transport, the 15s budget and the `/app` move. And one hypothesis was **checked and does not hold**: `TvStreamService.onChange` is a plain `@EventListener` running synchronously on the calling thread, so `compose()` joins the caller's transaction and should see the uncommitted write.

**Files:**
- Modify (temporarily): `backend/src/main/java/com/boxhub/display/TvStateService.java`
- Modify: `docs/BACKLOG.md`
- Modify (only if fixed): `e2e/tests/runner.spec.ts:52`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a written answer to the narrow question, and either a fix or a recommendation.

- [ ] **Step 1: Run the quarantined test as-is, BEFORE writing any diagnostic**

**The code path under test changed after the quarantine, and nobody has re-run the test since.** Established during planning on 2026-08-20:

- `ClassTimer.java:13` carries `@TenantId` on `box_id`, so `timers.findBySessionId(...)` is a tenant-filtered read.
- `TvStreamService.java:86` composes inside `TenantContext.runAsBox(c.boxId(), () -> state.compose(c.boxId()))`, and the comment above it at line 83 says exactly why: *"tenant BEFORE compose: without it compose()'s `@TenantId` reads have no ambient tenant"*.
- That `runAsBox` wrap landed in **`9b4917e`, 2026-08-19 (M21)**. The quarantine landed in **`0fd89a1`, 2026-08-06**. The fix is **thirteen days newer than the test that was disabled**.

The quarantine's own evidence was *"frames arrive and carry no timer"* — precisely the symptom a timer read with no ambient tenant produces. M21 both made tenant-less reads fail closed **and** established the tenant here.

So the first move is not a diagnostic. It is to find out whether the bug still exists:

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose down -v && docker compose up -d --build
# Temporarily change `test.fixme(` to `test(` at e2e/tests/runner.spec.ts:52
cd e2e
npx playwright test tests/runner.spec.ts          # fresh stack
npx playwright test tests/runner.spec.ts          # SECOND run, SAME stack — the reproducing condition
```

**If both runs pass:** the bug was fixed as a side effect of M21 and the `fixme` has been stale coverage since. Make the change permanent, skip Steps 2–5 entirely, and go to Step 6. Record in `docs/BACKLOG.md` that M21's `runAsBox` wrap is what fixed it, because a bug fixed by accident stays fixed only if someone writes down which line holds it up.

**If either run fails:** the tenancy explanation is wrong or incomplete. Continue to Step 2, and record that `runAsBox` is present and the failure survives it — which eliminates the leading hypothesis and is worth as much as a fix.

**Do not skip the second run.** A `down -v` stack passes and will not reproduce the failure; two runs against one stack is the condition that does.

- [ ] **Step 2: Add the diagnostic logging inside `compose()`**

Log, at the moment a frame is composed, specifically:
- the session id being composed for
- the raw result of `timers.findBySessionId(...)` — empty, or the row's status and id
- the composed frame's resulting timer field
- the current `TenantContext` value

Use the project's existing logger and log level conventions in that file. This logging is **temporary** and comes out before the milestone closes.

- [ ] **Step 3: Reproduce with the two-runs-one-stack recipe**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose down -v && docker compose up -d --build
cd e2e
# Remove the fixme temporarily so the test runs, then:
npx playwright test tests/runner.spec.ts    # first run against a fresh stack — expected to pass
npx playwright test tests/runner.spec.ts    # SECOND run against the SAME stack — this reproduces it
```

A `down -v` rebuilt stack passes and will **not** reproduce the failure. The second run against the same stack is the condition that does.

- [ ] **Step 4: Answer the narrow question, in writing**

At the moment a frame is composed, does `timers.findBySessionId(...)` return:
- **an empty result** — and if so, is there an ambient tenant at that moment?
- **a `PENDING` row** — the write happened but the status transition did not, or has not committed
- **a `RUNNING` row that is lost later in the mapping** — the lookup is fine and the DTO mapping drops it

- [ ] **Step 5: Re-check the `runAsBox` angle**

The backlog flags this as never verified either way: `runAsBox` swaps the security context before composing, and a **new** transaction opened there would see a different picture than the synchronous-listener reasoning assumes. Confirm from the logs whether `compose()` runs in the caller's transaction or a new one.

- [ ] **Step 6: Remove the diagnostic logging**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git checkout -- backend/src/main/java/com/boxhub/display/TvStateService.java
```

Unless a log line earns a permanent place — in which case keep exactly that one, at the right level, and say why.

- [ ] **Step 7: Confirm the backend baseline is untouched**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn clean test
```

Expected: **510 / 0 / 0**. `clean` is not optional — a stale `.class` produced four false failures during M22.

- [ ] **Step 8: Record the finding and decide**

**If fixed:** delete `test.fixme` at `runner.spec.ts:52` (make it a plain `test`). **Do not soften the assertions** — they are correct and the product is not. Re-run on a `down -v` stack *and* on an immediate second run against that same stack, which is the condition that reproduced it.

**If not fixed:** leave the `fixme` intact. Rewrite the backlog's QUARANTINED section with the answer to Step 4, delete the now-superseded "Open flake" section (it is the same bug), and state plainly whether this should become its own milestone.

Either way, both backlog entries stop being ownerless.

- [ ] **Step 9: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add docs/BACKLOG.md e2e/tests/runner.spec.ts
git commit -m "fix(tv): <what the diagnostic found>

<The answer to the narrow question: empty result, PENDING row, or a RUNNING
row lost in mapping — and whether an ambient tenant was present.>

Consolidates the two ownerless runner.spec backlog entries, which were one
bug: the 2026-08-05 'open flake' record and the 2026-08-06 quarantine."
```

---

## Task 9: Visual baselines, full gate run, and milestone close

**Files:**
- Create: `e2e/tests/visual.spec.ts-snapshots/*.png` (new baselines)
- Modify: `docs/BACKLOG.md`, `docs/HANDOFF.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/NEXT-SESSION.md`

**Interfaces:**
- Consumes: every prior task.
- Produces: a merge-ready branch and a rewritten session prompt.

- [ ] **Step 1: Regenerate the visual baselines**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
docker compose down -v && docker compose up -d --build
e2e/visual.sh --update-snapshots
```

Never Playwright locally — the comparison would be against baselines this renderer never wrote.

- [ ] **Step 2: Review every changed baseline by eye**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git status --short e2e/tests/visual.spec.ts-snapshots/
```

Expect changes to `button-*.png` (new ghost-danger, size and link rows) and to every section gaining a ledger. **Open each changed image.** New baselines are generated and reviewed, never accepted blind — an accepted-blind baseline turns a regression into the new truth.

Anything changing *outside* the gallery sections is unexpected: stop and report.

- [ ] **Step 3: Run every gate**

```bash
cd /Users/alessandrolomonaco/dev/boxhub

# Backend — must not have moved
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn clean test; cd ..

# Migration head — must still be V27, no new migration
ls backend/src/main/resources/db/migration/ | tail -3

# Frontend
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npx ng build --configuration production; cd ..

# e2e on a clean stack
docker compose down -v && docker compose up -d --build
cd e2e && npx playwright test; cd ..
e2e/visual.sh

# The eight §8.1 gates — rerun the Task 1 Step 5 script verbatim
```

Expected: backend 510/0/0; migration head V27; Karma green and above 412; e2e green; visual green with zero dirty baselines; all eight gates green.

- [ ] **Step 4: Record the real numbers**

Write down what each gate actually returned, not what was expected. If a number differs from the plan's expectation, say so and explain it rather than restating the expectation.

- [ ] **Step 5: Impeccable critique on the gallery**

Run `/impeccable critique` scoped to `/app/dev/components`. A code review does not discharge the design gate — M13c's own lesson, where fourteen clean reviews preceded three P1s visible only on live screens. Requires ≥28/40 with no open P0/P1.

- [ ] **Step 6: Update the docs**

- `docs/BACKLOG.md` — delete M13f's own section (consumed); resolve or rewrite both `runner.spec` entries per Task 8.
- `docs/HANDOFF.md` — an M13f entry stating what shipped, that two of four deferred claims did not survive re-verification, and the generalisable rule: **a deferred defect list is a hypothesis, not an inventory.**
- `docs/ROADMAP-AT-A-GLANCE.md` — mark M13f closed; M23 is next.
- `.superpowers/sdd/NEXT-SESSION.md` — rewrite for M23. It is the ONLY session prompt; do not create a second.

- [ ] **Step 7: Raise the `Launch → Production` block with the user**

Not an implementation step. Per the spec's §1.1: it is owned by **no milestone**, several items are hard launch blockers rather than polish (real SMTP plus SPF/DKIM/DMARC — the entire auth flow depends on mail arriving; backups and a restore drill; TLS/HSTS; ToS/privacy/DPA with EU PII and real money; error monitoring; rate limits never measured against a class-opening rush). **It must become its own scoped milestone before any box touches the product.** Present it and get a decision.

- [ ] **Step 8: Commit and merge**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
git add -A && git commit -m "docs(m13f): milestone close — gates green, ledger enforced, handoff rewritten"
git checkout main && git merge --no-ff m13f-consolidation
git push origin main
```

CI runs on `push: main` and `pull_request` only — pushing the branch would start nothing. Merge to `main`, then read the run there.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4.1 Repair the two red gates | 1 |
| §4.2 `bh-button` variant union + `href` branch | 2 |
| §4.3 Seven-states contract, all 20 sections | 3, 4, 5 |
| §4.3 `size="sm"`, `href`, `href` × `loading` coverage | 6 |
| §4.4 Delete sheet axe coverage | 7 |
| §4.5 TV timer timeboxed diagnostic | 8 |
| §5 Gates (backend 510/0/0, V27, visual, §8.1) | 1, 8, 9 |
| §7 Definition of done items 1–8 | 1, 2, 5, 6, 7, 8, 9 |

No gaps.

**One deliberate strengthening of the spec.** §4.3 described the consistency pass as a documentation exercise. Tasks 3–5 make it **machine-checkable** instead: `dev-gallery.page.spec.ts` fails when any section omits any state, or declares one not-applicable without a written reason. This is a strict improvement on the spec's own terms — the law says an omitted state is indistinguishable from a forgotten one, and prose cannot enforce that because nothing fails when a note goes missing. The spec should be amended to match before execution begins.

**Type consistency:** `StateName`, `Disposition`, `StateEntry`, `STATE_NAMES` and `ledgers` are defined once in Task 3 and used unchanged in Tasks 4 and 5. `variant="ghost-danger"` is defined in Task 2 and used in Tasks 2, 4 and 6. The ledger key always equals the section's `data-gallery` value; the spec in Task 3 asserts exactly that correspondence.

**Placeholder scan:** the only intentionally unwritten text is Task 8's commit message subject, which cannot be written before the diagnostic runs. Every other step carries the actual content.

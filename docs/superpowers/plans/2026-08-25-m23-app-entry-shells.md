# M23 — App Entry & Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the boxless and multi-box states a real home — a hub at `/gyms` that serves zero gyms
and five, a box switcher in the shell header, and an app entry that resolves `/` by state instead of
showing a login form to someone who is already logged in.

**Architecture:** One new shell (`bh-hub-shell`) outside the three box shells, guarded by
`sessionGuard` rather than `roleGuard`. It hosts two pages: the hub (`/gyms`) and the join surface
(`/gyms/join`). The box switcher is a *feature* component projected into a new brand slot on
`bh-shell-header`, so `app/ui/` gains a slot rather than a service dependency. `/` becomes a guard
that returns a `UrlTree`. The old box picker is deleted and `/auth/boxes` redirects to the hub.

**Tech Stack:** Angular 22 (standalone, signal inputs, `@if`/`@for` control flow), SCSS with CSS
custom properties, Karma/Jasmine, Playwright. No backend beyond the `@Profile("dev")` seeder.

**Spec:** `docs/superpowers/specs/2026-08-25-m23-app-entry-shells-design.md`
**Sketches:** `docs/superpowers/sketches/m23-app-entry-shells.html` — open these before Task 4.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec
and from `CLAUDE.md`.

- **Run every frontend gate as `env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless`.**
  In this session `NODE_OPTIONS` preloads a temp file that does not exist and every bare `npm`
  command dies with `MODULE_NOT_FOUND` before Karma starts. That looks like a broken project and is
  not. **Never run bare `npm test`** — it also hangs in watch mode.
- **Absolute paths in every command.** Bash cwd persists between tool calls and this has already
  cost two wrong results in this milestone.
- **Never pipe a gate for its exit status** — in zsh `$?` after a pipe is the pipe's. Redirect to a
  file, then check.
- **Tokens only.** No raw hex anywhere in `app/ui` or `app/features`; no `font-size: 11px|13px|15px|20px|40px`
  in `app/features`; no `font-size: <N>px` at all in `app/ui`. Use `--fs-*`, `--sp-*`, `--r-*`.
- **`frontend/src/app/ui/` stays clean:** signal inputs only — `input()`, `model()`, `output()`. No
  `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager`, no service injection.
- **i18n:** every user-facing string is marked, `$localize` with an explicit `@@id`. No unmarked
  English. No raw enum values on screen.
- **Dark only.** No `data-theme`, no `prefers-color-scheme`, no light palette.
- **Volt (`--volt`) means live / now / primary / winning.** In this milestone it marks *the gym you
  are in now* and the primary button. Never a card, panel, page background or sheet.
- **A disabled button guards ONE path, never the action.** The real guard goes in the handler. Never
  use the native `disabled` attribute on a control whose row must stay in the a11y tree — use
  `[attr.aria-disabled]`.
- **An attribute on a component host does not reach the element inside it.** A component needing a
  test hook or an aria attribute on its inner element takes an explicit input and binds it there.
- **Never put a backtick inside an HTML comment in an Angular template** — the template is a TS
  template literal and it fails with `TS1005`. Use straight quotes.
- **`AuthzConformanceTest` is never edited.** This milestone adds no route to Spring; if you believe
  it needs an edit, stop and return to the orchestrator.
- **Escalate, never guess.** Blocked, ambiguous, or plan-conflicts-with-reality goes back to the
  orchestrator. Two M16a executors refused to commit around a red test and both were right.

**Verification commands, verbatim:**

```bash
# Karma
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless

# The only gate that type-checks Angular templates
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production

# Backend
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test
```

**Karma baseline on this branch: 419 / 419 passing.** It is a floor, not a ceiling.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `frontend/src/app/core/auth/labels.ts` | Role and box-status → marked, human strings. Pure functions, no deps beyond `auth.models`. |
| `frontend/src/app/core/auth/labels.spec.ts` | Its tests. |
| `frontend/src/app/core/auth/entry.guard.ts` | What `/` means. Returns a `UrlTree`, always. |
| `frontend/src/app/core/auth/entry.guard.spec.ts` | Its tests. |
| `frontend/src/app/features/gyms/hub-shell.page.ts` | The boxless/hub shell: wordmark header, dock, outlet. |
| `frontend/src/app/features/gyms/hub-shell.page.spec.ts` | Its tests. |
| `frontend/src/app/features/gyms/gyms.page.ts` | The hub — your gyms, or the empty state. |
| `frontend/src/app/features/gyms/gyms.page.spec.ts` | Its tests. |
| `frontend/src/app/features/gyms/join.page.ts` | How to get into a gym. |
| `frontend/src/app/features/gyms/join.page.spec.ts` | Its tests. |
| `frontend/src/app/features/gyms/box-switcher.component.ts` | The switcher control + its sheet. Feature component — injects `AuthService` and `Router`. |
| `frontend/src/app/features/gyms/box-switcher.component.spec.ts` | Its tests. |
| `e2e/tests/gyms.spec.ts` | The end-to-end proof: boxless lands on the hub, switching works. |

**Modify:**

| Path | Change |
|---|---|
| `frontend/src/app/ui/icon.component.ts` | Add `user` to `ICON_NAMES` and a `@case`. |
| `frontend/src/app/ui/shell-header.component.ts` | `boxName` becomes optional; add `customBrand` input and a `[brand]` projection slot. |
| `frontend/src/app/ui/shell-header.component.spec.ts` | Cover both brand branches. |
| `frontend/src/app/features/dev/dev-gallery.page.ts` | Shell-header section renders the custom-brand state; ledger accounts for it. |
| `frontend/src/app/app.routes.ts` | `/gyms` + children, `/auth/boxes` redirect, `entryGuard` on `''` and `**`. |
| `frontend/src/app/core/auth/role.guard.ts` | Boxless + session → `/gyms`, not `/auth/login`. |
| `frontend/src/app/core/auth/role.guard.spec.ts` | Cover the new branch. |
| `frontend/src/app/features/account/account-layout.page.ts` | `done()` with no active box → `/gyms`. |
| `frontend/src/app/features/auth/login.page.ts` | `/auth/boxes` → `/gyms`. |
| `frontend/src/app/features/auth/reset.page.ts` | `/auth/boxes` → `/gyms`. |
| `frontend/src/app/features/auth/verify.page.ts` | `/auth/boxes` → `/gyms`. |
| `frontend/src/app/features/auth/{login,reset,verify}.page.spec.ts` | Assert `/gyms`. |
| `frontend/src/app/features/{athlete/athlete-shell,coach/coach-shell,admin/admin-shell}.page.ts` | Project the switcher. |
| `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java` | Second box, `multi@demo.io`, `nobox@demo.io`. |
| `e2e/tests/a11y.spec.ts` | Picker scan → hub scan. |
| `e2e/tests/visual.spec.ts` | Picker baselines → hub baselines. |

**Delete:**

| Path | Why |
|---|---|
| `frontend/src/app/features/auth/box-picker.page.ts` | Replaced by the hub. |
| `frontend/src/app/features/auth/box-picker.page.spec.ts` | With it. |
| `e2e/tests/visual.spec.ts-snapshots/box-picker-phone.png` | Baseline for a deleted screen. |
| `e2e/tests/visual.spec.ts-snapshots/box-picker-desktop.png` | Same. |

---

## Task 1: Role and status labels

The enum must never reach a screen. Today `box-picker.page.ts` renders `{{ m.role }}`, so a box
admin's row literally reads `BOX_ADMIN` — an unmarked English string on a user-facing surface. Both
the hub and the switcher need this, so it is one module, not two copies.

**Files:**
- Create: `frontend/src/app/core/auth/labels.ts`
- Test: `frontend/src/app/core/auth/labels.spec.ts`

**Interfaces:**
- Consumes: `Role` from `frontend/src/app/core/auth/auth.models.ts`.
- Produces:
  - `roleLabel(role: Role): string`
  - `boxStatusLabel(status: string, role: Role): string | null` — `null` means "reachable, show no chip"
  - `isReachable(status: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/core/auth/labels.spec.ts`:

```ts
import { roleLabel, boxStatusLabel, isReachable } from './labels';

describe('labels', () => {
  it('never renders a raw enum value for a role', () => {
    expect(roleLabel('BOX_ADMIN')).toBe('Admin');
    expect(roleLabel('COACH')).toBe('Coach');
    expect(roleLabel('ATHLETE')).toBe('Athlete');
  });

  it('shows no status chip for an ACTIVE gym', () => {
    expect(boxStatusLabel('ACTIVE', 'ATHLETE')).toBeNull();
    expect(boxStatusLabel('ACTIVE', 'BOX_ADMIN')).toBeNull();
  });

  // The decision this file exists for: the label keys off the ROLE held at that gym,
  // not the status alone. An admin owns the problem; a member cannot act on it.
  it('tells an admin their own gym is in review, and tells a member nothing specific', () => {
    expect(boxStatusLabel('PENDING', 'BOX_ADMIN')).toBe('In review');
    expect(boxStatusLabel('PENDING', 'COACH')).toBe('Unavailable');
    expect(boxStatusLabel('PENDING', 'ATHLETE')).toBe('Unavailable');
  });

  it('never leaks SUSPENDED or REJECTED to anyone, admin included', () => {
    for (const role of ['ATHLETE', 'COACH', 'BOX_ADMIN'] as const) {
      expect(boxStatusLabel('SUSPENDED', role)).toBe('Unavailable');
      expect(boxStatusLabel('REJECTED', role)).toBe('Unavailable');
    }
  });

  it('treats only ACTIVE as reachable, so an unknown status fails closed', () => {
    expect(isReachable('ACTIVE')).toBe(true);
    expect(isReachable('PENDING')).toBe(false);
    expect(isReachable('SUSPENDED')).toBe(false);
    expect(isReachable('WHATEVER_SHIPS_NEXT')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `Cannot find module './labels'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/core/auth/labels.ts`:

```ts
import { Role } from './auth.models';

/**
 * The enum never reaches a screen. box-picker.page.ts rendered `{{ m.role }}` raw, so a box
 * admin's row read BOX_ADMIN — untranslatable, and an unmarked user-facing English string
 * against the standing i18n rule. One module, because the hub and the switcher both need it.
 */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'BOX_ADMIN': return $localize`:@@role.boxAdmin:Admin`;
    case 'COACH': return $localize`:@@role.coach:Coach`;
    case 'ATHLETE': return $localize`:@@role.athlete:Athlete`;
  }
}

/**
 * What a person is told about a gym they cannot open. The label keys off the ROLE they hold at
 * THAT gym, not the status alone (spec §4):
 *
 *   - an admin of a gym awaiting platform approval is the one person who can act on it, so they
 *     are told;
 *   - everyone else is told only that it is unavailable. A member cannot act on "suspended", and
 *     it is a fact about the owner's account rather than theirs.
 *
 * Returns null for a reachable gym — the caller renders no chip at all rather than an "OK" one.
 */
export function boxStatusLabel(status: string, role: Role): string | null {
  if (isReachable(status)) return null;
  if (status === 'PENDING' && role === 'BOX_ADMIN') return $localize`:@@boxStatus.inReview:In review`;
  return $localize`:@@boxStatus.unavailable:Unavailable`;
}

/**
 * Deliberately an allowlist, not a denylist of the three bad values. A status this build has
 * never heard of is not openable — POST /api/auth/box-token would 403 it anyway, and failing
 * closed here means the row is marked rather than tapped.
 */
export function isReachable(status: string): boolean {
  return status === 'ACTIVE';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, total ≥ 424.

- [ ] **Step 5: Run the negative control**

Change `isReachable` to `return status !== 'SUSPENDED';`. Re-run. Expected: the
`WHATEVER_SHIPS_NEXT` and `PENDING` assertions go RED. **Revert the change.**

This is not a formality. One M16a mutation was a false negative that only running the control
revealed. If a test here does not go red, say so instead of counting it as coverage.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add frontend/src/app/core/auth/labels.ts frontend/src/app/core/auth/labels.spec.ts && git commit -m "feat(m23): marked role and box-status labels

The enum never reaches a screen. Status copy keys off the role held at
that gym: an admin of a PENDING gym is told 'In review' because they can
act on it; everyone else is told only 'Unavailable'.

isReachable is an allowlist, so an unknown status fails closed."
```

---

## Task 2: Dev seeder fixtures

**The two headline e2e tests have no fixtures.** `DevDataSeeder` seeds exactly one box and every
seeded user holds exactly one membership — which is why `a11y.spec.ts` already carries the comment
that `login()` auto-selects for `admin@demo.io`. `super@demo.io` is boxless but is a *superadmin*,
so it exercises `superadminGuard` instead. Without new fixtures the milestone's premise cannot be
proved end to end.

`DevDataSeeder` is `@Profile("dev")` — test data, not production. No route, no DTO, no migration.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`

**Interfaces:**
- Consumes: the existing private helper `seed(Box box, String email, String name, String role)`,
  which registers the user, sets `emailVerified`, and creates one `Membership`.
- Produces, for Task 10's e2e specs:
  - `nobox@demo.io` / `boxhub-demo-2026` — verified, **zero** memberships
  - `multi@demo.io` / `boxhub-demo-2026` — `ATHLETE` at `demo`, `BOX_ADMIN` at `northside`
  - a second box, `slug = "northside"`, name `Northside Barbell`, status ACTIVE

- [ ] **Step 1: Read the surrounding code before editing**

```bash
sed -n '90,135p' /Users/alessandrolomonaco/dev/boxhub/backend/src/main/java/com/boxhub/shared/DevDataSeeder.java
sed -n '176,190p' /Users/alessandrolomonaco/dev/boxhub/backend/src/main/java/com/boxhub/shared/DevDataSeeder.java
```

Note the idempotence guard at the top of the block:
`if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;`
Everything you add goes **after** that guard, so it runs exactly once. `Box.status` already
defaults to `"ACTIVE"`, so the second box needs no status call.

- [ ] **Step 2: Add the second box and the two users**

In `DevDataSeeder.java`, immediately after the line
`User athlete8 = seed(demo, "athlete8@demo.io", "Ana Costa", "ATHLETE");`, insert:

```java
        // M23 fixtures. The app has three account shapes and only one of them was seeded:
        // every demo user held exactly one membership, so login() auto-selected and no test
        // could reach the hub, and no test could switch gyms. These two close that.
        Box northside = new Box();
        northside.setName("Northside Barbell");
        northside.setSlug("northside");
        northside.setTimezone("Europe/Rome");
        boxes.save(northside);

        // Holds TWO gyms with DIFFERENT roles, which is the case M21 made real and the case a
        // switcher has to get right: switching must land on the target gym's role home, not the
        // one you came from.
        User multi = seed(demo, "multi@demo.io", "Multi Box", "ATHLETE");
        Membership northsideAdmin = new Membership();
        northsideAdmin.setUser(multi);
        northsideAdmin.setBox(northside);
        northsideAdmin.setRole("BOX_ADMIN");
        memberships.save(northsideAdmin);

        // Registered, verified, and belonging to NO gym — the state every account starts in,
        // and the one that had no shell at all before M23.
        User nobox = authService.register("nobox@demo.io", "boxhub-demo-2026", "No Box");
        nobox.setEmailVerified(true);
        userRepo.save(nobox);
```

- [ ] **Step 3: Confirm nothing depended on there being one box**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "findAll().size()\|toHaveCount(1)\|boxes.length" e2e/tests backend/src/test > /tmp/m23-boxcount.txt; echo "hits=$(wc -l < /tmp/m23-boxcount.txt)"
```

Expected: `hits=0`. `onboarding.spec.ts`'s approval-queue assertion is scoped by
`hasText: BOX_NAME` to the box that spec creates, so a second seeded box cannot perturb it.

**If this returns anything, STOP and return to the orchestrator** — a count assertion means the
fixture change has a dependent the plan did not name.

- [ ] **Step 4: Run the backend suite as a regression check**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test
```

Expected: PASS, unchanged count. The seeder is `@Profile("dev")` and does not run under test.

- [ ] **Step 5: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add backend/src/main/java/com/boxhub/shared/DevDataSeeder.java && git commit -m "test(m23): seed a second box, a multi-box user and a boxless user

The seeder had exactly one box and gave every user exactly one
membership, so login() auto-selected and nothing could reach the box
picker, let alone a hub. multi@demo.io holds two gyms with DIFFERENT
roles; nobox@demo.io holds none.

@Profile(\"dev\") — test data, no route, no DTO, no migration."
```

---

## Task 3: The `user` icon and the shell-header brand slot

`bh-shell-header` renders a volt initial-mark plus a box name. The hub has no box, and the box
shells need a *switcher* there. Both are the same need: let the host supply the brand block.

The switcher itself injects `AuthService` and `Router`, and `app/ui/` stays presentational — so the
header gains a **slot and an explicit boolean**, never a service. No content-query cleverness: an
input is greppable and a `contentChild` is not.

**Files:**
- Modify: `frontend/src/app/ui/icon.component.ts`
- Modify: `frontend/src/app/ui/shell-header.component.ts`
- Modify: `frontend/src/app/ui/shell-header.component.spec.ts`
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`

**Interfaces:**
- Produces, for Tasks 4 and 9:
  - `<bh-shell-header [customBrand]="true"><span brand>…</span></bh-shell-header>` renders the
    projected brand and **no** default brand block.
  - `<bh-shell-header boxName="X">` is unchanged in every respect.
  - `IconName` gains `'user'`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/app/ui/shell-header.component.spec.ts` (keep every existing test):

```ts
import { Component } from '@angular/core';
import { ShellHeaderComponent } from './shell-header.component';

@Component({
  standalone: true,
  imports: [ShellHeaderComponent],
  template: `
    <bh-shell-header [customBrand]="true">
      <span brand data-testid="projected-brand">MY OWN BRAND</span>
    </bh-shell-header>`,
})
class CustomBrandHost {}

describe('ShellHeaderComponent custom brand', () => {
  it('renders the projected brand and suppresses the default block', async () => {
    await TestBed.configureTestingModule({ imports: [CustomBrandHost] }).compileComponents();
    const f = TestBed.createComponent(CustomBrandHost);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;

    expect(el.querySelector('[data-testid="projected-brand"]')).not.toBeNull();
    // The volt mark is the default block's. Rendering BOTH would put two brands in one bar and
    // spend the chrome's volt budget twice.
    expect(el.querySelector('.mark')).toBeNull();
  });

  it('still renders the default brand when customBrand is not set', async () => {
    await TestBed.configureTestingModule({ imports: [ShellHeaderComponent] }).compileComponents();
    const f = TestBed.createComponent(ShellHeaderComponent);
    f.componentRef.setInput('boxName', 'Demo Box');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;

    expect(el.querySelector('.mark')?.textContent?.trim()).toBe('D');
    expect(el.querySelector('.bn')?.textContent?.trim()).toBe('Demo Box');
  });
});
```

Add to `frontend/src/app/ui/icon.component.spec.ts` (or create the describe if the file has none):

```ts
it('renders the user icon, which the hub dock needs for its Account tab', async () => {
  await TestBed.configureTestingModule({ imports: [IconComponent] }).compileComponents();
  const f = TestBed.createComponent(IconComponent);
  f.componentRef.setInput('name', 'user');
  f.detectChanges();
  expect(f.nativeElement.querySelectorAll('svg path, svg circle').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `customBrand` is not a known input, and `'user'` is not assignable to `IconName`.

- [ ] **Step 3: Add the `user` icon**

In `frontend/src/app/ui/icon.component.ts`, add `'user'` to the `ICON_NAMES` array (put it beside
`'users'`), and add this `@case` beside the others in the template. Geometry is lucide's
`user.svg`, copied verbatim:

```html
        @case ('user') {
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        }
```

- [ ] **Step 4: Add the brand slot**

In `frontend/src/app/ui/shell-header.component.ts`, replace the `.brand` div in the template with:

```html
      @if (customBrand()) {
        <ng-content select="[brand]" />
      } @else {
        <div class="brand">
          <span class="mark" aria-hidden="true">{{ initial() }}</span>
          <span class="bn">{{ boxName() }}</span>
        </div>
      }
```

Change the two inputs on the class:

```ts
  /** Empty when the host projects its own brand — see customBrand. */
  boxName = input('');
  /**
   * The host supplies the brand block itself, projected into [brand], and the default mark +
   * name is not rendered. Two consumers need this and they are the same need: the hub has no
   * box to name, and the three box shells put the SWITCHER there. An explicit input rather than
   * a contentChild query, because a boolean is greppable and a content query is not — and
   * because app/ui/ stays presentational, so the switcher (which injects AuthService and Router)
   * cannot live in here.
   */
  customBrand = input(false);
```

**Note:** `boxName` was `input.required<string>()`. Dropping the requirement is safe — all four
consumers (`athlete-shell`, `coach-shell`, `admin-shell`, `dev-gallery`) pass it today and keep
working unchanged.

- [ ] **Step 5: Add the gallery state and its ledger entry**

`dev-gallery.page.spec.ts` asserts an **exhaustive** list of 20 `data-gallery` sections. Do **not**
add a section — `bh-box-switcher` is a feature component and does not belong in the gallery, and
adding a 21st entry would fail that assertion. Instead, extend the existing `shell-header` section.

In `frontend/src/app/features/dev/dev-gallery.page.ts`, inside
`<section class="gsec" id="shell-header" data-gallery="shell-header">`, after the existing
`<bh-shell-header boxName="Demo Box" area="Coach">` block, add a second example:

```html
          <bh-shell-header [customBrand]="true" area="Admin">
            <!-- The host's own brand block. In the product this slot holds the box switcher,
                 which injects AuthService and therefore cannot live in app/ui/. -->
            <button brand class="demo-brandbtn" type="button">
              <span class="demo-brandmark" aria-hidden="true">C</span>
              <span i18n="@@dev.gallery.shellHeader.customBrand">CrossFit Oslo</span>
            </button>
          </bh-shell-header>
```

Add to that section's `[data-ledger="shell-header"]` a `[data-state]` row for any state the new
example changes, and give every `data-how="na"` entry a written reason containing an em dash — the
spec rejects a bare `na`. Read the existing ledger rows in the same file first and match their shape
exactly.

Add the two styles the example needs to the gallery's own `styles` block, tokens only:

```scss
    .demo-brandbtn { display: flex; align-items: center; gap: 10px; background: none;
      border: 1px solid transparent; border-radius: var(--r-ctl); padding: 3px var(--sp-2) 3px 3px;
      min-height: var(--tap); cursor: pointer; font: inherit; color: var(--bone); }
    .demo-brandmark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center; font-family: var(--font-display);
      font-weight: 800; font-size: var(--fs-body); }
```

- [ ] **Step 6: Run tests and the production build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

Expected: both PASS. The build is the only gate that type-checks Angular templates — `tsc` does not.

- [ ] **Step 7: Run the §8.1 gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/g3.txt; echo "ui px font-size: $(wc -c < /tmp/g3.txt) bytes"
grep -rn '@Input()\|@Output()' frontend/src/app/ui > /tmp/g6.txt; echo "ui decorators: $(wc -c < /tmp/g6.txt) bytes"
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts > /tmp/g8.txt; echo "raw hex: $(wc -c < /tmp/g8.txt) bytes"
```

Expected: `0 bytes` on all three.

- [ ] **Step 8: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add frontend/src/app/ui frontend/src/app/features/dev && git commit -m "feat(m23): shell-header brand slot, and a user icon

The hub has no box to name and the box shells need the switcher in that
spot. Both are the same need, so the header gains a [brand] slot and an
explicit customBrand boolean.

An input rather than a contentChild query: a boolean is greppable. The
switcher injects AuthService and Router, so it stays out of app/ui/,
which is presentational and stays that way."
```

---

## Task 4: The hub shell and its routes

The container. Header nav at ≥720px, floating dock below — matching the athlete and coach shells
exactly, because M27a wraps this and a fourth layout idiom would be a fourth thing to port.

**Open the sketches before writing this** — `docs/superpowers/sketches/m23-app-entry-shells.html`,
plates 01 and 02.

**Files:**
- Create: `frontend/src/app/features/gyms/hub-shell.page.ts`
- Create: `frontend/src/app/features/gyms/hub-shell.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `ShellHeaderComponent` with `customBrand` (Task 3), `DockComponent`/`DockTab`,
  `WordmarkComponent` (no inputs), `IconName` including `'user'` (Task 3).
- Produces: routes `/gyms` (child `''` → the hub) and `/gyms/join`, both under
  `HubShellPage` guarded by `sessionGuard`. Tasks 5 and 6 fill the children.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/gyms/hub-shell.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HubShellPage } from './hub-shell.page';

describe('HubShellPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubShellPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the rxed wordmark, not a box name — there is no box here', () => {
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('bh-wordmark')).not.toBeNull();
    // The volt initial-mark belongs to a BOX. Rendering one here would mean the accent
    // marks something that does not exist.
    expect(el.querySelector('.mark')).toBeNull();
  });

  it('offers exactly three destinations, and Join is a real one', () => {
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    const links = (f.componentInstance as HubShellPage).tabs.map(t => t.link);
    expect(links).toEqual(['/gyms', '/gyms/join', '/account']);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `Cannot find module './hub-shell.page'`.

- [ ] **Step 3: Write the shell**

Create `frontend/src/app/features/gyms/hub-shell.page.ts`:

```ts
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { WordmarkComponent } from '../../ui/wordmark.component';

/**
 * The shell for a person who is not inside a gym — because they have none, or because they
 * stepped up out of one. It is the app's front door, and before M23 it did not exist: every
 * shell assumed a box and roleGuard sent a boxless session to a login form.
 *
 * Same idiom as the athlete and coach shells on purpose — header nav at 720px and up, floating
 * dock below. M27a wraps this natively, and a fourth layout idiom would be a fourth thing to port.
 *
 * The Account tab leaves the shell for the existing /account area, which already works from a
 * boxless session (it is guarded by sessionGuard, deliberately). That area is a place you step
 * into and leave, which is what its own Done control is for.
 */
@Component({
  selector: 'bh-hub-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    ShellHeaderComponent, DockComponent, WordmarkComponent,
  ],
  template: `
    <div class="app">
      <bh-shell-header [customBrand]="true">
        <a brand class="brandlink" routerLink="/gyms" aria-label="rxed home"
           i18n-aria-label="@@hub.brand.label"><bh-wordmark /></a>
        <nav nav class="hnav" aria-label="Your account" i18n-aria-label="@@hub.nav.label">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active"
               [routerLinkActiveOptions]="{ exact: t.link === '/gyms' }"
               ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
      </bh-shell-header>

      <main class="content"><router-outlet /></main>

      <bh-dock [tabs]="tabs" label="Your account" i18n-label="@@hub.dock.label" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
    .brandlink { display: inline-flex; align-items: center; min-height: var(--tap);
      text-decoration: none; color: var(--bone); }
    .brandlink:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .hnav { display: flex; gap: var(--sp-1); flex: 1; justify-content: center; }
    .hitem { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--sp-4);
      border-radius: var(--r-full); color: var(--bone-dim); font-weight: 600;
      font-size: var(--fs-sm); text-decoration: none; }
    .hitem.active { background: var(--surface-2); color: var(--bone); }
    .hitem:hover:not(.active) { color: var(--bone); }
    .hitem:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .content { flex: 1; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(88px + env(safe-area-inset-bottom)); }
    }
  `],
})
export class HubShellPage {
  /* Absolute links, not relative: the Account tab leaves this shell entirely, and mixing
     relative and absolute in one dock is how a tab silently resolves against the wrong parent. */
  tabs: DockTab[] = [
    { link: '/gyms', label: $localize`:@@hub.tab.gyms:Gyms`, icon: 'house' },
    { link: '/gyms/join', label: $localize`:@@hub.tab.join:Join`, icon: 'plus' },
    { link: '/account', label: $localize`:@@hub.tab.account:Account`, icon: 'user' },
  ];
}
```

- [ ] **Step 4: Register the routes**

In `frontend/src/app/app.routes.ts`, add this block immediately **before** the `athlete` route
object, and add `sessionGuard` to the existing import if it is not already there (it is — the
`account` route uses it):

```ts
  {
    path: 'gyms', canActivate: [sessionGuard],
    loadComponent: () => import('./features/gyms/hub-shell.page').then(m => m.HubShellPage),
    children: [
      { path: '', pathMatch: 'full', title: $localize`:@@route.gyms.hub:Your gyms`,
        loadComponent: () => import('./features/gyms/gyms.page').then(m => m.GymsPage) },
      { path: 'join', title: $localize`:@@route.gyms.join:Join a gym`,
        loadComponent: () => import('./features/gyms/join.page').then(m => m.JoinGymPage) },
    ],
  },
```

Then replace the `auth/boxes` route with a redirect. **Keep the path** — it is in users' browser
history and in three pages' navigation until Task 8 retargets them:

```ts
  // The picker's old address. Kept as a redirect, not deleted: it is in users' history.
  { path: 'auth/boxes', redirectTo: '/gyms', pathMatch: 'full' },
```

**Do not delete `box-picker.page.ts` yet** — Task 8 owns that, together with its specs.

- [ ] **Step 5: Run tests and build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

Expected: Karma PASS. **The build will FAIL** until Tasks 5 and 6 create `gyms.page.ts` and
`join.page.ts`, because the route's `loadComponent` imports them.

**This is expected and it is the only place in this plan where a step ends red.** If you are running
tasks in order, proceed to Task 5 and commit Tasks 4–6 together at the end of Task 6. If you must
commit here, create the two files as empty standalone components first and let Tasks 5 and 6 fill
them — **do not** comment out the routes.

- [ ] **Step 6: Commit (with Tasks 5 and 6 — see above)**

---

## Task 5: The hub page

**Files:**
- Create: `frontend/src/app/features/gyms/gyms.page.ts`
- Create: `frontend/src/app/features/gyms/gyms.page.spec.ts`

**Interfaces:**
- Consumes: `AuthService.memberships()`, `AuthService.activeBox()`, `AuthService.selectBox(boxId)`;
  `roleLabel`, `boxStatusLabel`, `isReachable` (Task 1); `redirectForRole`, `MembershipDto`.
- Produces: `GymsPage`, the default child of `/gyms`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/gyms/gyms.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GymsPage } from './gyms.page';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto } from '../../core/auth/auth.models';

function m(over: Partial<MembershipDto> = {}): MembershipDto {
  return { boxId: 'b1', boxName: 'CrossFit Oslo', boxSlug: 'cfo', role: 'ATHLETE', boxStatus: 'ACTIVE', ...over };
}

function setup(memberships: MembershipDto[], activeBoxId: string | null = null) {
  const auth = {
    memberships: signal(memberships),
    activeBox: signal(activeBoxId ? { boxId: activeBoxId, boxName: 'x', role: 'ATHLETE' as const } : null),
    selectBox: jasmine.createSpy('selectBox').and.returnValue(of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [GymsPage],
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const f = TestBed.createComponent(GymsPage);
  f.detectChanges();
  return { f, auth, el: f.nativeElement as HTMLElement };
}

describe('GymsPage', () => {
  it('shows the empty state and a way forward when you belong to no gym', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-testid="gyms-empty"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid^="gym-"]').length).toBe(0);
    // The premise of the milestone: a boxless person must be offered a next step, not a wall.
    expect(el.querySelector('[data-testid="gyms-empty-cta"]')).not.toBeNull();
  });

  it('lists a gym with a human role label, never the enum', () => {
    const { el } = setup([m({ role: 'BOX_ADMIN' })]);
    const row = el.querySelector('[data-testid="gym-cfo"]')!;
    expect(row.textContent).toContain('Admin');
    expect(row.textContent).not.toContain('BOX_ADMIN');
  });

  it('marks the gym you are currently in', () => {
    const { el } = setup([m({ boxId: 'b1', boxSlug: 'cfo' }), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside' })], 'b1');
    expect(el.querySelector('[data-testid="gym-cfo"] .mark')).not.toBeNull();
    expect(el.querySelector('[data-testid="gym-nb"] .mark')).toBeNull();
  });

  it('marks an unreachable gym before it is tapped, and does not call selectBox', () => {
    const { el, auth } = setup([m({ boxStatus: 'SUSPENDED' })]);
    const row = el.querySelector<HTMLElement>('[data-testid="gym-cfo"]')!;
    expect(row.textContent).toContain('Unavailable');
    row.click();
    // Today the picker lets you tap a dead gym and surfaces the 403 afterwards. The status is
    // already on the wire from /api/me, so the row is marked instead.
    expect(auth.selectBox).not.toHaveBeenCalled();
  });

  it('enters a gym and lands on the role home for THAT gym, not the one you came from', () => {
    const { el, auth } = setup([m({ boxId: 'b2', boxSlug: 'nb', role: 'BOX_ADMIN' })], 'b1');
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    el.querySelector<HTMLElement>('[data-testid="gym-nb"]')!.click();
    expect(auth.selectBox).toHaveBeenCalledWith('b2');
    expect(nav).toHaveBeenCalledWith('/admin');
  });

  it('surfaces an error if the token mint rejects the gym after all', () => {
    const { f, el, auth } = setup([m()]);
    auth.selectBox.and.returnValue(throwError(() => new Error('403')));
    el.querySelector<HTMLElement>('[data-testid="gym-cfo"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="gyms-error"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `Cannot find module './gyms.page'`.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/features/gyms/gyms.page.ts`:

```ts
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto, redirectForRole } from '../../core/auth/auth.models';
import { roleLabel, boxStatusLabel, isReachable } from '../../core/auth/labels';
import { AlertComponent } from '../../ui/alert.component';

/**
 * The hub. One screen for zero gyms and for five — they are the same question asked of
 * different data, and splitting them is how the old box picker and a boxless empty state
 * would have drifted apart.
 *
 * Everything here comes from /api/me, which a boxless session may already read: Membership is
 * deliberately NOT a @TenantId entity. If you ever add a field to this screen, check the entity
 * first — since M21 a tenant-less read of a @TenantId table returns EMPTY rather than erroring,
 * and a test written under actAsBox stays green over it (docs/TENANCY.md §8.3).
 */
@Component({
  selector: 'bh-gyms',
  standalone: true,
  imports: [AlertComponent, RouterLink],
  template: `
    <h1 class="t-display title" i18n="@@gyms.heading">Your gyms</h1>

    @if (error()) {
      <bh-alert tone="danger" data-testid="gyms-error">{{ error() }}</bh-alert>
    }

    @if (auth.memberships().length === 0) {
      <div class="empty" data-testid="gyms-empty">
        <h2 class="t-h2 eh" i18n="@@gyms.empty.heading">No gyms yet</h2>
        <p class="ep" i18n="@@gyms.empty.body">
          Your gym sends you an invite link. Accept it and the gym shows up here.
        </p>
        <a class="cta" routerLink="/gyms/join" data-testid="gyms-empty-cta"
           i18n="@@gyms.empty.cta">How to join</a>
      </div>
    } @else {
      <div class="gyms">
        @for (m of auth.memberships(); track m.boxId) {
          @if (isReachable(m.boxStatus)) {
            <button class="gym" (click)="enter(m)"
                    [attr.aria-busy]="entering() === m.boxId"
                    [attr.aria-disabled]="entering() !== null ? 'true' : null"
                    [attr.data-testid]="'gym-' + m.boxSlug">
              <span class="mk" [class.mark]="isCurrent(m)" aria-hidden="true">{{ initial(m) }}</span>
              <span class="meta">
                <span class="gname">{{ m.boxName }}</span>
                <span class="grole">{{ label(m) }}</span>
              </span>
              @if (isCurrent(m)) {
                <span class="chip now" i18n="@@gyms.current">Current</span>
              } @else if (entering() === m.boxId) {
                <span class="chip now" i18n="@@gyms.opening">Opening…</span>
              } @else {
                <span class="go" aria-hidden="true">&rsaquo;</span>
              }
            </button>
          } @else {
            <!-- Not a button. An unreachable gym is not an action that fails; it is not an
                 action. A disabled button would still take focus order for nothing. -->
            <div class="gym off" [attr.data-testid]="'gym-' + m.boxSlug">
              <span class="mk muted" aria-hidden="true">{{ initial(m) }}</span>
              <span class="meta">
                <span class="gname">{{ m.boxName }}</span>
                <span class="grole">{{ label(m) }}</span>
              </span>
              <span class="chip off-chip">{{ statusLabel(m) }}</span>
            </div>
          }
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .title { font-size: var(--fs-display); margin: 0 0 var(--sp-5); text-transform: uppercase;
      letter-spacing: -0.02em; }
    .gyms { display: flex; flex-direction: column; gap: var(--sp-2); max-width: 640px; }
    .gym { display: flex; align-items: center; gap: var(--sp-3); width: 100%; text-align: left;
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: var(--sp-3) var(--sp-4); cursor: pointer; font: inherit; color: inherit;
      transition: border-color .15s; }
    .gym:hover:not([aria-disabled]) { border-color: var(--bone-dim); }
    .gym[aria-disabled] { opacity: .6; cursor: not-allowed; }
    .gym:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .gym.off { background: var(--surface); cursor: default; }

    /* The gym you are in NOW carries the accent — the same volt mark bh-shell-header already
       uses for the same meaning. Every other gym gets the identical shape with no accent, so
       volt keeps meaning "now" instead of becoming a decorative avatar. */
    .mk { width: 30px; height: 30px; border-radius: var(--r-ctl); flex-shrink: 0;
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-body); background: var(--surface); color: var(--bone-dim);
      border: 1px solid var(--hairline); }
    .mk.mark { background: var(--volt); color: var(--on-volt); border-color: var(--volt); }
    .mk.muted { color: var(--disabled); }

    .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    /* min-width:0 + overflow-wrap: a long unbreakable gym name pushed the whole PAGE into
       horizontal scroll at 200% text on the old picker. Measured there; do not drop either. */
    .gname { min-width: 0; overflow-wrap: anywhere; font-family: var(--font-display);
      font-weight: 800; text-transform: uppercase; font-size: var(--fs-h2);
      letter-spacing: -0.01em; color: var(--bone); line-height: 1.15; }
    .gym.off .gname { color: var(--faint); }
    /* --bone-dim, not --faint: this sits on --surface-2, where --faint measures 4.27:1 and
       fails AA. The token's documented 5.1:1 is against --ground, and nothing here is. */
    .grole { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      color: var(--bone-dim); text-transform: uppercase; }
    .gym.off .grole { color: var(--disabled); }
    .go { color: var(--faint); font-size: var(--fs-h2); flex-shrink: 0; }

    .chip { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; padding: 3px var(--sp-2); border-radius: var(--r-full);
      border: 1px solid var(--hairline); color: var(--faint); flex-shrink: 0; white-space: nowrap; }

    .empty { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column;
      align-items: flex-start; gap: var(--sp-3); max-width: 480px; }
    .eh { margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
    .ep { margin: 0; color: var(--bone-dim); font-size: var(--fs-sm); }
    .cta { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-5);
      border-radius: var(--r-ctl); background: var(--volt); color: var(--on-volt);
      font-weight: 700; text-decoration: none; }
    /* The ring INVERTS on a volt surface — a volt ring on a volt button is invisible. */
    .cta:focus-visible { outline: 2px solid var(--focus-inv); outline-offset: 2px; }
  `],
})
export class GymsPage {
  auth = inject(AuthService);
  private router = inject(Router);

  error = signal('');
  /** boxId in flight, or null. Per-row: a single global spinner leaves the user unable to tell
   *  which gym they picked, which scored a defect on the old picker. */
  entering = signal<string | null>(null);

  protected readonly isReachable = isReachable;

  initial(m: MembershipDto): string { return (m.boxName || '').trim().charAt(0).toUpperCase(); }
  label(m: MembershipDto): string { return roleLabel(m.role); }
  statusLabel(m: MembershipDto): string { return boxStatusLabel(m.boxStatus, m.role) ?? ''; }
  isCurrent(m: MembershipDto): boolean { return this.auth.activeBox()?.boxId === m.boxId; }

  enter(m: MembershipDto): void {
    // The guard is HERE, not on a [disabled] attribute: a native disabled drops the pressed
    // control out of the a11y tree and sends focus to <body>.
    if (this.entering()) return;
    if (!isReachable(m.boxStatus)) return;
    this.error.set('');
    this.entering.set(m.boxId);
    this.auth.selectBox(m.boxId).subscribe({
      next: () => {
        this.entering.set(null);
        // The role in the TARGET gym. Roles differ per gym — that is what M21 made real — so
        // "the same page in the new gym" is frequently a page this person cannot enter.
        this.router.navigateByUrl(redirectForRole(m.role));
      },
      // Status can change between page load and tap, so the mint can still 403 (M9). The row
      // being marked is the fast path, not the only guard.
      error: () => {
        this.entering.set(null);
        this.error.set($localize`:@@gyms.error.unavailable:This gym is unavailable — contact your gym for help.`);
      },
    });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS.

- [ ] **Step 5: Run the negative control**

Delete the `if (!isReachable(m.boxStatus)) return;` line from `enter()`. Re-run. The
"does not call selectBox" test must go RED. **Revert.**

Then change `redirectForRole(m.role)` to `redirectForRole(this.auth.activeBox()!.role)`. The
"lands on the role home for THAT gym" test must go RED. **Revert.**

If either stays green, stop and tell the orchestrator — the test is decoration.

- [ ] **Step 6: Proceed to Task 6 (commit together)**

---

## Task 6: The join page

The middle dock tab, occupied by something that already works. Invites are links; there is no
code-redemption endpoint, so **do not add a code field** — that would be inventing a mechanism the
backend does not have.

**Files:**
- Create: `frontend/src/app/features/gyms/join.page.ts`
- Create: `frontend/src/app/features/gyms/join.page.spec.ts`

**Interfaces:**
- Consumes: nothing beyond Angular. Static content by design.
- Produces: `JoinGymPage`, the `/gyms/join` route's component.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/gyms/join.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { JoinGymPage } from './join.page';

describe('JoinGymPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [JoinGymPage] }).compileComponents();
  });

  it('explains how an invite arrives', () => {
    const f = TestBed.createComponent(JoinGymPage);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="join-explainer"]')).not.toBeNull();
  });

  // Guards the deviation recorded in the spec: invites are LINKS. There is no code-redemption
  // endpoint, so a code field would promise something the backend cannot do.
  it('offers no code or link entry field, because no endpoint accepts one', () => {
    const f = TestBed.createComponent(JoinGymPage);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('input, bh-field').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/features/gyms/join.page.ts`:

```ts
import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * How a person gets into a gym. Static today, and that is the point: the invite path already
 * works, so this tab is a real destination rather than a placeholder.
 *
 * M24 adds the directory ABOVE this content and leaves the invite path underneath — a gym's
 * link keeps working whether or not the gym chooses to be listed. Shaped that way deliberately
 * so M24 adds a section rather than re-shaping a screen.
 *
 * No code entry field. Invites are links; nothing on the backend redeems a typed code.
 */
@Component({
  selector: 'bh-join-gym',
  standalone: true,
  template: `
    <h1 class="t-display title" i18n="@@join.heading">Join a gym</h1>

    <div class="panel" data-testid="join-explainer">
      <h2 class="t-h2 eh" i18n="@@join.ask.heading">Ask your gym for a link</h2>
      <p class="p" i18n="@@join.ask.body">
        Gyms on rxed invite their members by email. The link in that email adds you straight
        away — there is no code to type.
      </p>
      <p class="p quiet" i18n="@@join.ask.mismatch">
        Clicked a link and nothing happened? It may have been sent to a different email address
        than the one you signed up with.
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .title { font-size: var(--fs-display); margin: 0 0 var(--sp-5); text-transform: uppercase;
      letter-spacing: -0.02em; }
    .panel { border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); padding: var(--sp-6) var(--sp-5);
      display: flex; flex-direction: column; gap: var(--sp-3); max-width: 480px; }
    .eh { margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
    .p { margin: 0; color: var(--bone-dim); font-size: var(--fs-sm); }
    .quiet { color: var(--faint); }
  `],
})
export class JoinGymPage {}
```

- [ ] **Step 4: Run tests, the build, and the token gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
cd /Users/alessandrolomonaco/dev/boxhub && grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features > /tmp/g4.txt; echo "features px: $(wc -c < /tmp/g4.txt) bytes"
cd /Users/alessandrolomonaco/dev/boxhub && grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts > /tmp/g8.txt; echo "raw hex: $(wc -c < /tmp/g8.txt) bytes"
```

Expected: Karma PASS, **build PASS** (both route children now exist), both greps `0 bytes`.

- [ ] **Step 5: Commit Tasks 4, 5 and 6**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add frontend/src/app/features/gyms frontend/src/app/app.routes.ts && git commit -m "feat(m23): the hub shell, the hub, and the join surface

/gyms serves zero gyms and five — the same question asked of different
data. Guarded by sessionGuard, not roleGuard: requiring an active box is
the defect being fixed.

The gym you are in carries the volt mark, reusing bh-shell-header's
existing vocabulary rather than inventing a second one. An unreachable
gym is marked from /api/me's boxStatus instead of being tapped and
403'd, and it renders as a div: it is not an action that fails, it is
not an action.

Entering lands on the role home for the TARGET gym. Roles differ per
gym, so 'the same page over there' is often a page you cannot enter.

/auth/boxes becomes a redirect. The picker itself dies in the next
commit, with its specs."
```

---

## Task 7: The entry guard

What `/` means. Runs as a guard because a component-lifecycle `navigateByUrl` starts a *second*
navigation which, on a cold bootstrap, races the still-in-flight initial one and silently loses —
the bug `account-index.page.ts` records in its own comment.

**Files:**
- Create: `frontend/src/app/core/auth/entry.guard.ts`
- Create: `frontend/src/app/core/auth/entry.guard.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthService.hasSession()`, `AuthService.activeBox()`, `redirectForRole`.
- Produces: `entryGuard: CanActivateFn`, always returning a `UrlTree`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/core/auth/entry.guard.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { entryGuard } from './entry.guard';
import { AuthService } from './auth.service';

function run(session: boolean, box: { boxId: string; boxName: string; role: 'ATHLETE' | 'COACH' | 'BOX_ADMIN' } | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { hasSession: () => session, activeBox: signal(box) } },
    ],
  });
  return TestBed.runInInjectionContext(() => entryGuard(null as any, null as any)) as UrlTree;
}

describe('entryGuard', () => {
  it('sends an anonymous visitor to the login form', () => {
    expect(run(false, null).toString()).toBe('/auth/login');
  });

  // The defect this guard exists to kill: / redirected to auth/login unconditionally, so a
  // person who was already logged in was shown a login form.
  it('never shows a login form to someone who is already logged in', () => {
    expect(run(true, null).toString()).not.toContain('/auth/login');
  });

  it('resumes the gym you were last in, by the role you hold there', () => {
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'BOX_ADMIN' }).toString()).toBe('/admin');
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'COACH' }).toString()).toBe('/coach');
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'ATHLETE' }).toString()).toBe('/athlete');
  });

  it('falls back to the hub when no gym is active — including for a boxless account', () => {
    expect(run(true, null).toString()).toBe('/gyms');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the guard**

Create `frontend/src/app/core/auth/entry.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { redirectForRole } from './auth.models';

/**
 * What "/" means. Before M23 it was `redirectTo: 'auth/login'` unconditionally, so the bare
 * domain showed a login form to someone who was already signed in — and superadminGuard sent
 * a signed-in non-superadmin through the same door.
 *
 * A GUARD, not a component lifecycle hook. account-index.page.ts records why, from a bug that
 * already cost a debugging session: a lifecycle navigateByUrl starts a SECOND navigation, which
 * on a cold bootstrap races the still-in-flight initial one and silently loses — the URL stays
 * put and an empty template renders. A CanActivate returning a UrlTree redirects inside the
 * router's own resolution of the FIRST navigation, so there is no second navigation to race.
 *
 * Always returns a UrlTree: "/" has no screen of its own.
 */
export const entryGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.hasSession()) return router.parseUrl('/auth/login');
  const box = auth.activeBox();
  return router.parseUrl(box ? redirectForRole(box.role) : '/gyms');
};
```

- [ ] **Step 4: Wire it into the routes**

In `frontend/src/app/app.routes.ts`, add the import:

```ts
import { entryGuard } from './core/auth/entry.guard';
```

Replace the last two route entries:

```ts
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
```

with:

```ts
  // `children: []` because the guard always returns a UrlTree — these paths have no screen.
  { path: '', pathMatch: 'full', canActivate: [entryGuard], children: [] },
  { path: '**', canActivate: [entryGuard], children: [] },
```

- [ ] **Step 5: Run tests and build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

Expected: both PASS. **`app.routes.spec.ts` needs no change** — measured 2026-08-25, its only
redirect assertion is `expect(old?.redirectTo).toBe('/account')` for the legacy
`/account/security` path. It asserts nothing about `''` or `'**'`. If it goes red anyway, stop and
return to the orchestrator rather than editing it: that would mean this measurement is stale.

- [ ] **Step 6: Run the negative control**

Change the guard's last line to `return router.parseUrl('/auth/login');`. The "never shows a login
form" and "falls back to the hub" tests must both go RED. **Revert.**

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add frontend/src/app/core/auth/entry.guard.ts frontend/src/app/core/auth/entry.guard.spec.ts frontend/src/app/app.routes.ts && git commit -m "feat(m23): / resolves by state instead of always showing a login form

Resumes the gym you were last in, by the role you hold THERE; falls back
to the hub when no gym is active, boxless accounts included.

A guard, not a lifecycle hook: a lifecycle navigateByUrl starts a second
navigation that races the initial one on a cold bootstrap and silently
loses. account-index.page.ts records that bug; this follows its fix."
```

---

## Task 8: The dead-end sweep, and deleting the picker

Three files send a valid session to a login form and three pages navigate to a screen that is about
to stop existing. They are one task because they are one defect, and fixing one and not the others
leaves the bug.

**Files:**
- Modify: `frontend/src/app/core/auth/role.guard.ts` and `role.guard.spec.ts`
- Modify: `frontend/src/app/features/account/account-layout.page.ts`
- Modify: `frontend/src/app/features/auth/login.page.ts` (line 140)
- Modify: `frontend/src/app/features/auth/reset.page.ts` (line 141)
- Modify: `frontend/src/app/features/auth/verify.page.ts` (line 159)
- Modify: `frontend/src/app/features/auth/login.page.spec.ts` (line 203)
- Modify: `frontend/src/app/features/auth/reset.page.spec.ts` (lines 183, 196)
- Modify: `frontend/src/app/features/auth/verify.page.spec.ts` (line 128)
- Delete: `frontend/src/app/features/auth/box-picker.page.ts` and `box-picker.page.spec.ts`

**Interfaces:**
- Consumes: `entryGuard`'s destination convention — a session with no box goes to `/gyms`.
- Produces: nothing new. This task removes behaviour.

- [ ] **Step 1: Confirm the dependent list is still exactly this**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "box-picker\|auth/boxes\|BoxPickerPage" frontend/src e2e --include='*.ts' > /tmp/m23-deps.txt; cat /tmp/m23-deps.txt
```

**If a file appears that this task does not name, STOP and return to the orchestrator.** The
milestone has already been surprised once here: `reset.page.ts` and `verify.page.ts` were invisible
until this grep was run.

- [ ] **Step 2: Update `role.guard.ts`**

```ts
export function roleGuard(allowed: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const box = auth.activeBox();
    // A session with no active box is not anonymous. Sending it to /auth/login showed a login
    // form to someone already logged in, and it was the whole reason a boxless account had no
    // shell at all — which is the state EVERY account starts in, since register() creates a
    // User and never a Membership.
    if (!box) return router.parseUrl(auth.hasSession() ? '/gyms' : '/auth/login');
    return allowed.includes(box.role) ? true : router.parseUrl(redirectForRole(box.role));
  };
}
```

- [ ] **Step 3: Add the guard's test**

Append to `frontend/src/app/core/auth/role.guard.spec.ts`, matching the file's existing harness
shape (read it first — do not invent a second style):

```ts
  it('sends a signed-in member with no active gym to the hub, not to a login form', () => {
    // ... arrange AuthService with hasSession() === true and activeBox() === null
    expect(result.toString()).toBe('/gyms');
  });

  it('still sends an anonymous visitor to the login form', () => {
    // ... arrange AuthService with hasSession() === false and activeBox() === null
    expect(result.toString()).toBe('/auth/login');
  });
```

- [ ] **Step 4: Retarget the four navigation sites**

In `frontend/src/app/features/account/account-layout.page.ts`, in `done()`:

```ts
    const box = this.auth.activeBox();
    this.router.navigateByUrl(box ? redirectForRole(box.role) : '/gyms');
```

In `login.page.ts:140`, `reset.page.ts:141` and `verify.page.ts:159`, change
`this.router.navigateByUrl('/auth/boxes');` to `this.router.navigateByUrl('/gyms');`.

- [ ] **Step 5: Update the four spec files**

Change every `'/auth/boxes'` assertion to `'/gyms'` in `login.page.spec.ts`,
`reset.page.spec.ts` (two sites) and `verify.page.spec.ts`. Rename any test title that says
"boxes" so the name still describes the behaviour.

- [ ] **Step 6: Delete the picker**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git rm frontend/src/app/features/auth/box-picker.page.ts frontend/src/app/features/auth/box-picker.page.spec.ts
```

- [ ] **Step 7: Verify no reference survives**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "box-picker\|BoxPickerPage" frontend/src --include='*.ts' > /tmp/m23-picker.txt; echo "frontend refs: $(wc -c < /tmp/m23-picker.txt) bytes"
```

Expected: `0 bytes`. The `auth-layout.component.ts:55` and `check-email.page.ts:114` **comments**
mention box-picker as historical context — if the grep shows only those two, that is still a
failure of this gate as written: reword those two comments to name the hub instead, so the grep
comes back clean. A gate you have to explain away stops being a gate.

e2e references are Task 10's.

- [ ] **Step 8: Run tests and build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

Expected: both PASS. Karma total drops by the picker spec's count and rises by the new guard tests
— **report the exact number**, do not assume it nets out.

- [ ] **Step 9: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A frontend/src && git commit -m "fix(m23): a session with no gym stops being sent to a login form

Three places did it — roleGuard, the account area's Done control, and
the / redirect — so fixing one left the bug. This closes all three and
retargets login, reset and verify, which all navigated to the picker.
reset and verify only surfaced from a dependents grep.

Deletes box-picker.page.ts: the hub replaces it, and two screens listing
your gyms would have drifted apart on the first change to either."
```

---

## Task 9: The box switcher

**Files:**
- Create: `frontend/src/app/features/gyms/box-switcher.component.ts`
- Create: `frontend/src/app/features/gyms/box-switcher.component.spec.ts`
- Modify: `frontend/src/app/features/athlete/athlete-shell.page.ts`
- Modify: `frontend/src/app/features/coach/coach-shell.page.ts`
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts`

**Interfaces:**
- Consumes: `ShellHeaderComponent`'s `[brand]` slot and `customBrand` input (Task 3);
  `SheetComponent` (`open` input, `closed` output — **the caller must reset its own signal on
  `closed`**, the component never clears `open` itself); `roleLabel`, `isReachable` (Task 1).
- Produces: `<bh-box-switcher brand />` — projectable into `bh-shell-header`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/gyms/box-switcher.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { BoxSwitcherComponent } from './box-switcher.component';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto } from '../../core/auth/auth.models';

function m(over: Partial<MembershipDto> = {}): MembershipDto {
  return { boxId: 'b1', boxName: 'CrossFit Oslo', boxSlug: 'cfo', role: 'ATHLETE', boxStatus: 'ACTIVE', ...over };
}

function setup(memberships: MembershipDto[], activeBoxId = 'b1') {
  const auth = {
    memberships: signal(memberships),
    activeBox: signal({ boxId: activeBoxId, boxName: 'CrossFit Oslo', role: 'ATHLETE' as const }),
    selectBox: jasmine.createSpy('selectBox').and.returnValue(of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [BoxSwitcherComponent],
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const f = TestBed.createComponent(BoxSwitcherComponent);
  f.detectChanges();
  return { f, auth, el: f.nativeElement as HTMLElement };
}

describe('BoxSwitcherComponent', () => {
  it('names the active gym on the control', () => {
    const { el } = setup([m()]);
    expect(el.querySelector('[data-testid="box-switcher"]')!.textContent).toContain('CrossFit Oslo');
  });

  // Otherwise a single-gym member can never reach /gyms/join to add a second, and moving city
  // is a real thing.
  it('renders even with a single gym, because All gyms is the only route to Join', () => {
    const { f, el } = setup([m()]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="switcher-all-gyms"]')).not.toBeNull();
  });

  it('lists the other gyms with the role held at each, never the enum', () => {
    const { f, el } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside', role: 'BOX_ADMIN' })]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    const row = el.querySelector('[data-testid="switch-to-nb"]')!;
    expect(row.textContent).toContain('Admin');
    expect(row.textContent).not.toContain('BOX_ADMIN');
  });

  it('switches and lands on the role home for the TARGET gym', () => {
    const { f, el, auth } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside', role: 'BOX_ADMIN' })]);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="switch-to-nb"]')!.click();
    expect(auth.selectBox).toHaveBeenCalledWith('b2');
    expect(nav).toHaveBeenCalledWith('/admin');
  });

  it('does not offer a gym you cannot open', () => {
    const { f, el } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxStatus: 'SUSPENDED' })]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="switch-to-nb"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/app/features/gyms/box-switcher.component.ts`. Model the sheet markup on
`athlete-shell.page.ts`'s profile sheet usage, and **reset `open` yourself on `(closed)`** —
`bh-sheet` never clears its own input, and a caller that forgets leaves the signal stuck `true`.

```ts
import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto, redirectForRole } from '../../core/auth/auth.models';
import { roleLabel, isReachable } from '../../core/auth/labels';
import { SheetComponent } from '../../ui/sheet.component';

/**
 * The box name in the shell header, turned into the control that moves you between gyms.
 *
 * A FEATURE component, not a ui/ one: it injects AuthService and Router, and app/ui/ stays
 * presentational. It is projected into bh-shell-header's [brand] slot, which exists for exactly
 * this. It also owns its own button, so its data-testid and aria attributes land on the real
 * element — an attribute on a component HOST does not reach the element inside it, which cost
 * M13c four fixes and blocked the form-control migration entirely.
 *
 * It renders even when the person holds one gym: All gyms is their only route to /gyms/join.
 *
 * Multi-tab staleness needs nothing here. M21 shipped it: the interceptor asserts X-Box-Id on
 * /api/box/** and re-mints once on a 409 STALE_BOX.
 */
@Component({
  selector: 'bh-box-switcher',
  standalone: true,
  imports: [SheetComponent, RouterLink],
  template: `
    <button type="button" class="switcher" (click)="open.set(true)"
            data-testid="box-switcher"
            [attr.aria-label]="switchLabel()" aria-haspopup="dialog">
      <span class="mark" aria-hidden="true">{{ initial() }}</span>
      <span class="bn">{{ activeName() }}</span>
      <span class="chev" aria-hidden="true">&#9662;</span>
    </button>

    <bh-sheet [open]="open()" title="Switch gym" i18n-title="@@switcher.title"
              label="Switch gym" i18n-label="@@switcher.label" (closed)="open.set(false)">
      @if (open()) {
        <div class="rows">
          @for (m of others(); track m.boxId) {
            <button type="button" class="row" (click)="switchTo(m)"
                    [attr.data-testid]="'switch-to-' + m.boxSlug">
              <span class="rmark" aria-hidden="true">{{ letter(m) }}</span>
              <span class="meta">
                <span class="rname">{{ m.boxName }}</span>
                <span class="rrole">{{ label(m) }}</span>
              </span>
              <span class="go" aria-hidden="true">&rsaquo;</span>
            </button>
          }
        </div>
        <a class="allgyms" routerLink="/gyms" (click)="open.set(false)"
           data-testid="switcher-all-gyms">
          <span i18n="@@switcher.allGyms">All gyms</span>
          <span class="go" aria-hidden="true">&rsaquo;</span>
        </a>
      }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .switcher { display: flex; align-items: center; gap: 10px; min-width: 0;
      background: none; border: 1px solid transparent; border-radius: var(--r-ctl);
      padding: 3px var(--sp-2) 3px 3px; margin-left: -3px; min-height: var(--tap);
      cursor: pointer; font: inherit; color: inherit; }
    .switcher:hover { border-color: var(--hairline); background: var(--surface); }
    .switcher:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* The one volt element in the chrome, unchanged in meaning: it marks the gym you are in NOW.
       The chevron is not volt — a second accent here would make the accent decorative. */
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center; flex-shrink: 0;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body); }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .chev { color: var(--faint); font-size: var(--fs-meta); flex-shrink: 0; }

    .rows { display: flex; flex-direction: column; gap: var(--sp-2); }
    .row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; text-align: left;
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: var(--sp-3); cursor: pointer; font: inherit; color: inherit; }
    .row:hover { border-color: var(--bone-dim); }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .rmark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--surface);
      color: var(--bone-dim); border: 1px solid var(--hairline); display: grid; place-items: center;
      flex-shrink: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body); }
    .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .rname { font-family: var(--font-display); font-weight: 800; text-transform: uppercase;
      font-size: var(--fs-body); color: var(--bone); overflow-wrap: anywhere; }
    .rrole { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--bone-dim); }
    .go { color: var(--faint); flex-shrink: 0; }

    .allgyms { display: flex; align-items: center; justify-content: space-between;
      min-height: var(--tap); margin-top: var(--sp-3); padding: 0 var(--sp-2);
      border-top: 1px solid var(--hairline); color: var(--bone); text-decoration: none; }
    .allgyms:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `],
})
export class BoxSwitcherComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  open = signal(false);
  private switching = signal(false);

  activeName = computed(() => this.auth.activeBox()?.boxName ?? '');
  initial = computed(() => this.activeName().trim().charAt(0).toUpperCase());
  switchLabel = computed(() =>
    $localize`:@@switcher.control.label:Switch gym — currently ${this.activeName()}:gym:`);

  /** Every OTHER gym you can actually open. An unreachable gym is not offered at all: the mint
   *  would 403 it, and a row that only ever fails is worse than no row. */
  others = computed(() => {
    const activeId = this.auth.activeBox()?.boxId;
    return this.auth.memberships().filter(m => m.boxId !== activeId && isReachable(m.boxStatus));
  });

  letter(m: MembershipDto): string { return (m.boxName || '').trim().charAt(0).toUpperCase(); }
  label(m: MembershipDto): string { return roleLabel(m.role); }

  switchTo(m: MembershipDto): void {
    // Guard in the handler, never a [disabled] attribute — a native disabled drops the pressed
    // control out of the a11y tree and sends focus to <body>.
    if (this.switching()) return;
    this.switching.set(true);
    this.auth.selectBox(m.boxId).subscribe({
      next: () => {
        this.switching.set(false);
        this.open.set(false);
        // The role in the TARGET gym. Roles differ per gym; the page you are on may not exist
        // for the role you hold over there.
        this.router.navigateByUrl(redirectForRole(m.role));
      },
      error: () => {
        this.switching.set(false);
        this.open.set(false);
      },
    });
  }
}
```

- [ ] **Step 4: Project it into the three box shells**

In each of `athlete-shell.page.ts`, `coach-shell.page.ts` and `admin-shell.page.ts`:

1. Import `BoxSwitcherComponent` and add it to `imports`.
2. Replace `<bh-shell-header [boxName]="boxName" ...>` with
   `<bh-shell-header [customBrand]="true" ...>` — keeping each shell's existing `area` and
   `class` attributes exactly as they are (`admin-shell`'s `class="top"` is load-bearing: it is
   the direct grid child and carries the grid-area assignment).
3. Add as the first projected child: `<bh-box-switcher brand />`
4. Delete the now-unused `boxName` field from each component class, and the `BRAND_NAME` import
   if nothing else in that file uses it. **Check before deleting the import** — `athlete-shell`
   may use it elsewhere.

- [ ] **Step 5: Run tests and build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

The three shells have their own specs. **If one asserts the box name in the header, it is now
asserting the switcher's rendering — update it to query `[data-testid="box-switcher"]` and report
that you did.**

- [ ] **Step 6: Run the negative control**

Remove `&& isReachable(m.boxStatus)` from `others()`. The "does not offer a gym you cannot open"
test must go RED. **Revert.**

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A frontend/src && git commit -m "feat(m23): the box switcher, in all three shells

The box name in the header becomes the control that moves you between
gyms. A feature component, not a ui/ one: it injects AuthService and
Router, and app/ui/ stays presentational — so it is projected into
shell-header's [brand] slot.

It renders with a single gym too: All gyms is that person's only route
to /gyms/join.

Owns its own button, so data-testid and aria land on the real element.
An attribute on a component host does not reach the element inside it."
```

---

## Task 10: End to end

**A screen is not verified until e2e runs on it.** Karma cannot see a dead binding: six M13d specs
called `submit()` directly while the form's submit binding was dead, and 272 green specs never saw
the password going into the URL.

**Files:**
- Create: `e2e/tests/gyms.spec.ts`
- Modify: `e2e/tests/a11y.spec.ts` (around line 216)
- Modify: `e2e/tests/visual.spec.ts` (around lines 192–205)
- Delete: `e2e/tests/visual.spec.ts-snapshots/box-picker-phone.png`, `box-picker-desktop.png`

**Interfaces:**
- Consumes: `login(page, email)` from `e2e/tests/_support.ts` (default password
  `boxhub-demo-2026`); Task 2's fixtures `nobox@demo.io` and `multi@demo.io`.

- [ ] **Step 1: Bring up a clean stack**

Non-idempotent specs (`runner`, `tracking`, `tv`) fail on a dirty stack for unrelated reasons, so
start from `down -v`. **Rebuild the images first or you measure a stale bundle.**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml down -v
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml build frontend backend
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml up -d
```

- [ ] **Step 2: Write the new spec**

Create `e2e/tests/gyms.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './_support';

// The milestone's premise. Before M23 this person had no shell at all: roleGuard sent a session
// with no active box to /auth/login, so a brand-new account — the state EVERY account starts in,
// since register() creates a User and never a Membership — was shown a login form.
test('a boxless account lands on the hub instead of a login form', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await expect(page).toHaveURL(/\/app\/gyms$/);
  await expect(page.getByTestId('gyms-empty')).toBeVisible();
  await expect(page.getByTestId('gyms-empty-cta')).toBeVisible();
});

test('the hub offers a real way in, and it is not a placeholder', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.getByTestId('gyms-empty-cta').click();
  await expect(page).toHaveURL(/\/app\/gyms\/join$/);
  await expect(page.getByTestId('join-explainer')).toBeVisible();
});

// /auth/boxes is in users' browser history, so the redirect has to work.
test('the old picker address still resolves', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.goto('/app/auth/boxes');
  await expect(page).toHaveURL(/\/app\/gyms$/);
});

// Two gyms with DIFFERENT roles: the case M21 made real, and the one a switcher must get right.
// multi@demo.io is ATHLETE at the demo box and BOX_ADMIN at Northside.
test('switching gym lands in the target gym, by the role held there', async ({ page }) => {
  await login(page, 'multi@demo.io');
  // Two memberships, so login does not auto-select and the hub is where they land.
  await expect(page).toHaveURL(/\/app\/gyms$/);

  await page.getByTestId('gym-demo').click();
  await expect(page).toHaveURL(/\/app\/athlete/);

  await page.getByTestId('box-switcher').click();
  await page.getByTestId('switch-to-northside').click();
  // BOX_ADMIN at Northside — the admin shell, not the athlete one they came from.
  await expect(page).toHaveURL(/\/app\/admin/);
});

test('the switcher reaches the hub from inside a gym', async ({ page }) => {
  await login(page, 'athlete@demo.io');
  await expect(page).toHaveURL(/\/app\/athlete/);
  await page.getByTestId('box-switcher').click();
  await page.getByTestId('switcher-all-gyms').click();
  await expect(page).toHaveURL(/\/app\/gyms$/);
});

// The third dead end, and the one most easily left behind: the account area's Done control
// navigated a boxless session to /auth/login.
test('Done in the account area returns a boxless session to the hub', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.goto('/app/account/password');
  await page.getByTestId('account-done').click();
  await expect(page).toHaveURL(/\/app\/gyms$/);
});
```

- [ ] **Step 3: Run it**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e && npx playwright test tests/gyms.spec.ts
```

Expected: 6 passed. If `gym-demo` or `switch-to-northside` do not resolve, check the seeded
`boxSlug` values against Task 2 — the test ids are built from the slug.

- [ ] **Step 4: Retarget the a11y scan**

In `e2e/tests/a11y.spec.ts` around line 216, replace the box-picker test. The existing comment
explains that `admin@demo.io` has one membership and auto-selects past the picker — that reasoning
now applies to the hub, and `nobox@demo.io` removes the need for the workaround entirely:

```ts
// nobox@demo.io holds no membership, so it lands on the hub directly — no navigating past an
// auto-select, which is what the old box-picker scan had to work around.
test('the gym hub (mobile) has zero WCAG 2.2 AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'nobox@demo.io');
  await expect(page).toHaveURL(/\/app\/gyms$/);
  // ... keep this file's existing axe invocation and assertion shape verbatim
});
```

Add a second scan for the populated hub using `multi@demo.io`, and one for `/app/gyms/join`.

**Note:** axe's `label` rule accepts a non-empty placeholder as a label fallback, so a green axe run
is not proof that a field is labelled. There are no fields on these screens, so it does not bite
here — recorded so nobody reads the green as broader than it is.

- [ ] **Step 5: Replace the visual baselines**

In `e2e/tests/visual.spec.ts` around lines 192–205, replace the `box-picker` test with hub
coverage at both viewports, following the file's existing `vp` loop and options exactly:

```ts
test(`gym-hub-empty (${vp.name}) is visually unchanged`, async ({ page }) => { /* nobox@demo.io */ });
test(`gym-hub-list (${vp.name}) is visually unchanged`, async ({ page }) => { /* multi@demo.io */ });
```

Delete the dead baselines and record the new ones **in the Linux container** — never Playwright
locally, or you compare against baselines your renderer never wrote:

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git rm e2e/tests/visual.spec.ts-snapshots/box-picker-phone.png e2e/tests/visual.spec.ts-snapshots/box-picker-desktop.png
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh --update-snapshots
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh
```

**Read `e2e/visual.sh` before running it** — pass the update flag the way that script expects, not
the way plain Playwright does. If the script takes no such flag, stop and ask the orchestrator.

- [ ] **Step 6: Run the whole e2e suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml down -v
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml build frontend backend
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml up -d
cd /Users/alessandrolomonaco/dev/boxhub/e2e && npx playwright test
```

Expected: **more than 67 passed, 0 failed, 0 skipped.** Report the exact number.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A e2e && git commit -m "test(m23): e2e for the hub, the switcher and the entry contract

Six new specs, including the one the milestone exists for: a boxless
account reaches the hub instead of a login form. Karma cannot see that —
it is routing and guards, not a handler.

The a11y scan moves off the picker and onto the hub, and gains the
populated and join surfaces. Picker baselines deleted, hub baselines
recorded in the Linux container."
```

---

## Task 11: Close-out

- [ ] **Step 1: Run every gate, from a clean tree**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git status --short
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test
```

- [ ] **Step 2: Run all eight §8.1 greps and record the byte counts**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rnE 'class="[^"]*\bbh-(table|table-wrap|dock|dock-item)\b' frontend/src/app > /tmp/g1.txt; echo "1: $(wc -c < /tmp/g1.txt)"
grep -rnE '\.bh-(table|dock)\b' frontend/src/styles.scss frontend/src/styles > /tmp/g2.txt; echo "2: $(wc -c < /tmp/g2.txt)"
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui > /tmp/g3.txt; echo "3: $(wc -c < /tmp/g3.txt)"
grep -rnE 'font-size: *(11|13|15|20|40)px' frontend/src/app/features > /tmp/g4.txt; echo "4: $(wc -c < /tmp/g4.txt)"
grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/ui > /tmp/g5.txt; echo "5: $(wc -c < /tmp/g5.txt)"
grep -rn '@Input()\|@Output()' frontend/src/app/ui > /tmp/g6.txt; echo "6: $(wc -c < /tmp/g6.txt)"
grep -rn 'StatComponent\|BoardRowComponent\|TagComponent' frontend/src > /tmp/g7.txt; echo "7: $(wc -c < /tmp/g7.txt)"
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features --exclude=receipt.page.ts > /tmp/g8.txt; echo "8: $(wc -c < /tmp/g8.txt)"
```

All eight must print `0`.

- [ ] **Step 3: Confirm the tenancy gate and the conformance test**

```bash
cd /Users/alessandrolomonaco/dev/boxhub
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/gt.txt; echo "runAsRoot in controllers: $(wc -c < /tmp/gt.txt)"
git diff main --stat -- backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java
```

Expected: `0`, and **an empty diff** for `AuthzConformanceTest`. This milestone adds no route.

- [ ] **Step 4: Hand back to the orchestrator for the impeccable critique**

Each screen goes through critique separately — the hub, the join surface, and the switcher — scored
≥28/40 with no open P0/P1. **Never once over the whole milestone at the end.** Expect 3–5
look-and-adjust rounds per screen; every one so far has found a real defect.

Report, per screen: the score, every P0/P1 and its resolution, and the re-run score after fixes. A
score measured *with* a P0 open is not the screen's score.

---

## Self-review

**Spec coverage.** §3 entry contract → Task 7. §4 the hub → Tasks 1, 5. §5 the switcher → Tasks 3,
9. §6 tenancy → no task needed, and Task 11 Step 3 proves it. §6.1 seeder → Task 2. §7 design law →
enforced by the gates in Tasks 3, 6, 11. §8 verification → Tasks 10, 11. §9 blast radius → Task 8.
§10 out of scope → nothing built, BACKLOG entry already committed. §2.2 Join not Find → Task 6.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Three steps
deliberately say *read the existing file first and match its shape* — Task 8 Step 3
(`role.guard.spec.ts`'s harness), Task 10 Steps 4–5 (the axe and `vp`-loop idioms), and Task 3 Step
5 (the gallery ledger rows). Those are instructions to match an existing convention, not gaps: the
surrounding style is the requirement, and reproducing it here would go stale.

**Type consistency.** `roleLabel` / `boxStatusLabel` / `isReachable` are named identically in Tasks
1, 5 and 9. The module is `core/auth/labels.ts` everywhere. `customBrand` and the `[brand]` slot are
named identically in Tasks 3, 4 and 9. `entryGuard` matches between Task 7's file and its route
registration. Test ids `gym-<slug>`, `switch-to-<slug>`, `box-switcher`, `switcher-all-gyms`,
`gyms-empty`, `gyms-empty-cta`, `gyms-error`, `join-explainer` are used consistently across the
Karma and Playwright specs.

**One deliberate red step**, flagged where it occurs: Task 4 Step 5's production build fails until
Tasks 5 and 6 land, because the route's `loadComponent` points at files that do not exist yet.
Tasks 4–6 therefore share one commit.

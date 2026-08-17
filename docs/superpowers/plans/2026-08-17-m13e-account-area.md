# M13e — the account area: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single `account/security` page into a routed account area with four sections, a lateral menu at desktop and list→detail on phone, and add a notification mail after a password change.

**Architecture:** A parent route `/account` renders a layout (header + nav + `<router-outlet>`) behind a session-only guard; `password`, `email`, `sessions` and `danger` are child routes. The four existing entry points are repointed and `/account/security` becomes a redirect. The one backend change fires a mail from the controller, after the transactional service call returns.

**Tech Stack:** Angular 22 (standalone, signals, `@if`/`@for`), Spring Boot 3.5 / Java 21, Thymeleaf mail templates, Karma, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-17-m13e-account-area-design.md` — read it alongside this plan.

## Global Constraints

- **Tokens only.** No raw hex, no raw px beyond the sanctioned `1px` hairline. Mail templates are the one exception (they cannot read CSS custom properties).
- **Zero volt on this area, in every state.** Four co-equal saves, no single question. One volt element is a ceiling, not a quota.
- **Form contract.** `<form (submit)="handler($event)" novalidate>` with `event.preventDefault()` first. Never the template-forms submit output — it dies with the module and the browser does a native GET. On these forms the payload is a password.
- **`bh-field` is NOT a `ControlValueAccessor`.** Bind `[(value)]` to signals.
- **A disabled button guards one path, never the action.** Every handler early-returns on its own pending signal — Enter submits regardless of a button's disabled state.
- **Never a native `disabled` on the control the user just pressed** if it unmounts or leaves the a11y tree; use `aria-disabled`, or move focus onto what replaced it.
- **i18n:** every user-facing string marked, `@@account.*`. `$localize` for TS-built strings. No new hardcoded user-facing string.
- **Test ids:** `bh-field` / `bh-button` take theirs via the **`testId` input**, which binds to the inner element. A `data-testid` on the host does not reach the `<input>`/`<button>`. `bh-field` derives its error node as `<testId>-error`.
- **Never a backtick inside an HTML comment in an Angular template** (`TS1005`), and never name a gate's own grep token (`FormsModule`, `ngSubmit`) in a comment on a clean file.
- **Commands:** `npm test -- --watch=false --browsers=ChromeHeadless` (bare `npm test` hangs). `npx ng build --configuration production` — **it does not compile spec files**, only Karma does. Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Absolute paths always; bash cwd persists between calls.

---

# Phase 1 — the frame

## Task 1: a session-only guard

**Files:**
- Create: `frontend/src/app/core/auth/session.guard.ts`
- Test: `frontend/src/app/core/auth/session.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthService.hasSession()`, `Router`.
- Produces: `sessionGuard: CanActivateFn` — used by Task 3 on the `/account` parent route.

**Why this exists:** `roleGuard` requires `auth.activeBox()`, so a user with no membership or a SUSPENDED box cannot reach their own account. Spec §4.

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { sessionGuard } from './session.guard';

describe('sessionGuard', () => {
  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => sessionGuard(null as never, null as never)) as boolean | UrlTree;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('allows a signed-in user who has NO membership at all', () => {
    TestBed.inject(AuthService).session.set(
      { id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [], superadmin: false });
    expect(run()).toBeTrue();
  });

  it('allows a signed-in user whose only box is SUSPENDED', () => {
    TestBed.inject(AuthService).session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: 'b1', boxName: 'B', boxSlug: 'b', role: 'ATHLETE', boxStatus: 'SUSPENDED' }],
    });
    expect(run()).toBeTrue();
  });

  it('sends a signed-out visitor to login', () => {
    const result = run();
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/auth/login');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Expected: FAIL — `session.guard` does not exist.

- [ ] **Step 3: Write the guard**

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * A session and nothing else. Deliberately NOT roleGuard: that requires an active box, which
 * locked a membership-less or suspended-box user out of their own password, sessions and account
 * deletion — the users most likely to want to delete an account were exactly the ones barred.
 */
export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasSession() ? true : inject(Router).parseUrl('/auth/login');
};
```

- [ ] **Step 4: Run the tests, watch them pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Expected: PASS.

- [ ] **Step 5: Negative control**

Change `auth.hasSession() ? true :` to `true ?` and re-run. The signed-out test must fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/auth/session.guard.ts frontend/src/app/core/auth/session.guard.spec.ts
git commit -m "feat(m13e): a session-only guard for the account area"
```

---

## Task 2: the area layout

**Files:**
- Create: `frontend/src/app/features/account/account-layout.page.ts`
- Test: `frontend/src/app/features/account/account-layout.page.spec.ts`

**Interfaces:**
- Consumes: `WordmarkComponent`, `Location`, `Router`, `AuthService`, `redirectForRole`.
- Produces: `AccountLayoutPage` — the component Task 3 mounts at `/account`. It renders `<router-outlet>` for the children and owns the nav.

**Layout rule (spec §3, §5):** one markup tree, layout switched by CSS at the 720px breakpoint — never two branches keyed on a signal. Above 720px the nav sits beside the outlet; below, the nav is the index page and a section replaces it.

- [ ] **Step 1: Write the failing test**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { AccountLayoutPage } from './account-layout.page';

describe('AccountLayoutPage', () => {
  let fixture: ComponentFixture<AccountLayoutPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountLayoutPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(AccountLayoutPage);
    fixture.detectChanges();
  });

  it('names the area and lists all four sections', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')!.textContent).toContain('Account');
    const links = [...el.querySelectorAll('nav a')].map(a => a.getAttribute('href'));
    // NOT /account/email — that path is the unguarded landing clicked from a mail. The area's
    // own email section is /account/change-email. See the plan's Task 3.
    expect(links).toEqual(['/account/password', '/account/change-email', '/account/sessions', '/account/danger']);
  });

  it('Done goes back through history when there is history to go back to', () => {
    const location = TestBed.inject(Location);
    const back = spyOn(location, 'back');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(back).toHaveBeenCalled();
  });

  it('falls back to the role home when the area was opened directly, with no history', () => {
    // A pasted URL: nothing to go back to, so back() would strand the user on a blank tab.
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigateByUrl');
    fixture.componentInstance.hasHistory = () => false;
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(nav).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

```ts
import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { WordmarkComponent } from '../../ui/wordmark.component';

/**
 * The account area's frame: its own header, its nav, and the outlet the four sections render
 * into. The three shells' navigation is deliberately absent — this is a place you step into and
 * leave, which is what the Done control is for.
 *
 * ONE markup tree, layout switched by CSS at 720px. Above it the nav sits beside the outlet;
 * below it the nav IS the index page and a section replaces it. Keying that on a signal instead
 * would flicker and would put the breakpoint in two places.
 */
@Component({
  selector: 'bh-account-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WordmarkComponent],
  template: `
    <header class="top">
      <bh-wordmark />
      <h1 class="t-h3 title" i18n="@@account.title">Account</h1>
      <button type="button" class="done" (click)="done()"
              data-testid="account-done" i18n="@@account.done">Done</button>
    </header>

    <div class="wrap">
      <nav class="side" aria-label="Account" i18n-aria-label="@@account.nav.label">
        @for (s of sections; track s.link) {
          <a class="s-item" [routerLink]="s.link" routerLinkActive="active"
             ariaCurrentWhenActive="page" [attr.data-testid]="'account-nav-' + s.id">{{ s.label }}</a>
        }
      </nav>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .top { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4);
      border-bottom: 1px solid var(--hairline); }
    .title { margin: 0; flex: 1; }
    .done { background: none; border: 0; padding: 0 var(--sp-2); min-height: var(--tap);
      font: inherit; color: var(--bone); text-decoration: underline; cursor: pointer; }
    .done:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .wrap { max-width: 900px; margin: 0 auto; padding: var(--sp-6) var(--sp-4); display: flex;
      flex-direction: column; gap: var(--sp-6); }
    .side { display: flex; flex-direction: column; }
    .s-item { display: flex; align-items: center; justify-content: space-between;
      min-height: var(--tap); padding: var(--sp-3) 0; color: var(--bone);
      text-decoration: none; border-bottom: 1px solid var(--hairline); }
    .s-item.active { color: var(--bone); }
    .content { min-width: 0; }

    @media (min-width: 720px) {
      .wrap { flex-direction: row; align-items: flex-start; gap: var(--sp-8); }
      .side { flex: 0 0 200px; }
      .s-item { border-bottom: none; padding: var(--sp-2) var(--sp-3); border-radius: var(--edge); }
      .s-item.active { background: var(--surface); }
      .content { flex: 1; }
    }
  `],
})
export class AccountLayoutPage {
  private location = inject(Location);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly sections = [
    { id: 'password', link: '/account/password', label: $localize`:@@account.nav.password:Password` },
    // /account/change-email, NOT /account/email: the latter is the unguarded confirmation
    // landing that AccountService.startEmailChange has already mailed to real inboxes.
    { id: 'email', link: '/account/change-email', label: $localize`:@@account.nav.email:Email` },
    { id: 'sessions', link: '/account/sessions', label: $localize`:@@account.nav.sessions:Sessions` },
    { id: 'danger', link: '/account/danger', label: $localize`:@@account.nav.danger:Danger zone` },
  ];

  /** Overridable in tests; window.history.length is 1 when this tab has no prior entry. */
  hasHistory = () => window.history.length > 1;

  done() {
    if (this.hasHistory()) { this.location.back(); return; }
    // Opened from a pasted URL: back() would leave the tab on a blank page.
    const box = this.auth.activeBox();
    this.router.navigateByUrl(box ? redirectForRole(box.role) : '/auth/login');
  }
}
```

- [ ] **Step 4: Run the tests, watch them pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Expected: PASS.

- [ ] **Step 5: Negative control**

Delete the `sessions` entry from `sections` and re-run — the four-link test must fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/account/account-layout.page.ts frontend/src/app/features/account/account-layout.page.spec.ts
git commit -m "feat(m13e): the account area layout — header, nav, outlet"
```

---

## Task 3: routes, the redirect, and the four entry points

**Files:**
- Modify: `frontend/src/app/app.routes.ts:20-22`
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts:22` and `:134`
- Modify: `frontend/src/app/features/coach/coach-shell.page.ts:26`
- Modify: `frontend/src/app/features/athlete/profile-sheet.component.ts:39`
- Test: `frontend/src/app/features/admin/admin-shell.page.spec.ts:42`, `frontend/src/app/features/coach/coach-shell.page.spec.ts:18`

**Interfaces:**
- Consumes: `sessionGuard` (Task 1), `AccountLayoutPage` (Task 2).
- Produces: the `/account/*` route table every later task's screens hang off.

**The trap this task exists to avoid:** `/account/email?token=` is the **unauthenticated** confirmation landing clicked from a mail. It must NOT end up behind `sessionGuard`, and the area's own email section is `/account/email` **with no token**. Two different things at paths that look alike. Spec §3.

**Resolution:** the area's section is `/account/email`; the mail landing keeps its own **separate, unguarded** route registered BEFORE the area. Because both are `/account/email`, the mail landing is moved to **`/account/confirm-email`** and `AppUrls`/`Mailer` are NOT touched — instead `/account/email?token=` is kept as an unguarded redirect that preserves the query string. Verify against `AccountService.startEmailChange`, which mails `/account/email?token=` today: **that emitted path must keep working forever**, because links already in inboxes use it.

- [ ] **Step 1: Confirm what the backend actually mails**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -n "account/email" backend/src/main/java/com/boxhub/identity/AccountService.java
```
Expected: the `mailer.link("/account/email?token=" + token)` call. **If the path differs from this plan, STOP and report it.**

- [ ] **Step 2: Write the failing routing test**

```ts
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';

describe('account routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('keeps the emailed confirmation path reachable WITHOUT a session', () => {
    const router = TestBed.inject(Router);
    const tree = router.parseUrl('/account/email?token=abc');
    const match = routes.find(r => r.path === 'account/email');
    // The emailed link is clicked from an inbox, possibly on a device that never logged in.
    expect(match).withContext('the emailed path must still have its own route').toBeDefined();
    expect(match!.canActivate).withContext('and it must carry NO guard').toBeUndefined();
    expect(tree.queryParams['token']).toBe('abc');
  });

  it('guards the account area itself', () => {
    const area = routes.find(r => r.path === 'account');
    expect(area).toBeDefined();
    expect(area!.canActivate?.length).toBe(1);
  });

  it('redirects the old security URL into the area', () => {
    const old = routes.find(r => r.path === 'account/security');
    expect(old?.redirectTo).toBe('/account');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

- [ ] **Step 4: Write the routes**

Replace `app.routes.ts:20-22` with:

```ts
  // The emailed confirmation landing. Registered BEFORE the area and deliberately UNGUARDED:
  // it is clicked from an inbox, possibly on a device that has never logged in. The path is what
  // AccountService.startEmailChange has already mailed to real inboxes — it can never move.
  { path: 'account/email', title: $localize`:@@route.account.email:Confirm email`,
    loadComponent: () => import('./features/account/email-confirm.page').then(m => m.EmailConfirmPage) },

  // The old single page. Kept as a redirect: it is in users' history and in four places here.
  { path: 'account/security', redirectTo: '/account', pathMatch: 'full' },

  { path: 'account', canActivate: [sessionGuard],
    loadComponent: () => import('./features/account/account-layout.page').then(m => m.AccountLayoutPage),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/account/account-index.page').then(m => m.AccountIndexPage) },
      { path: 'password', title: $localize`:@@route.account.password:Password`,
        loadComponent: () => import('./features/account/password.page').then(m => m.PasswordPage) },
      { path: 'sessions', title: $localize`:@@route.account.sessions:Sessions`,
        loadComponent: () => import('./features/account/sessions.page').then(m => m.SessionsPage) },
      { path: 'danger', title: $localize`:@@route.account.danger:Danger zone`,
        loadComponent: () => import('./features/account/danger.page').then(m => m.DangerPage) },
    ] },
```

**Note the collision and its resolution:** the area's email section cannot also be `account/email`, because that path is taken by the unguarded landing above. **The area's email section is `/account/change-email`**, and Task 2's nav entry must use that link and label it "Email". Update Task 2's `sections` array accordingly and its spec's expected href list.

Add to the children:

```ts
      { path: 'change-email', title: $localize`:@@route.account.changeEmail:Email`,
        loadComponent: () => import('./features/account/change-email.page').then(m => m.ChangeEmailPage) },
```

- [ ] **Step 5: Repoint the four entry points**

In each file replace `routerLink="/account/security"` with `routerLink="/account"`:
`admin-shell.page.ts:22`, `admin-shell.page.ts:134` (the nav array's `link`), `coach-shell.page.ts:26`, `profile-sheet.component.ts:39`.

Update the two specs that assert the href to expect `/account`:
`admin-shell.page.spec.ts:42`, `coach-shell.page.spec.ts:18`.

- [ ] **Step 6: Run everything**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless && npx ng build --configuration production
```
Expected: PASS, build exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app
git commit -m "feat(m13e): route the account area, redirect the old URL, repoint the entry points"
```

---

## Task 4: the index page (the phone's menu)

**Files:**
- Create: `frontend/src/app/features/account/account-index.page.ts`
- Test: `frontend/src/app/features/account/account-index.page.spec.ts`

**Interfaces:**
- Consumes: nothing but the router.
- Produces: `AccountIndexPage`, mounted at `/account` (index).

**Behaviour:** on phone this route renders nothing of its own — the layout's nav IS the menu, and the content column is empty. At desktop an empty content column beside a menu looks broken, so the index **redirects to `/account/password`** above 720px. Spec §3.

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountIndexPage } from './account-index.page';

describe('AccountIndexPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountIndexPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('redirects to the first section at desktop, where an empty column reads as broken', () => {
    const fixture = TestBed.createComponent(AccountIndexPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.isDesktop = () => true;
    fixture.detectChanges();
    expect(nav).toHaveBeenCalledWith('/account/password');
  });

  it('stays put on phone, where the nav itself is the menu', () => {
    const fixture = TestBed.createComponent(AccountIndexPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.isDesktop = () => false;
    fixture.detectChanges();
    expect(nav).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, watch it fail. Step 3: Implement.**

```ts
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The index of the area. On phone it renders nothing: the layout's nav is the menu, and this
 * route existing is what makes "back" from a section land on that menu. At desktop the menu is
 * always visible beside the content, so an empty content column would just read as broken —
 * hence the redirect to the first section.
 */
@Component({
  selector: 'bh-account-index',
  standalone: true,
  template: ``,
})
export class AccountIndexPage implements OnInit {
  private router = inject(Router);

  /** Overridable in tests. Matches the layout's own 720px breakpoint. */
  isDesktop = () => window.matchMedia('(min-width: 720px)').matches;

  ngOnInit() {
    if (this.isDesktop()) this.router.navigateByUrl('/account/password');
  }
}
```

- [ ] **Step 4: Run tests. Step 5: Commit.**

```bash
git add frontend/src/app/features/account/account-index.page.ts frontend/src/app/features/account/account-index.page.spec.ts
git commit -m "feat(m13e): the account index — the phone's menu, a desktop redirect"
```

---

# Phase 2 — the four sections

Each section task follows the same cycle, and the cycle is binding:

1. Build it (an executor, from this plan).
2. Orchestrator reviews the diff and runs Karma + the production build.
3. **Run the section in a real browser** — Karma cannot see a dead submit binding.
4. `/impeccable critique <section>` **on Sonnet, inline, no sub-agents**, handing it the measurements already taken. Fix P0/P1, then re-run the critique to confirm the score moved.

## Task 5: the password section

**Files:**
- Create: `frontend/src/app/features/account/password.page.ts`
- Test: `frontend/src/app/features/account/password.page.spec.ts`
- Reference (do not modify): `frontend/src/app/features/account/security.page.ts:37-52` — the current markup and behaviour being replaced.

**Interfaces:**
- Consumes: `AuthService.changePassword(current, next)`, `passwordErrorMessage` from `core/auth/auth.models`.
- Produces: nothing later tasks depend on.

**Content (spec §6.1):** current + new field; the 10-character floor validated client-side; two consequences stated **before** the button — this signs out your other devices, and we will email you; a Google-only account (`NO_PASSWORD_SET`, 409) sees the existing message with a route to set one.

- [ ] **Step 1: Read the behaviour being replaced**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && sed -n '190,260p' frontend/src/app/features/account/security.page.ts
```
Carry over every state you find. **If anything there is not described in this plan, STOP and report it** rather than dropping it.

- [ ] **Step 2: Write the failing tests**

```ts
it('submits through a real DOM submit event and prevents the native default', () => {
  const fixture = TestBed.createComponent(PasswordPage);
  fixture.detectChanges();
  const cmp = fixture.componentInstance;
  cmp.currentPassword.set('old-password-1');
  cmp.newPassword.set('new-password-12');
  fixture.detectChanges();

  const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="password-form"]');
  let captured: Event | undefined;
  form.addEventListener('submit', e => (captured = e));
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  http.expectOne('/api/me/password');
  expect(captured!.defaultPrevented)
    .withContext('or the browser does a native GET with both passwords in the URL').toBeTrue();
});

it('rejects a 9-character new password client-side and issues no request', () => {
  const fixture = TestBed.createComponent(PasswordPage);
  fixture.detectChanges();
  const cmp = fixture.componentInstance;
  cmp.currentPassword.set('old-password-1');
  cmp.newPassword.set('123456789');
  cmp.submit();
  http.expectNone('/api/me/password');
  expect(cmp.newPasswordError()).toBeTruthy();
});

it('states both consequences before the button', () => {
  const fixture = TestBed.createComponent(PasswordPage);
  fixture.detectChanges();
  const text = (fixture.nativeElement as HTMLElement).textContent!;
  expect(text).toContain('other devices');
  expect(text).toContain('email');
});

it('a second submit while one is in flight issues no second request', () => {
  const fixture = TestBed.createComponent(PasswordPage);
  fixture.detectChanges();
  const cmp = fixture.componentInstance;
  cmp.currentPassword.set('old-password-1');
  cmp.newPassword.set('new-password-12');
  cmp.submit();
  http.expectOne('/api/me/password');
  cmp.submit();
  http.expectNone('/api/me/password');
});
```

- [ ] **Step 3: Run them, watch them fail. Step 4: Implement the section.**

Follow `frontend/src/app/features/auth/reset.page.ts` for shape: `bh-field` with `[(value)]` on signals, native `(submit)` with `preventDefault()`, the pending guard inside the handler, `bh-alert` for form-level messages, every string marked `@@account.password.*`. The submit is `variant="ghost"` — **zero volt on this area**.

- [ ] **Step 5: Run Karma and the production build.**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless && npx ng build --configuration production
```

- [ ] **Step 6: Negative control** — swap the native `(submit)` for a click handler on the button and confirm the DOM-submit spec fails. Revert.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/app/features/account
git commit -m "feat(m13e): the password section"
```

---

## Task 6: the email section

**Files:**
- Create: `frontend/src/app/features/account/change-email.page.ts`
- Test: `frontend/src/app/features/account/change-email.page.spec.ts`

**Interfaces:**
- Consumes: `AuthService.startEmailChange(password, newEmail)`.
- Produces: nothing later tasks depend on.

**Content (spec §6.2):** new address + current password; the screen states its own strength — the change lands only when the **new** address clicks the link sent to it, and the current address stays active until then. The backend half is already correct and is **not** touched.

- [ ] **Step 1: Write the failing tests** — the same four shapes as Task 5 (real DOM submit asserting `defaultPrevented`; client-side rejection of a malformed address issuing no request; the pending guard; and that the success state names the address the confirmation went to). Use `/api/me/email` as the URL and `@@account.email.*` as the i18n namespace.

- [ ] **Step 2: Run, fail, implement, run, pass** — same shape as Task 5.

- [ ] **Step 3: Negative control** on the DOM-submit spec. Revert.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/app/features/account
git commit -m "feat(m13e): the email section"
```

---

## Task 7b: parse the device label (backend)

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/DeviceLabel.java`
- Create: `backend/src/test/java/com/boxhub/identity/DeviceLabelTest.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AccountService.java` — where `SessionDto` is built

**Interfaces:**
- Consumes: nothing.
- Produces: `DeviceLabel.of(String userAgent) -> String`, and `SessionDto.device` now carries a readable label instead of the raw User-Agent.

**Why, and why it is here rather than in the backlog.** `SessionDto.device` is the raw `User-Agent`, 80–150 characters (see `RefreshTokenService.mint` / `RefreshToken.java`). Recognising your own device is the entire point of a sessions list, and a 150-character UA string defeats it. The user chose this deliberately over shipping as-is.

**Parse at READ time**, where `AccountService` builds `SessionDto` — **not** at mint time into a new column. No Flyway migration, no schema change, and every existing session row gets the benefit rather than only newly-minted ones.

**Keep it dumb and total.** User-Agents are spoofable, endless and change constantly. This is a best-effort label, not identification: a short ordered list of substring checks, and an honest fallback. It must never throw and never return empty.

- [ ] **Step 1: Write the failing test**

```java
class DeviceLabelTest {
    @Test void namesCommonBrowserAndPlatformPairs() {
        assertThat(DeviceLabel.of("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"))
                .isEqualTo("Chrome on macOS");
        assertThat(DeviceLabel.of("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"))
                .isEqualTo("Safari on iPhone");
        assertThat(DeviceLabel.of("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0"))
                .isEqualTo("Edge on Windows");
    }

    @Test void neverThrowsAndNeverReturnsEmpty() {
        // A User-Agent is attacker-controlled: null, blank and junk must all produce a label.
        assertThat(DeviceLabel.of(null)).isNotBlank();
        assertThat(DeviceLabel.of("")).isNotBlank();
        assertThat(DeviceLabel.of("!!! not a user agent !!!")).isNotBlank();
    }

    @Test void doesNotEchoAnUnboundedAttackerControlledStringBackToTheUser() {
        // The whole point is a SHORT label. Echoing the raw UA on no match would reintroduce the
        // 150-character row this task exists to remove, and hand an attacker a text injection
        // surface into another session's row.
        String hostile = "x".repeat(4000);
        assertThat(DeviceLabel.of(hostile).length()).isLessThan(40);
    }
}
```

- [ ] **Step 2: Run it, watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -Dtest=DeviceLabelTest test
```

- [ ] **Step 3: Implement `DeviceLabel`** — a final class with a private constructor and one static `of`. Ordered substring checks (Edge before Chrome, since Edge's UA contains "Chrome"; Chrome before Safari, since Chrome's contains "Safari"), platform from the parenthesised section, and a fallback of `"Unknown device"`. Never interpolate the raw UA into the result.

- [ ] **Step 4: Use it where `SessionDto` is built** in `AccountService`, replacing the raw value.

- [ ] **Step 5: Run the backend suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Report the new total. **If an existing test asserts a raw User-Agent in a session response, that test moves with the behaviour — report it rather than weakening it.**

- [ ] **Step 6: Negative control** — make `of` return the raw input, watch the length test fail, revert.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/DeviceLabel.java backend/src/test/java/com/boxhub/identity/DeviceLabelTest.java backend/src/main/java/com/boxhub/identity/AccountService.java
git commit -m "feat(m13e): a readable device label for the sessions list"
```

---

## Task 7: the sessions section

**Files:**
- Create: `frontend/src/app/features/account/sessions.page.ts`
- Test: `frontend/src/app/features/account/sessions.page.spec.ts`

**Interfaces:**
- Consumes: `AuthService.sessions()`, `AuthService.revokeSession(id)`, `AuthService.logoutEverywhere()`, `AccountSession` from `core/auth/auth.service`.
- Produces: nothing later tasks depend on.

**The three rules that matter here (spec §6.3):**
- Pending keyed **per row id**, never one boolean.
- **No native `disabled` on the row being revoked** — it leaves the a11y tree and focus drops to `<body>`. Use `aria-disabled` and guard inside the handler.
- Revoking the session you are holding ends it: clear state and navigate to login.

- [ ] **Step 1: Write the failing tests**

```ts
it('marks only the row being revoked, and leaves it focusable', () => {
  const fixture = setup([
    { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
    { id: 's2', device: 'iPhone', ip: '2.2.2.2', lastSeen: new Date().toISOString(), current: false },
  ]);
  const cmp = fixture.componentInstance;
  cmp.revoke({ id: 's1' } as never);
  fixture.detectChanges();

  const row1: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="signout-one-s1"]');
  const row2: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="signout-one-s2"]');
  expect(row1.getAttribute('aria-disabled')).toBe('true');
  expect(row1.disabled).withContext('a native disabled drops focus to <body>').toBeFalse();
  expect(row2.getAttribute('aria-disabled')).withContext('one boolean would disable every row').toBeNull();
});

it('loading, error and empty each render', () => {
  // Drive all three of the SessionsState arms; assert the testid unique to each.
});
```

- [ ] **Step 2: Run, fail, implement, run, pass.** Carry over the states from `security.page.ts:85-117`.

- [ ] **Step 3: Negative control** — change the per-row check to a single boolean and confirm the row2 assertion fails. Revert.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/app/features/account
git commit -m "feat(m13e): the sessions section"
```

---

## Task 8: the danger zone

**Files:**
- Create: `frontend/src/app/features/account/danger.page.ts`
- Test: `frontend/src/app/features/account/danger.page.spec.ts`

**Interfaces:**
- Consumes: `AuthService.exportData()`, `AuthService.deleteAccount(password?)`, `SheetComponent`, `BRAND_NAME`.
- Produces: nothing later tasks depend on.

**The delete confirmation stays a `bh-sheet`** (decided at shape): it already works and is tested, the consequence is irreversible — the one place interrupting on purpose beats exhausting inline — and `bh-sheet`'s confirm-close is free protection once the field has input.

**THE SECURITY PROPERTY THAT MUST SURVIVE EXACTLY (spec §6.4).** The first delete submit sends **no** password. A `422 WRONG_PASSWORD` coming back is what *reveals* the field — which is how a Google-only account never sees one. It looks like a missing field and is a deliberate probe. **Do not "fix" it by sending the password eagerly.**

Also: second-attempt copy differs ("That password is wrong", not "Enter your password"); `LAST_ADMIN` (409) names the box; deleting requires the literal string `DELETE` plus a password when one is needed; the control that *opens* the flow is a danger-bordered ghost and the control that *executes* it is filled, `--on-danger` dark.

- [ ] **Step 1: Write the failing tests**

```ts
it('sends NO password on the first attempt — that is what makes a Google-only account never see the field', () => {
  const fixture = setup();
  const cmp = fixture.componentInstance;
  cmp.deleteConfirmText.set('DELETE');
  cmp.submitDelete();
  const req = http.expectOne('/api/me');
  expect(req.request.body).withContext('a password here would break the Google-only path').toBeFalsy();
});

it('reveals the password field only after the server asks for it', () => {
  const fixture = setup();
  const cmp = fixture.componentInstance;
  cmp.deleteConfirmText.set('DELETE');
  cmp.submitDelete();
  http.expectOne('/api/me').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[data-testid="delete-password"]')).not.toBeNull();
});

it('the second attempt does not tell the user to do the thing they just did', () => {
  // After the field is visible AND a password has been typed, the message must differ from the first.
});

it('requires the literal string DELETE', () => {
  const fixture = setup();
  const cmp = fixture.componentInstance;
  cmp.deleteConfirmText.set('delete');
  expect(cmp.canDelete()).toBeFalse();
  cmp.deleteConfirmText.set('DELETE');
  expect(cmp.canDelete()).toBeTrue();
});
```

- [ ] **Step 2: Run, fail, implement, run, pass.** Carry over from `security.page.ts:119-158` and its handlers.

- [ ] **Step 3: Negative control** — make the first submit send the password and confirm the first test fails. Revert.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/app/features/account
git commit -m "feat(m13e): the danger zone — export and delete"
```

---

## Task 9: delete the old page

**Files:**
- Delete: `frontend/src/app/features/account/security.page.ts`
- Delete: `frontend/src/app/features/account/security.page.spec.ts`

- [ ] **Step 1: Confirm nothing references it**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "security.page\|SecurityPage" frontend/src e2e
```
Expected: **no output**. If anything remains, fix that first — the route was replaced in Task 3.

- [ ] **Step 2: Delete, run the full suite and the build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless && npx ng build --configuration production
```

- [ ] **Step 3: Commit**

```bash
git rm frontend/src/app/features/account/security.page.ts frontend/src/app/features/account/security.page.spec.ts
git commit -m "refactor(m13e): delete the single security page, now four sections"
```

---

# Phase 3 — the backend

## Task 10: notify by mail after a password change

**Files:**
- Create: `backend/src/main/resources/templates/mail/password-changed.html`
- Modify: `backend/src/main/java/com/boxhub/identity/AccountController.java:57-69`
- Test: `backend/src/test/java/com/boxhub/identity/AccountApiTest.java` (add a case; confirm the class name first)

**Interfaces:**
- Consumes: `Mailer.send(String to, String subject, String template, Map<String,Object> vars)`, `AccountService.changePassword(...)` which returns the `User`.
- Produces: nothing the frontend consumes — the mail is out-of-band.

**WHERE THIS GOES, AND WHY IT IS NOT IN THE SERVICE.** `AccountService.changePassword` is `@Transactional`. The project rule is that **mail fires strictly AFTER commit** — a mail sent in a transaction that rolls back is a lie. `Mailer.send` is `@Async`, which moves it off-thread but does **not** make it after-commit. The controller method is not transactional and runs after the service returns, so that is the correct seam.

Send to `u.getEmail()` — the address on the account at the time of the change. `Mailer` resolves the recipient's locale from `users.locale` itself; nothing extra is needed.

- [ ] **Step 1: Write the failing test**

```java
@Test
void changingThePasswordMailsTheAccountAddress() throws Exception {
    // ... arrange a user with a known password, as the neighbouring tests in this class do ...
    mvc.perform(patch("/api/me/password")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"a-new-password-1\"}")
            .with(user(...)))
       .andExpect(status().isNoContent());

    verify(mailer).send(eq(user.getEmail()), anyString(), eq("password-changed"), anyMap());
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -Dtest=AccountApiTest test
```
Expected: FAIL — no `send` with template `password-changed`.

- [ ] **Step 3: Write the template**

`backend/src/main/resources/templates/mail/password-changed.html`, modelled on `mail/reset.html` and using the shared `mail/layout.html`. Content: the password on this account was changed; if it was not you, reset it immediately, with a link to `/auth/forgot`. **Mail templates are the one sanctioned exception to tokens-only** — they cannot read CSS custom properties, so inline hex is correct here.

- [ ] **Step 4: Send it from the controller**

In `changePassword`, after `accounts.changePassword(...)` returns and before building the response:

```java
        // AFTER the transactional service call returns, never inside it: a mail sent in a
        // transaction that rolls back is a lie. @Async moves it off-thread; it does not make it
        // after-commit. Mailer resolves the recipient's locale from users.locale itself.
        mailer.send(u.getEmail(), "Your password was changed", "password-changed",
                Map.of("name", u.getName(), "resetLink", mailer.link("/auth/forgot")));
```

Inject `Mailer` into the controller if it is not already a dependency.

- [ ] **Step 5: Run the backend suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS. Report the new total; it is **435** before this task.

- [ ] **Step 6: Negative control** — comment out the `mailer.send` call, watch the new test fail, restore.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/templates/mail/password-changed.html backend/src/main/java/com/boxhub/identity/AccountController.java backend/src/test
git commit -m "feat(m13e): mail a notification after a password change"
```

---

# Phase 4 — closing

## Task 11: e2e

**Files:**
- Modify: `e2e/tests/account-security.spec.ts`

**This spec already exists and was written to survive this redesign** — it pins behaviour and no layout. Repoint it and extend it.

- [ ] **Step 1: Repoint** every `/app/account/security` to the new section routes: the password test to `/app/account/password`, the delete test to `/app/account/danger`.
- [ ] **Step 2: Add** a case that the area is reachable by a user with **no** active box (spec §4) — sign up and verify a fresh account without joining a box, then open `/app/account/password` and assert the form renders rather than a login bounce.
- [ ] **Step 3: Add** a case that the password-change **notification mail arrives**, polling Mailpit for a message to the account's address, the way the existing helpers do.
- [ ] **Step 4: Add** a case that `/app/account/security` still lands in the area (the redirect).
- [ ] **Step 5: Run**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f /Users/alessandrolomonaco/dev/boxhub/docker/docker-compose.yml down -v && docker compose -f /Users/alessandrolomonaco/dev/boxhub/docker/docker-compose.yml up -d --build
```
**Then wait ~100 seconds before running any spec.** `DevDataSeeder` is still seeding classes and generating PNGs; a short wait produces a failure that looks exactly like a real defect.

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e && npx playwright test --reporter=line
```
Expected: **53 passed + 1 skipped** plus the new cases. If `runner`/`tracking`/`tv` fail, the stack is dirty — re-run on `down -v` before blaming the diff.

- [ ] **Step 6: Commit.**

## Task 12: axe

**Files:** Modify `e2e/tests/a11y.spec.ts`.

- [ ] Add each of the four sections at **375 and 1440**, following the existing `SCREENS` table and its readiness-locator convention: assert a section-specific locator is visible **before** axe runs, or an audit of a redirect passes vacuously.
- [ ] The area needs a session — use `login()` from `./_support`, and note the account area does **not** need an active box.
- [ ] Expected: zero WCAG 2.2 AA violations. A violation is a real defect in a section this milestone just built — **fix the section, never the assertion.**
- [ ] **Remember the limit found in M13d:** axe does **not** flag a missing label on a field that has a placeholder. Do not use a placeholder-bearing field to prove the new cases can fail.
- [ ] Commit.

## Task 13: visual baselines

**Files:** Modify `e2e/tests/visual.spec.ts`; add baselines under `e2e/tests/visual.spec.ts-snapshots/`.

**This task is LAST of the test tasks and that ordering is not negotiable** — baselines churning while sections are still being designed is why this gate was cut once before.

- [ ] Add the four sections at phone and desktop (8 baselines, on top of 80).
- [ ] **REGENERATE `button-{phone,tablet,desktop}.png`.** Task 7 added an `ariaDisabled` example and note to the dev gallery's button section, which changes that section's rendered height at `threshold: 0`. Nothing regenerated them at the time, deliberately — this task owns baselines and runs last so they do not churn while sections are still being designed. **If this line is skipped the visual gate fails on the next container run**, and it will not surface in Karma or the production build, because the visual suite is excluded from the default run. That exact oversight left M13d's gallery gate red for a whole milestone.
- [ ] **Generate and verify ONLY inside the Linux container:**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh --update-snapshots
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh
```
Never `npx playwright test visual.spec.ts` locally — macOS baselines enforced on Linux is no check at all.

- [ ] **Review the generated PNGs by eye** before trusting them: the right section, fully rendered, real fonts.
- [ ] **Prove one discriminates:** change a section's heading size, re-run `./visual.sh`, confirm it FAILS, revert, confirm it passes. A baseline never seen to fail proves nothing.
- [ ] Commit.

## Task 14: the consistency pass, the docs, the merge

- [ ] **Step 1: The cross-section pass.** The per-section critiques are structurally blind to this. Look at the four together: do the headings cohere, do the four saves read as siblings, does the nav's active state read correctly at both widths? Fix only what appears at that level; do not manufacture changes.
- [ ] **Step 2: Full gate run.** Karma, backend, e2e, axe, visual, production build with zero budget warnings. Record the numbers.
- [ ] **Step 3: Docs.** Update `docs/HANDOFF.md`, `docs/BACKLOG.md` (close the account-area entry and the password-notification entry), `.superpowers/sdd/progress.md`, and rewrite `.superpowers/sdd/NEXT-SESSION.md`.
- [ ] **Step 4: Merge** with `--no-ff` onto `main`, matching the established `merge: M13x — …` message shape, then confirm CI is green.

---

## Self-review

**Spec coverage.** §1 → Task 1 (why). §2 scope → Tasks 5–8 (in), and the out-of-scope list needs no task. §3 routing → Task 3, and the index behaviour → Task 4. §4 access → Task 1. §5 chrome + entry points → Tasks 2 and 3. §6.1–6.4 → Tasks 5, 6, 7, 8. §7 backend → Task 10. §8 design law → Global Constraints. §9 testing → Tasks 11, 12, 13. §10 risks → risk 1 is Task 3 Step 1, risk 2 is Task 9 Step 1, risk 3 is Task 8's banner, risk 4 is Task 13.

**Placeholder scan.** Tasks 6 and 7 describe their tests by shape rather than repeating four near-identical code blocks; each names the exact URL, namespace and assertion required. Task 7's second test and Task 8's third are stated as behaviour with the arrange/assert named. These are the plan's thinnest points — an executor blocked by either should ask rather than guess.

**Type consistency.** `sessionGuard` (Task 1) is consumed by name in Task 3. `AccountLayoutPage`, `AccountIndexPage`, `PasswordPage`, `ChangeEmailPage`, `SessionsPage`, `DangerPage` are the six component names, used identically in their `loadComponent` imports. The area's email section is `/account/change-email` **everywhere it appears** — Task 2's `sections` array, Task 2's spec, and Task 3's route table — because `/account/email` belongs to the unguarded mail landing. An earlier draft of this plan had Task 3 correcting Task 2 after the fact; that was fixed rather than documented, since an executor reading Task 2 alone would otherwise build the wrong link.

---

## Task 15: the structure fixes (added 2026-08-17 after user review)

**The user reviewed the built area and rejected its structure and chrome.** Three defects, all from the orchestrator's design rather than the implementation, all decided with the user after a shape run (`.superpowers/sdd/2026-08-17-m13e-account-area/structure-shape.md`). **The four sections' content, the routes, the guard and the backend are NOT in scope — the objection was to structure and chrome only.**

**Files:**
- Modify: `frontend/src/app/features/account/account-layout.page.ts` + spec
- Modify: `frontend/src/app/ui/button.component.ts` + spec
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`
- Modify: the four section pages, one line each (the submit's `variant`)
- Modify: `e2e/tests/visual.spec.ts-snapshots/` — regenerate

### 15.1 — Phone becomes true list → detail

Today `.wrap` is a column of `.side` (four nav links) then `.content`, so **both are always visible below 720px**. That is the defect: the user sees four labels stacked above the section. The spec's rule — "ONE markup tree, layout switched by CSS" — **cannot express list → detail**, because list → detail needs the nav *absent* once a section is active. That rule is hereby withdrawn for this component.

- Below 720px: when a **section** is active, the nav is not rendered; when the **index** is active, the nav IS the page.
- Drive it from the router (a signal off router events), not from a CSS-only trick — CSS cannot know which child is active.
- **Desktop is untouched**: above 720px the nav and the section are side by side exactly as now.
- The section needs a way back to the menu on phone: a `‹ Account` control in the header. Gesture-only back is not enough for keyboard and screen-reader users.
- **Fix `.s-item.active` while here**: it currently sets `color: var(--bone)`, identical to the inactive colour, so the active row was never distinguishable. Give it a real, token-based distinction.

### 15.2 — "Done" leaves in one press

In-area `routerLink`s push history entries, so `Location.back()` walks back through the sections visited. Add **`[replaceUrl]="true"`** to the in-area nav links so moving between sections *replaces* rather than *pushes*. One press of Done then exits to wherever the user came from.

Keep the existing no-history fallback to the role home.

### 15.3 — Actions stop reading as empty boxes

Every section's submit is `variant="ghost"` — transparent with a `1px var(--hairline)` border, which on this dark ground reads as empty or disabled.

Add a new **`variant="solid"`** to `bh-button`: filled with `var(--surface-2)`, `--bone` text, **no accent colour**. Apply it to the four sections' primary actions. **The zero-volt rule stands and is not being reopened** — this fixes the complaint without spending volt.

- Existing variants must be provably unchanged; `solid` is additive.
- The dev gallery gets the new variant with a one-line note — the gallery is the component contract.

### Steps

- [ ] **1.** Write the failing specs first: the nav is absent below 720px with a section active and present at the index; the active row is visually distinct; the in-area links carry `replaceUrl`; `solid` renders a filled background and the other variants do not.
- [ ] **2.** Run them, watch them fail.
- [ ] **3.** Implement 15.1, 15.2, 15.3.
- [ ] **4.** Karma + `npx ng build --configuration production`.
- [ ] **5.** Negative controls, reported: remove the nav-hiding condition (the phone spec must fail); drop `replaceUrl` (its spec must fail); make `solid` transparent (its spec must fail). Revert each.
- [ ] **6.** e2e — the area's spec must still pass; the phone nav change may move test ids it depends on.
- [ ] **7.** **Regenerate baselines.** 15.1 and 15.3 change every account section's rendering, and 15.3 changes the gallery's button section again. Regenerate the 8 account baselines AND `button-{phone,tablet,desktop}.png`, inside the Linux container via `e2e/visual.sh` only.
- [ ] **8.** Commit.

import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { WordmarkComponent } from '../../ui/wordmark.component';

/**
 * The account area's frame: its own header, its nav, and the outlet the four sections render
 * into. The three shells' navigation is deliberately absent — this is a place you step into and
 * leave, which is what the Done control is for.
 *
 * ONE markup tree; below 720px it becomes true list->detail, driven off the router (CSS alone
 * cannot know which child route is active): the nav is absent once a section is active, present
 * at the index. Above 720px the breakpoint never engages and the nav sits beside the outlet,
 * always, same as before.
 */
@Component({
  selector: 'bh-account-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WordmarkComponent],
  template: `
    <header class="top">
      <bh-wordmark />
      @if (!atIndex()) {
        <a class="back" routerLink="/account" [replaceUrl]="true" data-testid="account-back"
           aria-label="Back to account" i18n-aria-label="@@account.back">‹</a>
      }
      <h1 class="t-h3 title">
        <span class="title-desktop" i18n="@@account.title">Account</span>
        @if (activeSection(); as section) {
          <span class="title-phone">{{ section.label }}</span>
        } @else {
          <span class="title-phone" i18n="@@account.title">Account</span>
        }
      </h1>
      <button type="button" class="done" (click)="done()"
              data-testid="account-done" i18n="@@account.done">Done</button>
    </header>

    <div class="wrap">
      <nav class="side" [class.section-active]="!atIndex()" aria-label="Account" i18n-aria-label="@@account.nav.label">
        @for (s of sections; track s.link) {
          <a class="s-item" [routerLink]="s.link" [replaceUrl]="true" routerLinkActive="active"
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
    /* Phone shows the active section's own name (nothing else on the phone header says it, now
       that the back control is a bare chevron); desktop keeps the constant "Account" — the nav
       is visible there and already names the section. */
    .title-desktop { display: none; }
    .title-phone { display: inline; }
    .back { background: none; border: 0; padding: 0 var(--sp-2); min-height: var(--tap);
      display: inline-flex; align-items: center; font: inherit; color: var(--bone);
      text-decoration: none; }
    .back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .done { background: none; border: 0; padding: 0 var(--sp-2); min-height: var(--tap);
      font: inherit; color: var(--bone); text-decoration: underline; cursor: pointer; }
    .done:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .wrap { max-width: 900px; margin: 0 auto; padding: var(--sp-6) var(--sp-4); display: flex;
      flex-direction: column; gap: var(--sp-6); }
    .side { display: flex; flex-direction: column; }
    .s-item { display: flex; align-items: center; justify-content: space-between;
      min-height: var(--tap); padding: var(--sp-3) 0; color: var(--bone);
      text-decoration: none; border-bottom: 1px solid var(--hairline); }
    .s-item.active { background: var(--surface-2); }
    .content { min-width: 0; }

    /* Phone-only: a real list->detail switch, not a layout reposition. The nav is present (and
       is the whole page) at the index; once a section is active it disappears entirely — a
       display:none element also drops out of the a11y tree, so this doubles as the "not
       rendered" contract for assistive tech, not just a visual one. */
    @media (max-width: 719px) {
      .back { display: inline-flex; }
      .side.section-active { display: none; }
    }

    @media (min-width: 720px) {
      .back { display: none; }
      .title-desktop { display: inline; }
      .title-phone { display: none; }
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

  /** The router's current URL, fed off NavigationEnd rather than a CSS-only rule — CSS cannot
   *  know which child route is active. Everything phone-header-related keys off this one signal
   *  so the section name can never drift out of sync with the nav that owns the label. */
  private currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** True at the bare '/account' index, false once any section is active. */
  atIndex = computed(() => this.currentUrl() === '/account');

  /** The active section, keyed off the same `sections` list the nav renders — not a hand-
   *  maintained parallel list that could drift. Undefined at the index. */
  activeSection = computed(() => this.sections.find(s => s.link === this.currentUrl()));

  /** Overridable in tests; window.history.length is 1 when this tab has no prior entry. */
  hasHistory = () => window.history.length > 1;

  done() {
    if (this.hasHistory()) { this.location.back(); return; }
    // Opened from a pasted URL: back() would leave the tab on a blank page.
    const box = this.auth.activeBox();
    this.router.navigateByUrl(box ? redirectForRole(box.role) : '/auth/login');
  }
}

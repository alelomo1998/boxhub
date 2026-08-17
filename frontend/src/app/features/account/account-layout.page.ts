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

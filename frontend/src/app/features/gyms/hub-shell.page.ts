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
        <nav nav class="hnav" aria-label="Your account, top" i18n-aria-label="@@hub.nav.label">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active"
               [routerLinkActiveOptions]="{ exact: !!t.exact }"
               ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
      </bh-shell-header>

      <main class="content"><router-outlet /></main>

      <!-- Distinct from the header nav's name: two landmarks sharing one accessible name makes
           landmark navigation ambiguous for a screen reader. -->
      <bh-dock [tabs]="tabs" label="Your account, tabs" i18n-label="@@hub.dock.label" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
    .brandlink { display: inline-flex; align-items: center; min-height: var(--tap);
      text-decoration: none; color: var(--bone); }
    .brandlink:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .hnav { display: flex; gap: var(--sp-1); flex: 1; justify-content: center; }
    /* Same type voice as bh-dock's .tlabel below 720px: mono, uppercase, tracked. Two chrome
       navs offering the identical three destinations must not sound like two different apps. */
    .hitem { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-4);
      border-radius: var(--r-full); color: var(--bone-dim); font-family: var(--font-mono);
      font-size: var(--fs-meta); letter-spacing: 0.08em; text-transform: uppercase;
      text-decoration: none; }
    .hitem.active { background: var(--surface-2); color: var(--bone); }
    .hitem:hover:not(.active) { color: var(--bone); }
    .hitem:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .content { flex: 1; display: flex; flex-direction: column; padding: var(--sp-5) var(--sp-6);
      min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(112px + env(safe-area-inset-bottom)); }
    }
  `],
})
export class HubShellPage {
  /* Absolute links, not relative: the Account tab leaves this shell entirely, and mixing
     relative and absolute in one dock is how a tab silently resolves against the wrong parent. */
  tabs: DockTab[] = [
    /* exact: /gyms is a prefix of /gyms/join, so without this both tabs read as active at
       once — in the dock AND in the a11y tree, where two items claimed aria-current="page". */
    { link: '/gyms', label: $localize`:@@hub.tab.gyms:Gyms`, icon: 'house', exact: true },
    { link: '/gyms/join', label: $localize`:@@hub.tab.join:Join`, icon: 'plus' },
    { link: '/account', label: $localize`:@@hub.tab.account:Account`, icon: 'user' },
  ];
}

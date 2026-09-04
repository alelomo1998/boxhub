import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { ButtonComponent } from '../../ui/button.component';
import { IconComponent } from '../../ui/icon.component';
import { BoxSwitcherComponent } from '../gyms/box-switcher.component';
import { MessagesEnvelopeComponent } from '../messaging/messages-envelope.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { ShellChromeService } from '../../core/shell-chrome.service';

/** Coach shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-coach-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    ShellHeaderComponent, DockComponent, ButtonComponent, IconComponent, BoxSwitcherComponent,
    MessagesEnvelopeComponent, NotificationBellComponent,
  ],
  template: `
    <div class="app" [class.locked]="chrome.viewportLocked()">
      <bh-shell-header [customBrand]="true" area="Coach">
        <bh-box-switcher brand />
        <nav nav class="hnav" aria-label="Coach">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
        <bh-messages-envelope actions route="/coach/inbox" testId="coach-messages-link" />
        <bh-notification-bell actions route="/coach/notifications" testId="coach-notifications-link" />
        <a actions routerLink="/account" aria-label="Security" title="Security" data-testid="coach-security-link">
          <bh-icon name="settings" />
        </a>
        <bh-button actions variant="icon" (click)="logout()" label="Log out" title="Log out">
          <bh-icon name="log-out" />
        </bh-button>
      </bh-shell-header>

      <main class="content" [class.no-dock]="chrome.dockHidden()"><router-outlet /></main>

      @if (!chrome.dockHidden()) { <bh-dock [tabs]="tabs" label="Coach" /> }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
    .app.locked { height: 100dvh; overflow: hidden; }
    .app.locked .content { min-height: 0; overflow: hidden; }
    .hnav { display: flex; gap: var(--sp-1); flex: 1; justify-content: center; }
    .hitem { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--sp-4);
      border-radius: var(--r-full); color: var(--bone-dim); font-weight: 600; font-size: 14px;
      text-decoration: none; }
    .hitem.active { background: var(--surface-2); color: var(--bone); }
    .hitem:hover:not(.active) { color: var(--bone); }
    .hitem:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .content { flex: 1; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(112px + env(safe-area-inset-bottom)); }
      .content.no-dock { padding-bottom: var(--sp-4); }
    }
  `],
})
export class CoachShellPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  protected chrome = inject(ShellChromeService);

  // Four, not five: Inbox left the dock when the header envelope arrived in every shell (M29a
  // A1.12.3). The envelope is where unread messages are signalled, so a dock tab to the same place
  // put one meaning in two spots and only the header one carried the count. The /coach/inbox route
  // stays — the envelope is what points at it.
  tabs: DockTab[] = [
    { link: 'classes', label: 'Classes', icon: 'calendar' },
    { link: 'wods', label: 'Build', icon: 'clipboard-list' },
    { link: 'benchmarks', label: 'Bench', icon: 'dumbbell' },
    { link: 'types', label: 'Types', icon: 'layout-grid' },
  ];

  logout() { this.auth.logout().subscribe(() => this.router.navigate(['/auth/login'])); }
}

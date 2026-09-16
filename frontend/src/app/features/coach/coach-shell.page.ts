import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SheetComponent } from '../../ui/sheet.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { BoxSwitcherComponent } from '../gyms/box-switcher.component';
import { MessagesEnvelopeComponent } from '../messaging/messages-envelope.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { ShellChromeService } from '../../core/shell-chrome.service';
// Cross-feature import, deliberate: the profile sheet and HomeService.myProfile() are role-agnostic
// (any signed-in member has an avatar/name/security/notifications), and moving the file would
// touch the athlete shell and its spec for no gain.
import { ProfileSheetComponent } from '../athlete/profile-sheet.component';
import { HomeService } from '../athlete/home.service';

/** Coach shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-coach-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SheetComponent, AvatarComponent,
    ShellHeaderComponent, DockComponent, BoxSwitcherComponent,
    MessagesEnvelopeComponent, NotificationBellComponent, ProfileSheetComponent,
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
        <button actions class="me" (click)="profileOpen.set(true)" aria-label="Your profile">
          <bh-avatar [path]="avatarPath()" [name]="userName" size="sm" />
        </button>
      </bh-shell-header>

      <main class="content" [class.no-dock]="chrome.dockHidden()"><router-outlet /></main>

      @if (!chrome.dockHidden()) { <bh-dock [tabs]="tabs" label="Coach" /> }
    </div>

    <bh-sheet [open]="profileOpen()" title="Profile" label="Your profile" (closed)="profileOpen.set(false)">
      @if (profileOpen()) {
        <bh-profile-sheet notificationsRoute="/coach/notifications/settings" (avatarChanged)="avatarPath.set($event)" (navigated)="profileOpen.set(false)" />
      }
    </bh-sheet>
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
    .me { min-width: var(--tap); min-height: var(--tap); display: grid; place-items: center;
      background: transparent; border: none; border-radius: var(--r-full); cursor: pointer; }
    .me:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .content { flex: 1; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(112px + env(safe-area-inset-bottom)); }
      .content.no-dock { padding-bottom: var(--sp-4); }
    }
  `],
})
export class CoachShellPage implements OnInit {
  private homeSvc = inject(HomeService);
  protected chrome = inject(ShellChromeService);

  profileOpen = signal(false);
  avatarPath = signal<string | null>(null);
  userName = '';

  // Two since M14c-b: Benchmarks became library entries and Types went admin-only. Inbox stays off
  // the dock (Four, not five, M29a A1.12.3) — the header envelope is where unread messages are
  // signalled, so a dock tab to the same place put one meaning in two spots and only the header one
  // carried the count. The /coach/inbox route stays — the envelope is what points at it.
  tabs: DockTab[] = [
    { link: 'classes', label: 'Classes', icon: 'calendar' },
    { link: 'wods', label: 'Library', icon: 'clipboard-list' },
  ];

  ngOnInit() {
    this.homeSvc.myProfile().subscribe({
      next: p => { this.avatarPath.set(p.avatarPath); this.userName = p.name; },
      error: () => {},
    });
  }
}

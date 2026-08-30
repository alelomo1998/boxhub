import { Component, computed, inject, signal, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SheetComponent } from '../../ui/sheet.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { IconComponent } from '../../ui/icon.component';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { ProfileSheetComponent } from './profile-sheet.component';
import { HomeService } from './home.service';
import { BoxSwitcherComponent } from '../gyms/box-switcher.component';
import { MessagingService } from '../messaging/messaging.service';
import { ShellChromeService } from '../../core/shell-chrome.service';

/** Athlete shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-athlete-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SheetComponent, AvatarComponent, IconComponent,
    ShellHeaderComponent, DockComponent, ProfileSheetComponent, BoxSwitcherComponent,
  ],
  template: `
    <div class="app">
      <bh-shell-header [customBrand]="true">
        <bh-box-switcher brand />
        <nav nav class="hnav" aria-label="Athlete">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
        <a actions routerLink="/athlete/messages" class="envelope" data-testid="athlete-messages-link"
           [attr.aria-label]="linkAriaLabel()">
          <bh-icon name="mail" [size]="20" />
          @if (unread() > 0) {
            <span class="badge" aria-hidden="true">{{ badgeLabel() }}</span>
          }
        </a>
        <button actions class="me" (click)="profileOpen.set(true)" aria-label="Your profile">
          <bh-avatar [path]="avatarPath()" [name]="userName" size="sm" />
        </button>
      </bh-shell-header>

      <main class="content" [class.no-dock]="chrome.dockHidden()"><router-outlet /></main>

      @if (!chrome.dockHidden()) { <bh-dock [tabs]="tabs" label="Athlete" /> }
    </div>

    <bh-sheet [open]="profileOpen()" title="Profile" label="Your profile" (closed)="profileOpen.set(false)">
      @if (profileOpen()) { <bh-profile-sheet (avatarChanged)="avatarPath.set($event)" /> }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
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
    /* .envelope inherits its base look (tap size, colour, hover, focus ring) from shell-header's
       ::ng-deep .acts a — it only needs the badge's own positioning here. --bone on --surface-2,
       never --volt: the switcher's mark already spent this shell's volt budget (design law). */
    .envelope { position: relative; }
    .badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px;
      padding: 0 4px; display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--r-full); background: var(--surface-2); border: 1px solid var(--hairline);
      color: var(--bone); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-variant-numeric: tabular-nums; line-height: 1; }
    .content { flex: 1; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(88px + env(safe-area-inset-bottom)); }
      .content.no-dock { padding-bottom: var(--sp-4); }
    }
  `],
})
export class AthleteShellPage implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private homeSvc = inject(HomeService);
  protected messaging = inject(MessagingService);
  protected chrome = inject(ShellChromeService);

  profileOpen = signal(false);
  avatarPath = signal<string | null>(null);
  userName = '';
  unread = this.messaging.unread;

  tabs: DockTab[] = [
    { link: 'home', label: 'Home', icon: 'house' },
    { link: 'book', label: 'Book', icon: 'calendar-plus' },
    { link: 'wod', label: 'WOD', icon: 'clipboard-list' },
    { link: 'progress', label: 'Progress', icon: 'trending-up' },
    { link: 'membership', label: 'Plan', icon: 'credit-card' },
  ];

  // Ambient chrome, not the messages screen itself — 60s here, the screen polls its own thread
  // at 20s while open (M29a Task 8).
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  // Three messages, not an interpolated one. The placeholder name must follow its expression
  // IMMEDIATELY (`${n}:count:`) — written at the end of the string it is not parsed as a
  // placeholder at all and ships as literal text: `$localize` rendered the first draft of this
  // as "5 unread messages:count:", read out verbatim by a screen reader, past both Karma and
  // the production build. Splitting one/other also gives translators a real plural.
  protected linkAriaLabel = computed(() => {
    const n = this.unread();
    if (n === 0) return $localize`:@@messages.link.aria:Messages`;
    if (n === 1) return $localize`:@@messages.link.aria.one:1 unread message`;
    return $localize`:@@messages.link.aria.many:${n}:count: unread messages`;
  });

  protected badgeLabel = computed(() => {
    const n = this.unread();
    return n > 99 ? '99+' : String(n);
  });

  ngOnInit() {
    this.homeSvc.myProfile().subscribe({
      next: p => { this.avatarPath.set(p.avatarPath); this.userName = p.name; },
      error: () => {},
    });
    this.messaging.refreshUnread();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  private startPoll() {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.messaging.refreshUnread(), 60000);
  }

  private stopPoll() {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }
}

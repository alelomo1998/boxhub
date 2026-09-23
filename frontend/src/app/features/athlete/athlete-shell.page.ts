import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SheetComponent } from '../../ui/sheet.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { ProfileSheetComponent } from './profile-sheet.component';
import { HomeService } from './home.service';
import { BoxSwitcherComponent } from '../gyms/box-switcher.component';
import { MessagesEnvelopeComponent } from '../messaging/messages-envelope.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { classTitleVtName } from '../../ui/class-card.component';

/** Athlete shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-athlete-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SheetComponent, AvatarComponent,
    ShellHeaderComponent, DockComponent, ProfileSheetComponent, BoxSwitcherComponent,
    MessagesEnvelopeComponent, NotificationBellComponent,
  ],
  template: `
    <div class="app" [class.locked]="chrome.viewportLocked()">
      <bh-shell-header [customBrand]="true">
        <!-- One wrapper element carries [brand] so the projection slot stays structurally stable;
             the @if/@else lives INSIDE it (CLAUDE.md: never two separately-brand-tagged elements). -->
        <div brand class="brandslot" [class.detail]="chrome.detail()">
          @if (chrome.detail()) {
            <button type="button" class="back" (click)="goBack()"
                    aria-label="Back" i18n-aria-label="@@shell.detail.back">←</button>
            <h1 class="dtitle" [style.view-transition-name]="titleVtName()">{{ chrome.detailTitle() }}</h1>
          } @else {
            <bh-box-switcher />
          }
        </div>
        <nav nav class="hnav" aria-label="Athlete">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
        <bh-messages-envelope actions route="/athlete/messages" testId="athlete-messages-link" />
        <bh-notification-bell actions route="/athlete/notifications" testId="athlete-notifications-link" />
        <button actions class="me" (click)="profileOpen.set(true)" aria-label="Your profile">
          <bh-avatar [path]="avatarPath()" [name]="userName" size="sm" />
        </button>
      </bh-shell-header>

      <main class="content" [class.no-dock]="chrome.dockHidden() || chrome.detail()" [class.detail]="chrome.detail()"><router-outlet /></main>

      @if (!chrome.dockHidden() && !chrome.detail()) { <bh-dock [tabs]="tabs" label="Athlete" /> }
    </div>

    <bh-sheet [open]="profileOpen()" title="Profile" label="Your profile" (closed)="profileOpen.set(false)">
      @if (profileOpen()) {
        <bh-profile-sheet notificationsRoute="/athlete/notifications/settings" (avatarChanged)="avatarPath.set($event)" (navigated)="profileOpen.set(false)" />
      }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
    .app.locked { height: 100dvh; overflow: hidden; }
    .app.locked .content { min-height: 0; overflow: hidden; }
    .brandslot { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
    .brandslot.detail { flex: 1; }
    .back { min-width: var(--tap); min-height: var(--tap); display: grid; place-items: center;
      background: transparent; color: var(--bone); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); cursor: pointer; flex-shrink: 0; }
    .back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* Pinned with the bar it sits in during a nested push/pop: its per-session
       view-transition-name lifts it OUT of the header's own snapshot, so without this it would be
       the one piece of chrome still flying off while everything around it held still. */
    .dtitle { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      view-transition-class: bh-pinned;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; margin: 0; }
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
    .content.detail { padding-left: 0; padding-right: 0; padding-top: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(112px + env(safe-area-inset-bottom)); }
      .content.no-dock { padding-bottom: var(--sp-4); }
      .content.detail { padding-left: 0; padding-right: 0; padding-top: 0; }
    }
  `],
})
export class AthleteShellPage implements OnInit {
  private auth = inject(AuthService);
  private homeSvc = inject(HomeService);
  private router = inject(Router);
  protected chrome = inject(ShellChromeService);

  profileOpen = signal(false);
  avatarPath = signal<string | null>(null);
  userName = '';

  /** The shared-element morph's title half (M17a Task 12b) — same naming convention bh-class-card
   *  derives its own half from, keyed off ShellChromeService.detailMorphKey so this shell never
   *  needs to know a session id itself. */
  protected readonly titleVtName = computed(() => classTitleVtName(this.chrome.detailMorphKey()));

  tabs: DockTab[] = [
    { link: 'home', label: 'Home', icon: 'house' },
    { link: 'book', label: 'Book', icon: 'calendar-plus' },
    { link: 'wod', label: 'WOD', icon: 'clipboard-list' },
    { link: 'progress', label: 'Progress', icon: 'trending-up' },
    { link: 'membership', label: 'Plan', icon: 'credit-card' },
  ];

  ngOnInit() {
    this.homeSvc.myProfile().subscribe({
      next: p => { this.avatarPath.set(p.avatarPath); this.userName = p.name; },
      error: () => {},
    });
  }

  /** Explicit backTo, never history.back() — history.back() can leave the app entirely if the
   *  detail screen was a deep link. */
  protected goBack() {
    this.router.navigateByUrl(this.chrome.backTo() ?? '/athlete/home');
  }
}

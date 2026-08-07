import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SheetComponent } from '../../ui/sheet.component';
import { BRAND_NAME } from '../../core/brand';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { ButtonComponent } from '../../ui/button.component';
import { IconComponent } from '../../ui/icon.component';

/** Admin: SaaS shell on desktop (side nav + top bar), bottom tabs + More sheet on mobile. */
@Component({
  selector: 'bh-admin-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SheetComponent,
    ShellHeaderComponent, DockComponent, ButtonComponent, IconComponent,
  ],
  template: `
    <div class="admin">
      <bh-shell-header class="top" [boxName]="boxName" area="Admin">
        <bh-button actions variant="icon" routerLink="/account/security" label="Security" title="Security" data-testid="admin-security-link">
          <bh-icon name="settings" />
        </bh-button>
        <bh-button actions variant="icon" (click)="logout()" label="Log out" title="Log out">
          <bh-icon name="log-out" />
        </bh-button>
      </bh-shell-header>

      <nav class="side" aria-label="Admin">
        @for (i of nav; track i.link) {
          <a class="s-item" [routerLink]="i.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ i.label }}</a>
        }
      </nav>

      <main class="content">
        @if (auth.activeBoxStatus() === 'PENDING') {
          <div class="pending-banner" role="status" data-testid="pending-banner">
            <strong>Waiting for approval</strong> — set up your box now; invites and TVs unlock when it's approved.
          </div>
        }
        <router-outlet />
      </main>

      <bh-dock [tabs]="mobileTabs" label="Admin">
        <button (click)="moreOpen.set(true)">
          <bh-icon name="ellipsis" [size]="20" />
          <span class="tlabel">More</span>
        </button>
      </bh-dock>
    </div>

    <bh-sheet [open]="moreOpen()" title="More" label="More admin pages" (closed)="moreOpen.set(false)">
      <div class="more">
        @for (i of moreLinks; track i.link) {
          <a class="m-item" [routerLink]="i.link" (click)="moreOpen.set(false)">{{ i.label }}</a>
        }
        <button class="m-item asbtn" (click)="logout()">Log out</button>
      </div>
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .admin { display: grid; grid-template-columns: 210px 1fr; grid-template-rows: auto 1fr;
      grid-template-areas: "top top" "side content"; min-height: 100dvh; }
    /* bh-shell-header is the direct grid child here (admin is the one shell that's a grid, not a
       flex column), so IT — not its inner <header> — needs the area assignment or CSS Grid
       auto-places it into a single 210px-wide cell instead of spanning the full top row. */
    .top { grid-area: top; }

    .side { grid-area: side; border-right: 1px solid var(--hairline); padding: var(--sp-5) var(--sp-4);
      display: flex; flex-direction: column; gap: 3px; }
    .s-item { display: flex; align-items: center; min-height: var(--tap); padding: 0 12px;
      border-radius: var(--edge); color: var(--bone-dim); font-size: 14px; font-weight: 500; }
    .s-item.active { background: var(--surface-2); color: var(--bone); }
    .s-item:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .content { grid-area: content; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    .tabs { display: none; }

    .pending-banner { background: var(--surface-2); border: 1px solid var(--warn); border-radius: var(--r-card);
      padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-4); color: var(--bone); font-size: var(--fs-sm); }
    .pending-banner strong { color: var(--warn); }

    .more { display: flex; flex-direction: column; }
    .m-item { display: flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-2);
      color: var(--bone); text-decoration: none; border-bottom: 1px solid var(--hairline);
      font-size: var(--fs-body); }
    .m-item:last-child { border-bottom: none; }
    .m-item:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .asbtn { background: none; border-left: none; border-right: none; border-top: 1px solid var(--hairline);
      width: 100%; text-align: left; cursor: pointer; font: inherit; }

    @media (max-width: 719px) {
      .admin { grid-template-columns: 1fr; grid-template-areas: "top" "content"; grid-template-rows: auto 1fr; }
      .side { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(88px + env(safe-area-inset-bottom)); }
    }
  `],
})
export class AdminShellPage {
  auth = inject(AuthService);
  private router = inject(Router);
  boxName = this.auth.activeBox()?.boxName || BRAND_NAME;
  moreOpen = signal(false);

  logout() { this.auth.logout().subscribe(() => this.router.navigate(['/auth/login'])); }

  nav = [
    { link: 'dashboard', label: 'Dashboard' },
    { link: 'members', label: 'Members' },
    { link: 'schedule', label: 'Schedule' },
    { link: 'invites', label: 'Invites' },
    { link: 'plans', label: 'Plans' },
    { link: 'subscriptions', label: 'Payments' },
    { link: 'stripe', label: 'Stripe' },
    { link: 'movements', label: 'Movements' },
    { link: 'tvs', label: 'TVs' },
    { link: 'settings', label: 'Settings' },
  ];
  mobileTabs: DockTab[] = [
    { link: 'dashboard', label: 'Home', icon: 'house' },
    { link: 'members', label: 'Members', icon: 'users' },
    { link: 'schedule', label: 'Schedule', icon: 'calendar' },
  ];
  moreLinks = [
    { link: 'invites', label: 'Invites' },
    { link: 'plans', label: 'Plans' },
    { link: 'subscriptions', label: 'Payments' },
    { link: 'stripe', label: 'Stripe' },
    { link: 'movements', label: 'Movements' },
    { link: 'tvs', label: 'TVs' },
    { link: 'settings', label: 'Settings' },
    { link: '/account/security', label: 'Security' },
  ];
}

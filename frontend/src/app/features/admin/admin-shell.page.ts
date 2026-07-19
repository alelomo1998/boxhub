import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { SheetComponent } from '../../ui/sheet.component';

/** Admin: SaaS shell on desktop (side nav + top bar), bottom tabs + More sheet on mobile. */
@Component({
  selector: 'bh-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SheetComponent],
  template: `
    <div class="admin">
      <header class="top">
        <div class="brand"><span class="mark">B</span><span class="bn">{{ boxName }}</span></div>
        <span class="area">Admin</span>
        <button class="theme" (click)="theme.toggle()" aria-label="Toggle theme">◐</button>
        <a class="theme" routerLink="/account/security" aria-label="Security" title="Security" data-testid="admin-security-link">⚙</a>
        <button class="theme" (click)="logout()" aria-label="Log out" title="Log out">⎋</button>
      </header>

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

      <nav class="bh-dock" aria-label="Admin">
        @for (i of mobileTabs; track i.link) {
          <a class="bh-dock-item" [routerLink]="i.link" routerLinkActive="active" ariaCurrentWhenActive="page">
            <span class="glyph" aria-hidden="true">{{ i.glyph }}</span>
            <span class="tlabel">{{ i.label }}</span>
          </a>
        }
        <button class="bh-dock-item" (click)="moreOpen.set(true)">
          <span class="glyph" aria-hidden="true">⋯</span>
          <span class="tlabel">More</span>
        </button>
      </nav>
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
  styles: [`
    .admin { display: grid; grid-template-columns: 210px 1fr; grid-template-rows: auto 1fr;
      grid-template-areas: "top top" "side content"; min-height: 100dvh; }
    .top { grid-area: top; display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-5); border-bottom: 1px solid var(--hairline); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mark { width: 30px; height: 30px; border-radius: var(--edge); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 17px;
      flex-shrink: 0; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: 17px; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .area { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); flex: 1; }
    .theme { min-width: var(--tap); min-height: var(--tap); display: inline-flex; align-items: center;
      justify-content: center; font-size: 16px; color: var(--faint); text-decoration: none;
      background: transparent; border: none; border-radius: var(--edge); cursor: pointer; }
    .theme:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .side { grid-area: side; border-right: 1px solid var(--hairline); padding: var(--sp-5) var(--sp-4);
      display: flex; flex-direction: column; gap: 3px; }
    .s-item { display: flex; align-items: center; min-height: var(--tap); padding: 0 12px;
      border-radius: var(--edge); color: var(--bone-dim); font-size: 14px; font-weight: 500; }
    .s-item.active { background: var(--surface-2); color: var(--bone); }
    .s-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

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
    .m-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
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
  theme = inject(ThemeService);
  auth = inject(AuthService);
  private router = inject(Router);
  boxName = this.auth.activeBox()?.boxName || 'BoxHub';
  moreOpen = signal(false);

  logout() { this.auth.logout().subscribe(() => this.router.navigate(['/auth/login'])); }

  nav = [
    { link: 'dashboard', label: 'Dashboard' },
    { link: 'members', label: 'Members' },
    { link: 'schedule', label: 'Schedule' },
    { link: 'invites', label: 'Invites' },
    { link: 'plans', label: 'Plans' },
    { link: 'movements', label: 'Movements' },
    { link: 'tvs', label: 'TVs' },
    { link: 'settings', label: 'Settings' },
  ];
  mobileTabs = [
    { link: 'dashboard', label: 'Home', glyph: '▮▮' },
    { link: 'members', label: 'Members', glyph: '◉' },
    { link: 'schedule', label: 'Schedule', glyph: '＋' },
  ];
  moreLinks = [
    { link: 'invites', label: 'Invites' },
    { link: 'plans', label: 'Plans' },
    { link: 'movements', label: 'Movements' },
    { link: 'tvs', label: 'TVs' },
    { link: 'settings', label: 'Settings' },
    { link: '/account/security', label: 'Security' },
  ];
}

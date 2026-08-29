import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { ButtonComponent } from '../../ui/button.component';
import { IconComponent } from '../../ui/icon.component';
import { BoxSwitcherComponent } from '../gyms/box-switcher.component';

/** Coach shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-coach-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    ShellHeaderComponent, DockComponent, ButtonComponent, IconComponent, BoxSwitcherComponent,
  ],
  template: `
    <div class="app">
      <bh-shell-header [customBrand]="true" area="Coach">
        <bh-box-switcher brand />
        <nav nav class="hnav" aria-label="Coach">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
        <a actions routerLink="/account" aria-label="Security" title="Security" data-testid="coach-security-link">
          <bh-icon name="settings" />
        </a>
        <bh-button actions variant="icon" (click)="logout()" label="Log out" title="Log out">
          <bh-icon name="log-out" />
        </bh-button>
      </bh-shell-header>

      <main class="content"><router-outlet /></main>

      <bh-dock [tabs]="tabs" label="Coach" />
    </div>
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
    .content { flex: 1; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    @media (max-width: 719px) {
      .hnav { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(88px + env(safe-area-inset-bottom)); }
    }
  `],
})
export class CoachShellPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  tabs: DockTab[] = [
    { link: 'classes', label: 'Classes', icon: 'calendar' },
    { link: 'wods', label: 'Build', icon: 'clipboard-list' },
    { link: 'benchmarks', label: 'Bench', icon: 'dumbbell' },
    { link: 'types', label: 'Types', icon: 'layout-grid' },
    { link: 'inbox', label: 'Inbox', icon: 'mail' },
  ];

  logout() { this.auth.logout().subscribe(() => this.router.navigate(['/auth/login'])); }
}

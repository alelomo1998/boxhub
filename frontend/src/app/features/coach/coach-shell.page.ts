import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BRAND_NAME } from '../../core/brand';

/** Coach shell: header nav on desktop, floating pill dock on mobile. */
@Component({
  selector: 'bh-coach-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <header class="top">
        <div class="brand"><span class="mark">B</span><span class="bn">{{ boxName }} · Coach</span></div>
        <nav class="hnav" aria-label="Coach">
          @for (t of tabs; track t.link) {
            <a class="hitem" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">{{ t.label }}</a>
          }
        </nav>
        <div class="acts">
          <a class="iconbtn" routerLink="/account/security" aria-label="Security" title="Security" data-testid="coach-security-link">⚙</a>
          <button class="iconbtn" (click)="logout()" aria-label="Log out" title="Log out">⎋</button>
        </div>
      </header>

      <main class="content"><router-outlet /></main>

      <nav class="bh-dock" aria-label="Coach">
        @for (t of tabs; track t.link) {
          <a class="bh-dock-item" [routerLink]="t.link" routerLinkActive="active" ariaCurrentWhenActive="page">
            <span class="glyph" aria-hidden="true">{{ t.glyph }}</span>
            <span class="tlabel">{{ t.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .app { display: flex; flex-direction: column; min-height: 100dvh; }
    .top { display: flex; align-items: center; gap: var(--sp-5); padding: var(--sp-2) var(--sp-5);
      border-bottom: 1px solid var(--hairline); position: sticky; top: 0; z-index: 20;
      background: var(--ground); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 17px;
      flex-shrink: 0; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: 17px; text-transform: uppercase;
      letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hnav { display: flex; gap: var(--sp-1); flex: 1; justify-content: center; }
    .hitem { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--sp-4);
      border-radius: var(--r-full); color: var(--bone-dim); font-weight: 600; font-size: 14px;
      text-decoration: none; }
    .hitem.active { background: var(--surface-2); color: var(--bone); }
    .hitem:hover:not(.active) { color: var(--bone); }
    .hitem:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .acts { display: flex; gap: 2px; margin-left: auto; }
    .iconbtn { min-width: var(--tap); min-height: var(--tap); display: inline-flex; align-items: center;
      justify-content: center; font-size: 16px; color: var(--faint); text-decoration: none;
      background: transparent; border: none; border-radius: var(--r-full); cursor: pointer; }
    .iconbtn:hover { color: var(--bone); }
    .iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
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
  boxName = this.auth.activeBox()?.boxName || BRAND_NAME;

  tabs = [
    { link: 'classes', label: 'Classes', glyph: '▮▮' },
    { link: 'wods', label: 'Build', glyph: '＋' },
    { link: 'benchmarks', label: 'Bench', glyph: '◎' },
    { link: 'types', label: 'Types', glyph: '⌘' },
  ];

  logout() { this.auth.logout().subscribe(() => this.router.navigate(['/auth/login'])); }
}

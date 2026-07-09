import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RailComponent, NavItemComponent } from '../../ui/rail.component';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'bh-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RailComponent, NavItemComponent],
  template: `
    <div class="admin">
      <bh-rail>
        <div class="brand"><span class="mark">B</span><span class="bn">BoxHub</span></div>
        <bh-nav-item label="Members" link="members" />
        <bh-nav-item label="Invites" link="invites" />
        <bh-nav-item label="Plans" link="plans" />
        <bh-nav-item label="Settings" link="settings" />
        <button class="theme" (click)="theme.toggle()">◐ theme</button>
      </bh-rail>
      <main class="content"><router-outlet /></main>
    </div>
  `,
  styles: [`
    .admin { display: grid; grid-template-columns: 210px 1fr; min-height: 100vh; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: var(--sp-6); padding: 0 4px; }
    .mark { width: 32px; height: 32px; border-radius: var(--edge); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 19px; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: 18px; text-transform: uppercase; letter-spacing: 0.02em; }
    .theme { margin-top: auto; font-family: var(--font-mono); font-size: 12px; color: var(--faint);
      background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge); padding: 7px 10px; cursor: pointer; }
    .content { padding: var(--sp-6) var(--sp-8); min-width: 0; }
    @media (max-width: 720px) { .admin { grid-template-columns: 1fr; } .theme { margin: 0; } }
  `],
})
export class AdminShellPage {
  theme = inject(ThemeService);
}

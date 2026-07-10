import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'bh-athlete-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <header class="top">
        <div class="brand"><span class="mark">B</span><span class="bn">BoxHub</span></div>
        <button class="theme" (click)="theme.toggle()" aria-label="Toggle theme">◐</button>
      </header>

      <nav class="rail" aria-label="Athlete">
        @for (t of tabs; track t.link) {
          <a class="ritem" [routerLink]="t.link" routerLinkActive="active">{{ t.label }}</a>
        }
      </nav>

      <main class="content"><router-outlet /></main>

      <nav class="tabs" aria-label="Athlete">
        @for (t of tabs; track t.link) {
          <a class="tab" [routerLink]="t.link" routerLinkActive="active">
            <span class="glyph" aria-hidden="true">{{ t.glyph }}</span>
            <span class="tlabel">{{ t.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    .app { display: grid; grid-template-columns: 200px 1fr; grid-template-rows: auto 1fr;
      grid-template-areas: "top top" "rail content"; min-height: 100dvh; }
    .top { grid-area: top; display: flex; align-items: center; justify-content: space-between;
      padding: var(--sp-3) var(--sp-5); border-bottom: 1px solid var(--hairline); }
    .brand { display: flex; align-items: center; gap: 10px; }
    .mark { width: 30px; height: 30px; border-radius: var(--edge); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 17px; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: 17px; text-transform: uppercase; letter-spacing: 0.02em; }
    .theme { min-width: var(--tap); min-height: var(--tap); font-size: 16px; color: var(--faint);
      background: transparent; border: none; border-radius: var(--edge); cursor: pointer; }
    .theme:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .rail { grid-area: rail; border-right: 1px solid var(--hairline); padding: var(--sp-5) var(--sp-4);
      display: flex; flex-direction: column; gap: 3px; }
    .ritem { display: flex; align-items: center; min-height: var(--tap); padding: 0 12px; border-radius: var(--edge);
      color: var(--bone-dim); font-size: 14px; font-weight: 500; }
    .ritem.active { background: var(--surface-2); color: var(--bone); }
    .ritem:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .content { grid-area: content; padding: var(--sp-5) var(--sp-6); min-width: 0; }
    .tabs { display: none; }

    @media (max-width: 719px) {
      .app { grid-template-columns: 1fr; grid-template-areas: "top" "content"; grid-template-rows: auto 1fr; }
      .rail { display: none; }
      .content { padding: var(--sp-4) var(--sp-4) calc(72px + env(safe-area-inset-bottom)); }
      .tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: grid;
        grid-template-columns: repeat(3, 1fr); background: var(--surface);
        border-top: 1px solid var(--hairline); padding-bottom: env(safe-area-inset-bottom); }
      .tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        min-height: 56px; color: var(--bone-dim); text-decoration: none; }
      .tab .glyph { font-size: 17px; line-height: 1; }
      .tab .tlabel { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
      .tab.active { color: var(--bone); }
      .tab.active .glyph { color: var(--red); }
      .tab:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--red-glow); }
    }
  `],
})
export class AthleteShellPage {
  theme = inject(ThemeService);
  tabs = [
    { link: 'today', label: 'Today', glyph: '▮▮' },
    { link: 'book', label: 'Book', glyph: '＋' },
    { link: 'progress', label: 'Progress', glyph: '▲' },
  ];
}

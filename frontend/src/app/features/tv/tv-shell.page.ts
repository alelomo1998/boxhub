import { Component } from '@angular/core';

@Component({
  selector: 'bh-tv-shell',
  standalone: true,
  template: `
    <main class="soon">
      <p class="t-eyebrow">Big screen</p>
      <h1 class="t-display">The board</h1>
      <p class="muted">Pairing, the live WOD, timer and leaderboard land here soon.</p>
    </main>`,
  styles: [`
    .soon { min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
      gap: var(--sp-2); padding: var(--sp-8); }
    .t-display { font-size: clamp(40px, 8vw, 72px); margin: 0; }
    .muted { color: var(--bone-dim); font-size: 16px; max-width: 48ch; }
  `],
})
export class TvShellPage {}

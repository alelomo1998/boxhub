import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-board-row',
  standalone: true,
  template: `
    <div class="row" [class.lead]="lead">
      <span class="rank">{{ rank }}</span>
      <span class="nm">{{ name }}@if (rx) { <span class="rx">RX</span> }</span>
      <span class="sc">{{ score }}</span>
    </div>`,
  styles: [`
    .row { display: flex; align-items: center; gap: 14px; padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .rank { font-family: var(--font-display); font-weight: 800; font-size: 22px; width: 30px;
      color: var(--faint); font-variant-numeric: tabular-nums; }
    .lead .rank { color: var(--red); }
    .nm { flex: 1; font-family: var(--font-display); font-weight: 800; text-transform: uppercase;
      font-size: 20px; letter-spacing: -0.01em; }
    .rx { font-family: var(--font-mono); font-size: 10px; color: var(--red);
      border: 1px solid color-mix(in srgb, var(--red) 45%, transparent); border-radius: 3px; padding: 1px 5px; margin-left: 8px; }
    .sc { font-family: var(--font-body); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 20px; }
  `],
})
export class BoardRowComponent {
  @Input() rank: number | string = '';
  @Input() name = '';
  @Input() score = '';
  @Input() rx = false;
  @Input() lead = false;
}

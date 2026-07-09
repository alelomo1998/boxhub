import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-stat',
  standalone: true,
  template: `
    <div class="stat">
      <span class="k">{{ label }}</span>
      <span class="v" [class.accent]="accent">{{ value }}@if (unit) { <span class="u">{{ unit }}</span> }</span>
    </div>`,
  styles: [`
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
    .v { font-family: var(--font-body); font-weight: 700; font-variant-numeric: tabular-nums;
      font-size: 46px; line-height: 1; letter-spacing: -0.01em; color: var(--bone); }
    .v.accent { color: var(--red); }
    .u { font-size: 15px; color: var(--bone-dim); font-weight: 500; }
  `],
})
export class StatComponent {
  @Input() label = '';
  @Input() value = '';
  @Input() unit?: string;
  @Input() accent = false;
}

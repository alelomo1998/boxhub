import { Component, Input, computed, signal, ChangeDetectionStrategy } from '@angular/core';

export interface ChartPoint { date: string; load: number; }

@Component({
  selector: 'bh-progression-chart',
  standalone: true,
  template: `
    @if (pts().length >= 1) {
      <svg class="chart" [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img"
           [attr.aria-label]="'Load progression: ' + pts().length + ' entries, best ' + maxLoad()">
        <line [attr.x1]="PAD" [attr.y1]="H - PAD" [attr.x2]="W - PAD" [attr.y2]="H - PAD" class="axis" />
        <line [attr.x1]="PAD" [attr.y1]="PAD" [attr.x2]="PAD" [attr.y2]="H - PAD" class="axis" />
        @if (pts().length >= 2) { <polyline [attr.points]="polyline()" class="ln" /> }
        @for (p of coords(); track $index) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" class="dot" /> }
        <text [attr.x]="PAD" [attr.y]="H - 4" class="lab">{{ minLoad() }}</text>
        <text [attr.x]="PAD" [attr.y]="14" class="lab">{{ maxLoad() }}</text>
      </svg>
    } @else { <p class="none">No data yet — log a lift to see progression.</p> }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .chart { width: 100%; height: auto; max-height: 220px; }
    .axis { stroke: var(--hairline); stroke-width: 1; }
    .ln { fill: none; stroke: var(--volt); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dot { fill: var(--volt); }
    .lab { fill: var(--faint); font-family: var(--font-mono); font-size: 10px; }
    .none { color: var(--bone-dim); font-size: 13px; }
  `],
})
export class ProgressionChartComponent {
  readonly W = 600; readonly H = 200; readonly PAD = 28;

  private _pts = signal<ChartPoint[]>([]);
  @Input() set points(v: ChartPoint[]) { this._pts.set(v ?? []); }
  pts = computed(() => this._pts());

  minLoad = computed(() => this.pts().length ? Math.min(...this.pts().map(p => p.load)) : 0);
  maxLoad = computed(() => this.pts().length ? Math.max(...this.pts().map(p => p.load)) : 0);

  coords = computed(() => {
    const p = this.pts();
    if (!p.length) return [] as { x: number; y: number }[];
    const min = this.minLoad(), max = this.maxLoad();
    const span = max - min || 1;
    const innerW = this.W - 2 * this.PAD, innerH = this.H - 2 * this.PAD;
    return p.map((pt, i) => ({
      x: this.PAD + (p.length === 1 ? innerW / 2 : (innerW * i) / (p.length - 1)),
      y: this.PAD + innerH - (innerH * (pt.load - min)) / span,
    }));
  });

  polyline = computed(() => this.coords().map(c => `${c.x},${c.y}`).join(' '));
}

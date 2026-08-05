import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';

/** Day pager: ‹ Weekday d Month ›. Offset is days from today, clamped to [0, max]. */
@Component({
  selector: 'bh-day-pager',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="pager">
      <button class="pg" (click)="shift(-1)" [disabled]="offset === 0" aria-label="Previous day">‹</button>
      <span class="pg-date" aria-live="polite">{{ day() | date:'EEEE d MMMM' }}</span>
      <button class="pg" (click)="shift(1)" [disabled]="offset >= max" aria-label="Next day">›</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .pager { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-3);
      margin-bottom: var(--sp-4); }
    .pg { min-width: var(--tap); min-height: var(--tap); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-full); font-size: 20px; cursor: pointer; }
    .pg:disabled { opacity: 0.35; cursor: default; }
    .pg:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .pg-date { text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); text-transform: uppercase; }
  `],
})
export class DayPagerComponent {
  @Input() offset = 0;
  @Input() max = 13;
  @Output() offsetChange = new EventEmitter<number>();

  day(): Date { const d = new Date(); d.setDate(d.getDate() + this.offset); return d; }

  shift(dir: number) {
    const next = Math.min(this.max, Math.max(0, this.offset + dir));
    if (next !== this.offset) { this.offset = next; this.offsetChange.emit(next); }
  }
}

import { Component, model, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from './icon.component';

/** Day pager: ‹ Weekday d Month ›. Offset is days from today, clamped to [0, max]. */
@Component({
  selector: 'bh-day-pager',
  standalone: true,
  imports: [DatePipe, IconComponent],
  template: `
    <div class="pager">
      <button class="pg" (click)="shift(-1)" [disabled]="offset() === 0"
              aria-label="Previous day" i18n-aria-label="@@ui.dayPager.prev">
        <bh-icon name="chevron-left" />
      </button>
      <span class="pg-date" aria-live="polite">{{ day() | date:'EEEE d MMMM' }}</span>
      <button class="pg" (click)="shift(1)" [disabled]="offset() >= max()"
              aria-label="Next day" i18n-aria-label="@@ui.dayPager.next">
        <bh-icon name="chevron-right" />
      </button>
    </div>
  `,
  styles: [`
    .pager { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-3);
      margin-bottom: var(--sp-4); }
    .pg { display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--tap); min-height: var(--tap); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-full); cursor: pointer; }
    .pg:disabled { opacity: 0.35; cursor: default; }
    .pg:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .pg-date { text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); text-transform: uppercase; }
  `],
})
export class DayPagerComponent {
  offset = model(0);
  max = input(13);

  day(): Date { const d = new Date(); d.setDate(d.getDate() + this.offset()); return d; }

  shift(dir: number) {
    const next = Math.min(this.max(), Math.max(0, this.offset() + dir));
    if (next !== this.offset()) { this.offset.set(next); }
  }
}

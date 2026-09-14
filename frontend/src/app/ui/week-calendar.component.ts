import { Component, LOCALE_ID, computed, inject, input, model } from '@angular/core';
import { formatDate } from '@angular/common';
import { IconComponent } from './icon.component';

export type DayTone = 'open' | 'full' | 'none';

export interface WeekDay {
  date: Date;
  /** Days from today. Negative is in the past. */
  offset: number;
  /** Local calendar date, 'YYYY-MM-DD'. */
  iso: string;
  tone: DayTone;
  selectable: boolean;
}

function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }

/**
 * Local calendar date. NOT toISOString(), which converts to UTC and therefore reports the
 * PREVIOUS day for any local time before the UTC offset — the whole strip would key its dots one
 * day out for every box west of Greenwich.
 */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Week strip: a Monday-first calendar week with one availability dot per day, above whatever the
 * screen projects as that day's list.
 *
 * Replaces the single-day pager it supersedes, which could only step one day at a time. Three ways
 * to move, because the filed complaint named three separate failures: the chevrons page a WEEK (and
 * sit inside the strip, in the thumb zone), a swipe pages a DAY, and tapping a day jumps straight to
 * it — so reaching any class in the horizon is one tap rather than up to thirteen.
 *
 * `offset` keeps the superseded pager's contract exactly, which is what made the consumer swaps
 * mechanical.
 */
@Component({
  selector: 'bh-week-calendar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="strip" (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp($event)"
         (keydown)="onKeydown($event)">
      <div class="hd">
        <button type="button" class="pg" (click)="shiftWeek(-1)" [disabled]="!canPrev()"
                aria-label="Previous week" i18n-aria-label="@@ui.weekCalendar.prevWeek">
          <bh-icon name="chevron-left" />
        </button>
        <span class="mon">{{ monthLabel() }}</span>
        <button type="button" class="pg" (click)="shiftWeek(1)" [disabled]="!canNext()"
                aria-label="Next week" i18n-aria-label="@@ui.weekCalendar.nextWeek">
          <bh-icon name="chevron-right" />
        </button>
      </div>
      <div class="days">
        @for (d of week(); track d.iso) {
          <button type="button" class="day" [class.sel]="d.offset === offset()"
                  [disabled]="!d.selectable" [attr.aria-label]="dayLabel(d)"
                  [attr.aria-current]="d.offset === offset() ? 'date' : null"
                  [attr.data-testid]="'day-' + d.iso" (click)="select(d)">
            <span class="dow">{{ dowLabel(d) }}</span>
            <span class="dnum num">{{ d.date.getDate() }}</span>
            <span class="dot" [class.open]="d.tone === 'open'" [class.full]="d.tone === 'full'"
                  aria-hidden="true"></span>
          </button>
        }
      </div>
      <!-- The live region carries the SELECTED DAY, not the month: the month label only changes at
           a month boundary, so announcing it would say nothing for six days out of seven. This is
           the announcement the superseded pager made on every change, and the strip owes the same. -->
      <span class="sr" aria-live="polite">{{ dayLabel(selectedDay()) }}</span>
    </div>
    <ng-content />
  `,
  styles: [`
    .strip { margin-bottom: var(--sp-4); touch-action: pan-y; }
    .hd { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-2);
      margin-bottom: var(--sp-2); }
    .pg { display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--tap); min-height: var(--tap); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-full); cursor: pointer; }
    .pg:disabled { opacity: 0.35; cursor: default; }
    .pg:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .mon { text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); text-transform: uppercase; }
    .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--sp-1); }
    .day { display: flex; flex-direction: column; align-items: center; gap: 3px;
      min-height: var(--tap); padding: var(--sp-2) 0; background: transparent; color: var(--bone);
      border: 1px solid transparent; border-radius: var(--edge); cursor: pointer; }
    .day:hover:not(:disabled) { background: var(--surface); }
    .day:disabled { opacity: 0.3; cursor: default; }
    .day:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .day.sel { background: var(--surface-2); border-color: var(--hairline); }
    /* --faint is 5.07:1 on --ground and passes, but the SELECTED cell paints --surface-2 behind
       it, which drops the same token to 4.27:1 — under AA for this 11px label. The weekday letter
       is the one piece of text whose background changes with state, so it is the one that has to
       be re-checked against that state rather than against the page. --bone-dim is 7.17:1 there,
       and reads as emphasis on the selected day, which is what selection should look like anyway. */
    .day.sel .dow { color: var(--bone-dim); }
    .dow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    .dnum { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body); }
    .num { font-variant-numeric: tabular-nums; }
    /* Tone is carried by SHAPE, never by hue alone: filled = open, hollow ring = full,
       flat tick = none. The aria-label states it in words, so the strip is usable without
       seeing a dot at all. Not volt: the shell's box switcher already spends the volt budget,
       and a dot answers "is there room", not "live / now". */
    .dot { width: 6px; height: 6px; border-radius: var(--r-full); background: transparent;
      border: 1px solid transparent; box-sizing: border-box; }
    .dot.open { background: var(--bone); }
    .dot.full { border-color: var(--faint); }
    .dot:not(.open):not(.full) { width: 6px; height: 2px; border-radius: 0; background: var(--faint); }
    /* Same visually-hidden pattern as bh-wordmark's .sr — announced, never rendered. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class WeekCalendarComponent {
  private locale = inject(LOCALE_ID);

  offset = model(0);
  /** Inclusive upper bound. 13 = a 2-week horizon, matching Box.bookingHorizonWeeks's default of 2. */
  max = input(13);
  /** Inclusive lower bound, may be negative to open past days. Default 0 keeps every current
   *  consumer (booking, schedule, classes) identical. */
  min = input(0);
  /** Keyed by local ISO date ('YYYY-MM-DD'). An absent key means 'none'. */
  tones = input<Record<string, DayTone>>({});

  private swiped = false;
  private downX = 0;
  private downY = 0;

  readonly today = computed(() => startOfDay(new Date()));

  readonly selected = computed(() => {
    const d = new Date(this.today());
    d.setDate(d.getDate() + this.offset());
    return d;
  });

  readonly week = computed<WeekDay[]>(() => {
    const sel = this.selected();
    const today = this.today();
    const tones = this.tones();
    const max = this.max();
    const min = this.min();
    const mondayIdx = (sel.getDay() + 6) % 7;         // JS Sunday=0 -> Monday-first index
    const start = new Date(sel);
    start.setDate(start.getDate() - mondayIdx);

    const out: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      // Math.round, not a plain divide: both ends are local midnight, so a DST boundary between
      // them makes the difference 23 or 25 hours and a truncating divide lands one day out.
      const offset = Math.round((date.getTime() - today.getTime()) / 864e5);
      const iso = isoOf(date);
      out.push({ date, offset, iso, tone: tones[iso] ?? 'none', selectable: offset >= min && offset <= max });
    }
    return out;
  });

  /** Always present: week() is built around the selected day by construction. */
  readonly selectedDay = computed<WeekDay>(() => this.week().find(d => d.offset === this.offset())!);

  readonly canPrev = computed(() => this.week()[0].offset > this.min());
  readonly canNext = computed(() => this.week()[6].offset < this.max());

  monthLabel(): string { return formatDate(this.selected(), 'LLLL y', this.locale); }
  dowLabel(d: WeekDay): string { return formatDate(d.date, 'EEEEE', this.locale); }

  dayLabel(d: WeekDay): string {
    return `${formatDate(d.date, 'EEEE d MMMM', this.locale)}, ${this.toneWord(d.tone)}`;
  }

  private toneWord(t: DayTone): string {
    if (t === 'open') return $localize`:@@ui.weekCalendar.tone.open:classes available`;
    if (t === 'full') return $localize`:@@ui.weekCalendar.tone.full:classes full`;
    return $localize`:@@ui.weekCalendar.tone.none:no classes`;
  }

  select(d: WeekDay) {
    // The browser fires a click at the end of a swipe that happens to finish over a day button.
    // Without this the swipe would page a day AND then jump to whatever it landed on.
    if (this.swiped) return;
    if (!d.selectable) return;                        // the guard lives here, not only on [disabled]
    if (d.offset !== this.offset()) this.offset.set(d.offset);
  }

  shiftDay(dir: number) {
    const next = Math.min(this.max(), Math.max(this.min(), this.offset() + dir));
    if (next !== this.offset()) this.offset.set(next);
  }

  /**
   * Paging a week lands on that week's MONDAY, not on the same weekday seven days away
   * (user-ruled 2026-09-06): pressing "next week" from a Wednesday should open the next week,
   * not hop Wednesday-to-Wednesday. week()[0] IS that week's Monday by construction.
   *
   * Clamped into [min, max]. Backwards the clamp bites often and correctly when min is the
   * default 0 — the target Monday is usually before today, and today is then the earliest
   * selectable day of that same week. Forwards it never bites: canNext() already requires
   * week()[6].offset < max(), so the next Monday is at most max.
   */
  shiftWeek(dir: number) {
    const next = Math.min(this.max(), Math.max(this.min(), this.week()[0].offset + dir * 7));
    if (next !== this.offset()) this.offset.set(next);
  }

  onPointerDown(e: PointerEvent) {
    this.swiped = false;                              // reset here, so a swipe that ends off a
    this.downX = e.clientX;                           // button cannot poison the next real tap
    this.downY = e.clientY;
  }

  onPointerUp(e: PointerEvent) {
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    // Horizontal intent only, so scrolling the day list vertically never pages the strip.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      this.swiped = true;
      this.shiftDay(dx < 0 ? 1 : -1);
    }
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') { this.shiftDay(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { this.shiftDay(1); e.preventDefault(); }
  }
}

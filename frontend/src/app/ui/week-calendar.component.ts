import { Component, ElementRef, LOCALE_ID, computed, inject, input, model, signal } from '@angular/core';
import { formatDate } from '@angular/common';
import { IconComponent } from './icon.component';
import { SheetComponent } from './sheet.component';

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
  imports: [IconComponent, SheetComponent],
  template: `
    <div class="strip" (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp($event)"
         (keydown)="onKeydown($event)">
      <div class="hd">
        <button type="button" class="pg" (click)="shiftWeek(-1)" [disabled]="!canPrev()"
                aria-label="Previous week" i18n-aria-label="@@ui.weekCalendar.prevWeek">
          <bh-icon name="chevron-left" />
        </button>
        @if (jump()) {
          <button type="button" class="mon monbtn" aria-haspopup="dialog" [attr.aria-label]="jumpAriaLabel()"
                  data-testid="wc-jump-open" (click)="openJump()">{{ monthLabel() }}</button>
        } @else {
          <span class="mon">{{ monthLabel() }}</span>
        }
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
    @if (jump()) {
      <bh-sheet [open]="jumpOpen()" [label]="jumpAriaLabel()" title="Calendar"
                i18n-title="@@ui.weekCalendar.jump.title" (closed)="onJumpClosed()">
        @if (jumpStep() === 'months') {
          <div class="jyear">
            <button type="button" class="pg" data-testid="wc-jump-year-prev" (click)="shiftJumpYear(-1)"
                    [disabled]="!canJumpYearPrev()" aria-label="Previous year"
                    i18n-aria-label="@@ui.weekCalendar.jump.prevYear">
              <bh-icon name="chevron-left" />
            </button>
            <span class="jyearval num" data-testid="wc-jump-year">{{ jumpYear() }}</span>
            <button type="button" class="pg" data-testid="wc-jump-year-next" (click)="shiftJumpYear(1)"
                    [disabled]="!canJumpYearNext()" aria-label="Next year"
                    i18n-aria-label="@@ui.weekCalendar.jump.nextYear">
              <bh-icon name="chevron-right" />
            </button>
          </div>
          <div class="jmonths">
            @for (m of jumpMonths(); track m.month) {
              <button type="button" class="jmon" [class.sel]="m.sel" [attr.aria-pressed]="m.sel"
                      [disabled]="!m.selectable"
                      [attr.data-testid]="'wc-jump-month-' + m.month" (click)="pickJumpMonth(m)">
                {{ m.label }}
              </button>
            }
          </div>
        } @else {
          <div class="jdayshead">
            <button type="button" class="jback" data-testid="wc-jump-back" (click)="jumpBack()">
              <bh-icon name="chevron-left" [size]="18" />
              <span i18n="@@ui.weekCalendar.jump.back">Back</span>
            </button>
            <span class="jdaystitle">{{ jumpMonthTitle() }}</span>
          </div>
          <div class="jdaysgrid">
            @for (dow of jumpDowLabels(); track $index) { <span class="jdow" aria-hidden="true">{{ dow }}</span> }
            @for (d of jumpDays(); track $index) {
              @if (d === null) {
                <span class="jblank" aria-hidden="true"></span>
              } @else {
                <button type="button" class="jday" [class.sel]="d.sel" [class.today]="d.today"
                        [attr.aria-pressed]="d.sel" [attr.aria-current]="d.today ? 'date' : null"
                        [disabled]="!d.selectable" [attr.aria-label]="d.label"
                        [attr.data-testid]="'wc-jump-day-' + d.iso" (click)="pickJumpDay(d)">
                  {{ d.date.getDate() }}
                </button>
              }
            }
          </div>
        }
      </bh-sheet>
    }
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

    /* ---- jump sheet (R6b finding 4): month label becomes a button opening a months/days picker.
       No volt anywhere here — the selected-day treatment below reuses the strip's own .sel tokens
       rather than introducing a new one. ------------------------------------------------------ */
    /* Button chrome only -- NO font or text-transform here: this rule comes after .mon, so any
       font declaration would override the label's own type and it would stop matching every other
       calendar's month label (it did: 16px/400/lowercase against 20px/700/uppercase). */
    .monbtn { background: none; border: none; padding: 0; min-height: var(--tap); cursor: pointer;
      color: inherit; }
    .monbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .jyear { display: flex; align-items: center; justify-content: center; gap: var(--sp-3);
      margin-bottom: var(--sp-3); }
    .jyearval { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      min-width: 64px; text-align: center; }
    .jmonths { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-2); }
    .jmon { display: flex; align-items: center; justify-content: center; min-height: var(--tap);
      background: var(--surface); color: var(--bone); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); font-family: var(--font-body); font-weight: 700; cursor: pointer; }
    .jmon:hover:not(:disabled) { background: var(--surface-2); }
    .jmon:disabled { opacity: 0.3; cursor: default; }
    .jmon:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .jmon.sel { background: var(--surface-2); border-color: var(--hairline); font-weight: 800; }
    .jdayshead { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .jback { display: inline-flex; align-items: center; gap: var(--sp-1); min-height: var(--tap);
      padding: 0 var(--sp-2) 0 0; background: none; border: none; color: var(--bone); cursor: pointer;
      font-family: var(--font-body); font-weight: 700; }
    .jback:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .jdaystitle { flex: 1; text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); }
    .jdaysgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--sp-1); }
    .jdow { display: flex; align-items: center; justify-content: center; padding: var(--sp-1) 0;
      font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    .jday { display: flex; align-items: center; justify-content: center; min-height: var(--tap);
      min-width: var(--tap); background: transparent; color: var(--bone); border: 1px solid transparent;
      border-radius: var(--edge); cursor: pointer; font-variant-numeric: tabular-nums; }
    .jday:hover:not(:disabled) { background: var(--surface-2); }
    .jday:disabled { opacity: 0.3; cursor: default; }
    .jday:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .jday.sel { background: var(--surface-2); border-color: var(--hairline); font-weight: 700; }
    .jday.today { font-weight: 800; }
  `],
})
export class WeekCalendarComponent {
  private locale = inject(LOCALE_ID);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  offset = model(0);
  /** Inclusive upper bound. 13 = a 2-week horizon, matching Box.bookingHorizonWeeks's default of 2. */
  max = input(13);
  /** Inclusive lower bound, may be negative to open past days. Default 0 keeps every current
   *  consumer (booking, schedule, classes) identical. */
  min = input(0);
  /** Keyed by local ISO date ('YYYY-MM-DD'). An absent key means 'none'. */
  tones = input<Record<string, DayTone>>({});
  /** Lets the month label open a months/days picker sheet reaching anywhere in [min, max] (R6b
   *  finding 4). Default false leaves every existing consumer identical. */
  jump = input(false);

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

  // ---- Jump sheet (R6b finding 4): a months step, then a days step, both bounded by [min, max].
  jumpOpen = signal(false);
  jumpStep = signal<'months' | 'days'>('months');
  jumpYear = signal(0);
  jumpMonth = signal(0);

  private readonly minDate = computed(() => {
    const d = new Date(this.today()); d.setDate(d.getDate() + this.min()); return d;
  });
  private readonly maxDate = computed(() => {
    const d = new Date(this.today()); d.setDate(d.getDate() + this.max()); return d;
  });

  readonly canJumpYearPrev = computed(() => this.jumpYear() > this.minDate().getFullYear());
  readonly canJumpYearNext = computed(() => this.jumpYear() < this.maxDate().getFullYear());

  readonly jumpMonths = computed(() => {
    const year = this.jumpYear();
    const min = this.min();
    const max = this.max();
    const sel = this.selected();
    const out: { month: number; label: string; selectable: boolean; sel: boolean }[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const last = new Date(year, m + 1, 0);
      const selectable = this.offsetOf(last) >= min && this.offsetOf(first) <= max;
      out.push({
        month: m,
        label: formatDate(first, 'LLL', this.locale),
        selectable,
        sel: year === sel.getFullYear() && m === sel.getMonth(),
      });
    }
    return out;
  });

  readonly jumpMonthTitle = computed(() => formatDate(new Date(this.jumpYear(), this.jumpMonth(), 1), 'LLLL y', this.locale));

  /** Monday-first weekday short names. A fixed reference Monday (2024-01-01), not "today" -- the
   *  header never changes with the selected day, so it must not depend on it. */
  readonly jumpDowLabels = computed(() => {
    const base = new Date(2024, 0, 1);
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      out.push(formatDate(d, 'EEEEE', this.locale));
    }
    return out;
  });

  readonly jumpDays = computed(() => {
    const year = this.jumpYear();
    const month = this.jumpMonth();
    const min = this.min();
    const max = this.max();
    const todayIso = isoOf(this.today());
    const selIso = isoOf(this.selected());
    const first = new Date(year, month, 1);
    const mondayIdx = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    type JumpDay = { date: Date; iso: string; offset: number; selectable: boolean; today: boolean; sel: boolean; label: string };
    const out: (JumpDay | null)[] = [];
    for (let i = 0; i < mondayIdx; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const offset = this.offsetOf(date);
      const iso = isoOf(date);
      out.push({
        date, iso, offset,
        selectable: offset >= min && offset <= max,
        today: iso === todayIso,
        sel: iso === selIso,
        label: formatDate(date, 'EEEE d MMMM y', this.locale),
      });
    }
    return out;
  });

  private offsetOf(d: Date): number {
    // Same Math.round local-midnight idiom as week() above -- DST-safe.
    return Math.round((startOfDay(d).getTime() - this.today().getTime()) / 864e5);
  }

  jumpAriaLabel(): string {
    return $localize`:@@ui.weekCalendar.jump.openLabel:Choose month, ${this.monthLabel()}:month:`;
  }

  openJump() {
    const sel = this.selected();
    this.jumpYear.set(sel.getFullYear());
    this.jumpMonth.set(sel.getMonth());
    this.jumpStep.set('months');
    this.jumpOpen.set(true);
  }

  onJumpClosed() {
    this.jumpOpen.set(false);
  }

  shiftJumpYear(dir: number) {
    const next = this.jumpYear() + dir;
    // Guard mirrors the [disabled] state on the stepper buttons.
    if (next < this.minDate().getFullYear() || next > this.maxDate().getFullYear()) return;
    this.jumpYear.set(next);
  }

  pickJumpMonth(m: { month: number; selectable: boolean }) {
    if (!m.selectable) return; // guard lives here too, not only on [disabled]
    this.jumpMonth.set(m.month);
    this.jumpStep.set('days');
    this.focusLater('[data-testid="wc-jump-back"]');
  }

  jumpBack() {
    this.jumpStep.set('months');
    this.focusLater(`[data-testid="wc-jump-month-${this.jumpMonth()}"]`);
  }

  /** The control that was pressed is gone after a step swap, so focus would fall to <body>.
   *  A macrotask: the swapped-in step is only in the DOM once the @if has re-rendered -- the same
   *  deferral bh-filter-sheet uses for its own step swap. */
  private focusLater(selector: string) {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }

  pickJumpDay(d: { offset: number; selectable: boolean }) {
    if (!d.selectable) return;
    if (d.offset !== this.offset()) this.offset.set(d.offset);
    this.jumpOpen.set(false);
  }

  monthLabel(): string { return formatDate(this.selected(), 'LLLL y', this.locale); }
  dowLabel(d: WeekDay): string { return formatDate(d.date, 'EEEEE', this.locale); }

  /** Availability tone is omitted entirely when the consumer passed no `tones` -- otherwise every
   *  day reads "…, no classes" (every tone defaults to 'none'), which is false when nobody asked
   *  this instance to track availability at all (M14c-b audit P2, e.g. Library's History strip). */
  dayLabel(d: WeekDay): string {
    const date = formatDate(d.date, 'EEEE d MMMM', this.locale);
    if (!Object.keys(this.tones()).length) return date;
    return `${date}, ${this.toneWord(d.tone)}`;
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

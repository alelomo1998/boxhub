import { Component, inject, signal, computed, effect, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BookingService, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { WeekCalendarComponent, DayTone } from '../../ui/week-calendar.component';
import { tonesOf } from '../booking/session-tones';
import { sessionWindow, covers, SessionWindow, isPastDay } from '../booking/session-window';

/** Coach home: one day's classes at a time (same week strip as Book); tap into check-in or the builder. */
@Component({
  selector: 'bh-coach-classes',
  standalone: true,
  imports: [DatePipe, WeekCalendarComponent, ButtonComponent],
  template: `
    <section class="cls">
      <header class="head">
        <div class="head-text">
          <h1 class="title">Classes</h1>
        </div>
        <bh-button variant="ghost" size="sm" route="/coach/announcements" testId="announce-link"><span i18n="@@coach.classes.announce">Announce</span></bh-button>
      </header>

      <bh-week-calendar [jump]="true" [(offset)]="dayOffset" [min]="-3650" [max]="13" [tones]="tones()" />

      @if (loading()) { <p class="stateline">Loading classes…</p> }
      @else if (error()) {
        <p class="stateline err">Couldn't load.
          <button class="retry" (click)="load()">Try again</button></p>
      } @else {
        <!-- aria-live, matching the admin schedule's session list. The strip announces the DAY it
             moved to, but the list under it changes silently — and this milestone is what made
             paging cheap enough to do repeatedly, so a screen-reader user now moves through days
             far more often with no idea what landed. -->
        <div class="list" aria-live="polite">
          @for (s of daySessions(); track s.id) {
            <div class="row" [attr.data-testid]="'class-' + s.id">
              <span class="time num">{{ s.startAt | date:'HH:mm' }}</span>
              <div class="mid">
                <span class="nm">{{ s.name }}</span>
                <span class="sub num">{{ s.bookedCount }}/{{ s.capacity }} booked
                  @if (s.waitlistCount) { · {{ s.waitlistCount }} in line }</span>
              </div>
              <span class="prog" [class.pub]="s.programmingStatus === 'PUBLISHED'">
                {{ s.programmingStatus === 'PUBLISHED' ? 'Published' : 'Draft' }}
              </span>
              <div class="acts">
                @if (!isPastDay(s.startAt)) {
                  <bh-button variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'build']" testId="build-link"><span i18n="@@coach.classes.action.build">Build</span></bh-button>
                }
                <bh-button variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'checkin']" testId="checkin-link"><span i18n="@@coach.classes.action.checkin">Check-in</span></bh-button>
                @if (!isPastDay(s.startAt)) {
                  <bh-button variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'run']" testId="run-link"><span i18n="@@coach.classes.action.run">Run</span></bh-button>
                }
              </div>
            </div>
          } @empty {
            <div class="empty">
              <p class="e1" i18n="@@coach.classes.empty.title">No classes this day.</p>
              <p class="e2" i18n="@@coach.classes.empty.hint">Pick another day from the strip above — or schedule class types in the Types tab.</p>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .cls { max-width: 860px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .head { margin-bottom: var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 0; }
    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .row { display: grid; grid-template-columns: 56px 1fr auto auto; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); }
    .time { font-family: var(--font-display); font-weight: 800; font-size: 18px; }
    .num { font-variant-numeric: tabular-nums; }
    .mid { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .nm { font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { font-size: var(--fs-sm); color: var(--faint); }
    .prog { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
      padding: 3px 10px; border: 1px solid var(--hairline); border-radius: var(--r-full); color: var(--faint); }
    .prog.pub { color: var(--good); border-color: var(--good); }
    .acts { display: flex; gap: var(--sp-2); }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
    @media (max-width: 560px) {
      .row { grid-template-columns: 48px 1fr auto; grid-template-areas: "t m p" "t a a"; row-gap: var(--sp-2); }
      .time { grid-area: t; } .mid { grid-area: m; } .prog { grid-area: p; }
      .acts { grid-area: a; justify-content: flex-end; }
    }
  `],
})
export class CoachClassesPage implements OnInit {
  private booking = inject(BookingService);

  sessions = signal<SessionView[]>([]);
  loading = signal(true);
  error = signal(false);

  dayOffset = signal(0);

  /** The [from, to] this page last fetched — reloaded only when the selected day leaves it. */
  private window: SessionWindow = sessionWindow(0);

  daySessions = computed(() => {
    const d = new Date(); d.setDate(d.getDate() + this.dayOffset());
    const key = d.toDateString();
    return this.sessions().filter(s => new Date(s.startAt).toDateString() === key);
  });

  /** Per-day availability for the strip's dots, from sessions this page already fetched — no extra request. */
  readonly tones = computed<Record<string, DayTone>>(() => tonesOf(this.sessions()));

  constructor() {
    effect(() => {
      const offset = this.dayOffset();
      if (!covers(this.window, offset)) this.load();
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(false);
    this.window = sessionWindow(this.dayOffset());
    this.booking.listSessions(this.window.from.toISOString(), this.window.to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  protected readonly isPastDay = isPastDay;
}

import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingService, SessionView } from '../booking/booking.service';
import { DayPagerComponent } from '../../ui/day-pager.component';

/** Coach home: one day's classes at a time (same pager as Book); tap into check-in or the builder. */
@Component({
  selector: 'bh-coach-classes',
  standalone: true,
  imports: [DatePipe, RouterLink, DayPagerComponent],
  template: `
    <section class="cls">
      <header class="head">
        <span class="eyebrow">This week</span>
        <h1 class="title">Classes</h1>
      </header>

      <bh-day-pager [offset]="dayOffset()" [max]="13" (offsetChange)="dayOffset.set($event)" />

      @if (loading()) { <p class="stateline">Loading classes…</p> }
      @else if (error()) {
        <p class="stateline err">Couldn't load.
          <button class="retry" (click)="load()">Try again</button></p>
      } @else {
        <div class="list">
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
                <a class="act" [routerLink]="['/coach/classes', s.id, 'build']" data-testid="build-link">Build</a>
                <a class="act" [routerLink]="['/coach/classes', s.id, 'checkin']" data-testid="checkin-link">Check-in</a>
                <a class="act" [routerLink]="['/coach/classes', s.id, 'run']" data-testid="run-link">Run</a>
              </div>
            </div>
          } @empty {
            <div class="empty">
              <p class="e1">No classes this day.</p>
              <p class="e2">Flip through the week with ‹ › — or schedule class types in the Types tab.</p>
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
    .stateline.err { color: var(--volt); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
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
    .act { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-3);
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
      font-size: var(--fs-sm); text-decoration: none; }
    .act:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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

  daySessions = computed(() => {
    const d = new Date(); d.setDate(d.getDate() + this.dayOffset());
    const key = d.toDateString();
    return this.sessions().filter(s => new Date(s.startAt).toDateString() === key);
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(false);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + 14 * 864e5); // match the athlete Book window so the coach can reach any upcoming class
    this.booking.listSessions(from.toISOString(), to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }
}

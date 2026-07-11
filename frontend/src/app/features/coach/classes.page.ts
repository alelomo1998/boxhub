import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingService, SessionView } from '../booking/booking.service';

/** Coach home: the week's classes with programming status; tap into check-in or the builder. */
@Component({
  selector: 'bh-coach-classes',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="cls">
      <header class="head">
        <span class="eyebrow">This week</span>
        <h1 class="title">Classes</h1>
      </header>

      @if (loading()) { <p class="stateline">Loading classes…</p> }
      @else if (error()) {
        <p class="stateline err">Couldn't load.
          <button class="retry" (click)="load()">Try again</button></p>
      } @else {
        @for (day of days(); track day.label) {
          <h2 class="dayhead">{{ day.label }}</h2>
          <div class="list">
            @for (s of day.sessions; track s.id) {
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
                </div>
              </div>
            }
          </div>
        } @empty {
          <div class="empty">
            <p class="e1">No classes this week.</p>
            <p class="e2">Create class types and schedule them in the Types tab.</p>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .cls { max-width: 860px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--red); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .dayhead { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; color: var(--bone-dim); margin: var(--sp-5) 0 var(--sp-2); }
    .list { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 56px 1fr auto auto; align-items: center; gap: var(--sp-3);
      padding: 10px 4px; border-bottom: 1px solid var(--hairline); }
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
    .act:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
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

  days = computed(() => {
    const groups = new Map<string, { label: string; sessions: SessionView[] }>();
    for (const s of this.sessions()) {
      const d = new Date(s.startAt);
      const label = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
      if (!groups.has(label)) groups.set(label, { label, sessions: [] });
      groups.get(label)!.sessions.push(s);
    }
    return [...groups.values()];
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(false);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + 7 * 864e5);
    this.booking.listSessions(from.toISOString(), to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }
}

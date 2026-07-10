import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BookingService, SessionView, MyBooking } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

@Component({
  selector: 'bh-book',
  standalone: true,
  imports: [DatePipe, ButtonComponent, PillComponent],
  template: `
    <section class="book">
      <header class="head">
        <span class="eyebrow">Next two weeks</span>
        <h1 class="title">Book</h1>
      </header>

      @if (error()) { <p class="err" role="alert" data-testid="book-error">{{ error() }}</p> }

      @if (mine().length) {
        <div class="mine">
          <h2 class="mh">Yours</h2>
          @for (b of mine(); track b.sessionId) {
            <div class="mrow">
              <span class="mdate num">{{ b.startAt | date:'EEE d · HH:mm' }}</span>
              <span class="mname">{{ b.sessionName }}</span>
              @if (b.status === 'WAITLIST') { <bh-pill tone="warn" [label]="'#' + b.position" /> }
              @else { <bh-pill tone="active" label="Booked" /> }
            </div>
          }
        </div>
      }

      @if (loading()) { <p class="stateline">Loading classes…</p> }
      @else {
        @for (day of days(); track day.label) {
          <div class="day">
            <h3 class="dayhead">{{ day.label }}</h3>
            @for (s of day.sessions; track s.id) {
              <div class="sess" [attr.data-testid]="'session-' + s.id">
                <div class="info">
                  <div class="when">
                    <span class="time num">{{ s.startAt | date:'HH:mm' }}</span>
                    <span class="nm">{{ s.name }}</span>
                  </div>
                  <div class="sub">
                    @if (s.coachName) { <span class="coach">Coach {{ s.coachName }}</span> }
                    <span class="cnt num">{{ s.bookedCount }}/{{ s.capacity }}@if (s.waitlistCount) { · {{ s.waitlistCount }} waiting }</span>
                  </div>
                </div>
                <div class="state">
                  @if (s.myBookingStatus === 'BOOKED') {
                    <bh-pill tone="active" label="Booked" />
                    <bh-button variant="ghost" size="sm" data-testid="cancel-btn" (click)="cancel(s)">Cancel</bh-button>
                  } @else if (s.myBookingStatus === 'WAITLIST') {
                    <bh-pill tone="warn" [label]="'Waitlist #' + s.myPosition" />
                    <bh-button variant="ghost" size="sm" data-testid="cancel-btn" (click)="cancel(s)">Leave</bh-button>
                  } @else if (s.bookedCount >= s.capacity) {
                    <span class="spots">Full</span>
                    <bh-button size="sm" data-testid="book-btn" [disabled]="busy() === s.id" (click)="book(s)">Join waitlist</bh-button>
                  } @else {
                    <span class="spots num">{{ s.capacity - s.bookedCount }} left</span>
                    <bh-button size="sm" data-testid="book-btn" [disabled]="busy() === s.id" (click)="book(s)">Book</bh-button>
                  }
                </div>
              </div>
            }
          </div>
        } @empty {
          <div class="empty">
            <p class="e1">No classes scheduled.</p>
            <p class="e2">Nothing on the calendar for the next two weeks — ask your box.</p>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .book { max-width: 720px; margin: 0 auto; }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .err { color: var(--red); font-size: var(--fs-sm); }
    .stateline { color: var(--bone-dim); font-size: var(--fs-body); }

    .mine { margin-bottom: var(--sp-5); border: 1px solid var(--hairline); border-radius: var(--edge);
      background: var(--surface); padding: var(--sp-3) var(--sp-4); }
    .mh { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--faint); margin: 0 0 var(--sp-2); }
    .mrow { display: flex; align-items: center; gap: var(--sp-3); padding: 7px 0; }
    .mdate { font-variant-numeric: tabular-nums; font-weight: 600; font-size: var(--fs-sm); min-width: 110px; }
    .mname { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; flex: 1;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .day { margin-bottom: var(--sp-5); }
    .dayhead { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .sess { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .when { display: flex; align-items: baseline; gap: var(--sp-3); }
    .time { font-weight: 700; font-size: 17px; font-variant-numeric: tabular-nums; min-width: 50px; }
    .nm { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 17px; }
    .sub { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-sm); padding-left: 62px; }
    .coach { color: var(--bone-dim); }
    .cnt { color: var(--faint); font-variant-numeric: tabular-nums; }
    .state { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
    .spots { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint); }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
    @media (max-width: 480px) { .sub { padding-left: 0; } }
  `],
})
export class BookPage implements OnInit {
  private booking = inject(BookingService);
  readonly sessions = signal<SessionView[]>([]);
  readonly mine = signal<MyBooking[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);

  readonly days = computed(() => {
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
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 864e5).toISOString();
    this.booking.listSessions(from, to).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set("Couldn't load classes — try again."); },
    });
    this.booking.myBookings(from).subscribe({ next: b => this.mine.set(b), error: () => {} });
  }

  book(s: SessionView) { this.act(s, this.booking.book(s.id)); }
  cancel(s: SessionView) { this.act(s, this.booking.cancel(s.id)); }

  private act(s: SessionView, call: { subscribe: Function }) {
    this.error.set('');
    this.busy.set(s.id);
    call.subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (e: any) => { this.busy.set(null); this.error.set(this.reason(e.error?.detail)); },
    });
  }

  private reason(code: string | undefined): string {
    switch (code) {
      case 'LIMIT_REACHED': return "You have reached your plan's weekly class limit.";
      case 'PAST_CUTOFF': return 'Too late to cancel this class — contact your coach.';
      case 'ALREADY_BOOKED': return 'You are already booked for this class.';
      case 'CANCELLED': return 'This class has been cancelled.';
      case 'PAST': return 'This class has already started.';
      default: return 'Something went wrong — try again.';
    }
  }
}

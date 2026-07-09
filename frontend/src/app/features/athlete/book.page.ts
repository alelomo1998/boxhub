import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BookingService, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

@Component({
  selector: 'bh-book',
  standalone: true,
  imports: [DatePipe, ButtonComponent, PillComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Book a class</h2>
      @if (error()) { <p class="err" data-testid="book-error">{{ error() }}</p> }
      @for (day of days(); track day.label) {
        <div class="day">
          <h3 class="t-h3 dayhead">{{ day.label }}</h3>
          @for (s of day.sessions; track s.id) {
            <div class="sess" [attr.data-testid]="'session-' + s.id">
              <div class="when">
                <span class="time num">{{ s.startAt | date:'HH:mm' }}</span>
                <span class="nm">{{ s.name }}</span>
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
                  <bh-button size="sm" data-testid="book-btn" (click)="book(s)">Join waitlist</bh-button>
                } @else {
                  <span class="spots num">{{ s.capacity - s.bookedCount }} left</span>
                  <bh-button size="sm" data-testid="book-btn" (click)="book(s)">Book</bh-button>
                }
              </div>
            </div>
          }
        </div>
      } @empty { <p class="muted">No classes scheduled in the next two weeks.</p> }
    </section>
  `,
  styles: [`
    .err { color: var(--red); font-size: 13px; margin: 0; }
    .muted { color: var(--bone-dim); }
    .day { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--sp-5); }
    .dayhead { color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .sess { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .when { display: flex; align-items: baseline; gap: var(--sp-4); }
    .time { font-family: var(--font-body); font-weight: 700; font-size: 18px; min-width: 54px; }
    .nm { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 18px; letter-spacing: -0.01em; }
    .state { display: flex; align-items: center; gap: var(--sp-3); }
    .spots { font-family: var(--font-mono); font-size: 12px; color: var(--faint); }
  `],
})
export class BookPage implements OnInit {
  private booking = inject(BookingService);
  readonly sessions = signal<SessionView[]>([]);
  readonly error = signal('');

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
    this.booking.listSessions(from, to).subscribe(s =>
      this.sessions.set(s.filter(x => x.status !== 'CANCELLED')));
  }

  book(s: SessionView) {
    this.error.set('');
    this.booking.book(s.id).subscribe({
      next: () => this.load(),
      error: e => this.error.set(this.reason(e.error?.detail)),
    });
  }

  cancel(s: SessionView) {
    this.error.set('');
    this.booking.cancel(s.id).subscribe({
      next: () => this.load(),
      error: e => this.error.set(this.reason(e.error?.detail)),
    });
  }

  private reason(code: string | undefined): string {
    switch (code) {
      case 'LIMIT_REACHED': return 'You have reached your plan\'s weekly class limit.';
      case 'PAST_CUTOFF': return 'Too late to cancel this class — contact your coach.';
      case 'ALREADY_BOOKED': return 'You are already booked for this class.';
      case 'CANCELLED': return 'This class has been cancelled.';
      case 'PAST': return 'This class has already started.';
      default: return 'Something went wrong — try again.';
    }
  }
}

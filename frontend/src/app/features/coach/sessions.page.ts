import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingService, SessionView } from '../booking/booking.service';

@Component({
  selector: 'bh-coach-sessions',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Upcoming sessions</h2>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>When</th><th>Class</th><th>Booked</th><th>Waitlist</th><th></th></tr></thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr [attr.data-testid]="'session-' + s.id">
                <td class="num">{{ s.startAt | date:'EEE d MMM · HH:mm' }}</td>
                <td><span class="mname">{{ s.name }}</span>@if (s.status === 'CANCELLED') { <span class="cx">cancelled</span> }</td>
                <td class="num">{{ s.bookedCount }} / {{ s.capacity }}</td>
                <td class="num">{{ s.waitlistCount }}</td>
                <td><a class="link" [routerLink]="['/coach','sessions', s.id, 'roster']">Roster →</a></td>
              </tr>
            } @empty { <tr><td colspan="5" class="muted">No upcoming sessions.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .cx { font-family: var(--font-mono); font-size: 11px; color: var(--red); margin-left: 8px; }
    .link { color: var(--red); font-weight: 600; }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class CoachSessionsPage implements OnInit {
  private booking = inject(BookingService);
  readonly sessions = signal<SessionView[]>([]);

  ngOnInit() {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 864e5).toISOString();
    this.booking.listSessions(from, to).subscribe(s => this.sessions.set(s));
  }
}

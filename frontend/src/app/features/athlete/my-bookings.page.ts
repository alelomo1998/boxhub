import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BookingService, MyBooking } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

@Component({
  selector: 'bh-my-bookings',
  standalone: true,
  imports: [DatePipe, ButtonComponent, PillComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">My bookings</h2>
      <ul class="list">
        @for (b of items(); track b.sessionId) {
          <li>
            <span class="when">
              <span class="date num">{{ b.startAt | date:'EEE d MMM · HH:mm' }}</span>
              <span class="nm">{{ b.sessionName }}</span>
            </span>
            <span class="state">
              @if (b.status === 'WAITLIST') { <bh-pill tone="warn" [label]="'Waitlist #' + b.position" /> }
              @else { <bh-pill tone="active" label="Booked" /> }
              <bh-button variant="ghost" size="sm" (click)="cancel(b)">Cancel</bh-button>
            </span>
          </li>
        } @empty { <li class="muted">No upcoming bookings. Head to Book to reserve a class.</li> }
      </ul>
    </section>
  `,
  styles: [`
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      padding: 13px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .when { display: flex; align-items: baseline; gap: var(--sp-4); }
    .date { font-family: var(--font-body); font-weight: 600; }
    .nm { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 17px; }
    .state { display: flex; align-items: center; gap: var(--sp-3); }
    .muted { color: var(--bone-dim); }
  `],
})
export class MyBookingsPage implements OnInit {
  private booking = inject(BookingService);
  readonly items = signal<MyBooking[]>([]);

  ngOnInit() { this.load(); }
  load() { this.booking.myBookings(new Date().toISOString()).subscribe(b => this.items.set(b)); }

  cancel(b: MyBooking) { this.booking.cancel(b.sessionId).subscribe(() => this.load()); }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookingService, RosterEntry } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

@Component({
  selector: 'bh-roster',
  standalone: true,
  imports: [ButtonComponent, PillComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Roster</h2>
      <h3 class="t-h3 sub">Booked</h3>
      <ul class="list">
        @for (r of booked(); track r.bookingId) {
          <li [attr.data-testid]="'roster-' + r.bookingId">
            <span class="who"><b class="nm">{{ r.name }}</b><span class="em">{{ r.email }}</span></span>
            <span class="act">
              @if (r.status === 'CHECKED_IN') { <bh-pill tone="active" label="Checked in" /> }
              @else if (r.status === 'NO_SHOW') { <bh-pill tone="suspended" label="No show" /> }
              @else {
                <bh-button size="sm" data-testid="checkin-btn" (click)="checkIn(r)">Check in</bh-button>
                <bh-button variant="ghost" size="sm" data-testid="noshow-btn" (click)="noShow(r)">No show</bh-button>
              }
            </span>
          </li>
        } @empty { <li class="muted">Nobody booked yet.</li> }
      </ul>
      @if (waitlist().length) {
        <h3 class="t-h3 sub">Waitlist</h3>
        <ul class="list">
          @for (r of waitlist(); track r.bookingId) {
            <li><span class="who"><b class="nm">#{{ r.position }} {{ r.name }}</b></span></li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .sub { color: var(--bone-dim); margin: var(--sp-4) 0 var(--sp-2); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .who { display: flex; flex-direction: column; }
    .nm { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 17px; }
    .em { color: var(--faint); font-size: 12px; font-family: var(--font-mono); }
    .act { display: flex; align-items: center; gap: var(--sp-2); }
    .muted { color: var(--bone-dim); }
  `],
})
export class RosterPage implements OnInit {
  private booking = inject(BookingService);
  private route = inject(ActivatedRoute);
  sessionId = this.route.snapshot.paramMap.get('id')!;
  readonly booked = signal<RosterEntry[]>([]);
  readonly waitlist = signal<RosterEntry[]>([]);

  ngOnInit() { this.load(); }

  load() {
    this.booking.roster(this.sessionId).subscribe(all => {
      this.booked.set(all.filter(r => r.status !== 'WAITLIST'));
      this.waitlist.set(all.filter(r => r.status === 'WAITLIST').sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    });
  }

  checkIn(r: RosterEntry) { this.booking.checkIn(this.sessionId, r.bookingId).subscribe(() => this.load()); }
  noShow(r: RosterEntry) { this.booking.noShow(this.sessionId, r.bookingId).subscribe(() => this.load()); }
}

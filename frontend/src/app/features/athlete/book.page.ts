import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingService, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }

/** Book a class: date pager + photo class cards (reference-app concept, our style). */
@Component({
  selector: 'bh-book',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonComponent, PillComponent],
  template: `
    <section class="book">
      <div class="pager">
        <button class="pg" (click)="shift(-1)" [disabled]="dayOffset() === 0" aria-label="Previous day">‹</button>
        <span class="pg-date">{{ day() | date:'EEEE d MMMM' }}</span>
        <button class="pg" (click)="shift(1)" [disabled]="dayOffset() >= 13" aria-label="Next day">›</button>
      </div>

      @if (error()) { <p class="err" role="alert" data-testid="book-error">{{ error() }}</p> }

      @if (loading()) { <p class="stateline">Loading classes…</p> }
      @else {
        <div class="cards">
          @for (s of daySessions(); track s.id) {
            <div class="card" [attr.data-testid]="'session-' + s.id">
              <a class="body sess" [routerLink]="['/athlete/class', s.id]">
                @if (imageOf(s)) { <img class="img" [src]="imageOf(s)" alt="" /> }
                @else { <div class="img ph" aria-hidden="true">{{ s.name.slice(0, 2) }}</div> }
                <div class="info">
                  <span class="nm">{{ s.name }}</span>
                  @if (s.coachName) { <span class="coach">Coach {{ s.coachName }}</span> }
                  <span class="spots num">
                    @if (s.bookedCount >= s.capacity) { Full · {{ s.waitlistCount }} in line }
                    @else { {{ s.capacity - s.bookedCount }} spots left }
                  </span>
                </div>
                <div class="time">
                  <span class="t-start num">{{ s.startAt | date:'HH:mm' }}</span>
                  <span class="t-end num">{{ endOf(s) | date:'HH:mm' }}</span>
                </div>
              </a>
              <div class="foot">
                @if (s.myBookingStatus === 'BOOKED') {
                  <bh-pill tone="active" label="Booked" />
                  <bh-button variant="ghost" size="sm" data-testid="cancel-btn" [disabled]="busy() === s.id" (click)="cancel(s)">Cancel</bh-button>
                } @else if (s.myBookingStatus === 'WAITLIST') {
                  <bh-pill tone="warn" [label]="'Waitlist #' + s.myPosition" />
                  <bh-button variant="ghost" size="sm" data-testid="cancel-btn" [disabled]="busy() === s.id" (click)="cancel(s)">Leave</bh-button>
                } @else if (s.bookedCount >= s.capacity) {
                  <span class="mut">Join the line</span>
                  <bh-button size="sm" data-testid="book-btn" [disabled]="busy() === s.id" (click)="book(s)">Join waitlist</bh-button>
                } @else {
                  <span class="mut num">{{ s.bookedCount }}/{{ s.capacity }} going</span>
                  <bh-button size="sm" data-testid="book-btn" [disabled]="busy() === s.id" (click)="book(s)">Book</bh-button>
                }
              </div>
            </div>
          } @empty {
            <div class="empty">
              <p class="e1">No classes this day.</p>
              <p class="e2">Try another day with ‹ ›.</p>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .book { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .err { color: var(--red); font-size: var(--fs-sm); }

    .pager { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-3);
      margin-bottom: var(--sp-4); }
    .pg { min-width: var(--tap); min-height: var(--tap); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); font-size: 20px; cursor: pointer; }
    .pg:disabled { opacity: 0.35; cursor: default; }
    .pg:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .pg-date { text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); text-transform: uppercase; }

    .cards { display: flex; flex-direction: column; gap: var(--sp-3); }
    .card { border: 1px solid var(--hairline); border-radius: var(--edge); background: var(--surface);
      overflow: hidden; }
    .body { display: flex; align-items: stretch; gap: var(--sp-3); text-decoration: none; color: var(--bone); }
    .body:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--red-glow); }
    .img { width: 84px; min-height: 84px; object-fit: cover; flex-shrink: 0; }
    .img.ph { display: grid; place-items: center; background: var(--surface-2);
      font-family: var(--font-display); font-weight: 800; font-size: 22px; color: var(--faint);
      text-transform: uppercase; }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: var(--sp-3) 0; }
    .nm { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .coach { font-size: var(--fs-sm); color: var(--bone-dim); }
    .spots { font-size: var(--fs-sm); color: var(--faint); }
    .time { display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
      padding: var(--sp-3) var(--sp-4); }
    .t-start { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); line-height: 1; }
    .t-end { font-size: var(--fs-sm); color: var(--faint); }
    .num { font-variant-numeric: tabular-nums; }

    .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      border-top: 1px solid var(--hairline); padding: var(--sp-2) var(--sp-4); }
    .mut { font-size: var(--fs-sm); color: var(--faint); }

    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class BookPage implements OnInit {
  private booking = inject(BookingService);

  readonly sessions = signal<SessionView[]>([]);
  readonly images = signal<Map<string, string>>(new Map());
  readonly error = signal('');
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly dayOffset = signal(0);

  readonly day = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + this.dayOffset());
    return d;
  });

  readonly daySessions = computed(() => {
    const key = dayKey(this.day());
    return this.sessions().filter(s => dayKey(new Date(s.startAt)) === key);
  });

  ngOnInit() {
    this.load();
    this.booking.listTemplates().subscribe({
      next: ts => this.images.set(new Map(ts.filter(t => t.imagePath).map(t => [t.name, t.imagePath!]))),
      error: () => {},
    });
  }

  load() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + 14 * 864e5);
    this.booking.listSessions(from.toISOString(), to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set("Couldn't load classes — try again."); },
    });
  }

  shift(days: number) { this.dayOffset.update(o => Math.min(13, Math.max(0, o + days))); }

  imageOf(s: SessionView): string | null { return this.images().get(s.name) ?? null; }
  endOf(s: SessionView): Date { return new Date(new Date(s.startAt).getTime() + s.durationMin * 60000); }

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

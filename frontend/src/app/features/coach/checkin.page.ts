import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingService, RosterEntry, SessionDetail } from '../booking/booking.service';
import { AvatarComponent } from '../../ui/avatar.component';

/** Rapid photo check-in: tap an athlete to toggle check-in; long-press marks a no-show. */
@Component({
  selector: 'bh-checkin',
  standalone: true,
  imports: [DatePipe, RouterLink, AvatarComponent],
  template: `
    <section class="chk">
      <a class="back" routerLink="/coach/classes">‹ Classes</a>

      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading roster…</p> }
        @case ('error') { <p class="stateline err">Couldn't load this class.</p> }
        @default {
          @if (detail(); as d) {
            <header class="head">
              <span class="eyebrow">{{ d.startAt | date:'EEEE d MMM · HH:mm' }}</span>
              <h1 class="title">{{ d.name }}</h1>
              <span class="count num" data-testid="checkin-count">{{ checkedCount() }}/{{ active().length }} in</span>
            </header>

            @if (actionError()) { <p class="err" role="alert">{{ actionError() }}</p> }

            @if (active().length) {
              <div class="grid" data-testid="checkin-grid">
                @for (a of active(); track a.bookingId) {
                  <button class="cell" [class.in]="a.status === 'CHECKED_IN'" [class.busy]="busy() === a.bookingId"
                          [class.noshow]="a.status === 'NO_SHOW'"
                          [attr.data-testid]="'athlete-' + a.bookingId"
                          (click)="onTap(a)"
                          (pointerdown)="pressStart(a)" (pointerup)="pressEnd()" (pointerleave)="pressEnd()"
                          (contextmenu)="onContext(a, $event)"
                          [attr.aria-pressed]="a.status === 'CHECKED_IN'">
                    <span class="ring"><bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" /></span>
                    <span class="cell-name">{{ a.name }}</span>
                    <span class="cell-state">
                      @if (a.status === 'CHECKED_IN') { ✓ in }
                      @else if (a.status === 'NO_SHOW') { no-show }
                      @else { tap to check in }
                    </span>
                  </button>
                }
              </div>
              <p class="hint">Tap = check in / undo · long-press = no-show (tap a no-show to restore)</p>
            } @else { <p class="stateline">No one booked for this class.</p> }

            @if (queue().length) {
              <h2 class="sh">In queue</h2>
              <div class="grid">
                @for (a of queue(); track a.bookingId) {
                  <div class="cell dim">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" />
                    <span class="cell-name">{{ a.name }}</span>
                    <span class="cell-state">#{{ a.position }}</span>
                  </div>
                }
              </div>
            }
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .chk { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err, .err { color: var(--red); font-size: var(--fs-sm); }
    .back { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--bone-dim);
      text-decoration: none; margin-bottom: var(--sp-2); }
    .back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .head { margin-bottom: var(--sp-4); position: relative; }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }
    .count { position: absolute; top: 0; right: 0; font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-display); font-variant-numeric: tabular-nums; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--sp-3); }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: var(--sp-3) var(--sp-2);
      background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card);
      color: var(--bone); cursor: pointer; text-align: center; min-height: 130px;
      touch-action: manipulation; -webkit-touch-callout: none; user-select: none;
      transition: border-color var(--dur) var(--ease-out); }
    .cell:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .ring { border-radius: 50%; padding: 2px; border: 2px solid transparent; display: inline-flex;
      transition: border-color var(--dur) var(--ease-out); }
    .cell.in .ring { border-color: var(--good); }
    .cell.in { border-color: var(--good); }
    .cell.noshow { opacity: 0.45; }
    .cell.busy { opacity: 0.6; pointer-events: none; }
    .cell.dim { opacity: 0.6; cursor: default; }
    .cell-name { font-size: var(--fs-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis;
      max-width: 100%; white-space: nowrap; }
    .cell-state { font-family: var(--font-mono); font-size: 10px; color: var(--faint); }
    .cell.in .cell-state { color: var(--good); }
    .hint { color: var(--faint); font-size: var(--fs-sm); margin-top: var(--sp-3); }
    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: var(--sp-5) 0 var(--sp-3); }
    .num { font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) { .cell, .ring { transition: none; } }
  `],
})
export class CheckinPage implements OnInit {
  private booking = inject(BookingService);
  private route = inject(ActivatedRoute);

  sessionId = '';
  detail = signal<SessionDetail | null>(null);
  roster = signal<RosterEntry[]>([]);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  busy = signal<string | null>(null);
  actionError = signal('');

  active = computed(() => this.roster().filter(r => r.status !== 'WAITLIST'));
  queue = computed(() => this.roster().filter(r => r.status === 'WAITLIST'));
  checkedCount = computed(() => this.roster().filter(r => r.status === 'CHECKED_IN').length);

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('id')!;
    this.load(true);
  }

  load(first = false) {
    if (first) this.state.set('loading');
    this.booking.sessionDetail(this.sessionId).subscribe({
      next: d => { this.detail.set(d); if (first) this.state.set('ready'); },
      error: () => { if (first) this.state.set('error'); },
    });
    this.booking.roster(this.sessionId).subscribe({
      next: r => this.roster.set(r),
      error: () => { if (first) this.state.set('error'); },
    });
  }

  private pressTimer: any = null;
  private longFired = false;

  pressStart(a: RosterEntry) {
    this.longFired = false;
    this.pressTimer = setTimeout(() => { this.longFired = true; this.setNoShow(a); }, 500);
  }
  pressEnd() { clearTimeout(this.pressTimer); }

  onContext(a: RosterEntry, ev: Event) { ev.preventDefault(); this.setNoShow(a); }

  onTap(a: RosterEntry) {
    if (this.longFired) { this.longFired = false; return; } // the long-press already acted
    // tapping check-in toggles; tapping a no-show restores it to booked
    const next = a.status === 'CHECKED_IN' ? 'BOOKED' : a.status === 'NO_SHOW' ? 'BOOKED' : 'CHECKED_IN';
    const call = next === 'CHECKED_IN'
      ? this.booking.checkIn(this.sessionId, a.bookingId)
      : this.booking.uncheck(this.sessionId, a.bookingId);
    this.act(a, next, call);
  }

  private setNoShow(a: RosterEntry) {
    if (a.status === 'NO_SHOW') return;
    this.act(a, 'NO_SHOW', this.booking.noShow(this.sessionId, a.bookingId));
  }

  /** Optimistic: repaint the cell immediately, reconcile on the response. */
  private act(a: RosterEntry, next: string, call: { subscribe: Function }) {
    this.actionError.set('');
    const prev = a.status;
    this.setStatusLocal(a.bookingId, next);
    this.busy.set(a.bookingId);
    call.subscribe({
      next: () => this.busy.set(null),
      error: () => {
        this.busy.set(null);
        this.setStatusLocal(a.bookingId, prev); // revert
        this.actionError.set("Couldn't update — try again.");
      },
    });
  }

  private setStatusLocal(bookingId: string, status: string) {
    this.roster.update(rs => rs.map(r => r.bookingId === bookingId ? { ...r, status } : r));
  }
}

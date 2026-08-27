import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../ui/avatar.component';
import { HomeService, Home } from './home.service';
import { ProgrammingService, MyClass } from '../programming/programming.service';
import { BookingService } from '../booking/booking.service';

/** Athlete home: announcement, next booking, today's class teaser, mini stats. */
@Component({
  selector: 'bh-home',
  standalone: true,
  imports: [DatePipe, RouterLink, AvatarComponent],
  template: `
    <section class="home" data-testid="home-root">
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load your home.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (home(); as h) {
            @if (h.planExpiringSoon && h.stats.planDaysLeft !== null) {
              <div class="warn" role="status">
                Your plan expires in {{ h.stats.planDaysLeft }} {{ h.stats.planDaysLeft === 1 ? 'day' : 'days' }} — talk to your box.
              </div>
            }

            @if (h.announcement; as a) {
              <div class="card ann">
                <span class="k">From your box</span>
                <p class="ann-body">{{ a.body }}</p>
              </div>
            }

            @if (h.nextBooking; as b) {
              <a class="card next" routerLink="/athlete/book" [attr.data-testid]="'next-booking'">
                @if (b.imagePath) { <img class="next-img" [src]="b.imagePath" alt="" /> }
                <div class="next-body">
                  <span class="k">Your next class</span>
                  <div class="next-line">
                    <span class="next-time num">{{ b.startAt | date:'HH:mm' }}</span>
                    <span class="next-name">{{ b.className }}</span>
                  </div>
                  <div class="next-sub">
                    <span class="next-date">{{ b.startAt | date:'EEEE d MMM' }}</span>
                    <span class="next-state">{{ b.status === 'WAITLIST' ? 'Waitlist #' + b.waitlistPosition : 'Booked' }}
                      · {{ b.bookedCount }}/{{ b.capacity }}</span>
                  </div>
                  @if (b.participants.length) {
                    <div class="pals">
                      @for (p of b.participants; track p.name) {
                        <bh-avatar [path]="p.avatarPath" [name]="p.name" size="sm" />
                      }
                    </div>
                  }
                </div>
              </a>
            } @else {
              <a class="card empty-cta" routerLink="/athlete/book">
                <span class="k">No upcoming class</span>
                <span class="cta-line">Book your next session →</span>
              </a>
            }

            @if (todayClass(); as tc) {
              @if (tc.session && tc.items.length) {
                <a class="card teaser" routerLink="/athlete/wod">
                  <span class="k">Today at {{ tc.session.startAt | date:'HH:mm' }} — {{ tc.session.name }}</span>
                  <div class="pieces">
                    @for (i of tc.items; track i.id) {
                      <span class="piece" [class.scored]="i.scoreable">
                        {{ i.wod.title }}@if (i.myScoreLogged) { <span class="done">✓</span> }
                      </span>
                    }
                  </div>
                </a>
              }
            }

            <div class="stats">
              <div class="stat">
                <span class="s-val num">{{ h.stats.checkinsThisWeek }}</span>
                <span class="s-lab">classes this week</span>
              </div>
              <div class="stat">
                <span class="s-val num">{{ h.stats.streakWeeks }}</span>
                <span class="s-lab">week streak</span>
              </div>
              @if (h.stats.lastPr; as pr) {
                <div class="stat">
                  <span class="s-val num">{{ pr.load }}</span>
                  <span class="s-lab">last PR · {{ pr.movementName }}</span>
                </div>
              }
              @if (h.stats.planDaysLeft !== null && !h.planExpiringSoon) {
                <div class="stat">
                  <span class="s-val num">{{ h.stats.planDaysLeft }}</span>
                  <span class="s-lab">plan days left</span>
                </div>
              }
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .home { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-4); }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }

    .warn { border: 1px solid var(--warn); border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4);
      color: var(--warn); font-size: var(--fs-sm); }

    .card { display: block; border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); padding: var(--sp-4); color: var(--bone); text-decoration: none; }
    .card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }

    .ann-body { margin: var(--sp-2) 0 0; font-size: var(--fs-body); color: var(--bone); }

    .next { display: flex; gap: var(--sp-4); padding: 0; overflow: hidden; }
    .next-img { width: 108px; object-fit: cover; flex-shrink: 0; }
    .next-body { padding: var(--sp-4); min-width: 0; flex: 1; }
    .next-line { display: flex; align-items: baseline; gap: var(--sp-3); margin-top: 4px; }
    .next-time { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .next-name { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .next-sub { display: flex; gap: var(--sp-3); font-size: var(--fs-sm); color: var(--bone-dim); margin-top: 2px; }
    .pals { display: flex; gap: 4px; margin-top: var(--sp-3); }

    /* --bone, not --volt. The box switcher put a permanent volt mark in the shell header, so this
       screen carried two accents — and athlete home is not on the design law's hero list (WOD
       board, leaderboard, PR page, live runner, TV), which caps plumbing at one. The switcher's
       mark keeps the slot because it answers "which gym are you in now"; this stays primary by
       size, weight and case instead of colour. */
    .empty-cta .cta-line { display: block; margin-top: var(--sp-2); font-family: var(--font-display);
      font-weight: 700; font-size: var(--fs-h2); text-transform: uppercase; color: var(--bone); }

    .teaser .pieces { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
    .piece { border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 5px 12px;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .piece.scored { color: var(--bone); font-weight: 600; }
    .done { color: var(--good); margin-left: 5px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--sp-3); }
    .stat { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-3) var(--sp-4); display: flex; flex-direction: column; gap: 2px; }
    .s-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .s-lab { font-size: var(--fs-sm); color: var(--faint); }
  `],
})
export class HomePage implements OnInit {
  private homeSvc = inject(HomeService);
  private prog = inject(ProgrammingService);
  private booking = inject(BookingService);

  home = signal<Home | null>(null);
  todayClass = signal<MyClass | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.homeSvc.home().subscribe({
      next: h => { this.home.set(h); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
    this.prog.myClassToday().subscribe({ next: tc => this.todayClass.set(tc), error: () => {} });
  }
}

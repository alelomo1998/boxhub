import { Component, inject, signal, computed, effect, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { BookingService, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { ClassCardComponent } from '../../ui/class-card.component';
import { WeekCalendarComponent, DayTone } from '../../ui/week-calendar.component';
import { tonesOf } from '../booking/session-tones';
import { sessionWindow, covers, SessionWindow, isPastDay } from '../booking/session-window';

/** Coach home: one day's classes at a time (same week strip as Book); tap into check-in or the builder. */
@Component({
  selector: 'bh-coach-classes',
  standalone: true,
  imports: [WeekCalendarComponent, ButtonComponent, ClassCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cls">
      <header class="head">
        <h1 class="title" i18n="@@coach.classes.title">Classes</h1>
        <bh-button variant="ghost" size="sm" route="/coach/announcements" testId="announce-link"><span i18n="@@coach.classes.announce">Announce</span></bh-button>
      </header>

      <bh-week-calendar [jump]="true" [(offset)]="dayOffset" [min]="-3650" [max]="13" [tones]="tones()" />

      @if (loading()) { <p class="stateline" i18n="@@coach.classes.loading">Loading classes…</p> }
      @else if (error()) {
        <p class="stateline err">
          <span i18n="@@coach.classes.loadError">Couldn't load.</span>
          <button class="retry" (click)="load()" i18n="@@coach.classes.retry">Try again</button>
        </p>
      } @else {
        <!-- aria-live, matching the admin schedule's session list. The strip announces the DAY it
             moved to, but the list under it changes silently — and this milestone is what made
             paging cheap enough to do repeatedly, so a screen-reader user now moves through days
             far more often with no idea what landed. -->
        <div class="list" aria-live="polite">
          @for (s of daySessions(); track s.id) {
            <bh-class-card
              [title]="s.name"
              [image]="s.imagePath"
              [coach]="s.coachName"
              [coachAvatar]="s.coachAvatarPath"
              [people]="s.people"
              [peopleCount]="s.bookedCount"
              [start]="s.startAt"
              [end]="endOf(s)"
              [suffix]="suffixFor(s)"
              [badgeLabel]="badgeLabelFor(s)"
              [badgeTone]="badgeToneFor(s)"
              [href]="['/coach/classes', s.id, 'checkin']"
              [tone]="isPastDay(s.startAt) ? 'past' : 'default'"
              actionsLayout="block"
              [testId]="'class-' + s.id">
              <div actions class="acts-row">
                @if (!isPastDay(s.startAt)) {
                  <bh-button class="full" variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'build']" testId="build-link"><span i18n="@@coach.classes.action.build">Build</span></bh-button>
                }
                <bh-button class="full" variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'checkin']" testId="checkin-link"><span i18n="@@coach.classes.action.checkin">Check-in</span></bh-button>
                @if (!isPastDay(s.startAt)) {
                  <bh-button class="full" variant="ghost" size="sm" [route]="['/coach/classes', s.id, 'run']" testId="run-link"><span i18n="@@coach.classes.action.run">Run</span></bh-button>
                }
              </div>
            </bh-class-card>
          } @empty {
            <div class="empty">
              <p class="e1" i18n="@@coach.classes.empty.title">No classes this day.</p>
              <p class="e2" i18n="@@coach.classes.empty.hint">Pick another day from the strip above — or schedule class types in the Types tab.</p>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .cls { max-width: 860px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .head { margin-bottom: var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 0; }
    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    /* Shape decision (spec §5.2, option B): the three coach actions don't fit alongside the strip's
       time + meta on one line (measured ~454px vs. a 328px card), so they take a full-width second
       line as equal thirds — the biggest, most thumb-reachable targets, for a coach standing on the
       gym floor. width:100% here only resolves against a full-width parent, which is why the card
       is given actionsLayout="block" above — see class-card.component.ts's .acts.block. Each
       bh-button also carries class="full" (its own existing :host(.full) rule) so the button fills
       its grid column instead of hugging its label text — otherwise the grid columns are equal
       but the visible pills inside them are not. */
    .acts-row { width: 100%; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--sp-2); }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class CoachClassesPage implements OnInit {
  private booking = inject(BookingService);

  private readonly publishedBadge = $localize`:@@coach.classes.badge.published:Published`;
  private readonly draftBadge = $localize`:@@coach.classes.badge.draft:Draft`;

  sessions = signal<SessionView[]>([]);
  loading = signal(true);
  error = signal(false);

  dayOffset = signal(0);

  /** The [from, to] this page last fetched — reloaded only when the selected day leaves it. */
  private window: SessionWindow = sessionWindow(0);

  daySessions = computed(() => {
    const d = new Date(); d.setDate(d.getDate() + this.dayOffset());
    const key = d.toDateString();
    return this.sessions().filter(s => new Date(s.startAt).toDateString() === key);
  });

  /** Per-day availability for the strip's dots, from sessions this page already fetched — no extra request. */
  readonly tones = computed<Record<string, DayTone>>(() => tonesOf(this.sessions()));

  constructor() {
    effect(() => {
      const offset = this.dayOffset();
      if (!covers(this.window, offset)) this.load();
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(false);
    this.window = sessionWindow(this.dayOffset());
    this.booking.listSessions(this.window.from.toISOString(), this.window.to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  protected readonly isPastDay = isPastDay;

  protected endOf(s: SessionView): string {
    return new Date(new Date(s.startAt).getTime() + s.durationMin * 60000).toISOString();
  }

  protected badgeLabelFor(s: SessionView): string {
    return s.programmingStatus === 'PUBLISHED' ? this.publishedBadge : this.draftBadge;
  }

  protected badgeToneFor(s: SessionView): 'neutral' | 'good' | 'warn' {
    return s.programmingStatus === 'PUBLISHED' ? 'good' : 'warn';
  }

  protected suffixFor(s: SessionView): string {
    return s.waitlistCount > 0
      ? $localize`:@@coach.classes.meta.bookedInLine:${s.bookedCount}:booked:/${s.capacity}:capacity: booked · ${s.waitlistCount}:count: in line`
      : $localize`:@@coach.classes.meta.booked:${s.bookedCount}:booked:/${s.capacity}:capacity: booked`;
  }
}

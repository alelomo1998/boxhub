import { Component, ElementRef, Injector, afterNextRender, inject, signal, computed, effect, OnInit, ChangeDetectionStrategy, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';
import { Observable } from 'rxjs';
import { BookingService, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';
import { ClassCardComponent } from '../../ui/class-card.component';
import { BannerComponent } from '../../ui/banner.component';
import { SheetComponent } from '../../ui/sheet.component';
import { WeekCalendarComponent, DayTone } from '../../ui/week-calendar.component';
import { tonesOf } from '../booking/session-tones';
import { sessionWindow, covers, SessionWindow } from '../booking/session-window';
import { athleteState, AthleteState, Action } from '../booking/class-state';
import { bookingReason } from '../booking/booking-reason';

function dayKey(d: Date): string { return d.toDateString(); } // local day, matches the coach view

/** Book a class: date pager + the shared class card, one per session of the selected day. */
@Component({
  selector: 'bh-book',
  standalone: true,
  imports: [ButtonComponent, ClassCardComponent, BannerComponent, SheetComponent, WeekCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="book">
      <h1 class="title" i18n="@@athlete.book.title">Book</h1>

      <bh-week-calendar [jump]="true" [(offset)]="dayOffset" [min]="-3650" [max]="13" [tones]="tones()" />

      @if (error()) { <p class="err" role="alert" data-testid="book-error">{{ error() }}</p> }

      @if (loading()) { <p class="stateline" i18n="@@athlete.book.loading">Loading classes…</p> }
      @else {
        <div class="cards" aria-live="polite">
          @for (s of daySessions(); track s.id) {
            <bh-class-card
              [title]="s.name"
              [image]="s.imagePath"
              [coach]="s.coachName"
              [coachAvatar]="s.coachAvatarPath"
              [people]="s.people"
              [peopleCount]="s.bookedCount"
              [emptyText]="emptyTextFor(s)"
              [start]="s.startAt"
              [end]="endOf(s)"
              [suffix]="suffixFor(s)"
              [badgeLabel]="badgeLabelFor(s)"
              [badgeTone]="badgeToneFor(s)"
              [href]="['/athlete/class', s.id]"
              [tone]="toneOf(s)"
              [testId]="'session-' + s.id">
              @let act = stateOf(s).action;
              <!-- Design law: the control that OPENS a destructive flow is a danger-bordered ghost
                   (Cancel / Leave waitlist); the confirm sheet's execute control is filled danger.
                   --good is a status colour, never an action, so Book is solid (--bone), not green. -->
              @if (act === 'book') {
                <bh-button actions variant="solid" size="sm" testId="book-btn" [disabled]="busy() === s.id" (click)="book(s)" i18n="@@athlete.book.action.book">Book</bh-button>
              } @else if (act === 'waitlist') {
                <bh-button actions variant="ghost" size="sm" testId="book-btn" [disabled]="busy() === s.id" (click)="book(s)" i18n="@@athlete.book.action.waitlist">Join waitlist</bh-button>
              } @else if (act === 'cancel') {
                <bh-button actions variant="ghost-danger" size="sm" testId="cancel-btn" [disabled]="busy() === s.id" (click)="openCancelConfirm(s)" i18n="@@athlete.book.action.cancel">Cancel</bh-button>
              } @else if (act === 'leave') {
                <bh-button actions variant="ghost-danger" size="sm" testId="cancel-btn" [disabled]="busy() === s.id" (click)="openCancelConfirm(s)" i18n="@@athlete.book.action.leave">Leave waitlist</bh-button>
              }
            </bh-class-card>
          } @empty {
            <div class="empty">
              <p class="e1" i18n="@@athlete.book.empty.title">No classes this day.</p>
              <p class="e2" i18n="@@athlete.book.empty.hint">Pick another day from the strip above.</p>
            </div>
          }
        </div>
      }

      <!-- A keyed loop, not @if on the signal directly: bh-alert's role="alert"/"status" only
           announces on FRESH insertion, so a second outcome overwriting the same signal value in
           place (as @if would do, since the expression never actually renders falsy in between —
           both set(null) and set({...}) run before Angular's next render) would silently not
           re-announce. Each outcome gets its own seq, so a new outcome is a genuinely new node. -->
      @for (b of bannerList(); track b.seq) {
        <bh-banner [tone]="b.tone" [message]="b.message" (dismissed)="banner.set(null)" />
      }

      <bh-sheet [open]="confirmItem() !== null" [title]="confirmTitle()" [label]="confirmTitle()"
                data-testid="book-cancel-confirm-sheet" (closed)="confirmItem.set(null)">
        @if (confirmItem(); as it) {
          <div class="confirm">
            <p class="c-line" data-testid="confirm-line">{{ confirmLine() }}</p>
            <p class="c-cost">{{ confirmCost() }}</p>
            <div class="c-actions">
              <bh-button class="full" variant="ghost" size="sm" testId="confirm-keep" (click)="keepConfirm()" i18n="@@athlete.book.confirm.keep">Keep it</bh-button>
              <bh-button class="full" variant="danger" size="sm" testId="confirm-execute" [loading]="busy() === it.s.id" (click)="confirmCancel()">{{ confirmExecuteLabel() }}</bh-button>
            </div>
          </div>
        }
      </bh-sheet>
    </section>
  `,
  styles: [`
    .book { max-width: 720px; margin: 0 auto; }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 0 0 var(--sp-4); }
    .stateline { color: var(--bone-dim); }
    .err { color: var(--danger); font-size: var(--fs-sm); }

    .cards { display: flex; flex-direction: column; gap: var(--sp-3); }

    .confirm { display: flex; flex-direction: column; gap: var(--sp-4); align-items: stretch; }
    .c-line { font-weight: 700; margin: 0; }
    .c-cost { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0; }
    .c-actions { display: flex; gap: var(--sp-3); }
    .c-actions bh-button { flex: 1; min-width: 0; }

    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class BookPage implements OnInit {
  private booking = inject(BookingService);
  private locale = inject(LOCALE_ID);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  private readonly attendedBadge = $localize`:@@athlete.book.badge.attended:✓ Attended`;
  private readonly bookedBadge = $localize`:@@athlete.book.badge.booked:Booked`;
  private readonly fullBadge = $localize`:@@athlete.book.badge.full:Full`;
  private readonly finishedSuffix = $localize`:@@athlete.book.suffix.finished:finished`;
  private readonly startedSuffix = $localize`:@@athlete.book.suffix.started:started`;
  private readonly emptyTextLabel = $localize`:@@athlete.book.card.empty:No one yet — be the first`;
  private readonly loadErrorText = $localize`:@@athlete.book.loadError:Couldn't load classes — try again.`;
  private readonly cancelConfirmTitle = $localize`:@@athlete.book.confirm.cancel.title:Cancel this booking?`;
  private readonly leaveConfirmTitle = $localize`:@@athlete.book.confirm.leave.title:Leave the waitlist?`;
  private readonly cancelConfirmCost = $localize`:@@athlete.book.confirm.cancel.cost:Your place is freed — someone on the waitlist may take it.`;
  private readonly leaveConfirmCost = $localize`:@@athlete.book.confirm.leave.cost:Your position is lost.`;
  private readonly cancelConfirmExecute = $localize`:@@athlete.book.confirm.cancel.execute:Cancel booking`;
  private readonly leaveConfirmExecute = $localize`:@@athlete.book.confirm.leave.execute:Leave waitlist`;

  readonly sessions = signal<SessionView[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly banner = signal<{ seq: number; tone: 'good' | 'danger'; message: string } | null>(null);
  private bannerSeq = 0;
  /** The session + action a Cancel/Leave-waitlist tap is confirming — null means the sheet is
   *  closed. Holding the whole item (not just an id) means the confirm copy keeps naming the
   *  right class/time even if `load()` re-fetches sessions while the sheet is open. */
  readonly confirmItem = signal<{ s: SessionView; act: 'cancel' | 'leave' } | null>(null);
  readonly bannerList = computed(() => {
    const b = this.banner();
    return b ? [b] : [];
  });
  readonly dayOffset = signal(0);

  /** The [from, to] this page last fetched — reloaded only when the selected day leaves it. */
  private window: SessionWindow = sessionWindow(0);

  readonly day = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + this.dayOffset());
    return d;
  });

  readonly daySessions = computed(() => {
    const key = dayKey(this.day());
    return this.sessions().filter(s => dayKey(new Date(s.startAt)) === key);
  });

  /** Per-day availability for the strip's dots, from sessions already fetched — no extra request. */
  readonly tones = computed<Record<string, DayTone>>(() => tonesOf(this.sessions()));

  constructor() {
    effect(() => {
      const offset = this.dayOffset();
      if (!covers(this.window, offset)) this.load();
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.window = sessionWindow(this.dayOffset());
    this.booking.listSessions(this.window.from.toISOString(), this.window.to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.loadErrorText); },
    });
  }

  protected stateOf(s: SessionView): AthleteState { return athleteState(s); }

  protected endOf(s: SessionView): string {
    return new Date(new Date(s.startAt).getTime() + s.durationMin * 60000).toISOString();
  }

  protected toneOf(s: SessionView): 'default' | 'past' {
    return this.stateOf(s).phase === 'finished' ? 'past' : 'default';
  }

  protected emptyTextFor(s: SessionView): string | null {
    return this.stateOf(s).phase === 'upcoming' ? this.emptyTextLabel : null;
  }

  protected badgeLabelFor(s: SessionView): string | null {
    const st = this.stateOf(s);
    if (st.mine === 'attended') return this.attendedBadge;
    if (st.mine === 'booked') return this.bookedBadge;
    if (st.mine === 'waitlist') return $localize`:@@athlete.book.badge.waitlist:Waitlist #${st.position}:position:`;
    if (st.action === 'waitlist') return this.fullBadge;
    return null;
  }

  protected badgeToneFor(s: SessionView): 'neutral' | 'good' | 'warn' {
    const st = this.stateOf(s);
    if (st.mine === 'attended') return 'good';
    if (st.action === 'waitlist') return 'warn';
    return 'neutral';
  }

  protected suffixFor(s: SessionView): string | null {
    const st = this.stateOf(s);
    if (st.phase === 'finished') return this.finishedSuffix;
    if (st.phase === 'started') return this.startedSuffix;
    if (st.mine === 'waitlist') return $localize`:@@athlete.book.suffix.ahead:${st.position! - 1}:count: ahead`;
    if (st.action === 'waitlist') return $localize`:@@athlete.book.suffix.inLine:${s.waitlistCount}:count: in line`;
    return $localize`:@@athlete.book.suffix.left:${st.spotsLeft}:count: left`;
  }

  protected book(s: SessionView) {
    const act = this.stateOf(s).action; // 'book' | 'waitlist' — captured before the reload changes it
    this.act(s, this.booking.book(s.id), () => this.outcomeMessage(s, act));
  }

  /** Cancel-btn / leave-btn tap: opens the confirm sheet, never calls the API directly. */
  protected openCancelConfirm(s: SessionView) {
    const act = this.stateOf(s).action as 'cancel' | 'leave';
    this.confirmItem.set({ s, act });
  }

  protected keepConfirm() {
    this.confirmItem.set(null);
    // No explicit refocus: the trigger button is untouched by "Keep it", and native <dialog>
    // close() already restores focus to it — same idiom as announcements.page's cancelConfirm().
  }

  protected confirmTitle(): string {
    const act = this.confirmItem()?.act;
    return act === 'leave' ? this.leaveConfirmTitle : this.cancelConfirmTitle;
  }

  protected confirmLine(): string {
    const it = this.confirmItem();
    if (!it) return '';
    return $localize`:@@athlete.book.confirm.line:${it.s.name}:class: · ${formatDate(it.s.startAt, 'HH:mm', this.locale)}:time:`;
  }

  protected confirmCost(): string {
    const act = this.confirmItem()?.act;
    return act === 'leave' ? this.leaveConfirmCost : this.cancelConfirmCost;
  }

  protected confirmExecuteLabel(): string {
    const act = this.confirmItem()?.act;
    return act === 'leave' ? this.leaveConfirmExecute : this.cancelConfirmExecute;
  }

  /** The sheet's filled-danger execute control. Guarded by `act()`'s own `busy()` check (loading
   *  drops the button out of the a11y tree via native `disabled`, so the guard can't live there
   *  alone). Closes the sheet on BOTH success and failure: `bh-sheet` opens the native <dialog>
   *  with showModal(), which puts it in the browser's top layer, and bh-banner is an ordinary
   *  position:fixed element — while the sheet stayed open a failure banner painted behind the
   *  dialog and its backdrop, so the athlete saw the cancel fail silently. */
  protected confirmCancel() {
    const it = this.confirmItem();
    if (!it) return;
    const { s, act } = it;
    this.act(s, this.booking.cancel(s.id), () => this.outcomeMessage(s, act), {
      tone: 'danger',
      afterSuccess: () => { this.confirmItem.set(null); this.focusSessionCard(s.id); },
      afterError: () => { this.confirmItem.set(null); this.focusSessionCard(s.id, { preferCancelBtn: true }); },
    });
  }

  /** Moves focus back onto the session card (or, on an error where nothing reloaded and the
   *  control is still there, back onto cancel-btn) once the sheet closes. A success reload swaps
   *  cancel-btn for book-btn or removes it, so the card itself — with a tabindex fallback, same
   *  idiom as danger.page.ts's focusField — is the only stable target there. afterNextRender, not
   *  queueMicrotask — see danger.page.ts for why. */
  private focusSessionCard(id: string, opts?: { preferCancelBtn?: boolean }) {
    afterNextRender(() => {
      const root = this.el.nativeElement;
      const target =
        (opts?.preferCancelBtn ? root.querySelector<HTMLElement>(`[data-testid="session-${id}"] [data-testid="cancel-btn"]`) : null)
        ?? root.querySelector<HTMLElement>(`[data-testid="session-${id}"]`);
      if (!target) return;
      if (!target.matches('input, button, a[href], select, textarea')) target.setAttribute('tabindex', '-1');
      target.focus();
    }, { injector: this.injector });
  }

  private outcomeMessage(s: SessionView, act: Action): string {
    switch (act) {
      case 'book':
        return $localize`:@@athlete.book.outcome.booked:Booked · ${s.name}:class: ${formatDate(s.startAt, 'HH:mm', this.locale)}:time:`;
      case 'waitlist':
        return $localize`:@@athlete.book.outcome.waitlisted:On the waitlist · ${s.name}:class:`;
      case 'cancel':
        return $localize`:@@athlete.book.outcome.cancelled:Cancelled · ${s.name}:class:`;
      case 'leave':
        return $localize`:@@athlete.book.outcome.left:Left the waitlist · ${s.name}:class:`;
      default:
        return '';
    }
  }

  private act(
    s: SessionView, call: Observable<unknown>, onSuccess: () => string,
    opts?: { tone?: 'good' | 'danger'; afterSuccess?: () => void; afterError?: () => void },
  ) {
    if (this.busy()) return;
    this.busy.set(s.id);
    call.subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
        this.banner.set({ seq: ++this.bannerSeq, tone: opts?.tone ?? 'good', message: onSuccess() });
        opts?.afterSuccess?.();
      },
      error: (e: any) => {
        this.busy.set(null);
        this.banner.set({ seq: ++this.bannerSeq, tone: 'danger', message: bookingReason(e.error?.detail) });
        opts?.afterError?.();
      },
    });
  }
}

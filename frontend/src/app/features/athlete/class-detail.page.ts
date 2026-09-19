import {
  Component, ElementRef, Injector, LOCALE_ID, OnDestroy, OnInit,
  ChangeDetectionStrategy, afterNextRender, computed, inject, signal,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingService, GridEntry, SessionDetail } from '../booking/booking.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { BannerComponent } from '../../ui/banner.component';
import { SheetComponent } from '../../ui/sheet.component';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { athleteState, AthleteState, Action } from '../booking/class-state';
import { bookingReason } from '../booking/booking-reason';

type ConfirmAct = 'cancel' | 'leave';

/**
 * Class detail — the first DETAIL screen (CLAUDE.md "A SCREEN THAT IS NOT A DOCK TAB..."): no
 * `<h1>` here, the shell header carries it (bh-athlete-shell reads ShellChromeService.detailTitle).
 * Photo hero (never repeats the name) -> coach -> Going / In queue grids -> one pinned full-width
 * action reclaiming the dock's gutter. The live/now accent is off this screen entirely (spec §5.3,
 * user-ruled) — the back control that replaced the switcher already spent that budget.
 *
 * SessionDetail has no myBookingStatus/myPosition/bookedCount — this page derives them from
 * active/queue (`me === true`) so athleteState() stays the single source of the booking rule.
 * No backend change (M17a Task 12a).
 */
@Component({
  selector: 'bh-class-detail',
  standalone: true,
  imports: [RouterLink, AvatarComponent, ButtonComponent, BannerComponent, SheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="detail">
      @switch (state()) {
        @case ('loading') { <p class="stateline" i18n="@@athlete.classDetail.loading">Loading class…</p> }
        @case ('error') {
          <div class="err-block">
            <p class="stateline err" role="alert" i18n="@@athlete.classDetail.loadError">Couldn't load this class.</p>
            <div class="err-actions">
              <bh-button variant="ghost" size="sm" testId="detail-retry" (click)="retry()" i18n="@@athlete.classDetail.retry">Try again</bh-button>
              <a class="backlink" routerLink="/athlete/book" i18n="@@athlete.classDetail.backToBook">Back to Book</a>
            </div>
          </div>
        }
        @default {
          @if (detail(); as d) {
            <div class="hero">
              @if (d.imagePath) {
                <img class="ph" [src]="d.imagePath" alt="" />
              } @else {
                <span class="initials" aria-hidden="true">{{ initials() }}</span>
              }
              @if (badgeLabel(); as bl) {
                <!-- Deliberately a local copy of bh-class-card's badge chip (~10 lines): bh-pill's
                     translucent fills are unreadable over a photo, and the chip is not yet its own
                     component — the third caller (this one) extracts it. -->
                <span class="badge" [class.good]="badgeTone() === 'good'" [class.warn]="badgeTone() === 'warn'">{{ bl }}</span>
              }
              <span class="eyebrow">{{ eyebrow() }}</span>
            </div>

            @if (d.coach; as c) {
              <div class="coach">
                <bh-avatar [path]="c.avatarPath" [name]="c.name" size="lg" />
                <div class="c-who">
                  <span class="c-k" i18n="@@athlete.classDetail.coach">Coach</span>
                  <span class="c-v">{{ c.name }}</span>
                </div>
              </div>
            }

            <h2 class="sh"><span i18n="@@athlete.classDetail.going">Going</span> <span class="cnt">{{ d.active.length }}/{{ d.capacity }}</span></h2>
            @if (d.active.length) {
              <div class="grid" data-testid="class-grid">
                @for (a of d.active; track a.membershipId) {
                  <a class="cell" [routerLink]="['/athlete/profile', a.membershipId]" [attr.aria-label]="cellAriaLabel(a)">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" />
                    <span class="nm" aria-hidden="true">{{ a.name }}</span>
                    @if (a.status === 'CHECKED_IN') { <span class="in" aria-hidden="true">{{ checkedInMarker }}</span> }
                  </a>
                }
              </div>
            } @else { <p class="stateline" i18n="@@athlete.classDetail.emptyActive">No one booked yet — be first.</p> }

            @if (d.queue.length) {
              <h2 class="sh" i18n="@@athlete.classDetail.queue">In queue</h2>
              <div class="grid dim">
                @for (a of d.queue; track a.membershipId) {
                  <a class="cell" [routerLink]="['/athlete/profile', a.membershipId]">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" />
                    <span class="nm" aria-hidden="true">{{ a.name }}</span>
                  </a>
                }
              </div>
            }

            <div class="barspace" aria-hidden="true"></div>
          }
        }
      }
    </section>

    @if (detail(); as d) {
      <div class="actionbar">
        @let st = athleteState();
        @if (st?.action; as act) {
          <bh-button size="lg" class="full" testId="detail-action" [variant]="actionVariant(act)"
                     [loading]="busy()" (click)="onAction(act)">{{ actionLabel(act) }}</bh-button>
        } @else {
          <p class="statetext" tabindex="-1">{{ stateText() }}</p>
        }
        @if (errorMsg(); as em) { <p class="inlineerr" role="alert" data-testid="detail-error">{{ em }}</p> }
      </div>
    }

    @for (b of bannerList(); track b.seq) {
      <bh-banner [tone]="b.tone" [message]="b.message" (dismissed)="banner.set(null)" />
    }

    <bh-sheet [open]="confirmItem() !== null" [title]="confirmTitle()" [label]="confirmTitle()"
              data-testid="detail-cancel-confirm-sheet" (closed)="confirmItem.set(null)">
      @if (confirmItem()) {
        <div class="confirm">
          <p class="c-line" data-testid="confirm-line">{{ confirmLine() }}</p>
          <p class="c-cost">{{ confirmCost() }}</p>
          <div class="c-actions">
            <bh-button class="full" variant="ghost" size="sm" testId="confirm-keep" (click)="keepConfirm()" i18n="@@athlete.book.confirm.keep">Keep it</bh-button>
            <bh-button class="full" variant="danger" size="sm" testId="confirm-execute" [loading]="busy()" (click)="confirmCancel()">{{ confirmExecuteLabel() }}</bh-button>
          </div>
        </div>
      }
    </bh-sheet>
  `,
  styles: [`
    .detail { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); padding: 0 var(--sp-4); }
    .stateline.err { color: var(--danger); }
    .err-block { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3); padding: 0 var(--sp-4); }
    .err-actions { display: flex; align-items: center; gap: var(--sp-3); }
    .backlink { color: var(--bone); text-decoration: underline; }

    .hero { position: relative; height: 260px; background: var(--surface-2); overflow: hidden; }
    .hero .ph { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero::after { content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, transparent 30%, var(--scrim-card) 60%, var(--scrim-card) 100%); }
    /* Centred, not top-right like bh-class-card's: the badge also sits top-right and at this
       hero's 40px type the two overlap. A 260px hero has the room the 170px card does not. */
    .hero .initials { position: absolute; inset: 0; display: grid; place-items: center;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      color: var(--hairline); text-transform: uppercase; }
    /* Local copy of bh-class-card's badge chip (comment above the markup explains why). */
    .badge { position: absolute; top: var(--sp-3); right: var(--sp-3); z-index: 1;
      display: inline-flex; align-items: center; height: 24px; padding: 0 var(--sp-2);
      border-radius: var(--r-full); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
      background: var(--scrim-text); border: 1px solid var(--hairline); color: var(--bone); }
    .badge.good { color: var(--good); border-color: var(--good); }
    .badge.warn { color: var(--warn); border-color: var(--warn); }
    /* --bone, not --faint or --bone-dim: measured 3.39:1 against --scrim-card over a pure-white
       stress-case photo (--bone-dim measures only 1.68:1 there) — below AA's 4.5:1 but the best of
       the tokens available on this deliberately light scrim, the same accepted risk bh-class-card's
       own title text already carries on this identical gradient (see its "known cost" comment). */
    .eyebrow { position: absolute; left: var(--sp-4); right: var(--sp-4); bottom: var(--sp-4); z-index: 1;
      font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--bone); }

    .coach { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);
      border-bottom: 1px solid var(--hairline); }
    .c-who { display: flex; flex-direction: column; }
    .c-k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--faint); }
    .c-v { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body); }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-sm);
      text-transform: uppercase; letter-spacing: 0.08em; color: var(--bone-dim);
      margin: var(--sp-5) var(--sp-4) var(--sp-2); display: flex; align-items: baseline; gap: var(--sp-2); }
    .cnt { font-family: var(--font-mono); color: var(--bone); letter-spacing: 0; font-variant-numeric: tabular-nums; }

    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-3) var(--sp-2); padding: 0 var(--sp-4); }
    .grid.dim { opacity: 0.6; }
    .cell { display: flex; flex-direction: column; align-items: center; gap: var(--sp-1); min-width: 0;
      text-decoration: none; color: inherit; }
    .cell:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-ctl); }
    .nm { font-size: var(--fs-meta); color: var(--bone-dim); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; max-width: 100%; text-align: center; }
    /* Glyph + localized word carries the state, not colour alone; the cell's aria-label already
       says "checked in" so this marker stays aria-hidden and purely visual. */
    .in { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--good); }

    .barspace { height: calc(var(--tap-lg) + var(--sp-3) + var(--sp-4) + env(safe-area-inset-bottom)); }
    .actionbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6;
      padding: var(--sp-3) var(--sp-4) calc(var(--sp-4) + env(safe-area-inset-bottom));
      background: var(--surface); border-top: 1px solid var(--hairline); box-shadow: var(--shadow-float); }
    .statetext { margin: 0; min-height: var(--tap-lg); display: flex; align-items: center;
      justify-content: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-body); color: var(--bone-dim); }
    .inlineerr { color: var(--danger); font-size: var(--fs-sm); margin: var(--sp-2) 0 0; text-align: center; }

    .confirm { display: flex; flex-direction: column; gap: var(--sp-4); align-items: stretch; }
    .c-line { font-weight: 700; margin: 0; }
    .c-cost { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0; }
    .c-actions { display: flex; gap: var(--sp-3); }
    .c-actions bh-button { flex: 1; min-width: 0; }
  `],
})
export class ClassDetailPage implements OnInit, OnDestroy {
  private booking = inject(BookingService);
  private route = inject(ActivatedRoute);
  private locale = inject(LOCALE_ID);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);
  protected chrome = inject(ShellChromeService);

  private readonly attendedBadge = $localize`:@@athlete.classDetail.badge.attended:✓ Attended`;
  private readonly bookedBadge = $localize`:@@athlete.classDetail.badge.booked:Booked`;
  private readonly fullBadge = $localize`:@@athlete.classDetail.badge.full:Full`;
  protected readonly checkedInMarker = $localize`:@@athlete.classDetail.checkedIn:✓ in`;
  private readonly checkedInAriaSuffix = $localize`:@@athlete.classDetail.checkedInAria:, checked in`;
  private readonly finishedText = $localize`:@@athlete.classDetail.state.finished:Finished`;
  private readonly attendedText = $localize`:@@athlete.classDetail.state.attended:You're in`;
  private readonly bookLabel = $localize`:@@athlete.classDetail.action.book:Book`;
  private readonly waitlistLabel = $localize`:@@athlete.classDetail.action.waitlist:Join waitlist`;
  private readonly cancelLabel = $localize`:@@athlete.classDetail.action.cancel:Cancel booking`;
  private readonly leaveLabel = $localize`:@@athlete.classDetail.action.leave:Leave waitlist`;
  // Copy-identical to book.page's confirm sheet — same @@ids so translation is not duplicated.
  private readonly cancelConfirmTitle = $localize`:@@athlete.book.confirm.cancel.title:Cancel this booking?`;
  private readonly leaveConfirmTitle = $localize`:@@athlete.book.confirm.leave.title:Leave the waitlist?`;
  private readonly cancelConfirmCost = $localize`:@@athlete.book.confirm.cancel.cost:Your place is freed — someone on the waitlist may take it.`;
  private readonly leaveConfirmCost = $localize`:@@athlete.book.confirm.leave.cost:Your position is lost.`;
  private readonly cancelConfirmExecute = $localize`:@@athlete.book.confirm.cancel.execute:Cancel booking`;
  private readonly leaveConfirmExecute = $localize`:@@athlete.book.confirm.leave.execute:Leave waitlist`;

  private id!: string;

  readonly detail = signal<SessionDetail | null>(null);
  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly banner = signal<{ seq: number; tone: 'good' | 'danger'; message: string } | null>(null);
  private bannerSeq = 0;
  readonly bannerList = computed(() => { const b = this.banner(); return b ? [b] : []; });
  readonly confirmItem = signal<{ act: ConfirmAct } | null>(null);

  protected readonly athleteState = computed<AthleteState | null>(() => {
    const d = this.detail();
    if (!d) return null;
    const mine = this.mineOf(d);
    return athleteState({
      startAt: d.startAt, capacity: d.capacity, bookedCount: d.active.length,
      myBookingStatus: mine.status, myPosition: mine.position,
    });
  });

  protected readonly initials = computed(() => {
    const d = this.detail();
    return d ? d.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '';
  });

  protected readonly eyebrow = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const end = new Date(new Date(d.startAt).getTime() + d.durationMin * 60000).toISOString();
    const date = formatDate(d.startAt, 'EEE d MMM', this.locale);
    const start = formatDate(d.startAt, 'HH:mm', this.locale);
    const endS = formatDate(end, 'HH:mm', this.locale);
    return $localize`:@@athlete.classDetail.eyebrow:${date}:date: · ${start}:start:–${endS}:end: · ${d.durationMin}:duration:′`;
  });

  protected readonly badgeLabel = computed<string | null>(() => {
    const st = this.athleteState();
    if (!st) return null;
    if (st.mine === 'attended') return this.attendedBadge;
    if (st.mine === 'booked') return this.bookedBadge;
    if (st.mine === 'waitlist') return $localize`:@@athlete.classDetail.badge.waitlist:Waitlist #${st.position}:position:`;
    if (st.action === 'waitlist') return this.fullBadge;
    return null;
  });

  protected readonly badgeTone = computed<'neutral' | 'good' | 'warn'>(() => {
    const st = this.athleteState();
    if (!st) return 'neutral';
    if (st.mine === 'attended') return 'good';
    if (st.action === 'waitlist') return 'warn';
    return 'neutral';
  });

  protected readonly stateText = computed(() => {
    const st = this.athleteState();
    const d = this.detail();
    if (!st || !d) return '';
    if (st.phase === 'finished') return this.finishedText;
    if (st.phase === 'started') return $localize`:@@athlete.classDetail.state.started:Started ${formatDate(d.startAt, 'HH:mm', this.locale)}:time:`;
    if (st.mine === 'attended') return this.attendedText;
    return '';
  });

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  ngOnDestroy() {
    // Belt and braces: ShellChromeService also clears this on the next NavigationEnd that leaves
    // a detail route, but a screen owning its own title should not depend solely on that.
    this.chrome.detailTitle.set(null);
  }

  load() {
    this.state.set('loading');
    this.booking.sessionDetail(this.id).subscribe({
      next: d => { this.detail.set(d); this.chrome.detailTitle.set(d.name); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  protected retry() { this.load(); }

  /** `mine` is not on SessionDetail — derive it from the active/queue rows the way spec §5.3
   *  and the plan's Task 12 both prescribe, so athleteState() stays the one place the rule lives. */
  private mineOf(d: SessionDetail): { status: string | null; position: number | null } {
    const activeMine = d.active.find(a => a.me);
    if (activeMine) return { status: activeMine.status, position: null };
    const qIdx = d.queue.findIndex(a => a.me);
    if (qIdx >= 0) return { status: 'WAITLIST', position: qIdx + 1 };
    return { status: null, position: null };
  }

  protected cellAriaLabel(a: GridEntry): string {
    return a.status === 'CHECKED_IN' ? a.name + this.checkedInAriaSuffix : a.name;
  }

  protected actionVariant(act: Exclude<Action, null>): 'strong' | 'ghost' | 'ghost-danger' {
    if (act === 'book') return 'strong';
    if (act === 'waitlist') return 'ghost';
    return 'ghost-danger'; // cancel | leave
  }

  protected actionLabel(act: Exclude<Action, null>): string {
    switch (act) {
      case 'book': return this.bookLabel;
      case 'waitlist': return this.waitlistLabel;
      case 'cancel': return this.cancelLabel;
      case 'leave': return this.leaveLabel;
      default: return '';
    }
  }

  private outcomeMessage(act: Action): string {
    const name = this.detail()?.name ?? '';
    switch (act) {
      case 'book': return $localize`:@@athlete.classDetail.outcome.booked:Booked · ${name}:class:`;
      case 'waitlist': return $localize`:@@athlete.classDetail.outcome.waitlisted:On the waitlist · ${name}:class:`;
      case 'cancel': return $localize`:@@athlete.classDetail.outcome.cancelled:Cancelled · ${name}:class:`;
      case 'leave': return $localize`:@@athlete.classDetail.outcome.left:Left the waitlist · ${name}:class:`;
      default: return '';
    }
  }

  /** Book / Join waitlist call the API directly; Cancel / Leave open the confirm sheet first —
   *  same split as book.page. Handler-level guard: never rely on the button's [disabled] alone. */
  protected onAction(act: Exclude<Action, null>) {
    if (this.busy()) return;
    if (act === 'cancel' || act === 'leave') { this.confirmItem.set({ act }); return; }
    this.busy.set(true);
    this.booking.book(this.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.errorMsg.set(null);
        this.banner.set({ seq: ++this.bannerSeq, tone: 'good', message: this.outcomeMessage(act) });
        this.reload(() => this.focusAction());
      },
      error: (e: any) => {
        this.busy.set(false);
        const msg = bookingReason(e.error?.detail);
        this.errorMsg.set(msg);
        this.banner.set({ seq: ++this.bannerSeq, tone: 'danger', message: msg });
        this.focusAction();
      },
    });
  }

  protected keepConfirm() { this.confirmItem.set(null); }

  protected confirmTitle(): string {
    return this.confirmItem()?.act === 'leave' ? this.leaveConfirmTitle : this.cancelConfirmTitle;
  }

  protected confirmLine(): string {
    const d = this.detail();
    if (!d) return '';
    return $localize`:@@athlete.book.confirm.line:${d.name}:class: · ${formatDate(d.startAt, 'HH:mm', this.locale)}:time:`;
  }

  protected confirmCost(): string {
    return this.confirmItem()?.act === 'leave' ? this.leaveConfirmCost : this.cancelConfirmCost;
  }

  protected confirmExecuteLabel(): string {
    return this.confirmItem()?.act === 'leave' ? this.leaveConfirmExecute : this.cancelConfirmExecute;
  }

  /** The sheet's filled-danger execute control — same reasoning as book.page's confirmCancel:
   *  closes the sheet on BOTH success and failure so a failure banner is never hidden behind the
   *  dialog's top layer. */
  protected confirmCancel() {
    const it = this.confirmItem();
    if (!it || this.busy()) return;
    this.busy.set(true);
    this.booking.cancel(this.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmItem.set(null);
        this.errorMsg.set(null);
        this.banner.set({ seq: ++this.bannerSeq, tone: 'danger', message: this.outcomeMessage(it.act) });
        this.reload(() => this.focusAction());
      },
      error: (e: any) => {
        this.busy.set(false);
        this.confirmItem.set(null);
        const msg = bookingReason(e.error?.detail);
        this.errorMsg.set(msg);
        this.banner.set({ seq: ++this.bannerSeq, tone: 'danger', message: msg });
        this.focusAction();
      },
    });
  }

  private reload(after?: () => void) {
    this.booking.sessionDetail(this.id).subscribe({
      next: d => { this.detail.set(d); this.chrome.detailTitle.set(d.name); after?.(); },
      error: () => after?.(),
    });
  }

  /** Keeps focus on the action (or the state text that replaced it) after a reload — same idiom
   *  as book.page's focusSessionCard: tabindex="-1" on a non-focusable target first. */
  private focusAction() {
    afterNextRender(() => {
      const root = this.el.nativeElement;
      const target = root.querySelector<HTMLElement>('[data-testid="detail-action"]')
        ?? root.querySelector<HTMLElement>('.statetext');
      if (!target) return;
      if (!target.matches('input, button, a[href], select, textarea')) target.setAttribute('tabindex', '-1');
      target.focus();
    }, { injector: this.injector });
  }
}

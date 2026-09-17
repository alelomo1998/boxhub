import { Component, ChangeDetectionStrategy, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { BookingService, SessionDetail } from '../booking/booking.service';
import { SheetComponent } from '../../ui/sheet.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { EmptyComponent } from '../../ui/empty.component';

type FetchState = 'loading' | 'error' | 'ready';

/**
 * Admin class-detail sheet: mounted permanently on `schedule.page.ts`'s `openSessionId` seam.
 * One request — `sessionDetail(id)` already carries every roster row's name/avatar/status, so
 * this does not also call `roster()` (that endpoint only adds email/bookingId, unused here).
 */
@Component({
  selector: 'bh-admin-class-detail',
  standalone: true,
  imports: [DatePipe, SheetComponent, AvatarComponent, ButtonComponent, AlertComponent, EmptyComponent],
  template: `
    <bh-sheet [open]="open()" [title]="sheetTitle()" [label]="sheetTitle()"
              data-testid="admin-class-detail-sheet" (closed)="closed.emit()">
      @switch (state()) {
        @case ('loading') {
          <p class="stateline" i18n="@@admin.classDetail.loading">Loading class…</p>
        }
        @case ('error') {
          <p class="stateline err">
            <span i18n="@@admin.classDetail.error">Couldn't load this class.</span>
            <button class="retry" type="button" (click)="retry()" i18n="@@admin.classDetail.retry">Try again</button>
          </p>
        }
        @default {
          @if (detail(); as d) {
            <!-- No name heading here: bh-sheet's own title already IS the class name, and
                 rendering it twice stacked "WOD CLASS" directly under "WOD CLASS". The eyebrow
                 carries what the title cannot — when it runs and for how long. -->
            <div class="head">
              <span class="eyebrow num">{{ d.startAt | date:'EEEE d MMMM · HH:mm' }} · {{ durationLabel(d) }}</span>
            </div>

            <div class="coach">
              @if (d.coach; as c) {
                <bh-avatar [path]="c.avatarPath" [name]="c.name" size="md" />
                <div class="coach-who">
                  <span class="k" i18n="@@admin.classDetail.coach.label">Coach</span>
                  <span class="v">{{ c.name }}</span>
                </div>
              } @else {
                <span class="nocoach" i18n="@@admin.classDetail.coach.none">No coach assigned</span>
              }
            </div>

            <div class="counts">
              <span class="cnt num" data-testid="admin-class-detail-booked-count"
                    i18n="@@admin.classDetail.counts.booked">{{ d.active.length }}/{{ d.capacity }} booked</span>
              <span class="cnt num" data-testid="admin-class-detail-waitlist-count"
                    i18n="@@admin.classDetail.counts.waitlist">{{ d.queue.length }} waitlisted</span>
            </div>

            <h4 class="sh" i18n="@@admin.classDetail.roster.active">Booked</h4>
            @if (d.active.length) {
              <div class="roster" data-testid="admin-class-detail-roster">
                @for (a of d.active; track a.membershipId) {
                  <div class="row" [attr.data-testid]="'roster-active-' + a.membershipId">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="sm" />
                    <span class="row-nm">{{ a.name }}</span>
                    @if (a.status === 'CHECKED_IN') {
                      <span class="row-in" i18n="@@admin.classDetail.roster.checkedIn">Checked in</span>
                    }
                  </div>
                }
              </div>
            } @else {
              <bh-empty icon="users" [title]="rosterEmptyTitle" data-testid="admin-class-detail-roster-empty" />
            }

            @if (d.queue.length) {
              <h4 class="sh" i18n="@@admin.classDetail.roster.queue">Waitlist</h4>
              <div class="roster" data-testid="admin-class-detail-queue">
                @for (a of d.queue; track a.membershipId) {
                  <div class="row dim" [attr.data-testid]="'roster-queue-' + a.membershipId">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="sm" />
                    <span class="row-nm">{{ a.name }}</span>
                  </div>
                }
              </div>
            }

            <div class="actions">
              @if (!isPast(d)) {
                <bh-button variant="solid" size="lg" class="full" (click)="openBuilder()" testId="admin-class-detail-builder">
                  <span i18n="@@admin.classDetail.builder">Open in builder</span>
                </bh-button>

                @if (!confirmingCancel()) {
                  <bh-button variant="ghost-danger" size="lg" class="full" (click)="openCancelConfirm()"
                             testId="admin-class-detail-cancel-open">
                    <span i18n="@@admin.classDetail.cancel.open">Cancel this class</span>
                  </bh-button>
                } @else {
                  <bh-alert tone="warn" data-testid="admin-class-detail-cancel-confirm">
                    <!-- Interpolation, not the MessageFormat "#" placeholder: Angular's ICU does
                         NOT substitute #, it renders the character. This confirm would have read
                         "notifies # people" — on the one control that mails the whole roster. -->
                    <span i18n="@@admin.classDetail.cancel.confirm.body">{d.active.length + d.queue.length, plural, =0 {This cancels the class. No one is booked yet, so no one is notified.} =1 {This cancels the class and notifies 1 person — booked or waitlisted.} other {This cancels the class and notifies {{ d.active.length + d.queue.length }} people — booked or waitlisted.}}</span>
                  </bh-alert>

                  @if (cancelError()) {
                    <p class="err" role="alert" data-testid="admin-class-detail-cancel-error">{{ cancelError() }}</p>
                  }

                  <bh-button variant="ghost" size="lg" class="full" (click)="keepClass()" testId="admin-class-detail-cancel-keep">
                    <span i18n="@@admin.classDetail.cancel.keep">Keep it</span>
                  </bh-button>
                  <bh-button variant="danger" size="lg" class="full" [loading]="cancelling()" (click)="confirmCancel()"
                             testId="admin-class-detail-cancel-confirm-btn">
                    @if (!cancelling()) { <span i18n="@@admin.classDetail.cancel.confirmAction">Yes, cancel class</span> }
                  </bh-button>
                }
              }
            </div>
          }
        }
      }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0 0 var(--sp-3); }

    .head { margin-bottom: var(--sp-4); }
    .eyebrow { display: block; font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }

    .coach { display: flex; align-items: center; gap: var(--sp-3); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface-2); padding: var(--sp-3) var(--sp-4);
      margin-bottom: var(--sp-4); min-height: var(--tap); }
    .coach-who { display: flex; flex-direction: column; min-width: 0; }
    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    .v { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nocoach { color: var(--faint); font-size: var(--fs-sm); }

    .counts { display: flex; gap: var(--sp-4); margin-bottom: var(--sp-5); flex-wrap: wrap; }
    .cnt { font-size: var(--fs-sm); color: var(--bone-dim); }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body);
      text-transform: uppercase; margin: var(--sp-4) 0 var(--sp-3); }

    .roster { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-2); }
    .row { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap);
      padding: var(--sp-2) var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      background: var(--surface); }
    .row.dim { opacity: .7; }
    .row-nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-in { flex-shrink: 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.04em; text-transform: uppercase; color: var(--good); }

    .actions { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-4); }
  `],
})
export class ClassDetailSheet {
  private booking = inject(BookingService);
  private router = inject(Router);

  sessionId = input<string | null>(null);
  open = input(false);
  closed = output<void>();
  changed = output<void>();

  protected detail = signal<SessionDetail | null>(null);
  protected state = signal<FetchState>('loading');
  protected confirmingCancel = signal(false);
  protected cancelling = signal(false);
  protected cancelError = signal<string | null>(null);

  protected readonly rosterEmptyTitle = $localize`:@@admin.classDetail.roster.empty:No one booked yet`;
  private readonly fallbackTitle = $localize`:@@admin.classDetail.title:Class details`;
  private readonly cancelFailedError = $localize`:@@admin.classDetail.cancel.failed:Couldn't cancel — try again.`;

  protected readonly sheetTitle = computed(() => this.detail()?.name ?? this.fallbackTitle);

  constructor() {
    // Fires only when the sheet is open with a session to show, and re-runs whenever either
    // signal changes — so opening a second class while the sheet stays mounted re-fetches
    // instead of showing the previous session's detail.
    effect(() => {
      const isOpen = this.open();
      const id = this.sessionId();
      if (!isOpen || !id) return;
      this.load(id);
    });
  }

  private load(id: string): void {
    this.state.set('loading');
    // Clearing `detail` is what keeps the TITLE honest, not just the body. sheetTitle() reads
    // detail()?.name, so opening a second class while the first is still loaded would show the
    // PREVIOUS class's name in the header over a "Loading class…" body. The body switches on
    // state() and looked right, which is exactly why this survived review.
    this.detail.set(null);
    this.confirmingCancel.set(false);
    this.cancelError.set(null);
    this.booking.sessionDetail(id).subscribe({
      next: d => { this.detail.set(d); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  protected retry(): void {
    const id = this.sessionId();
    if (id) this.load(id);
  }

  protected durationLabel(d: SessionDetail): string {
    return $localize`:@@admin.classDetail.meta.duration:${d.durationMin}:duration: min`;
  }

  /** A session is past when its start is on a calendar day before today (local time) — today's
   *  classes keep every action, so this is day-level, not "already started". */
  protected isPast(d: SessionDetail): boolean {
    const start = new Date(d.startAt);
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return day.getTime() < today.getTime();
  }

  protected openCancelConfirm(): void {
    this.confirmingCancel.set(true);
  }

  protected keepClass(): void {
    this.confirmingCancel.set(false);
  }

  /** The guard lives here, not only on the button's [loading]/[disabled] — a disabled button
   *  guards one path, never the action itself. */
  protected confirmCancel(): void {
    if (this.cancelling()) return;
    const id = this.sessionId();
    if (!id) return;
    this.cancelling.set(true);
    this.cancelError.set(null);
    this.booking.patchSession(id, { status: 'CANCELLED' }).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.changed.emit();
        this.closed.emit();
      },
      error: () => {
        this.cancelling.set(false);
        this.cancelError.set(this.cancelFailedError);
      },
    });
  }

  /**
   * An in-shell route change does NOT destroy the shell, so a sheet left open stays open behind
   * the screen we navigated to. Close it explicitly before routing into the builder.
   */
  protected openBuilder(): void {
    const id = this.sessionId();
    this.closed.emit();
    if (id) this.router.navigate(['/coach/classes', id, 'build']);
  }
}

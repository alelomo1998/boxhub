import { Component, ChangeDetectionStrategy, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BookingService, ClassTemplate, SessionView } from '../booking/booking.service';
import { tonesOf } from '../booking/session-tones';
import { WeekCalendarComponent, DayTone } from '../../ui/week-calendar.component';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { SelectComponent } from '../../ui/select.component';
import { SwitchComponent } from '../../ui/switch.component';
import { SheetComponent } from '../../ui/sheet.component';
import { AlertComponent } from '../../ui/alert.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { ClassDetailSheet } from './class-detail.sheet';

type FetchState = 'loading' | 'error' | 'ready';

/** Exactly the fields this screen ever writes — narrower than `Partial<ClassTemplate>`, whose
 *  `imagePath` is nullable and doesn't match `patchTemplate`'s `imagePath?: string`. */
type SlotPatch = { name: string; weekday: number; startTime: string; durationMin: number; capacity: number; active?: boolean };

/**
 * Admin schedule: week calendar -> that day's sessions -> tap a session to open
 * `bh-admin-class-detail` (roster, coach, cancel, builder link) -> weekly templates as tappable
 * rows, each opening a slot editor in a `bh-sheet`.
 *
 * Rebuilt off the old template-driven submit binding, a native weekday `<select>`, a cramped
 * inline row of bare inputs and a `bh-data-table` of "next two weeks" — all banned by the M13d form
 * contract and the mobile-first rule. See M14b Task 9.
 */
@Component({
  selector: 'bh-admin-schedule',
  standalone: true,
  imports: [DatePipe, WeekCalendarComponent, ButtonComponent, FieldComponent, SelectComponent,
    SwitchComponent, SheetComponent, AlertComponent, EmptyComponent, IconComponent, ClassDetailSheet],
  template: `
    <section class="sched" data-testid="admin-schedule-root">
      <header class="head">
        <span class="eyebrow" i18n="@@admin.schedule.eyebrow">Your gym</span>
        <h1 class="title" i18n="@@admin.schedule.title">Schedule</h1>
      </header>

      <bh-week-calendar [(offset)]="dayOffset" [max]="13" [tones]="tones()" />

      @switch (sessionsState()) {
        @case ('loading') {
          <p class="stateline" i18n="@@admin.schedule.sessions.loading">Loading classes…</p>
        }
        @case ('error') {
          <p class="stateline err">
            <span i18n="@@admin.schedule.sessions.error">Couldn't load classes.</span>
            <button class="retry" type="button" (click)="loadSessions()" i18n="@@admin.schedule.sessions.retry">Try again</button>
          </p>
        }
        @default {
          @if (daySessions().length === 0) {
            <bh-empty data-testid="schedule-sessions-empty" icon="calendar" [title]="sessionsEmptyTitle" [message]="sessionsEmptyMessage" />
          } @else {
            <div class="list" aria-live="polite">
              @for (s of daySessions(); track s.id) {
                <button type="button" class="row" [attr.data-testid]="'session-' + s.id" (click)="openSession(s)">
                  <span class="time num">{{ s.startAt | date:'HH:mm' }}</span>
                  <div class="mid">
                    <span class="nm">{{ s.name }}</span>
                    <span class="sub num">{{ sessionMeta(s) }}</span>
                  </div>
                  <bh-icon name="chevron-right" [size]="18" class="chev" />
                </button>
              }
            </div>
          }
        }
      }

      <section class="templates">
        <div class="thead">
          <h2 class="t-h2" i18n="@@admin.schedule.templates.heading">Weekly templates</h2>
          <bh-button variant="solid" size="sm" (click)="openCreate()" testId="schedule-add-slot">
            <span i18n="@@admin.schedule.templates.add">Add slot</span>
          </bh-button>
        </div>

        @switch (templatesState()) {
          @case ('loading') {
            <p class="stateline" i18n="@@admin.schedule.templates.loading">Loading templates…</p>
          }
          @case ('error') {
            <p class="stateline err">
              <span i18n="@@admin.schedule.templates.error">Couldn't load templates.</span>
              <button class="retry" type="button" (click)="loadTemplates()" i18n="@@admin.schedule.templates.retry">Try again</button>
            </p>
          }
          @default {
            @if (templates().length === 0) {
              <bh-empty data-testid="schedule-templates-empty" icon="calendar-plus" [title]="templatesEmptyTitle" [message]="templatesEmptyMessage" />
            } @else {
              <div class="tlist">
                @for (t of templates(); track t.id) {
                  <button type="button" class="trow" [class.off]="!t.active" [attr.data-testid]="'template-' + t.id"
                          (click)="openEdit(t)">
                    <div class="tmid">
                      <span class="tnm">{{ dayLabels[t.weekday] }} {{ t.startTime }} · {{ t.name }}</span>
                      <span class="tsub num">{{ templateMeta(t) }}</span>
                    </div>
                    @if (!t.active) { <span class="badge" data-testid="template-inactive">{{ inactiveLabel }}</span> }
                    <bh-icon name="chevron-right" [size]="18" class="chev" />
                  </button>
                }
              </div>
            }
          }
        }
      </section>

      <bh-admin-class-detail [sessionId]="openSessionId()" [open]="openSessionId() !== null"
                             (closed)="onClassDetailClosed()" (changed)="loadSessions()" />

      <bh-sheet [open]="sheetOpen()" [title]="sheetTitle()" [label]="sheetTitle()"
                data-testid="schedule-slot-sheet" (closed)="onSheetClosed()">
        <form class="sform" data-testid="schedule-slot-form" (submit)="submit($event)" novalidate>
          <bh-field label="Class name" i18n-label="@@admin.schedule.field.name"
                     [(value)]="formName" testId="schedule-name" name="scheduleName" [required]="true" />

          <bh-select label="Day" i18n-label="@@admin.schedule.field.weekday"
                     [(value)]="formWeekday" testId="schedule-weekday" name="scheduleWeekday">
            @for (d of dayLabels; track d; let i = $index) {
              <option [attr.value]="i">{{ d }}</option>
            }
          </bh-select>

          <bh-field label="Start time" type="time" i18n-label="@@admin.schedule.field.startTime"
                     [(value)]="formStartTime" testId="schedule-starttime" name="scheduleStartTime" [required]="true" />

          <bh-field label="Duration (minutes)" type="number" i18n-label="@@admin.schedule.field.duration"
                     [(value)]="formDurationMin" testId="schedule-duration" name="scheduleDuration" [required]="true" />

          <bh-field label="Capacity" type="number" i18n-label="@@admin.schedule.field.capacity"
                     [(value)]="formCapacity" testId="schedule-capacity" name="scheduleCapacity" [required]="true" />

          <bh-switch [(checked)]="formActive" [label]="activeLabel" [hint]="activeHint" testId="schedule-active" />

          @if (blockingDates().length) {
            <bh-alert tone="warn" data-testid="schedule-blocked-alert">
              <p i18n="@@admin.schedule.blocked.title">{blockingDates().length, plural, =1 {1 class in this range has bookings.} other {# classes in this range have bookings.}}</p>
              <p i18n="@@admin.schedule.blocked.body">
                Changing the schedule would cancel them, so we haven't.
              </p>
              <bh-button variant="ghost" size="sm" data-testid="apply-from-retry" (click)="retryFromNextFreeDay()"
                         i18n="@@admin.schedule.blocked.retry">Apply from {{ (retryFrom() ?? '') + 'T00:00:00' | date:'d MMM' }}</bh-button>
            </bh-alert>
          }

          @if (formError()) {
            <p class="err" role="alert" data-testid="schedule-form-error">{{ formError() }}</p>
          }

          <bh-button type="submit" variant="strong" size="lg" class="full" [loading]="saving()" testId="schedule-slot-save">
            @if (!saving()) { <span i18n="@@admin.schedule.save">Save</span> }
          </bh-button>
        </form>
      </bh-sheet>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .sched { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-6); }

    .head { margin-bottom: 0; }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }

    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .num { font-variant-numeric: tabular-nums; }

    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; min-width: 0;
      min-height: var(--tap); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface); cursor: pointer; text-align: left;
      font: inherit; color: inherit; }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .time { font-family: var(--font-display); font-weight: 800; font-size: 18px; flex-shrink: 0; }
    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .nm { font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { font-size: var(--fs-sm); color: var(--faint); }
    .chev { flex-shrink: 0; color: var(--bone-dim); }

    .templates { display: flex; flex-direction: column; gap: var(--sp-3); }
    .thead { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }

    .tlist { display: flex; flex-direction: column; gap: var(--sp-2); }
    .trow { display: flex; align-items: center; gap: var(--sp-3); width: 100%; min-width: 0;
      min-height: var(--tap); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface); cursor: pointer; text-align: left;
      font: inherit; color: inherit; }
    .trow.off { opacity: .55; }
    .trow:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .tmid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .tnm { font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tsub { font-size: var(--fs-sm); color: var(--faint); }
    .badge { flex-shrink: 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }

    .sform { display: flex; flex-direction: column; gap: var(--sp-4); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
  `],
})
export class SchedulePage implements OnInit {
  private booking = inject(BookingService);
  private injector = inject(Injector);

  // ---- day sessions ----
  protected dayOffset = signal(0);
  protected sessions = signal<SessionView[]>([]);
  protected sessionsState = signal<FetchState>('loading');

  protected daySessions = computed(() => {
    const d = new Date(); d.setDate(d.getDate() + this.dayOffset());
    const key = d.toDateString();
    return this.sessions().filter(s => new Date(s.startAt).toDateString() === key);
  });

  /** Per-day availability for the strip's dots, from sessions this page already fetched — no extra request. */
  protected readonly tones = computed<Record<string, DayTone>>(() => tonesOf(this.sessions()));

  /**
   * Drives `bh-admin-class-detail`, mounted permanently below: `[sessionId]` is this signal,
   * `[open]` is `openSessionId() !== null`, and `(closed)` resets it back to null (see
   * `onClassDetailClosed`).
   */
  protected openSessionId = signal<string | null>(null);

  // ---- templates ----
  protected templates = signal<ClassTemplate[]>([]);
  protected templatesState = signal<FetchState>('loading');

  // ---- slot editor sheet ----
  protected sheetOpen = signal(false);
  protected editing = signal<ClassTemplate | null>(null);
  protected formName = signal('');
  protected formWeekday = signal('0');
  protected formStartTime = signal('06:00');
  protected formDurationMin = signal('60');
  protected formCapacity = signal('12');
  protected formActive = signal(true);
  protected saving = signal(false);
  protected formError = signal<string | null>(null);
  protected blockingDates = signal<string[]>([]);
  protected retryFrom = signal<string | null>(null);

  /** The base patch of the in-flight/last save, so a retry can resend it with `applyFrom` added
   *  without re-reading form signals that may have moved on. */
  private lastPatch: SlotPatch | null = null;

  protected readonly dayLabels = [
    $localize`:@@admin.schedule.day.mon:Mon`,
    $localize`:@@admin.schedule.day.tue:Tue`,
    $localize`:@@admin.schedule.day.wed:Wed`,
    $localize`:@@admin.schedule.day.thu:Thu`,
    $localize`:@@admin.schedule.day.fri:Fri`,
    $localize`:@@admin.schedule.day.sat:Sat`,
    $localize`:@@admin.schedule.day.sun:Sun`,
  ];

  protected readonly sheetTitle = computed(() =>
    this.editing()
      ? $localize`:@@admin.schedule.sheet.title.edit:Edit slot`
      : $localize`:@@admin.schedule.sheet.title.create:Add slot`);

  protected readonly sessionsEmptyTitle = $localize`:@@admin.schedule.sessions.empty.title:No classes this day`;
  protected readonly sessionsEmptyMessage = $localize`:@@admin.schedule.sessions.empty.message:Add a weekly template below to generate classes.`;
  protected readonly templatesEmptyTitle = $localize`:@@admin.schedule.templates.empty.title:No templates yet`;
  protected readonly templatesEmptyMessage = $localize`:@@admin.schedule.templates.empty.message:Add one to start generating classes automatically.`;
  protected readonly inactiveLabel = $localize`:@@admin.schedule.templates.inactive:Inactive`;
  protected readonly activeLabel = $localize`:@@admin.schedule.field.active:Active`;
  protected readonly activeHint = $localize`:@@admin.schedule.field.active.hint:Off stops new classes from generating; already-generated ones stay.`;

  private readonly nameRequiredError = $localize`:@@admin.schedule.error.nameRequired:Enter a class name.`;
  private readonly durationInvalidError = $localize`:@@admin.schedule.error.durationInvalid:Enter a duration of at least 1 minute.`;
  private readonly capacityInvalidError = $localize`:@@admin.schedule.error.capacityInvalid:Enter a capacity of at least 1.`;
  /** The 409 carries the blocking dates precisely so we can offer the way through rather than
   *  making the admin hunt. M14a decision 11: regeneration REFUSES rather than cancelling, because
   *  cancelling would mail everyone booked. Also the fallback for any other save failure. */
  private readonly genericSaveError = $localize`:@@admin.schedule.saveFailed:Could not save — try again.`;

  ngOnInit(): void {
    this.loadSessions();
    this.loadTemplates();
  }

  protected loadSessions(): void {
    this.sessionsState.set('loading');
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + 14 * 864e5); // match the coach/athlete windows so any upcoming class is reachable
    this.booking.listSessions(from.toISOString(), to.toISOString()).subscribe({
      next: s => { this.sessions.set(s.filter(x => x.status !== 'CANCELLED')); this.sessionsState.set('ready'); },
      error: () => this.sessionsState.set('error'),
    });
  }

  protected loadTemplates(): void {
    this.templatesState.set('loading');
    this.booking.listTemplates().subscribe({
      next: t => { this.templates.set(t); this.templatesState.set('ready'); },
      error: () => this.templatesState.set('error'),
    });
  }

  protected openSession(s: SessionView): void {
    this.openSessionId.set(s.id);
  }

  /**
   * bh-sheet's `open` is a ONE-WAY input, not a model — the component never clears it. So this
   * caller must reset its own signal on (closed), or the sheet will not reopen: setting the signal
   * true again won't re-run the effect because it never went false.
   */
  protected onClassDetailClosed(): void {
    this.openSessionId.set(null);
  }

  /** Counted, so mono/tabular in the template — the placeholder name sits immediately after the
   *  expression so it never ships as literal ":booked:" text. */
  protected sessionMeta(s: SessionView): string {
    return $localize`:@@admin.schedule.sessions.meta:${s.bookedCount}:booked:/${s.capacity}:capacity: booked`;
  }

  protected templateMeta(t: ClassTemplate): string {
    return $localize`:@@admin.schedule.templates.meta:${t.durationMin}:duration: min · cap ${t.capacity}:capacity:`;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formName.set('');
    this.formWeekday.set('0');
    this.formStartTime.set('06:00');
    this.formDurationMin.set('60');
    this.formCapacity.set('12');
    this.formActive.set(true);
    this.resetSaveState();
    this.sheetOpen.set(true);
  }

  protected openEdit(t: ClassTemplate): void {
    this.editing.set(t);
    this.formName.set(t.name);
    this.formWeekday.set(String(t.weekday));
    this.formStartTime.set(t.startTime);
    this.formDurationMin.set(String(t.durationMin));
    this.formCapacity.set(String(t.capacity));
    this.formActive.set(t.active);
    this.resetSaveState();
    this.sheetOpen.set(true);
  }

  private resetSaveState(): void {
    this.formError.set(null);
    this.blockingDates.set([]);
    this.retryFrom.set(null);
  }

  /** bh-sheet's `open` is a one-way input, not a model — the caller must reset its own signal on
   *  (closed), or the sheet will not reopen. */
  protected onSheetClosed(): void {
    this.sheetOpen.set(false);
  }

  /** The guard lives here, not only on [disabled] — Enter submits a form regardless of any
   *  button's disabled attribute, so an invalid field has to be caught on the way in, with focus
   *  moved onto it. */
  protected submit(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;

    const name = this.formName().trim();
    if (!name) {
      this.formError.set(this.nameRequiredError);
      this.focusField('schedule-name');
      return;
    }
    const durationMin = Number(this.formDurationMin());
    if (!durationMin || durationMin < 1) {
      this.formError.set(this.durationInvalidError);
      this.focusField('schedule-duration');
      return;
    }
    const capacity = Number(this.formCapacity());
    if (!capacity || capacity < 1) {
      this.formError.set(this.capacityInvalidError);
      this.focusField('schedule-capacity');
      return;
    }

    this.resetSaveState();

    const base = {
      name, weekday: Number(this.formWeekday()), startTime: this.formStartTime(),
      durationMin, capacity,
    };
    const editing = this.editing();
    if (editing) {
      this.saveEdit(editing.id, { ...base, active: this.formActive() });
    } else {
      this.saving.set(true);
      this.booking.createTemplate(base).subscribe({
        next: () => this.onSaveSuccess(),
        error: () => { this.saving.set(false); this.formError.set(this.genericSaveError); },
      });
    }
  }

  private saveEdit(id: string, patch: SlotPatch, applyFrom?: string): void {
    this.saving.set(true);
    this.lastPatch = patch;
    this.booking.patchTemplate(id, applyFrom ? { ...patch, applyFrom } : patch).subscribe({
      next: () => this.onSaveSuccess(),
      error: e => { this.saving.set(false); this.onPatchError(e); },
    });
  }

  private onSaveSuccess(): void {
    this.saving.set(false);
    this.sheetOpen.set(false);
    this.loadTemplates();
    this.loadSessions();
  }

  /** The 409 carries the blocking dates precisely so we can offer the way through rather than
   *  making the admin hunt. M14a decision 11: regeneration REFUSES rather than cancelling, because
   *  cancelling would mail everyone booked. */
  private onPatchError(e: { error?: { detail?: string } }): void {
    const detail = e.error?.detail ?? '';
    const marker = 'RANGE_HAS_BOOKINGS:';
    if (!detail.startsWith(marker)) {
      this.formError.set(this.genericSaveError);
      return;
    }
    const dates = detail.slice(marker.length).split(',').map(d => d.trim()).filter(Boolean);
    this.blockingDates.set(dates);
    const last = dates[dates.length - 1];
    const next = new Date(last + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    this.retryFrom.set(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  }

  protected retryFromNextFreeDay(): void {
    const editing = this.editing();
    const from = this.retryFrom();
    if (!editing || !from || !this.lastPatch) return;
    this.saveEdit(editing.id, this.lastPatch, from);
  }

  private focusField(testId: string): void {
    afterNextRender(() => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus(),
      { injector: this.injector });
  }
}

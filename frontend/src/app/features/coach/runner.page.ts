import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingService, RosterEntry } from '../booking/booking.service';
import { ProgrammingService, SessionItem } from '../programming/programming.service';
import { CoachRunnerService, TimerState } from './coach-runner.service';
import { renderTimer, TimerRender, TimerSpec } from '../../ui/timer';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { ScoreGridComponent, GridAthlete } from '../performance/score-grid.component';

const TIMER_TYPES = ['FOR_TIME', 'AMRAP', 'EMOM', 'TABATA'];
type FetchState = 'loading' | 'error' | 'ready';

/** Live class runner: roster strip (tap to check in), timer control, coach score grid — one screen, one class. */
@Component({
  selector: 'bh-runner',
  standalone: true,
  imports: [FormsModule, RouterLink, AvatarComponent, ButtonComponent, ScoreGridComponent],
  template: `
    <section class="runner" data-testid="runner">
      <a class="back" routerLink="/coach/classes">‹ Classes</a>
      <h1 class="title">Run class</h1>

      <section class="zone">
        <h2 class="zone-h">Roster</h2>
        @switch (rosterState()) {
          @case ('loading') { <p class="stateline">Loading roster…</p> }
          @case ('error') {
            <p class="stateline err">Couldn't load roster.
              <button class="retry" (click)="load()">Try again</button></p>
          }
          @default {
            @if (rosterActionError()) { <p class="err" role="alert">{{ rosterActionError() }}</p> }
            @if (active().length) {
              <div class="strip" data-testid="roster-strip">
                @for (a of active(); track a.bookingId) {
                  <button class="chip" [class.in]="a.status === 'CHECKED_IN'" (click)="toggleCheckin(a)"
                          [attr.aria-pressed]="a.status === 'CHECKED_IN'"
                          [attr.data-testid]="'roster-' + a.bookingId">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="sm" />
                    <span class="chip-nm">{{ a.name }}</span>
                  </button>
                }
              </div>
            } @else { <p class="stateline">No one booked for this class.</p> }
          }
        }
      </section>

      <section class="zone">
        <h2 class="zone-h">Timer</h2>
        @switch (itemsState()) {
          @case ('loading') { <p class="stateline">Loading pieces…</p> }
          @case ('error') { <p class="stateline err">Couldn't load pieces.</p> }
          @default {
            @if (scoredItems().length) {
              <div class="arm-row">
                <select class="in" aria-label="Piece" [ngModel]="armPieceId()" (ngModelChange)="onArmPieceChange($event)">
                  <option value="">Choose piece…</option>
                  @for (i of scoredItems(); track i.id) { <option [value]="i.id">{{ i.wod.title }}</option> }
                </select>
                <select class="in" aria-label="Timer type" [ngModel]="armType()" (ngModelChange)="armType.set($event)">
                  @for (t of timerTypes; track t) { <option [value]="t">{{ t }}</option> }
                </select>
              </div>

              @if (armType() === 'FOR_TIME' || armType() === 'AMRAP') {
                <div class="mmss">
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="mm" aria-label="Minutes"
                         [ngModel]="armMins()" (ngModelChange)="armMins.set($event)" />
                  <span aria-hidden="true">:</span>
                  <input class="in num" type="number" inputmode="numeric" min="0" max="59" placeholder="ss" aria-label="Seconds"
                         [ngModel]="armSecs()" (ngModelChange)="armSecs.set($event)" />
                </div>
              }
              @if (armType() === 'EMOM' || armType() === 'TABATA') {
                <div class="mmss">
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="rounds" aria-label="Rounds"
                         [ngModel]="armRounds()" (ngModelChange)="armRounds.set($event)" />
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="work sec" aria-label="Work seconds"
                         [ngModel]="armWork()" (ngModelChange)="armWork.set($event)" />
                  @if (armType() === 'TABATA') {
                    <input class="in num" type="number" inputmode="numeric" min="0" placeholder="rest sec" aria-label="Rest seconds"
                           [ngModel]="armRest()" (ngModelChange)="armRest.set($event)" />
                  }
                </div>
              }

              <!-- fixed-height slot so an error never reflows the button row under the coach's thumb -->
              <div class="errslot" aria-live="polite">
                @if (actionError()) { <p class="err" role="alert">{{ actionError() }}</p> }
                @else if (timerFetchError()) { <p class="err" role="alert">Couldn't load the current timer state.</p> }
              </div>

              <div class="clock" data-testid="clock" [class.on]="timer()?.status === 'RUNNING'"
                   [class.paused]="timer()?.status === 'PAUSED'">
                @if (timedPieceTitle(); as pt) { <span class="clock-piece">{{ pt }}</span> }
                @if (clock(); as c) {
                  <span class="clock-d num">{{ c.display }}</span>
                  @if (c.phase) { <span class="clock-p">{{ c.phase }}</span> }
                  @if (timer()?.status === 'PAUSED') { <span class="clock-p">paused</span> }
                } @else { <span class="clock-d num">--:--</span> }
              </div>

              <div class="acts">
                <bh-button size="sm" variant="ghost" [disabled]="acting()" (click)="arm()">Arm</bh-button>
                <bh-button size="sm" data-testid="timer-start" [disabled]="!timer() || acting()"
                           (click)="timer()?.status === 'PAUSED' ? resume() : start()">
                  {{ timer()?.status === 'PAUSED' ? 'Resume' : 'Start' }}
                </bh-button>
                <bh-button size="sm" variant="ghost" [disabled]="timer()?.status !== 'RUNNING' || acting()" (click)="pause()">Pause</bh-button>
                <bh-button size="sm" variant="ghost" [disabled]="!timer() || acting()" (click)="reset()">Reset</bh-button>
              </div>
            } @else { <p class="stateline">No scoreable pieces yet — build the class first.</p> }
          }
        }
      </section>

      <section class="zone">
        <h2 class="zone-h">Scores</h2>
        @switch (itemsState()) {
          @case ('loading') { <p class="stateline">Loading pieces…</p> }
          @case ('error') { <p class="stateline err">Couldn't load pieces.</p> }
          @default {
            @if (scoredItems().length) {
              <select class="in" aria-label="Piece to score" [ngModel]="scorePieceId()" (ngModelChange)="scorePieceId.set($event)">
                @for (i of scoredItems(); track i.id) { <option [value]="i.id">{{ i.wod.title }}</option> }
              </select>
              @if (selectedScoreItem(); as item) {
                <bh-score-grid [itemId]="item.id" [scoreType]="item.scoreType" [athletes]="athletes()" />
              }
            } @else { <p class="stateline">No scoreable pieces yet.</p> }
          }
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .runner { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-6); }
    .back { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--bone-dim); text-decoration: none; }
    .back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .zone { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4);
      background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); }
    .zone-h { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .stateline.err, .err { color: var(--red); font-size: var(--fs-sm); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }

    .strip { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
    .chip { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 76px;
      padding: var(--sp-2); background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); color: var(--bone); cursor: pointer; min-height: var(--tap); }
    .chip.in { border-color: var(--good); }
    .chip:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .chip-nm { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); padding: 0 var(--sp-3); color: var(--bone); font-family: var(--font-body);
      font-size: var(--fs-body); box-sizing: border-box; }
    .arm-row { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
    .arm-row .in { flex: 1; min-width: 160px; }
    .mmss { display: flex; align-items: center; gap: var(--sp-2); }
    .mmss .in { width: 90px; text-align: center; }
    .num { font-variant-numeric: tabular-nums; }

    .errslot { min-height: var(--tap); display: flex; align-items: center; }
    .clock { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3);
      border: 1px solid var(--hairline); border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4); }
    .clock.on { border-color: var(--red); }
    .clock.paused { border-color: var(--warn); }
    .clock-piece { flex: 1 1 100%; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
    .clock-d { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero); }
    .clock-p { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--faint); text-transform: uppercase; }
    .acts { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
  `],
})
export class RunnerPage implements OnInit, OnDestroy {
  private booking = inject(BookingService);
  private programming = inject(ProgrammingService);
  private runner = inject(CoachRunnerService);
  private route = inject(ActivatedRoute);

  sessionId = '';
  timerTypes = TIMER_TYPES;

  roster = signal<RosterEntry[]>([]);
  rosterState = signal<FetchState>('loading');
  rosterActionError = signal('');

  items = signal<SessionItem[]>([]);
  itemsState = signal<FetchState>('loading');

  timer = signal<TimerState | null>(null);
  timerFetchError = signal(false);
  actionError = signal('');
  acting = signal(false); // a timer control action is in flight

  now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;

  armPieceId = signal('');
  armType = signal('FOR_TIME');
  armMins = signal<number | null>(null);
  armSecs = signal<number | null>(null);
  armRounds = signal<number | null>(null);
  armWork = signal<number | null>(null);
  armRest = signal<number | null>(null);

  scorePieceId = signal('');

  active = computed(() => this.roster().filter(r => r.status !== 'WAITLIST'));
  athletes = computed<GridAthlete[]>(() =>
    this.active().map(r => ({ membershipId: r.membershipId, name: r.name, avatarPath: r.avatarPath })));
  scoredItems = computed(() => this.items().filter(i => i.scoreable));
  selectedScoreItem = computed(() => this.scoredItems().find(i => i.id === this.scorePieceId()) ?? null);
  // the piece the live clock is timing — the coach's own screen must name it, not just the TV
  timedPieceTitle = computed(() => {
    const id = this.timer()?.sessionItemId;
    return id ? (this.items().find(i => i.id === id)?.wod.title ?? null) : null;
  });

  clock = computed<TimerRender | null>(() => {
    const t = this.timer();
    if (!t || !t.specJson) return null;
    let spec: TimerSpec;
    try { spec = JSON.parse(t.specJson); } catch { return null; }
    return renderTimer(spec, t.startedAtEpoch, t.pausedElapsedMs, t.status, this.now());
  });

  ngOnInit() {
    if (!this.sessionId) {
      this.sessionId = this.route.snapshot.paramMap.get('id') ?? '';
      this.load();
    }
    this.tickHandle = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy() {
    clearInterval(this.tickHandle);
  }

  load() {
    this.rosterState.set('loading');
    this.itemsState.set('loading');
    this.booking.roster(this.sessionId).subscribe({
      next: r => { this.roster.set(r); this.rosterState.set('ready'); },
      error: () => this.rosterState.set('error'),
    });
    this.programming.sessionItems(this.sessionId).subscribe({
      next: i => {
        this.items.set(i);
        this.itemsState.set('ready');
        const first = i.find(x => x.scoreable);
        if (first && !this.scorePieceId()) this.scorePieceId.set(first.id);
      },
      error: () => this.itemsState.set('error'),
    });
    this.timerFetchError.set(false);
    this.runner.timer(this.sessionId).subscribe({
      next: t => this.timer.set(t),
      error: () => this.timerFetchError.set(true),
    });
  }

  toggleCheckin(a: RosterEntry) {
    this.rosterActionError.set('');
    const next = a.status === 'CHECKED_IN' ? 'BOOKED' : 'CHECKED_IN';
    const call = next === 'CHECKED_IN'
      ? this.booking.checkIn(this.sessionId, a.bookingId)
      : this.booking.uncheck(this.sessionId, a.bookingId);
    const prev = a.status;
    this.setRosterStatus(a.bookingId, next);
    call.subscribe({
      next: () => {},
      error: () => {
        this.setRosterStatus(a.bookingId, prev);
        this.rosterActionError.set("Couldn't update — try again.");
      },
    });
  }

  private setRosterStatus(bookingId: string, status: string) {
    this.roster.update(rs => rs.map(r => (r.bookingId === bookingId ? { ...r, status } : r)));
  }

  onArmPieceChange(id: string) {
    this.armPieceId.set(id);
    const item = this.items().find(i => i.id === id);
    if (!item) return;
    const type = TIMER_TYPES.includes(item.wod.wodType) ? item.wod.wodType : 'FOR_TIME';
    this.armType.set(type);
    if ((type === 'FOR_TIME' || type === 'AMRAP') && item.wod.timeCapSeconds != null) {
      this.armMins.set(Math.floor(item.wod.timeCapSeconds / 60));
      this.armSecs.set(item.wod.timeCapSeconds % 60);
    }
  }

  private buildSpec(): TimerSpec | null {
    const type = this.armType();
    if (type === 'FOR_TIME' || type === 'AMRAP') {
      const total = (this.armMins() ?? 0) * 60 + (this.armSecs() ?? 0);
      if (total <= 0) return null;
      return { type, totalSeconds: total };
    }
    if (type === 'EMOM') {
      const rounds = this.armRounds() ?? 0;
      if (rounds <= 0) return null;
      return { type, rounds, workSeconds: this.armWork() ?? 60 };
    }
    if (type === 'TABATA') {
      const rounds = this.armRounds() ?? 0;
      if (rounds <= 0) return null;
      return { type, rounds, workSeconds: this.armWork() ?? 20, restSeconds: this.armRest() ?? 10 };
    }
    return null;
  }

  arm() {
    const spec = this.buildSpec();
    if (!this.armPieceId() || !spec) { this.actionError.set('Pick a piece and fill in the timer.'); return; }
    this.act('ARM', { itemId: this.armPieceId(), spec });
  }
  start() { this.act('START'); }
  pause() { this.act('PAUSE'); }
  resume() { this.act('RESUME'); }
  reset() { this.act('RESET'); }

  private act(action: string, body: { itemId?: string; spec?: TimerSpec } = {}) {
    if (this.acting()) return; // one control action in flight at a time — no double-tap race on flaky wifi
    this.actionError.set('');
    this.acting.set(true);
    this.runner.act(this.sessionId, action, body).subscribe({
      next: t => { this.timer.set(t); this.acting.set(false); },
      error: () => { this.actionError.set("Couldn't update the timer — try again."); this.acting.set(false); },
    });
  }
}

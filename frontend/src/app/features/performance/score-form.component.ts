import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { PerformanceService, Score, ScoreInput } from './performance.service';

let uid = 0;

@Component({
  selector: 'bh-score-form',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <form class="sform" (ngSubmit)="save()" (input)="dirty = true" data-testid="score-form">
      <div class="seg" role="radiogroup" aria-label="Division">
        <button type="button" class="segbtn" [class.on]="rx()" (click)="rx.set(true)"
                role="radio" [attr.aria-checked]="rx()">RX</button>
        <button type="button" class="segbtn" [class.on]="!rx()" (click)="rx.set(false)"
                role="radio" [attr.aria-checked]="!rx()">Scaled</button>
      </div>

      @switch (scoreType) {
        @case ('TIME') {
          <div class="grp">
            <label class="lab" [for]="id + '-min'">Time</label>
            <div class="time">
              <input class="in n" [id]="id + '-min'" type="number" inputmode="numeric" min="0" max="99"
                     [(ngModel)]="mins" name="mins" placeholder="mm" />
              <span class="colon" aria-hidden="true">:</span>
              <input class="in n" [attr.aria-label]="'Seconds'" type="number" inputmode="numeric" min="0" max="59"
                     [(ngModel)]="secs" name="secs" placeholder="ss" />
            </div>
          </div>
          <label class="chk"><input type="checkbox" [(ngModel)]="finished" name="finished" />
            Finished <span class="hint">(uncheck if you hit the cap)</span></label>
          @if (!finished()) {
            <div class="grp">
              <label class="lab" [for]="id + '-reps'">Reps at cap</label>
              <input class="in n" [id]="id + '-reps'" type="number" inputmode="numeric" min="0" [(ngModel)]="reps" name="reps" />
            </div>
          }
        }
        @case ('ROUNDS_REPS') {
          <div class="grp">
            <label class="lab" [for]="id + '-rounds'">Rounds</label>
            <input class="in n" [id]="id + '-rounds'" type="number" inputmode="numeric" min="0" max="999" [(ngModel)]="rounds" name="rounds" />
          </div>
          <div class="grp">
            <label class="lab" [for]="id + '-xreps'">+ Reps</label>
            <input class="in n" [id]="id + '-xreps'" type="number" inputmode="numeric" min="0" max="999" [(ngModel)]="reps" name="reps" />
          </div>
        }
        @case ('LOAD') {
          <div class="grp">
            <label class="lab" [for]="id + '-load'">Load</label>
            <input class="in n" [id]="id + '-load'" type="number" inputmode="decimal" min="0" step="0.5" [(ngModel)]="load" name="load" />
          </div>
        }
        @default { <p class="done">Mark today's work complete.</p> }
      }

      <label class="chk"><input type="checkbox" [(ngModel)]="isPrivate" name="private" />
        Private <span class="hint">(hidden from the leaderboard — still counts for your history)</span></label>

      <label class="lab" [for]="id + '-notes'">Notes</label>
      <input class="in" [id]="id + '-notes'" [(ngModel)]="notes" name="notes" placeholder="Optional" />

      @if (error()) { <p class="err" role="alert" data-testid="score-error">{{ error() }}</p> }

      <div class="actions">
        <bh-button class="full" type="submit" [disabled]="pending()">{{ pending() ? 'Saving…' : 'Save score' }}</bh-button>
      </div>
    </form>
  `,
  styles: [`
    .sform { display: flex; flex-direction: column; gap: var(--sp-4); }
    .seg { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--hairline);
      border-radius: var(--edge); overflow: hidden; }
    .segbtn { min-height: var(--tap); background: transparent; border: none; color: var(--bone-dim);
      font-family: var(--font-body); font-weight: 700; font-size: var(--fs-sm); text-transform: uppercase;
      letter-spacing: 0.04em; cursor: pointer; }
    .segbtn.on { background: var(--surface-2); color: var(--bone); box-shadow: inset 0 -2px 0 var(--red); }
    .segbtn:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--red-glow); }
    .grp { display: flex; align-items: center; gap: var(--sp-3); }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--faint); min-width: 84px; }
    .time { display: flex; align-items: center; gap: 6px; }
    .colon { font-family: var(--font-display); font-weight: 700; font-size: 20px; }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-family: var(--font-body);
      font-size: var(--fs-body); box-sizing: border-box; width: 100%; }
    .in.n { width: 88px; text-align: center; font-variant-numeric: tabular-nums; font-size: 18px; font-weight: 700; }
    .in:focus-visible { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }
    .chk { display: flex; align-items: center; gap: 10px; min-height: var(--tap);
      font-size: var(--fs-sm); color: var(--bone); cursor: pointer; }
    .chk input { width: 20px; height: 20px; accent-color: var(--red); }
    .hint { color: var(--faint); }
    .done { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .err { color: var(--red); font-size: var(--fs-sm); margin: 0; }
  `],
})
export class ScoreFormComponent implements OnInit {
  @Input({ required: true }) itemId!: string;
  @Input({ required: true }) scoreType!: string;
  @Output() saved = new EventEmitter<Score>();

  private perf = inject(PerformanceService);
  readonly id = 'sf' + uid++;

  rx = signal(true);
  mins = signal<number | null>(null);
  secs = signal<number | null>(null);
  rounds = signal<number | null>(null);
  reps = signal<number | null>(null);
  load = signal<number | null>(null);
  finished = signal(true);
  notes = signal('');
  isPrivate = signal(false);
  pending = signal(false);
  error = signal('');
  dirty = false; // once the user types, a late-arriving prefill must not overwrite their input

  ngOnInit() {
    this.perf.myScore(this.itemId).subscribe({ next: s => { if (s && !this.dirty) this.prefill(s); }, error: () => {} });
  }

  private prefill(s: Score) {
    this.rx.set(s.rx); this.finished.set(s.finished); this.isPrivate.set(s.isPrivate);
    this.notes.set(s.notes ?? ''); this.rounds.set(s.rounds); this.reps.set(s.reps); this.load.set(s.load);
    if (s.timeSeconds != null) { this.mins.set(Math.floor(s.timeSeconds / 60)); this.secs.set(s.timeSeconds % 60); }
  }

  private validate(): string | null {
    if (this.scoreType === 'TIME' && this.finished()) {
      const total = (this.mins() ?? 0) * 60 + (this.secs() ?? 0);
      if (total <= 0) return 'Enter your time.';
      if ((this.secs() ?? 0) > 59 || (this.secs() ?? 0) < 0 || (this.mins() ?? 0) < 0) return 'Seconds must be 0–59.';
    }
    if (this.scoreType === 'TIME' && !this.finished() && (this.reps() ?? 0) <= 0) return 'Enter the reps you completed.';
    if (this.scoreType === 'ROUNDS_REPS' && (this.rounds() ?? 0) <= 0 && (this.reps() ?? 0) <= 0) return 'Enter rounds and reps.';
    if (this.scoreType === 'LOAD' && (this.load() ?? 0) <= 0) return 'Enter the load you hit.';
    return null;
  }

  save() {
    const invalid = this.validate();
    if (invalid) { this.error.set(invalid); return; }
    this.error.set('');
    const input: ScoreInput = { rx: this.rx(), isPrivate: this.isPrivate(), notes: this.notes() || null };
    if (this.scoreType === 'TIME') {
      input.finished = this.finished();
      input.timeSeconds = (this.mins() ?? 0) * 60 + (this.secs() ?? 0);
      if (!this.finished()) input.reps = this.reps();
    } else if (this.scoreType === 'ROUNDS_REPS') {
      input.rounds = this.rounds(); input.reps = this.reps();
    } else if (this.scoreType === 'LOAD') {
      input.load = this.load();
    }
    this.pending.set(true);
    this.perf.putScore(this.itemId, input).subscribe({
      next: s => { this.pending.set(false); this.saved.emit(s); },
      error: () => {
        this.pending.set(false);
        this.error.set("Couldn't save — bad connection? Your entry is still here, try again.");
      },
    });
  }
}

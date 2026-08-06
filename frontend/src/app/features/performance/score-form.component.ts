import { Component, EventEmitter, Input, OnInit, Output, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { PerformanceService, Score, ScoreInput } from './performance.service';

let uid = 0;

@Component({
  selector: 'bh-score-form',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <form class="sform" (ngSubmit)="save()" (input)="markDirty()" data-testid="score-form">
      <div class="seg" role="radiogroup" aria-label="Division">
        <button type="button" class="segbtn" [class.on]="rx()" (click)="rx.set(true); markDirty()"
                role="radio" [attr.aria-checked]="rx()">RX</button>
        <button type="button" class="segbtn" [class.on]="!rx()" (click)="rx.set(false); markDirty()"
                role="radio" [attr.aria-checked]="!rx()">Scaled</button>
      </div>

      @switch (scoreType) {
        @case ('TIME') {
          <div class="grp">
            <span class="lab" [id]="id + '-tlab'">Time</span>
            <div class="time" role="group" [attr.aria-labelledby]="id + '-tlab'">
              <input class="in big" [id]="id + '-min'" type="number" inputmode="numeric" min="0" max="99"
                     [(ngModel)]="mins" name="mins" placeholder="mm" aria-label="Minutes" />
              <span class="colon" aria-hidden="true">:</span>
              <input class="in big" type="number" inputmode="numeric" min="0" max="59"
                     [(ngModel)]="secs" name="secs" placeholder="ss" aria-label="Seconds" />
            </div>
          </div>
          <label class="switch"><span class="sw-lab">Finished <span class="hint">(off = hit the cap)</span></span>
            <input type="checkbox" [(ngModel)]="finished" name="finished" (change)="markDirty()" /><span class="knob" aria-hidden="true"></span></label>
          @if (!finished()) {
            <div class="grp">
              <label class="lab" [for]="id + '-reps'">Reps at cap</label>
              <input class="in big wide" [id]="id + '-reps'" type="number" inputmode="numeric" min="0" [(ngModel)]="reps" name="reps" />
            </div>
          }
        }
        @case ('ROUNDS_REPS') {
          <div class="grp">
            <span class="lab" [id]="id + '-rrlab'">Rounds + reps</span>
            <div class="time" role="group" [attr.aria-labelledby]="id + '-rrlab'">
              <input class="in big" [id]="id + '-rounds'" type="number" inputmode="numeric" min="0" max="999"
                     [(ngModel)]="rounds" name="rounds" placeholder="rounds" aria-label="Rounds" />
              <span class="colon" aria-hidden="true">+</span>
              <input class="in big" type="number" inputmode="numeric" min="0" max="999"
                     [(ngModel)]="reps" name="reps" placeholder="reps" aria-label="Reps" />
            </div>
          </div>
        }
        @case ('LOAD') {
          <div class="grp">
            <label class="lab" [for]="id + '-load'">Load</label>
            <input class="in big wide" [id]="id + '-load'" type="number" inputmode="decimal" min="0" step="0.5" [(ngModel)]="load" name="load" />
          </div>
        }
        @default { <p class="done">Mark today's work complete.</p> }
      }

      <label class="switch"><span class="sw-lab">Private <span class="hint">(off the leaderboard — still counts for your history)</span></span>
        <input type="checkbox" [(ngModel)]="isPrivate" name="private" (change)="markDirty()" /><span class="knob" aria-hidden="true"></span></label>

      <div class="grp">
        <label class="lab" [for]="id + '-notes'">Notes</label>
        <input class="in" [id]="id + '-notes'" [(ngModel)]="notes" name="notes" placeholder="Optional" />
      </div>

      @if (error()) { <p class="err" role="alert" data-testid="score-error">{{ error() }}</p> }

      <div class="actions">
        <bh-button class="full" type="submit" [disabled]="pending()">{{ pending() ? 'Saving…' : 'Save score' }}</bh-button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .sform { display: flex; flex-direction: column; gap: var(--sp-4); }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px;
      background: var(--surface-2); border-radius: var(--r-full); }
    .segbtn { min-height: var(--tap); background: transparent; border: none; border-radius: var(--r-full);
      color: var(--bone-dim); font-family: var(--font-body); font-weight: 700; font-size: var(--fs-sm);
      text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer;
      transition: background var(--dur) var(--ease-out); }
    .segbtn.on { background: var(--surface); color: var(--bone); box-shadow: inset 0 0 0 1px var(--hairline); }
    .segbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .grp { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--faint); }
    .time { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); }
    .colon { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); color: var(--faint); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-family: var(--font-body);
      font-size: var(--fs-body); box-sizing: border-box; width: 100%; }
    .in.big { width: 116px; min-height: 64px; text-align: center; font-family: var(--font-display);
      font-weight: 800; font-size: var(--fs-display); font-variant-numeric: tabular-nums; }
    .in.big.wide { width: 100%; max-width: 240px; align-self: center; }
    .in:focus-visible { border-color: var(--volt); outline: 2px solid var(--focus); outline-offset: 2px; }
    .switch { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap);
      font-size: var(--fs-sm); color: var(--bone); cursor: pointer; position: relative; }
    .sw-lab { flex: 1; }
    .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
    .knob { width: 46px; height: 28px; border-radius: var(--r-full); background: var(--surface-2);
      border: 1px solid var(--hairline); position: relative; flex-shrink: 0;
      transition: background var(--dur) var(--ease-out); }
    .knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
      border-radius: var(--r-full); background: var(--bone-dim); transition: transform var(--dur) var(--ease-out); }
    .switch input:checked + .knob { background: var(--volt); border-color: var(--volt); }
    .switch input:checked + .knob::after { transform: translateX(18px); background: var(--on-volt); }
    .switch input:focus-visible + .knob { outline: 2px solid var(--focus); outline-offset: 2px; }
    .switch input:checked:focus-visible + .knob { outline-color: var(--focus-inv); }
    .hint { color: var(--faint); }
    .done { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
    @media (prefers-reduced-motion: reduce) { .knob, .knob::after, .segbtn { transition: none; } }
  `],
})
export class ScoreFormComponent implements OnInit {
  @Input({ required: true }) itemId!: string;
  @Input({ required: true }) scoreType!: string;
  @Output() saved = new EventEmitter<Score>();
  @Output() dirtyChange = new EventEmitter<boolean>();

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

  markDirty() { if (!this.dirty) { this.dirty = true; this.dirtyChange.emit(true); } }

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

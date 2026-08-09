import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SwitchComponent } from '../../ui/switch.component';
import { PerformanceService, Score, ScoreInput } from './performance.service';

let uid = 0;

@Component({
  selector: 'bh-score-form',
  standalone: true,
  imports: [FormsModule, ButtonComponent, SegmentedComponent, SwitchComponent],
  template: `
    <form class="sform" (ngSubmit)="save()" (input)="markDirty()" data-testid="score-form">
      <bh-segmented [options]="divisionOptions" [value]="division()" (valueChange)="onDivisionChange($event)"
                    label="Division" />

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
          <bh-switch [checked]="finished()" (checkedChange)="onFinishedChange($event)"
                     label="Finished" hint="(off = hit the cap)" />
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

      <bh-switch [checked]="isPrivate()" (checkedChange)="onPrivateChange($event)"
                 label="Private" hint="(off the leaderboard — still counts for your history)" />

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
    .done { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
  `],
})
export class ScoreFormComponent implements OnInit {
  @Input({ required: true }) itemId!: string;
  @Input({ required: true }) scoreType!: string;
  @Output() saved = new EventEmitter<Score>();
  @Output() dirtyChange = new EventEmitter<boolean>();

  private perf = inject(PerformanceService);
  readonly id = 'sf' + uid++;

  readonly divisionOptions: SegOption[] = [{ value: 'rx', label: 'RX' }, { value: 'sc', label: 'Scaled' }];
  division = signal<'rx' | 'sc'>('rx');
  rx = computed(() => this.division() === 'rx');
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

  onDivisionChange(v: string) { this.division.set(v === 'rx' ? 'rx' : 'sc'); this.markDirty(); }
  onFinishedChange(v: boolean) { this.finished.set(v); this.markDirty(); }
  onPrivateChange(v: boolean) { this.isPrivate.set(v); this.markDirty(); }

  ngOnInit() {
    this.perf.myScore(this.itemId).subscribe({ next: s => { if (s && !this.dirty) this.prefill(s); }, error: () => {} });
  }

  private prefill(s: Score) {
    this.division.set(s.rx ? 'rx' : 'sc'); this.finished.set(s.finished); this.isPrivate.set(s.isPrivate);
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

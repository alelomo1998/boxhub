import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { PerformanceService, Score, ScoreInput } from './performance.service';

@Component({
  selector: 'bh-score-form',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <form class="sform" (ngSubmit)="save()" data-testid="score-form">
      @switch (scoreType) {
        @case ('TIME') {
          <div class="grp">
            <label class="lab">Time</label>
            <div class="time"><input class="in n" type="number" min="0" [(ngModel)]="mins" name="mins" placeholder="mm" /> :
              <input class="in n" type="number" min="0" max="59" [(ngModel)]="secs" name="secs" placeholder="ss" /></div>
          </div>
          <label class="chk"><input type="checkbox" [(ngModel)]="finished" name="finished" /> Finished (uncheck if capped)</label>
          @if (!finished()) { <div class="grp"><label class="lab">Reps at cap</label>
            <input class="in n" type="number" [(ngModel)]="reps" name="reps" /></div> }
        }
        @case ('ROUNDS_REPS') {
          <div class="grp"><label class="lab">Rounds</label><input class="in n" type="number" [(ngModel)]="rounds" name="rounds" /></div>
          <div class="grp"><label class="lab">+ Reps</label><input class="in n" type="number" [(ngModel)]="reps" name="reps" /></div>
        }
        @case ('LOAD') {
          <div class="grp"><label class="lab">Load</label><input class="in n" type="number" step="0.5" [(ngModel)]="load" name="load" /></div>
        }
        @default { <p class="done">Mark complete</p> }
      }

      <div class="toggles">
        <label class="chk"><input type="checkbox" [(ngModel)]="rx" name="rx" /> RX</label>
        <label class="chk"><input type="checkbox" [(ngModel)]="isPrivate" name="private" /> Private</label>
      </div>
      <input class="in" [(ngModel)]="notes" name="notes" placeholder="Notes (optional)" />
      <div class="actions"><bh-button size="sm" type="submit">Save score</bh-button></div>
    </form>
  `,
  styles: [`
    .sform { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-3);
      padding: var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--edge); }
    .grp { display: flex; align-items: center; gap: var(--sp-3); }
    .lab { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--faint); min-width: 70px; }
    .time { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 8px 11px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .in.n { width: 72px; text-align: center; font-variant-numeric: tabular-nums; }
    .chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--bone-dim); }
    .toggles { display: flex; gap: var(--sp-4); }
    .done { color: var(--bone-dim); font-size: 14px; margin: 0; }
    .actions { display: flex; }
  `],
})
export class ScoreFormComponent implements OnInit {
  @Input({ required: true }) slotId!: string;
  @Input({ required: true }) scoreType!: string;
  @Output() saved = new EventEmitter<Score>();

  private perf = inject(PerformanceService);

  rx = signal(true);
  mins = signal<number | null>(null);
  secs = signal<number | null>(null);
  rounds = signal<number | null>(null);
  reps = signal<number | null>(null);
  load = signal<number | null>(null);
  finished = signal(true);
  notes = signal('');
  isPrivate = signal(false);

  ngOnInit() {
    this.perf.myScore(this.slotId).subscribe(s => { if (s) this.prefill(s); });
  }

  private prefill(s: Score) {
    this.rx.set(s.rx); this.finished.set(s.finished); this.isPrivate.set(s.isPrivate);
    this.notes.set(s.notes ?? ''); this.rounds.set(s.rounds); this.reps.set(s.reps); this.load.set(s.load);
    if (s.timeSeconds != null) { this.mins.set(Math.floor(s.timeSeconds / 60)); this.secs.set(s.timeSeconds % 60); }
  }

  save() {
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
    this.perf.putScore(this.slotId, input).subscribe(s => this.saved.emit(s));
  }
}

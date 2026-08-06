import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { CoachRunnerService, ScoreCellInput } from '../coach/coach-runner.service';

export interface GridAthlete { membershipId: string; name: string; avatarPath?: string | null; }
type CellStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Coach-facing score entry: one row per athlete, columns per the item's score type. Optimistic save per cell. */
@Component({
  selector: 'bh-score-grid',
  standalone: true,
  imports: [FormsModule, AvatarComponent, ButtonComponent],
  template: `
    @if (athletes.length) {
      <div class="grid" data-testid="score-grid">
        @for (a of athletes; track a.membershipId) {
          <div class="row" [attr.data-testid]="'grid-row-' + a.membershipId">
            <bh-avatar [path]="a.avatarPath ?? null" [name]="a.name" size="sm" />
            <span class="nm">{{ a.name }}</span>

            <div class="cell">
              @switch (scoreType) {
                @case ('TIME') {
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="mm"
                         aria-label="Minutes" [ngModel]="mins.get(a.membershipId)"
                         (ngModelChange)="mins.set(a.membershipId, $event)" />
                  <span class="colon" aria-hidden="true">:</span>
                  <input class="in num" type="number" inputmode="numeric" min="0" max="59" placeholder="ss"
                         aria-label="Seconds" [ngModel]="secs.get(a.membershipId)"
                         (ngModelChange)="secs.set(a.membershipId, $event)" />
                }
                @case ('ROUNDS_REPS') {
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="rounds"
                         aria-label="Rounds" [ngModel]="rounds.get(a.membershipId)"
                         (ngModelChange)="rounds.set(a.membershipId, $event)" />
                  <span class="colon" aria-hidden="true">+</span>
                  <input class="in num" type="number" inputmode="numeric" min="0" placeholder="reps"
                         aria-label="Reps" [ngModel]="reps.get(a.membershipId)"
                         (ngModelChange)="reps.set(a.membershipId, $event)" />
                }
                @case ('LOAD') {
                  <input class="in num wide" type="number" inputmode="decimal" min="0" step="0.5" placeholder="load"
                         aria-label="Load" [ngModel]="load.get(a.membershipId)"
                         (ngModelChange)="load.set(a.membershipId, $event)" />
                }
                @default { <span class="done-lab">Done</span> }
              }
            </div>

            <bh-button size="sm" [variant]="cellStatus(a.membershipId) === 'error' ? 'primary' : 'ghost'"
                       [disabled]="cellStatus(a.membershipId) === 'saving'"
                       (click)="save(a.membershipId)" [attr.data-testid]="'grid-save-' + a.membershipId">
              @switch (cellStatus(a.membershipId)) {
                @case ('saving') { Saving… }
                @case ('saved') { Saved }
                @case ('error') { Retry }
                @default { Save }
              }
            </bh-button>
          </div>
        }
      </div>
    } @else {
      <p class="empty">No athletes checked in yet.</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .grid { display: flex; flex-direction: column; gap: var(--sp-2); }
    .row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
      background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); }
    .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: var(--fs-sm); font-weight: 600; }
    .cell { display: flex; align-items: center; gap: var(--sp-1); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); width: 64px; padding: 0 var(--sp-2); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); box-sizing: border-box; text-align: center; }
    .in.wide { width: 100px; }
    .in:focus-visible { border-color: var(--volt); outline: 2px solid var(--focus); outline-offset: 2px; }
    .colon { color: var(--faint); font-weight: 700; }
    .done-lab { color: var(--faint); font-size: var(--fs-sm); }
    .num { font-variant-numeric: tabular-nums; }
    .empty { color: var(--faint); font-size: var(--fs-sm); }
  `],
})
export class ScoreGridComponent {
  @Input() itemId = '';
  @Input() scoreType = 'NONE';
  @Input() athletes: GridAthlete[] = [];

  private runner = inject(CoachRunnerService);

  mins = new Map<string, number | null>();
  secs = new Map<string, number | null>();
  rounds = new Map<string, number | null>();
  reps = new Map<string, number | null>();
  load = new Map<string, number | null>();
  private status = new Map<string, CellStatus>();

  cellStatus(membershipId: string): CellStatus {
    return this.status.get(membershipId) ?? 'idle';
  }

  save(membershipId: string) {
    const input: ScoreCellInput = { rx: true, isPrivate: false };
    if (this.scoreType === 'TIME') {
      input.finished = true;
      input.timeSeconds = (this.mins.get(membershipId) ?? 0) * 60 + (this.secs.get(membershipId) ?? 0);
    } else if (this.scoreType === 'ROUNDS_REPS') {
      input.rounds = this.rounds.get(membershipId) ?? null;
      input.reps = this.reps.get(membershipId) ?? null;
    } else if (this.scoreType === 'LOAD') {
      input.load = this.load.get(membershipId) ?? null;
    }
    this.status.set(membershipId, 'saving');
    this.runner.logFor(this.itemId, membershipId, input).subscribe({
      next: () => this.status.set(membershipId, 'saved'),
      error: () => this.status.set(membershipId, 'error'),
    });
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '../../ui/button.component';
import { PerformanceService, Lift } from '../performance/performance.service';
import { ProgrammingService, Movement } from '../programming/programming.service';

function today(): string { return new Date().toISOString().slice(0, 10); }

@Component({
  selector: 'bh-lift-log',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Log a lift</h2>

      <datalist id="mvList">
        @for (m of movements(); track m.id) { <option [value]="m.name"></option> }
      </datalist>

      <form class="form" (ngSubmit)="save()">
        <input class="in" list="mvList" [(ngModel)]="movementName" name="mv" placeholder="Movement" data-testid="lift-movement" />
        <input class="in n" type="number" step="0.5" [(ngModel)]="load" name="load" placeholder="Load" />
        <input class="in n" type="number" [(ngModel)]="reps" name="reps" placeholder="Reps" />
        <input class="in" type="date" [(ngModel)]="performedOn" name="date" />
        <bh-button size="sm" type="submit" [disabled]="!resolvedId() || !load()">Save</bh-button>
      </form>
      @if (lastPr()) { <p class="prbadge" data-testid="pr-badge">🏆 New PR!</p> }
      @if (notFound()) { <p class="warn">Pick a movement from the list.</p> }

      <h2 class="t-h2">Recent</h2>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Movement</th><th>Load</th><th>Reps</th><th>When</th><th></th></tr></thead>
          <tbody>
            @for (l of recent(); track l.id) {
              <tr>
                <td>{{ l.movementName }}</td>
                <td class="num">{{ l.load }}</td>
                <td class="num">{{ l.reps }}</td>
                <td class="num">{{ l.performedOn | date:'d MMM y' }}</td>
                <td>@if (l.isPr) { <span class="pr">PR</span> }</td>
              </tr>
            } @empty { <tr><td colspan="5" class="muted">No lifts logged yet.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .form { display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: center; margin-bottom: var(--sp-3); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 9px 12px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .in.n { width: 100px; text-align: center; font-variant-numeric: tabular-nums; }
    .prbadge { color: var(--red); font-weight: 700; text-shadow: 0 0 12px var(--red-glow); }
    .warn { color: var(--red); font-size: 13px; }
    .pr { font-family: var(--font-mono); font-size: 10px; color: var(--red); }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class LiftLogPage implements OnInit {
  private perf = inject(PerformanceService);
  private prog = inject(ProgrammingService);

  movements = signal<Movement[]>([]);
  movementName = signal('');
  load = signal<number | null>(null);
  reps = signal<number | null>(1);
  performedOn = signal(today());
  recent = signal<Lift[]>([]);
  lastPr = signal(false);
  notFound = signal(false);

  ngOnInit() {
    this.prog.movements().subscribe(m => this.movements.set(m));
    this.loadRecent();
  }

  resolvedId(): string | undefined {
    return this.movements().find(m => m.name.toLowerCase() === this.movementName().trim().toLowerCase())?.id;
  }

  // "Recent" = current best per movement (the PR list).
  private loadRecent() { this.perf.prs().subscribe(p => this.recent.set(p)); }

  save() {
    const id = this.resolvedId();
    if (!id) { this.notFound.set(true); return; }
    this.notFound.set(false);
    this.perf.logLift({ movementId: id, load: this.load()!, reps: this.reps() ?? 1, performedOn: this.performedOn() })
      .subscribe(l => {
        this.lastPr.set(l.isPr);
        this.load.set(null);
        this.loadRecent();
      });
  }
}

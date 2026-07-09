import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PerformanceService, BenchmarkHistory, Lift } from '../performance/performance.service';
import { ProgressionChartComponent, ChartPoint } from '../performance/progression-chart.component';

@Component({
  selector: 'bh-progress',
  standalone: true,
  imports: [DatePipe, ProgressionChartComponent],
  template: `
    <section class="bh-section">
      <span class="eyebrow">My progress</span>
      <h1 class="title">Records</h1>

      <h2 class="t-h2">Benchmark PRs</h2>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Benchmark</th><th>Best</th><th>When</th></tr></thead>
          <tbody>
            @for (b of benchmarks(); track b.benchmarkName) {
              <tr>
                <td class="bm">{{ b.benchmarkName }}<span class="pr">PR</span></td>
                <td class="num">{{ formatBest(b) }}</td>
                <td class="num">{{ b.achievedOn | date:'d MMM y' }}</td>
              </tr>
            } @empty { <tr><td colspan="3" class="muted">Log a benchmark WOD to see PRs here.</td></tr> }
          </tbody>
        </table>
      </div>

      <h2 class="t-h2">Lift PRs</h2>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Movement</th><th>Best load</th><th>Reps</th><th>When</th></tr></thead>
          <tbody>
            @for (l of prs(); track l.movementId) {
              <tr [class.sel]="l.movementId === selected()" (click)="select(l)">
                <td class="link">{{ l.movementName }}</td>
                <td class="num">{{ l.load }}</td>
                <td class="num">{{ l.reps }}</td>
                <td class="num">{{ l.performedOn | date:'d MMM y' }}</td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">Log a lift to see PRs here.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (selected()) {
        <h2 class="t-h2">{{ selectedName() }} progression</h2>
        <bh-progression-chart [points]="chartPoints()" />
      }
    </section>
  `,
  styles: [`
    .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 40px; text-transform: uppercase; margin: 4px 0 var(--sp-5); }
    .t-h2 { margin-top: var(--sp-6); }
    .bm { font-weight: 600; }
    .pr { margin-left: 8px; font-family: var(--font-mono); font-size: 10px; color: var(--red); }
    .link { color: var(--red); font-weight: 600; cursor: pointer; }
    tr.sel { background: var(--surface-2); }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class ProgressPage implements OnInit {
  private perf = inject(PerformanceService);
  benchmarks = signal<BenchmarkHistory[]>([]);
  prs = signal<Lift[]>([]);
  selected = signal<string | null>(null);
  selectedName = signal('');
  chartPoints = signal<ChartPoint[]>([]);

  ngOnInit() {
    this.perf.benchmarkHistory().subscribe(b => this.benchmarks.set(b));
    this.perf.prs().subscribe(p => { this.prs.set(p); if (p.length) this.select(p[0]); });
  }

  select(l: Lift) {
    this.selected.set(l.movementId);
    this.selectedName.set(l.movementName);
    this.perf.lifts(l.movementId).subscribe(entries =>
      this.chartPoints.set(entries.map(e => ({ date: e.performedOn, load: e.load }))));
  }

  formatBest(b: BenchmarkHistory): string {
    switch (b.scoreType) {
      case 'TIME': return b.timeSeconds != null ? `${Math.floor(b.timeSeconds / 60)}:${String(b.timeSeconds % 60).padStart(2, '0')}` : '—';
      case 'ROUNDS_REPS': return `${b.rounds ?? 0}+${b.reps ?? 0}`;
      case 'LOAD': return `${b.load ?? 0}`;
      default: return '✓';
    }
  }
}

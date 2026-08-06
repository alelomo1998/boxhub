import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { PerformanceService, BenchmarkHistory, Lift } from '../performance/performance.service';
import { ProgressionChartComponent, ChartPoint } from '../performance/progression-chart.component';
import { ProgrammingService, Movement } from '../programming/programming.service';

function today(): string { return new Date().toISOString().slice(0, 10); }

@Component({
  selector: 'bh-progress',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonComponent, ProgressionChartComponent],
  template: `
    <section class="prog">
      <header class="head">
        <span class="eyebrow">My progress</span>
        <h1 class="title">Records</h1>
      </header>

      <div class="quicklog">
        <h2 class="qh">Log a lift</h2>
        <datalist id="mvList">
          @for (m of movements(); track m.id) { <option [value]="m.name"></option> }
        </datalist>
        <form class="qform" (ngSubmit)="saveLift()">
          <label class="qf mv"><span class="qlab">Movement</span>
            <input class="in" list="mvList" [(ngModel)]="movementName" name="mv"
                   placeholder="Back squat…" data-testid="lift-movement" /></label>
          <label class="qf"><span class="qlab">Load</span>
            <input class="in n" type="number" inputmode="decimal" min="0.5" step="0.5" [(ngModel)]="liftLoad"
                   name="load" placeholder="0" /></label>
          <label class="qf"><span class="qlab">Reps</span>
            <input class="in n" type="number" inputmode="numeric" min="1" max="100" [(ngModel)]="liftReps"
                   name="reps" /></label>
          <label class="qf date"><span class="qlab">Date</span>
            <input class="in" type="date" [(ngModel)]="liftDate" name="date" /></label>
          <bh-button class="qsave full" type="submit" [disabled]="liftPending()">{{ liftPending() ? 'Saving…' : 'Save lift' }}</bh-button>
        </form>
        @if (liftError()) { <p class="err" role="alert">{{ liftError() }}</p> }
      </div>

      @if (celebrating(); as pr) {
        <div class="pr-moment" role="status" data-testid="pr-badge">
          <span class="pr-kicker">New PR</span>
          <span class="pr-line"><span class="pr-mv">{{ pr.movementName }}</span>
            <span class="pr-load num">{{ pr.load }}</span></span>
        </div>
      }

      <h2 class="sh">Benchmarks</h2>
      @if (loadingBm()) { <p class="stateline">Loading…</p> }
      @else if (benchmarks().length) {
        <div class="trophies">
          @for (b of benchmarks(); track b.benchmarkName) {
            <div class="trophy">
              <span class="t-name">{{ b.benchmarkName }}</span>
              <span class="t-val num">{{ formatBest(b) }}</span>
              <span class="t-when">{{ b.achievedOn | date:'d MMM y' }}</span>
            </div>
          }
        </div>
      } @else { <p class="stateline">Log a benchmark WOD (Fran, Murph…) and your best shows up here.</p> }

      <h2 class="sh">Lift PRs</h2>
      @if (loadingPrs()) { <p class="stateline">Loading…</p> }
      @else if (prs().length) {
        <div class="bh-table-wrap">
          <table class="bh-table">
            <thead><tr><th>Movement</th><th>Best</th><th>Reps</th><th>When</th></tr></thead>
            <tbody>
              @for (l of prs(); track l.movementId) {
                <tr [class.sel]="l.movementId === selected()">
                  <td><button class="mvbtn" (click)="select(l)">{{ l.movementName }}</button></td>
                  <td class="num strong">{{ l.load }}</td>
                  <td class="num">{{ l.reps }}</td>
                  <td class="num">{{ l.performedOn | date:'d MMM y' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else { <p class="stateline">Log a lift above and your PRs build from there.</p> }

      @if (selected()) {
        <h2 class="sh">{{ selectedName() }} <span class="sh-sub">history</span></h2>
        <bh-progression-chart [points]="chartPoints()" />
        <div class="hist">
          @for (l of history(); track l.id) {
            <div class="hrow">
              <span class="h-load num">{{ l.load }}</span>
              <span class="h-reps num">× {{ l.reps }}</span>
              <span class="h-date">{{ l.performedOn | date:'d MMM y' }}</span>
              @if (l.isPr) { <span class="h-pr">PR</span> }
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .prog { max-width: 720px; margin: 0 auto; }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .stateline { color: var(--bone-dim); font-size: var(--fs-body); }
    .err { color: var(--volt); font-size: var(--fs-sm); margin: var(--sp-2) 0 0; }

    .quicklog { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); margin-bottom: var(--sp-5); }
    .qh { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--faint); margin: 0 0 var(--sp-3); }
    .qform { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
    .qf { display: flex; flex-direction: column; gap: 6px; }
    .qf.mv, .qf.date { grid-column: 1 / -1; }
    .qlab { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--faint); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-family: var(--font-body);
      font-size: var(--fs-body); box-sizing: border-box; width: 100%; }
    .in:focus-visible { outline: none; border-color: var(--volt); box-shadow: 0 0 0 3px var(--red-glow); }
    .in.n { text-align: center; font-family: var(--font-display); font-weight: 800; font-size: 20px;
      font-variant-numeric: tabular-nums; min-height: 52px; }
    .qsave { grid-column: 1 / -1; }
    @media (min-width: 560px) {
      .qform { grid-template-columns: 2fr 1fr 1fr 1.4fr; align-items: end; }
      .qf.mv { grid-column: auto; } .qf.date { grid-column: auto; }
      .qsave { grid-column: 1 / -1; }
    }

    .pr-moment { display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      border: 1px solid var(--volt); border-radius: var(--r-card); padding: var(--sp-4);
      margin-bottom: var(--sp-5); animation: prpop 350ms var(--ease-out); }
    .pr-kicker { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--volt); }
    .pr-line { display: flex; align-items: baseline; gap: var(--sp-3); }
    .pr-mv { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); text-transform: uppercase; }
    .pr-load { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      color: var(--volt); font-variant-numeric: tabular-nums; }
    @keyframes prpop { from { transform: scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .pr-moment { animation: none; } }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: var(--sp-6) 0 var(--sp-3); }
    .sh-sub { color: var(--faint); font-weight: 400; }

    .trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-3); }
    .trophy { border: 1px solid var(--hairline); border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4);
      display: flex; flex-direction: column; gap: 2px; background: var(--surface); }
    .t-name { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--bone-dim); }
    .t-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .t-when { font-size: var(--fs-sm); color: var(--faint); }

    .mvbtn { background: none; border: none; padding: 0; color: var(--bone); font: inherit; font-weight: 600;
      cursor: pointer; text-decoration: underline; text-decoration-color: var(--hairline); text-underline-offset: 3px;
      min-height: var(--tap); }
    .mvbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); border-radius: var(--edge); }
    tr.sel { background: var(--surface-2); }
    .strong { font-weight: 700; }

    .hist { margin-top: var(--sp-3); }
    .hrow { display: flex; align-items: baseline; gap: var(--sp-3); padding: 8px 0;
      border-bottom: 1px solid var(--hairline); }
    .h-load { font-family: var(--font-display); font-weight: 700; font-size: 18px; min-width: 64px;
      font-variant-numeric: tabular-nums; }
    .h-reps { color: var(--bone-dim); font-variant-numeric: tabular-nums; }
    .h-date { flex: 1; color: var(--faint); font-size: var(--fs-sm); }
    .h-pr { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--volt); }
  `],
})
export class ProgressPage implements OnInit {
  private perf = inject(PerformanceService);
  private prog = inject(ProgrammingService);

  benchmarks = signal<BenchmarkHistory[]>([]);
  prs = signal<Lift[]>([]);
  loadingBm = signal(true);
  loadingPrs = signal(true);
  selected = signal<string | null>(null);
  selectedName = signal('');
  chartPoints = signal<ChartPoint[]>([]);
  history = signal<Lift[]>([]);

  movements = signal<Movement[]>([]);
  movementName = signal('');
  liftLoad = signal<number | null>(null);
  liftReps = signal<number | null>(1);
  liftDate = signal(today());
  liftPending = signal(false);
  liftError = signal('');
  celebrating = signal<Lift | null>(null);

  ngOnInit() {
    this.prog.movements().subscribe({ next: m => this.movements.set(m), error: () => {} });
    this.perf.benchmarkHistory().subscribe({
      next: b => { this.benchmarks.set(b); this.loadingBm.set(false); },
      error: () => this.loadingBm.set(false),
    });
    this.reloadPrs(true);
  }

  private reloadPrs(selectFirst: boolean) {
    this.perf.prs().subscribe({
      next: p => {
        this.prs.set(p);
        this.loadingPrs.set(false);
        if (selectFirst && p.length && !this.selected()) this.select(p[0]);
      },
      error: () => this.loadingPrs.set(false),
    });
  }

  select(l: Lift) {
    this.selected.set(l.movementId);
    this.selectedName.set(l.movementName);
    this.perf.lifts(l.movementId).subscribe({
      next: entries => {
        this.chartPoints.set(entries.map(e => ({ date: e.performedOn, load: e.load })));
        this.history.set([...entries].reverse());
      },
      error: () => {},
    });
  }

  saveLift() {
    const m = this.movements().find(x => x.name.toLowerCase() === this.movementName().trim().toLowerCase());
    if (!m) { this.liftError.set('Pick a movement from the list.'); return; }
    if (!this.liftLoad() || this.liftLoad()! <= 0) { this.liftError.set('Enter the load you lifted.'); return; }
    this.liftError.set('');
    this.liftPending.set(true);
    this.perf.logLift({ movementId: m.id, load: this.liftLoad()!, reps: this.liftReps() ?? 1, performedOn: this.liftDate() })
      .subscribe({
        next: l => {
          this.liftPending.set(false);
          this.liftLoad.set(null);
          this.celebrating.set(l.isPr ? l : null);
          this.reloadPrs(false);
          this.select({ ...l });
          this.selectedName.set(l.movementName);
        },
        error: () => {
          this.liftPending.set(false);
          this.liftError.set("Couldn't save — bad connection? Your entry is still here, try again.");
        },
      });
  }

  formatBest(b: BenchmarkHistory): string {
    switch (b.scoreType) {
      case 'TIME': return b.timeSeconds != null
        ? `${Math.floor(b.timeSeconds / 60)}:${String(b.timeSeconds % 60).padStart(2, '0')}` : '—';
      case 'ROUNDS_REPS': return `${b.rounds ?? 0}+${b.reps ?? 0}`;
      case 'LOAD': return `${b.load ?? 0}`;
      default: return 'Done';
    }
  }
}

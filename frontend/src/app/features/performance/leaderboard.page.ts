import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PerformanceService, Leaderboard } from './performance.service';
import { AvatarComponent } from '../../ui/avatar.component';

/** Hero surface: the board is sacred — full page, huge ranks, red for the top spot. */
@Component({
  selector: 'bh-leaderboard-page',
  standalone: true,
  imports: [RouterLink, AvatarComponent],
  template: `
    <section class="board">
      <a class="back" routerLink="/athlete/wod">‹ Today's work</a>
      <header class="head">
        <span class="eyebrow">Leaderboard</span>
        <h1 class="title">{{ title }}</h1>
      </header>
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading the board…</p> }
        @case ('error') { <p class="stateline err">Couldn't load.
          <button class="retry" (click)="load()">Try again</button></p> }
        @default {
          @if (lb(); as board) {
            <div class="rows" data-testid="leaderboard">
              @for (e of board.entries; track e.rank) {
                <div class="row" [class.win]="e.rank === 1">
                  <span class="rank num">{{ e.rank }}</span>
                  <bh-avatar [path]="e.avatarPath" [name]="e.athleteName" size="md" />
                  <div class="who">
                    <span class="nm">{{ e.athleteName }}</span>
                    <span class="div">{{ e.rx ? 'RX' : 'Scaled' }}</span>
                  </div>
                  <span class="val num">{{ format(board.scoreType, e) }}</span>
                </div>
              } @empty {
                <div class="empty"><p class="e1">No scores yet.</p>
                  <p class="e2">Be first on the board — log your score from the WOD tab.</p></div>
              }
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .board { max-width: 640px; margin: 0 auto; }
    .back { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--bone-dim);
      text-decoration: none; }
    .back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .head { margin-bottom: var(--sp-5); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--red); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); cursor: pointer; margin-left: var(--sp-2); }
    .retry:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .rows { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 56px auto 1fr auto; gap: var(--sp-4); align-items: center;
      padding: var(--sp-3) var(--sp-2); border-bottom: 1px solid var(--hairline); }
    .rank { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      color: var(--faint); text-align: center; }
    .row.win .rank { color: var(--red); }
    .row.win { border-bottom: 2px solid var(--bone); }
    .who { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .nm { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .div { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    .val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); }
    .num { font-variant-numeric: tabular-nums; }
    @media (max-width: 479px) {
      .row { grid-template-columns: 36px auto 1fr auto; gap: var(--sp-3); }
      .nm { font-size: var(--fs-body); }
      .rank { font-size: var(--fs-h2); }
    }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class LeaderboardPage implements OnInit {
  private perf = inject(PerformanceService);
  private route = inject(ActivatedRoute);

  itemId = '';
  title = '';
  lb = signal<Leaderboard | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  ngOnInit() {
    this.itemId = this.route.snapshot.paramMap.get('itemId')!;
    this.title = this.route.snapshot.queryParamMap.get('title') ?? 'Leaderboard';
    this.load();
  }

  load() {
    this.state.set('loading');
    this.perf.leaderboard(this.itemId).subscribe({
      next: l => { this.lb.set(l); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  format(scoreType: string, e: { timeSeconds: number | null; rounds: number | null; reps: number | null; load: number | null; finished: boolean }): string {
    switch (scoreType) {
      case 'TIME': return e.finished && e.timeSeconds != null
        ? `${Math.floor(e.timeSeconds / 60)}:${String(e.timeSeconds % 60).padStart(2, '0')}`
        : `${e.reps ?? 0} reps`;
      case 'ROUNDS_REPS': return `${e.rounds ?? 0}+${e.reps ?? 0}`;
      case 'LOAD': return `${e.load ?? 0}`;
      default: return 'Done';
    }
  }
}

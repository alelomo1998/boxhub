import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProgrammingService, Board, BoardTrack } from '../programming/programming.service';
import { PerformanceService, Leaderboard, MyScore, Score } from '../performance/performance.service';
import { BookingService, MyBooking } from '../booking/booking.service';
import { ScoreFormComponent } from '../performance/score-form.component';
import { SheetComponent } from '../../ui/sheet.component';

@Component({
  selector: 'bh-today',
  standalone: true,
  imports: [DatePipe, RouterLink, ScoreFormComponent, SheetComponent],
  template: `
    <section class="today">
      <header class="head">
        <span class="eyebrow">{{ now | date:'EEEE d MMMM' }}</span>
        <h1 class="title">Today</h1>
      </header>

      @if (nextClass(); as c) {
        <a class="classbar" routerLink="/athlete/book">
          <span class="cb-time">{{ c.startAt | date:'HH:mm' }}</span>
          <span class="cb-name">{{ c.sessionName }}</span>
          <span class="cb-state">{{ c.status === 'WAITLIST' ? 'Waitlist #' + c.position : 'Booked' }}</span>
        </a>
      }

      @switch (boardState()) {
        @case ('loading') { <p class="stateline">Loading today's board…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load the board.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @case ('empty') {
          <div class="empty">
            <p class="e1">No WOD posted for today yet.</p>
            <p class="e2">Your coach hasn't published today's programming — check back later.</p>
          </div>
        }
        @case ('ready') {
          @if (tracks().length > 1) {
            <div class="seg" role="tablist" aria-label="Track">
              @for (t of tracks(); track t.trackId) {
                <button class="segbtn" role="tab" [attr.aria-selected]="selected() === t.trackId"
                        [class.on]="selected() === t.trackId" (click)="selected.set(t.trackId)">{{ t.trackName }}</button>
              }
            </div>
          }

          @if (current(); as t) {
            @if (t.wod; as w) {
              <article class="wod">
                <h2 class="wt">{{ w.title }}</h2>
                <div class="meta">
                  <span>{{ w.wodType }}</span>
                  @if (w.timeCapSeconds) { <span>cap {{ minutes(w.timeCapSeconds) }}′</span> }
                  <span>{{ w.scoreType }}</span>
                </div>

                @for (blk of w.blocks.blocks; track $index) {
                  <div class="block">
                    @if (blk.label) { <div class="blabel">{{ blk.label }}<span class="bnote">{{ blk.note }}</span></div> }
                    @for (l of blk.lines; track $index) {
                      <div class="line"><span class="reps">{{ l.reps }}</span><span class="mv">{{ l.text }}</span><span class="ld">{{ l.load }}</span></div>
                    }
                  </div>
                }
                @if (w.bodyText) { <pre class="wb">{{ w.bodyText }}</pre> }
                @if (w.scalingNotes) { <p class="scaling">Scaling — {{ w.scalingNotes }}</p> }

                @if (t.slotId; as slotId) {
                  @if (myScoreFor(slotId); as ms) {
                    <div class="logged" data-testid="my-score">
                      <span class="lg-val">{{ formatMyScore(ms) }}</span>
                      <span class="lg-tag">{{ ms.rx ? 'RX' : 'Scaled' }} · logged ✓</span>
                      <button class="quiet" (click)="openBoardSheet(slotId)">Leaderboard</button>
                      <button class="quiet" (click)="openScoreSheet(t)">Edit</button>
                    </div>
                  } @else {
                    <div class="cta">
                      <button class="log" data-testid="log-score" (click)="openScoreSheet(t)">Log score</button>
                      <button class="quiet" (click)="openBoardSheet(slotId)">Leaderboard</button>
                    </div>
                  }
                }
              </article>
            }
          }
        }
      }
    </section>

    <bh-sheet [open]="scoreSheet() !== null" [title]="'Log — ' + (scoreSheet()?.wod?.title ?? '')"
              label="Log score" (closed)="scoreSheet.set(null)">
      @if (scoreSheet(); as t) {
        <bh-score-form [slotId]="t.slotId!" [scoreType]="t.wod!.scoreType" (saved)="onSaved($event)" />
      }
    </bh-sheet>

    <bh-sheet [open]="boardSheet() !== null" title="Leaderboard" label="Leaderboard" (closed)="boardSheet.set(null)">
      @if (boardSheet(); as slotId) {
        @if (lb(); as board) {
          <div class="lb" data-testid="leaderboard">
            @for (e of board.entries; track e.rank) {
              <div class="lb-row" [class.win]="e.rank === 1">
                <span class="lb-rank">{{ e.rank }}</span>
                <span class="lb-name">{{ e.athleteName }}</span>
                <span class="lb-tag">{{ e.rx ? 'RX' : 'Scaled' }}</span>
                <span class="lb-val">{{ formatEntry(board.scoreType, e) }}</span>
              </div>
            } @empty { <p class="stateline">No scores yet — be first on the board.</p> }
          </div>
        } @else { <p class="stateline">Loading leaderboard…</p> }
      }
    </bh-sheet>
  `,
  styles: [`
    .today { max-width: 720px; margin: 0 auto; }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }

    .classbar { display: flex; align-items: baseline; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--hairline); border-radius: var(--edge); margin-bottom: var(--sp-5);
      background: var(--surface); text-decoration: none; color: var(--bone); min-height: var(--tap); box-sizing: border-box; }
    .cb-time { font-weight: 700; font-variant-numeric: tabular-nums; }
    .cb-name { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; flex: 1;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cb-state { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint); text-transform: uppercase; }
    .classbar:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .stateline { color: var(--bone-dim); font-size: var(--fs-body); }
    .stateline.err { color: var(--red); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); font-size: var(--fs-body); margin: 0; }

    .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border: 1px solid var(--hairline);
      border-radius: var(--edge); overflow: hidden; margin-bottom: var(--sp-4); }
    .segbtn { min-height: var(--tap); background: transparent; border: none; color: var(--bone-dim);
      font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body); text-transform: uppercase;
      letter-spacing: 0.04em; cursor: pointer; }
    .segbtn.on { background: var(--surface-2); color: var(--bone); box-shadow: inset 0 -2px 0 var(--red); }
    .segbtn:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--red-glow); }

    .wod { border: 1px solid var(--hairline); border-radius: var(--edge); background: var(--surface);
      padding: var(--sp-5); }
    .wt { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; margin: 0 0 4px; text-wrap: balance; }
    .meta { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); font-family: var(--font-mono);
      font-size: var(--fs-meta); text-transform: uppercase; color: var(--faint); }
    .block { margin-bottom: var(--sp-4); }
    .blabel { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      color: var(--faint); margin-bottom: 6px; }
    .bnote { margin-left: 8px; color: var(--bone-dim); }
    .line { display: grid; grid-template-columns: 72px 1fr auto; gap: var(--sp-3); padding: 7px 0;
      border-bottom: 1px solid var(--hairline); align-items: baseline; }
    .reps { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; }
    .mv { font-size: 16px; }
    .ld { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--faint); font-variant-numeric: tabular-nums; }
    .wb { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone-dim);
      white-space: pre-wrap; margin: var(--sp-3) 0 0; }
    .scaling { font-size: var(--fs-sm); color: var(--faint); margin-top: var(--sp-3); }

    .cta { display: flex; gap: var(--sp-3); margin-top: var(--sp-5); }
    .log { flex: 1; min-height: 52px; background: var(--red); color: var(--on-red); border: none;
      border-radius: var(--edge); font-family: var(--font-display); font-weight: 800; font-size: 18px;
      text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: box-shadow var(--dur) var(--ease-out); }
    .log:hover { box-shadow: 0 6px 24px var(--red-glow); }
    .log:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .quiet { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); font-size: var(--fs-sm); cursor: pointer; }
    .quiet:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .logged { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-5); flex-wrap: wrap; }
    .lg-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .lg-tag { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      color: var(--bone-dim); flex: 1; }

    .lb-row { display: grid; grid-template-columns: 32px 1fr auto auto; gap: var(--sp-3); align-items: baseline;
      padding: 9px 0; border-bottom: 1px solid var(--hairline); }
    .lb-rank { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--faint); }
    .lb-row.win .lb-rank { color: var(--red); }
    .lb-name { font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lb-tag { font-family: var(--font-mono); font-size: 10px; color: var(--faint); }
    .lb-val { font-variant-numeric: tabular-nums; font-weight: 700; }
  `],
})
export class TodayPage implements OnInit {
  private prog = inject(ProgrammingService);
  private perf = inject(PerformanceService);
  private booking = inject(BookingService);

  now = new Date();
  board = signal<Board | null>(null);
  boardState = signal<'loading' | 'error' | 'empty' | 'ready'>('loading');
  myScores = signal<MyScore[]>([]);
  bookings = signal<MyBooking[]>([]);
  selected = signal<string | null>(null);
  scoreSheet = signal<BoardTrack | null>(null);
  boardSheet = signal<string | null>(null);
  lb = signal<Leaderboard | null>(null);

  tracks = computed(() => this.board()?.tracks.filter(t => t.wod) ?? []);
  current = computed(() => this.tracks().find(t => t.trackId === this.selected()) ?? this.tracks()[0]);

  nextClass = computed(() => {
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59);
    return this.bookings().find(b => new Date(b.startAt) <= todayEnd) ?? null;
  });

  ngOnInit() {
    this.load();
    this.perf.myScores().subscribe({ next: s => this.myScores.set(s), error: () => {} });
    this.booking.myBookings(new Date().toISOString()).subscribe({ next: b => this.bookings.set(b), error: () => {} });
  }

  load() {
    this.boardState.set('loading');
    this.prog.board().subscribe({
      next: b => {
        this.board.set(b);
        this.boardState.set(b.tracks.some(t => t.wod) ? 'ready' : 'empty');
      },
      error: () => this.boardState.set('error'),
    });
  }

  minutes(seconds: number) { return Math.round(seconds / 60); }

  myScoreFor(slotId: string): MyScore | undefined {
    return this.myScores().find(s => s.slotId === slotId);
  }

  openScoreSheet(t: BoardTrack) { this.scoreSheet.set(t); }

  openBoardSheet(slotId: string) {
    this.boardSheet.set(slotId);
    this.lb.set(null);
    this.perf.leaderboard(slotId).subscribe({
      next: l => this.lb.set(l),
      error: () => this.lb.set({ scoreType: 'NONE', entries: [] }),
    });
  }

  onSaved(s: Score) {
    this.scoreSheet.set(null);
    // reflect immediately on the card, then refresh from the server
    this.myScores.update(list => [
      { slotId: s.slotId, slotDate: '', wodTitle: '', trackName: '', scoreType: s.scoreType,
        rx: s.rx, timeSeconds: s.timeSeconds, rounds: s.rounds, reps: s.reps, load: s.load, finished: s.finished },
      ...list.filter(x => x.slotId !== s.slotId),
    ]);
    this.perf.myScores().subscribe({ next: list => this.myScores.set(list), error: () => {} });
  }

  formatMyScore(s: MyScore): string {
    return this.format(s.scoreType, s.timeSeconds, s.rounds, s.reps, s.load, s.finished);
  }
  formatEntry(scoreType: string, e: { timeSeconds: number | null; rounds: number | null; reps: number | null; load: number | null; finished: boolean }): string {
    return this.format(scoreType, e.timeSeconds, e.rounds, e.reps, e.load, e.finished);
  }
  private format(scoreType: string, time: number | null, rounds: number | null, reps: number | null,
                 load: number | null, finished: boolean): string {
    switch (scoreType) {
      case 'TIME': return finished && time != null
        ? `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`
        : `${reps ?? 0} reps`;
      case 'ROUNDS_REPS': return `${rounds ?? 0}+${reps ?? 0}`;
      case 'LOAD': return `${load ?? 0}`;
      default: return 'Done';
    }
  }
}

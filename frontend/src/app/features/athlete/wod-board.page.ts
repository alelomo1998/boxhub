import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ProgrammingService, Board } from '../programming/programming.service';

@Component({
  selector: 'bh-wod-board',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <section class="board">
      <header class="bhead">
        <span class="eyebrow">Today · {{ today() | date:'EEEE d MMM' }}</span>
        <h1 class="title">WOD Board</h1>
      </header>

      @if (board(); as b) {
        @if (b.tracks.length) {
          <div class="tracks">
            @for (t of b.tracks; track t.trackId) {
              <article class="tk">
                <div class="tk-head"><span class="tk-name">{{ t.trackName }}</span><span class="live">● LIVE</span></div>
                @if (t.wod; as w) {
                  <h2 class="wt">{{ w.title }}</h2>
                  <div class="meta"><span class="type">{{ w.wodType }}</span>
                    @if (w.timeCapSeconds) { <span class="cap">cap {{ (w.timeCapSeconds / 60) | number:'1.0-0' }}′</span> }
                    <span class="score">{{ w.scoreType }}</span>
                  </div>
                  @for (blk of w.blocks.blocks; track $index) {
                    <div class="block">
                      @if (blk.label) { <div class="blabel">{{ blk.label }}<span class="bnote">{{ blk.note }}</span></div> }
                      @for (l of blk.lines; track $index) {
                        <div class="line"><span class="reps">{{ l.reps }}</span><span class="mv">{{ l.text }}</span><span class="load">{{ l.load }}</span></div>
                      }
                    </div>
                  }
                  @if (w.bodyText) { <pre class="wb">{{ w.bodyText }}</pre> }
                  @if (w.scalingNotes) { <p class="scaling">Scaling — {{ w.scalingNotes }}</p> }
                }
              </article>
            }
          </div>
        } @else {
          <p class="empty">No WOD published for today yet. Check back soon.</p>
        }
      }
    </section>
  `,
  styles: [`
    .board { max-width: 1000px; }
    .bhead { margin-bottom: var(--sp-6); }
    .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 44px;
      text-transform: uppercase; letter-spacing: 0.01em; margin: 4px 0 0; }
    .tracks { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-5); }
    .tk { border: 1px solid var(--hairline); border-radius: var(--edge); padding: var(--sp-5); background: var(--surface); }
    .tk-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-3); }
    .tk-name { font-family: var(--font-display); font-weight: 700; font-size: 18px; text-transform: uppercase;
      letter-spacing: 0.04em; color: var(--faint); }
    .live { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--red);
      text-shadow: 0 0 10px var(--red-glow); }
    .wt { font-family: var(--font-display); font-weight: 800; font-size: 32px; text-transform: uppercase; margin: 0 0 6px; }
    .meta { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); font-family: var(--font-mono);
      font-size: 11px; text-transform: uppercase; color: var(--faint); }
    .block { margin-bottom: var(--sp-4); }
    .blabel { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--faint); margin-bottom: 6px; }
    .bnote { margin-left: 8px; color: var(--bone-dim); }
    .line { display: grid; grid-template-columns: 72px 1fr auto; gap: var(--sp-3); padding: 6px 0;
      border-bottom: 1px solid var(--hairline); align-items: baseline; }
    .reps { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--bone); }
    .mv { font-size: 16px; }
    .load { font-family: var(--font-mono); font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }
    .wb { font-family: var(--font-body); font-size: 15px; color: var(--bone-dim); white-space: pre-wrap; margin: var(--sp-3) 0 0; }
    .scaling { font-size: 13px; color: var(--faint); margin-top: var(--sp-3); }
    .empty { color: var(--bone-dim); font-size: 16px; padding: var(--sp-6) 0; }
    @media (max-width: 560px) { .title { font-size: 34px; } .wt { font-size: 26px; } }
  `],
})
export class WodBoardPage implements OnInit {
  private prog = inject(ProgrammingService);
  board = signal<Board | null>(null);
  today = signal(new Date());

  ngOnInit() { this.prog.board().subscribe(b => this.board.set(b)); }
}

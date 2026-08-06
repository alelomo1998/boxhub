import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProgrammingService, MyClass, SessionItem } from '../programming/programming.service';
import { ScoreFormComponent } from '../performance/score-form.component';
import { SheetComponent } from '../../ui/sheet.component';

/** The day's work: your booked class's pieces, log per scored piece, leaderboard per piece. */
@Component({
  selector: 'bh-wod',
  standalone: true,
  imports: [DatePipe, RouterLink, ScoreFormComponent, SheetComponent],
  template: `
    <section class="wodpage">
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading today's class…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (data(); as d) {
            @if (d.session; as s) {
              <header class="head">
                <span class="eyebrow">{{ s.startAt | date:'EEEE d MMMM · HH:mm' }}
                  @if (!d.booked) { · not booked }</span>
                <h1 class="title">{{ s.name }}</h1>
              </header>

              @if (d.items.length) {
                <div class="pieces">
                  @for (i of d.items; track i.id) {
                    <article class="piece">
                      <div class="p-head">
                        <span class="p-type">{{ typeLabel(i) }}</span>
                        <h2 class="p-title">{{ i.wod.title }}</h2>
                      </div>

                      @for (blk of i.wod.blocks.blocks; track $index) {
                        <div class="block">
                          @if (blk.label) { <div class="blabel">{{ blk.label }}<span class="bnote">{{ blk.note }}</span></div> }
                          @for (l of blk.lines; track $index) {
                            <div class="line"><span class="reps">{{ l.reps }}</span><span class="mv">{{ l.text }}</span><span class="ld">{{ l.load }}</span></div>
                          }
                        </div>
                      }
                      @if (i.wod.bodyText) { <pre class="wb">{{ i.wod.bodyText }}</pre> }
                      @if (i.wod.scalingNotes) { <p class="scaling">Scaling — {{ i.wod.scalingNotes }}</p> }

                      @if (i.scoreable && i.scoreType !== 'NONE') {
                        <div class="p-actions">
                          @if (i.myScoreLogged) {
                            <span class="logged" data-testid="logged-mark">Logged ✓</span>
                            <button class="quiet" (click)="openScore(i)">Edit</button>
                          } @else {
                            <button class="log" [attr.data-testid]="'log-' + i.id" (click)="openScore(i)">Log score</button>
                          }
                          <a class="quiet aslink" [routerLink]="['/athlete/board', i.id]"
                             [queryParams]="{ title: i.wod.title }">Leaderboard</a>
                        </div>
                      } @else if (i.wod.wodType === 'STRENGTH') {
                        <div class="p-actions">
                          <a class="quiet aslink" routerLink="/athlete/progress">Log your lifts →</a>
                        </div>
                      }
                    </article>
                  }
                </div>
              } @else {
                <div class="empty">
                  <p class="e1">Programming not posted yet.</p>
                  <p class="e2">Your coach hasn't published this class — check back later.</p>
                </div>
              }
            } @else {
              <div class="empty">
                <p class="e1">No class today.</p>
                @if (d.otherToday.length) {
                  <p class="e2">Classes running today:</p>
                  <ul class="others">
                    @for (o of d.otherToday; track o.id) {
                      <li><span class="num">{{ o.startAt | date:'HH:mm' }}</span> {{ o.name }}</li>
                    }
                  </ul>
                  <a class="quiet aslink" routerLink="/athlete/book">Book a class →</a>
                } @else {
                  <p class="e2">Nothing scheduled — rest day?</p>
                }
              </div>
            }
          }
        }
      }
    </section>

    <bh-sheet [open]="scoreItem() !== null" [title]="'Log — ' + (scoreItem()?.wod?.title ?? '')"
              label="Log score" [confirmClose]="scoreDirty()" (closed)="scoreItem.set(null)">
      @if (scoreItem(); as i) {
        <bh-score-form [itemId]="i.id" [scoreType]="i.scoreType"
                       (dirtyChange)="scoreDirty.set($event)" (saved)="onSaved()" />
      }
    </bh-sheet>

  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .wodpage { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry, .quiet { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); font-size: var(--fs-sm); cursor: pointer; }
    .retry:focus-visible, .quiet:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .log:focus-visible { outline: 2px solid var(--focus-inv); outline-offset: 2px; }
    .aslink { display: inline-flex; align-items: center; text-decoration: none; }

    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }

    .pieces { display: flex; flex-direction: column; gap: var(--sp-4); }
    .piece { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); }
    .p-head { margin-bottom: var(--sp-3); }
    .p-type { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .p-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }

    .block { margin-bottom: var(--sp-3); }
    .blabel { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      color: var(--faint); margin-bottom: 6px; }
    .bnote { margin-left: 8px; color: var(--bone-dim); }
    .line { display: grid; grid-template-columns: 72px 1fr auto; gap: var(--sp-3); padding: 7px 0;
      border-bottom: 1px solid var(--hairline); align-items: baseline; }
    .reps { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; }
    .mv { font-size: 16px; }
    .ld { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--faint); font-variant-numeric: tabular-nums; }
    .wb { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone-dim);
      white-space: pre-wrap; margin: var(--sp-2) 0 0; }
    .scaling { font-size: var(--fs-sm); color: var(--faint); margin-top: var(--sp-2); }

    .p-actions { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4); flex-wrap: wrap; }
    .log { flex: 1; min-height: 48px; background: var(--volt); color: var(--on-volt); border: none;
      border-radius: var(--edge); font-family: var(--font-display); font-weight: 800; font-size: 17px;
      text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; }
    .logged { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--good); }

    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0 0 var(--sp-3); }
    .others { list-style: none; margin: 0 0 var(--sp-4); padding: 0; color: var(--bone-dim); }
    .others li { padding: 6px 0; border-bottom: 1px solid var(--hairline); }
    .num { font-variant-numeric: tabular-nums; }
  `],
})
export class WodPage implements OnInit {
  private prog = inject(ProgrammingService);

  data = signal<MyClass | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  scoreItem = signal<SessionItem | null>(null);
  scoreDirty = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.prog.myClassToday().subscribe({
      next: d => { this.data.set(d); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  typeLabel(i: SessionItem): string {
    const t = i.wod.wodType.replace('_', ' ');
    return i.scoreable && i.scoreType !== 'NONE' ? `${t} · scored` : t;
  }

  openScore(i: SessionItem) { this.scoreDirty.set(false); this.scoreItem.set(i); }

  onSaved() {
    this.scoreDirty.set(false);
    this.scoreItem.set(null);
    this.load(); // refresh myScoreLogged marks
  }
}

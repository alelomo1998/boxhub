import { ChangeDetectionStrategy, Component } from '@angular/core';

/** One line of the posted WOD: what's prescribed, and whether it's the piece the class is on now. */
interface WodBoardLine {
  readonly reps: string;
  readonly movement: string;
  readonly live: boolean;
}

/** One row of the leaderboard strip under the board. */
interface WodBoardLeaderboardRow {
  readonly rank: number;
  readonly name: string;
  readonly score: string;
}

/**
 * The hero half of M13b's proof — a WOD board rendered against the new language inside the real
 * app shell. Everything below is fabricated for this screen; nothing here talks to an API.
 *
 * Three things invert to volt on this panel (the score-cap chip, the live line, the leaderboard
 * leader row) and design law v3 §4 device 1 names all three as sanctioned inversion sites — the
 * chip states what's prescribed, the live line states where the class is now, the leader row
 * states who's winning. The gate that actually matters is `data-live`: exactly one line ever
 * carries it, because "where is the class right now" is the one meaning that must never be
 * ambiguous. See spec §4 and Task 9 step 5.
 */
@Component({
  selector: 'bh-proof-wod-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="board" data-proof="wod-board">
      <header class="head">
        <p class="t-eyebrow" i18n="Board eyebrow: class day and time">Thu Aug 6 · 06:00 class</p>
        <h2 class="t-display name" i18n="WOD name, gym vocabulary — a proper noun, not translated prose">Fran</h2>
        <span class="cap t-figure" i18n="Score type and time cap">For time · 12:00 cap</span>
      </header>
      <ol class="lines">
        @for (line of fabricatedWodLines; track line.movement + line.reps) {
          <li class="line" [class.live]="line.live" [attr.data-live]="line.live ? 'true' : null">
            <span class="reps t-figure num">{{ line.reps }}</span>
            <span class="movement">{{ line.movement }}</span>
          </li>
        }
      </ol>
    </section>

    <section class="rail">
      <p class="t-eyebrow" i18n="Leaderboard strip heading">Leaderboard</p>
      <ol class="rows">
        @for (row of fabricatedLeaderboard; track row.rank) {
          <li class="row" [class.leader]="row.rank === 1">
            <span class="rank t-figure num">{{ row.rank }}</span>
            <span class="name">{{ row.name }}</span>
            <span class="score t-figure num">{{ row.score }}</span>
          </li>
        }
      </ol>
    </section>
  `,
  styles: [`
    .board { background: var(--ground); border: 2px solid var(--volt); border-radius: var(--r-card);
      padding: var(--sp-6); }
    .head { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2);
      margin-bottom: var(--sp-5); }
    .head .name { font-size: var(--fs-hero); color: var(--bone); margin: 0; }
    .cap { display: inline-block; background: var(--volt); color: var(--on-volt);
      padding: var(--sp-1) var(--sp-3); border-radius: var(--r-xs); font-size: var(--fs-sm); }
    .lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
      gap: var(--sp-1); }
    .line { display: flex; align-items: baseline; gap: var(--sp-3); font-family: var(--font-mono);
      font-size: var(--fs-body); color: var(--bone-dim); padding: var(--sp-2) var(--sp-3);
      border-radius: var(--r-xs); }
    .line .reps { font-weight: 700; min-width: 2.5em; color: var(--bone); }
    .line .movement { font-weight: 400; }
    .line.live { background: var(--volt); }
    .line.live .reps, .line.live .movement { color: var(--on-volt); }
    .rail { background: var(--surface); border-radius: var(--r-card); padding: var(--sp-5);
      margin-top: var(--sp-4); }
    .rows { list-style: none; margin: var(--sp-2) 0 0; padding: 0; display: flex;
      flex-direction: column; gap: 1px; }
    .row { display: grid; grid-template-columns: 2.5em 1fr auto; align-items: center;
      gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-xs);
      color: var(--bone-dim); font-family: var(--font-mono); }
    .row .name { font-family: var(--font-body); color: var(--bone); }
    .row.leader { background: var(--volt); }
    .row.leader .rank, .row.leader .name, .row.leader .score { color: var(--on-volt); }
  `],
})
export class ProofWodBoardComponent {
  protected readonly fabricatedWodLines: readonly WodBoardLine[] = [
    { reps: '21', movement: $localize`:@@dev.wodBoard.thrusters:Thrusters 42.5kg`, live: false },
    { reps: '21', movement: $localize`:@@dev.wodBoard.pullups:Pull-ups`, live: false },
    { reps: '15', movement: $localize`:@@dev.wodBoard.thrusters:Thrusters 42.5kg`, live: false },
    { reps: '15', movement: $localize`:@@dev.wodBoard.pullups:Pull-ups`, live: false },
    { reps: '9', movement: $localize`:@@dev.wodBoard.thrusters:Thrusters 42.5kg`, live: false },
    { reps: '9', movement: $localize`:@@dev.wodBoard.pullups:Pull-ups`, live: true },
  ];

  protected readonly fabricatedLeaderboard: readonly WodBoardLeaderboardRow[] = [
    { rank: 1, name: $localize`:@@dev.wodBoard.leader1:Mara Vance`, score: '3:12' },
    { rank: 2, name: $localize`:@@dev.wodBoard.leader2:Theo Ridge`, score: '3:19' },
    { rank: 3, name: $localize`:@@dev.wodBoard.leader3:Sami Okafor`, score: '3:24' },
  ];
}

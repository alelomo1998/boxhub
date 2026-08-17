import { Component, input } from '@angular/core';

/** A seeded benchmark prescription (verbatim from V5*.sql), reformatted for the panel's narrow
 * column: name, rep scheme, then movements each on their own line — a board, not a sentence. */
interface Benchmark {
  readonly name: string;
  readonly scheme: string;
  readonly movements: readonly string[];
}

const BENCHMARKS: readonly Benchmark[] = [
  { name: 'Fran', scheme: '21-15-9 reps for time', movements: ['Thrusters (95/65 lb)', 'Pull-Ups'] },
  { name: 'Grace', scheme: '30 for time', movements: ['Clean and Jerks (135/95 lb)'] },
  { name: 'Isabel', scheme: '30 for time', movements: ['Snatches (135/95 lb)'] },
  { name: 'Diane', scheme: '21-15-9 reps for time', movements: ['Deadlifts (225/155 lb)', 'Handstand Push-Ups'] },
  { name: 'Elizabeth', scheme: '21-15-9 reps for time', movements: ['Cleans (135/95 lb)', 'Ring Dips'] },
  { name: 'Karen', scheme: '150 for time', movements: ['Wall Balls (20/14 lb)'] },
  { name: 'Annie', scheme: '50-40-30-20-10 reps for time', movements: ['Double-Unders', 'Sit-Ups'] },
  { name: 'Cindy', scheme: 'AMRAP 20', movements: ['5 Pull-Ups', '10 Push-Ups', '15 Air Squats'] },
];

/** Two distinct entries — never the same workout twice. `j` is drawn from the remaining
 * BENCHMARKS.length-1 slots then shifted past `i`, so it's uniform over "any index but i". */
function randomBenchmarkPair(): readonly [Benchmark, Benchmark] {
  const i = Math.floor(Math.random() * BENCHMARKS.length);
  let j = Math.floor(Math.random() * (BENCHMARKS.length - 1));
  if (j >= i) j++;
  return [BENCHMARKS[i], BENCHMARKS[j]];
}

/**
 * The two-workout board that sits in the brand panel of the split auth screens (login, signup,
 * start-box, join — start-box and join wire it up when those screens are rebuilt). Pure
 * information, no volt: mono type, tabular numerals, `--bone` / `--bone-dim` / `--faint` only.
 *
 * Usage projects it into `bh-auth-layout`'s panel slot with the bare `panel` attribute on this
 * component's own host:
 *
 *   <bh-benchmark-board panel testId="login-benchmark" />
 *
 * Each screen names its own hook via `testId` — it lands on this component's root element.
 */
@Component({
  selector: 'bh-benchmark-board',
  standalone: true,
  template: `
    <div class="benchmark" [attr.data-testid]="testId() || null">
      @for (b of benchmarks; track b.name; let last = $last) {
        <div class="benchmark-board">
          <p class="t-eyebrow benchmark-label">
            <span i18n="@@ui.benchmarkBoard.label">Benchmark</span> {{ b.name }}
          </p>
          <p class="benchmark-scheme">{{ b.scheme }}</p>
          @for (line of b.movements; track line) {
            <p class="benchmark-line">{{ line }}</p>
          }
        </div>
        @if (!last) {
          <hr class="benchmark-rule" />
        }
      }
    </div>`,
  styles: [`
    /* No bottom margin: the auth panel's space-between owns the gaps now. Flex column + gap stacks
       the two boards and the hairline rule between them without touching each board's own spacing. */
    .benchmark { margin: 0; font-family: var(--font-mono);
      font-variant-numeric: tabular-nums; display: flex; flex-direction: column; gap: var(--sp-3); }
    .benchmark p { margin: 0; }
    .benchmark-rule { border: 0; height: 1px; margin: 0; background: var(--hairline); }
    .benchmark-label { margin-bottom: var(--sp-2); }
    .benchmark-scheme { font-size: var(--fs-sm); font-weight: 700; color: var(--bone); }
    .benchmark-line { font-size: var(--fs-sm); color: var(--faint); margin-top: var(--sp-1); }
    /* Below 720px the split auth layout collapses to a stacked column with the panel ABOVE the
       form — two boards there would push the primary action down the screen, against "thirty
       seconds, one thumb". */
    @media (max-width: 719px) {
      .benchmark { display: none; }
    }
  `],
})
export class BenchmarkBoardComponent {
  testId = input('');
  readonly benchmarks = randomBenchmarkPair();
}

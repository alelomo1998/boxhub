import { TestBed } from '@angular/core/testing';
import { BenchmarkBoardComponent } from './benchmark-board.component';

// Verbatim from the seeded prescriptions in backend/src/main/resources/db/migration/V5*.sql —
// independent of benchmark-board.component.ts's own BENCHMARKS const, so a corrupted entry there
// (empty, mistyped, wrong load) fails this instead of the test just echoing the same bug back.
const KNOWN_BENCHMARKS: Record<string, { scheme: string; movements: string[] }> = {
  Fran: { scheme: '21-15-9 reps for time', movements: ['Thrusters (95/65 lb)', 'Pull-Ups'] },
  Grace: { scheme: '30 for time', movements: ['Clean and Jerks (135/95 lb)'] },
  Isabel: { scheme: '30 for time', movements: ['Snatches (135/95 lb)'] },
  Diane: { scheme: '21-15-9 reps for time', movements: ['Deadlifts (225/155 lb)', 'Handstand Push-Ups'] },
  Elizabeth: { scheme: '21-15-9 reps for time', movements: ['Cleans (135/95 lb)', 'Ring Dips'] },
  Karen: { scheme: '150 for time', movements: ['Wall Balls (20/14 lb)'] },
  Annie: { scheme: '50-40-30-20-10 reps for time', movements: ['Double-Unders', 'Sit-Ups'] },
  Cindy: { scheme: 'AMRAP 20', movements: ['5 Pull-Ups', '10 Push-Ups', '15 Air Squats'] },
};

describe('BenchmarkBoardComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [BenchmarkBoardComponent] });
    return TestBed.createComponent(BenchmarkBoardComponent);
  }

  it('renders two distinct real benchmark prescriptions, each with its label, under the given testId', () => {
    const fixture = setup();
    fixture.componentRef.setInput('testId', 'some-benchmark');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('[data-testid="some-benchmark"]');
    expect(el).withContext('the testId must land on the component root').not.toBeNull();

    const cmp = fixture.componentInstance;
    const [first, second] = cmp.benchmarks;

    // The property most likely to regress if the picker is "simplified" back to two independent
    // random draws: they must never land on the same workout twice.
    expect(first.name).withContext('the two boards must not be the same benchmark')
      .not.toBe(second.name);

    const boards = Array.from(el.querySelectorAll('.benchmark-board'));
    expect(boards.length).withContext('exactly two boards must render').toBe(2);

    [first, second].forEach((b, i) => {
      const known = KNOWN_BENCHMARKS[b.name];
      // A regression rendering an empty/malformed entry (name not in the known list, or its own
      // scheme/movements drifting from the seeded data) fails here — a weaker "some text exists"
      // assertion would pass regardless of what actually rendered.
      expect(known).withContext(`"${b.name}" must be a known seeded benchmark`).toBeDefined();
      expect(b.scheme).toBe(known.scheme);
      expect(b.movements).toEqual(known.movements);

      const board = boards[i];
      const label = board.querySelector('.benchmark-label')!.textContent!.replace(/\s+/g, ' ').trim();
      expect(label).toBe(`Benchmark ${b.name}`);

      const scheme = board.querySelector('.benchmark-scheme')!.textContent!.trim();
      expect(scheme).toBe(b.scheme);

      const lines = Array.from(board.querySelectorAll('.benchmark-line')).map(n => n.textContent!.trim());
      expect(lines).toEqual([...b.movements]);
    });

    // Not proven here: that the pair is drawn uniformly at random across runs (a single test run
    // only ever sees one pair), and this Karma spec cannot see the CSS media query that hides the
    // block below 720px — that was checked in a real browser instead.
    expect(el.querySelector('.benchmark-rule')).withContext('a rule must separate the two boards').not.toBeNull();
  });

  it('renders with no testId attribute when none is given', () => {
    const fixture = setup();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.benchmark-board')).not.toBeNull();
  });
});

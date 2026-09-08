import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WodPage } from './wod.page';
import { ProgrammingService, MyClass, SessionItem, Wod } from '../programming/programming.service';
import { PerformanceService } from '../performance/performance.service';

const BLANK_WOD: Wod = {
  id: 'w1', title: 'Fran', wodType: 'FOR_TIME',
  macro: 'WORKOUT', timingPreset: 'FOR_TIME', timing: { rounds: 1, segments: [] },
  library: false, teamSize: 1, teamShare: null,
  scoreType: 'TIME', timeCapSeconds: null,
  bodyText: '', blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
};

function item(over: Omit<Partial<SessionItem>, 'wod'> & { wod?: Partial<Wod> }): SessionItem {
  return {
    id: 'i1', wodId: 'w1', sortOrder: 0, scoreable: false, scoreType: 'NONE', myScoreLogged: false,
    ...over,
    wod: { ...BLANK_WOD, ...(over.wod ?? {}) },
  };
}

describe('WodPage — the athlete reader', () => {
  let fixture: ComponentFixture<WodPage>;
  let el: HTMLElement;
  let prog: jasmine.SpyObj<ProgrammingService>;

  function setItems(items: SessionItem[]) {
    const my: MyClass = {
      session: { id: 's1', name: 'WOD Class', startAt: '2026-09-08T18:00:00Z', imagePath: null, programmingStatus: 'PUBLISHED' },
      booked: true, items, otherToday: [],
    };
    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService', ['myClassToday']);
    prog.myClassToday.and.returnValue(of(my));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WodPage],
      providers: [
        provideRouter([]),
        { provide: ProgrammingService, useValue: prog },
        {
          provide: PerformanceService,
          useValue: jasmine.createSpyObj<PerformanceService>('PerformanceService', ['myScore', 'putScore']),
        },
      ],
    });
    fixture = TestBed.createComponent(WodPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  // The live defect this milestone had to fix: score-form has always carried a completion branch
  // and this screen gated it out at two places, so scoreable-with-type-NONE was authorable and
  // could never be logged.
  it('offers a log control for a completion-scored piece', () => {
    setItems([item({ id: 'i1', scoreable: true, scoreType: 'NONE', wod: { title: 'Warmup' } })]);
    expect(el.querySelector('[data-testid="log-i1"]')).toBeTruthy();
  });

  it('still offers nothing for a piece that is not scored at all', () => {
    setItems([item({ id: 'i2', scoreable: false, scoreType: 'NONE', wod: { title: 'Cooldown' } })]);
    expect(el.querySelector('[data-testid="log-i2"]')).toBeNull();
  });

  it('reads a completion-scored piece as scored, the same condition as the log control', () => {
    setItems([item({ id: 'i1', scoreable: true, scoreType: 'NONE', wod: { title: 'Warmup' } })]);
    expect(el.textContent).toContain('scored');
  });

  it('renders the lines of a nested block, not just an empty label', () => {
    setItems([item({
      id: 'i1', wod: {
        title: 'Fran', blocks: {
          blocks: [{ label: 'Fran', blocks: [{ label: '21-15-9', lines: [{ text: 'Thruster', reps: '21' }] }] }],
        },
      },
    })]);
    expect(el.textContent).toContain('21-15-9');
    expect(el.textContent).toContain('Thruster');
  });

  it('renders a line scaling option', () => {
    setItems([item({
      id: 'i1', wod: {
        title: 'W', blocks: {
          blocks: [{
            label: 'A', lines: [{
              text: 'Muscle-up', reps: '6',
              scales: [{ text: 'Pull-up', reps: '12' }, { text: 'Ring row', reps: '20' }],
            }],
          }],
        },
      },
    })]);
    expect(el.textContent).toContain('Pull-up');
    expect(el.textContent).toContain('Ring row');
  });

  it('renders a scaling option on a line inside a nested block too', () => {
    setItems([item({
      id: 'i1', wod: {
        title: 'W', blocks: {
          blocks: [{
            label: 'A', blocks: [{
              label: 'Part 1',
              lines: [{ text: 'Muscle-up', reps: '6', scales: [{ text: 'Ring row', reps: '20' }] }],
            }],
          }],
        },
      },
    })]);
    expect(el.textContent).toContain('Ring row');
  });

  it('renders a plain one-level block exactly as before', () => {
    setItems([item({
      id: 'i1', wod: { title: 'W', blocks: { blocks: [{ label: 'A', lines: [{ text: 'Row', reps: '500m' }] }] } },
    })]);
    expect(el.textContent).toContain('Row');
    expect(el.textContent).toContain('500m');
  });

  it('renders a macro block that carries only sub-blocks without crashing on absent lines', () => {
    setItems([item({
      id: 'i1', wod: { title: 'W', blocks: { blocks: [{ label: 'Only parts', blocks: [{ label: 'P', lines: [] }] }] } },
    })]);
    expect(el.textContent).toContain('Only parts');
  });
});

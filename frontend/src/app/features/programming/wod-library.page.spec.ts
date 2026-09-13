import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WodLibraryPage } from './wod-library.page';
import { LibraryEntry, ProgrammingService, Wod, WodHistoryPage, WodHistoryRow } from './programming.service';

function wod(id: string, title: string, bodyText = ''): Wod {
  return {
    id, title, wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: null, timing: { rounds: 1, segments: [] },
    library: true, teamSize: 1, teamShare: null, scoreType: 'TIME', timeCapSeconds: null,
    bodyText, blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
  };
}
function entry(w: Wod, opts: Partial<Pick<LibraryEntry, 'benchmarkKind' | 'global'>> = {}): LibraryEntry {
  return { wod: w, benchmarkKind: opts.benchmarkKind ?? null, global: opts.global ?? false };
}
function historyRow(itemId: string, sessionId: string, startAt: string, w: Wod): WodHistoryRow {
  return { itemId, sessionId, className: 'CrossFit 60', startAt, wod: w };
}

describe('WodLibraryPage', () => {
  let fixture: ComponentFixture<WodLibraryPage>;
  let component: WodLibraryPage;
  let el: HTMLElement;
  let prog: jasmine.SpyObj<ProgrammingService>;
  let router: Router;

  function setup(entries: LibraryEntry[] = []) {
    TestBed.resetTestingModule();

    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['libraryEntries', 'wodHistory', 'cloneBenchmark']);
    prog.libraryEntries.and.returnValue(of(entries));
    prog.wodHistory.and.returnValue(of({ rows: [], nextBefore: null } as WodHistoryPage));

    TestBed.configureTestingModule({
      imports: [WodLibraryPage],
      providers: [
        provideRouter([]),
        { provide: ProgrammingService, useValue: prog },
      ],
    });

    fixture = TestBed.createComponent(WodLibraryPage);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  function switchToHistory() {
    const radios = el.querySelectorAll<HTMLButtonElement>('[data-testid="lib-tab"] [role="radio"]');
    (radios[1]).click();
    fixture.detectChanges();
  }

  it('renders one card per library entry; a global entry is a button, a saved one a link', () => {
    const saved = entry(wod('w1', 'Fran'));
    const global = entry(wod('b1', 'Murph'), { global: true, benchmarkKind: 'HERO' });
    setup([saved, global]);

    const cards = el.querySelectorAll('[data-testid^="lib-card-"]');
    expect(cards.length).toBe(2);

    const savedEl = el.querySelector('[data-testid="lib-card-w1"]')!;
    expect(savedEl.tagName).toBe('A');
    expect(savedEl.getAttribute('href')).toContain('/coach/wods/w1');

    const globalEl = el.querySelector('[data-testid="lib-card-b1"]')!;
    expect(globalEl.tagName).toBe('BUTTON');
  });

  it('filters by a movement in bodyText', () => {
    const fran = entry(wod('w1', 'Fran', 'Thrusters, Pull-ups'));
    const helen = entry(wod('w2', 'Helen', 'Running, Kettlebell swings'));
    setup([fran, helen]);

    component.onSearch('pull');
    fixture.detectChanges();

    const cards = el.querySelectorAll('[data-testid^="lib-card-"]');
    expect(cards.length).toBe(1);
    expect(el.querySelector('[data-testid="lib-card-w1"]')).not.toBeNull();
  });

  it('shows the error alert when libraryEntries fails, and retries on click', () => {
    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService', ['libraryEntries', 'wodHistory', 'cloneBenchmark']);
    prog.libraryEntries.and.returnValue(throwError(() => new Error('boom')));
    prog.wodHistory.and.returnValue(of({ rows: [], nextBefore: null } as WodHistoryPage));
    TestBed.configureTestingModule({
      imports: [WodLibraryPage],
      providers: [provideRouter([]), { provide: ProgrammingService, useValue: prog }],
    });
    fixture = TestBed.createComponent(WodLibraryPage);
    el = fixture.nativeElement;
    fixture.detectChanges();

    expect(el.querySelector('bh-alert')).not.toBeNull();
    expect(prog.libraryEntries).toHaveBeenCalledTimes(1);

    prog.libraryEntries.and.returnValue(of([]));
    const retry = el.querySelector<HTMLElement>('[data-testid="lib-retry"]')!;
    retry.click();
    fixture.detectChanges();

    expect(prog.libraryEntries).toHaveBeenCalledTimes(2);
  });

  it('does not load history until the tab switches, then loads once', () => {
    setup([]);
    expect(prog.wodHistory).not.toHaveBeenCalled();

    switchToHistory();
    expect(prog.wodHistory).toHaveBeenCalledTimes(1);
  });

  it('groups history rows by day and links a card to the class build route', () => {
    const w = wod('w1', 'Fran');
    const rows = [
      historyRow('i1', 's1', '2026-09-12T06:00:00Z', w),
      historyRow('i2', 's2', '2026-09-11T06:00:00Z', w),
    ];
    setup([]);
    prog.wodHistory.and.returnValue(of({ rows, nextBefore: null } as WodHistoryPage));
    switchToHistory();
    fixture.detectChanges();

    const rules = el.querySelectorAll('.rule');
    expect(rules.length).toBe(2);
    const card = el.querySelector('[data-testid="hist-card-i1"]')!;
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toContain('/coach/classes/s1/build');
  });

  it('shows Load older when nextBefore is set, and appends rows on click', () => {
    const w = wod('w1', 'Fran');
    const first = historyRow('i1', 's1', '2026-09-12T06:00:00Z', w);
    const older = historyRow('i2', 's2', '2026-09-01T06:00:00Z', w);
    setup([]);
    prog.wodHistory.and.returnValue(of({ rows: [first], nextBefore: '2026-09-10T00:00:00Z' } as WodHistoryPage));
    switchToHistory();
    fixture.detectChanges();

    const more = el.querySelector<HTMLElement>('[data-testid="hist-more"]')!;
    expect(more).not.toBeNull();

    prog.wodHistory.and.returnValue(of({ rows: [older], nextBefore: null } as WodHistoryPage));
    more.click();
    fixture.detectChanges();

    expect(prog.wodHistory).toHaveBeenCalledWith(undefined, '2026-09-10T00:00:00Z');
    expect(el.querySelectorAll('[data-testid^="hist-card-"]').length).toBe(2);
  });

  it('opens the benchmark sheet on a global card tap, adds it, and navigates', () => {
    const global = entry(wod('b1', 'Murph', 'Run 1 mile'), { global: true, benchmarkKind: 'HERO' });
    setup([global]);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    prog.cloneBenchmark.and.returnValue(of(wod('w9', 'Murph')));

    const card = el.querySelector<HTMLElement>('[data-testid="lib-card-b1"]')!;
    card.click();
    fixture.detectChanges();

    const sheet = el.querySelector<HTMLDialogElement>('dialog[aria-label="Benchmark"]')!;
    expect(sheet.hasAttribute('open')).toBeTrue();

    const addBtn = el.querySelector<HTMLElement>('[data-testid="bench-add"]')!;
    addBtn.click();
    fixture.detectChanges();

    expect(prog.cloneBenchmark).toHaveBeenCalledWith('b1');
    expect(router.navigate).toHaveBeenCalledWith(['/coach/wods', 'w9']);
  });

  it('keeps the sheet open and shows an error when adding a benchmark fails', () => {
    const global = entry(wod('b1', 'Murph', 'Run 1 mile'), { global: true, benchmarkKind: 'HERO' });
    setup([global]);
    prog.cloneBenchmark.and.returnValue(throwError(() => new Error('boom')));

    const card = el.querySelector<HTMLElement>('[data-testid="lib-card-b1"]')!;
    card.click();
    fixture.detectChanges();

    const addBtn = el.querySelector<HTMLElement>('[data-testid="bench-add"]')!;
    addBtn.click();
    fixture.detectChanges();

    const sheet = el.querySelector<HTMLDialogElement>('dialog[aria-label="Benchmark"]')!;
    expect(sheet.hasAttribute('open')).toBeTrue();
    expect(sheet.querySelector('bh-alert')).not.toBeNull();
  });

  it('shows the empty-history state when there are no rows and no query', () => {
    setup([]);
    switchToHistory();
    fixture.detectChanges();

    expect(el.textContent).toContain('No class has run a piece yet');
  });
});

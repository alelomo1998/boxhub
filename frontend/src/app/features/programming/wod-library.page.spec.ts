import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WodLibraryPage } from './wod-library.page';
import { LibraryEntry, LibraryPage, Movement, ProgrammingService, Wod, WodHistoryRow } from './programming.service';

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
function page(rows: LibraryEntry[], nextCursor: string | null = null): LibraryPage {
  return { rows, nextCursor, total: rows.length };
}
function movement(id: string, name: string): Movement {
  return { id, name, category: 'BARBELL', modality: null, global: true, units: ['REPS'], loadable: true };
}

/** A stub IntersectionObserver that hands the test its callback, so the scroll-paging spec can
 *  fire it manually instead of depending on a real layout/viewport. */
class FakeIntersectionObserver {
  static last?: FakeIntersectionObserver;
  constructor(public cb: IntersectionObserverCallback) { FakeIntersectionObserver.last = this; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('WodLibraryPage', () => {
  let fixture: ComponentFixture<WodLibraryPage>;
  let component: WodLibraryPage;
  let el: HTMLElement;
  let prog: jasmine.SpyObj<ProgrammingService>;
  let router: Router;

  function setup(entries: LibraryEntry[] = [], nextCursor: string | null = null) {
    TestBed.resetTestingModule();

    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['libraryPage', 'wodHistory', 'cloneBenchmark', 'movements', 'weightUnit']);
    prog.libraryPage.and.returnValue(of(page(entries, nextCursor)));
    prog.wodHistory.and.returnValue(of([] as WodHistoryRow[]));
    prog.weightUnit.and.returnValue(of('LB'));
    prog.movements.and.returnValue(of([] as Movement[]));

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
    const radios = el.querySelectorAll<HTMLButtonElement>('bh-segmented [role="radio"]');
    radios[1].click();
    fixture.detectChanges();
  }

  it('renders one card per library-page row; a global entry is a button, a saved one a link', () => {
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

  it('the Library|History control is full-width (D15 stretch)', () => {
    setup();
    expect(el.querySelector('bh-segmented.stretch')).not.toBeNull();
  });

  it('the New piece "+" is the one volt link, to /coach/wods/new, with an accessible name', () => {
    setup();
    const btn = el.querySelector<HTMLAnchorElement>('[data-testid="lib-new"]')!;
    expect(btn.tagName).toBe('A');
    expect(btn.getAttribute('href')).toContain('/coach/wods/new');
    expect(btn.getAttribute('aria-label')).toBe('New piece');
  });

  it('ignores a 1-2 char search term (no request) and sends q at 3+ chars', fakeAsync(() => {
    setup();
    prog.libraryPage.calls.reset();
    const input: HTMLInputElement = el.querySelector('[data-testid="lib-search"]')!;

    input.value = 'fr';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();
    expect(prog.libraryPage).not.toHaveBeenCalled();

    input.value = 'fra';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();
    expect(prog.libraryPage).toHaveBeenCalledTimes(1);
    expect(prog.libraryPage.calls.mostRecent().args[0].q).toBe('fra');
  }));

  it('an emptied search field reloads the unfiltered list', fakeAsync(() => {
    setup();
    const input: HTMLInputElement = el.querySelector('[data-testid="lib-search"]')!;
    input.value = 'fra';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();
    prog.libraryPage.calls.reset();

    input.value = '';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();
    expect(prog.libraryPage).toHaveBeenCalledTimes(1);
    expect(prog.libraryPage.calls.mostRecent().args[0].q).toBeUndefined();
  }));

  it('the Benchmarks chip sends benchmarks=true', () => {
    setup();
    prog.libraryPage.calls.reset();
    const chip = el.querySelector<HTMLElement>('[data-testid="lib-benchmarks-chip"]')!;
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    chip.click();
    fixture.detectChanges();

    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(prog.libraryPage.calls.mostRecent().args[0].benchmarks).toBeTrue();
  });

  it('Apply on the Category facet refetches with the facet and resets rows', () => {
    setup([entry(wod('w1', 'Fran'))]);
    prog.libraryPage.and.returnValue(of(page([entry(wod('w2', 'Diane'))])));

    el.querySelector<HTMLElement>('[data-testid="lib-filter"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-category"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-opt-category-STRENGTH"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-apply"]')!.click();
    fixture.detectChanges();

    const call = prog.libraryPage.calls.mostRecent().args[0];
    expect(call.macro).toBe('STRENGTH');
    expect(el.querySelector('[data-testid="lib-card-w2"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="lib-card-w1"]')).toBeNull();
  });

  it('the Movement facet picks several in one visit, and Apply sends their ids', fakeAsync(() => {
    setup();
    prog.movements.and.returnValue(of([movement('m1', 'Thruster'), movement('m2', 'Dumbbell Thruster')]));
    prog.libraryPage.and.returnValue(of(page([entry(wod('w9', 'Fran'))])));

    el.querySelector<HTMLElement>('[data-testid="lib-filter"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!.click();
    fixture.detectChanges();

    const search: HTMLInputElement = el.querySelector('[data-testid="filter-movement-search"]')!;
    search.value = 'thr';
    search.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-movement-m1"]')!.click();
    fixture.detectChanges();
    // User-ruled 2026-09-14 (second review): a movement pick stays on the step, results and all.
    el.querySelector<HTMLElement>('[data-testid="filter-movement-m2"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-step-back"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-apply"]')!.click();
    fixture.detectChanges();

    const call = prog.libraryPage.calls.mostRecent().args[0];
    expect(call.movement).toEqual(['m1', 'm2']);
  }));

  // R6b finding 1: the summary must read the sheet's DRAFT, not the still-unapplied `filters()`.
  it('the filter menu shows the draft movement summary immediately after a pick, before Apply', fakeAsync(() => {
    setup();
    prog.movements.and.returnValue(of([movement('m1', 'Thruster')]));

    el.querySelector<HTMLElement>('[data-testid="lib-filter"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!.click();
    fixture.detectChanges();

    const search: HTMLInputElement = el.querySelector('[data-testid="filter-movement-search"]')!;
    search.value = 'thr';
    search.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-movement-m1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-step-back"]')!.click();
    fixture.detectChanges();

    const row = el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!;
    expect(row.textContent).toContain('Thruster');
  }));

  // R6b finding 2: re-entering Movement must not show the previous search, and with no term typed
  // it lists the current selection (checked) instead so it can be unticked without searching again.
  it('re-entering Movement after a pick clears the old search and lists the current selection', fakeAsync(() => {
    setup();
    prog.movements.and.returnValue(of([movement('m1', 'Thruster')]));

    el.querySelector<HTMLElement>('[data-testid="lib-filter"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!.click();
    fixture.detectChanges();

    const search: HTMLInputElement = el.querySelector('[data-testid="filter-movement-search"]')!;
    search.value = 'thr';
    search.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-movement-m1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-step-back"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!.click();
    fixture.detectChanges();

    const reenteredSearch: HTMLInputElement = el.querySelector('[data-testid="filter-movement-search"]')!;
    expect(reenteredSearch.value).toBe('');
    const selected = el.querySelector<HTMLElement>('[data-testid="filter-movement-m1"]')!;
    expect(selected.textContent).toContain('Thruster');
    expect(selected.classList).toContain('sel');
  }));

  it('the scroll sentinel loads the next page when it becomes visible, appending rows', () => {
    const realIO = (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
    try {
      setup([entry(wod('w1', 'Fran'))], 'cursor1');
      expect(FakeIntersectionObserver.last).toBeDefined();
      prog.libraryPage.and.returnValue(of(page([entry(wod('w2', 'Grace'))])));

      FakeIntersectionObserver.last!.cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        FakeIntersectionObserver.last as unknown as IntersectionObserver);
      fixture.detectChanges();

      expect(prog.libraryPage.calls.mostRecent().args[0].cursor).toBe('cursor1');
      expect(el.querySelectorAll('[data-testid^="lib-card-"]').length).toBe(2);
    } finally {
      (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO;
    }
  });

  it('a failed next page keeps existing rows and shows a retry', () => {
    setup([entry(wod('w1', 'Fran'))], 'cursor1');
    prog.libraryPage.and.returnValue(throwError(() => new Error('boom')));

    component.loadMore();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid^="lib-card-"]').length).toBe(1);
    expect(el.querySelector('[data-testid="lib-more-retry"]')).not.toBeNull();
  });

  it('shows the error alert when libraryPage fails, and retries on click', () => {
    TestBed.resetTestingModule();
    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['libraryPage', 'wodHistory', 'cloneBenchmark', 'movements', 'weightUnit']);
    prog.libraryPage.and.returnValue(throwError(() => new Error('boom')));
    prog.wodHistory.and.returnValue(of([] as WodHistoryRow[]));
    prog.weightUnit.and.returnValue(of('LB'));
    prog.movements.and.returnValue(of([] as Movement[]));
    TestBed.configureTestingModule({
      imports: [WodLibraryPage],
      providers: [provideRouter([]), { provide: ProgrammingService, useValue: prog }],
    });
    fixture = TestBed.createComponent(WodLibraryPage);
    el = fixture.nativeElement;
    fixture.detectChanges();

    expect(el.querySelector('bh-alert')).not.toBeNull();
    expect(prog.libraryPage).toHaveBeenCalledTimes(1);

    prog.libraryPage.and.returnValue(of(page([])));
    el.querySelector<HTMLElement>('[data-testid="lib-retry"]')!.click();
    fixture.detectChanges();

    expect(prog.libraryPage).toHaveBeenCalledTimes(2);
  });

  it('does not load history until the tab switches, then loads once', () => {
    setup([]);
    expect(prog.wodHistory).not.toHaveBeenCalled();

    switchToHistory();
    expect(prog.wodHistory).toHaveBeenCalledTimes(1);
  });

  it('changing the history day reloads that ISO day', () => {
    setup([]);
    switchToHistory();
    prog.wodHistory.calls.reset();

    component.historyOffset.set(-3);
    fixture.detectChanges();

    const d = new Date(); d.setDate(d.getDate() - 3);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(prog.wodHistory).toHaveBeenCalledWith(iso);
  });

  it('a history card links to the class build route', () => {
    const w = wod('w1', 'Fran');
    setup([]);
    prog.wodHistory.and.returnValue(of([historyRow('i1', 's1', new Date().toISOString(), w)]));
    switchToHistory();
    fixture.detectChanges();

    const card = el.querySelector('[data-testid="hist-card-i1"]')!;
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toContain('/coach/classes/s1/build');
  });

  it('shows the day-empty state when history has no rows', () => {
    setup([]);
    switchToHistory();
    expect(el.textContent).toContain('No class ran a piece on this day');
  });

  it('opens the benchmark sheet on a global card tap, adds it, and navigates', () => {
    const global = entry(wod('b1', 'Murph', 'Run 1 mile'), { global: true, benchmarkKind: 'HERO' });
    setup([global]);
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

    el.querySelector<HTMLElement>('[data-testid="lib-card-b1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="bench-add"]')!.click();
    fixture.detectChanges();

    const sheet = el.querySelector<HTMLDialogElement>('dialog[aria-label="Benchmark"]')!;
    expect(sheet.hasAttribute('open')).toBeTrue();
    expect(sheet.querySelector('bh-alert')).not.toBeNull();
  });
});

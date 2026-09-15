import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
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

  // deletedPieceState, when given, stubs Router.getCurrentNavigation() so the constructor reads it
  // as if the coach had just been routed here from a delete -- there is no real in-test navigation
  // to produce one, per provideRouter([]).
  function setup(entries: LibraryEntry[] = [], nextCursor: string | null = null, deletedPieceState?: string) {
    TestBed.resetTestingModule();

    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['libraryPage', 'wodHistory', 'historyDays', 'cloneBenchmark', 'movements', 'weightUnit']);
    prog.libraryPage.and.returnValue(of(page(entries, nextCursor)));
    prog.wodHistory.and.returnValue(of([] as WodHistoryRow[]));
    prog.historyDays.and.returnValue(of([] as string[]));
    prog.weightUnit.and.returnValue(of('LB'));
    prog.movements.and.returnValue(of([] as Movement[]));

    TestBed.configureTestingModule({
      imports: [WodLibraryPage],
      providers: [
        provideRouter([]),
        { provide: ProgrammingService, useValue: prog },
      ],
    });

    router = TestBed.inject(Router);
    if (deletedPieceState !== undefined) {
      spyOn(router, 'getCurrentNavigation').and.returnValue(
        { extras: { state: { deletedPiece: deletedPieceState } } } as unknown as ReturnType<Router['getCurrentNavigation']>);
    }

    fixture = TestBed.createComponent(WodLibraryPage);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
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

  // M14c-b audit P1: movement rows exposed selection only via a bare .sel class.
  it('a movement row exposes aria-pressed, in both the results list and the already-picked list', fakeAsync(() => {
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

    expect(el.querySelector('[data-testid="filter-movement-m1"]')!.getAttribute('aria-pressed')).toBe('false');
    el.querySelector<HTMLElement>('[data-testid="filter-movement-m1"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="filter-movement-m1"]')!.getAttribute('aria-pressed')).toBe('true');

    // Re-enter the step: with the term cleared, the picked-list branch renders instead.
    el.querySelector<HTMLElement>('[data-testid="filter-step-back"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-movement"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="filter-movement-m1"]')!.getAttribute('aria-pressed')).toBe('true');
  }));

  // M14c-b audit P2: the card link's accessible name was the whole card's text run together
  // ("Workout · For timeTimeAnnie…"). It must be named from the title and described by the meta.
  it('a saved card link is named from the title and described by the meta line', () => {
    setup([entry(wod('w1', 'Fran'))]);
    const link = el.querySelector('[data-testid="lib-card-w1"]')!;
    expect(link.getAttribute('aria-labelledby')).toBe('pc-title-w1');
    expect(link.getAttribute('aria-describedby')).toBe('pc-desc-w1');
    expect(el.querySelector('#pc-title-w1')!.textContent!.trim()).toBe('Fran');
  });

  it('a global benchmark button is named/described the same way', () => {
    const global = entry(wod('b1', 'Murph'), { global: true, benchmarkKind: 'HERO' });
    setup([global]);
    const btn = el.querySelector('[data-testid="lib-card-b1"]')!;
    expect(btn.getAttribute('aria-labelledby')).toBe('pc-title-b1');
    expect(btn.getAttribute('aria-describedby')).toBe('pc-desc-b1');
  });

  it('a history card link is named/described from its piece card', () => {
    const w = wod('w1', 'Fran');
    setup([]);
    prog.wodHistory.and.returnValue(of([historyRow('i1', 's1', new Date().toISOString(), w)]));
    switchToHistory();
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="hist-card-i1"]')!;
    expect(card.getAttribute('aria-labelledby')).toBe('pc-title-w1');
    expect(card.getAttribute('aria-describedby')).toBe('pc-desc-w1');
  });

  // M14c-b audit P2: the field stayed capped at ~340px, leaving a gap before filter/+.
  it('the Library search fills its row (stretch)', () => {
    setup();
    const host = el.querySelector('[data-testid="lib-search"]')!.closest('bh-search-bar')!;
    expect(host.classList).toContain('stretch');
  });

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
      ['libraryPage', 'wodHistory', 'historyDays', 'cloneBenchmark', 'movements', 'weightUnit']);
    prog.libraryPage.and.returnValue(throwError(() => new Error('boom')));
    prog.wodHistory.and.returnValue(of([] as WodHistoryRow[]));
    prog.historyDays.and.returnValue(of([] as string[]));
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

  it('the benchmark sheet shows a block label and note, not just its lines (D8)', () => {
    const barbara: Wod = {
      ...wod('b2', 'Barbara'),
      blocks: { blocks: [{
        label: '5 rounds', note: 'Rest 3 min between rounds',
        lines: [{ text: 'Pull-Up', reps: '20' }, { text: 'Push-Up', reps: '30' }],
      }] },
    };
    const global = entry(barbara, { global: true, benchmarkKind: 'GIRL' });
    setup([global]);

    el.querySelector<HTMLElement>('[data-testid="lib-card-b2"]')!.click();
    fixture.detectChanges();

    const sheet = el.querySelector<HTMLDialogElement>('dialog[aria-label="Benchmark"]')!;
    expect(sheet.textContent).toContain('5 rounds');
    expect(sheet.textContent).toContain('Rest 3 min between rounds');
    expect(sheet.textContent).toContain('Pull-Up');
    expect(sheet.textContent).toContain('Benchmark');
    expect(sheet.textContent).toContain('Girl');
  });

  // ---- F1: rows already on screen stay while a refetch is in flight; a slower earlier response
  // must never land after a newer one.
  it('F1: keeps existing rows (dimmed, aria-busy) while a refetch is in flight, instead of the loading line', () => {
    setup([entry(wod('w1', 'Fran'))]);
    const inflight = new Subject<LibraryPage>();
    prog.libraryPage.and.returnValue(inflight.asObservable());

    component.loadLibrary();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="lib-card-w1"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Loading the library');
    const grid = el.querySelector('ul.grid')!;
    expect(grid.getAttribute('aria-busy')).toBe('true');
    expect(grid.classList).toContain('refreshing');

    inflight.next(page([entry(wod('w2', 'Diane'))]));
    inflight.complete();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="lib-card-w2"]')).not.toBeNull();
    expect(grid.getAttribute('aria-busy')).toBe('false');
  });

  it('F1: a slower earlier response never overwrites a newer one', () => {
    setup([]);
    const first = new Subject<LibraryPage>();
    const second = new Subject<LibraryPage>();
    prog.libraryPage.and.returnValues(first.asObservable(), second.asObservable());

    component.loadLibrary();
    component.loadLibrary();

    second.next(page([entry(wod('w2', 'Diane'))]));
    second.complete();
    fixture.detectChanges();

    first.next(page([entry(wod('w1', 'Fran'))])); // arrives late -- must be dropped
    first.complete();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="lib-card-w2"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="lib-card-w1"]')).toBeNull();
  });

  // ---- F2: one removable chip per applied facet value.
  it('F2: a facet chip removes just that value and refetches with the rest', fakeAsync(() => {
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
    el.querySelector<HTMLElement>('[data-testid="filter-movement-m2"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-step-back"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-apply"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="chip-remove-movement-m1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="chip-remove-movement-m2"]')).not.toBeNull();

    el.querySelector<HTMLElement>('[data-testid="chip-remove-movement-m1"]')!.click();
    fixture.detectChanges();
    tick(); // flush the focus-management setTimeout

    expect(prog.libraryPage.calls.mostRecent().args[0].movement).toEqual(['m2']);
    expect(el.querySelector('[data-testid="chip-remove-movement-m1"]')).toBeNull();
    expect(el.querySelector('[data-testid="chip-remove-movement-m2"]')).not.toBeNull();
  }));

  // ---- F3: below the 3-char search floor, the list stays put and says why.
  it('F3: a 1-2 char search shows the short-search hint and leaves the list alone', fakeAsync(() => {
    setup([entry(wod('w1', 'Fran'))]);
    prog.libraryPage.calls.reset();
    const input: HTMLInputElement = el.querySelector('[data-testid="lib-search"]')!;

    input.value = 'fr';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    expect(prog.libraryPage).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Type at least 3 letters to search');
    expect(el.querySelector('[data-testid="lib-card-w1"]')).not.toBeNull();
  }));

  // ---- F4: the no-match empty state's one way out, in both its labelled forms.
  it('F4 (facets active): the no-match button reads "Clear filters", clears them and the search, in one refetch, and refocuses search', fakeAsync(() => {
    setup([entry(wod('w1', 'Fran'))]);

    el.querySelector<HTMLElement>('[data-testid="lib-filter"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-row-category"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-opt-category-STRENGTH"]')!.click();
    fixture.detectChanges();
    prog.libraryPage.and.returnValue(of(page([]))); // no match for that facet
    el.querySelector<HTMLElement>('[data-testid="filter-apply"]')!.click();
    fixture.detectChanges();

    const input: HTMLInputElement = el.querySelector('[data-testid="lib-search"]')!;
    input.value = 'fra';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    const btn = el.querySelector<HTMLElement>('[data-testid="lib-clear-nomatch"]')!;
    expect(btn.textContent).toContain('Clear filters');

    prog.libraryPage.calls.reset();
    prog.libraryPage.and.returnValue(of(page([entry(wod('w1', 'Fran'))])));
    btn.click();
    fixture.detectChanges();
    tick(); // flush the focus-management setTimeout

    expect(component.filters()).toEqual({});
    expect(component.query()).toBe('');
    expect(prog.libraryPage.calls.count()).toBe(1); // one refetch, not one per cleared signal
    expect(prog.libraryPage.calls.mostRecent().args[0].q).toBeUndefined();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('lib-search');
  }));

  it('F4 (search only): the no-match button reads "Clear search" and empties the search field', fakeAsync(() => {
    setup([entry(wod('w1', 'Fran'))]);
    prog.libraryPage.and.returnValue(of(page([])));
    const input: HTMLInputElement = el.querySelector('[data-testid="lib-search"]')!;
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    const btn = el.querySelector<HTMLElement>('[data-testid="lib-clear-nomatch"]')!;
    expect(btn.textContent).toContain('Clear search');

    prog.libraryPage.and.returnValue(of(page([entry(wod('w1', 'Fran'))])));
    btn.click();
    fixture.detectChanges();
    tick();

    expect(component.query()).toBe('');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('lib-search');
  }));

  // ---- F6: a benchmark's eyebrow drops "Workout" -- the timing preset alone.
  it('F6: a benchmark card eyebrow shows the timing preset only, not "Workout · …"', () => {
    const global = entry({ ...wod('b1', 'Murph'), timingPreset: 'FOR_TIME' }, { global: true, benchmarkKind: 'GIRL' });
    setup([global]);
    const card = el.querySelector('[data-testid="lib-card-b1"] bh-piece-card')!;
    expect(card.textContent).toContain('For time');
    expect(card.textContent).not.toContain('Workout');
  });

  it('F6: the benchmark sheet eyebrow also drops "Workout" for a benchmark with a timing preset', () => {
    const global = entry({ ...wod('b1', 'Murph'), timingPreset: 'AMRAP' }, { global: true, benchmarkKind: 'HERO' });
    setup([global]);
    el.querySelector<HTMLElement>('[data-testid="lib-card-b1"]')!.click();
    fixture.detectChanges();
    const sheet = el.querySelector<HTMLDialogElement>('dialog[aria-label="Benchmark"]')!;
    expect(sheet.textContent).toContain('AMRAP');
    expect(sheet.textContent).not.toContain('Workout');
  });

  // ---- Task 6 fix 4: a transient "deleted" notice, read once from the navigation that landed here.
  describe('the deleted-piece notice', () => {
    it('shows "Annie deleted." when the navigation state carries deletedPiece "Annie"', () => {
      setup([], null, 'Annie');
      const alert = el.querySelector('[data-testid="lib-deleted"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('Annie deleted.');
    });

    it('shows "Piece deleted." when the navigation state carries an empty title', () => {
      setup([], null, '');
      const alert = el.querySelector('[data-testid="lib-deleted"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('Piece deleted.');
    });

    it('shows nothing when the route was not reached via a delete', () => {
      setup([]);
      expect(el.querySelector('[data-testid="lib-deleted"]')).toBeNull();
    });
  });
});

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { ClassBuilderPage } from './class-builder.page';
import { BookingService, ClassTemplate, SessionDetail, SessionView } from '../booking/booking.service';
import { LibraryEntry, ProgrammingService, SessionItem, SkeletonPiece, Wod } from '../programming/programming.service';
import { ClassDraftStore, PieceDraft } from '../programming/class-draft.store';

const DETAIL: SessionDetail = {
  id: 'sess1', name: 'CrossFit 60', startAt: '2026-09-12T06:00:00Z', durationMin: 60, capacity: 20,
  imagePath: null, programmingStatus: 'DRAFT', coach: null, active: [], queue: [],
};

const BLANK_WOD: Wod = {
  id: 'w1', title: 'Fran', wodType: 'FOR_TIME',
  macro: 'WORKOUT', timingPreset: 'FOR_TIME', timing: { rounds: 1, segments: [] },
  library: true, teamSize: 1, teamShare: null,
  scoreType: 'TIME', timeCapSeconds: 780,
  bodyText: '21-15-9 Thrusters, Pull-ups', blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
};

function emptyDraft(label: string, macro: string): PieceDraft {
  return { itemId: null, wod: null, fromLibraryWodId: null, fromBenchmarkId: null, label, macro, scoreable: true, scoreType: null };
}
function filledDraft(itemId: string | null, wod: Wod, scoreable = true): PieceDraft {
  return { itemId, wod, fromLibraryWodId: null, fromBenchmarkId: null, label: wod.title, macro: wod.macro, scoreable, scoreType: null };
}
/** Wraps a plain Wod as a non-benchmark, box-owned LibraryEntry -- what `component.library` holds
 *  since Task 7's `wods()` -> `libraryEntries()` swap. A benchmark row (chip: true) gets its own
 *  literal at the point of use. */
function libEntry(wod: Wod): LibraryEntry {
  return { wod, benchmarkKind: null, global: false };
}
function sessionItem(id: string, wod: Wod, scoreable = true): SessionItem {
  return { id, wodId: wod.id, wod, sortOrder: 0, scoreable, scoreType: wod.scoreType, myScoreLogged: false };
}
/** Local time, same as the row's own `date:'HH:mm'` pipe -- avoids hardcoding a UTC hour that a
 *  runner in a non-UTC timezone would render differently. */
function hhmm(iso: string): string { return formatDate(iso, 'HH:mm', 'en-US'); }

function sessionView(id: string, name: string, startAt: string): SessionView {
  return {
    id, name, startAt, durationMin: 60, capacity: 20, coachId: null, coachName: null,
    status: 'SCHEDULED', programmingStatus: 'DRAFT', bookedCount: 0, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: null,
  };
}

describe('ClassBuilderPage', () => {
  let fixture: ComponentFixture<ClassBuilderPage>;
  let component: ClassBuilderPage;
  let el: HTMLElement;
  let booking: jasmine.SpyObj<BookingService>;
  let prog: jasmine.SpyObj<ProgrammingService>;
  let router: Router;
  let store: ClassDraftStore;

  function setup(routeParams: Record<string, string> = { id: 'sess1' }) {
    TestBed.resetTestingModule();

    booking = jasmine.createSpyObj<BookingService>('BookingService', ['sessionDetail', 'listTemplates', 'listSessions']);
    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['sessionItems', 'putItems', 'publishProgramming', 'skeleton', 'libraryEntries', 'weightUnit']);

    booking.sessionDetail.and.returnValue(of(DETAIL));
    booking.listTemplates.and.returnValue(of([] as ClassTemplate[]));
    booking.listSessions.and.returnValue(of([] as SessionView[]));
    prog.sessionItems.and.returnValue(of([] as SessionItem[]));
    prog.putItems.and.returnValue(of([] as SessionItem[]));
    prog.publishProgramming.and.returnValue(of({ programmingStatus: 'PUBLISHED' }));
    prog.skeleton.and.returnValue(of([] as SkeletonPiece[]));
    prog.libraryEntries.and.returnValue(of([] as LibraryEntry[]));
    prog.weightUnit.and.returnValue(of('KG'));

    TestBed.configureTestingModule({
      imports: [ClassBuilderPage],
      providers: [
        provideRouter([]),
        { provide: BookingService, useValue: booking },
        { provide: ProgrammingService, useValue: prog },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeParams) } } },
      ],
    });

    fixture = TestBed.createComponent(ClassBuilderPage);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    router = TestBed.inject(Router);
    store = TestBed.inject(ClassDraftStore);
  }

  it('seeds an empty class from the class-type skeleton, in order, as empty slots', () => {
    setup();
    booking.listTemplates.and.returnValue(of([
      { id: 't1', name: 'CrossFit 60', weekday: 5, startTime: '06:00', durationMin: 60, capacity: 20, coachId: null, active: true },
    ] as ClassTemplate[]));
    prog.skeleton.and.returnValue(of([
      { label: 'Shoulder prep', wodType: 'WARMUP' },
      { label: 'Back squat', wodType: 'STRENGTH' },
    ] as SkeletonPiece[]));
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.drafts()).toEqual([
      { itemId: null, wod: null, fromLibraryWodId: null, fromBenchmarkId: null, label: 'Shoulder prep', macro: 'WARMUP', scoreable: false, scoreType: null },
      { itemId: null, wod: null, fromLibraryWodId: null, fromBenchmarkId: null, label: 'Back squat', macro: 'STRENGTH', scoreable: true, scoreType: null },
    ]);
  });

  it("adopts the store's drafts instead of refetching when the store already holds this session", () => {
    setup();
    store = TestBed.inject(ClassDraftStore);
    const preloaded = [filledDraft('item1', BLANK_WOD)];
    store.open('sess1', preloaded);

    fixture.detectChanges();

    expect(prog.sessionItems).not.toHaveBeenCalled();
    expect(component.drafts()).toBe(store.drafts());
    expect(component.drafts()[0]).toBe(preloaded[0]);
  });

  it('reorders through bh-sortable-list and renders no up/down arrows', () => {
    setup();
    const a = filledDraft('item1', { ...BLANK_WOD, id: 'wa', title: 'Alpha' });
    const b = filledDraft('item2', { ...BLANK_WOD, id: 'wb', title: 'Beta' });
    store.open('sess1', [a, b]);
    fixture.detectChanges();

    expect(el.querySelectorAll('[aria-label="Move up"]').length).toBe(0);
    expect(el.querySelectorAll('[aria-label="Move down"]').length).toBe(0);

    const handles = el.querySelectorAll<HTMLElement>('[data-sortable-handle]');
    expect(handles.length).toBe(2);
    const handle0 = handles[0];
    handle0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    handle0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    handle0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(store.drafts()[0]).toBe(b);
    expect(store.drafts()[1]).toBe(a);
  });

  it('a library pick travels as fromLibraryWodId so the server copies it', () => {
    setup();
    // Macro matches the slot's own ('WORKOUT', from BLANK_WOD): the category filter opens
    // pre-set to the slot's macro, so a mismatched macro would filter the pick out of [rows].
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const picked = { ...BLANK_WOD, id: 'lib-1', title: 'Grace' };
    component.library.set([libEntry(picked)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();
    // Tapping the row only opens the detail step -- nothing is filled yet.
    expect(store.drafts()[0].wod).toBeNull();
    expect(component.slotSheetOpen()).toBe(true);

    el.querySelector<HTMLElement>('[data-testid="slot-detail-select"]')!.click();
    fixture.detectChanges();

    expect(store.drafts()[0].fromLibraryWodId).toBe('lib-1');
    expect(store.drafts()[0].fromBenchmarkId).toBeNull();
    expect(store.drafts()[0].wod).toBe(picked);
    expect(component.slotSheetOpen()).toBe(false);
  });

  it('the slot search lists a global benchmark entry as a pick row carrying a Benchmark chip', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const fran = { ...BLANK_WOD, id: 'fran-1', benchmarkTemplateId: 'fran-1' };
    component.library.set([{ wod: fran, benchmarkKind: 'GIRL', global: true }]);
    fixture.detectChanges();

    const row = component.filteredLibraryRows().find(r => r.id === 'fran-1');
    expect(row?.chip).toContain('Benchmark');
    expect(row?.secondary).toContain('Girl');

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    const chipEl = el.querySelector('[data-testid="pick-row-fran-1"] .chip');
    expect(chipEl?.textContent).toContain('Benchmark');
  });

  it('selecting a global benchmark sends putItems with fromBenchmarkId set and fromLibraryWodId null', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const fran = { ...BLANK_WOD, id: 'fran-1', benchmarkTemplateId: 'fran-1' };
    component.library.set([{ wod: fran, benchmarkKind: 'GIRL', global: true }]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-fran-1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="slot-detail-select"]')!.click();
    fixture.detectChanges();

    expect(store.drafts()[0].fromBenchmarkId).toBe('fran-1');
    expect(store.drafts()[0].fromLibraryWodId).toBeNull();

    prog.sessionItems.and.returnValue(of([sessionItem('item1', fran)]));
    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    expect(prog.putItems).toHaveBeenCalledWith('sess1', [
      { id: null, wodId: null, fromLibraryWodId: null, fromBenchmarkId: 'fran-1', scoreable: true, scoreType: undefined },
    ]);
  });

  it('selecting a saved library entry still sends fromLibraryWodId, with fromBenchmarkId null', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const picked = { ...BLANK_WOD, id: 'lib-1', title: 'Grace' };
    component.library.set([libEntry(picked)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="slot-detail-select"]')!.click();
    fixture.detectChanges();

    prog.sessionItems.and.returnValue(of([sessionItem('item1', picked)]));
    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    expect(prog.putItems).toHaveBeenCalledWith('sess1', [
      { id: null, wodId: null, fromLibraryWodId: 'lib-1', fromBenchmarkId: null, scoreable: true, scoreType: undefined },
    ]);
  });

  describe('editing a piece with a pending pick', () => {
    // The button performs a write the coach never asked for, so it has to say so. Both labels are
    // asserted from the SAME predicate the handler branches on, so they cannot drift apart.
    it('says "Save and edit" only while a pick is still pending', () => {
      setup();
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      store.put(0, { ...store.drafts()[0], fromLibraryWodId: 'lib1' });
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="piece-edit-0"]')!.textContent).toContain('Save and edit');

      store.put(0, { ...store.drafts()[0], fromLibraryWodId: null, fromBenchmarkId: null });
      fixture.detectChanges();
      const label = el.querySelector('[data-testid="piece-edit-0"]')!.textContent!;
      expect(label).toContain('Edit this piece');
      expect(label).not.toContain('Save and edit');
    });

    it('saves first when the draft holds a pending library pick, then navigates', () => {
      setup();
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      store.put(0, { ...store.drafts()[0], fromLibraryWodId: 'lib1' });
      fixture.detectChanges();
      prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));
      const navSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-edit-0"]')!.click();
      fixture.detectChanges();

      expect(prog.putItems).toHaveBeenCalled();
      expect(navSpy).toHaveBeenCalledWith(component.editRoute(0));
    });

    it('navigates without saving when the draft has no pending source', () => {
      setup();
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();
      const navSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-edit-0"]')!.click();
      fixture.detectChanges();

      expect(prog.putItems).not.toHaveBeenCalled();
      expect(navSpy).toHaveBeenCalledWith(component.editRoute(0));
    });

    it('a failed save does not navigate, and formError shows', () => {
      setup();
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      store.put(0, { ...store.drafts()[0], fromLibraryWodId: 'lib1' });
      fixture.detectChanges();
      prog.putItems.and.returnValue(throwError(() => new Error('boom')));
      const navSpy = spyOn(router, 'navigate');

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-edit-0"]')!.click();
      fixture.detectChanges();

      expect(navSpy).not.toHaveBeenCalled();
      expect(el.querySelector('[data-testid="stack-save-error"]')).toBeTruthy();
    });
  });

  it('pressing the category button shows the category step and hides the results list', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    component.library.set([libEntry({ ...BLANK_WOD, id: 'lib-1', title: 'Grace' })]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="pick-row-lib-1"]')).toBeTruthy();

    el.querySelector<HTMLElement>('[data-testid="filter-category"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="slot-category-step"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="pick-row-lib-1"]')).toBeNull();
  });

  it('choosing a category returns to the search step and applies the filter', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-category"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="filter-category-STRENGTH"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="slot-category-step"]')).toBeNull();
    expect(component.categoryFilter()).toBe('STRENGTH');
  });

  it('Back from the category step returns to search with the typed term still in place', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    const input: HTMLInputElement = el.querySelector('[data-testid="pick-search"]')!;
    input.value = 'grace';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-category"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="slot-category-step"]')).toBeTruthy();

    el.querySelector<HTMLElement>('[data-testid="slot-category-back"]')!.click();
    fixture.detectChanges();

    const inputAfter: HTMLInputElement = el.querySelector('[data-testid="pick-search"]')!;
    expect(inputAfter.value).toBe('grace');
  });

  it('the category and type steps\' Back is the same bh-button control as the detail step\'s, not a bare button.backrow', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    component.library.set([libEntry({ ...BLANK_WOD, id: 'lib-1', title: 'Grace' })]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-category"]')!.click();
    fixture.detectChanges();
    const categoryBack = el.querySelector('[data-testid="slot-category-back"]')!;
    expect(categoryBack.closest('bh-button')).toBeTruthy();
    expect(el.querySelector('.backrow')).toBeNull();
    el.querySelector<HTMLElement>('[data-testid="slot-category-back"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="filter-type"]')!.click();
    fixture.detectChanges();
    const typeBack = el.querySelector('[data-testid="slot-type-back"]')!;
    expect(typeBack.closest('bh-button')).toBeTruthy();
    el.querySelector<HTMLElement>('[data-testid="slot-type-back"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();
    const detailBack = el.querySelector('[data-testid="slot-detail-back"]')!;
    expect(detailBack.closest('bh-button')).toBeTruthy();
  });

  it("pressing a result row opens the detail step showing that piece's prescription, and does NOT fill the slot", () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const picked: Wod = {
      ...BLANK_WOD, id: 'lib-1', title: 'Grace', bodyText: '',
      blocks: { blocks: [{ label: '', lines: [{ text: 'Clean and Jerk', reps: '30' }] }] },
    };
    component.library.set([libEntry(picked)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();

    const step = el.querySelector('[data-testid="slot-detail-step"]')!;
    expect(step).toBeTruthy();
    expect(step.textContent).toContain('Grace');
    expect(step.textContent).toContain('Clean and Jerk');
    expect(store.drafts()[0].wod).toBeNull();
  });

  it('Back from the detail step returns to search, slot still empty', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    component.library.set([libEntry({ ...BLANK_WOD, id: 'lib-1', title: 'Grace' })]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="slot-detail-back"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="slot-detail-step"]')).toBeNull();
    expect(el.querySelector('[data-testid="pick-row-lib-1"]')).toBeTruthy();
    expect(store.drafts()[0].wod).toBeNull();
  });

  it('reopening the sheet afterwards starts on the search step, not on detail', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    component.library.set([libEntry({ ...BLANK_WOD, id: 'lib-1', title: 'Grace' })]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();
    expect(component.slotStep()).toBe('detail');

    const dlg: HTMLDialogElement = el.querySelector('dialog')!;
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    expect(component.slotStep()).toBe('search');
    expect(el.querySelector('[data-testid="slot-detail-step"]')).toBeNull();
    expect(el.querySelector('[data-testid="pick-search"]')).toBeTruthy();
  });

  it('a row whose wod has blocks renders its movement text in the result row', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const w: Wod = {
      ...BLANK_WOD, id: 'lib-1', title: 'Fran', bodyText: '',
      blocks: { blocks: [{
        label: '', lines: [{ text: 'Thruster', reps: '21-15-9' }, { text: 'Pull-up', reps: '21-15-9' }],
      }] },
    };
    component.library.set([libEntry(w)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    const detail = el.querySelector('[data-testid="pick-row-lib-1"] .d');
    expect(detail?.textContent).toContain('Thruster');
    expect(detail?.textContent).toContain('Pull-up');
  });

  it('a row with no blocks and no bodyText renders no third line at all', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const w: Wod = { ...BLANK_WOD, id: 'lib-1', title: 'Blank', bodyText: '', blocks: { blocks: [] } };
    component.library.set([libEntry(w)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="pick-row-lib-1"] .d')).toBeNull();
  });

  it('a very long prescription is truncated rather than wrapping', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    const longText = 'Movement number one that has a very long name and keeps going, '.repeat(3).trim();
    const w: Wod = {
      ...BLANK_WOD, id: 'lib-1', title: 'Long', bodyText: '',
      blocks: { blocks: [{ label: '', lines: [{ text: longText }] }] },
    };
    component.library.set([libEntry(w)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    const text = el.querySelector('[data-testid="pick-row-lib-1"] .d')!.textContent!;
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text.endsWith('…')).toBe(true);
  });

  it('the publish button carries the volt (primary) variant and the LIVE pill does not', () => {
    setup();
    booking.sessionDetail.and.returnValue(of({ ...DETAIL, programmingStatus: 'PUBLISHED' }));
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();

    const publishInner = el.querySelector('[data-testid="save-publish"]')!;
    expect(publishInner.classList.contains('primary')).toBe(true);
    expect(publishInner.classList.contains('strong')).toBe(false);

    const pill = el.querySelector('[data-testid="status-live"]')!;
    expect(pill.classList.contains('volt')).toBe(false);
    expect(pill.classList.contains('live')).toBe(true);
  });

  it('Save draft and Save and publish are siblings in one row, not stacked full-width', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();

    const publishHost = el.querySelector('[data-testid="save-publish"]')!.closest('bh-button')!;
    const draftHost = el.querySelector('[data-testid="save-draft"]')!.closest('bh-button')!;
    const row = el.querySelector<HTMLElement>('.saverow')!;
    expect(row.children.length).toBe(2);
    expect(draftHost.parentElement).toBe(row);
    expect(publishHost.parentElement).toBe(row);
    expect(el.querySelector('[data-testid="save-publish"]')!.classList.contains('lg')).toBe(true);
    expect(el.querySelector('[data-testid="save-draft"]')!.classList.contains('lg')).toBe(true);
  });

  it('re-saving an edited class sends the existing item ids', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD, true)]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    expect(prog.putItems).toHaveBeenCalledWith('sess1', [
      { id: 'item1', wodId: 'w1', fromLibraryWodId: null, fromBenchmarkId: null, scoreable: true, scoreType: undefined },
    ]);
  });

  it('an empty slot is not sent in the save payload', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD), emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    const items = prog.putItems.calls.mostRecent().args[1];
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('item1');
  });

  it('tapping a filled row expands it and does NOT navigate; tapping an empty row opens the sheet', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD), emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    const navSpy = spyOn(router, 'navigate');

    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();
    expect(component.expanded()).toBe(0);
    expect(navSpy).not.toHaveBeenCalled();

    el.querySelector<HTMLElement>('[data-testid="slot-open-1"]')!.click();
    fixture.detectChanges();
    expect(component.slotSheetOpen()).toBe(true);
  });

  it('an expanded row exposes no drag handle', () => {
    setup();
    const a = filledDraft('item1', { ...BLANK_WOD, id: 'wa' });
    const b = filledDraft('item2', { ...BLANK_WOD, id: 'wb' });
    store.open('sess1', [a, b]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-sortable-handle]').length).toBe(1);
  });

  describe('two-step remove', () => {
    function expandTwo() {
      setup();
      const a = filledDraft('item1', { ...BLANK_WOD, id: 'wa' });
      const b = filledDraft('item2', { ...BLANK_WOD, id: 'wb' });
      store.open('sess1', [a, b]);
      fixture.detectChanges();
    }

    it('pressing Remove on an expanded row does NOT remove it, and reveals Cancel and Remove', () => {
      expandTwo();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="piece-remove-0"]')!.click();
      fixture.detectChanges();

      expect(store.drafts().length).toBe(2);
      expect(el.querySelector('[data-testid="piece-remove-0"]')).toBeNull();
      expect(el.querySelector('[data-testid="piece-remove-cancel-0"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="piece-remove-confirm-0"]')).toBeTruthy();
    });

    it('pressing Cancel restores the opener and keeps the piece', () => {
      expandTwo();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-remove-0"]')!.click();
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="piece-remove-cancel-0"]')!.click();
      fixture.detectChanges();

      expect(store.drafts().length).toBe(2);
      expect(el.querySelector('[data-testid="piece-remove-0"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="piece-remove-cancel-0"]')).toBeNull();
    });

    it('pressing the confirm Remove deletes the piece', () => {
      expandTwo();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-remove-0"]')!.click();
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="piece-remove-confirm-0"]')!.click();
      fixture.detectChanges();

      expect(store.drafts().length).toBe(1);
      expect(store.drafts()[0].wod!.id).toBe('wb');
    });

    it('collapsing the row while it is asking clears the confirmation, so reopening shows the opener again', () => {
      expandTwo();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-remove-0"]')!.click();
      fixture.detectChanges();
      expect(component.confirmRemove()).toBe(0);

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click(); // collapse
      fixture.detectChanges();
      expect(component.confirmRemove()).toBeNull();

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click(); // reopen
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="piece-remove-0"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="piece-remove-confirm-0"]')).toBeNull();
    });

    it('expanding a different row clears a confirmation armed on the first', () => {
      expandTwo();
      el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="piece-remove-0"]')!.click();
      fixture.detectChanges();
      expect(component.confirmRemove()).toBe(0);

      el.querySelector<HTMLElement>('[data-testid="piece-toggle-1"]')!.click();
      fixture.detectChanges();

      expect(component.confirmRemove()).toBeNull();
      expect(component.expanded()).toBe(1);
    });
  });

  it('the copy control follows the save row in DOM order', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();

    const form = el.querySelector('[data-testid="stack-form"]')!;
    const children = Array.from(form.children);
    const footIndex = children.findIndex(c => c.classList.contains('foot'));
    const copyIndex = children.findIndex(c => c.classList.contains('copyaction'));
    expect(footIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeGreaterThan(footIndex);
  });

  it("the category filter opens pre-set to the slot's macro", () => {
    setup();
    store.open('sess1', [emptyDraft('Strength', 'STRENGTH')]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();

    expect(component.categoryFilter()).toBe('STRENGTH');
  });

  it('searching a movement name matches a wod whose title does not contain the term', () => {
    setup();
    store.open('sess1', [emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    const w: Wod = {
      ...BLANK_WOD, id: 'w-random', title: 'Random Piece',
      blocks: { blocks: [{ label: '', lines: [{ text: 'Burpee' }], blocks: [] }] },
    };
    component.library.set([libEntry(w)]);

    component.onLibrarySearch('burpee');
    const ids = component.filteredLibraryRows().map(r => r.id);

    expect(ids).toContain('w-random');
  });

  describe('the fill-slot sheet\'s library fetch', () => {
    it('shows a distinct error state (never "nothing found"), and retry refetches', () => {
      setup();
      prog.libraryEntries.and.returnValue(throwError(() => new Error('boom')));
      store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="slot-library-error"]')).toBeTruthy();
      expect(el.querySelector('bh-empty')).toBeNull();
      expect(el.querySelector('[data-testid="pick-search"]')).toBeNull();

      prog.libraryEntries.and.returnValue(of([libEntry({ ...BLANK_WOD, id: 'lib-1', title: 'Grace' })]));
      el.querySelector<HTMLElement>('[data-testid="slot-library-retry"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="slot-library-error"]')).toBeNull();
      expect(el.querySelector('[data-testid="pick-row-lib-1"]')).toBeTruthy();
    });

    it('shows a loading state, distinct from pick-sheet\'s own empty state', () => {
      setup();
      const pending = new Subject<LibraryEntry[]>();
      prog.libraryEntries.and.returnValue(pending.asObservable());
      store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="slot-library-loading"]')).toBeTruthy();
      expect(el.querySelector('bh-empty')).toBeNull();

      pending.next([]);
      pending.complete();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="slot-library-loading"]')).toBeNull();
      expect(el.querySelector('bh-empty')).toBeTruthy();
    });
  });

  it('loading / error / empty states each render their testid', () => {
    // loading: sessionDetail never resolves
    setup();
    const pending = new Subject<SessionDetail>();
    booking.sessionDetail.and.returnValue(pending.asObservable());
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="stack-loading"]')).toBeTruthy();

    // error: sessionDetail fails
    setup();
    booking.sessionDetail.and.returnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="stack-error"]')).toBeTruthy();

    // empty: ready with zero drafts (no items, no matching template)
    setup();
    fixture.detectChanges();
    expect(component.state()).toBe('ready');
    expect(el.querySelector('[data-testid="stack-empty"]')).toBeTruthy();
  });

  it('a failed save shows a role="alert" and keeps every draft', () => {
    setup();
    const original = [filledDraft('item1', BLANK_WOD)];
    store.open('sess1', original);
    fixture.detectChanges();
    prog.putItems.and.returnValue(throwError(() => new Error('boom')));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    expect(store.drafts()).toEqual(original);
  });

  it('a failed save mounts a danger banner and still renders the inline stack-save-error', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.putItems.and.returnValue(throwError(() => new Error('boom')));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('bh-banner .alert.danger')).toBeTruthy();
    expect(el.querySelector('[data-testid="stack-save-error"]')).toBeTruthy();
  });

  it('the failed-save banner offers Retry, and pressing it calls the save again with the same publish flag', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.putItems.and.returnValue(throwError(() => new Error('boom')));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('bh-banner .alert.danger')).toBeTruthy();

    prog.putItems.and.returnValue(of([] as SessionItem[]));
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));
    el.querySelector<HTMLElement>('bh-banner button')!.click();
    fixture.detectChanges();

    expect(prog.publishProgramming).toHaveBeenCalledWith('sess1', 'PUBLISHED');
    expect(el.querySelector('[data-testid="status-live"]')).toBeTruthy();
  });

  it('a successful draft save mounts a good banner, and the old "Saved" paragraph is gone', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-draft"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="stack-saved-ok"]')).toBeNull();
    expect(el.querySelector('bh-banner .alert.good')).toBeTruthy();
    expect(el.querySelector('bh-banner')!.textContent).toContain('Saved');
  });

  it('a successful publish mounts a good banner whose message differs from the draft one', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();

    const text = el.querySelector('bh-banner')!.textContent!;
    expect(text).toContain('Class published');
    expect(text).not.toContain('Saved');
  });

  it('a second banner replaces the first rather than stacking two', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.putItems.and.returnValue(throwError(() => new Error('boom')));

    el.querySelector<HTMLElement>('[data-testid="save-publish"]')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('bh-banner').length).toBe(1);
    expect(el.querySelector('bh-banner .alert.danger')).toBeTruthy();

    prog.putItems.and.returnValue(of([] as SessionItem[]));
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));
    el.querySelector<HTMLElement>('[data-testid="save-draft"]')!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('bh-banner').length).toBe(1);
    expect(el.querySelector('bh-banner .alert.good')).toBeTruthy();
  });

  it('(dismissed) clears the banner, so it unmounts', fakeAsync(() => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-draft"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('bh-banner')).toBeTruthy();

    tick(3200);
    fixture.detectChanges();

    expect(el.querySelector('bh-banner')).toBeNull();
  }));

  it('unsaved work is behind the guard', () => {
    setup();
    store.open('sess1', [emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();

    expect(component.hasUnsaved()).toBe(false);
    component.appendSlot('STRENGTH');
    expect(component.hasUnsaved()).toBe(true);
  });

  it('hasUnsaved is true when the store holds drafts that differ from its baseline (returning from the piece editor)', () => {
    setup();
    store.open('sess1', [emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    expect(component.hasUnsaved()).toBe(false);

    // Mirrors the piece editor's write-back: the store's drafts change but its baseline does not.
    store.put(0, filledDraft('item1', BLANK_WOD));

    expect(component.hasUnsaved()).toBe(true);
  });

  it('the guard is suppressed for the "Write a new piece" hop, and restored if the navigation is cancelled', async () => {
    setup();
    store.open('sess1', [emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    component.appendSlot('STRENGTH');
    fixture.detectChanges();
    expect(component.hasUnsaved()).toBe(true);

    let resolveNav!: (ok: boolean) => void;
    const navSpy = spyOn(router, 'navigate')
      .and.returnValue(new Promise<boolean>(res => { resolveNav = res; }));

    el.querySelector<HTMLElement>('[data-testid="slot-open-1"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="slot-write-new"]')!.click();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalled();
    expect(component.hasUnsaved()).toBe(false);

    resolveNav(false);
    await fixture.whenStable();

    expect(component.hasUnsaved()).toBe(true);
  });

  it('pressing "Edit this piece" suppresses the guard for that hop', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();
    // Mirrors the piece editor's write-back so the draft diverges from the baseline.
    store.put(0, filledDraft('item1', { ...BLANK_WOD, title: 'Edited' }));
    fixture.detectChanges();
    expect(component.hasUnsaved()).toBe(true);

    const navSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="piece-edit-0"]')!.click();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalled();
    expect(component.hasUnsaved()).toBe(false);
  });

  it('an empty slot survives a save alongside a filled one, at its own index', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD), emptyDraft('Warmup', 'WARMUP')]);
    fixture.detectChanges();
    prog.sessionItems.and.returnValue(of([sessionItem('item1', BLANK_WOD)]));

    el.querySelector<HTMLElement>('[data-testid="save-draft"]')!.click();
    fixture.detectChanges();

    expect(store.drafts().length).toBe(2);
    expect(component.isEmpty(store.drafts()[1])).toBe(true);
    expect(store.drafts()[1].label).toBe('Warmup');
  });

  it('an expanded row with blocks renders its movement text, not the legacy bodyText', () => {
    setup();
    const wod: Wod = {
      ...BLANK_WOD, id: 'wb1', title: 'Blocked', bodyText: '',
      blocks: { blocks: [{ label: 'Round 1', lines: [{ text: 'Burpees', reps: '10', load: '20', unit: 'kg' }] }] },
    };
    store.open('sess1', [filledDraft('item1', wod)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();

    const expanded = el.querySelector('[data-testid="piece-expanded-0"]')!;
    expect(expanded.textContent).toContain('Round 1');
    expect(expanded.textContent).toContain('Burpees');
    expect(expanded.textContent).toContain('10');
    expect(expanded.textContent).toContain('20 kg');
  });

  it('a legacy piece with only bodyText still renders it in the expanded body', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();

    const expanded = el.querySelector('[data-testid="piece-expanded-0"]')!;
    expect(expanded.textContent).toContain('21-15-9 Thrusters, Pull-ups');
  });

  it('a two-level piece renders the sub-block lines too', () => {
    setup();
    const wod: Wod = {
      ...BLANK_WOD, id: 'wb2', title: 'Nested',
      blocks: { blocks: [{
        label: 'Superset', lines: [],
        blocks: [{ label: 'A', lines: [{ text: 'Pull-ups', reps: '5' }] }],
      }] },
    };
    store.open('sess1', [filledDraft('item1', wod)]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="piece-toggle-0"]')!.click();
    fixture.detectChanges();

    const expanded = el.querySelector('[data-testid="piece-expanded-0"]')!;
    expect(expanded.textContent).toContain('Superset');
    expect(expanded.textContent).toContain('A');
    expect(expanded.textContent).toContain('Pull-ups');
  });

  it('at 360px the host does not overflow', () => {
    setup();
    store.open('sess1', [filledDraft('item1', {
      ...BLANK_WOD,
      title: 'A very long workout title that keeps going and going and going and going',
    })]);
    fixture.detectChanges();
    (el as HTMLElement).style.width = '360px';
    fixture.detectChanges();

    expect(el.scrollWidth).toBeLessThanOrEqual(360);
  });

  describe('copy to the day\'s other classes', () => {
    it('the button is always shown, disabled with a reason when the day holds no other class of this name', () => {
      setup();
      booking.listSessions.and.returnValue(of([sessionView('sess1', 'CrossFit 60', DETAIL.startAt)]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      const btn = el.querySelector<HTMLButtonElement>('[data-testid="copy-day"]');
      expect(btn).toBeTruthy();
      expect(btn!.disabled).toBe(true);
      expect(el.querySelector('[data-testid="copy-day-reason"]')).toBeTruthy();
    });

    it('disabled with a reason when the class has no saved pieces yet, even with other classes that day', () => {
      setup();
      const other = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([sessionView('sess1', 'CrossFit 60', DETAIL.startAt), other]));
      store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
      fixture.detectChanges();

      const btn = el.querySelector<HTMLButtonElement>('[data-testid="copy-day"]');
      expect(btn).toBeTruthy();
      expect(btn!.disabled).toBe(true);
      expect(el.querySelector('[data-testid="copy-day-reason"]')!.textContent).toContain('Nothing to copy yet');
    });

    it('enabled with no reason line when both conditions are met, and still opens the sheet', () => {
      setup();
      const other = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([sessionView('sess1', 'CrossFit 60', DETAIL.startAt), other]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      const btn = el.querySelector<HTMLButtonElement>('[data-testid="copy-day"]');
      expect(btn!.disabled).toBe(false);
      expect(el.querySelector('[data-testid="copy-day-reason"]')).toBeNull();

      btn!.click();
      fixture.detectChanges();
      expect(component.copyOpen()).toBe(true);
    });

    it('the button is present when it does, and the sheet lists each target with its time and name', () => {
      setup();
      const other = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([sessionView('sess1', 'CrossFit 60', DETAIL.startAt), other]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      const btn = el.querySelector<HTMLElement>('[data-testid="copy-day"]');
      expect(btn).toBeTruthy();
      btn!.click();
      fixture.detectChanges();

      const row = el.querySelector('[data-testid="copy-target-sess2"]')!;
      expect(row.textContent).toContain(hhmm(other.startAt));
      expect(row.textContent).toContain('CrossFit 60');
    });

    it('a target that already has pieces starts unticked and says so; an empty one starts ticked', () => {
      setup();
      const withPieces = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      const empty = sessionView('sess3', 'CrossFit 60', '2026-09-12T19:00:00Z');
      booking.listSessions.and.returnValue(of([withPieces, empty]));
      prog.sessionItems.and.callFake((id: string) =>
        of(id === 'sess2' ? [sessionItem('x', BLANK_WOD)] : []) as ReturnType<typeof prog.sessionItems>);
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();

      const rowWith = el.querySelector('[data-testid="copy-target-sess2"]')!;
      const rowEmpty = el.querySelector('[data-testid="copy-target-sess3"]')!;
      expect(rowWith.getAttribute('aria-checked')).toBe('false');
      expect(rowWith.textContent).toContain('1');
      expect(rowEmpty.getAttribute('aria-checked')).toBe('true');
      expect(rowEmpty.textContent!.toLowerCase()).toContain('empty');
    });

    it('confirming calls putItems once per ticked target, with fromLibraryWodId set and id null on every item, empty slots omitted', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD), emptyDraft('Warmup', 'WARMUP')]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(of([] as SessionItem[]));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      expect(prog.putItems).toHaveBeenCalledTimes(1);
      expect(prog.putItems).toHaveBeenCalledWith('sess2', [
        { id: null, wodId: null, fromLibraryWodId: 'w1', fromBenchmarkId: null, scoreable: true, scoreType: undefined },
      ]);
    });

    it('a successful copy mounts a good banner carrying the count', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(of([] as SessionItem[]));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      // The copy lands in another class the coach cannot see, so the confirmation is the only
      // evidence it happened.
      const banner = el.querySelector('bh-banner .alert.good');
      expect(banner).toBeTruthy();
      expect(banner!.getAttribute('role')).toBe('status');
      expect(banner!.textContent).toContain('1');
    });

    it('a partial copy failure mounts a danger banner and keeps the sheet\'s own error', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(throwError(() => new Error('boom')));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('bh-banner .alert.danger')).toBeTruthy();
      expect(el.querySelector('[data-testid="copy-day-error"]')).toBeTruthy();
    });

    it('an unticked target is not written', () => {
      setup();
      const withPieces = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      const empty = sessionView('sess3', 'CrossFit 60', '2026-09-12T19:00:00Z');
      booking.listSessions.and.returnValue(of([withPieces, empty]));
      prog.sessionItems.and.callFake((id: string) =>
        of(id === 'sess2' ? [sessionItem('x', BLANK_WOD)] : []) as ReturnType<typeof prog.sessionItems>);
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(of([] as SessionItem[]));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      expect(prog.putItems).toHaveBeenCalledTimes(1);
      expect(prog.putItems.calls.mostRecent().args[0]).toBe('sess3');
    });

    it('a published class also calls publishProgramming for each target; a draft does not', () => {
      setup();
      booking.sessionDetail.and.returnValue(of({ ...DETAIL, programmingStatus: 'PUBLISHED' }));
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(of([] as SessionItem[]));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      expect(prog.publishProgramming).toHaveBeenCalledWith('sess2', 'PUBLISHED');
    });

    it('a draft class does not call publishProgramming for its targets', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.returnValue(of([] as SessionItem[]));
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      expect(prog.publishProgramming).not.toHaveBeenCalled();
    });

    it('one target failing leaves an alert naming it, and does not claim success', () => {
      setup();
      const good = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      const bad = sessionView('sess3', 'CrossFit 60', '2026-09-12T19:00:00Z');
      booking.listSessions.and.returnValue(of([good, bad]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      prog.putItems.and.callFake((id: string) =>
        (id === 'sess3' ? throwError(() => new Error('boom')) : of([] as SessionItem[])) as ReturnType<typeof prog.putItems>);
      el.querySelector<HTMLElement>('[data-testid="copy-confirm"]')!.click();
      fixture.detectChanges();

      const alert = el.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert!.textContent).toContain(hhmm(bad.startAt));
      expect(component.copyOpen()).toBe(true);
      expect(el.querySelector('[data-testid="copy-target-sess2"]')).toBeNull();
      expect(el.querySelector('[data-testid="copy-target-sess3"]')).toBeTruthy();
    });

    it('the sheet reopens on the row list, never on a stale tick state', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([sessionItem('x', BLANK_WOD)])); // has pieces -> starts unticked
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="copy-target-sess2"]')!.click();
      fixture.detectChanges();
      expect(component.copyTargets()[0].checked).toBe(true);

      const dlg = Array.from(el.querySelectorAll<HTMLDialogElement>('dialog'))
        .find(d => (d.getAttribute('aria-label') ?? '').includes('Copy'))!;
      dlg.close();
      dlg.dispatchEvent(new Event('close'));
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();

      expect(component.copyTargets()[0].checked).toBe(false);
    });

    it('a failed day-sessions fetch never claims there are no other classes, and its retry refetches', () => {
      setup();
      booking.listSessions.and.returnValue(throwError(() => new Error('boom')));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      const reason = el.querySelector('[data-testid="copy-day-reason"]')!;
      expect(reason.textContent).not.toContain('No other classes');
      const retryBtn = el.querySelector<HTMLButtonElement>('[data-testid="copy-day-retry"]');
      expect(retryBtn).toBeTruthy();

      booking.listSessions.and.returnValue(of([sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z')]));
      retryBtn!.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="copy-day-retry"]')).toBeNull();
      expect(el.querySelector<HTMLButtonElement>('[data-testid="copy-day"]')!.disabled).toBe(false);
    });

    it('the disabled-reason line under the copy button is associated with it via aria-describedby', () => {
      setup();
      booking.listSessions.and.returnValue(of([sessionView('sess1', 'CrossFit 60', DETAIL.startAt)]));
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      const btn = el.querySelector<HTMLButtonElement>('[data-testid="copy-day"]')!;
      const reason = el.querySelector('[data-testid="copy-day-reason"]')!;
      expect(reason.id).toBe('copy-day-reason');
      expect(btn.getAttribute('aria-describedby')).toBe('copy-day-reason');
    });

    it('the confirm button reads an instruction at zero, and the counted wording above zero', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      prog.sessionItems.and.returnValue(of([] as SessionItem[])); // empty -> auto-ticked
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();

      const confirm = el.querySelector<HTMLButtonElement>('[data-testid="copy-confirm"]')!;
      expect(confirm.textContent).toContain('Copy to 1 class');

      el.querySelector<HTMLElement>('[data-testid="copy-target-sess2"]')!.click(); // untick -> zero
      fixture.detectChanges();

      expect(confirm.textContent).toContain('Select a class to copy to');
      expect(confirm.disabled).toBe(true);
    });

    it('the confirm button stays disabled while a target is still resolving, and says so', () => {
      setup();
      const t2 = sessionView('sess2', 'CrossFit 60', '2026-09-12T12:00:00Z');
      booking.listSessions.and.returnValue(of([t2]));
      const pending = new Subject<SessionItem[]>();
      prog.sessionItems.and.returnValue(pending.asObservable());
      store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="copy-day"]')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLElement>('[data-testid="copy-target-sess2"]')!.click(); // tick the resolving row
      fixture.detectChanges();

      const confirm = el.querySelector<HTMLButtonElement>('[data-testid="copy-confirm"]')!;
      expect(confirm.disabled).toBe(true);
      expect(el.querySelector('[data-testid="copy-confirm-checking"]')).toBeTruthy();

      pending.next([]);
      pending.complete();
      fixture.detectChanges();

      expect(confirm.disabled).toBe(false);
      expect(el.querySelector('[data-testid="copy-confirm-checking"]')).toBeNull();
    });
  });
});

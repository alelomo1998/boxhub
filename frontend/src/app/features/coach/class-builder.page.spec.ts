import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { ClassBuilderPage } from './class-builder.page';
import { BookingService, ClassTemplate, SessionDetail, SessionView } from '../booking/booking.service';
import { ProgrammingService, SessionItem, SkeletonPiece, Wod } from '../programming/programming.service';
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
  return { itemId: null, wod: null, fromLibraryWodId: null, label, macro, scoreable: true, scoreType: null };
}
function filledDraft(itemId: string | null, wod: Wod, scoreable = true): PieceDraft {
  return { itemId, wod, fromLibraryWodId: null, label: wod.title, macro: wod.macro, scoreable, scoreType: null };
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
    myBookingStatus: null, myPosition: null,
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
      ['sessionItems', 'putItems', 'publishProgramming', 'skeleton', 'wods']);

    booking.sessionDetail.and.returnValue(of(DETAIL));
    booking.listTemplates.and.returnValue(of([] as ClassTemplate[]));
    booking.listSessions.and.returnValue(of([] as SessionView[]));
    prog.sessionItems.and.returnValue(of([] as SessionItem[]));
    prog.putItems.and.returnValue(of([] as SessionItem[]));
    prog.publishProgramming.and.returnValue(of({ programmingStatus: 'PUBLISHED' }));
    prog.skeleton.and.returnValue(of([] as SkeletonPiece[]));
    prog.wods.and.returnValue(of([] as Wod[]));

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
      { itemId: null, wod: null, fromLibraryWodId: null, label: 'Shoulder prep', macro: 'WARMUP', scoreable: false, scoreType: null },
      { itemId: null, wod: null, fromLibraryWodId: null, label: 'Back squat', macro: 'STRENGTH', scoreable: true, scoreType: null },
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
    component.library.set([picked]);
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
    expect(store.drafts()[0].wod).toBe(picked);
    expect(component.slotSheetOpen()).toBe(false);
  });

  it('pressing the category button shows the category step and hides the results list', () => {
    setup();
    store.open('sess1', [emptyDraft('Workout', 'WORKOUT')]);
    fixture.detectChanges();
    component.library.set([{ ...BLANK_WOD, id: 'lib-1', title: 'Grace' }]);
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
    component.library.set([{ ...BLANK_WOD, id: 'lib-1', title: 'Grace' }]);
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
    component.library.set([picked]);
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
    component.library.set([{ ...BLANK_WOD, id: 'lib-1', title: 'Grace' }]);
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
    component.library.set([{ ...BLANK_WOD, id: 'lib-1', title: 'Grace' }]);
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
    component.library.set([w]);
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
    component.library.set([w]);
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
    component.library.set([w]);
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

  it('Save draft renders full width alongside Save and publish, same footprint', () => {
    setup();
    store.open('sess1', [filledDraft('item1', BLANK_WOD)]);
    fixture.detectChanges();

    const publishHost = el.querySelector('[data-testid="save-publish"]')!.closest('bh-button')!;
    const draftHost = el.querySelector('[data-testid="save-draft"]')!.closest('bh-button')!;
    expect(publishHost.classList.contains('full')).toBe(true);
    expect(draftHost.classList.contains('full')).toBe(true);
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
      { id: 'item1', wodId: 'w1', fromLibraryWodId: null, scoreable: true, scoreType: undefined },
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
    component.library.set([w]);

    component.onLibrarySearch('burpee');
    const ids = component.filteredLibraryRows().map(r => r.id);

    expect(ids).toContain('w-random');
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
        { id: null, wodId: null, fromLibraryWodId: 'w1', scoreable: true, scoreType: undefined },
      ]);
    });

    it('a successful copy confirms how many classes were written', () => {
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
      const ok = el.querySelector('[data-testid="copy-day-ok"]');
      expect(ok).toBeTruthy();
      expect(ok!.getAttribute('role')).toBe('status');
      expect(ok!.textContent).toContain('1');
    });

    it('a partial failure confirms nothing', () => {
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

      expect(el.querySelector('[data-testid="copy-day-ok"]')).toBeNull();
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
  });
});

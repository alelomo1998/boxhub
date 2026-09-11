import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { ClassBuilderPage } from './class-builder.page';
import { BookingService, ClassTemplate, SessionDetail } from '../booking/booking.service';
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

    booking = jasmine.createSpyObj<BookingService>('BookingService', ['sessionDetail', 'listTemplates']);
    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['sessionItems', 'putItems', 'publishProgramming', 'skeleton', 'wods']);

    booking.sessionDetail.and.returnValue(of(DETAIL));
    booking.listTemplates.and.returnValue(of([] as ClassTemplate[]));
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

    el.querySelector<HTMLElement>('[data-testid="slot-open-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-row-lib-1"]')!.click();
    fixture.detectChanges();

    expect(store.drafts()[0].fromLibraryWodId).toBe('lib-1');
    expect(store.drafts()[0].wod).toBe(picked);
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
});

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { PieceEditorPage } from './piece-editor.page';
import { Movement, ProgrammingService, Wod } from './programming.service';
import { ClassDraftStore, PieceDraft } from './class-draft.store';

// A fully-formed Wod so every field a load() can copy from is present; individual specs override
// just the fields they care about via loadWod's partial.
const BLANK_WOD: Wod = {
  id: 'w1', title: '', wodType: 'CUSTOM',
  macro: 'WORKOUT', timingPreset: null, timing: { rounds: 1, segments: [] },
  library: true, teamSize: 1, teamShare: null,
  scoreType: 'TIME', timeCapSeconds: null,
  bodyText: '', blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
};

const ASSAULT_BIKE: Movement = {
  id: 'mv-bike', name: 'Assault Bike', category: 'MONOSTRUCTURAL', modality: null,
  global: true, units: ['CAL', 'M'], loadable: false,
};
const BURPEE: Movement = {
  id: 'mv-burpee', name: 'Burpee', category: 'GYMNASTICS', modality: null,
  global: true, units: ['REPS'], loadable: true,
};

describe('PieceEditorPage', () => {
  let fixture: ComponentFixture<PieceEditorPage>;
  let component: PieceEditorPage;
  let el: HTMLElement;
  let prog: jasmine.SpyObj<ProgrammingService>;
  let saveSpy: jasmine.Spy;

  // routeParams carries an `index` key on the class-build route (piece/:index) and never on
  // either wods/ route, so it is what tells the page whether it is standalone.
  // seedDraft, when given, is written into the class-draft store BEFORE the component is
  // constructed: the page reads its own draft once, in a field initializer, not reactively.
  function createFixture(routeParams: Record<string, string>, seedDraft?: PieceDraft) {
    // The standalone specs re-create the fixture on a different route AFTER beforeEach has already
    // instantiated the module, and configureTestingModule throws once that has happened.
    TestBed.resetTestingModule();

    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['wod', 'createWod', 'patchWod', 'deleteWod', 'movements', 'weightUnit', 'createMovement']);
    prog.wod.and.returnValue(of(BLANK_WOD));
    prog.createWod.and.returnValue(of(BLANK_WOD));
    prog.patchWod.and.returnValue(of(BLANK_WOD));
    prog.deleteWod.and.returnValue(of(undefined));
    prog.movements.and.returnValue(of([]));
    // Unused unless a spec exercises the create step; a safe default so an accidental call doesn't
    // throw "no return value configured" in an unrelated spec.
    prog.createMovement.and.returnValue(of(
      { id: 'mv-default', name: '', category: 'ODD_OBJECT', modality: null, global: false, units: ['REPS'], loadable: false } as Movement));
    // The load field labels itself with the box's unit; without a stub every spec dies on init.
    prog.weightUnit.and.returnValue(of('KG' as const));

    TestBed.configureTestingModule({
      imports: [PieceEditorPage],
      providers: [
        provideRouter([]),
        { provide: ProgrammingService, useValue: prog },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeParams) } } },
      ],
    });

    if (seedDraft) TestBed.inject(ClassDraftStore).open(routeParams['id'], [seedDraft]);

    fixture = TestBed.createComponent(PieceEditorPage);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();

    // A non-blank title so specs that submit() without touching the form first (the ones proving
    // the payload shape, not the guard) exercise the real save path rather than the empty-title
    // guard. The guard spec below overrides this deliberately.
    component.title.set('Default piece');
    saveSpy = prog.createWod;
  }

  // simulates the class-build route: piece/:index carries a session id and an index.
  beforeEach(() => createFixture({ id: 'sess1', index: '0' }));

  // simulates coach/wods/new — no session id, no index.
  const routeWithoutSession = () => createFixture({});

  function loadWod(partial: Partial<Wod>) {
    const wod: Wod = { ...BLANK_WOD, ...partial };
    prog.wod.and.returnValue(of(wod));
    component.load(wod.id);
    fixture.detectChanges();
  }

  it('submits through the native submit event, not the removed forms-directive output', () => {
    // The directive-based submit output requires a forms module import that this rebuilt screen
    // does not carry. That combo shipped broken on login and put the password in the URL: the
    // form must bind (submit) and call preventDefault().
    const form = el.querySelector('form')!;
    expect(form.hasAttribute('novalidate')).toBe(true);
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('guards the save in the handler, not only with a disabled button', () => {
    // Enter submits regardless of any [disabled]; the guard must live in submit().
    component.title.set('');
    component.submit(new Event('submit'));
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('picking a timing preset seeds the segments and keeps the preset name', () => {
    // The default fixture (class-build route) opens with one seeded block, so the seeded WORK
    // segment points at it: a piece should not open already incomplete.
    component.pickPreset('TABATA');
    expect(component.segments()).toEqual([
      { seconds: 20, kind: 'WORK', blockIndex: 0 }, { seconds: 10, kind: 'REST' },
    ]);
    expect(component.rounds()).toBe(8);
    expect(component.timingPreset()).toBe('TABATA');
  });

  it('editing the segments keeps the preset name, because a preset seeds and never constrains', () => {
    component.pickPreset('TABATA');
    component.updateSegment(0, { seconds: 30, kind: 'WORK' });
    expect(component.timingPreset()).toBe('TABATA');
  });

  // Every other spec here calls the handler directly, so all of them passed while the ghost
  // buttons were bound to an output bh-button does not have and no click did anything. Karma
  // cannot see a dead binding unless a spec actually presses the control.
  it('adds a block when the add-block control is actually pressed', () => {
    // Section 3 seeds one block by default so a new piece never opens empty; clear it here so
    // this asserts what the click itself adds, not the seed already present.
    component.blocks.set([]);
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="piece-add-block"]')!.click();
    fixture.detectChanges();
    expect(component.blocks().length).toBe(1);
  });

  it('adds a segment when the add-segment control is actually pressed', () => {
    // Segments only exist for a segmented preset (EMOM/Tabata/Interval): For time and AMRAP get
    // the cap/duration control instead, not a segments section at all.
    component.timingPreset.set('TABATA');
    fixture.detectChanges();
    const before = component.segments().length;
    el.querySelector<HTMLElement>('[data-testid="piece-add-segment"]')!.click();
    fixture.detectChanges();
    expect(component.segments().length).toBe(before + 1);
  });

  it('adds and removes scaling options on a line', () => {
    component.addBlock();
    component.addLine(0);
    component.addScale(0, 0);
    component.addScale(0, 0);
    expect(component.scalesOf(0, 0).length).toBe(2);
    component.removeScale(0, 0, 0);
    expect(component.scalesOf(0, 0).length).toBe(1);
  });

  it('stops offering more scaling options at six', () => {
    component.addBlock();
    component.addLine(0);
    for (let i = 0; i < 6; i++) component.addScale(0, 0);
    expect(component.canAddScale(0, 0)).toBe(false);
  });

  it('a line with no scaling options renders none, because most lines have none', () => {
    component.addBlock();
    component.addLine(0);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="scale-row-"]').length).toBe(0);
  });

  it('offers no way to nest a third level of blocks', () => {
    // The server rejects a third with BLOCK_DEPTH; an affordance that produces a 400 is a defect.
    component.addBlock();              // level 1
    component.addSubBlock(0);          // level 2
    expect(component.canAddSubBlock(0, 0)).toBe(false);
  });

  it('sends macro and timingPreset, never wodType', () => {
    // The whole CIRCUIT/CUSTOM/SKILL fix is the absence of this call.
    component.submit(new Event('submit'));
    expect(saveSpy.calls.mostRecent().args[0].wodType).toBeUndefined();
    expect(saveSpy.calls.mostRecent().args[0].macro).toBe('WORKOUT');
  });

  it('reopens a WORKOUT/GYMNASTIC piece with its macro selected, not blank', () => {
    // The pre-M14a CIRCUIT/CUSTOM/SKILL loss, asserted from the screen's side.
    loadWod({ macro: 'GYMNASTIC', timingPreset: null });
    expect(component.macro()).toBe('GYMNASTIC');
  });

  it('save to library is off by default', () => {
    expect(component.saveToLibrary()).toBe(false);
  });

  it('hides save-to-library in standalone mode, where the piece IS a library row', () => {
    routeWithoutSession();
    expect(component.standalone()).toBe(true);
    expect(el.querySelector('[data-testid="save-to-library"]')).toBeNull();
  });

  it('shows a not-scored / time / rounds+reps / load / completion chip row', () => {
    expect(component.scoreOptions.map(o => o.value))
      .toEqual(['NOT_SCORED', 'TIME', 'ROUNDS_REPS', 'LOAD', 'NONE']);
  });

  it('choosing Not scored sets scoreable false; choosing Completion sets scoreable true with NONE', () => {
    // Two different rows in the data, and they must read differently in the UI: Completion is a
    // result (done or not), Not scored is the absence of one.
    component.pickScore('NOT_SCORED');
    expect(component.scoreable()).toBe(false);

    component.pickScore('NONE');
    expect(component.scoreable()).toBe(true);
    expect(component.scoreType()).toBe('NONE');
  });

  // ---- the editor's score choice must survive the write-back into the class draft -----------

  function seededDraft(scoreable: boolean): PieceDraft {
    return {
      itemId: 'item1', wod: null, fromLibraryWodId: 'lib1', fromBenchmarkId: null, label: 'Warmup', macro: 'WARMUP',
      scoreable, scoreType: null,
    };
  }

  function openScoreSheet(): HTMLElement {
    el.querySelector<HTMLElement>('[data-testid="meta-score"]')!.click();
    fixture.detectChanges();
    return el.querySelector('dialog[aria-label="How it is scored"]')!;
  }

  // Row order follows scoreOptions: 0 Not scored, 1 Time, 2 Rounds+reps, 3 Load, 4 Completion.
  function pickScoreRow(rowIndex: number) {
    openScoreSheet().querySelectorAll<HTMLElement>('.prow')[rowIndex].click();
    fixture.detectChanges();
  }

  it('saving with the editor left at its default (scored) overwrites a stale scoreable:false in the draft', () => {
    createFixture({ id: 'sess1', index: '0' }, seededDraft(false));

    component.submit(new Event('submit'));

    expect(TestBed.inject(ClassDraftStore).at(0)?.scoreable).toBe(true);
  });

  it('choosing Not scored in the score sheet and saving puts scoreable: false back into the draft', () => {
    createFixture({ id: 'sess1', index: '0' }, seededDraft(true));

    pickScoreRow(0); // Not scored
    component.submit(new Event('submit'));

    expect(TestBed.inject(ClassDraftStore).at(0)?.scoreable).toBe(false);
  });

  it('shows the team share control only when the team size is more than one', () => {
    component.teamSize.set(1);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="team-share"]')).toBeNull();

    component.teamSize.set(2);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="team-share"]')).toBeTruthy();
  });

  it('renders loading, error and empty states for the fetch', () => {
    component.state.set('loading');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="piece-loading"]')).toBeTruthy();

    component.state.set('error');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="piece-error"]')).toBeTruthy();

    component.state.set('ready');
    component.blocks.set([]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="piece-empty"]')).toBeTruthy();
  });

  it('keeps input on a failed save and shows an inline error', () => {
    component.title.set('Fran');
    saveSpy.and.returnValue(throwError(() => new Error('boom')));
    component.submit(new Event('submit'));
    fixture.detectChanges();
    expect(component.title()).toBe('Fran');
    expect(el.querySelector('[role="alert"]')!.textContent!.trim()).not.toBe('');
  });

  // Reset EVERY piece of state on load, not just some. In M14b a sheet showed the previous
  // class's name because load() reset state but not detail, and the body looked right.
  it('clears the previous piece before the next one arrives', () => {
    loadWod({ macro: 'WORKOUT', title: 'Fran' });

    // The next fetch never resolves, so if title survived only because the fetch happened to
    // answer fast, this proves it did not: the reset must happen before any response arrives.
    prog.wod.and.returnValue(new Subject<Wod>());
    component.load('another-id');
    expect(component.title()).toBe('');
  });

  // ---- block outline / collapse -------------------------------------------------------------

  it('a new block renders expanded', () => {
    component.blocks.set([]);
    component.collapsed.set([]);
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="piece-add-block"]')!.click();
    fixture.detectChanges();

    expect(component.isCollapsed(0)).toBe(false);
    expect(el.querySelector('[data-testid="block-toggle-0"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[data-testid="block-summary-0"]')).toBeNull();
  });

  it('toggling a block collapses it, aria-expanded follows, and shows the summary', () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Thruster' }, { text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    const toggle = el.querySelector<HTMLElement>('[data-testid="block-toggle-0"]')!;
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const summary = el.querySelector('[data-testid="block-summary-0"]');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toContain('Thruster');
  });

  it('renders a drag handle only when the block is collapsed', () => {
    component.blocks.set([{ label: '', lines: [], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    expect(el.querySelector('[data-sortable-handle]')).toBeNull();

    component.toggleCollapse(0);
    fixture.detectChanges();
    expect(el.querySelector('[data-sortable-handle]')).toBeTruthy();
  });

  it('collapse state follows the block across a reorder, not the index', () => {
    component.blocks.set([
      { label: 'A', lines: [], blocks: [] },
      { label: 'B', lines: [], blocks: [] },
    ]);
    component.collapsed.set([true, false]);

    component.moveBlock({ from: 0, to: 1 });

    expect(component.isCollapsed(0)).toBe(false);
    expect(component.isCollapsed(1)).toBe(true);
  });

  // ---- segments gated on a timing preset; a WORK segment names a block ----------------------

  it('with no timing preset, piece-add-segment is absent from the DOM', () => {
    expect(component.timingPreset()).toBeNull();
    expect(el.querySelector('[data-testid="piece-add-segment"]')).toBeNull();
  });

  // Every bh-sheet's content is always in the DOM (open only toggles the native dialog), so the
  // timing sheet's rows are found by scoping to its dialog, not a global .prow query.
  // Row order follows TIMING_PRESETS: 0 None, 1 For time, 2 AMRAP, 3 EMOM, 4 Tabata, 5 Interval.
  function openTimingSheet(): HTMLElement {
    el.querySelector<HTMLElement>('[data-testid="meta-timing"]')!.click();
    fixture.detectChanges();
    return el.querySelector('dialog[aria-label="How it runs"]')!;
  }

  function pickPresetRow(rowIndex: number) {
    openTimingSheet().querySelectorAll<HTMLElement>('.prow')[rowIndex].click();
    fixture.detectChanges();
  }

  it('after picking a segmented preset, the segments section renders', () => {
    pickPresetRow(4); // Tabata
    expect(el.querySelector('[data-testid="piece-add-segment"]')).toBeTruthy();
  });

  // ---- preset shape: segments vs. cap/duration (user-ruled 2026-09-10) ----------------------

  it('picking For time renders the cap stepper and no segments list', () => {
    pickPresetRow(1); // For time
    expect(el.querySelector('[data-testid="piece-time-cap"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="piece-add-segment"]')).toBeNull();
  });

  it('picking AMRAP renders the duration stepper, seeded to 20', () => {
    pickPresetRow(2); // AMRAP
    const input = el.querySelector<HTMLInputElement>('[data-testid="piece-time-cap"]')!;
    expect(input).toBeTruthy();
    expect(input.value).toBe('20');
  });

  it('picking Tabata renders the segments list and no cap stepper', () => {
    pickPresetRow(4); // Tabata
    expect(el.querySelector('[data-testid="piece-add-segment"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="piece-time-cap"]')).toBeNull();
  });

  it('picking None renders neither the segments list nor the cap stepper', () => {
    pickPresetRow(4); // Tabata, so None is a real transition
    pickPresetRow(0); // None
    expect(el.querySelector('[data-testid="piece-add-segment"]')).toBeNull();
    expect(el.querySelector('[data-testid="piece-time-cap"]')).toBeNull();
  });

  it('switching from Tabata to For time empties segments -- the regression that made the 400 possible', () => {
    pickPresetRow(4); // Tabata
    expect(component.segments().length).toBeGreaterThan(0);
    pickPresetRow(1); // For time
    expect(component.segments()).toEqual([]);
  });

  it('saving a For time piece with a cap of 20 puts timeCapSeconds 1200 on the payload', () => {
    pickPresetRow(1); // For time
    const input = el.querySelector<HTMLInputElement>('[data-testid="piece-time-cap"]')!;
    input.value = '20';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    component.submit(new Event('submit'));
    expect(saveSpy.calls.mostRecent().args[0].timeCapSeconds).toBe(1200);
  });

  it('saving an EMOM puts timeCapSeconds null on the payload', () => {
    pickPresetRow(3); // EMOM
    component.submit(new Event('submit'));
    expect(saveSpy.calls.mostRecent().args[0].timeCapSeconds).toBeNull();
  });

  it('loading a wod with a 900-second cap and For time preset shows 15 in the stepper', () => {
    loadWod({ timingPreset: 'FOR_TIME', timeCapSeconds: 900 });
    expect(el.querySelector<HTMLInputElement>('[data-testid="piece-time-cap"]')!.value).toBe('15');
  });

  it("pressing a segment's picker, then a block row in the sheet, puts that block's index on the segment and the button then reads the block's name", () => {
    component.timingPreset.set('TABATA');
    component.blocks.set([{ label: 'Buy-in', lines: [], blocks: [] }]);
    component.segments.set([{ seconds: 60, kind: 'WORK' }]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="segment-pick-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="seg-pick-block-0"]')!.click();
    fixture.detectChanges();

    expect(component.segments()[0].blockIndex).toBe(0);
    expect(el.querySelector('[data-testid="segment-pick-0"]')!.textContent).toContain('Buy-in');
  });

  it('picking REST clears blockIndex', () => {
    component.timingPreset.set('TABATA');
    component.blocks.set([{ label: 'Buy-in', lines: [], blocks: [] }]);
    component.segments.set([{ seconds: 60, kind: 'WORK', blockIndex: 0 }]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="segment-pick-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="seg-pick-rest"]')!.click();
    fixture.detectChanges();

    expect(component.segments()[0].kind).toBe('REST');
    expect(component.segments()[0].blockIndex).toBeUndefined();
  });

  // ---- copy / paste a block -------------------------------------------------------------------

  it('pressing copy, then paste, adds a block whose lines equal the source, not the same reference', () => {
    component.blocks.set([{ label: 'Buy-in', lines: [{ text: 'Row' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-copy-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="piece-paste-block"]')!.click();
    fixture.detectChanges();

    expect(component.blocks().length).toBe(2);
    expect(component.blocks()[1].lines).toEqual(component.blocks()[0].lines);
    expect(component.blocks()[1]).not.toBe(component.blocks()[0]);
    expect(component.blocks()[1].lines).not.toBe(component.blocks()[0].lines);
  });

  it('collapsed grows with blocks on paste', () => {
    component.blocks.set([{ label: 'Buy-in', lines: [], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-copy-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="piece-paste-block"]')!.click();
    fixture.detectChanges();

    expect(component.collapsed().length).toBe(2);
    expect(component.collapsed()[1]).toBe(false);
  });

  it('the paste button disappears after a single paste -- press copy again to paste the same block twice', () => {
    component.blocks.set([{ label: 'Buy-in', lines: [], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-copy-0"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="piece-paste-block"]')).not.toBeNull();

    el.querySelector<HTMLElement>('[data-testid="piece-paste-block"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="piece-paste-block"]')).toBeNull();
    expect(component.clipboard()).toBeNull();
  });

  // ---- keeping a segment's blockIndex true across block delete and reorder -------------------

  it('removing a block a segment points at clears that reference; removing one below decrements it', () => {
    component.blocks.set([
      { label: 'A', lines: [], blocks: [] },
      { label: 'B', lines: [], blocks: [] },
      { label: 'C', lines: [], blocks: [] },
    ]);
    component.collapsed.set([false, false, false]);
    component.segments.set([
      { seconds: 10, kind: 'WORK', blockIndex: 0 },
      { seconds: 10, kind: 'WORK', blockIndex: 2 },
    ]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();

    expect(component.segments()[0].kind).toBe('WORK');
    expect(component.segments()[0].blockIndex).toBeUndefined();
    expect(component.segments()[1].blockIndex).toBe(1);
  });

  it('reordering blocks moves the segment reference with the block', () => {
    component.blocks.set([
      { label: 'A', lines: [], blocks: [] },
      { label: 'B', lines: [], blocks: [] },
    ]);
    component.collapsed.set([false, false]);
    component.segments.set([{ seconds: 10, kind: 'WORK', blockIndex: 0 }]);

    component.moveBlock({ from: 0, to: 1 });

    // Block A moved from index 0 to index 1; the segment still names A.
    expect(component.segments()[0].blockIndex).toBe(1);
  });

  // ---- reps / load steppers ---------------------------------------------------------------

  it('typing letters into the reps stepper leaves digits only', () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Thruster' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    const input = el.querySelector<HTMLInputElement>('[data-testid="line-reps-0-0"]')!;
    input.value = 'ab12cd';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(input.value).toBe('12');
    expect(component.blocks()[0].lines![0].reps).toBe('12');
  });

  // ---- movement units / loadable (M14c-a follow-on) ----------------------------------------

  function openMovementPick(bi: number, li: number) {
    el.querySelector<HTMLElement>(`[data-testid="line-movement-${bi}-${li}"]`)!.click();
    fixture.detectChanges();
  }

  it('picking a movement with two units sets the line unit to the first and makes the caption a button', () => {
    component.blocks.set([{ label: '', lines: [{ text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    prog.movements.and.returnValue(of([ASSAULT_BIKE]));

    openMovementPick(0, 0);
    el.querySelector<HTMLElement>('[data-testid="pick-row-mv-bike"]')!.click();
    fixture.detectChanges();

    expect(component.blocks()[0].lines![0].unit).toBe('CAL');
    const label = el.querySelector('[data-testid="line-reps-0-0-label"]');
    expect(label).toBeTruthy();
    expect(label!.tagName).toBe('BUTTON');
  });

  it('picking a movement with one unit renders a caption that is not a button', () => {
    component.blocks.set([{ label: '', lines: [{ text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    prog.movements.and.returnValue(of([BURPEE]));

    openMovementPick(0, 0);
    el.querySelector<HTMLElement>('[data-testid="pick-row-mv-burpee"]')!.click();
    fixture.detectChanges();

    expect(component.blocks()[0].lines![0].unit).toBe('REPS');
    expect(el.querySelector('[data-testid="line-reps-0-0-label"]')).toBeNull();
  });

  it("tapping the caption opens a sheet; choosing another unit updates the line and the caption", () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Assault Bike', movementId: 'mv-bike', unit: 'CAL' }], blocks: [] }]);
    component.collapsed.set([false]);
    component.movementsById.set(new Map([[ASSAULT_BIKE.id, ASSAULT_BIKE]]));
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="line-reps-0-0-label"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="unit-pick-M"]')!.click();
    fixture.detectChanges();

    expect(component.blocks()[0].lines![0].unit).toBe('M');
    expect(el.querySelector('[data-testid="line-reps-0-0-label"]')!.textContent).toContain('M');
  });

  it('a non-loadable movement renders no load stepper on the line', () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Assault Bike', movementId: 'mv-bike', unit: 'CAL' }], blocks: [] }]);
    component.collapsed.set([false]);
    component.movementsById.set(new Map([[ASSAULT_BIKE.id, ASSAULT_BIKE]]));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="line-load-0-0"]')).toBeNull();
  });

  it('picking a non-loadable movement over a line that had a load clears the stored load', () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Old', load: '40' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    prog.movements.and.returnValue(of([ASSAULT_BIKE]));

    openMovementPick(0, 0);
    el.querySelector<HTMLElement>('[data-testid="pick-row-mv-bike"]')!.click();
    fixture.detectChanges();

    expect(component.blocks()[0].lines![0].load).toBeUndefined();
  });

  it('opening an existing piece with a load on a non-loadable movement does NOT clear it', () => {
    loadWod({ blocks: { blocks: [{ label: '', lines: [{ text: 'Assault Bike', movementId: 'mv-bike', load: '40', unit: 'CAL' }] }] } });
    expect(component.blocks()[0].lines![0].load).toBe('40');
  });

  it('a free-text movement offers all seven units and keeps its load control', () => {
    component.blocks.set([{ label: '', lines: [{ text: 'Random thing' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="line-load-0-0"]')).toBeTruthy();
    el.querySelector<HTMLElement>('[data-testid="line-reps-0-0-label"]')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="unit-pick-"]').length).toBe(7);
  });

  it('the chosen unit reaches the save payload on the line and on a scale', () => {
    component.blocks.set([{
      label: '', lines: [{ text: 'A', unit: 'CAL', scales: [{ text: 'B', unit: 'M' }] }], blocks: [],
    }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    component.submit(new Event('submit'));
    const sentBlocks = saveSpy.calls.mostRecent().args[0].blocks!.blocks;
    expect(sentBlocks[0].lines![0].unit).toBe('CAL');
    expect(sentBlocks[0].lines![0].scales![0].unit).toBe('M');
  });

  function goToCreateStep(name: string) {
    openMovementPick(0, 0);
    const search = el.querySelector<HTMLInputElement>('[data-testid="pick-search"]')!;
    search.value = name;
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-free-text"]')!.click();
    fixture.detectChanges();
  }

  it('confirming the create step posts { name, units, loadable, category } and lands the result on the line', () => {
    component.blocks.set([{ label: '', lines: [{ text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    const created: Movement = {
      id: 'mv-new', name: 'Wall Walk', category: 'GYMNASTICS', modality: null,
      global: false, units: ['REPS', 'CAL'], loadable: true,
    };
    prog.createMovement.and.returnValue(of(created));

    goToCreateStep('Wall Walk');
    el.querySelector<HTMLElement>('[data-testid="pick-create-unit-CAL"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-confirm"]')!.click();
    fixture.detectChanges();

    expect(prog.createMovement).toHaveBeenCalledWith(
      { name: 'Wall Walk', category: 'ODD_OBJECT', units: ['REPS', 'CAL'], loadable: false });
    expect(component.blocks()[0].lines![0].movementId).toBe('mv-new');
    expect(component.blocks()[0].lines![0].unit).toBe('REPS');
  });

  it('a failed create keeps the coach on step two with the name and choices intact', () => {
    component.blocks.set([{ label: '', lines: [{ text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();
    prog.createMovement.and.returnValue(throwError(() => new Error('boom')));

    goToCreateStep('Wall Walk');
    el.querySelector<HTMLElement>('[data-testid="pick-create-unit-CAL"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-confirm"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="pick-create-step"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="pick-create-error"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="pick-create-unit-CAL"]')!.classList).toContain('sel');
    expect(component.blocks()[0].lines![0].movementId).toBeUndefined();
  });

  // ---- critique fixes: steppers on segment seconds / rounds ----------------------------------

  it('renders segment seconds and rounds as steppers, and no input[type="number"] survives', () => {
    component.timingPreset.set('TABATA');
    component.segments.set([{ seconds: 20, kind: 'WORK' }]);
    fixture.detectChanges();

    expect(el.querySelector('input[type="number"]')).toBeNull();

    const secs = el.querySelector<HTMLInputElement>('[data-testid="segment-secs-0"]');
    expect(secs).toBeTruthy();
    expect(secs!.value).toBe('20');

    const rounds = el.querySelector<HTMLInputElement>('[data-testid="piece-rounds"]');
    expect(rounds).toBeTruthy();
    expect(rounds!.value).toBe(String(component.rounds()));
  });

  it("the seconds stepper's decrease button is disabled at the floor of 1, and a typed 0 clamps to 1", () => {
    component.timingPreset.set('TABATA');
    component.segments.set([{ seconds: 1, kind: 'WORK' }]);
    fixture.detectChanges();

    const dec = el.querySelector<HTMLButtonElement>('[data-testid="segment-secs-0-dec"]');
    expect(dec).toBeTruthy();
    expect(dec!.disabled).toBe(true);

    dec!.click();
    fixture.detectChanges();
    expect(component.segments()[0].seconds).toBe(1);

    component.onSegSecondsChange(0, '0');
    expect(component.segments()[0].seconds).toBe(1);
  });

  // ---- critique fixes: two-step block remove --------------------------------------------------

  it('removing a block with lines arms the confirm pair instead of removing immediately', () => {
    component.blocks.set([{ label: 'Buy-in', lines: [{ text: 'Row' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();

    expect(component.blocks().length).toBe(1);
    expect(el.querySelector('[data-testid="block-remove-confirm-0"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="block-remove-cancel-0"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="block-remove-0"]')).toBeNull();
  });

  it('confirming the armed remove deletes the block; cancelling leaves it and clears the armed state', () => {
    component.blocks.set([{ label: 'Buy-in', lines: [{ text: 'Row' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="block-remove-cancel-0"]')!.click();
    fixture.detectChanges();

    expect(component.blocks().length).toBe(1);
    expect(component.confirmRemove()).toBeNull();
    expect(el.querySelector('[data-testid="block-remove-0"]')).toBeTruthy();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="block-remove-confirm-0"]')!.click();
    fixture.detectChanges();

    expect(component.blocks().length).toBe(0);
  });

  it('removing an empty block still takes one press', () => {
    component.blocks.set([{ label: 'Empty', lines: [], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();

    expect(component.blocks().length).toBe(0);
    expect(component.confirmRemove()).toBeNull();
  });

  it('arming a confirm on one block and pressing remove on another leaves only the second armed', () => {
    component.blocks.set([
      { label: 'A', lines: [{ text: 'Row' }], blocks: [] },
      { label: 'B', lines: [{ text: 'Run' }], blocks: [] },
    ]);
    component.collapsed.set([false, false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-remove-0"]')!.click();
    fixture.detectChanges();
    expect(component.confirmRemove()).toBe(0);

    el.querySelector<HTMLElement>('[data-testid="block-remove-1"]')!.click();
    fixture.detectChanges();

    expect(component.confirmRemove()).toBe(1);
    expect(el.querySelector('[data-testid="block-remove-confirm-0"]')).toBeNull();
    expect(el.querySelector('[data-testid="block-remove-confirm-1"]')).toBeTruthy();
  });

  // ---- critique fixes: saved moment, plural summary -------------------------------------------

  it('a successful save shows the saved state before navigating', fakeAsync(() => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component.submit(new Event('submit'));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="piece-save"]')!.textContent).toContain('Saved');
    expect(navSpy).not.toHaveBeenCalled();

    tick(600);
    expect(navSpy).toHaveBeenCalled();
  }));

  it('a one-line block summary reads "1 line", not "1 lines"', () => {
    component.blocks.set([{ label: '', lines: [{ text: '' }], blocks: [] }]);
    component.collapsed.set([false]);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="block-toggle-0"]')!.click();
    fixture.detectChanges();

    const summary = el.querySelector('[data-testid="block-summary-0"]')!;
    expect(summary.textContent).toContain('1 line');
    expect(summary.textContent).not.toContain('1 lines');
  });

  // ---- Task 6: delete in the piece editor (standalone only) ----------------------------------

  describe('deleting a standalone piece', () => {
    function openStandaloneWithId(id = 'w1') {
      createFixture({ id });
      fixture.detectChanges();
    }

    function openDeleteSheet() {
      el.querySelector<HTMLElement>('[data-testid="piece-delete-open"]')!.click();
      fixture.detectChanges();
    }

    it('coach/wods/new (no id) has no delete opener', () => {
      routeWithoutSession();
      expect(el.querySelector('[data-testid="piece-delete-open"]')).toBeNull();
    });

    it('a class piece route has no delete opener', () => {
      // The default beforeEach fixture is the class-build route (piece/:index).
      expect(component.standalone()).toBe(false);
      expect(el.querySelector('[data-testid="piece-delete-open"]')).toBeNull();
    });

    it('coach/wods/w1 shows the opener; confirming deletes and navigates to the library', () => {
      openStandaloneWithId('w1');
      // createFixture forces title to 'Default piece' for every spec; empty it here to test the
      // untitled-navigation-state case specifically.
      component.title.set('');
      const router = TestBed.inject(Router);
      const navSpy = spyOn(router, 'navigate');

      expect(component.canDelete()).toBe(true);
      openDeleteSheet();
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      expect(prog.deleteWod).toHaveBeenCalledWith('w1');
      expect(navSpy).toHaveBeenCalledWith(['/coach/wods'],
        { replaceUrl: true, state: { deletedPiece: '' } });
    });

    it('carries the trimmed title in the navigation state on success', () => {
      openStandaloneWithId('w1');
      // createFixture forces title to 'Default piece'; overwrite it directly rather than through
      // prog.wod, whose stubbed response that override already clobbers.
      component.title.set('  Annie  ');
      const router = TestBed.inject(Router);
      const navSpy = spyOn(router, 'navigate');

      openDeleteSheet();
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      expect(navSpy).toHaveBeenCalledWith(['/coach/wods'],
        { replaceUrl: true, state: { deletedPiece: 'Annie' } });
    });

    it('the sheet title names the piece when it has one, and falls back when untitled', () => {
      openStandaloneWithId('w1');
      component.title.set('Annie');
      fixture.detectChanges();
      openDeleteSheet();
      let title = el.querySelector('[data-testid="piece-delete-sheet"] .sh-title');
      expect(title!.textContent).toContain('Delete Annie?');

      component.title.set('');
      fixture.detectChanges();
      title = el.querySelector('[data-testid="piece-delete-sheet"] .sh-title');
      expect(title!.textContent).toContain('Delete this piece?');
    });

    it('shows the benchmark reassurance only when the loaded piece carries a benchmarkTemplateId', () => {
      openStandaloneWithId('w1'); // BLANK_WOD: benchmarkTemplateId null
      openDeleteSheet();
      expect(el.querySelector('[data-testid="piece-delete-benchmark"]')).toBeNull();

      prog.wod.and.returnValue(of({ ...BLANK_WOD, id: 'w1', title: 'Annie', benchmarkTemplateId: 'bt1' }));
      component.load('w1');
      fixture.detectChanges();
      const p = el.querySelector('[data-testid="piece-delete-benchmark"]');
      expect(p!.textContent).toContain('Annie');
      expect(p!.textContent).toContain('stays in Benchmarks');

      component.title.set('');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="piece-delete-benchmark"]')!.textContent)
        .toContain('The benchmark stays in Benchmarks');
    });

    it('a 409 reads "used by a class"; any other error reads "did not delete" -- sheet stays open, never navigates', () => {
      openStandaloneWithId('w1');
      const router = TestBed.inject(Router);
      const navSpy = spyOn(router, 'navigate');

      prog.deleteWod.and.returnValue(throwError(() => ({ status: 409 })));
      openDeleteSheet();
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      let err = el.querySelector('[data-testid="piece-delete-error"]');
      expect(err!.textContent).toContain('used by a class');
      expect(component.deleteOpen()).toBe(true);
      expect(navSpy).not.toHaveBeenCalled();

      prog.deleteWod.and.returnValue(throwError(() => ({ status: 500 })));
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      err = el.querySelector('[data-testid="piece-delete-error"]');
      expect(err!.textContent).toContain('did not delete');
      expect(component.deleteOpen()).toBe(true);
      expect(navSpy).not.toHaveBeenCalled();
    });

    it('clicking Keep it closes the sheet and never calls deleteWod', () => {
      openStandaloneWithId('w1');
      openDeleteSheet();

      el.querySelector<HTMLElement>('[data-testid="piece-delete-keep"]')!.click();
      fixture.detectChanges();

      expect(component.deleteOpen()).toBe(false);
      expect(prog.deleteWod).not.toHaveBeenCalled();
    });

    it('Escape during a pending delete closes the dialog but reopens the sheet if the request then fails', () => {
      openStandaloneWithId('w1');
      const pending = new Subject<void>();
      prog.deleteWod.and.returnValue(pending);
      openDeleteSheet();
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      // Escape/backdrop closes the native dialog -- bh-sheet fires (closed) regardless of deleting().
      component.onDeleteSheetClosed();
      fixture.detectChanges();
      expect(component.deleteOpen()).toBe(false);

      pending.error({ status: 500 });
      fixture.detectChanges();

      expect(component.deleteOpen()).toBe(true);
      const err = el.querySelector('[data-testid="piece-delete-error"]');
      expect(err!.textContent).toContain('did not delete');
    });

    it('Keep it while pending does not close the sheet, and the delete stays in flight', () => {
      openStandaloneWithId('w1');
      const pending = new Subject<void>();
      prog.deleteWod.and.returnValue(pending);
      openDeleteSheet();
      el.querySelector<HTMLElement>('[data-testid="piece-delete-confirm"]')!.click();
      fixture.detectChanges();

      el.querySelector<HTMLElement>('[data-testid="piece-delete-keep"]')!.click();
      fixture.detectChanges();

      expect(component.deleteOpen()).toBe(true);
      expect(component.deleting()).toBe(true);
      expect(pending.observed).toBe(true);
    });
  });
});

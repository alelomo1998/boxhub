import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { PieceEditorPage } from './piece-editor.page';
import { ProgrammingService, Wod } from './programming.service';

// A fully-formed Wod so every field a load() can copy from is present; individual specs override
// just the fields they care about via loadWod's partial.
const BLANK_WOD: Wod = {
  id: 'w1', title: '', wodType: 'CUSTOM',
  macro: 'WORKOUT', timingPreset: null, timing: { rounds: 1, segments: [] },
  library: true, teamSize: 1, teamShare: null,
  scoreType: 'TIME', timeCapSeconds: null,
  bodyText: '', blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
};

describe('PieceEditorPage', () => {
  let fixture: ComponentFixture<PieceEditorPage>;
  let component: PieceEditorPage;
  let el: HTMLElement;
  let prog: jasmine.SpyObj<ProgrammingService>;
  let saveSpy: jasmine.Spy;

  // routeParams carries an `index` key on the class-build route (piece/:index) and never on
  // either wods/ route, so it is what tells the page whether it is standalone.
  function createFixture(routeParams: Record<string, string>) {
    // The standalone specs re-create the fixture on a different route AFTER beforeEach has already
    // instantiated the module, and configureTestingModule throws once that has happened.
    TestBed.resetTestingModule();

    prog = jasmine.createSpyObj<ProgrammingService>('ProgrammingService',
      ['wod', 'createWod', 'patchWod', 'movements']);
    prog.wod.and.returnValue(of(BLANK_WOD));
    prog.createWod.and.returnValue(of(BLANK_WOD));
    prog.patchWod.and.returnValue(of(BLANK_WOD));
    prog.movements.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [PieceEditorPage],
      providers: [
        provideRouter([]),
        { provide: ProgrammingService, useValue: prog },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeParams) } } },
      ],
    });

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
    component.pickPreset('TABATA');
    expect(component.segments()).toEqual([
      { seconds: 20, kind: 'WORK' }, { seconds: 10, kind: 'REST' },
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
    el.querySelector<HTMLElement>('[data-testid="piece-add-block"]')!.click();
    fixture.detectChanges();
    expect(component.blocks().length).toBe(1);
  });

  it('adds a segment when the add-segment control is actually pressed', () => {
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
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PickResult, PickRow, PickSheetComponent } from './pick-sheet.component';

// Signal fields, not plain ones: every real caller binds [open] and [rows] from signals, and a
// plain field would never mark this OnPush component dirty. The harness matches the app.
@Component({
  standalone: true,
  imports: [PickSheetComponent],
  template: `<bh-pick-sheet [open]="open()" [rows]="rows()" [allowFreeText]="allowFreeText()"
                            [allowCreate]="allowCreate()" [createPending]="createPending()"
                            [createError]="createError()"
                            title="Pick something"
                            (picked)="picked = $event" (create)="created = $event"
                            (closed)="closedCount = closedCount + 1" />`,
})
class Host {
  open = signal(true);
  rows = signal<PickRow[]>([]);
  allowFreeText = signal(true);
  allowCreate = signal(false);
  createPending = signal(false);
  createError = signal('');
  picked: PickResult | null = null;
  created: { name: string; units: string[]; loadable: boolean; category: string } | null = null;
  closedCount = 0;
}

// The two projection slots: a caller that fills both, and the ordering they must land in.
@Component({
  standalone: true,
  imports: [PickSheetComponent],
  template: `<bh-pick-sheet [open]="open()" [rows]="rows()" title="Pick something">
    <div sheetFilters data-testid="slot-filters">filters</div>
    <div sheetLead data-testid="slot-lead">lead</div>
  </bh-pick-sheet>`,
})
class SlotHost {
  open = signal(true);
  rows = signal<PickRow[]>([{ id: 'm1', primary: 'Thruster' }]);
}

describe('PickSheetComponent projection slots', () => {
  let f: any, el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SlotHost] }).compileComponents();
    f = TestBed.createComponent(SlotHost);
    el = f.nativeElement;
    f.detectChanges();
  });

  afterEach(() => {
    const dlg: HTMLDialogElement | null = el.querySelector('dialog');
    if (dlg?.open) dlg.close();
  });

  it('renders sheetFilters above the results list', () => {
    const filters = el.querySelector('[data-testid="slot-filters"]')!;
    const rowsList = el.querySelector('.rows')!;
    // DOCUMENT_POSITION_FOLLOWING on rowsList means filters comes BEFORE it in document order.
    expect(filters.compareDocumentPosition(rowsList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders sheetLead as the first row inside .rows, above the first pick row', () => {
    const lead = el.querySelector('[data-testid="slot-lead"]')!;
    const rowsList = el.querySelector('.rows')!;
    expect(rowsList.firstElementChild).toBe(lead);
    const firstPickRow = el.querySelector('[data-testid^="pick-row-"]')!;
    expect(lead.compareDocumentPosition(firstPickRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('PickSheetComponent', () => {
  let f: any, host: Host, el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    host = f.componentInstance;
    el = f.nativeElement;
    f.detectChanges();
  });

  afterEach(() => {
    // showModal puts the dialog in the top layer; leaving several open across specs stacks them.
    const dlg: HTMLDialogElement | null = el.querySelector('dialog');
    if (dlg?.open) dlg.close();
  });

  const setRows = (rows: PickRow[]) => { host.rows.set(rows); f.detectChanges(); };
  const setSearch = (term: string) => {
    const input: HTMLInputElement = el.querySelector('[data-testid="pick-search"]')!;
    input.value = term;
    input.dispatchEvent(new Event('input')); // bh-search-bar updates its value model immediately
    f.detectChanges();
  };
  const row = (id: string) => el.querySelector(`[data-testid="pick-row-${id}"]`) as HTMLElement | null;
  const freeRow = () => el.querySelector('[data-testid="pick-free-text"]') as HTMLElement | null;

  it('renders one full-width row per option, with its secondary line', () => {
    setRows([{ id: 'm1', primary: 'Thruster', secondary: 'BARBELL · weightlifting' }]);
    const r = row('m1')!;
    expect(r).not.toBeNull();
    expect(r.textContent).toContain('Thruster');
    expect(r.textContent).toContain('BARBELL');
    expect(el.querySelectorAll('[data-testid^="pick-row-"]').length).toBe(1);
  });

  it('emits the picked id', () => {
    setRows([{ id: 'm1', primary: 'Thruster' }]);
    row('m1')!.click();
    f.detectChanges();
    expect(host.picked).toEqual({ id: 'm1' });
  });

  // A movement that is not in the library must never be a dead end.
  it('offers the typed text as a free-text row and emits it', () => {
    setSearch('kettlebell thing');
    const free = freeRow()!;
    expect(free).not.toBeNull();
    expect(free.textContent).toContain('kettlebell thing');
    free.click();
    f.detectChanges();
    expect(host.picked).toEqual({ freeText: 'kettlebell thing' });
  });

  // An empty free-text row offers nothing, so it only appears once something has been typed,
  // and it always sorts last so the real results are what the thumb reaches first.
  it('shows the free-text row only after typing, and last', () => {
    setRows([{ id: 'm1', primary: 'Thruster' }]);
    expect(freeRow()).toBeNull();
    setSearch('  ');
    expect(freeRow()).toBeNull();
    setSearch('sled drag');
    const buttons = Array.from(el.querySelectorAll('button.row'));
    expect(buttons[buttons.length - 1]).toBe(freeRow()!);
  });

  it('hides the free-text row when allowFreeText is false', () => {
    host.allowFreeText.set(false);
    f.detectChanges();
    setSearch('nothing matches this');
    expect(freeRow()).toBeNull();
  });

  it('shows an empty state when the search matches nothing and free text is off', () => {
    host.allowFreeText.set(false);
    f.detectChanges();
    setRows([]);
    setSearch('zzz');
    expect(el.querySelector('bh-empty')).toBeTruthy();
  });

  it('hides the empty state as soon as there is something to pick', () => {
    setSearch('thrust');
    expect(el.querySelector('bh-empty')).toBeNull(); // the free-text row is something to pick
    setRows([{ id: 'm1', primary: 'Thruster' }]);
    expect(el.querySelector('bh-empty')).toBeNull();
  });

  it('every row meets the tap minimum', () => {
    setRows([{ id: 'm1', primary: 'Thruster' }, { id: 'm2', primary: 'Pull-up' }]);
    setSearch('pull');
    const rows = Array.from(el.querySelectorAll('button.row')) as HTMLElement[];
    expect(rows.length).toBe(3); // two options plus the free-text row
    for (const r of rows) expect(getComputedStyle(r).minHeight).toBe('44px'); // var(--tap)
  });

  it('clears the search when the sheet closes, so a reopened sheet starts clean', () => {
    setSearch('kettlebell thing');
    expect(freeRow()).not.toBeNull();

    const dlg: HTMLDialogElement = el.querySelector('dialog')!;
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    f.detectChanges();

    expect(host.closedCount).toBe(1);
    expect(freeRow()).toBeNull();
  });

  // ---- allowCreate: the free-text row's second step ----------------------------------------

  it('without allowCreate, the free-text row still emits picked directly', () => {
    setSearch('kettlebell thing');
    freeRow()!.click();
    f.detectChanges();
    expect(host.picked).toEqual({ freeText: 'kettlebell thing' });
    expect(el.querySelector('[data-testid="pick-create-step"]')).toBeNull();
  });

  it('with allowCreate, tapping the free-text row opens a create step instead of picking', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('assault bike thing');
    freeRow()!.click();
    f.detectChanges();
    expect(host.picked).toBeNull();
    expect(el.querySelector('[data-testid="pick-create-step"]')).toBeTruthy();
  });

  it('the create step shows the typed name, REPS preselected and No preselected', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="pick-create-step"]')!.textContent).toContain('Wall Walk');
    expect(el.querySelector('[data-testid="pick-create-unit-REPS"]')!.classList).toContain('sel');
    expect(el.querySelector('[data-testid="pick-create-loadable-no"]')!.classList).toContain('sel');
    expect(el.querySelector('[data-testid="pick-create-category-ODD_OBJECT"]')!.classList).toContain('sel');
  });

  it('keeps at least one unit selected -- tapping the only selected unit is a no-op', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-unit-REPS"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="pick-create-unit-REPS"]')!.classList).toContain('sel');
  });

  it('confirming the create step emits create with the chosen units, loadable flag and category', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-unit-CAL"]')!.click();
    el.querySelector<HTMLElement>('[data-testid="pick-create-loadable-yes"]')!.click();
    el.querySelector<HTMLElement>('[data-testid="pick-create-category-BARBELL"]')!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-confirm"]')!.click();
    f.detectChanges();
    expect(host.created).toEqual({ name: 'Wall Walk', units: ['REPS', 'CAL'], loadable: true, category: 'BARBELL' });
  });

  it('defaults the category to ODD_OBJECT when none is chosen', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-confirm"]')!.click();
    f.detectChanges();
    expect(host.created!.category).toBe('ODD_OBJECT');
  });

  it('back returns to the search step', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-back"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="pick-create-step"]')).toBeNull();
    expect(freeRow()).toBeTruthy();
  });

  it('shows a create error passed in and keeps the choices on screen', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="pick-create-unit-CAL"]')!.click();
    f.detectChanges();
    host.createError.set('That did not create.');
    f.detectChanges();
    expect(el.querySelector('[data-testid="pick-create-error"]')!.textContent).toContain('That did not create.');
    expect(el.querySelector('[data-testid="pick-create-unit-CAL"]')!.classList).toContain('sel');
  });

  it('resets to the search step when the sheet closes', () => {
    host.allowCreate.set(true);
    f.detectChanges();
    setSearch('Wall Walk');
    freeRow()!.click();
    f.detectChanges();

    const dlg: HTMLDialogElement = el.querySelector('dialog')!;
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    f.detectChanges();

    expect(el.querySelector('[data-testid="pick-create-step"]')).toBeNull();
  });
});

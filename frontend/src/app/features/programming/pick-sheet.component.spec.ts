import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PickResult, PickRow, PickSheetComponent } from './pick-sheet.component';

// Signal fields, not plain ones: every real caller binds [open] and [rows] from signals, and a
// plain field would never mark this OnPush component dirty. The harness matches the app.
@Component({
  standalone: true,
  imports: [PickSheetComponent],
  template: `<bh-pick-sheet [open]="open()" [rows]="rows()" [allowFreeText]="allowFreeText()"
                            title="Pick something"
                            (picked)="picked = $event" (closed)="closedCount = closedCount + 1" />`,
})
class Host {
  open = signal(true);
  rows = signal<PickRow[]>([]);
  allowFreeText = signal(true);
  picked: PickResult | null = null;
  closedCount = 0;
}

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
});

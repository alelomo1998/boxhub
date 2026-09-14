import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterFacet, FilterSheetComponent, FilterStepDirective, FilterValue } from './filter-sheet.component';

@Component({
  standalone: true,
  imports: [FilterSheetComponent, FilterStepDirective],
  template: `
    <bh-filter-sheet [open]="open()" [facets]="facets" [(value)]="value" [count]="count()"
                      [summaries]="summaries()" (draftChange)="draftChanges.push($event)" (stepChange)="steps.push($event)"
                      (closed)="closedCount = closedCount + 1">
      <ng-template bhFilterStep="movement" let-values let-set="set">
        <button type="button" data-testid="custom-thruster"
                (click)="set(values.includes('thruster') ? [] : ['thruster'])">
          thruster ({{ values.length }})
        </button>
      </ng-template>
    </bh-filter-sheet>
  `,
})
class HostComponent {
  steps: (string | null)[] = [];
  facets: FilterFacet[] = [
    { key: 'category', label: 'Category', mode: 'single', options: [
      { value: 'strength', label: 'Strength' }, { value: 'metcon', label: 'Metcon' },
    ] },
    { key: 'kind', label: 'Benchmark kind', mode: 'multi', options: [
      { value: 'girl', label: 'Girl' }, { value: 'hero', label: 'Hero' },
    ] },
    { key: 'movement', label: 'Movement', mode: 'multi' },
  ];
  open = signal(false);
  value = signal<FilterValue>({});
  count = signal<number | null>(5);
  summaries = signal<Record<string, string>>({});
  draftChanges: FilterValue[] = [];
  closedCount = 0;
}

describe('FilterSheetComponent', () => {
  let f: any;
  let h: HostComponent;

  const menuRow = (key: string): HTMLButtonElement => f.nativeElement.querySelector(`[data-testid="filter-row-${key}"]`);
  const opt = (facet: string, value: string): HTMLButtonElement =>
    f.nativeElement.querySelector(`[data-testid="filter-opt-${facet}-${value}"]`);
  const back = (): HTMLButtonElement => f.nativeElement.querySelector('[data-testid="filter-step-back"]');
  const applyBtn = (): HTMLButtonElement => f.nativeElement.querySelector('[data-testid="filter-apply"]');
  const clearBtn = (): HTMLButtonElement => f.nativeElement.querySelector('[data-testid="filter-clear"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    f = TestBed.createComponent(HostComponent);
    h = f.componentInstance;
    f.detectChanges();
  });

  function openSheet() {
    h.open.set(true);
    f.detectChanges();
  }

  it('draft isolation: closing without Apply discards the draft', () => {
    openSheet();
    menuRow('category').click();
    f.detectChanges();
    opt('category', 'strength').click();
    f.detectChanges();
    expect(menuRow('category').textContent).toContain('Strength');

    // Close via the sheet's own close control, not Apply.
    (f.nativeElement.querySelector('[data-testid="sheet-close"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(h.value()).toEqual({});

    // Reopening starts fresh from the (untouched) applied value.
    h.open.set(false);
    f.detectChanges();
    openSheet();
    expect(menuRow('category').textContent).toContain('Any');
  });

  it('single facet: tapping an option selects it and returns to the menu', () => {
    openSheet();
    menuRow('category').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="filter-step-category"]')).toBeTruthy();

    opt('category', 'strength').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="filter-step-category"]')).toBeFalsy();
    expect(f.nativeElement.querySelector('[data-testid="filter-menu"]')).toBeTruthy();
    expect(menuRow('category').textContent).toContain('Strength');
  });

  // User-ruled 2026-09-14: every option pick returns to the menu, multi included. A multi facet
  // still accumulates -- re-entering it shows what is already ticked and toggles one more.
  it('multi facet: toggling an option returns to the menu and the next visit adds to it', () => {
    openSheet();
    menuRow('kind').click();
    f.detectChanges();
    opt('kind', 'girl').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="filter-step-kind"]')).toBeFalsy();
    expect(f.nativeElement.querySelector('[data-testid="filter-menu"]')).toBeTruthy();

    menuRow('kind').click();
    f.detectChanges();
    expect(opt('kind', 'girl').classList).toContain('sel');
    opt('kind', 'hero').click();
    f.detectChanges();
    expect(menuRow('kind').textContent).toContain('Girl');
    expect(menuRow('kind').textContent).toContain('Hero');
  });

  it('multi facet: the Any row clears the selection and returns to the menu', () => {
    openSheet();
    menuRow('kind').click();
    f.detectChanges();
    opt('kind', 'girl').click();
    f.detectChanges();
    menuRow('kind').click();
    f.detectChanges();
    opt('kind', 'any').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="filter-menu"]')).toBeTruthy();
    expect(menuRow('kind').textContent).toContain('Any');
  });

  it('Clear empties the whole draft from the menu', () => {
    openSheet();
    menuRow('category').click();
    f.detectChanges();
    opt('category', 'strength').click();
    f.detectChanges();
    expect(menuRow('category').textContent).toContain('Strength');

    clearBtn().click();
    f.detectChanges();
    expect(menuRow('category').textContent).toContain('Any');
  });

  it('Apply writes value and emits closed', () => {
    openSheet();
    menuRow('category').click();
    f.detectChanges();
    opt('category', 'metcon').click();
    f.detectChanges();

    applyBtn().click();
    f.detectChanges();
    expect(h.value()).toEqual({ category: ['metcon'] });
    expect(h.closedCount).toBe(1);
  });

  it('Apply is a no-op while count is zero -- guarded in the handler, not [disabled]', () => {
    h.count.set(0);
    openSheet();
    expect(applyBtn().disabled).toBeFalse();
    applyBtn().click();
    f.detectChanges();
    expect(h.value()).toEqual({});
    expect(h.closedCount).toBe(0);
    expect(applyBtn().textContent).toContain('No results');
  });

  // User-ruled 2026-09-14, second review: a custom facet (the movement search) is where several
  // values are picked in one visit, so set() stays on the step.
  it('a custom facet template receives the draft value, can set it, and stays on the step', () => {
    openSheet();
    menuRow('movement').click();
    f.detectChanges();
    const btn: HTMLButtonElement = f.nativeElement.querySelector('[data-testid="custom-thruster"]');
    expect(btn.textContent).toContain('(0)');

    btn.click();
    f.detectChanges();
    expect(h.draftChanges.at(-1)).toEqual({ movement: ['thruster'] });
    expect(f.nativeElement.querySelector('[data-testid="filter-step-movement"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('[data-testid="custom-thruster"]')!.textContent).toContain('(1)');
  });

  it('emits stepChange with the facet key on entry and null back on the menu', () => {
    openSheet();
    menuRow('movement').click();
    f.detectChanges();
    (f.nativeElement.querySelector('[data-testid="filter-step-back"]') as HTMLButtonElement).click();
    f.detectChanges();
    menuRow('category').click();
    f.detectChanges();
    opt('category', 'strength').click();
    f.detectChanges();
    expect(h.steps).toEqual(['movement', null, 'category', null]);
  });

  it('emits draftChange for every draft edit', () => {
    openSheet();
    menuRow('kind').click();
    f.detectChanges();
    opt('kind', 'girl').click();
    f.detectChanges();
    expect(h.draftChanges.length).toBe(1);
    expect(h.draftChanges[0]).toEqual({ kind: ['girl'] });

    menuRow('kind').click(); // a pick returns to the menu, so step back in for the second
    f.detectChanges();
    opt('kind', 'hero').click();
    f.detectChanges();
    expect(h.draftChanges.length).toBe(2);
    expect(h.draftChanges[1]).toEqual({ kind: ['girl', 'hero'] });
  });

  it('moves focus to the step heading on step change', () => {
    openSheet();
    menuRow('category').click();
    f.detectChanges();
    const heading = f.nativeElement.querySelector('.stept');
    expect(document.activeElement).toBe(heading);
  });

  it('returns focus to the originating menu row on Back', (done) => {
    openSheet();
    const row = menuRow('category');
    row.click();
    f.detectChanges();
    back().click();
    f.detectChanges();
    // The return-focus move is deferred a macrotask past the menu's rebuild (see the component's
    // own comment on this effect) -- a synchronous assertion would race it.
    setTimeout(() => {
      expect(document.activeElement).toBe(menuRow('category'));
      done();
    });
  });
});

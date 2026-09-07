import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SortableListComponent } from './sortable-list.component';

@Component({
  standalone: true,
  imports: [SortableListComponent],
  template: `
    <bh-sortable-list [items]="items()" label="Pieces" [itemLabel]="name"
                      (reordered)="onReorder($event)">
      <ng-template let-item>{{ item }}</ng-template>
    </bh-sortable-list>`,
})
class Host {
  items = signal(['a', 'b', 'c']);
  name = (item: string) => item;
  last: { from: number; to: number } | null = null;
  onReorder(e: { from: number; to: number }) { this.last = e; }
}

// A row carrying its own control. THE reason the roles are list/listitem rather than
// listbox/option: an option's children are presentational, so this button would fail axe's
// nested-interactive and no screen reader would reach it.
@Component({
  standalone: true,
  imports: [SortableListComponent],
  template: `
    <bh-sortable-list [items]="items()" label="Pieces">
      <ng-template let-item>
        <span>{{ item }}</span>
        <button type="button" class="edit">Edit {{ item }}</button>
      </ng-template>
    </bh-sortable-list>`,
})
class InteractiveHost {
  items = signal(['a', 'b']);
}

describe('SortableListComponent', () => {
  let f: any, host: Host;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    host = f.componentInstance;
    f.detectChanges();
  });

  const rows = (): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('[data-sortable-row]'));
  const handles = (): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('[data-sortable-handle]'));
  const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('renders one row per item through the projected template', () => {
    expect(rows().length).toBe(3);
    expect(rows()[0].textContent).toContain('a');
  });

  // list/listitem, not listbox/option: this is a list of rows that each do something, not a
  // single-select control, and only the former may contain interactive content.
  it('exposes the list as a list of listitems, each with a named drag handle', () => {
    const list = f.nativeElement.querySelector('[role="list"]');
    expect(list.getAttribute('aria-label')).toBe('Pieces');
    expect(f.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(rows()[0].getAttribute('role')).toBe('listitem');
    expect(rows()[0].getAttribute('tabindex')).toBeNull();
    expect(handles().length).toBe(3);
    // Naming the item, not just "Reorder" three times over.
    expect(handles()[1].getAttribute('aria-label')).toBe('Reorder b');
  });

  // THE GATE THIS COMPONENT EXISTS FOR alongside drag: pointer reorder alone fails WCAG 2.1.1.
  it('reorders with the keyboard: Space to grab, ArrowDown to move, Space to drop', () => {
    const handle = handles()[0];
    key(handle, ' ');
    f.detectChanges();
    expect(handle.getAttribute('aria-grabbed')).toBe('true');

    key(handle, 'ArrowDown');
    key(handle, ' ');
    f.detectChanges();

    expect(host.last).toEqual({ from: 0, to: 1 });
  });

  // Enter is the other grab key: a coach reaching the list by keyboard should not have to know
  // which of the two this particular list chose.
  it('grabs and drops with Enter as well as Space', () => {
    const handle = handles()[0];
    key(handle, 'Enter');
    key(handle, 'ArrowDown');
    key(handle, 'Enter');
    f.detectChanges();
    expect(host.last).toEqual({ from: 0, to: 1 });
  });

  it('Escape cancels a grab and emits nothing', () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowDown');
    key(handle, 'Escape');
    f.detectChanges();

    expect(host.last).toBeNull();
    expect(handles()[0].getAttribute('aria-grabbed')).toBe('false');
  });

  // Cancelling RESTORES the original position — the visible order after Escape must be the order
  // before the grab, or the screen and the emitted (nothing) disagree.
  it('Escape puts the item back where it started', () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowDown');
    f.detectChanges();
    expect(rows()[0].textContent).toContain('b');

    key(handle, 'Escape');
    f.detectChanges();
    expect(rows()[0].textContent).toContain('a');
  });

  it('announces each move in a live region', () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowDown');
    f.detectChanges();
    const live = f.nativeElement.querySelector('[aria-live="polite"]');
    expect(live.textContent.trim()).not.toBe('');
  });

  it('does not emit when the item is dropped where it started', () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, ' ');
    f.detectChanges();
    expect(host.last).toBeNull();
  });

  // The ends of the list are walls, not wrap-arounds: an arrow that wrapped would move an item
  // the full length of the list on one keypress, which is never what was meant.
  it('clamps at the ends instead of wrapping', () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowUp');
    key(handle, ' ');
    f.detectChanges();
    expect(host.last).toBeNull();
  });
});

// The regression that would otherwise return the moment someone "tidies" the roles back to
// listbox/option. Task 11's class stack needs every row tappable, because tapping a piece is how
// its editor opens.
describe('SortableListComponent — a row may carry interactive content', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InteractiveHost] }).compileComponents();
    f = TestBed.createComponent(InteractiveHost);
    f.detectChanges();
  });

  it('projects a button into a row that is focusable and reachable', () => {
    const btn = f.nativeElement.querySelector('button.edit') as HTMLButtonElement;
    expect(btn).toBeTruthy();

    btn.focus();
    expect(document.activeElement).toBe(btn);

    // Reachable, not just focusable: nothing between the button and the list may hide it from the
    // accessibility tree, and its ancestor row must be a listitem — an option's children are
    // presentational and axe's nested-interactive fails on exactly this shape.
    const row = btn.closest('[data-sortable-row]')!;
    expect(row.getAttribute('role')).toBe('listitem');
    expect(btn.closest('[aria-hidden="true"]')).toBeNull();
    expect(btn.closest('[role="presentation"], [role="none"], [role="option"]')).toBeNull();

    // The handle is a separate control, so the row's own button is not the reorder affordance.
    expect(btn.hasAttribute('data-sortable-handle')).toBe(false);
    expect(row.querySelector('[data-sortable-handle]')).toBeTruthy();
  });

  // This host passes no itemLabel, so the handle names the position. Honest, but it says nothing
  // about the item — which is why every real consumer passes one.
  it('names the handle by position when the consumer supplies no itemLabel', () => {
    const handle = f.nativeElement.querySelector('[data-sortable-handle]');
    expect(handle.getAttribute('aria-label')).toBe('Reorder item 1');
  });
});

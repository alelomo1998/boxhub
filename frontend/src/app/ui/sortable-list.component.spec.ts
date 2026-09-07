import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SortableListComponent } from './sortable-list.component';

@Component({
  standalone: true,
  imports: [SortableListComponent],
  template: `
    <bh-sortable-list [items]="items()" label="Pieces" (reordered)="onReorder($event)">
      <ng-template let-item>{{ item }}</ng-template>
    </bh-sortable-list>`,
})
class Host {
  items = signal(['a', 'b', 'c']);
  last: { from: number; to: number } | null = null;
  onReorder(e: { from: number; to: number }) { this.last = e; }
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
  const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('renders one row per item through the projected template', () => {
    expect(rows().length).toBe(3);
    expect(rows()[0].textContent).toContain('a');
  });

  it('exposes the list as a keyboard-operable group', () => {
    const list = f.nativeElement.querySelector('[role="listbox"]');
    expect(list.getAttribute('aria-label')).toBe('Pieces');
    expect(rows()[0].getAttribute('tabindex')).toBe('0');
  });

  // THE GATE THIS COMPONENT EXISTS FOR alongside drag: pointer reorder alone fails WCAG 2.1.1.
  it('reorders with the keyboard: Space to grab, ArrowDown to move, Space to drop', () => {
    const row = rows()[0];
    key(row, ' ');
    f.detectChanges();
    expect(row.getAttribute('aria-grabbed')).toBe('true');

    key(row, 'ArrowDown');
    key(row, ' ');
    f.detectChanges();

    expect(host.last).toEqual({ from: 0, to: 1 });
  });

  // Enter is the other grab key: a coach reaching the list by keyboard should not have to know
  // which of the two this particular list chose.
  it('grabs and drops with Enter as well as Space', () => {
    const row = rows()[0];
    key(row, 'Enter');
    key(row, 'ArrowDown');
    key(row, 'Enter');
    f.detectChanges();
    expect(host.last).toEqual({ from: 0, to: 1 });
  });

  it('Escape cancels a grab and emits nothing', () => {
    const row = rows()[0];
    key(row, ' ');
    key(row, 'ArrowDown');
    key(row, 'Escape');
    f.detectChanges();

    expect(host.last).toBeNull();
    expect(rows()[0].getAttribute('aria-grabbed')).toBe('false');
  });

  // Cancelling RESTORES the original position — the visible order after Escape must be the order
  // before the grab, or the screen and the emitted (nothing) disagree.
  it('Escape puts the item back where it started', () => {
    const row = rows()[0];
    key(row, ' ');
    key(row, 'ArrowDown');
    f.detectChanges();
    expect(rows()[0].textContent).toContain('b');

    key(row, 'Escape');
    f.detectChanges();
    expect(rows()[0].textContent).toContain('a');
  });

  it('announces each move in a live region', () => {
    const row = rows()[0];
    key(row, ' ');
    key(row, 'ArrowDown');
    f.detectChanges();
    const live = f.nativeElement.querySelector('[aria-live="polite"]');
    expect(live.textContent.trim()).not.toBe('');
  });

  it('does not emit when the item is dropped where it started', () => {
    const row = rows()[0];
    key(row, ' ');
    key(row, ' ');
    f.detectChanges();
    expect(host.last).toBeNull();
  });

  // The ends of the list are walls, not wrap-arounds: an arrow that wrapped would move an item
  // the full length of the list on one keypress, which is never what was meant.
  it('clamps at the ends instead of wrapping', () => {
    const row = rows()[0];
    key(row, ' ');
    key(row, 'ArrowUp');
    key(row, ' ');
    f.detectChanges();
    expect(host.last).toBeNull();
  });
});

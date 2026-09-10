import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SortableListComponent } from './sortable-list.component';

@Component({
  standalone: true,
  imports: [SortableListComponent],
  template: `
    <bh-sortable-list [items]="items()" label="Pieces" [itemLabel]="name"
                      [handleAlign]="align()" [canDragItem]="canDragItem()"
                      (reordered)="onReorder($event)">
      <ng-template let-item>{{ item }}</ng-template>
    </bh-sortable-list>`,
})
class Host {
  items = signal(['a', 'b', 'c']);
  name = (item: string) => item;
  align = signal<'center' | 'top'>('center');
  canDragItem = signal<(item: string, index: number) => boolean>(() => true);
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

// Fixed-height rows so the transform-based animation math (step = dragged row's own height, the
// keyboard offset = summed heights of passed rows) is deterministic under headless Karma, which
// has no global stylesheet and so no --tap/--sp-3 tokens to size a row from.
@Component({
  standalone: true,
  imports: [SortableListComponent],
  template: `
    <bh-sortable-list [items]="items()" label="Pieces" (reordered)="onReorder($event)">
      <ng-template let-item>
        <div style="height: 40px; line-height: 40px;">{{ item }}</div>
      </ng-template>
    </bh-sortable-list>`,
})
class SizedHost {
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
  const handles = (): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('[data-sortable-handle]'));
  const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const translateY = (el: HTMLElement): number => {
    const m = el.style.transform.match(/translateY\((-?[\d.]+)px\)/);
    return m ? parseFloat(m[1]) : 0;
  };

  it('renders one row per item through the projected template', () => {
    expect(rows().length).toBe(3);
    expect(rows()[0].textContent).toContain('a');
  });

  // canDragItem gates the handle per row, not the drag logic: a row it rejects renders no
  // handle at all rather than a disabled one.
  it('omits the handle for a row canDragItem rejects', () => {
    expect(handles().length).toBe(3);

    host.canDragItem.set((_item, index) => index !== 0);
    f.detectChanges();

    expect(handles().length).toBe(2);
    expect(rows()[0].querySelector('[data-sortable-handle]')).toBeNull();
  });

  // 'center' is the default and must stay the untouched, pre-existing look; 'top' is the opt-in
  // for a tall multi-line row (a card) whose handle should not float in the vertical middle.
  it('defaults to a centred handle and opts into a top-aligned one via handleAlign', () => {
    expect(rows()[0].classList.contains('align-top')).toBe(false);

    host.align.set('top');
    f.detectChanges();
    expect(rows()[0].classList.contains('align-top')).toBe(true);
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

  // grabbedAt now reads `from`, not `to`: nothing reorders, so the moving item's handle never
  // changes DOM slot and aria-grabbed must stay put on it — never jump to whichever handle
  // occupies the target slot the arrows are aiming at.
  it("keeps aria-grabbed on the moving item's own handle, not the target slot", () => {
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowDown');
    key(handle, 'ArrowDown');
    f.detectChanges();

    expect(handles()[0].getAttribute('aria-grabbed')).toBe('true');
    expect(handles()[2].getAttribute('aria-grabbed')).toBe('false');
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

  // Cancelling RESTORES the original position — the move must be undone, or the screen and the
  // emitted (nothing) disagree. "Undone" used to mean the DOM content re-rendered back into
  // place; nothing reorders now, so it means every row's transform clears instead. Real rects
  // require the fixture in the document, hence the attach/detach.
  it('Escape puts the item back where it started', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = handles()[0];
      key(handle, ' ');
      key(handle, 'ArrowDown');
      f.detectChanges();

      // The move is visible: the grabbed row travelled, the row it passed travelled the
      // opposite way to make room.
      const draggedDy = translateY(rows()[0]);
      const displacedDy = translateY(rows()[1]);
      expect(draggedDy).not.toBe(0);
      expect(Math.sign(displacedDy)).toBe(-Math.sign(draggedDy));

      key(handle, 'Escape');
      f.detectChanges();

      // The move is undone: no row carries a transform. Asserted as the literal cleared value
      // (an empty string), not a parsed 0 — a stray translateY(0px) would pass a numeric check
      // but is not the same thing as no inline transform at all.
      expect(rows()[0].style.transform).toBe('');
      expect(rows()[1].style.transform).toBe('');
    } finally {
      document.body.removeChild(f.nativeElement);
    }
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

  // THE regression this component was fixed for: a press on the handle used to wait out a
  // 400ms long-press timer before a drag would even start. Real rects require the fixture in
  // the document, which is why this pair (and only this pair) attaches/detaches it.
  it('drags immediately on pointerdown at the handle, no long-press wait', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = handles()[0];
      const r0 = rows()[0].getBoundingClientRect();
      const r1 = rows()[1].getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, pointerId: 1, clientY: r0.top + r0.height / 2 }));
      f.detectChanges();
      // Synchronous, not deferred behind a timer: the grab is visible before any tick/wait.
      expect(handle.getAttribute('aria-grabbed')).toBe('true');

      handle.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, pointerId: 1, clientY: r1.top + r1.height / 2 }));
      f.detectChanges();
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();

      expect(host.last).toEqual({ from: 0, to: 1 });
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });

  // The handle is the only unambiguous press target now that a row may hold real inputs — a
  // press anywhere else in the row must not start a drag.
  it('does not start a drag from a pointerdown on the row body', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const body = rows()[0].querySelector('.body') as HTMLElement;
      const r0 = rows()[0].getBoundingClientRect();
      const r1 = rows()[1].getBoundingClientRect();
      body.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, pointerId: 1, clientY: r0.top + r0.height / 2 }));
      body.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, pointerId: 1, clientY: r1.top + r1.height / 2 }));
      body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();

      expect(host.last).toBeNull();
      expect(handles()[0].getAttribute('aria-grabbed')).toBe('false');
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });
});

// The move used to reorder DOM nodes (splice + track $index), so the row that wasn't being
// dragged simply had its content swapped in place — a teleport, not a slide. This block guards
// the fix: every row stays in its home slot and is translated, so a CSS transition can animate it.
describe('SortableListComponent — rows translate instead of reordering', () => {
  let f: any, host: SizedHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SizedHost] }).compileComponents();
    f = TestBed.createComponent(SizedHost);
    host = f.componentInstance;
    f.detectChanges();
  });

  const rows = (): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('[data-sortable-row]'));
  const handles = (): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('[data-sortable-handle]'));
  const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const translateY = (el: HTMLElement): number => {
    const m = el.style.transform.match(/translateY\((-?[\d.]+)px\)/);
    return m ? parseFloat(m[1]) : 0;
  };
  // Real pointer events, real rects: dragging row 0 down past row 1's midpoint. clientY tracks
  // exactly through the gesture (dy = clientY - startY, startY = row 0's own centre), so the
  // dragged row's centre always equals the pointer's clientY.
  const dragRow0PastRow1 = () => {
    const handle = handles()[0];
    const r0 = rows()[0].getBoundingClientRect();
    const r1 = rows()[1].getBoundingClientRect();
    handle.dispatchEvent(new PointerEvent('pointerdown',
      { bubbles: true, pointerId: 1, clientY: r0.top + r0.height / 2 }));
    f.detectChanges();
    handle.dispatchEvent(new PointerEvent('pointermove',
      { bubbles: true, pointerId: 1, clientY: r1.top + r1.height / 2 + 2 }));
    f.detectChanges();
    return handle;
  };

  it('mid-drag, the displaced row carries a non-zero translateY', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = dragRow0PastRow1();
      expect(translateY(rows()[1])).not.toBe(0);
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });

  it("the displaced row's transform is opposite in sign to the dragged row's direction of travel", () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = dragRow0PastRow1();
      const draggedDy = translateY(rows()[0]);
      const displacedDy = translateY(rows()[1]);
      expect(draggedDy).toBeGreaterThan(0);            // dragged down
      expect(Math.sign(displacedDy)).toBe(-Math.sign(draggedDy));
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });

  it('mid-drag, items() is untouched and no reordered has been emitted', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = dragRow0PastRow1();
      expect(host.items()).toEqual(['a', 'b', 'c']);
      expect(host.last).toBeNull();
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });

  it('after drop, every row inline transform is cleared', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = dragRow0PastRow1();
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      f.detectChanges();
      for (const row of rows()) expect(row.style.transform).toBe('');
    } finally {
      document.body.removeChild(f.nativeElement);
    }
  });

  it('keyboard: after two ArrowDowns, focus is still on the moving item\'s handle', () => {
    document.body.appendChild(f.nativeElement);
    try {
      const handle = handles()[0];
      handle.focus();
      key(handle, ' ');
      f.detectChanges();
      key(handle, 'ArrowDown');
      f.detectChanges();
      key(handle, 'ArrowDown');
      f.detectChanges();
      expect(document.activeElement).toBe(handle);
    } finally {
      document.body.removeChild(f.nativeElement);
    }
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

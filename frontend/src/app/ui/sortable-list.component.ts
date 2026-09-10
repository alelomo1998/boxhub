import {
  Component, ElementRef, TemplateRef, computed, contentChild, input, output, signal, viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * A reorderable list. Press the handle and drag with a pointer, OR grab it with Space/Enter, move
 * with the arrows and drop with Space/Enter — Escape cancels and puts the item back.
 *
 * The keyboard half is not an extra: pointer drag alone fails WCAG 2.1.1, so a drag-only list is
 * unusable by anyone who cannot drag. Every move is announced through the live region, because a
 * reorder that is only visible is invisible to a screen reader.
 *
 * Hand-rolled on Pointer Events. Angular CDK is not installed and would supply only the pointer
 * half, so it would buy one of the two halves at the cost of a dependency.
 *
 * PRESENTATIONAL: it emits { from, to } and never mutates items(). The consumer owns the array.
 *
 * CONSUMER CONTRACT — a row is role="listitem" inside a role="list", NOT option/listbox (ruled
 * 2026-09-07). An option's children are presentational, so a button or link inside one fails axe's
 * nested-interactive and no screen reader reaches it — and rows here must be tappable, because
 * tapping a piece is how its editor opens. So a row MAY carry interactive content, and reordering
 * gets its own affordance instead of borrowing the row's focus: the drag handle button.
 *
 * Name the handles. itemLabel() turns an item into the words that follow "Reorder", because a
 * column of buttons all called "Reorder" tells a screen-reader user nothing about which is which.
 */
@Component({
  selector: 'bh-sortable-list',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="list" #list role="list" [attr.aria-label]="label() || null">
      @for (item of items(); track $index) {
        <div #row class="row" role="listitem" data-sortable-row
             [class.grabbed]="grabbedAt() === $index"
             [class.dragging]="dragging() && grabbedAt() === $index"
             [class.align-top]="handleAlign() === 'top'"
             [style.touch-action]="dragging() ? 'none' : null"
             [style.transform]="rowTransform($index)">
          <!-- The keyboard AND pointer reorder paths both live on the handle, not the row: a
               listitem is not focusable so keyboard needs a control here regardless, and the row
               now carries arbitrary interactive content (inputs, links) that a pointerdown on the
               whole row would swallow. aria-label is bound on the button itself because an
               attribute written on a component host never reaches the element inside. -->
          @if (canDragItem()(item, $index)) {
            <button #handle type="button" class="handle" data-sortable-handle
                    [attr.aria-label]="handleLabel(item, $index)"
                    [attr.aria-grabbed]="grabbedAt() === $index"
                    (keydown)="onKey($event, $index)"
                    (pointerdown)="onPointerDown($event, $index)"
                    (pointermove)="onPointerMove($event)"
                    (pointerup)="onPointerUp($event)"
                    (pointercancel)="onPointerCancel()"
                    (touchmove)="onTouchMove($event)">
              <span class="grip" aria-hidden="true"></span>
            </button>
          }
          <span class="body">
            <ng-container [ngTemplateOutlet]="rowTpl() ?? null"
                          [ngTemplateOutletContext]="{ $implicit: item, index: $index }" />
          </span>
        </div>
      }
    </div>
    <span class="sr" aria-live="polite">{{ announcement() }}</span>
  `,
  styles: [`
    .list { display: flex; flex-direction: column; gap: var(--sp-2); }
    .row { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap);
      padding: var(--sp-3); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      cursor: grab; user-select: none;
      transition: background var(--dur) var(--ease-out), transform var(--dur) var(--ease-out); }
    .row:hover { background: var(--surface-2); }
    /* touch-action none PERMANENTLY, not flipped when a drag starts: Chrome fixes touch-action at
       contact, and the drag now begins on contact, so a flip at that same moment comes too late
       and the browser pans the page instead of dragging. Safe to pin here because the handle is a
       tap-sized target that exists only to be dragged; the rest of the row still scrolls. */
    .handle { flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      min-width: var(--tap); min-height: var(--tap); touch-action: none;
      background: none; border: 0; border-radius: var(--r-ctl); color: inherit;
      cursor: grab; }
    .handle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .row.grabbed .handle { cursor: grabbing; }
    /* A grabbed row genuinely floats above the others, which is the one case design law allows a
       shadow on a flat surface. Not volt: reordering a list is plumbing, and the shell's box
       switcher has already spent this screen's volt budget. */
    .row.grabbed { background: var(--surface-2); border-color: var(--bone-dim);
      box-shadow: var(--shadow-float); cursor: grabbing; }
    .row.dragging { transition: none; }
    /* Flat, full-width rows: no nested card. The handle rides on the row's own padding as an
       absolutely-positioned overlay instead of owning a flex gutter, so .body (the only element
       left in normal flow) fills the whole row -- no indent to explain away. The row paints
       nothing of its own; .grabbed/.dragging still have to read as picked up, so that pair is
       restated at higher specificity below (three classes beats the two-class rules above). */
    .row.align-top { align-items: flex-start; position: relative; background: none; border: none; }
    .row.align-top:hover { background: none; }
    .row.align-top .handle { position: absolute; top: var(--sp-3); left: var(--sp-3); }
    .row.align-top.grabbed { background: var(--surface-2); box-shadow: var(--shadow-float); }
    .body { flex: 1; min-width: 0; }
    /* Three stacked bars, drawn rather than iconised: the icon set has no grip and one more name
       in it would owe its own gallery cell. */
    .grip { flex: 0 0 auto; width: 12px; height: 10px; border-radius: 1px;
      background: repeating-linear-gradient(to bottom,
        var(--faint) 0 2px, transparent 2px 4px); }
    /* Same visually-hidden pattern as bh-week-calendar's .sr — announced, never rendered. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { .row { transition: none; } }
  `],
})
export class SortableListComponent<T> {
  items = input.required<readonly T[]>();
  /** Names the list. A group of rows with no accessible name is a group nobody can find. */
  label = input('');
  /**
   * Turns an item into the words that follow "Reorder" in its handle's accessible name. The
   * default falls back to the position, which is honest but says nothing about the item — every
   * consumer with a title should pass one.
   */
  itemLabel = input<(item: T, index: number) => string>(
    (_item, i) => $localize`:@@ui.sortableList.itemFallback:item ${i + 1}:position:`);
  reordered = output<{ from: number; to: number }>();
  /** 'top' levels the handle with the row's first line, for a tall multi-line row (a card) where
   * a vertically-centred handle floats orphaned in the middle. Default preserves today's centred
   * handle exactly. */
  handleAlign = input<'center' | 'top'>('center');
  /** When false for a row, that row gets no drag handle at all. Default leaves every row draggable. */
  canDragItem = input<(item: T, index: number) => boolean>(() => true);

  protected readonly rowTpl = contentChild(TemplateRef);
  private rowEls = viewChildren<ElementRef<HTMLElement>>('row');
  private handleEls = viewChildren<ElementRef<HTMLElement>>('handle');
  private listEl = viewChild.required<ElementRef<HTMLElement>>('list');

  protected handleLabel(item: T, index: number): string {
    return $localize`:@@ui.sortableList.handle:Reorder ${this.itemLabel()(item, index)}:item:`;
  }

  /** Where the moving item started. Null when nothing is being moved. */
  private from = signal<number | null>(null);
  /** Where the moving item currently sits. Same lifetime as `from`. */
  private to = signal<number | null>(null);
  protected readonly dragging = signal(false);
  protected readonly dy = signal(0);
  protected readonly announcement = signal('');

  private startY = 0;

  /** Untransformed geometry of every row, cached at grab time (pointer or keyboard) rather than
   * read live: a row mid-drag carries a transform, and getBoundingClientRect() on a transformed
   * element reports the transformed box, which would make the target index oscillate. */
  private cachedTops: number[] = [];
  private cachedHeights: number[] = [];
  private cachedMids: number[] = [];
  private gap = 0;
  /** The dragged row's own height plus the list gap. One value covers every displaced row even
   * when rows differ in height: lifting the dragged item out of its slot and dropping it
   * elsewhere shifts each row in between by exactly that item's height plus one gap. */
  private stepPx = 0;

  /** The row that is being moved never changes DOM slot (track $index, nothing reorders), so it
   * is always the one at `from`. Drives .grabbed and aria-grabbed. */
  protected readonly grabbedAt = computed(() => this.from());

  // ---- keyboard ----------------------------------------------------------------------------

  onKey(ev: KeyboardEvent, index: number) {
    const isConfirm = ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter';
    if (this.to() === null) {
      // Not moving anything: the row whose handle has focus is the one that gets grabbed, and
      // until a grab starts the display order IS the items order, so its index needs no
      // translation. preventDefault also stops Space from clicking the button and scrolling.
      if (isConfirm) { ev.preventDefault(); this.grab(index); }
      return;
    }
    // Moving: the handler reads its own state, never the row's index — the handle the keys arrive
    // on is whichever node the moving item currently occupies.
    if (isConfirm) { ev.preventDefault(); this.drop(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); this.step(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.step(-1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); this.cancel(); }
  }

  private grab(index: number) {
    this.cacheGeometry(index);
    this.from.set(index);
    this.to.set(index);
    this.announce($localize`:@@ui.sortableList.grabbed:Grabbed item ${index + 1}:position: of ${this.items().length}:total:. Use the arrow keys to move it, then space to drop it.`);
  }

  /** The ends are walls, not wrap-arounds: a wrap would move an item the length of the list. */
  private step(delta: number) {
    const t = this.to();
    if (t === null) return;
    const next = Math.min(this.items().length - 1, Math.max(0, t + delta));
    if (next === t) return;
    this.to.set(next);
    this.announce($localize`:@@ui.sortableList.moved:Moved to position ${next + 1}:position: of ${this.items().length}:total:.`);
    // Nothing re-renders (track $index, nothing reorders), so the grabbed row's handle already
    // has focus and keeps it — no focus() call needed here.
  }

  private drop() {
    const f = this.from(), t = this.to();
    this.reset();
    if (f === null || t === null) return;
    this.announce($localize`:@@ui.sortableList.dropped:Dropped at position ${t + 1}:position: of ${this.items().length}:total:.`);
    if (f !== t) this.reordered.emit({ from: f, to: t });
  }

  private cancel() {
    const f = this.from();
    this.reset();
    this.announce($localize`:@@ui.sortableList.cancelled:Move cancelled. Back at position ${(f ?? 0) + 1}:position: of ${this.items().length}:total:.`);
    this.handleEls()[f ?? 0]?.nativeElement.focus();
  }

  // ---- pointer -----------------------------------------------------------------------------

  onPointerDown(ev: PointerEvent, index: number) {
    if (ev.button > 0) return;                       // right/middle press is not a drag
    if (this.to() !== null) this.reset();            // a pointer press abandons a keyboard grab
    this.startY = ev.clientY;
    const el = ev.currentTarget as HTMLElement;
    // Captured on the handle, not the row: a press here is unambiguous (the row body is free to
    // hold real inputs), so the drag starts on contact rather than waiting out a long-press timer.
    try { el.setPointerCapture(ev.pointerId); } catch { /* pointer already gone; the drag just ends early */ }
    this.cacheGeometry(index);
    this.from.set(index);
    this.to.set(index);
    this.dy.set(0);
    this.dragging.set(true);
    this.announce($localize`:@@ui.sortableList.lifted:Lifted item ${index + 1}:position: of ${this.items().length}:total:.`);
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.dragging()) return;
    const dy = ev.clientY - this.startY;
    this.dy.set(dy);

    const target = this.computeTarget(dy);
    if (target !== this.to()) {
      this.to.set(target);
      this.announce($localize`:@@ui.sortableList.moved:Moved to position ${target + 1}:position: of ${this.items().length}:total:.`);
    }
  }

  onPointerUp(ev: PointerEvent) {
    if (!this.dragging()) return;
    const el = ev.currentTarget as HTMLElement;
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    this.drop();
  }

  onPointerCancel() {
    if (this.dragging()) this.cancel();
  }

  /**
   * touch-action flips to none only once a drag is under way, so the list scrolls normally the
   * rest of the time — but Chrome fixes touch-action at contact, so the flip alone does not stop
   * the pan that a moving finger would otherwise start. This is the part that does.
   */
  onTouchMove(ev: TouchEvent) {
    if (this.dragging()) ev.preventDefault();
  }

  // ---- shared ------------------------------------------------------------------------------

  /** Reads every row's untransformed box once, at grab time. Nothing after this point may read
   * getBoundingClientRect() again until the gesture ends — a transformed row reports its
   * transformed box, not its slot. */
  private cacheGeometry(index: number) {
    const rects = this.rowEls().map(r => r.nativeElement.getBoundingClientRect());
    this.cachedTops = rects.map(r => r.top);
    this.cachedHeights = rects.map(r => r.height);
    this.cachedMids = rects.map(r => r.top + r.height / 2);
    this.gap = parseFloat(getComputedStyle(this.listEl().nativeElement).rowGap) || 0;
    this.stepPx = this.cachedHeights[index] + this.gap;
  }

  /** Hit-test against the cached midpoints, never a live rect: the dragged row's visual centre
   * vs. every other row's home midpoint. */
  private computeTarget(dy: number): number {
    const f = this.from();
    if (f === null) return 0;
    const centre = this.cachedTops[f] + dy + this.cachedHeights[f] / 2;
    for (let j = 0; j < f; j++) {
      if (this.cachedMids[j] >= centre) return j;
    }
    let target = f;
    for (let j = f + 1; j < this.cachedMids.length; j++) {
      if (this.cachedMids[j] <= centre) target = j; else break;
    }
    return target;
  }

  /** The keyboard path has no pointer dy, so the grabbed row's own travel is the summed heights
   * (each plus a gap) of the rows it has passed — those rows differ in height (blocks
   * collapse/expand), unlike stepPx which is fixed per gesture. */
  private keyboardOffset(): number {
    const f = this.from(), t = this.to();
    if (f === null || t === null || f === t) return 0;
    let sum = 0;
    if (t > f) {
      for (let j = f + 1; j <= t; j++) sum += this.cachedHeights[j] + this.gap;
    } else {
      for (let j = t; j < f; j++) sum += this.cachedHeights[j] + this.gap;
      sum = -sum;
    }
    return sum;
  }

  /** Every row stays in its home slot and is translated into its apparent position — see the
   * table in the class-level move contract. Only the pointer-dragged row (`dragging()`) tracks
   * the finger exactly; the keyboard-grabbed row and every displaced row tween via CSS. */
  protected rowTransform(j: number): string | null {
    const f = this.from(), t = this.to();
    if (f === null || t === null) return null;
    if (j === f) return `translateY(${this.dragging() ? this.dy() : this.keyboardOffset()}px)`;
    if (f < j && j <= t) return `translateY(${-this.stepPx}px)`;
    if (t <= j && j < f) return `translateY(${this.stepPx}px)`;
    return null;
  }

  private reset() {
    this.from.set(null);
    this.to.set(null);
    this.dragging.set(false);
    this.dy.set(0);
  }

  private announce(text: string) { this.announcement.set(text); }
}

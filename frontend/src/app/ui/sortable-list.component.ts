import {
  Component, ElementRef, TemplateRef, computed, contentChild, input, output, signal, viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** A press must be held this long before it becomes a drag rather than a scroll. */
const LONG_PRESS_MS = 400;
/** Movement further than this before the timer fires means the finger is scrolling, not dragging. */
const SLOP_PX = 8;

/**
 * A reorderable list. Long-press to drag with a pointer, OR grab with Space/Enter, move with the
 * arrows and drop with Space/Enter — Escape cancels and puts the item back.
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
 * CONSUMER CONTRACT — a row is role="option", whose children are presentational. Do not project a
 * button, link or input into a row: axe's nested-interactive fails on a focusable descendant of an
 * option, and a screen reader will not reach it either. Per-row controls belong beside the list,
 * or the row's whole content becomes the tap target on the consumer's own element outside this one.
 */
@Component({
  selector: 'bh-sortable-list',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="list" role="listbox" [attr.aria-label]="label() || null">
      @for (item of view(); track $index) {
        <div #row class="row" role="option" data-sortable-row tabindex="0"
             [class.grabbed]="grabbedAt() === $index"
             [class.dragging]="dragging() && grabbedAt() === $index"
             [attr.aria-grabbed]="grabbedAt() === $index"
             [style.touch-action]="dragging() ? 'none' : null"
             [style.transform]="dragging() && grabbedAt() === $index ? 'translateY(' + dy() + 'px)' : null"
             (keydown)="onKey($event, $index)"
             (pointerdown)="onPointerDown($event, $index)"
             (pointermove)="onPointerMove($event)"
             (pointerup)="onPointerUp($event)"
             (pointercancel)="onPointerCancel()"
             (touchmove)="onTouchMove($event)">
          <span class="grip" aria-hidden="true"></span>
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
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A grabbed row genuinely floats above the others, which is the one case design law allows a
       shadow on a flat surface. Not volt: reordering a list is plumbing, and the shell's box
       switcher has already spent this screen's volt budget. */
    .row.grabbed { background: var(--surface-2); border-color: var(--bone-dim);
      box-shadow: var(--shadow-float); cursor: grabbing; }
    .row.dragging { transition: none; }
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
export class SortableListComponent {
  items = input.required<readonly unknown[]>();
  /** Names the listbox. A group of options with no accessible name is a group nobody can find. */
  label = input('');
  reordered = output<{ from: number; to: number }>();

  protected readonly rowTpl = contentChild(TemplateRef);
  private rowEls = viewChildren<ElementRef<HTMLElement>>('row');

  /** Where the moving item started. Null when nothing is being moved. */
  private from = signal<number | null>(null);
  /** Where the moving item currently sits. Same lifetime as `from`. */
  private to = signal<number | null>(null);
  protected readonly dragging = signal(false);
  protected readonly dy = signal(0);
  protected readonly announcement = signal('');

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;

  /** The display index of the moving row, or null. Drives .grabbed and aria-grabbed. */
  protected readonly grabbedAt = computed(() => this.to());

  /**
   * The items in their CURRENT visual order: the moving one lifted out of `from` and dropped back
   * at `to`. Rendered with `track $index` on purpose — the DOM nodes stay put and their content
   * shifts, so focus survives a move (Angular's reorder detaches a node, and a detached node is
   * blurred) and every slot keeps a stable box to hit-test against.
   */
  protected readonly view = computed<readonly unknown[]>(() => {
    const f = this.from(), t = this.to();
    const arr = [...this.items()];
    if (f === null || t === null || f === t) return arr;
    const [moved] = arr.splice(f, 1);
    arr.splice(t, 0, moved);
    return arr;
  });

  // ---- keyboard ----------------------------------------------------------------------------

  onKey(ev: KeyboardEvent, index: number) {
    const isConfirm = ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter';
    if (this.to() === null) {
      // Not moving anything: the row under the cursor is the one that gets grabbed, and until a
      // grab starts the display order IS the items order, so its index needs no translation.
      if (isConfirm) { ev.preventDefault(); this.grab(index); }
      return;
    }
    // Moving: the handler reads its own state, never the row's index — the row the keys arrive on
    // is whichever node the moving item currently occupies.
    if (isConfirm) { ev.preventDefault(); this.drop(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); this.step(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.step(-1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); this.cancel(); }
  }

  private grab(index: number) {
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
    // The nodes are positional (track $index), so focus follows the item into its new slot.
    this.rowEls()[next]?.nativeElement.focus();
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
    this.rowEls()[f ?? 0]?.nativeElement.focus();
  }

  // ---- pointer -----------------------------------------------------------------------------

  onPointerDown(ev: PointerEvent, index: number) {
    if (ev.button > 0) return;                       // right/middle press is not a drag
    if (this.to() !== null) this.reset();            // a pointer press abandons a keyboard grab
    this.startX = ev.clientX;
    this.startY = ev.clientY;
    const el = ev.currentTarget as HTMLElement;
    const id = ev.pointerId;
    // Long press, not immediate drag: a list is usually taller than the screen, so a press that
    // starts a drag on contact makes the page unscrollable with a thumb.
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      try { el.setPointerCapture(id); } catch { /* pointer already gone; the drag just ends early */ }
      this.from.set(index);
      this.to.set(index);
      this.dy.set(0);
      this.dragging.set(true);
      this.announce($localize`:@@ui.sortableList.lifted:Lifted item ${index + 1}:position: of ${this.items().length}:total:.`);
    }, LONG_PRESS_MS);
  }

  onPointerMove(ev: PointerEvent) {
    if (this.pressTimer) {
      if (Math.abs(ev.clientY - this.startY) > SLOP_PX || Math.abs(ev.clientX - this.startX) > SLOP_PX)
        this.clearTimer();                           // it was a scroll all along
      return;
    }
    if (!this.dragging()) return;
    this.dy.set(ev.clientY - this.startY);

    const t = this.to();
    const rows = this.rowEls();
    for (let j = 0; j < rows.length; j++) {
      if (j === t) continue;                         // the moving row is translated; skip its box
      const b = rows[j].nativeElement.getBoundingClientRect();
      if (ev.clientY < b.top || ev.clientY > b.bottom) continue;
      this.to.set(j);
      // ponytail: re-anchor to the slot just entered rather than tracking a running offset, so
      // the row snaps into it. Ceiling: a small jump at each swap. Upgrade path if it reads badly
      // is measuring the new slot's own top, which costs a layout read per move.
      this.startY = ev.clientY;
      this.dy.set(0);
      this.announce($localize`:@@ui.sortableList.moved:Moved to position ${j + 1}:position: of ${this.items().length}:total:.`);
      break;
    }
  }

  onPointerUp(ev: PointerEvent) {
    this.clearTimer();
    if (!this.dragging()) return;
    const el = ev.currentTarget as HTMLElement;
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    this.drop();
  }

  onPointerCancel() {
    this.clearTimer();
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

  private clearTimer() {
    if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
  }

  private reset() {
    this.clearTimer();
    this.from.set(null);
    this.to.set(null);
    this.dragging.set(false);
    this.dy.set(0);
  }

  private announce(text: string) { this.announcement.set(text); }
}

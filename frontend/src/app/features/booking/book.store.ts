import { Injectable, signal } from '@angular/core';
import { SessionView } from './booking.service';
import { SessionWindow, covers as coversWindow } from './session-window';

/**
 * Book's day + sessions cache, hoisted out of BookPage (M17a Task 12b) so the class-detail
 * shared-element transition has something to collapse onto: returning from class detail must find
 * the departure day's cards already painted, not a loading spinner, or the browser can't pair the
 * `view-transition-name`s and the hero just fades instead of collapsing (spec §5.3). Root-provided
 * so the cache survives the round trip through class detail — the same reason ClassDraftStore
 * (`features/programming/class-draft.store.ts`) lives outside its page.
 */
@Injectable({ providedIn: 'root' })
export class BookStore {
  readonly sessions = signal<SessionView[]>([]);
  readonly dayOffset = signal(0);

  /** null = never successfully loaded. Distinct from a window that legitimately covers nothing
   *  (`NO_WINDOW` in book.page.ts's load-failure path), which book.page sets explicitly via
   *  resetWindow(). */
  private window: SessionWindow | null = null;

  /** Whether the cached window already covers this day offset — same rule book.page always used,
   *  now readable before a fetch so a cached return trip can skip the loading state. */
  covers(offset: number): boolean {
    return this.window !== null && coversWindow(this.window, offset);
  }

  setWindow(w: SessionWindow) { this.window = w; }
  /** A window that covers no day at all — see book.page's load() for why a failed fetch resets to
   *  this instead of leaving the requested (also failed) window in place. */
  resetWindow() { this.window = null; }

  /** Book's scroll offset when a card was last opened (M17a Task 12b) — the collapse animates to
   *  the card's real rect, so a return trip that resets to the top lands the morph on empty space
   *  or a different card entirely. book.page.ts saves this right before navigating to class detail
   *  and consumes it (one-shot) on the cache-hit mount that follows, so it never leaks into an
   *  unrelated remount (e.g. Book -> Home -> Book) that never went through detail. */
  private scrollY: number | null = null;

  saveScroll(y: number) { this.scrollY = y; }

  /** Read-and-clear: a value only ever applies to the ONE mount right after it was saved. */
  takeScroll(): number | null {
    const y = this.scrollY;
    this.scrollY = null;
    return y;
  }
}

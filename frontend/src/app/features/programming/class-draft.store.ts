import { Injectable, signal } from '@angular/core';
import { Wod } from './programming.service';

/**
 * One piece of a class under construction. `wod === null` IS the empty-slot state: a slot the
 * class-type skeleton seeded, carrying a label and a category, waiting to be filled.
 */
export interface PieceDraft {
  /** Existing session_item id. null for a piece added this session. M39 reconciles on this id:
   *  a surviving piece MUST keep its row or its wod_score rows cascade away. */
  itemId: string | null;
  /** The piece's content once it has any. null means the slot is still empty. */
  wod: Wod | null;
  /** Set by a library pick and left set until the class is saved: the SERVER copies the library
   *  row, so the class owns its content and editing it never edits the library. */
  fromLibraryWodId: string | null;
  /** Shown while the slot is empty (the skeleton's label, e.g. "Warmup"). */
  label: string;
  /** The slot's category, one of MACROS. Seeds the library filter and the new piece's macro. */
  macro: string;
  scoreable: boolean;
  /** Score-type override. null means "whatever the wod itself says". */
  scoreType: string | null;
}

/**
 * The class stack and the piece editor are two routes, so the drafts have to live somewhere
 * that outlives a navigation. In memory only.
 *
 * ponytail: in-memory, so a hard reload mid-edit drops the drafts and the stack falls back to
 * the server. Acceptable because the editor persists each piece as a wod on its own save --
 * the worst case is an orphan wod, never lost typing. Persist to sessionStorage if reload
 * turns out to be a real path.
 */
@Injectable({ providedIn: 'root' })
export class ClassDraftStore {
  /** Which class the drafts belong to. A different session id means these drafts are stale. */
  readonly sessionId = signal<string | null>(null);
  readonly drafts = signal<PieceDraft[]>([]);

  /** True when the store already holds this class, i.e. we came back from the piece editor. */
  holds(sessionId: string): boolean {
    return this.sessionId() === sessionId && this.drafts().length > 0;
  }

  open(sessionId: string, drafts: PieceDraft[]) {
    this.sessionId.set(sessionId);
    this.drafts.set(drafts);
  }

  /** Replace one draft in place. Used by the piece editor on save. */
  put(index: number, draft: PieceDraft) {
    this.drafts.update(ds => ds.map((d, i) => (i === index ? draft : d)));
  }

  at(index: number): PieceDraft | null {
    return this.drafts()[index] ?? null;
  }

  clear() {
    this.sessionId.set(null);
    this.drafts.set([]);
  }
}

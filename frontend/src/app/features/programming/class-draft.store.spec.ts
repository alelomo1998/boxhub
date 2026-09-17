import { TestBed } from '@angular/core/testing';
import { ClassDraftStore, PieceDraft } from './class-draft.store';

function draft(label: string): PieceDraft {
  return { itemId: null, wod: null, fromLibraryWodId: null, fromBenchmarkId: null, label, macro: 'WORKOUT', scoreable: true, scoreType: null };
}

describe('ClassDraftStore', () => {
  let store: ClassDraftStore;

  beforeEach(() => {
    store = TestBed.inject(ClassDraftStore);
  });

  describe('holds', () => {
    it('is false for a different session id', () => {
      store.open('s1', [draft('Warmup')]);
      expect(store.holds('s2')).toBe(false);
    });

    it('is false for an empty list', () => {
      store.open('s1', []);
      expect(store.holds('s1')).toBe(false);
    });

    it('is true when the session matches and drafts are present', () => {
      store.open('s1', [draft('Warmup')]);
      expect(store.holds('s1')).toBe(true);
    });
  });

  describe('put', () => {
    it('replaces only the named index and leaves the others identical', () => {
      const original = [draft('Warmup'), draft('Strength'), draft('WOD')];
      store.open('s1', original);

      store.put(1, draft('Strength (edited)'));

      expect(store.drafts()[0]).toBe(original[0]);
      expect(store.drafts()[2]).toBe(original[2]);
      expect(store.drafts()[1].label).toBe('Strength (edited)');
    });
  });

  describe('at', () => {
    it('returns null past the end', () => {
      store.open('s1', [draft('Warmup')]);
      expect(store.at(5)).toBeNull();
    });

    it('returns the draft at the index', () => {
      const d = draft('Warmup');
      store.open('s1', [d]);
      expect(store.at(0)).toBe(d);
    });
  });

  describe('clear', () => {
    it('resets both signals', () => {
      store.open('s1', [draft('Warmup')]);
      store.clear();
      expect(store.sessionId()).toBeNull();
      expect(store.drafts()).toEqual([]);
    });

    it('resets the baseline', () => {
      store.open('s1', [draft('Warmup')]);
      store.clear();
      expect(store.baseline()).toBe('[]');
    });
  });

  describe('baseline', () => {
    it('open() sets it to a snapshot of the drafts', () => {
      const drafts = [draft('Warmup')];
      store.open('s1', drafts);
      expect(store.baseline()).toBe(JSON.stringify(drafts));
    });

    it('put() does not move it, so a round trip through the piece editor is detectable as unsaved', () => {
      store.open('s1', [draft('Warmup')]);
      const before = store.baseline();
      store.put(0, draft('Warmup (edited)'));
      expect(store.baseline()).toBe(before);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { BookStore } from './book.store';
import { sessionWindow } from './session-window';

describe('BookStore', () => {
  let store: BookStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(BookStore);
  });

  it('covers nothing before any window is set', () => {
    expect(store.covers(0)).toBe(false);
  });

  it('covers a day once its window is set', () => {
    store.setWindow(sessionWindow(0));
    expect(store.covers(0)).toBe(true);
    expect(store.covers(100)).toBe(false);
  });

  it('resetWindow makes every day uncovered again', () => {
    store.setWindow(sessionWindow(0));
    store.resetWindow();
    expect(store.covers(0)).toBe(false);
  });

  it('sessions and dayOffset are writable signals that hold their value', () => {
    store.dayOffset.set(3);
    expect(store.dayOffset()).toBe(3);
    store.sessions.set([{ id: 's1' } as any]);
    expect(store.sessions().length).toBe(1);
  });

  it('takeScroll returns null before anything is saved', () => {
    expect(store.takeScroll()).toBeNull();
  });

  it('takeScroll is read-and-clear: a saved value applies to one take only', () => {
    store.saveScroll(400);
    expect(store.takeScroll()).toBe(400);
    expect(store.takeScroll()).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookPage } from './book.page';
import { BookStore } from '../booking/book.store';
import type { SessionView } from '../booking/booking.service';
import { bookingReason } from '../booking/booking-reason';

function session(id: string, startAt: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    id, name: 'WOD', startAt, durationMin: 60, capacity: 10, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount: 3, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: null, coachAvatarPath: null, people: [], ...overrides,
  };
}

/**
 * A class is "past" when its start is on a calendar day before today (local time) — same rule as
 * CoachClassesPage's isPastDay. A past class shows the "finished" suffix instead of the time-left
 * one, and a CHECKED_IN athlete sees the "✓ Attended" badge instead of "Booked".
 */
describe('BookPage', () => {
  let http: HttpTestingController;

  function setup(sessions: SessionView[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BookPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BookPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(sessions);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders the screen title above the week strip', () => {
    const fixture = setup([]);
    const h1 = fixture.nativeElement.querySelector('h1.title');
    expect(h1.textContent).toContain('Book');
  });

  it('renders one class card per session of the selected day, image from imagePath', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([
      session('s1', soon, { imagePath: '/img/s1.jpg' }),
      session('s2', new Date(Date.now() + 7200_000).toISOString()),
    ]);

    const cards = fixture.nativeElement.querySelectorAll('bh-class-card');
    expect(cards.length).toBe(2);
    const img = fixture.nativeElement.querySelector('[data-testid="session-s1"] img.ph');
    expect(img.src).toContain('/img/s1.jpg');
  });

  it('upcoming with room shows Book; clicking calls booking.book and reloads', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);

    const btn = fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]');
    expect(btn.textContent).toContain('Book');
    btn.click();

    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { bookedCount: 4, capacity: 10, myBookingStatus: 'BOOKED' })]);
    fixture.detectChanges();
  });

  it('booking does not blank the list behind a loading state, and the card updates once the silent revalidate resolves', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    fixture.detectChanges();

    // The revalidate GET is already in flight, but the list must stay mounted throughout — this
    // is the regression: `load()` (non-silent) used to flip `loading`, unmounting every card
    // behind "Loading classes…" for the round trip, which read as the whole page refreshing.
    expect(fixture.nativeElement.querySelector('.stateline')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="session-s1"]')).not.toBeNull();

    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { bookedCount: 4, capacity: 10, myBookingStatus: 'BOOKED' })]);
    fixture.detectChanges();

    // The card's own state (badge/action) still updates once the silent revalidate resolves.
    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('.badge').textContent).toContain('Booked');
    expect(card.querySelector('[data-testid="cancel-btn"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="book-btn"]')).toBeNull();
  });

  it('a revalidate that fails after a successful cancel keeps the cached list, not the error block', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="confirm-execute"]').click();

    http.expectOne(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking').flush(null);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The cancel itself succeeded (a danger outcome banner, per §4 — losing a place is not a
    // "good" outcome) and stays the source of truth; the failed background revalidate must not
    // drop the athlete into the load-error block or clear the (now slightly stale) list.
    const banner = fixture.nativeElement.querySelector('bh-banner .alert.danger');
    expect(banner.textContent).toContain('Burn It');
    expect(fixture.nativeElement.querySelector('[data-testid="book-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="session-s1"]')).not.toBeNull();
  });

  it('full shows Join waitlist with book-btn', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { bookedCount: 10, capacity: 10 })]);

    const btn = fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Join waitlist');
  });

  it('checked-in today (not started) shows Attended and neither book-btn nor cancel-btn', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { myBookingStatus: 'CHECKED_IN' })]);

    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('.badge').textContent).toContain('Attended');
    expect(card.querySelector('[data-testid="book-btn"]')).toBeNull();
    expect(card.querySelector('[data-testid="cancel-btn"]')).toBeNull();
  });

  it('a 409 ENTRIES_PER_WEEK mounts a danger banner and no card shows error text', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([
      session('s1', soon, { bookedCount: 3, capacity: 10 }),
      session('s2', new Date(Date.now() + 7200_000).toISOString(), { bookedCount: 3, capacity: 10 }),
    ]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ detail: 'ENTRIES_PER_WEEK' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('bh-banner .alert.danger');
    expect(banner.textContent).toContain(bookingReason('ENTRIES_PER_WEEK'));
    expect(fixture.nativeElement.querySelector('[data-testid="session-s1"] [role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="session-s2"] [role="alert"]')).toBeNull();
  });

  it('a successful book mounts a good banner naming the class', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', bookedCount: 3, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { name: 'Burn It', bookedCount: 4, capacity: 10, myBookingStatus: 'BOOKED' })]);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('bh-banner .alert.good');
    expect(banner.textContent).toContain('Burn It');
  });

  it('a second outcome mounts a new banner element instance so it re-announces', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([
      session('s1', soon, { name: 'Burn It', bookedCount: 3, capacity: 10 }),
      session('s2', new Date(Date.now() + 7200_000).toISOString(), { name: 'Open Gym', bookedCount: 3, capacity: 10 }),
    ]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ detail: 'ENTRIES_PER_WEEK' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('bh-banner .alert');
    expect(first).not.toBeNull();

    fixture.nativeElement.querySelector('[data-testid="session-s2"] [data-testid="book-btn"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s2/book')
      .flush({ bookingId: 'b2', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([
        session('s1', soon, { name: 'Burn It', bookedCount: 3, capacity: 10 }),
        session('s2', new Date(Date.now() + 7200_000).toISOString(), { name: 'Open Gym', bookedCount: 4, capacity: 10, myBookingStatus: 'BOOKED' }),
      ]);
    fixture.detectChanges();

    const second = fixture.nativeElement.querySelector('bh-banner .alert');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(second.textContent).toContain('Open Gym');
  });

  it('a second click while busy does not call book twice', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);

    const btn = fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]');
    btn.click();
    btn.click();

    const reqs = http.match(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book');
    expect(reqs.length).toBe(1);
    reqs[0].flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions').flush([session('s1', soon, { myBookingStatus: 'BOOKED' })]);
    fixture.detectChanges();
  });

  it('tapping cancel-btn opens the confirm sheet and does not call booking.cancel', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('[data-testid="book-cancel-confirm-sheet"] .sh-title');
    expect(title.textContent).toContain('Cancel this booking?');
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-line"]').textContent).toContain('Burn It');
    http.expectNone(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking');
  });

  it('confirming in the sheet calls booking.cancel once and mounts a danger banner', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="confirm-execute"]').click();

    http.expectOne(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking').flush(null);
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { name: 'Burn It', bookedCount: 3, capacity: 10 })]);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('bh-banner .alert.danger');
    expect(banner.textContent).toContain('Burn It');
  });

  it('a failed confirm closes the sheet (so the danger banner is not hidden behind the dialog top layer)', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="confirm-execute"]').click();

    http.expectOne(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking')
      .flush({ detail: 'PAST_CUTOFF' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const dlg = fixture.nativeElement.querySelector('[data-testid="book-cancel-confirm-sheet"] dialog');
    expect(dlg.open).toBeFalse();
    expect(fixture.componentInstance.confirmItem()).toBeNull();
    const banner = fixture.nativeElement.querySelector('bh-banner .alert.danger');
    expect(banner.textContent).toContain(bookingReason('PAST_CUTOFF'));
  });

  it('"Keep it" closes the sheet without calling booking.cancel', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="confirm-keep"]').click();
    fixture.detectChanges();

    const dlg = fixture.nativeElement.querySelector('[data-testid="book-cancel-confirm-sheet"] dialog');
    expect(dlg.open).toBeFalse();
    http.expectNone(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking');
  });

  it('a second click on confirm-execute while busy does not call cancel twice', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { name: 'Burn It', myBookingStatus: 'BOOKED', bookedCount: 4, capacity: 10 })]);

    fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="cancel-btn"]').click();
    fixture.detectChanges();
    const exec = fixture.nativeElement.querySelector('[data-testid="confirm-execute"]');
    exec.click();
    exec.click();

    const reqs = http.match(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking');
    expect(reqs.length).toBe(1);
    reqs[0].flush(null);
    http.expectOne(r => r.url === '/api/box/sessions').flush([session('s1', soon, { bookedCount: 3, capacity: 10 })]);
    fixture.detectChanges();
  });

  it('past day: Finished, no spots text, no book-btn', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', yesterday.toISOString())]);
    fixture.componentInstance.dayOffset.set(-1);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('.suffix').textContent).toContain('finished');
    expect(card.querySelector('[data-testid="book-btn"]')).toBeNull();
    expect(card.querySelector('[data-testid="cancel-btn"]')).toBeNull();
  });

  it('a failed load shows the error and NOT the empty state', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BookPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BookPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="book-error"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).toBeNull();
  });

  it('the retry button re-issues the request and clears the error', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BookPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BookPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="book-retry"]').click();
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="book-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cards')).not.toBeNull();
  });

  it('a day change after a failed load refetches', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BookPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BookPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Still well inside the ±14-day window the failed request asked for — before the fix, the
    // poisoned `this.window` reported this offset as already covered, so no refetch happened.
    fixture.componentInstance.dayOffset.set(2);
    fixture.detectChanges();

    const req = http.expectOne(r => r.url === '/api/box/sessions');
    expect(req.request.url).toBe('/api/box/sessions');
    req.flush([]);
    fixture.detectChanges();
  });

  it('a remount with the day already cached renders immediately (no loading state) and revalidates silently', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);
    // A second BookPage instance sharing the same root-provided BookStore — the way the router
    // creates a fresh component each time Book is (re)navigated to, e.g. returning from class
    // detail. This is the case the shared-element collapse needs: the card must already be in the
    // DOM, not behind a loading state, when the browser takes its new-state view-transition snapshot.
    const fixtureB = TestBed.createComponent(BookPage);
    fixtureB.detectChanges();

    expect(fixtureB.nativeElement.querySelector('.stateline')).toBeNull();
    expect(fixtureB.nativeElement.querySelector('[data-testid="session-s1"]')).not.toBeNull();

    // Still revalidates in the background, so a booking made elsewhere shows up here.
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { bookedCount: 4, capacity: 10 })]);
    fixtureB.detectChanges();
    expect(fixtureB.nativeElement.querySelector('[data-testid="session-s1"] .suffix').textContent).toContain('6');
  });

  it('a silent revalidate failure keeps the cached list instead of clearing it or showing an error', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);
    const fixtureB = TestBed.createComponent(BookPage);
    fixtureB.detectChanges();

    http.expectOne(r => r.url === '/api/box/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixtureB.detectChanges();

    expect(fixtureB.nativeElement.querySelector('[data-testid="session-s1"]')).not.toBeNull();
    expect(fixtureB.nativeElement.querySelector('[data-testid="book-error"]')).toBeNull();
  });

  it('records window.scrollY when a card is opened, for BookStore to restore on return', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon)]);
    // Object.defineProperty, not spyOnProperty(window, 'scrollY', 'get'): shell-header.component
    // .spec.ts redefines window.scrollY as a plain value property (not restored to an accessor
    // afterward), and Karma runs every spec file in one page load — spyOnProperty then flakily
    // throws "does not have access type get" depending on file execution order. This pattern is
    // the one shell-header's own spec already uses, and works regardless of the property's
    // current descriptor.
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });

    // The click on the card host, not the router navigation itself — same handler either way.
    fixture.nativeElement.querySelector('bh-class-card').click();

    expect(TestBed.inject(BookStore).takeScroll()).toBe(400);
  });

  it('restores the saved scroll position on a cache-hit remount, then consumes it (one-shot)', async () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    setup([session('s1', soon)]);
    TestBed.inject(BookStore).saveScroll(400);
    const scrollTo = spyOn(window, 'scrollTo');

    const fixtureB = TestBed.createComponent(BookPage);
    fixtureB.detectChanges();
    // afterNextRender fires after a render tick — whenStable() waits for exactly that without
    // pinning to a fixed setTimeout, so this isn't racing the same timing the real app relies on.
    await fixtureB.whenStable();

    expect(scrollTo).toHaveBeenCalledWith(0, 400);
    // Revalidate GET still in flight from the cache-hit mount — flush it so afterEach's verify() passes.
    http.expectOne(r => r.url === '/api/box/sessions').flush([session('s1', soon)]);

    // One-shot: a saved value is never reapplied to a LATER mount that didn't just come from detail.
    scrollTo.calls.reset();
    const fixtureC = TestBed.createComponent(BookPage);
    fixtureC.detectChanges();
    await fixtureC.whenStable();
    expect(scrollTo).not.toHaveBeenCalled();
    http.expectOne(r => r.url === '/api/box/sessions').flush([session('s1', soon)]);
  });

  it('does not restore scroll on a fresh (uncached) mount', async () => {
    TestBed.resetTestingModule(); // a genuinely fresh BookStore — window uncovered, unlike the
                                   // previous test's, which would otherwise make this a cache hit.
    TestBed.configureTestingModule({
      imports: [BookPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(BookStore).saveScroll(400); // stale/unrelated — no card was ever opened this trip
    const scrollTo = spyOn(window, 'scrollTo');

    const fixture = TestBed.createComponent(BookPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scrollTo).not.toHaveBeenCalled();
    http.expectOne(r => r.url === '/api/box/sessions').flush([]);
  });

  it('a card action shows a pending state while the request is in flight', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { bookedCount: 3, capacity: 10 })]);

    const btn = fixture.nativeElement.querySelector('[data-testid="session-s1"] [data-testid="book-btn"]');
    btn.click();
    fixture.detectChanges();

    expect(btn.getAttribute('aria-busy')).toBe('true');

    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions')
      .flush([session('s1', soon, { bookedCount: 4, capacity: 10, myBookingStatus: 'BOOKED' })]);
    fixture.detectChanges();
  });
});

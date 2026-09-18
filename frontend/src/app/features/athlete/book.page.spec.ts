import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookPage } from './book.page';
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
});

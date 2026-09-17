import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookPage } from './book.page';
import type { SessionView } from '../booking/booking.service';

function session(id: string, startAt: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    id, name: 'WOD', startAt, durationMin: 60, capacity: 10, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount: 3, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, ...overrides,
  };
}

/**
 * A class is "past" when its start is on a calendar day before today (local time) — same rule as
 * CoachClassesPage's isPastDay. A past class hides the spots line and shows "Finished" instead of
 * a live footer; a CHECKED_IN athlete sees "Attended" there instead of "Booked".
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
    http.expectOne(r => r.url === '/api/box/class-templates').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows Finished and Attended, no spots line and no book button for a past-day CHECKED_IN class', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', yesterday.toISOString(), { myBookingStatus: 'CHECKED_IN' })]);
    fixture.componentInstance.dayOffset.set(-1);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('.spots')).toBeNull();
    expect(card.querySelector('[data-testid="book-btn"]')).toBeNull();
    expect(card.querySelector('.foot').textContent).toContain('Finished');
    expect(card.querySelector('.foot').textContent).toContain('Attended');
  });

  it('shows Finished with no pill for a past-day class with no booking', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', yesterday.toISOString())]);
    fixture.componentInstance.dayOffset.set(-1);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('.foot').textContent).toContain('Finished');
    expect(card.querySelector('bh-pill')).toBeNull();
  });

  it('hides the book button for a not-yet-started class today when already CHECKED_IN', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup([session('s1', soon, { myBookingStatus: 'CHECKED_IN' })]);

    const card = fixture.nativeElement.querySelector('[data-testid="session-s1"]');
    expect(card.querySelector('[data-testid="book-btn"]')).toBeNull();
    expect(card.querySelector('[data-testid="cancel-btn"]')).toBeNull();
  });
});

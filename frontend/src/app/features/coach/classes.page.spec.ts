import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CoachClassesPage } from './classes.page';
import type { SessionView } from '../booking/booking.service';

function session(id: string, startAt: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    id, name: 'WOD', startAt, durationMin: 60, capacity: 10, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount: 0, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: null, coachAvatarPath: null, people: [],
    ...overrides,
  };
}

/**
 * A session is "past" when its start is on a calendar day before today (local time) — user-ruled
 * 2026-09-16. Today's classes keep every action; a past day loses Build and Run, since neither
 * makes sense once the class has come and gone, but Check-in stays reachable for a late mark.
 */
describe('CoachClassesPage', () => {
  let http: HttpTestingController;

  function setup(sessions: SessionView[]) {
    TestBed.configureTestingModule({
      imports: [CoachClassesPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CoachClassesPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/sessions').flush(sessions);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('today shows build-link, checkin-link and run-link', () => {
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', today.toISOString())]);

    const row = fixture.nativeElement.querySelector('[data-testid="class-s1"]');
    expect(row.querySelector('[data-testid="build-link"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="checkin-link"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="run-link"]')).toBeTruthy();
  });

  it('past day shows checkin-link only', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', yesterday.toISOString())]);
    fixture.componentInstance.dayOffset.set(-1);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-testid="class-s1"]');
    expect(row.querySelector('[data-testid="build-link"]')).toBeNull();
    expect(row.querySelector('[data-testid="run-link"]')).toBeNull();
    expect(row.querySelector('[data-testid="checkin-link"]')).toBeTruthy();
  });

  it('shows Draft vs Published badge from programmingStatus', () => {
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const fixture = setup([
      session('s1', today.toISOString(), { programmingStatus: 'PUBLISHED' }),
      session('s2', today.toISOString(), { programmingStatus: 'DRAFT' }),
    ]);

    const published = fixture.nativeElement.querySelector('[data-testid="class-s1"] .badge');
    const draft = fixture.nativeElement.querySelector('[data-testid="class-s2"] .badge');
    expect(published.textContent.trim()).toBe('Published');
    expect(published.classList.contains('good')).toBeTrue();
    expect(draft.textContent.trim()).toBe('Draft');
    expect(draft.classList.contains('good')).toBeFalse();
    expect(draft.classList.contains('warn')).toBeTrue();
  });

  it('meta shows the waitlist part only when waitlistCount > 0', () => {
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const fixture = setup([
      session('s1', today.toISOString(), { bookedCount: 8, capacity: 12, waitlistCount: 0 }),
      session('s2', today.toISOString(), { bookedCount: 8, capacity: 12, waitlistCount: 2 }),
    ]);

    const noLine = fixture.nativeElement.querySelector('[data-testid="class-s1"] .suffix');
    const inLine = fixture.nativeElement.querySelector('[data-testid="class-s2"] .suffix');
    expect(noLine.textContent).toContain('8/12 booked');
    expect(noLine.textContent).not.toContain('in line');
    expect(inLine.textContent).toContain('8/12 booked');
    expect(inLine.textContent).toContain('2 in line');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CoachClassesPage } from './classes.page';
import type { SessionView } from '../booking/booking.service';

function session(id: string, startAt: string): SessionView {
  return {
    id, name: 'WOD', startAt, durationMin: 60, capacity: 10, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount: 0, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: null,
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

  it('renders Build, Check-in and Run for a class today', () => {
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', today.toISOString())]);

    const row = fixture.nativeElement.querySelector('[data-testid="class-s1"]');
    expect(row.querySelector('[data-testid="build-link"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="checkin-link"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="run-link"]')).toBeTruthy();
  });

  it('hides Build and Run but keeps Check-in for a class on a past day', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup([session('s1', yesterday.toISOString())]);
    fixture.componentInstance.dayOffset.set(-1);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-testid="class-s1"]');
    expect(row.querySelector('[data-testid="build-link"]')).toBeNull();
    expect(row.querySelector('[data-testid="run-link"]')).toBeNull();
    expect(row.querySelector('[data-testid="checkin-link"]')).toBeTruthy();
  });
});

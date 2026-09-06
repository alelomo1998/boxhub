import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SchedulePage } from './schedule.page';
import type { ClassTemplate } from '../booking/booking.service';

/**
 * Covers the two copy defects found by looking at the rendered screen rather than by running the
 * suite — both had passed every green build:
 *   - weekly template rows printed the wire time verbatim, "Mon 18:00:00 · WOD Class"
 *   - the blocking-dates alert read "1 classes in this range have bookings."
 * Neither is reachable from e2e's happy path, so they belong here.
 */
const TEMPLATE: ClassTemplate = {
  id: 't1', name: 'WOD Class', weekday: 0, startTime: '18:00:00',
  durationMin: 60, capacity: 14, coachId: null, active: true,
};

describe('SchedulePage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [SchedulePage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SchedulePage);
    fixture.detectChanges();
    // ngOnInit fires both loads; the sessions range is time-derived, so match by URL prefix.
    http.match(r => r.url === '/api/box/sessions').forEach(r => r.flush([]));
    http.expectOne('/api/box/class-templates').flush([TEMPLATE]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders a template time as HH:mm, never the wire value with seconds', () => {
    const fixture = setup();
    const row = fixture.nativeElement.querySelector('.tnm').textContent.trim();
    expect(row).toContain('18:00');
    expect(row).not.toContain('18:00:00');
  });

  it('populates the edit form with the time input value format, not the wire value', () => {
    const fixture = setup();
    fixture.nativeElement.querySelector('.trow').click();
    fixture.detectChanges();
    expect(fixture.componentInstance['formStartTime']()).toBe('18:00');
  });

  it('says "1 class" for a single blocking date and "2 classes" for two', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp['blockingDates'].set(['2026-09-07']);
    fixture.detectChanges();
    let alert = fixture.nativeElement.querySelector('[data-testid="schedule-blocked-alert"]').textContent;
    expect(alert).toContain('1 class in this range has bookings.');
    expect(alert).not.toContain('1 classes');

    cmp['blockingDates'].set(['2026-09-07', '2026-09-14']);
    fixture.detectChanges();
    alert = fixture.nativeElement.querySelector('[data-testid="schedule-blocked-alert"]').textContent;
    expect(alert).toContain('2 classes in this range have bookings.');
  });

  it('still renders the refusal when no retry date could be derived', () => {
    const fixture = setup();
    // The refusal is the message the admin must not miss. It used to be destroyed wholesale by a
    // DatePipe throw when retryFrom was null, because the template coalesced it to '' and handed
    // DatePipe the string "T00:00:00".
    fixture.componentInstance['blockingDates'].set(['2026-09-07']);
    fixture.componentInstance['retryFrom'].set(null);
    expect(() => fixture.detectChanges()).not.toThrow();

    const alert = fixture.nativeElement.querySelector('[data-testid="schedule-blocked-alert"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('1 class in this range has bookings.');
    expect(fixture.nativeElement.querySelector('[data-testid="apply-from-retry"]')).toBeNull();
  });

  it('leaves retryFrom null when the server sends a date it cannot parse', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp['onPatchError']({ error: { detail: 'RANGE_HAS_BOOKINGS: not-a-date' } });
    fixture.detectChanges();

    expect(cmp['blockingDates']()).toEqual(['not-a-date']);
    expect(cmp['retryFrom']()).toBeNull(); // never the string "NaN-aN-aN"
    expect(fixture.nativeElement.querySelector('[data-testid="schedule-blocked-alert"]')).toBeTruthy();
  });
});

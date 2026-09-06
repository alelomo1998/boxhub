import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ClassDetailSheet } from './class-detail.sheet';
import type { SessionDetail } from '../booking/booking.service';

const DETAIL: SessionDetail = {
  id: 's1', name: 'Metcon', startAt: '2026-09-07T06:00:00Z', durationMin: 45, capacity: 12,
  imagePath: null, programmingStatus: 'PUBLISHED',
  coach: { name: 'Sam Coach', avatarPath: null },
  active: [{ membershipId: 'm1', name: 'Anna', avatarPath: null, status: 'CHECKED_IN' }],
  queue: [{ membershipId: 'm2', name: 'Ben', avatarPath: null, status: 'WAITLISTED' }],
};

describe('ClassDetailSheet', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [ClassDetailSheet],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(ClassDetailSheet);
  }

  afterEach(() => http.verify());

  it('fetches the detail when opened and renders the name, time and counts', () => {
    const fixture = setup();
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne('/api/box/sessions/s1/detail').flush(DETAIL);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Metcon');
    expect(text).toContain('1/12');
    expect(text).toContain('1 waitlisted');
  });

  it('does not fetch while open is false', () => {
    const fixture = setup();
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    http.expectNone('/api/box/sessions/s1/detail');
    expect(fixture.componentInstance['state']()).toBe('loading'); // never moved off the initial state
  });

  it('changing sessionId while open re-fetches instead of keeping the first class\'s data', () => {
    const fixture = setup();
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/s1/detail').flush(DETAIL);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Metcon');

    const OTHER: SessionDetail = { ...DETAIL, id: 's2', name: 'Olympic Lifting', active: [], queue: [] };
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.detectChanges();

    // Assert DURING the loading window, before the flush: the sheet title reads detail()?.name,
    // so a load that leaves the previous detail in place shows the WRONG CLASS's name in the
    // header while the body says "Loading". Flushing first hides this entirely.
    expect(fixture.nativeElement.textContent).not.toContain('Metcon');

    http.expectOne('/api/box/sessions/s2/detail').flush(OTHER);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olympic Lifting');
    expect(text).not.toContain('Metcon');
  });

  it('requires confirmation before patchSession fires, then emits changed and closed on success', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    let changedCount = 0;
    let closedCount = 0;
    cmp.changed.subscribe(() => changedCount++);
    cmp.closed.subscribe(() => closedCount++);

    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/s1/detail').flush(DETAIL);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="admin-class-detail-cancel-open"]').click();
    fixture.detectChanges();
    http.expectNone('/api/box/sessions/s1'); // opening the flow alone must not cancel anything

    fixture.nativeElement.querySelector('[data-testid="admin-class-detail-cancel-confirm-btn"]').click();
    fixture.detectChanges();
    const req = http.expectOne('/api/box/sessions/s1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'CANCELLED' });
    req.flush({});
    fixture.detectChanges();

    expect(changedCount).toBe(1);
    expect(closedCount).toBe(1);
  });

  it('renders the error state and its retry re-requests the detail', () => {
    const fixture = setup();
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/s1/detail').flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Couldn't load this class.");

    fixture.nativeElement.querySelector('.retry').click();
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/s1/detail').flush(DETAIL);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Metcon');
  });
});

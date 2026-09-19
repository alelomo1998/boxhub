import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { ClassDetailPage } from './class-detail.page';
import { ShellChromeService } from '../../core/shell-chrome.service';
import type { SessionDetail, GridEntry } from '../booking/booking.service';
import { bookingReason } from '../booking/booking-reason';

function entry(membershipId: string, name: string, overrides: Partial<GridEntry> = {}): GridEntry {
  return { membershipId, name, avatarPath: null, status: 'BOOKED', me: false, ...overrides };
}

function detail(startAt: string, overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: 's1', name: 'Burn It', startAt, durationMin: 60, capacity: 10, imagePath: null,
    programmingStatus: 'PUBLISHED', coach: null, active: [], queue: [], ...overrides,
  };
}

describe('ClassDetailPage', () => {
  let http: HttpTestingController;

  function setup(id = 's1') {
    TestBed.configureTestingModule({
      imports: [ClassDetailPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClassDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  function flush(fixture: any, d: SessionDetail) {
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(d);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('offers Book when not mine and upcoming with room; calls booking.book then reloads', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon, { active: [entry('m1', 'Sam')] }));

    const btn = fixture.nativeElement.querySelector('[data-testid="detail-action"]');
    expect(btn.textContent).toContain('Book');
    btn.click();

    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail')
      .flush(detail(soon, { active: [entry('m1', 'Sam'), entry('me1', 'Ada', { me: true })] }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.badge').textContent).toContain('Booked');
  });

  it('offers Leave waitlist with position when me is in queue', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon, {
      capacity: 1,
      active: [entry('m1', 'Sam')],
      queue: [entry('q1', 'Other'), entry('me1', 'Ada', { me: true })],
    }));

    const btn = fixture.nativeElement.querySelector('[data-testid="detail-action"]');
    expect(btn.textContent).toContain('Leave waitlist');
    expect(fixture.nativeElement.querySelector('.badge').textContent).toContain('Waitlist #2');
  });

  it('checked-in me: no action button, reads attended', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon, { active: [entry('me1', 'Ada', { me: true, status: 'CHECKED_IN' })] }));

    expect(fixture.nativeElement.querySelector('[data-testid="detail-action"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.statetext').textContent).toContain("You're in");
  });

  it('past day: no action button, reads Finished', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0);
    const fixture = setup();
    flush(fixture, detail(yesterday.toISOString()));

    expect(fixture.nativeElement.querySelector('[data-testid="detail-action"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.statetext').textContent).toContain('Finished');
  });

  it('a failed action renders bookingReason copy (banner + detail-error)', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon));

    fixture.nativeElement.querySelector('[data-testid="detail-action"]').click();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
      .flush({ detail: 'ENTRIES_PER_WEEK' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const reason = bookingReason('ENTRIES_PER_WEEK');
    const banner = fixture.nativeElement.querySelector('bh-banner .alert.danger');
    expect(banner.textContent).toContain(reason);
    const inline = fixture.nativeElement.querySelector('[data-testid="detail-error"]');
    expect(inline.textContent).toContain(reason);
  });

  it("sets ShellChromeService.detailTitle to the class name once loaded, and clears it on destroy", () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    const chrome = TestBed.inject(ShellChromeService);
    flush(fixture, detail(soon, { name: 'Burn It' }));

    expect(chrome.detailTitle()).toBe('Burn It');
    fixture.destroy();
    expect(chrome.detailTitle()).toBeNull();
  });

  it('a load error keeps a way back to Book and a retry', () => {
    const fixture = setup();
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail')
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const back = fixture.nativeElement.querySelector('.backlink');
    expect(back).not.toBeNull();
    expect(back.getAttribute('href')).toBe('/athlete/book');
    const retry = fixture.nativeElement.querySelector('[data-testid="detail-retry"]');
    expect(retry).not.toBeNull();
    retry.click();
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(new Date().toISOString()));
    fixture.detectChanges();
  });

  it('a second click while busy does not call book twice', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon));

    const btn = fixture.nativeElement.querySelector('[data-testid="detail-action"]');
    btn.click();
    btn.click();

    const reqs = http.match(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book');
    expect(reqs.length).toBe(1);
    reqs[0].flush({ bookingId: 'b1', status: 'BOOKED', position: null });
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon));
    fixture.detectChanges();
  });

  it('Cancel opens the confirm sheet and calls booking.cancel only on confirm', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixture = setup();
    flush(fixture, detail(soon, { active: [entry('me1', 'Ada', { me: true, status: 'BOOKED' })] }));

    fixture.nativeElement.querySelector('[data-testid="detail-action"]').click();
    fixture.detectChanges();
    http.expectNone(r => r.method === 'DELETE');

    fixture.nativeElement.querySelector('[data-testid="confirm-execute"]').click();
    http.expectOne(r => r.method === 'DELETE' && r.url === '/api/box/sessions/s1/booking').flush(null);
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon));
    fixture.detectChanges();
  });
});

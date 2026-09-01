import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';
import { Home } from './home.service';
import { MyAnnouncement } from '../messaging/messaging.models';

const STATS = { checkinsThisWeek: 3, streakWeeks: 2, planDaysLeft: null, lastPr: null };

/** unread defaults to 0 — most specs care about the announcement body, not the count. */
function homeWith(announcement: Home['announcement'], unread = 0): Home {
  return { nextBooking: null, announcement, stats: STATS, planExpiringSoon: false, announcementUnread: unread };
}

const HOME_ANNOUNCEMENT: Home['announcement'] = {
  body: 'Holiday hours: closed Dec 25 and Jan 1.', updatedAt: '2026-08-30T09:00:00Z', sentByName: 'Coach Sam',
};

const ANN_UNREAD_1: MyAnnouncement = {
  id: 'a1', body: 'Holiday hours: closed Dec 25 and Jan 1. Everything else runs as normal, ' +
    'including the 6am class both days either side.', sentAt: '2026-08-30T09:00:00Z',
  read: false, sentByName: 'Coach Sam',
};
const ANN_UNREAD_2: MyAnnouncement = {
  id: 'a2', body: 'New mobility class Tuesdays at 7pm.', sentAt: '2026-08-20T09:00:00Z',
  read: false, sentByName: null,
};
const ANN_READ: MyAnnouncement = {
  id: 'a3', body: 'Welcome to the box!', sentAt: '2026-08-01T09:00:00Z',
  read: true, sentByName: 'Ada',
};

describe('HomePage', () => {
  let http: HttpTestingController;

  /** Boots the page and flushes only the two requests home load actually makes — home and
   *  today's class. The announcements list is deliberately NOT flushed here: it must not be
   *  requested until the sheet is opened. */
  function setup(opts: { announcement?: Home['announcement']; unread?: number } = {}) {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    http.expectOne('/api/box/home').flush(homeWith(opts.announcement ?? null, opts.unread ?? 0));
    http.expectOne('/api/box/my-class-today').flush({ session: null, booked: false, items: [], otherToday: [] });
    fixture.detectChanges();
    return fixture;
  }

  /** Taps the card and flushes the resulting announcements-list request. */
  function openSheet(fixture: ReturnType<typeof setup>, rows: MyAnnouncement[]) {
    fixture.nativeElement.querySelector('[data-testid="home-announcements-card"]').click();
    fixture.detectChanges();
    http.expectOne('/api/box/me/announcements').flush(rows);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('renders the sender name on the card', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT });
    const card = fixture.nativeElement.querySelector('[data-testid="home-announcements-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Coach Sam');
    expect(card.textContent).toContain('Announcements');
  });

  it('falls back to "Your gym" when sentByName is null, never printing "null"', () => {
    const fixture = setup({ announcement: { ...HOME_ANNOUNCEMENT, sentByName: null } });
    const card = fixture.nativeElement.querySelector('[data-testid="home-announcements-card"]');
    expect(card.textContent).toContain('Your gym');
    expect(card.textContent).not.toContain('null');
  });

  it('renders the badge from the home response\'s announcementUnread, not the list', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    const badge = fixture.nativeElement.querySelector('[data-testid="home-announcements-unread"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('1');
  });

  it('hides the badge when announcementUnread is 0', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 0 });
    expect(fixture.nativeElement.querySelector('[data-testid="home-announcements-unread"]')).toBeNull();
  });

  it('does not request the announcements list on page load', () => {
    setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    const pending = http.match(r => r.url === '/api/box/me/announcements');
    expect(pending.length).toBe(0);
  });

  it('opening the sheet issues the announcements request exactly once', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    fixture.nativeElement.querySelector('[data-testid="home-announcements-card"]').click();
    fixture.detectChanges();
    // expectOne throws if more than one request matches — this is the "exactly once" assertion.
    http.expectOne('/api/box/me/announcements').flush([ANN_UNREAD_1]);
    fixture.detectChanges();
    http.expectOne('/api/box/me/announcements/a1/read').flush(null);
  });

  it('tapping the card opens the sheet showing the fetched list', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    openSheet(fixture, [ANN_UNREAD_1, ANN_READ]);
    http.expectOne('/api/box/me/announcements/a1/read').flush(null);
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[data-testid="announcements-sheet"]');
    expect(sheet).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-row-a1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-row-a3"]')).not.toBeNull();
  });

  it('renders rows newest first with a two-line preview and an unread mark', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    openSheet(fixture, [ANN_UNREAD_1, ANN_READ]);

    // Checked before the mark-read call resolves — it flips a1's own unread mark, which is
    // exactly the behaviour the next spec covers.
    const rows = fixture.nativeElement.querySelectorAll('.ann-row');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('data-testid')).toBe('announcement-row-a1');
    expect(rows[1].getAttribute('data-testid')).toBe('announcement-row-a3');

    const preview = rows[0].querySelector('.ann-row-preview');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Holiday hours');

    expect(rows[0].querySelector('[data-testid="announcement-unread-a1"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="announcement-unread-a3"]')).toBeNull();

    http.expectOne('/api/box/me/announcements/a1/read').flush(null);
    fixture.detectChanges();
  });

  it('opening the list marks exactly the unread ones read, one request per unread id, none ' +
     'for already-read ones, and clears the badge with no second home request', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 2 });
    openSheet(fixture, [ANN_UNREAD_1, ANN_UNREAD_2, ANN_READ]);

    const req1 = http.expectOne('/api/box/me/announcements/a1/read');
    const req2 = http.expectOne('/api/box/me/announcements/a2/read');
    expect(req1.request.method).toBe('POST');
    expect(req2.request.method).toBe('POST');
    http.verify(); // no request for a3 (already read) — throws if one is pending
    req1.flush(null);
    req2.flush(null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="announcement-unread-a1"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-unread-a2"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="home-announcements-unread"]')).toBeNull();
    // The badge cleared locally from the mark-read pass — never by re-requesting home.
    http.expectNone('/api/box/home');
  });

  it('makes no mark-read request at all when nothing is unread', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 0 });
    openSheet(fixture, [ANN_READ]);
    const pendingReads = http.match(r => r.url.endsWith('/read'));
    expect(pendingReads.length).toBe(0);
  });

  it('a failed mark-read leaves the list rendered', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 1 });
    openSheet(fixture, [ANN_UNREAD_1]);
    http.expectOne('/api/box/me/announcements/a1/read')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-row-a1"]')).not.toBeNull();
  });

  it('tapping a row shows the full body and back returns to the list', () => {
    const fixture = setup({ announcement: HOME_ANNOUNCEMENT, unread: 0 });
    openSheet(fixture, [ANN_READ]);

    fixture.nativeElement.querySelector('[data-testid="announcement-row-a3"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-detail-back"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Welcome to the box!');
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-row-a3"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="announcement-detail-back"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-row-a3"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-detail-back"]')).toBeNull();
  });

  it('shows a loading state, then an error with retry, then the list on retry', () => {
    const fixture = setup({ announcement: { body: 'x', updatedAt: '2026-08-01T00:00:00Z', sentByName: null } });

    // The list fetch starts only once the sheet is opened, and must show the loading state
    // while it is in flight.
    fixture.nativeElement.querySelector('[data-testid="home-announcements-card"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="announcements-sheet"]').textContent)
      .toContain('Loading');

    http.expectOne('/api/box/me/announcements').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[data-testid="announcements-sheet"]');
    expect(sheet.textContent).toContain("Couldn't load");

    sheet.querySelector('.retry').click();
    fixture.detectChanges();
    http.expectOne('/api/box/me/announcements').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="announcements-empty"]')).not.toBeNull();
  });
});

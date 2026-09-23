import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { ClassDetailPage } from './class-detail.page';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { BookStore } from '../booking/book.store';
import type { SessionDetail, GridEntry, SessionView } from '../booking/booking.service';
import type { SessionItem, Wod } from '../programming/programming.service';
import { bookingReason } from '../booking/booking-reason';

function entry(membershipId: string, name: string, overrides: Partial<GridEntry> = {}): GridEntry {
  return { membershipId, name, avatarPath: null, status: 'BOOKED', me: false, ...overrides };
}

function wod(title: string, overrides: Partial<Wod> = {}): Wod {
  return {
    id: title, title, wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: null,
    timing: { rounds: 1, segments: [] }, library: false, teamSize: 1, teamShare: null,
    scoreType: 'TIME', timeCapSeconds: null, bodyText: '', blocks: { blocks: [] },
    scalingNotes: null, benchmarkTemplateId: null, ...overrides,
  };
}

function item(id: string, title: string, overrides: Partial<SessionItem> = {}): SessionItem {
  return { id, wodId: title, wod: wod(title), sortOrder: 0, scoreable: true, scoreType: 'TIME', myScoreLogged: false, ...overrides };
}

function detail(startAt: string, overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: 's1', name: 'Burn It', startAt, durationMin: 60, capacity: 10, imagePath: null,
    programmingStatus: 'PUBLISHED', coach: null, active: [], queue: [], ...overrides,
  };
}

/** A Book-cache row shaped enough to seed the hero — see class-detail.page.ts's HeroSeed comment
 *  for why this is a SessionView, not a SessionDetail. */
function bookRow(id: string, startAt: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    id, name: 'Burn It', startAt, durationMin: 60, capacity: 10, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount: 3, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: '/img/burn-it.jpg', coachAvatarPath: null,
    people: [], ...overrides,
  };
}

describe('ClassDetailPage', () => {
  let http: HttpTestingController;

  // resetTestingModule: BookStore is root-provided, so without a reset each test would inherit
  // whatever the PREVIOUS test's BookStore was left holding — including a session literally
  // called 's1' (this file's fixture id), which would spuriously seed a hero nobody asked for.
  function setup(id = 's1', bookRows: SessionView[] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ClassDetailPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    if (bookRows.length) TestBed.inject(BookStore).sessions.set(bookRows);
    const fixture = TestBed.createComponent(ClassDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  // A PUBLISHED detail now fires a second request (the workout peek card's items, spec §5.5) --
  // `items` defaults to [] so every pre-existing caller that doesn't care about the peek card
  // still only has to flush this one helper, and gets an absent card (empty array) for free.
  function flush(fixture: any, d: SessionDetail, items: SessionItem[] = []) {
    http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(d);
    if (d.programmingStatus === 'PUBLISHED') {
      http.expectOne(r => r.url === '/api/box/sessions/s1/items').flush(items);
    }
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

  // Rule 4 of this milestone: booking outcomes live in the bottom banner and NOWHERE else -- only
  // a failed LOAD keeps its own stateline. This screen used to render the same message a second
  // time under the action button, which was both a rule violation and, with bh-alert already
  // deriving role="alert" for a danger tone, a double screen-reader announcement.
  it('a failed action reports the reason in the banner ONLY, never under the button', () => {
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
    expect(fixture.nativeElement.querySelector('[data-testid="detail-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.inlineerr')).toBeNull();
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

  describe('workout peek card (spec §5.5, m17a-workout-entry.html column C)', () => {
    it('shows the peek card when programmingStatus is PUBLISHED and items resolve', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon, { programmingStatus: 'PUBLISHED' }), [item('i1', 'Fran')]);

      const row = fixture.nativeElement.querySelector('[data-testid="detail-workout-row"]');
      expect(row).not.toBeNull();
      expect(row.getAttribute('href')).toBe('/athlete/class/s1/workout');
    });

    it('hides the peek card when programmingStatus is DRAFT', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon, { programmingStatus: 'DRAFT' }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="detail-workout-row"]')).toBeNull();
    });

    it('does not request items when programmingStatus is DRAFT', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon, { programmingStatus: 'DRAFT' }));
      fixture.detectChanges();

      http.expectNone(r => r.url === '/api/box/sessions/s1/items');
    });

    it('renders the piece titles joined by a separator', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon), [item('i1', 'Fran'), item('i2', 'Chipper'), item('i3', 'Partner WOD')]);

      const names = fixture.nativeElement.querySelector('[data-testid="detail-workout-row"] .names');
      expect(names.textContent).toContain('Fran');
      expect(names.textContent).toContain('Chipper');
      expect(names.textContent).toContain('Partner WOD');
      expect(names.querySelectorAll('.sep').length).toBe(2);
    });

    it('shows "1 piece" for a single item and "N pieces" otherwise', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const one = setup();
      flush(one, detail(soon), [item('i1', 'Fran')]);
      expect(one.nativeElement.querySelector('[data-testid="detail-workout-row"] .cnt2').textContent).toContain('1 piece');

      const many = setup();
      flush(many, detail(soon), [item('i1', 'Fran'), item('i2', 'Chipper')]);
      expect(many.nativeElement.querySelector('[data-testid="detail-workout-row"] .cnt2').textContent).toContain('2 pieces');
    });

    it('stays absent when the items request fails, without putting the screen in its error state', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon));
      http.expectOne(r => r.url === '/api/box/sessions/s1/items')
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="detail-workout-row"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.stateline.err')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="detail-action"]')).not.toBeNull();
    });

    it('does not re-request items after a booking action', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon), [item('i1', 'Fran')]);

      fixture.nativeElement.querySelector('[data-testid="detail-action"]').click();
      http.expectOne(r => r.method === 'POST' && r.url === '/api/box/sessions/s1/book')
        .flush({ bookingId: 'b1', status: 'BOOKED', position: null });
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail').flush(detail(soon));
      fixture.detectChanges();

      http.expectNone(r => r.url === '/api/box/sessions/s1/items');
    });
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
    flush(fixture, detail(new Date().toISOString()));
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

  describe('roster cell opens a photo sheet instead of routing to the athlete profile (user-ruled 2026-09-20)', () => {
    it('a roster cell is a button, not a link to the athlete profile', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon, { active: [entry('m1', 'Sam')] }));

      const cell = fixture.nativeElement.querySelector('[data-testid="class-grid"] .cell');
      expect(cell.tagName).toBe('BUTTON');
      expect(cell.hasAttribute('href')).toBe(false);
    });

    it("tapping a roster cell opens the photo sheet with that person's name", () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon, { active: [entry('m1', 'Sam')] }));

      fixture.nativeElement.querySelector('[data-testid="class-grid"] .cell').click();
      fixture.detectChanges();

      const sheet = fixture.nativeElement.querySelector('[data-testid="roster-photo-sheet"]');
      expect(sheet).not.toBeNull();
      expect(sheet.textContent).toContain('Sam');
    });

    it("the queue grid's cells carry the same accessible name treatment as the going grid", () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon, {
        capacity: 1,
        active: [entry('m1', 'Sam', { status: 'CHECKED_IN' })],
        queue: [entry('q1', 'Other')],
      }));

      const activeLabel = fixture.nativeElement.querySelector('[data-testid="class-grid"] .cell').getAttribute('aria-label');
      const queueLabel = fixture.nativeElement.querySelector('.grid.dim .cell').getAttribute('aria-label');
      expect(activeLabel).toContain('Sam');
      expect(activeLabel).toContain('checked in');
      expect(activeLabel).toContain('show photo');
      expect(queueLabel).toContain('Other');
      expect(queueLabel).toContain('show photo');
    });

    it('no cell anywhere on the screen routes to /athlete/profile', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup();
      flush(fixture, detail(soon, {
        active: [entry('m1', 'Sam')],
        queue: [entry('q1', 'Other')],
      }));

      expect(fixture.nativeElement.querySelectorAll('a[href*="/athlete/profile"]').length).toBe(0);
    });
  });

  describe('hero seed (M17a Task 12b)', () => {
    it('paints the hero from a BookStore cache hit before the fetch resolves, no loading text', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup('s1', [bookRow('s1', soon, { name: 'Burn It', imagePath: '/img/burn-it.jpg' })]);

      // Before any flush: the hero is already there, driven by the seed.
      expect(fixture.nativeElement.querySelector('.hero img.ph').src).toContain('/img/burn-it.jpg');
      expect(fixture.nativeElement.querySelector('.stateline')).toBeTruthy(); // below-hero area still loading
      expect(fixture.nativeElement.querySelector('.badge')).toBeNull(); // no athleteState yet — no guess
      // The action bar's height is reserved but empty — no guessed action from the seed.
      expect(fixture.nativeElement.querySelector('.actionbar')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="detail-action"]')).toBeNull();
      const chrome = TestBed.inject(ShellChromeService);
      expect(chrome.detailTitle()).toBe('Burn It');

      // active: one entry, so the "below-hero" area resolves to the grid, not the OTHER (empty
      // active) stateline — keeps this assertion about the LOADING text specifically.
      flush(fixture, detail(soon, { name: 'Burn It', imagePath: '/img/burn-it.jpg', active: [entry('m1', 'Sam')] }));

      // Once the real fetch lands, the below-hero content and the action bar fill in — same hero.
      expect(fixture.nativeElement.querySelector('.stateline')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hero img.ph').src).toContain('/img/burn-it.jpg');
    });

    it('applies the view-transition-name to the seeded hero, same as the real one', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup('s1', [bookRow('s1', soon)]);

      const shot = fixture.nativeElement.querySelector('.hero .shot');
      expect(shot.style.viewTransitionName).toBe('card-photo-s1');
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail'); // the fetch still fires; unasserted here
    });

    it('a cold load / deep link with nothing cached falls back to exactly today\'s behaviour', () => {
      const fixture = setup('s1', []); // no BookStore rows — the ordinary case for every existing test

      expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
      expect(fixture.nativeElement.querySelector('.stateline').textContent).toContain('Loading class');
      expect(fixture.nativeElement.querySelector('.actionbar')).toBeNull();
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail');
    });

    it('ignores a BookStore row for a DIFFERENT session id', () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const fixture = setup('s1', [bookRow('other-session', soon)]);

      expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
      expect(fixture.nativeElement.querySelector('.stateline').textContent).toContain('Loading class');
      http.expectOne(r => r.url === '/api/box/sessions/s1/detail');
    });
  });
});

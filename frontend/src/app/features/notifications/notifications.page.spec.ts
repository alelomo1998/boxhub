import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { NotificationsPage } from './notifications.page';
import { NotificationService } from './notification.service';
import { FeedPage, FeedRow } from './notification.models';
import { MessagingService } from '../messaging/messaging.service';
import { MyAnnouncement } from '../messaging/messaging.models';

/** `hh` is a local hour, offset from "now" by whole days — keeps the day-grouping fixtures
 *  correct regardless of when the suite runs, same trick messaging's announcements spec uses. */
function todayAt(hh: number): string {
  const d = new Date(); d.setHours(hh, 0, 0, 0); return d.toISOString();
}
function yesterdayAt(hh: number): string {
  const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(hh, 0, 0, 0); return d.toISOString();
}
function daysAgoAt(n: number, hh: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hh, 0, 0, 0); return d.toISOString();
}

function feedPage(rows: FeedRow[], nextCursor: string | null = null): FeedPage {
  return { rows, nextCursor };
}

const ROW_TODAY_UNREAD: FeedRow = {
  id: 'r1', type: 'CLASS_CANCELLED', params: { className: 'Barbell Club' },
  link: '/athlete/class/c1', createdAt: todayAt(9), read: false,
};
const ROW_TODAY_READ: FeedRow = {
  id: 'r2', type: 'WAITLIST_PROMOTED', params: { className: 'Olympic Lifting' },
  link: '/athlete/book', createdAt: todayAt(8), read: true,
};
const ROW_YESTERDAY: FeedRow = {
  id: 'r3', type: 'NEW_MEMBER_JOINED', params: { memberName: 'Ada' },
  link: '/admin/members', createdAt: yesterdayAt(10), read: true,
};
const ROW_OLD: FeedRow = {
  id: 'r4', type: 'PAYMENT_FAILED', params: {},
  link: '/athlete/membership', createdAt: daysAgoAt(10, 9), read: false,
};
/** The one type with `link: null` — NEW_ANNOUNCEMENT opens the detail sheet in place. */
const ROW_ANNOUNCEMENT: FeedRow = {
  id: 'r5', type: 'NEW_ANNOUNCEMENT', params: { bodyPreview: 'Short preview', announcementId: 'ann1' },
  link: null, createdAt: todayAt(7), read: false,
};
/** A type the server can emit that this build's NOTIFICATION_COPY doesn't (yet) know about. */
const ROW_UNKNOWN: FeedRow = {
  id: 'r6', type: 'SOME_UNKNOWN_TYPE', params: {}, link: '/athlete/home', createdAt: todayAt(6), read: true,
};

describe('NotificationsPage', () => {
  let svc: jasmine.SpyObj<NotificationService>;
  let messaging: jasmine.SpyObj<MessagingService>;
  let router: Router;

  function setup() {
    svc = jasmine.createSpyObj<NotificationService>('NotificationService',
      ['list', 'markRead', 'markAllRead', 'refreshUnread']);
    // A real signal, not a spy — the shell's bell already populated it before this page mounts.
    (svc as unknown as { unread: WritableSignal<number> }).unread = signal(0);
    svc.markRead.and.returnValue(of(undefined));
    svc.markAllRead.and.returnValue(of(undefined));

    messaging = jasmine.createSpyObj<MessagingService>('MessagingService', ['myAnnouncements']);
    messaging.myAnnouncements.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: svc },
        { provide: MessagingService, useValue: messaging },
      ],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  }

  function create() {
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('groups rows by day, with Today, Yesterday and an absolute date label', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD, ROW_TODAY_READ, ROW_YESTERDAY, ROW_OLD])));
    const fixture = create();

    const headers = Array.from(fixture.nativeElement.querySelectorAll('.day-header')) as HTMLElement[];
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain('Today');
    expect(headers[1].textContent).toContain('Yesterday');
    expect(headers[2].textContent).not.toContain('Today');
    expect(headers[2].textContent).not.toContain('Yesterday');
  });

  it('shows the empty state on an empty feed', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([])));
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[data-testid="notifications-empty"]')).not.toBeNull();
  });

  it('shows an error state, and Try again actually refetches', () => {
    setup();
    const first$ = new Subject<FeedPage>();
    svc.list.and.returnValue(first$);
    const fixture = create();
    first$.error('boom');
    fixture.detectChanges();

    const err = fixture.nativeElement.querySelector('.stateline.err');
    expect(err).not.toBeNull();
    expect(svc.list.calls.count()).toBe(1);

    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ])));
    err.querySelector('.retry').click();
    fixture.detectChanges();

    expect(svc.list.calls.count()).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="notification-row-r2"]')).not.toBeNull();
  });

  it('carries the unread marker on unread rows only', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD, ROW_TODAY_READ])));
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[data-testid="notification-unread-r1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="notification-unread-r2"]')).toBeNull();
  });

  it('Mark all read is a no-op when nothing is unread — the handler guard, not just [disabled]', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ])));
    const fixture = create();
    // Calls the handler directly: a native `disabled` attribute already blocks a real click, so
    // that alone would prove nothing about the guard this test targets.
    (fixture.componentInstance as unknown as { onMarkAllRead: () => void }).onMarkAllRead();
    expect(svc.markAllRead).not.toHaveBeenCalled();
  });

  it('tapping a linked row marks it read and navigates, without opening the sheet', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD])));
    const fixture = create();

    fixture.nativeElement.querySelector('[data-testid="notification-row-r1"]').click();
    fixture.detectChanges();

    expect(svc.markRead).toHaveBeenCalledWith('r1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/athlete/class/c1');
    expect(messaging.myAnnouncements).not.toHaveBeenCalled();
  });

  it('tapping a link-less row opens the announcement sheet and does not navigate', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_ANNOUNCEMENT])));
    const ann: MyAnnouncement = { id: 'ann1', body: 'The full announcement body.', sentAt: todayAt(7), read: false, sentByName: 'Coach' };
    messaging.myAnnouncements.and.returnValue(of([ann]));
    const fixture = create();

    fixture.nativeElement.querySelector('[data-testid="notification-row-r5"]').click();
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    const sheet = fixture.nativeElement.querySelector('[data-testid="notification-detail-sheet"]');
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain('The full announcement body.');
  });

  it('falls back to bodyPreview when the announcement id is not in myAnnouncements()', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_ANNOUNCEMENT])));
    messaging.myAnnouncements.and.returnValue(of([])); // ann1 not present — e.g. outside the window
    const fixture = create();

    fixture.nativeElement.querySelector('[data-testid="notification-row-r5"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="notification-detail-sheet"]');
    expect(sheet.textContent).toContain('Short preview');
  });

  it('hides Load older when there is no next page', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ], null)));
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[data-testid="notifications-load-more"]')).toBeNull();
  });

  it('shows Load older when nextCursor is set, and passes it through on click', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ], 'cursor-2')));
    const fixture = create();
    const btn = fixture.nativeElement.querySelector('[data-testid="notifications-load-more"]');
    expect(btn).not.toBeNull();

    svc.list.and.returnValue(of(feedPage([ROW_YESTERDAY], null)));
    btn.click();
    fixture.detectChanges();

    expect(svc.list).toHaveBeenCalledWith('cursor-2');
    expect(fixture.nativeElement.querySelector('[data-testid="notifications-load-more"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="notification-row-r3"]')).not.toBeNull();
  });

  it('renders a row whose type is missing from NOTIFICATION_COPY without throwing or leaking the enum', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_UNKNOWN])));
    let fixture!: ReturnType<typeof create>;
    expect(() => { fixture = create(); }).not.toThrow();

    const rows = fixture.nativeElement.querySelectorAll('.row');
    expect(rows.length).toBe(1);
    // A type the server knows and this build does not must not put a raw enum in front of a user.
    expect(rows[0].textContent).not.toContain('SOME_UNKNOWN_TYPE');
    expect(rows[0].querySelector('.r-eyebrow').textContent.trim()).toBe('Update');
  });

  it('says so when markRead fails, rather than only reverting the dot', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD])));
    svc.markRead.and.returnValue(throwError(() => new Error('offline')));
    const fixture = create();

    expect(fixture.nativeElement.querySelector('bh-alert')).toBeNull();
    fixture.nativeElement.querySelector('.row').click();
    fixture.detectChanges();

    // A row that silently reappears as unread later reads as a bug, not as a failure.
    const alert = fixture.nativeElement.querySelector('bh-alert');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('mark that as read');
  });

  it('says so when Load older fails, instead of just stopping the spinner', () => {
    setup();
    svc.list.and.returnValues(of(feedPage([ROW_TODAY_READ], 'cur1')), throwError(() => new Error('offline')));
    const fixture = create();

    expect(fixture.nativeElement.querySelector('bh-alert')).toBeNull();
    fixture.nativeElement.querySelector('[data-testid="notifications-load-more"]').click();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('bh-alert');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('load older');
  });

  it('says so when Mark all read fails, instead of leaving rows silently unread', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD])));
    svc.unread.set(1);
    svc.markAllRead.and.returnValue(throwError(() => new Error('offline')));
    const fixture = create();

    expect(fixture.nativeElement.querySelector('bh-alert')).toBeNull();
    fixture.nativeElement.querySelector('[data-testid="notifications-mark-all"]').click();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('bh-alert');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('mark everything as read');
  });

  it('announces a count, and never makes the row list itself a live region', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD, ROW_TODAY_READ])));
    const fixture = create();

    // A live region wrapping the rows would announce all of them on load — the loud twin of the
    // silent failure this screen already fixed.
    expect(fixture.nativeElement.querySelector('.results')?.getAttribute('aria-live')).toBeNull();
    const live = fixture.nativeElement.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live.textContent).toContain('2');
    expect(live.querySelectorAll('.row').length).toBe(0);
  });

  it('exposes unread state to assistive tech, not only as a dot and a heavier title', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD, ROW_TODAY_READ])));
    const fixture = create();

    const rows = fixture.nativeElement.querySelectorAll('.row');
    expect(rows.length).toBe(2);
    // The dot is aria-hidden and font-weight is invisible to a screen reader, so without this
    // an unread row and a read one are announced identically.
    expect(rows[0].textContent).toContain('Unread');
    expect(rows[1].textContent).not.toContain('Unread');
  });

  it('puts the heading and Mark all read on one header row, with no settings link on the page', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ])));
    const fixture = create();

    const header = fixture.nativeElement.querySelector('.page-header');
    expect(header.querySelector('h1')).not.toBeNull();
    expect(header.querySelector('[data-testid="notifications-mark-all"]')).not.toBeNull();
    // Notification settings is reached from the profile sheet, never from a gear on this page.
    // Asserting only "no settings link" would pass just as well on a page that never had one, so
    // pin the header's actual contents: exactly the heading and the one action, nothing beside them.
    expect(header.children.length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('a[href$="settings"]').length).toBe(0);
  });

  it('keeps the page header out of the scroller, so it needs no measured offset', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_READ])));
    const fixture = create();

    const scroll = fixture.nativeElement.querySelector('.scroll');
    expect(scroll.querySelector('.page-header')).toBeNull();
    expect(scroll.querySelector('.results')).not.toBeNull();
  });

  it('gives each day header its own containing block instead of sharing .results with every row', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD, ROW_TODAY_READ, ROW_YESTERDAY, ROW_OLD])));
    const fixture = create();

    const headers = Array.from(fixture.nativeElement.querySelectorAll('.day-header')) as HTMLElement[];
    expect(headers.length).toBeGreaterThan(1);
    for (const h of headers) {
      expect(h.parentElement?.classList.contains('day-group')).toBeTrue();
    }
    // The regression: every day header AND every row were direct siblings under .results, one
    // shared containing block, so no header's sticky ever released and all of them pinned at
    // once. Neither may be a direct child of .results any more.
    expect(fixture.nativeElement.querySelector('.results > .day-header')).toBeNull();
    expect(fixture.nativeElement.querySelector('.results > .row')).toBeNull();
  });

  it('reverts the optimistic read flip and refreshes the unread count when markRead fails', () => {
    setup();
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD])));
    svc.markRead.and.returnValue(throwError(() => new Error('boom')));
    const fixture = create();

    fixture.nativeElement.querySelector('[data-testid="notification-row-r1"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="notification-unread-r1"]')).not.toBeNull();
    expect(svc.refreshUnread).toHaveBeenCalled();
  });

  it('mark-all-read flips rows already loaded in place and keeps every already-loaded page', () => {
    setup();
    svc.unread.set(1);
    svc.list.and.returnValue(of(feedPage([ROW_TODAY_UNREAD], 'cursor-2')));
    const fixture = create();

    svc.list.and.returnValue(of(feedPage([ROW_YESTERDAY], null)));
    fixture.nativeElement.querySelector('[data-testid="notifications-load-more"]').click();
    fixture.detectChanges();
    expect(svc.list.calls.count()).toBe(2);

    const componentRows = (fixture.componentInstance as unknown as { rows: () => FeedRow[] }).rows;
    expect(componentRows().length).toBe(2);

    (fixture.componentInstance as unknown as { onMarkAllRead: () => void }).onMarkAllRead();
    fixture.detectChanges();

    expect(svc.list.calls.count()).toBe(2); // no refetch — load() was never called again
    expect(componentRows().length).toBe(2);
    expect(componentRows().every(r => r.read)).toBeTrue();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('drops the badge to zero immediately on mark-all-read', () => {
    service.unread.set(5);
    service.markAllRead().subscribe();
    http.expectOne('/api/box/notifications/read-all').flush(null);
    // Not "eventually, on the next 60s poll" — the badge must not survive the action that cleared it.
    expect(service.unread()).toBe(0);
  });

  it('refreshes the badge after marking one read', () => {
    service.markRead('n1').subscribe();
    http.expectOne('/api/box/notifications/n1/read').flush(null);
    http.expectOne('/api/box/notifications/unread-count').flush({ count: 4 });
    expect(service.unread()).toBe(4);
  });

  it('omits the cursor param on the first page', () => {
    service.list().subscribe();
    const req = http.expectOne(r => r.url === '/api/box/notifications');
    expect(req.request.params.has('cursor')).toBeFalse();
    req.flush({ rows: [], nextCursor: null });
  });

  it('leaves the badge alone when the count request fails', () => {
    service.unread.set(3);
    service.refreshUnread();
    http.expectOne('/api/box/notifications/unread-count').error(new ProgressEvent('offline'));
    // A failed poll must not silently render "no notifications" — that is a lie, not a fallback.
    expect(service.unread()).toBe(3);
  });
});

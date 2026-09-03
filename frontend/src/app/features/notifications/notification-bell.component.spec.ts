import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationService } from './notification.service';

@Component({
  standalone: true,
  imports: [NotificationBellComponent],
  template: `<bh-notification-bell route="/athlete/notifications" testId="athlete-notifications-link" />`,
})
class HostComponent {}

describe('NotificationBellComponent', () => {
  let http: HttpTestingController;
  let notifications: NotificationService;

  function setup() {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    // ngOnInit's refreshUnread
    http.expectOne('/api/box/notifications/unread-count').flush({ count: 0 });
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders no badge at zero — the element must be absent, not empty', () => {
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('.badge')).toBeNull();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-notifications-link"]');
    expect(link.getAttribute('aria-label')).toBe('Notifications');
  });

  it('caps the badge label at 99+', () => {
    const fixture = setup();
    notifications.unread.set(100);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badge').textContent.trim()).toBe('99+');
  });

  it('announces the count to screen readers via the link aria-label, not the aria-hidden badge', () => {
    const fixture = setup();
    notifications.unread.set(5);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-notifications-link"]');
    expect(link.getAttribute('aria-label')).toBe('5 unread notifications');
    expect(link.getAttribute('aria-label')).not.toContain(':count:');
  });

  it('stops polling when the tab is hidden', fakeAsync(() => {
    const fixture = setup();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    tick(60000);
    http.expectNone('/api/box/notifications/unread-count');

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    tick(60000);
    http.expectOne('/api/box/notifications/unread-count').flush({ count: 0 });

    // Destroy before the final tick, mirroring the envelope's own teardown spec: proves the
    // interval is really gone rather than leaving a live one for discardPeriodicTasks to paper
    // over.
    fixture.destroy();
    tick(60000);
    expect(http.match('/api/box/notifications/unread-count').length).toBe(0);
    discardPeriodicTasks();
  }));

  it('refreshes once on init', () => {
    setup();
    // setup() already consumed the ngOnInit GET via expectOne — this asserts there was exactly
    // one: no second request is outstanding, and the flushed count actually reached the signal.
    expect(notifications.unread()).toBe(0);
    http.expectNone('/api/box/notifications/unread-count');
  });
});

import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessagesEnvelopeComponent } from './messages-envelope.component';
import { MessagingService } from './messaging.service';

@Component({
  standalone: true,
  imports: [MessagesEnvelopeComponent],
  template: `<bh-messages-envelope route="/athlete/messages" testId="athlete-messages-link" />`,
})
class HostComponent {}

describe('MessagesEnvelopeComponent', () => {
  let http: HttpTestingController;
  let messaging: MessagingService;

  function setup() {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    messaging = TestBed.inject(MessagingService);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    // ngOnInit's refreshUnread
    http.expectOne('/api/box/conversations').flush([]);
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders no badge when unread is zero', () => {
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('.badge')).toBeNull();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link.getAttribute('aria-label')).toBe('Messages');
  });

  it('renders the unread count in the badge and a singular aria-label for 1', () => {
    const fixture = setup();
    messaging.unread.set(1);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge.textContent.trim()).toBe('1');
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link.getAttribute('aria-label')).toBe('1 unread message');
  });

  it('renders a plural aria-label with no literal ":count:" for more than one unread', () => {
    const fixture = setup();
    messaging.unread.set(5);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link.getAttribute('aria-label')).toBe('5 unread messages');
    expect(link.getAttribute('aria-label')).not.toContain(':count:');
  });

  it('caps the badge label at 99+', () => {
    const fixture = setup();
    messaging.unread.set(140);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badge').textContent.trim()).toBe('99+');
  });

  it('polls refreshUnread every 60s and stops polling once destroyed', fakeAsync(() => {
    const fixture = setup();
    tick(60000);
    const poll1 = http.expectOne('/api/box/conversations');
    expect(poll1.request.method).toBe('GET');
    poll1.flush([]);
    tick(60000);
    http.expectOne('/api/box/conversations').flush([]);

    fixture.destroy();
    tick(60000);
    const outstanding = http.match('/api/box/conversations');
    expect(outstanding.length).toBe(0);
    discardPeriodicTasks();
  }));
});

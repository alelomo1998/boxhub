import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CoachShellPage } from './coach-shell.page';
import { MessagingService } from '../messaging/messaging.service';

describe('CoachShellPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CoachShellPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const messaging = TestBed.inject(MessagingService);
    const fixture = TestBed.createComponent(CoachShellPage);
    fixture.detectChanges();
    // The header envelope's own ngOnInit refresh.
    http.expectOne('/api/box/conversations').flush([]);
    return { fixture, http, messaging };
  }

  it('renders Security as a real anchor with an href, not a button — RouterLink only emits ' +
     'href on a/area hosts, so a bh-button host silently drops it', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('[data-testid="coach-security-link"]');
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/account');
  });

  it('gives the coach shell the same header unread envelope as the athlete shell, pointed at ' +
     'the coach inbox — not a second badge on the Inbox dock tab', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('[data-testid="coach-messages-link"]');
    expect(link).not.toBeNull();
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/coach/inbox');
  });

  it('shows the unread badge on the envelope once the coach has unread messages', () => {
    const { fixture, messaging } = setup();
    messaging.unread.set(4);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('[data-testid="coach-messages-link"] .badge');
    expect(badge.textContent.trim()).toBe('4');
  });
});

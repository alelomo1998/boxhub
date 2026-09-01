import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AthleteShellPage } from './athlete-shell.page';
import { MessagingService } from '../messaging/messaging.service';

describe('AthleteShellPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AthleteShellPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const messaging = TestBed.inject(MessagingService);
    const fixture = TestBed.createComponent(AthleteShellPage);
    fixture.detectChanges();
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ada', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    // The header envelope's own ngOnInit refresh.
    http.expectOne('/api/box/conversations').flush([]);
    return { fixture, http, messaging };
  }

  it('renders the header envelope pointed at the athlete messages screen, with the ' +
     'pre-existing testid kept intact', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link).not.toBeNull();
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/athlete/messages');
  });

  it('shows no badge and the "Messages" aria-label when there is nothing unread', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link.querySelector('.badge')).toBeNull();
    expect(link.getAttribute('aria-label')).toBe('Messages');
  });

  it('shows the unread badge and a plural aria-label with no literal ":count:" once there are ' +
     'unread messages', () => {
    const { fixture, messaging } = setup();
    messaging.unread.set(3);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="athlete-messages-link"]');
    expect(link.querySelector('.badge').textContent.trim()).toBe('3');
    expect(link.getAttribute('aria-label')).toBe('3 unread messages');
    expect(link.getAttribute('aria-label')).not.toContain(':count:');
  });
});

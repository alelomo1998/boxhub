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
    // The shell's own ngOnInit profile fetch, for the header avatar.
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Cody', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    // The header envelope's own ngOnInit refresh.
    http.expectOne('/api/box/conversations').flush([]);
    return { fixture, http, messaging };
  }

  it('opens the profile sheet with a Notifications row pointed at the coach settings route ' +
     '— Security and Log out moved into the sheet too (M29b Task 20)', () => {
    const { fixture } = setup();
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    expect(avatarBtn).not.toBeNull();
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Cody', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/coach/notifications/settings');
  });

  it('closes the profile sheet when the Notifications row is clicked, so it does not sit on ' +
     'top of the page it just navigated to', () => {
    const { fixture } = setup();
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Cody', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(true);
    const link: HTMLElement = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    link.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(false);
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

  it('keeps only Classes and Library on the coach dock — Benchmarks merged into the library and ' +
     'Types moved admin-only (M14c-b)', () => {
    const { fixture } = setup();
    const tabs = fixture.componentInstance.tabs;
    expect(tabs.map(t => t.link)).toEqual(['classes', 'wods']);
    expect(tabs[1].label).toBe('Library');
  });
});

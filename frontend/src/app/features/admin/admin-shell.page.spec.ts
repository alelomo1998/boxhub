import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminShellPage } from './admin-shell.page';
import { AuthService } from '../../core/auth/auth.service';
import { MessagingService } from '../messaging/messaging.service';

describe('AdminShellPage', () => {
  function setup(boxStatus: string) {
    TestBed.configureTestingModule({
      imports: [AdminShellPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'BOX_ADMIN', boxStatus }],
    });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'BOX_ADMIN' });
    const http = TestBed.inject(HttpTestingController);
    const messaging = TestBed.inject(MessagingService);
    const fixture = TestBed.createComponent(AdminShellPage);
    fixture.detectChanges();
    // The shell's own ngOnInit profile fetch, for the header avatar.
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ann', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    // The header envelope's own ngOnInit refresh.
    http.expectOne('/api/box/conversations').flush([]);
    return { fixture, http, messaging };
  }

  it('shows the pending banner for a PENDING box', () => {
    const { fixture } = setup('PENDING');
    const banner = fixture.nativeElement.querySelector('[data-testid="pending-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Waiting for approval');
  });

  it('hides the pending banner for an ACTIVE box', () => {
    const { fixture } = setup('ACTIVE');
    expect(fixture.nativeElement.querySelector('[data-testid="pending-banner"]')).toBeNull();
  });

  it('opens the profile sheet with a Notifications row pointed at the admin settings route ' +
     '— Security and the header Log out moved into the sheet too (M29b Task 20); the mobile ' +
     'More sheet keeps its own separate Security/Log out entries', () => {
    const { fixture } = setup('ACTIVE');
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    expect(avatarBtn).not.toBeNull();
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ann', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/admin/notifications/settings');
  });

  it('closes the profile sheet when the Notifications row is clicked, so it does not sit on ' +
     'top of the page it just navigated to', () => {
    const { fixture } = setup('ACTIVE');
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ann', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(true);
    const link: HTMLElement = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    link.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(false);
  });

  it('gives the admin shell the same header unread envelope as the other shells, pointed at ' +
     'admin messages — not a second badge on the Messages sidebar item', () => {
    const { fixture } = setup('ACTIVE');
    const link = fixture.nativeElement.querySelector('[data-testid="admin-messages-link"]');
    expect(link).not.toBeNull();
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/admin/messages');
  });

  it('shows the unread badge on the envelope once the admin has unread messages', () => {
    const { fixture, messaging } = setup('ACTIVE');
    messaging.unread.set(2);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('[data-testid="admin-messages-link"] .badge');
    expect(badge.textContent.trim()).toBe('2');
  });
});

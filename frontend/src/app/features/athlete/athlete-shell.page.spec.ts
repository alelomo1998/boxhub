import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AthleteShellPage } from './athlete-shell.page';
import { MessagingService } from '../messaging/messaging.service';
import { ShellChromeService } from '../../core/shell-chrome.service';

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

  it('opens the profile sheet with a Notifications row pointed at the athlete settings route ' +
     '(M29b Task 20)', () => {
    const { fixture } = setup();
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    expect(avatarBtn).not.toBeNull();
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ada', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/athlete/notifications/settings');
  });

  it('closes the profile sheet when the Notifications row is clicked, so it does not sit on ' +
     'top of the page it just navigated to', () => {
    const { fixture } = setup();
    const avatarBtn = fixture.nativeElement.querySelector('button[aria-label="Your profile"]');
    avatarBtn.click();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ada', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(true);
    const link: HTMLElement = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    link.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.profileOpen()).toBe(false);
  });

  it('on a normal route renders the box switcher and the dock', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('bh-box-switcher')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.back')).toBeNull();
    expect(fixture.nativeElement.querySelector('bh-dock')).not.toBeNull();
  });

  it('on a detail route renders the back control and the title, and hides the dock', async () => {
    TestBed.configureTestingModule({
      imports: [AthleteShellPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(),
        provideRouter([{ path: 'class/x', data: { detail: true, backTo: '/athlete/book' }, children: [] }]),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AthleteShellPage);
    fixture.detectChanges();
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ada', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    http.expectOne('/api/box/conversations').flush([]);

    const router = TestBed.inject(Router);
    const chrome = TestBed.inject(ShellChromeService);
    await router.navigateByUrl('/class/x');
    chrome.detailTitle.set('Burn It');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('bh-box-switcher')).toBeNull();
    expect(fixture.nativeElement.querySelector('bh-dock')).toBeNull();
    const back = fixture.nativeElement.querySelector('.back');
    expect(back).not.toBeNull();
    expect(back.getAttribute('aria-label')).toBe('Back');
    const title = fixture.nativeElement.querySelector('.dtitle');
    expect(title.textContent).toContain('Burn It');

    const navSpy = spyOn(router, 'navigateByUrl').and.callThrough();
    back.click();
    expect(navSpy).toHaveBeenCalledWith('/athlete/book');
  });
});

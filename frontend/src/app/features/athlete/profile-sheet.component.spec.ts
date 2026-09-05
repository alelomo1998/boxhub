import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ProfileSheetComponent } from './profile-sheet.component';

describe('ProfileSheetComponent', () => {
  function setup(notificationsRoute: string | null) {
    TestBed.configureTestingModule({
      imports: [ProfileSheetComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProfileSheetComponent);
    fixture.componentInstance.notificationsRoute = notificationsRoute;
    fixture.detectChanges();
    http.expectOne('/api/box/me/profile').flush({
      membershipId: 'm1', name: 'Ada', avatarPath: null, isPrivate: false, me: true,
      benchmarks: null, liftPrs: null, streakWeeks: null,
    });
    fixture.detectChanges();
    return { fixture };
  }

  it('renders no Notifications row when no route is supplied — a row that navigates nowhere ' +
     'is worse than no row', () => {
    const { fixture } = setup(null);
    expect(fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]')).toBeNull();
  });

  it('renders the Notifications row with the given href when a route is supplied', () => {
    const { fixture } = setup('/athlete/notifications/settings');
    const link = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    expect(link).not.toBeNull();
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/athlete/notifications/settings');
  });

  it('emits navigated exactly once when the Notifications row is clicked, so the host can ' +
     'close its own sheet', () => {
    const { fixture } = setup('/athlete/notifications/settings');
    const spy = jasmine.createSpy('navigated');
    fixture.componentInstance.navigated.subscribe(spy);
    const link: HTMLElement = fixture.nativeElement.querySelector('[data-testid="profile-notifications-link"]');
    link.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not emit navigated when the Security row is clicked — /account is outside the ' +
     'shells and its navigation tears the sheet down on its own', () => {
    const { fixture } = setup('/athlete/notifications/settings');
    const spy = jasmine.createSpy('navigated');
    fixture.componentInstance.navigated.subscribe(spy);
    const link: HTMLElement = fixture.nativeElement.querySelector('[data-testid="profile-security-link"]');
    link.click();
    expect(spy).not.toHaveBeenCalled();
  });
});

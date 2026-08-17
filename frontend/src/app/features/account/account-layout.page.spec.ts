import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { AccountLayoutPage } from './account-layout.page';

// Real routes so router.navigateByUrl actually resolves (and NavigationEnd fires) rather than
// erroring on "no matching route" — the layout's own <router-outlet> is live in this fixture.
@Component({ standalone: true, template: '' })
class StubSection {}

describe('AccountLayoutPage', () => {
  let fixture: ComponentFixture<AccountLayoutPage>;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AccountLayoutPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([
        { path: 'account', component: StubSection },
        { path: 'account/password', component: StubSection },
      ])],
    });
    fixture = TestBed.createComponent(AccountLayoutPage);
    router = TestBed.inject(Router);
    // Land on the index first, matching how the area is actually entered — the component's
    // atIndex() otherwise starts from whatever the harness's default '/' resolves to.
    await router.navigateByUrl('/account');
    fixture.detectChanges();
  });

  it('names the area and lists all four sections', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')!.textContent).toContain('Account');
    const links = [...el.querySelectorAll('nav a')].map(a => a.getAttribute('href'));
    // NOT /account/email — that path is the unguarded landing clicked from a mail. The area's
    // own email section is /account/change-email. See the plan's Task 3.
    expect(links).toEqual(['/account/password', '/account/change-email', '/account/sessions', '/account/danger']);
  });

  it('Done goes back through history when there is history to go back to', () => {
    // Karma's headless tab never performs a real navigation, so window.history.length is
    // permanently 1 by default in this harness. Push a real entry so the component's actual,
    // UNSTUBBED hasHistory() — `window.history.length > 1` — reads true for real, instead of
    // stubbing the exact expression this test exists to cover.
    history.pushState(null, '', location.href);
    const ngLocation = TestBed.inject(Location);
    const back = spyOn(ngLocation, 'back');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(back).toHaveBeenCalled();
  });

  it('falls back to the role home when the area was opened directly, with no history', () => {
    // A pasted URL: nothing to go back to, so back() would strand the user on a blank tab.
    const nav = spyOn(router, 'navigateByUrl');
    fixture.componentInstance.hasHistory = () => false;
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(nav).toHaveBeenCalled();
  });

  it('carries replaceUrl on every in-area nav link, so Done exits in one press no matter how many sections were visited', () => {
    const links = fixture.debugElement.queryAll(By.directive(RouterLink))
      .filter(l => l.nativeElement.classList.contains('s-item'));
    expect(links.length).toBe(4);
    for (const l of links) expect(l.injector.get(RouterLink).replaceUrl).toBe(true);
  });

  it('shows the phone nav at the index and hides it once a section is active — driven off the router', async () => {
    const side = () => (fixture.nativeElement as HTMLElement).querySelector('.side')!;
    expect(side().classList.contains('section-active')).toBe(false);

    await router.navigateByUrl('/account/password');
    fixture.detectChanges();
    expect(side().classList.contains('section-active')).toBe(true);

    await router.navigateByUrl('/account');
    fixture.detectChanges();
    expect(side().classList.contains('section-active')).toBe(false);
  });

  it('shows a back-to-menu control only once a section is active, and it replaces history too', async () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="account-back"]')).toBeNull();

    await router.navigateByUrl('/account/password');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="account-back"]')).not.toBeNull();
    const back = fixture.debugElement.query(By.css('[data-testid="account-back"]'));
    expect(back.injector.get(RouterLink).replaceUrl).toBe(true);

    await router.navigateByUrl('/account');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="account-back"]')).toBeNull();
  });

  it('gives the active nav item a background distinct from an inactive one', () => {
    const item: HTMLElement = fixture.nativeElement.querySelector('.s-item');
    const inactiveBg = getComputedStyle(item).backgroundColor;
    item.classList.add('active');
    const activeBg = getComputedStyle(item).backgroundColor;
    expect(activeBg).not.toBe(inactiveBg);
  });
});

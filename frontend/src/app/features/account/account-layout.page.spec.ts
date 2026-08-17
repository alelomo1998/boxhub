import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { AccountLayoutPage } from './account-layout.page';

describe('AccountLayoutPage', () => {
  let fixture: ComponentFixture<AccountLayoutPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountLayoutPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(AccountLayoutPage);
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
    const location = TestBed.inject(Location);
    const back = spyOn(location, 'back');
    // Karma's headless tab never performs a real navigation, so window.history.length is
    // permanently 1 in this harness — the default hasHistory() would never see "true" here
    // regardless of the component logic. Override it, symmetric with the false-case test below.
    fixture.componentInstance.hasHistory = () => true;
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(back).toHaveBeenCalled();
  });

  it('falls back to the role home when the area was opened directly, with no history', () => {
    // A pasted URL: nothing to go back to, so back() would strand the user on a blank tab.
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigateByUrl');
    fixture.componentInstance.hasHistory = () => false;
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-done"]')!.click();
    expect(nav).toHaveBeenCalled();
  });
});

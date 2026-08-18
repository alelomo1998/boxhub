import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountIndexPage, accountIndexGuard, isDesktopViewport } from './account-index.page';

describe('AccountIndexPage', () => {
  it('renders no markup — the layout nav is the phone menu', () => {
    TestBed.configureTestingModule({
      imports: [AccountIndexPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(AccountIndexPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toBe('');
  });
});

// Redirect now lives in a CanActivate guard, not the component's own lifecycle: a guard resolves
// within the router's current navigation, so — unlike a component-lifecycle `navigateByUrl` — it
// cannot race a still-in-flight initial navigation on a cold bootstrap. See account-index.page.ts.
describe('accountIndexGuard', () => {
  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => accountIndexGuard(null as never, null as never)) as boolean | UrlTree;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('redirects to the first section at desktop, where an empty column reads as broken', () => {
    spyOn(TestBed.inject(Router), 'parseUrl').and.callThrough();
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const result = run();
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/account/password');
  });

  it('stays put on phone, where the nav itself is the menu', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    expect(run()).toBeTrue();
  });

  it('evaluates the real matchMedia default at the layout breakpoint', () => {
    const matchMediaSpy = spyOn(window, 'matchMedia').and.callThrough();
    run();
    expect(matchMediaSpy).toHaveBeenCalledWith('(min-width: 720px)');
  });
});

describe('isDesktopViewport', () => {
  it('reads the layout\'s own 720px breakpoint', () => {
    const matchMediaSpy = spyOn(window, 'matchMedia').and.callThrough();
    isDesktopViewport();
    expect(matchMediaSpy).toHaveBeenCalledWith('(min-width: 720px)');
  });
});

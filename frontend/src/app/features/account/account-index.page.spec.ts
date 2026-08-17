import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountIndexPage } from './account-index.page';

describe('AccountIndexPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountIndexPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('redirects to the first section at desktop, where an empty column reads as broken', () => {
    const fixture = TestBed.createComponent(AccountIndexPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.isDesktop = () => true;
    fixture.detectChanges();
    expect(nav).toHaveBeenCalledWith('/account/password', { replaceUrl: true });
  });

  it('stays put on phone, where the nav itself is the menu', () => {
    const fixture = TestBed.createComponent(AccountIndexPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.isDesktop = () => false;
    fixture.detectChanges();
    expect(nav).not.toHaveBeenCalled();
  });

  it('evaluates the real matchMedia default without overriding isDesktop', () => {
    const fixture = TestBed.createComponent(AccountIndexPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    const matchMediaSpy = spyOn(window, 'matchMedia').and.callThrough();
    fixture.detectChanges();
    expect(matchMediaSpy).toHaveBeenCalledWith('(min-width: 720px)');
    // Headless Chrome's default viewport (800px) is >= the 720px breakpoint, so the real,
    // un-stubbed expression resolves to desktop and navigates — verified by running this
    // assertion both ways before picking it (see task report).
    expect(nav).toHaveBeenCalledWith('/account/password', { replaceUrl: true });
  });
});

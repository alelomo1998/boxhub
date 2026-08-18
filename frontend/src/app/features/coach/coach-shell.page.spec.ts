import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CoachShellPage } from './coach-shell.page';

describe('CoachShellPage', () => {
  it('renders Security as a real anchor with an href, not a button — RouterLink only emits ' +
     'href on a/area hosts, so a bh-button host silently drops it', () => {
    TestBed.configureTestingModule({
      imports: [CoachShellPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(CoachShellPage);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="coach-security-link"]');
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/account');
  });
});

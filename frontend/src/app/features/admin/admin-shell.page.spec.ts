import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminShellPage } from './admin-shell.page';
import { AuthService } from '../../core/auth/auth.service';

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
    const fixture = TestBed.createComponent(AdminShellPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the pending banner for a PENDING box', () => {
    const fixture = setup('PENDING');
    const banner = fixture.nativeElement.querySelector('[data-testid="pending-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Waiting for approval');
  });

  it('hides the pending banner for an ACTIVE box', () => {
    const fixture = setup('ACTIVE');
    expect(fixture.nativeElement.querySelector('[data-testid="pending-banner"]')).toBeNull();
  });

  it('renders Security as a real anchor with an href, not a button — RouterLink only emits ' +
     'href on a/area hosts, so a bh-button host silently drops it', () => {
    const fixture = setup('ACTIVE');
    const link = fixture.nativeElement.querySelector('[data-testid="admin-security-link"]');
    expect(link.matches('a[href]')).toBe(true);
    expect(link.getAttribute('href')).toBe('/account');
  });
});

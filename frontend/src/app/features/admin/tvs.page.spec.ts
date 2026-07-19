import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvsPage } from './tvs.page';
import { AuthService } from '../../core/auth/auth.service';

describe('TvsPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TvsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists devices and claims a new one', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([
      { id: 'd1', name: 'Rig wall', online: true, lastSeenAt: new Date().toISOString(), createdAt: new Date().toISOString() },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rig wall');

    const cmp = fixture.componentInstance;
    cmp.code.set('123456'); cmp.name.set('Front desk');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush({ id: 'd2', name: 'Front desk', online: false, lastSeenAt: null, createdAt: new Date().toISOString() });
    http.expectOne('/api/box/tv').flush([]);
    expect(cmp.claimError()).toBe('');
  });

  it('shows an inline error when the code is wrong', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([]);
    const cmp = fixture.componentInstance;
    cmp.code.set('000000'); cmp.name.set('X');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush('nope', { status: 404, statusText: 'Not Found' });
    expect(cmp.claimError()).toContain("code");
  });

  it('PENDING box: shows the pending card, hides the claim form', () => {
    const fixture = TestBed.createComponent(TvsPage);
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'activeBoxStatus').and.returnValue('PENDING');
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([]);
    fixture.detectChanges();

    const pending = fixture.nativeElement.querySelector('[data-testid="tvs-pending"]');
    expect(pending).not.toBeNull();
    expect(pending.textContent).toContain('Available once your box is approved.');
    expect(fixture.nativeElement.querySelector('[data-testid="tv-code"]')).toBeNull();
  });

  it('claim() maps a 403 BOX_PENDING response to the pending-approval message', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([]);
    const cmp = fixture.componentInstance;
    cmp.code.set('123456'); cmp.name.set('X');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush({ detail: 'BOX_PENDING' }, { status: 403, statusText: 'Forbidden' });
    expect(cmp.claimError()).toBe('Available once your box is approved.');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { InvitesPage } from './invites.page';
import { AuthService } from '../../core/auth/auth.service';

describe('InvitesPage', () => {
  let http: HttpTestingController;

  function setup(boxStatus: string) {
    TestBed.configureTestingModule({
      imports: [InvitesPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'activeBoxStatus').and.returnValue(boxStatus);
    const fixture = TestBed.createComponent(InvitesPage);
    fixture.detectChanges();
    http.expectOne('/api/box/plans').flush([]);
    http.expectOne('/api/box/invites').flush([]);
    return fixture;
  }

  afterEach(() => http.verify());

  it('PENDING box: shows the pending card, hides the create-invite form', () => {
    const fixture = setup('PENDING');
    const pending = fixture.nativeElement.querySelector('[data-testid="invites-pending"]');
    expect(pending).not.toBeNull();
    expect(pending.textContent).toContain('Available once your box is approved.');
    expect(fixture.nativeElement.querySelector('[data-testid="invite-create"]')).toBeNull();
  });

  it('ACTIVE box: hides the pending card, shows the create-invite form', () => {
    const fixture = setup('ACTIVE');
    expect(fixture.nativeElement.querySelector('[data-testid="invites-pending"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="invite-create"]')).not.toBeNull();
  });

  it('create() maps a 403 BOX_PENDING response to the pending-approval message', () => {
    const fixture = setup('ACTIVE');
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.create();
    http.expectOne('/api/box/invites').flush({ detail: 'BOX_PENDING' }, { status: 403, statusText: 'Forbidden' });
    expect(cmp.createError()).toBe('Available once your box is approved.');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BoxStripePage } from './box-stripe.page';

describe('BoxStripePage', () => {
  let http: HttpTestingController;

  function setup(connected: boolean) {
    TestBed.configureTestingModule({
      imports: [BoxStripePage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BoxStripePage);
    fixture.detectChanges();
    http.expectOne('/api/box/stripe').flush({ connected });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows Not connected when the box has no Stripe key, never showing key material', () => {
    const fixture = setup(false);
    expect(fixture.nativeElement.textContent).toContain('Not connected');
    expect(fixture.nativeElement.querySelector('[data-testid="stripe-disconnect"]')).toBeNull();
  });

  it('shows Connected + a Disconnect action when the box has a key', () => {
    const fixture = setup(true);
    expect(fixture.nativeElement.textContent).toContain('Connected');
    expect(fixture.nativeElement.querySelector('[data-testid="stripe-disconnect"]')).not.toBeNull();
  });

  it('connect() PUTs the restricted key + webhook secret and clears the inputs on success', () => {
    const fixture = setup(false);
    const cmp = fixture.componentInstance;
    cmp.restrictedKey = 'rk_live_x';
    cmp.webhookSecret = 'whsec_y';
    cmp.connect();
    const req = http.expectOne('/api/box/stripe');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ restrictedKey: 'rk_live_x', webhookSecret: 'whsec_y' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(cmp.connected()).toBeTrue();
    expect(cmp.restrictedKey).toBe('');
    expect(cmp.webhookSecret).toBe('');
  });

  it('connect() failure keeps the entered key/secret so the admin does not retype', () => {
    const fixture = setup(false);
    const cmp = fixture.componentInstance;
    cmp.restrictedKey = 'rk_bad';
    cmp.webhookSecret = 'whsec_bad';
    cmp.connect();
    http.expectOne('/api/box/stripe').flush({ detail: 'error' }, { status: 400, statusText: 'Bad Request' });
    expect(cmp.saveError()).toContain("Couldn't connect");
    expect(cmp.restrictedKey).toBe('rk_bad');
    expect(cmp.webhookSecret).toBe('whsec_bad');
  });

  it('disconnect() DELETEs and flips the status pill', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    spyOn(window, 'confirm').and.returnValue(true);
    cmp.disconnect();
    const req = http.expectOne('/api/box/stripe');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(cmp.connected()).toBeFalse();
  });
});

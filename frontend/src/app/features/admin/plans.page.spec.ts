import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlansPage } from './plans.page';

describe('PlansPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [PlansPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlansPage);
    fixture.detectChanges();
    http.expectOne('/api/box/plans').flush([
      { id: 'p1', name: 'Unlimited', durationDays: 30, weeklyClassLimit: null, archived: false,
        priceCents: 8900, currency: 'eur', entitlement: 'UNLIMITED' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders money from cents as €xx.xx', () => {
    const fixture = setup();
    expect(fixture.nativeElement.textContent).toContain('€89.00');
  });

  it('create() sends priceCents converted from euros, in whole cents', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.name = 'Basic';
    cmp.priceInput = 25.5;
    cmp.currency = 'eur';
    cmp.create();
    const req = http.expectOne('/api/box/plans');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.priceCents).toBe(2550);
    req.flush({ id: 'p2', name: 'Basic', durationDays: 30, weeklyClassLimit: null, archived: false,
      priceCents: 2550, currency: 'eur', entitlement: 'UNLIMITED' });
    http.expectOne('/api/box/plans').flush([]);
  });

  it('create() sends weeklyClassLimit only when entitlement is WEEKLY_LIMIT', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.name = 'Limited';
    cmp.entitlement = 'WEEKLY_LIMIT';
    cmp.weeklyClassLimit = 3;
    cmp.create();
    const req = http.expectOne('/api/box/plans');
    expect(req.request.body.entitlement).toBe('WEEKLY_LIMIT');
    expect(req.request.body.weeklyClassLimit).toBe(3);
    req.flush({ id: 'p3', name: 'Limited', durationDays: 30, weeklyClassLimit: 3, archived: false,
      priceCents: 0, currency: 'eur', entitlement: 'WEEKLY_LIMIT' });
    http.expectOne('/api/box/plans').flush([]);
  });

  it('maps a create error to inline text', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.name = 'Dup';
    cmp.create();
    http.expectOne('/api/box/plans').flush({ detail: 'Plan name already exists' }, { status: 409, statusText: 'Conflict' });
    expect(cmp.error()).toBe('Plan name already exists');
  });

  it('a failed initial fetch shows the error state with a working retry, not a permanently blank page', () => {
    TestBed.configureTestingModule({
      imports: [PlansPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlansPage);
    fixture.detectChanges();
    http.expectOne('/api/box/plans').flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(fixture.componentInstance.state()).toBe('error');

    fixture.componentInstance.load(); // retry
    http.expectOne('/api/box/plans').flush([]);
    expect(fixture.componentInstance.state()).toBe('ready');
  });
});

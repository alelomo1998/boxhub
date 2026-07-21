import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ReceiptPage } from './receipt.page';

const RECEIPT = { paymentId: 'pay1', amountCents: 7000, currency: 'eur', method: 'CASH', planName: 'Unlimited',
  periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-02-01T00:00:00Z', listPriceCents: 8900,
  discountCents: 1900, boxName: 'Iron Box', createdAt: '2026-01-01T00:00:00Z' };

describe('ReceiptPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [ReceiptPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ paymentId: 'pay1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReceiptPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('fetches by the paymentId route param and renders money from cents as €xx.xx', () => {
    const fixture = setup();
    const req = http.expectOne('/api/box/receipts/pay1');
    req.flush(RECEIPT);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="receipt-total"]').textContent).toContain('€70.00');
  });

  it('shows the discount line when discountCents > 0', () => {
    const fixture = setup();
    http.expectOne('/api/box/receipts/pay1').flush(RECEIPT);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="receipt-discount"]').textContent).toContain('€19.00');
  });

  it('hides the discount line when discountCents is 0', () => {
    const fixture = setup();
    http.expectOne('/api/box/receipts/pay1').flush({ ...RECEIPT, discountCents: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="receipt-discount"]')).toBeNull();
  });

  it('Print button calls window.print()', () => {
    const fixture = setup();
    http.expectOne('/api/box/receipts/pay1').flush(RECEIPT);
    fixture.detectChanges();
    const printSpy = spyOn(window, 'print');
    fixture.componentInstance.print();
    expect(printSpy).toHaveBeenCalled();
  });

  it('shows an error state with retry on load failure', () => {
    const fixture = setup();
    http.expectOne('/api/box/receipts/pay1').flush({ detail: 'NOT_YOUR_RECEIPT' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('error');
  });
});

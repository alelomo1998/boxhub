import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BookingService } from './booking.service';

describe('BookingService', () => {
  let service: BookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BookingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listSessions passes from/to params', () => {
    service.listSessions('2026-07-09T00:00:00Z', '2026-07-16T00:00:00Z').subscribe();
    const req = http.expectOne(r => r.url === '/api/box/sessions'
      && r.params.get('from') === '2026-07-09T00:00:00Z' && r.params.get('to') === '2026-07-16T00:00:00Z');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('book posts to the session book endpoint', () => {
    service.book('s1').subscribe(r => expect(r.status).toBe('BOOKED'));
    const req = http.expectOne('/api/box/sessions/s1/book');
    expect(req.request.method).toBe('POST');
    req.flush({ bookingId: 'b1', status: 'BOOKED', position: null });
  });

  it('cancel deletes the session booking', () => {
    service.cancel('s1').subscribe();
    const req = http.expectOne('/api/box/sessions/s1/booking');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

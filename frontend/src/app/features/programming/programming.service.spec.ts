import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ProgrammingService } from './programming.service';

describe('ProgrammingService', () => {
  let service: ProgrammingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProgrammingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('createWod POSTs the wod body', () => {
    service.createWod({ title: 'Fran', wodType: 'FOR_TIME', scoreType: 'TIME' }).subscribe();
    const req = http.expectOne('/api/box/wods');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Fran');
    req.flush({});
  });

  it('putItems PUTs the ordered items', () => {
    service.putItems('s1', [{ wodId: 'w1', scoreable: false }, { wodId: 'w2', scoreable: true }]).subscribe();
    const req = http.expectOne('/api/box/sessions/s1/items');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.items.length).toBe(2);
    expect(req.request.body.items[1].scoreable).toBeTrue();
    req.flush([]);
  });

  it('publishProgramming PATCHes the instance status', () => {
    service.publishProgramming('s1', 'PUBLISHED').subscribe();
    const req = http.expectOne('/api/box/sessions/s1/programming');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('PUBLISHED');
    req.flush({ programmingStatus: 'PUBLISHED' });
  });

  it('skeleton round-trips label+type only', () => {
    service.putSkeleton('t1', [{ label: 'Warm-up', wodType: 'WARMUP', sortOrder: 9, id: 'x' }]).subscribe();
    const req = http.expectOne('/api/box/class-templates/t1/skeleton');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pieces).toEqual([{ label: 'Warm-up', wodType: 'WARMUP' }]);
    req.flush([]);
  });

  it('myClassToday GETs the aggregate', () => {
    service.myClassToday().subscribe();
    const req = http.expectOne('/api/box/my-class-today');
    expect(req.request.method).toBe('GET');
    req.flush({ session: null, booked: false, items: [], otherToday: [] });
  });

  it('cloneBenchmark POSTs to the clone endpoint', () => {
    service.cloneBenchmark('b1').subscribe();
    const req = http.expectOne('/api/box/benchmarks/b1/clone');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});

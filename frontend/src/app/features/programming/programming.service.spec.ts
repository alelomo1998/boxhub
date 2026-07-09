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

  it('tracks GETs the tracks endpoint', () => {
    service.tracks().subscribe();
    const req = http.expectOne('/api/box/tracks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createWod POSTs the wod body', () => {
    service.createWod({ title: 'Fran', wodType: 'FOR_TIME', scoreType: 'TIME' }).subscribe();
    const req = http.expectOne('/api/box/wods');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Fran');
    req.flush({});
  });

  it('duplicateWod POSTs to the duplicate endpoint', () => {
    service.duplicateWod('w1').subscribe();
    const req = http.expectOne('/api/box/wods/w1/duplicate');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('assignSlot PUTs date/track/wod', () => {
    service.assignSlot('2026-07-13', 't1', 'w1').subscribe();
    const req = http.expectOne('/api/box/program');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ slotDate: '2026-07-13', trackId: 't1', wodId: 'w1' });
    req.flush({});
  });

  it('publish POSTs the range', () => {
    service.publish('2026-07-13', '2026-07-19', 't1').subscribe();
    const req = http.expectOne('/api/box/program/publish');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ from: '2026-07-13', to: '2026-07-19', trackId: 't1' });
    req.flush({ published: 3 });
  });

  it('board passes date + includeDrafts', () => {
    service.board('2026-07-13', true).subscribe();
    const req = http.expectOne(r => r.url === '/api/box/wod-board'
      && r.params.get('date') === '2026-07-13' && r.params.get('includeDrafts') === 'true');
    expect(req.request.method).toBe('GET');
    req.flush({ date: '2026-07-13', tracks: [] });
  });

  it('cloneBenchmark POSTs to the clone endpoint', () => {
    service.cloneBenchmark('b1').subscribe();
    const req = http.expectOne('/api/box/benchmarks/b1/clone');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});

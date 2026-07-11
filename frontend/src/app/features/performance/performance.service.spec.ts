import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  let service: PerformanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PerformanceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('putScore PUTs the slot score with the body', () => {
    service.putScore('i1', { rx: true, timeSeconds: 183, isPrivate: false }).subscribe();
    const req = http.expectOne('/api/box/sessions/items/i1/score');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.timeSeconds).toBe(183);
    req.flush({});
  });

  it('leaderboard GETs the leaderboard URL', () => {
    service.leaderboard('i1').subscribe();
    const req = http.expectOne('/api/box/sessions/items/i1/leaderboard');
    expect(req.request.method).toBe('GET');
    req.flush({ scoreType: 'TIME', entries: [] });
  });

  it('logLift POSTs to lifts', () => {
    service.logLift({ movementId: 'm1', load: 120 }).subscribe();
    const req = http.expectOne('/api/box/lifts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.load).toBe(120);
    req.flush({});
  });

  it('lifts passes movementId param', () => {
    service.lifts('m1').subscribe();
    const req = http.expectOne(r => r.url === '/api/box/lifts' && r.params.get('movementId') === 'm1');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('prs GETs the prs endpoint', () => {
    service.prs().subscribe();
    const req = http.expectOne('/api/box/lifts/prs');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('benchmarkHistory GETs the benchmark-history endpoint', () => {
    service.benchmarkHistory().subscribe();
    const req = http.expectOne('/api/box/benchmark-history');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ProgrammingService, mergeLibrary, benchmarkAsWod, Benchmark, Wod } from './programming.service';

describe('ProgrammingService', () => {
  let service: ProgrammingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
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

  it('sends the axes, not the legacy wodType, when creating', () => {
    service.createWod({ title: 'Fran', macro: 'WORKOUT', timingPreset: 'FOR_TIME',
                        scoreType: 'TIME', library: false }).subscribe();
    const req = http.expectOne('/api/box/wods');
    expect(req.request.body.macro).toBe('WORKOUT');
    expect(req.request.body.wodType).toBeUndefined();
    req.flush({});
  });

  it('asks for a library copy by fromLibraryWodId', () => {
    service.putItems('s1', [{ fromLibraryWodId: 'w1', scoreable: true }]).subscribe();
    const req = http.expectOne('/api/box/sessions/s1/items');
    expect(req.request.body.items[0].fromLibraryWodId).toBe('w1');
    req.flush([]);
  });

  it('posts a team score to the team endpoint', () => {
    service.putTeamScore('i1', { membershipIds: ['m1', 'm2'], rx: true, isPrivate: false }).subscribe();
    const req = http.expectOne('/api/box/sessions/items/i1/score/team');
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('saves a piece to the library through the patch flag', () => {
    service.patchWod('w1', { title: 'X', saveToLibrary: true }).subscribe();
    const req = http.expectOne('/api/box/wods/w1');
    expect(req.request.body.saveToLibrary).toBe(true);
    req.flush({});
  });

  it('wodHistory sends day', () => {
    service.wodHistory('2026-09-01').subscribe();
    const req = http.expectOne(r => r.url === '/api/box/wods/history');
    expect(req.request.params.get('day')).toBe('2026-09-01');
    req.flush([]);
  });

  it('libraryPage sends filters, repeated array params, and only q at 3+ chars', () => {
    service.libraryPage({ q: 'fra', macro: 'WORKOUT', timing: 'FOR_TIME', movement: ['m1', 'm2'],
      benchmarks: true, kind: ['GIRL', 'HERO'], cursor: 'c1' }).subscribe();
    const req = http.expectOne(r => r.url === '/api/box/library');
    expect(req.request.params.get('q')).toBe('fra');
    expect(req.request.params.get('macro')).toBe('WORKOUT');
    expect(req.request.params.get('timing')).toBe('FOR_TIME');
    expect(req.request.params.getAll('movement')).toEqual(['m1', 'm2']);
    expect(req.request.params.get('benchmarks')).toBe('true');
    expect(req.request.params.getAll('kind')).toEqual(['GIRL', 'HERO']);
    expect(req.request.params.get('cursor')).toBe('c1');
    req.flush({ rows: [], nextCursor: null, total: 0 });
  });

  it('libraryPage omits q, benchmarks and cursor when unset', () => {
    service.libraryPage({}).subscribe();
    const req = http.expectOne(r => r.url === '/api/box/library');
    expect(req.request.params.has('q')).toBeFalse();
    expect(req.request.params.has('benchmarks')).toBeFalse();
    expect(req.request.params.has('cursor')).toBeFalse();
    expect(req.request.params.has('movement')).toBeFalse();
    req.flush({ rows: [], nextCursor: null, total: 0 });
  });
});

describe('mergeLibrary', () => {
  const bm = (id: string, name: string, kind: string): Benchmark =>
    ({ id, name, kind, scoreType: 'TIME', timingPreset: 'FOR_TIME', timeCapSeconds: null,
       bodyText: '', blocks: { blocks: [] } });
  const wod = (id: string, benchmarkTemplateId: string | null): Wod => ({ ...benchmarkAsWod(bm(id, id, 'GIRL')),
    id, benchmarkTemplateId, library: true });

  it('lists saved pieces before benchmarks', () => {
    const out = mergeLibrary([wod('w1', null)], [bm('b1', 'Fran', 'GIRL')]);
    expect(out.map(e => [e.wod.id, e.global])).toEqual([['w1', false], ['b1', true]]);
  });

  it('hides a global benchmark the box already copied, flagging the copy', () => {
    const out = mergeLibrary([wod('w1', 'b1')], [bm('b1', 'Fran', 'GIRL'), bm('b2', 'Murph', 'HERO')]);
    expect(out.map(e => e.wod.id)).toEqual(['w1', 'b2']);
    expect(out[0].benchmarkKind).toBe('GIRL');
    expect(out[0].global).toBeFalse();
  });
});

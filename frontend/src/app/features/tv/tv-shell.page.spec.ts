import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvShellPage } from './tv-shell.page';

describe('TvShellPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('boxhub_tv_paired');
    TestBed.configureTestingModule({
      imports: [TvShellPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('boxhub_tv_paired'); });

  it('starts pairing when no token and shows the code', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('123456');
  });

  it('marks paired and switches to live once poll succeeds — no token stored', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    cmp.pollOnce(); // exposed for tests; production uses the 3s interval
    // the credential rides home as the httpOnly bh_tv cookie (Set-Cookie), never in this body
    http.expectOne('/api/tv/pair/poll').flush({ paired: true });
    expect(localStorage.getItem('boxhub_tv_paired')).toBe('1');
    expect(cmp.mode()).toBe('live');
  });

  it('opens the stream with no token in the URL — the bh_tv cookie carries it', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    cmp.pollOnce();
    http.expectOne('/api/tv/pair/poll').flush({ paired: true });
    const es = (cmp as any).es as EventSource;
    expect(es.url).toContain('/api/tv/stream');
    expect(es.url).not.toContain('token');
    expect(es.url).not.toContain('?');
  });

  it('renders a CLASS snapshot: board left, ranked rail right', () => {
    localStorage.setItem('boxhub_tv_paired', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges(); // live mode; EventSource is stubbed by onState in tests
    cmp.onState({
      view: 'CLASS', boxName: 'Demo Box', next: null,
      session: { id: 's1', name: 'WOD Class', startAt: new Date().toISOString(), durationMin: 60,
                 coachName: 'Coach', coachAvatarPath: null },
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: '21-15-9' }],
      rail: [{ name: 'Fast', avatarPath: null, status: 'SCORED', rank: 1, score: '3:21', rx: true },
             { name: 'Booked', avatarPath: null, status: 'BOOKED', rank: null, score: null, rx: null }],
      timer: null,
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fran');
    expect(text).toContain('3:21');
    expect(text).toContain('Booked');
  });

  it('caps the rail and shows "+N more" past railCap', () => {
    localStorage.setItem('boxhub_tv_paired', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    const rail = Array.from({ length: cmp.railCap + 3 }, (_, i) => ({
      name: 'Athlete ' + i, avatarPath: null, status: 'BOOKED', rank: null, score: null, rx: null,
    }));
    cmp.onState({
      view: 'CLASS', boxName: 'Demo Box', next: null,
      session: { id: 's1', name: 'WOD Class', startAt: new Date().toISOString(), durationMin: 60,
                 coachName: null, coachAvatarPath: null },
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: null }], rail, timer: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.row').length).toBe(cmp.railCap);
    expect(fixture.nativeElement.textContent).toContain('+3 more in class');
  });

  it('re-pairs when the stream is permanently closed (revoked device)', () => {
    localStorage.setItem('boxhub_tv_paired', 'dead');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    expect(cmp.mode()).toBe('live');
    // simulate EventSource giving up: onerror fires with readyState CLOSED
    const es = (cmp as any).es as EventSource;
    Object.defineProperty(es, 'readyState', { value: EventSource.CLOSED, configurable: true });
    es.onerror!(new Event('error'));
    expect(localStorage.getItem('boxhub_tv_paired')).toBeNull();
    expect(cmp.mode()).toBe('pairing');
    http.expectOne('/api/tv/pair').flush({ code: '654321', secret: 's' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('654321');
  });

  it('shows the giant clock and piece caption when a timer is running', () => {
    localStorage.setItem('boxhub_tv_paired', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    cmp.onState({
      view: 'CLASS', boxName: 'Demo Box', next: null,
      session: { id: 's1', name: 'WOD Class', startAt: new Date().toISOString(), durationMin: 60,
                 coachName: 'Coach', coachAvatarPath: null },
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: '21-15-9' }],
      rail: [{ name: 'Fast', avatarPath: null, status: 'BOOKED', rank: null, score: null, rx: null }],
      timer: { type: 'AMRAP', totalSeconds: 600, rounds: null, workSeconds: null, restSeconds: null,
               startAtEpoch: Date.now(), pausedElapsedMs: 0, status: 'RUNNING', pieceTitle: 'Fran', pieceBody: '21-15-9' },
    } as any);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tvtimer')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Fran');
  });

  it('IDLE snapshot shows clock and next class', () => {
    localStorage.setItem('boxhub_tv_paired', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.componentInstance.onState({
      view: 'IDLE', boxName: 'Demo Box',
      next: { name: 'Burn It', startAt: new Date(Date.now() + 3600_000).toISOString() },
      session: null, items: [], rail: [], timer: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Burn It');
  });
});

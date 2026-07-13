import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvShellPage } from './tv-shell.page';

describe('TvShellPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('boxhub_tv_token');
    TestBed.configureTestingModule({
      imports: [TvShellPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('boxhub_tv_token'); });

  it('starts pairing when no token and shows the code', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('123456');
  });

  it('stores the token and switches to live once poll succeeds', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    cmp.pollOnce(); // exposed for tests; production uses the 3s interval
    http.expectOne('/api/tv/pair/poll').flush({ token: 'tv-token' });
    expect(localStorage.getItem('boxhub_tv_token')).toBe('tv-token');
    expect(cmp.mode()).toBe('live');
  });

  it('renders a CLASS snapshot: board left, ranked rail right', () => {
    localStorage.setItem('boxhub_tv_token', 't');
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
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fran');
    expect(text).toContain('3:21');
    expect(text).toContain('Booked');
  });

  it('caps the rail and shows "+N more" past railCap', () => {
    localStorage.setItem('boxhub_tv_token', 't');
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
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: null }], rail,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.row').length).toBe(cmp.railCap);
    expect(fixture.nativeElement.textContent).toContain('+3 more in class');
  });

  it('re-pairs when the stream is permanently closed (revoked device)', () => {
    localStorage.setItem('boxhub_tv_token', 'dead');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    expect(cmp.mode()).toBe('live');
    // simulate EventSource giving up: onerror fires with readyState CLOSED
    const es = (cmp as any).es as EventSource;
    Object.defineProperty(es, 'readyState', { value: EventSource.CLOSED, configurable: true });
    es.onerror!(new Event('error'));
    expect(localStorage.getItem('boxhub_tv_token')).toBeNull();
    expect(cmp.mode()).toBe('pairing');
    http.expectOne('/api/tv/pair').flush({ code: '654321', secret: 's' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('654321');
  });

  it('IDLE snapshot shows clock and next class', () => {
    localStorage.setItem('boxhub_tv_token', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.componentInstance.onState({
      view: 'IDLE', boxName: 'Demo Box',
      next: { name: 'Burn It', startAt: new Date(Date.now() + 3600_000).toISOString() },
      session: null, items: [], rail: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Burn It');
  });
});

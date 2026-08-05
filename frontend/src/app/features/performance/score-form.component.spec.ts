import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ScoreFormComponent } from './score-form.component';

describe('ScoreFormComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ScoreFormComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function create(scoreType = 'TIME') {
    const fixture = TestBed.createComponent(ScoreFormComponent);
    fixture.componentInstance.itemId = 'i1';
    fixture.componentInstance.scoreType = scoreType;
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/items/i1/score').flush(null, { status: 204, statusText: 'No Content' });
    return fixture;
  }

  it('rejects a 0:00 finished time without calling the API', () => {
    const fixture = create('TIME');
    fixture.componentInstance.save();
    expect(fixture.componentInstance.error()).toContain('Enter your time');
    http.expectNone(r => r.method === 'PUT');
  });

  it('PUTs a valid time and emits saved', () => {
    const fixture = create('TIME');
    const c = fixture.componentInstance;
    c.mins.set(3); c.secs.set(30);
    let saved = false;
    c.saved.subscribe(() => (saved = true));
    c.save();
    const req = http.expectOne('/api/box/sessions/items/i1/score');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.timeSeconds).toBe(210);
    req.flush({ id: 'x', slotId: 's1', rx: true, timeSeconds: 210, rounds: null, reps: null,
      load: null, finished: true, notes: null, isPrivate: false, scoreType: 'TIME' });
    expect(saved).toBeTrue();
    expect(c.pending()).toBeFalse();
  });

  it('emits dirtyChange true once on first input', () => {
    const fixture = create('TIME');
    const spy = jasmine.createSpy('dirty');
    fixture.componentInstance.dirtyChange.subscribe(spy);
    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
    expect(spy).toHaveBeenCalledOnceWith(true);
  });

  it('shows an inline error and preserves values when the save fails', () => {
    const fixture = create('LOAD');
    const c = fixture.componentInstance;
    c.load.set(120);
    c.save();
    http.expectOne('/api/box/sessions/items/i1/score').flush('boom', { status: 0, statusText: 'Network' });
    expect(c.error()).toContain("Couldn't save");
    expect(c.load()).toBe(120);
    expect(c.pending()).toBeFalse();
  });
});

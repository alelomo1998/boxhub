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

  it('emits dirtyChange when the division segmented control changes', () => {
    const fixture = create('TIME');
    const spy = jasmine.createSpy('dirty');
    fixture.componentInstance.dirtyChange.subscribe(spy);
    const radios: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]'));
    const other = radios.find(r => r.getAttribute('aria-checked') === 'false')!;
    other.click();
    expect(spy).toHaveBeenCalledOnceWith(true);
  });

  it('emits dirtyChange when the Finished switch is toggled', () => {
    const fixture = create('TIME');
    const spy = jasmine.createSpy('dirty');
    fixture.componentInstance.dirtyChange.subscribe(spy);
    const switches: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="switch"]'));
    const finished = switches.find(s => s.textContent?.includes('Finished'))!;
    finished.click();
    expect(spy).toHaveBeenCalledOnceWith(true);
  });

  it('emits dirtyChange when the Private switch is toggled', () => {
    const fixture = create('TIME');
    const spy = jasmine.createSpy('dirty');
    fixture.componentInstance.dirtyChange.subscribe(spy);
    const switches: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="switch"]'));
    const priv = switches.find(s => s.textContent?.includes('Private'))!;
    priv.click();
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

  // --- team pieces (M14c-a Task 12) ---------------------------------------------------------

  /** A team fixture: the class members arrive from the athlete-visible session detail. */
  function createTeam(teamSize: number, scoreType = 'TIME') {
    const fixture = TestBed.createComponent(ScoreFormComponent);
    const c = fixture.componentInstance;
    c.itemId = 'i1'; c.scoreType = scoreType; c.teamSize = teamSize; c.sessionId = 's1';
    fixture.detectChanges();
    http.expectOne('/api/box/sessions/items/i1/score').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/box/sessions/s1/detail').flush({
      id: 's1', name: 'WOD', startAt: '2026-09-08T18:00:00Z', durationMin: 60, capacity: 12,
      imagePath: null, programmingStatus: 'PUBLISHED', coach: null,
      active: [
        { membershipId: 'm1', name: 'Ada', avatarPath: null, status: 'BOOKED', me: true },
        { membershipId: 'm2', name: 'Bo', avatarPath: null, status: 'BOOKED', me: false },
        { membershipId: 'm3', name: 'Cy', avatarPath: null, status: 'BOOKED', me: false },
      ],
      queue: [],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('seeds the caller into the team and never offers them as a partner', () => {
    const c = createTeam(2).componentInstance;
    expect(c.team().map(m => m.membershipId)).toEqual(['m1']);
    expect(c.partnerRows().map(r => r.id)).toEqual(['m2', 'm3']);
  });

  it('asks for partners on a team piece and posts one team result', () => {
    const fixture = createTeam(2);
    const c = fixture.componentInstance;
    c.mins.set(5); c.secs.set(0);
    c.onPartnerPicked({ id: 'm2' });
    c.save();
    const req = http.expectOne('/api/box/sessions/items/i1/score/team');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.membershipIds).toEqual(['m1', 'm2']);
    req.flush([]);
  });

  it('blocks the save until the team is complete, and says so', () => {
    const c = createTeam(3).componentInstance;
    c.mins.set(5); c.secs.set(0);
    c.save();
    http.expectNone('/api/box/sessions/items/i1/score/team');
    expect(c.error()).toContain('3');
  });

  it('posts an individual score unchanged when the piece is not a team piece', () => {
    const c = create('TIME').componentInstance;
    c.mins.set(4); c.secs.set(0);
    c.save();
    const req = http.expectOne('/api/box/sessions/items/i1/score');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.timeSeconds).toBe(240);
    req.flush({});
    http.expectNone('/api/box/sessions/items/i1/score/team');
  });

  it('will not drop the caller from their own team', () => {
    const c = createTeam(2).componentInstance;
    c.removePartner('m1');
    expect(c.team().map(m => m.membershipId)).toEqual(['m1']);
  });

  it('reopens the partner sheet after a pick, because open is one-way', () => {
    const c = createTeam(3).componentInstance;
    c.openPartners();
    expect(c.pickOpen()).toBeTrue();
    c.onPartnerPicked({ id: 'm2' });
    expect(c.pickOpen()).toBeFalse();
    c.openPartners();
    expect(c.pickOpen()).toBeTrue();
  });
});

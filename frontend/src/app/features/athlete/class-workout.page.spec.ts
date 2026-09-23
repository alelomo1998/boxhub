import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { ClassWorkoutPage } from './class-workout.page';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { BookStore } from '../booking/book.store';
import type { SessionView } from '../booking/booking.service';
import type { SessionItem, Wod } from '../programming/programming.service';

function wod(overrides: Partial<Wod> = {}): Wod {
  return {
    id: 'w1', title: 'Fran', wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: 'FOR_TIME',
    timing: { rounds: 1, segments: [] }, library: true, teamSize: 1, teamShare: null,
    scoreType: 'TIME', timeCapSeconds: null, bodyText: '', blocks: { blocks: [] },
    scalingNotes: null, benchmarkTemplateId: null, ...overrides,
  };
}

function item(overrides: Partial<SessionItem> = {}): SessionItem {
  return { id: 'i1', wodId: 'w1', wod: wod(), sortOrder: 0, scoreable: true, scoreType: 'TIME', myScoreLogged: false, ...overrides };
}

function bookRow(id: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    id, name: 'Burn It', startAt: new Date().toISOString(), durationMin: 60, capacity: 10,
    coachId: null, coachName: null, status: 'ACTIVE', programmingStatus: 'PUBLISHED',
    bookedCount: 3, waitlistCount: 0, booked: [], myBookingStatus: null, myPosition: null,
    imagePath: null, coachAvatarPath: null, people: [], ...overrides,
  };
}

describe('ClassWorkoutPage', () => {
  let http: HttpTestingController;

  function setup(id = 's1') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ClassWorkoutPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    // Seeded so ctx resolves from the BookStore peek, never the sessionDetail fallback -- keeps
    // every test to exactly two in-flight requests (items, weightUnit).
    TestBed.inject(BookStore).sessions.set([bookRow(id)]);
    const fixture = TestBed.createComponent(ClassWorkoutPage);
    fixture.detectChanges();
    return fixture;
  }

  function flushItems(fixture: any, items: SessionItem[], weightUnit: 'KG' | 'LB' = 'KG') {
    http.expectOne(r => r.url === '/api/box/sessions/s1/items').flush(items);
    http.expectOne(r => r.url === '/api/box/current').flush({ weightUnit });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('renders a piece from expandedRows with the unit in the reps column', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [{ lines: [{ text: 'Row', reps: '8', unit: 'CAL' }] }] } });
    flushItems(fixture, [item({ wod: w })]);

    const reps = fixture.nativeElement.querySelector('.ln .reps');
    expect(reps.textContent).toContain('8');
    expect(reps.querySelector('.u').textContent.trim()).toBe('cal');
  });

  it('renders a sub-block label as a chip and does not indent its lines', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [
      { label: 'Chipper', lines: [{ text: 'Double-under', reps: '50' }],
        blocks: [{ label: 'Buy-in', lines: [{ text: 'Double-under', reps: '50' }] }] },
    ] } });
    flushItems(fixture, [item({ wod: w })]);

    const chip = fixture.nativeElement.querySelector('.blabel.chip');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('Buy-in');
    // B2: no wrapper/indent around a sub-block's lines -- the line is a plain sibling of the chip,
    // a direct child of .pc same as everything else in the piece.
    const ln = chip.nextElementSibling;
    expect(ln.classList.contains('ln')).toBeTrue();
    expect(ln.parentElement.classList.contains('pc')).toBeTrue();
  });

  it('renders a block note after its lines', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [
      { label: 'Squat', note: '@ 80% — log your top set', lines: [{ text: 'Back Squat', reps: '5x5' }] },
    ] } });
    flushItems(fixture, [item({ wod: w })]);

    const pc = fixture.nativeElement.querySelector('.pc');
    const children: HTMLElement[] = Array.from(pc.querySelectorAll('.blabel, .ln, .note'));
    const lnIdx = children.findIndex(el => el.classList.contains('ln'));
    const noteIdx = children.findIndex(el => el.classList.contains('note'));
    expect(lnIdx).toBeLessThan(noteIdx);
    expect(pc.querySelector('.note').textContent).toContain('@ 80%');
  });

  it('keeps scaled lines through expandedRows', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [
      { lines: [{ text: 'Pull-up', reps: '', scales: [{ text: 'Ring row' }] }] },
    ] } });
    flushItems(fixture, [item({ wod: w })]);

    const scaleRow = fixture.nativeElement.querySelector('.ln.sc');
    expect(scaleRow).not.toBeNull();
    expect(scaleRow.querySelector('.reps').textContent).toContain('↳');
    expect(scaleRow.querySelector('.mv').textContent.trim()).toBe('Ring row');
  });

  it('a scale carrying a load composes it with the box weight unit', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [
      { lines: [{ text: 'Thruster', reps: '21', load: '43/30', scales: [{ text: 'Thruster', load: '30/20' }] }] },
    ] } });
    flushItems(fixture, [item({ wod: w })]);

    const scaleRow = fixture.nativeElement.querySelector('.ln.sc');
    expect(scaleRow.querySelector('.mv').textContent.trim()).toBe('Thruster 30/20 kg');
  });

  it('a line with a load renders the box weight unit lowercased after it', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [{ lines: [{ text: 'Thruster', reps: '21', load: '43/30' }] }] } });
    flushItems(fixture, [item({ wod: w })]);

    const ld = fixture.nativeElement.querySelector('.ld');
    expect(ld.textContent.trim()).toBe('43/30 kg');
  });

  it('falls back to bodyText when a piece has no blocks', () => {
    const fixture = setup();
    const w = wod({ blocks: { blocks: [] }, bodyText: '5 rounds of...' });
    flushItems(fixture, [item({ wod: w })]);

    const pre = fixture.nativeElement.querySelector('.bodytext');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('5 rounds of...');
    expect(fixture.nativeElement.querySelector('.ln')).toBeNull();
  });

  it('shows the empty state when the class is published with no items', () => {
    const fixture = setup();
    flushItems(fixture, []);

    expect(fixture.nativeElement.textContent).toContain('Nothing posted yet');
    expect(fixture.nativeElement.textContent).toContain("hasn't written this class up");
  });

  it('sets the shell title to "Workout" and no morph key', () => {
    const fixture = setup();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.detailTitle()).toBe('Workout');
    expect(chrome.detailMorphKey()).toBeNull();
    flushItems(fixture, []);
  });
});

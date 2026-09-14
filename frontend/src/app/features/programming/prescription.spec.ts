import { prescriptionLines, wodMatchesText, libMeta } from './prescription';
import { Wod } from './programming.service';

const base: Wod = {
  id: 'w', title: 'T', wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: null, timing: { rounds: 1, segments: [] },
  library: true, teamSize: 1, teamShare: null, scoreType: 'TIME', timeCapSeconds: null,
  bodyText: '', blocks: { blocks: [] }, scalingNotes: null, benchmarkTemplateId: null,
};

describe('prescriptionLines', () => {
  it('flattens both block levels with reps and load', () => {
    const w = { ...base, blocks: { blocks: [
      { label: 'A', lines: [{ text: 'Thrusters', reps: '21', load: '43' }],
        blocks: [{ lines: [{ text: 'Pull-ups', reps: '21' }] }] },
    ] } };
    expect(prescriptionLines(w)).toEqual(['21 Thrusters (43)', '21 Pull-ups']);
  });

  it('shows a non-REPS unit next to the reps count', () => {
    const w = { ...base, blocks: { blocks: [{ lines: [{ text: 'Run', reps: '400', unit: 'M' }] }] } };
    expect(prescriptionLines(w)).toEqual(['400 M Run']);
  });

  it('lowercases the box weight unit onto a load', () => {
    const w = { ...base, blocks: { blocks: [{ lines: [{ text: 'Thruster', reps: '21', load: '43' }] }] } };
    expect(prescriptionLines(w, 'KG')).toEqual(['21 Thruster (43 kg)']);
  });

  it('returns nothing for a piece with no blocks', () => {
    expect(prescriptionLines(base)).toEqual([]);
  });
});

describe('wodMatchesText', () => {
  it('matches a benchmark by a movement in its body text', () => {
    expect(wodMatchesText({ ...base, bodyText: 'Thrusters, Pull-Ups' }, 'pull')).toBeTrue();
    expect(wodMatchesText({ ...base, bodyText: 'Thrusters' }, 'pull')).toBeFalse();
  });
});

describe('libMeta', () => {
  it('joins macro and preset', () => {
    expect(libMeta({ ...base, timingPreset: 'AMRAP' })).toBe('Workout · AMRAP');
    expect(libMeta(base)).toBe('Workout');
  });
});

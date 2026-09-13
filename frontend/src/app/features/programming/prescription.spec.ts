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
      { label: 'A', lines: [{ text: 'Thrusters', reps: '21', load: '43', unit: 'KG' }],
        blocks: [{ lines: [{ text: 'Pull-ups', reps: '21' }] }] },
    ] } };
    expect(prescriptionLines(w)).toEqual(['21 Thrusters (43 KG)', '21 Pull-ups']);
  });

  it('splits a benchmark sentence when there are no blocks', () => {
    const w = { ...base, bodyText: '21-15-9 reps for time: Thrusters (95/65 lb), Pull-Ups' };
    expect(prescriptionLines(w)).toEqual(['21-15-9 reps for time', 'Thrusters (95/65 lb)', 'Pull-Ups']);
  });

  it('returns nothing for a piece with neither', () => {
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

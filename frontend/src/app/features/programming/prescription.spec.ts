import { expandedRows, prescriptionLines, wodMatchesText, libMeta, eyebrowFor, ExpandedRow } from './prescription';
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
    expect(prescriptionLines(w)).toEqual(['400 m Run']);
  });

  it('lowercases the box weight unit onto a load', () => {
    const w = { ...base, blocks: { blocks: [{ lines: [{ text: 'Thruster', reps: '21', load: '43' }] }] } };
    expect(prescriptionLines(w, 'KG')).toEqual(['21 Thruster (43 kg)']);
  });

  it('returns nothing for a piece with no blocks', () => {
    expect(prescriptionLines(base)).toEqual([]);
  });
});

describe('expandedRows', () => {
  it('emits a block\'s label, lines, then note, in order -- and a sub-block\'s the same way', () => {
    const w = { ...base, blocks: { blocks: [
      {
        label: '5 rounds', note: 'Rest 3 min between rounds',
        lines: [{ text: 'Pull-Up', reps: '20' }],
        blocks: [{ label: 'Cash-out', note: 'Easy pace', lines: [{ text: 'Row', reps: '250', unit: 'M' }] }],
      },
    ] } };
    expect(expandedRows(w)).toEqual([
      { kind: 'label', text: '5 rounds', sub: false },
      { kind: 'line', reps: '20', text: 'Pull-Up', load: undefined, unit: undefined, scales: undefined, sub: false },
      { kind: 'note', text: 'Rest 3 min between rounds', sub: false },
      { kind: 'label', text: 'Cash-out', sub: true },
      { kind: 'line', reps: '250', text: 'Row', load: undefined, unit: 'M', scales: undefined, sub: true },
      { kind: 'note', text: 'Easy pace', sub: true },
    ]);
  });

  it('omits a note row when the block has none', () => {
    const w = { ...base, blocks: { blocks: [{ label: 'A', lines: [{ text: 'Thrusters', reps: '21' }] }] } };
    expect(expandedRows(w).some(r => r.kind === 'note')).toBeFalse();
  });

  it('passes line.scales through at both block levels (M17a Task 12c)', () => {
    const scales = [{ text: 'Ring row' }];
    const w = { ...base, blocks: { blocks: [
      {
        label: 'A', lines: [{ text: 'Pull-Up', reps: '21', scales }],
        blocks: [{ label: 'B', lines: [{ text: 'Row', reps: '250', unit: 'M', scales }] }],
      },
    ] } };
    const rows = expandedRows(w).filter((r): r is Extract<ExpandedRow, { kind: 'line' }> => r.kind === 'line');
    expect(rows[0].scales).toBe(scales);
    expect(rows[1].scales).toBe(scales);
  });

  it('prescriptionLines is unaffected by the presence of scales', () => {
    const w = { ...base, blocks: { blocks: [
      { lines: [{ text: 'Thruster', reps: '21', load: '43', scales: [{ text: 'Box step-up' }] }] },
    ] } };
    expect(prescriptionLines(w)).toEqual(['21 Thruster (43)']);
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

describe('eyebrowFor', () => {
  it('drops the macro for a benchmark with a timing preset -- the preset alone', () => {
    expect(eyebrowFor({ ...base, timingPreset: 'AMRAP' }, 'GIRL')).toBe('AMRAP');
  });

  // The libMeta fallback used to return "Workout" here, which is true of every benchmark and so
  // told the reader nothing -- the chip beside it already says "Benchmark" (audit P2-2).
  it('is EMPTY for a benchmark with no timing preset, so the kind stands alone', () => {
    expect(eyebrowFor(base, 'GIRL')).toBe('');
  });

  it('a plain piece (no benchmarkKind) is unchanged -- always libMeta', () => {
    expect(eyebrowFor({ ...base, timingPreset: 'AMRAP' }, null)).toBe('Workout · AMRAP');
  });
});

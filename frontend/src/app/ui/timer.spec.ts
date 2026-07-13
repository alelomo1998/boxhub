import { renderTimer, TimerSpec } from './timer';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

describe('renderTimer', () => {
  it('For Time counts up and caps', () => {
    const spec: TimerSpec = { type: 'FOR_TIME', totalSeconds: 300 };
    expect(renderTimer(spec, 1000, 0, 'RUNNING', 1000 + 65_000).display).toBe('1:05');
    const capped = renderTimer(spec, 1000, 0, 'RUNNING', 1000 + 400_000);
    expect(capped.display).toBe('5:00');
    expect(capped.done).toBeTrue();
  });

  it('AMRAP counts down to zero', () => {
    const spec: TimerSpec = { type: 'AMRAP', totalSeconds: 600 };
    expect(renderTimer(spec, 0, 0, 'RUNNING', 90_000).display).toBe(mmss(600 - 90));
    const over = renderTimer(spec, 0, 0, 'RUNNING', 700_000);
    expect(over.display).toBe('0:00');
    expect(over.done).toBeTrue();
  });

  it('EMOM shows round and seconds left in the minute', () => {
    const spec: TimerSpec = { type: 'EMOM', rounds: 10, workSeconds: 60 };
    const r = renderTimer(spec, 0, 0, 'RUNNING', 75_000); // 1:15 in -> round 2, 45s left
    expect(r.phase).toContain('2/10');
    expect(r.display).toBe('0:45');
    expect(renderTimer(spec, 0, 0, 'RUNNING', 600_000).done).toBeTrue();
  });

  it('Tabata alternates work and rest', () => {
    const spec: TimerSpec = { type: 'TABATA', rounds: 8, workSeconds: 20, restSeconds: 10 };
    const work = renderTimer(spec, 0, 0, 'RUNNING', 5_000); // 5s in -> WORK, 15 left
    expect(work.phase).toContain('WORK');
    expect(work.display).toBe('0:15');
    const rest = renderTimer(spec, 0, 0, 'RUNNING', 25_000); // 25s in -> REST (cycle 30), 5 left
    expect(rest.phase).toContain('REST');
    expect(rest.display).toBe('0:05');
    expect(renderTimer(spec, 0, 0, 'RUNNING', 8 * 30_000).done).toBeTrue();
  });

  it('PAUSED freezes elapsed at pausedElapsedMs', () => {
    const spec: TimerSpec = { type: 'AMRAP', totalSeconds: 600 };
    expect(renderTimer(spec, null, 120_000, 'PAUSED', 999_999).display).toBe(mmss(600 - 120));
  });
});

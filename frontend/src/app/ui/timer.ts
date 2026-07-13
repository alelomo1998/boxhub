export interface TimerSpec {
  type: string; // FOR_TIME | AMRAP | EMOM | TABATA
  totalSeconds?: number;
  rounds?: number;
  workSeconds?: number;
  restSeconds?: number;
}

export interface TimerRender { display: string; phase: string; done: boolean; }

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pure clock render. elapsed = pausedElapsedMs + (RUNNING ? nowMs - startAtEpoch : 0). Server never ticks. */
export function renderTimer(spec: TimerSpec, startAtEpoch: number | null, pausedElapsedMs: number,
                            status: string, nowMs: number): TimerRender {
  const running = status === 'RUNNING' && startAtEpoch != null;
  const elapsedMs = pausedElapsedMs + (running ? nowMs - startAtEpoch! : 0);
  const elapsed = Math.max(0, elapsedMs / 1000);

  switch (spec.type) {
    case 'FOR_TIME': {
      const cap = spec.totalSeconds ?? 0;
      const shown = Math.min(elapsed, cap);
      return { display: mmss(shown), phase: '', done: elapsed >= cap };
    }
    case 'AMRAP': {
      const total = spec.totalSeconds ?? 0;
      const left = total - elapsed;
      return { display: mmss(left), phase: '', done: left <= 0 };
    }
    case 'EMOM': {
      const iv = spec.workSeconds ?? 60;
      const rounds = spec.rounds ?? 0;
      const round = Math.floor(elapsed / iv) + 1;
      const leftInIv = iv - (elapsed % iv);
      const done = round > rounds;
      return { display: mmss(done ? 0 : leftInIv), phase: `ROUND ${Math.min(round, rounds)}/${rounds}`, done };
    }
    case 'TABATA': {
      const work = spec.workSeconds ?? 20, rest = spec.restSeconds ?? 10, rounds = spec.rounds ?? 0;
      const cycle = work + rest;
      const round = Math.floor(elapsed / cycle) + 1;
      const inCycle = elapsed % cycle;
      const isWork = inCycle < work;
      const left = isWork ? work - inCycle : cycle - inCycle;
      const done = round > rounds;
      return {
        display: mmss(done ? 0 : left),
        phase: done ? '' : `${isWork ? 'WORK' : 'REST'} ${Math.min(round, rounds)}/${rounds}`,
        done,
      };
    }
    default:
      return { display: mmss(elapsed), phase: '', done: false };
  }
}

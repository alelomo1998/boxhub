import { Wod } from './programming.service';

export const MACRO_LABELS: Record<string, string> = {
  WARMUP: $localize`:@@class.macro.warmup:Warmup`,
  STRENGTH: $localize`:@@class.macro.strength:Strength`,
  GYMNASTIC: $localize`:@@class.macro.gymnastic:Gymnastic`,
  WORKOUT: $localize`:@@class.macro.workout:Workout`,
};

export const PRESET_LABELS: Record<string, string> = {
  FOR_TIME: $localize`:@@class.preset.forTime:For time`,
  AMRAP: $localize`:@@class.preset.amrap:AMRAP`,
  EMOM: $localize`:@@class.preset.emom:EMOM`,
  TABATA: $localize`:@@class.preset.tabata:Tabata`,
  INTERVAL: $localize`:@@class.preset.interval:Interval`,
};

/** One printable row of an expanded piece's body, flattened from `wod.blocks` (two levels deep,
 *  the server rejects a third). Built once per render by `expandedRows` so the template stays a
 *  flat @for instead of nested loops. */
export type ExpandedRow =
  | { kind: 'label'; text: string; sub: boolean }
  | { kind: 'line'; reps?: string; text: string; load?: string; unit?: string; sub: boolean };

/** Walk one level of nesting -- blocks are exactly two levels deep (server rejects a third). */
export function wodMatchesText(w: Wod, needle: string): boolean {
  if (!needle) return true;
  if (w.title.toLowerCase().includes(needle)) return true;
  for (const b of w.blocks?.blocks ?? []) {
    if ((b.lines ?? []).some(l => l.text?.toLowerCase().includes(needle))) return true;
    for (const sb of b.blocks ?? []) {
      if ((sb.lines ?? []).some(l => l.text?.toLowerCase().includes(needle))) return true;
    }
  }
  if ((w.bodyText ?? '').toLowerCase().includes(needle)) return true;
  return false;
}

/** Flattens `wod.blocks` (label, lines, one level of sub-blocks) into printable rows. Empty
 *  when the piece has no blocks -- the caller falls back to the legacy `bodyText`. Takes the
 *  `Wod` directly (not a `PieceDraft`) so the fill-slot sheet's detail step -- which only ever
 *  has a library `Wod`, not a draft -- can reuse it too. */
export function expandedRows(w: Wod | null): ExpandedRow[] {
  const blocks = w?.blocks?.blocks ?? [];
  const rows: ExpandedRow[] = [];
  for (const b of blocks) {
    if (b.label) rows.push({ kind: 'label', text: b.label, sub: false });
    for (const l of b.lines ?? []) {
      rows.push({ kind: 'line', reps: l.reps, text: l.text, load: l.load, unit: l.unit, sub: false });
    }
    for (const sb of b.blocks ?? []) {
      if (sb.label) rows.push({ kind: 'label', text: sb.label, sub: true });
      for (const l of sb.lines ?? []) {
        rows.push({ kind: 'line', reps: l.reps, text: l.text, load: l.load, unit: l.unit, sub: true });
      }
    }
  }
  return rows;
}

/** Score types a coach reads. NONE has no label: an unscored piece shows nothing, not "None". */
export const SCORE_TYPE_LABELS: Record<string, string> = {
  TIME: $localize`:@@programming.score.time:Time`,
  ROUNDS_REPS: $localize`:@@programming.score.roundsReps:Rounds + reps`,
  LOAD: $localize`:@@programming.score.load:Load`,
};

export const BENCHMARK_KIND_LABELS: Record<string, string> = {
  GIRL: $localize`:@@programming.benchmark.girl:Girl`,
  HERO: $localize`:@@programming.benchmark.hero:Hero`,
  OTHER: $localize`:@@programming.benchmark.other:Benchmark`,
};

/** "Workout · For time" / "Warmup" -- a piece's category line. Moved from the class stack. */
export function libMeta(w: Wod): string {
  const macro = MACRO_LABELS[w.macro] ?? w.macro;
  return w.timingPreset ? `${macro} · ${PRESET_LABELS[w.timingPreset] ?? w.timingPreset}` : macro;
}

/**
 * A piece's prescription as printable lines: every line of both block levels, "reps unit text
 * (load boxUnit)" -- e.g. "400 M Run", "21 Thrusters (43 kg)". `weightUnit` is the box's own
 * (R2/D22): a benchmark's load is stored in lb and WodService converts it server-side, so this
 * only lowercases whatever unit label the caller already resolved for display.
 */
export function prescriptionLines(w: Wod, weightUnit?: string): string[] {
  return expandedRows(w)
    .filter((r): r is Extract<ExpandedRow, { kind: 'line' }> => r.kind === 'line')
    .map(l => [
      (l.reps ?? '') + (l.unit && l.unit !== 'REPS' ? ' ' + l.unit : ''),
      l.text,
      l.load ? `(${l.load}${weightUnit ? ' ' + weightUnit.toLowerCase() : ''})` : '',
    ].filter(Boolean).join(' '));
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';

export interface Movement { id: string; name: string; category: string; modality: string | null;
                            global: boolean; units: string[]; loadable: boolean; }

/** Order matters: index 0 is a movement's (or free text's) default unit. */
export const MOVEMENT_UNITS = ['REPS', 'CAL', 'M', 'KM', 'MI', 'FT', 'SEC'] as const;

/** The seeded 122's six categories -- a hand-typed movement must land in a real one, never a
 *  synthesized catch-all (there is no seventh). */
export const MOVEMENT_CATEGORIES =
  ['BARBELL', 'DUMBBELL', 'GYMNASTICS', 'KETTLEBELL', 'MONOSTRUCTURAL', 'ODD_OBJECT'] as const;

/**
 * What a coach reads. The values above are database constants and had been rendering raw on every
 * picker row -- the user asked what "ODD_OBJECT" was, which is the whole argument for this map.
 * Screaming snake case is a storage detail and is never user-facing copy.
 *
 * Monostructural and odd object are kept rather than softened to "cardio" and "strongman": both are
 * the words a CrossFit coach actually uses, and PRODUCT.md's first design principle is to match
 * that vocabulary.
 */
export const MOVEMENT_CATEGORY_LABELS: Record<string, string> = {
  BARBELL: $localize`:@@movement.category.barbell:Barbell`,
  DUMBBELL: $localize`:@@movement.category.dumbbell:Dumbbell`,
  GYMNASTICS: $localize`:@@movement.category.gymnastics:Gymnastics`,
  KETTLEBELL: $localize`:@@movement.category.kettlebell:Kettlebell`,
  MONOSTRUCTURAL: $localize`:@@movement.category.monostructural:Monostructural`,
  ODD_OBJECT: $localize`:@@movement.category.oddObject:Odd object`,
};

/** Falls back to the raw value rather than rendering blank: an unlabelled category is a missing
 *  label, and hiding it makes that impossible to notice. */
export function movementCategoryLabel(category: string | null | undefined): string {
  if (!category) return '';
  return MOVEMENT_CATEGORY_LABELS[category] ?? category;
}

export const MACROS = ['WARMUP', 'STRENGTH', 'GYMNASTIC', 'WORKOUT'] as const;
export const TIMING_PRESETS = ['FOR_TIME', 'AMRAP', 'EMOM', 'TABATA', 'INTERVAL'] as const;
export const TEAM_SHARES = ['TOGETHER', 'SPLIT', 'RELAY'] as const;

export interface WodScale { text?: string; movementId?: string; reps?: string; load?: string; unit?: string; }

// `scaling` is legacy input only and never comes back populated: the server normalises an old
// free-text value into a one-entry `scales` list on read (spec 5A.2).
export interface WodLine {
  text: string; movementId?: string; reps?: string; load?: string; unit?: string; scales?: WodScale[];
}

export interface WodSegment { seconds: number; kind: 'WORK' | 'REST'; label?: string; blockIndex?: number; }
export interface WodTiming { rounds: number; segments: WodSegment[]; }

// A block holds lines, sub-blocks, or both. EXACTLY two levels deep: a nested block must not
// carry `blocks` -- the server rejects a third with BLOCK_DEPTH.
export interface WodBlock { label?: string; note?: string; lines?: WodLine[]; blocks?: WodBlock[]; }
export interface WodBlocks { blocks: WodBlock[]; }

export interface Wod {
  id: string; title: string; wodType: string;
  macro: string; timingPreset: string | null; timing: WodTiming;
  library: boolean; teamSize: number; teamShare: string | null;
  scoreType: string; timeCapSeconds: number | null;
  bodyText: string; blocks: WodBlocks; scalingNotes: string | null; benchmarkTemplateId: string | null;
}
export interface Benchmark {
  id: string; name: string; kind: string; scoreType: string;
  timeCapSeconds: number | null; bodyText: string; blocks: WodBlocks;
}
export interface SessionItem {
  id: string; wodId: string; wod: Wod; sortOrder: number;
  scoreable: boolean; scoreType: string; myScoreLogged: boolean;
}
export interface ItemInput {
  id?: string | null;
  wodId?: string | null;
  fromLibraryWodId?: string | null;
  fromBenchmarkId?: string | null;
  scoreable: boolean;
  scoreType?: string | null;
}

/** One row of the library: a box wod, or a global benchmark adapted to the Wod shape. */
export interface LibraryEntry {
  wod: Wod;
  /** GIRL / HERO / OTHER for a benchmark -- global, or the box's own copy of one. null otherwise. */
  benchmarkKind: string | null;
  /** A global benchmark (wod.id IS the benchmark id): opening it shows the add sheet, picking it
   *  into a class sends fromBenchmarkId. */
  global: boolean;
}

export interface WodHistoryRow { itemId: string; sessionId: string; className: string; startAt: string; wod: Wod; }

/** `GET /api/box/library` (R3/R6): `q` only applies at >=3 chars (server enforces too); `movement`
 *  and `kind` are repeated params. `cursor` null/omitted asks for page one. */
export interface LibraryQuery {
  q?: string; macro?: string; timing?: string; movement?: string[];
  benchmarks?: boolean; kind?: string[]; cursor?: string | null;
}
export interface LibraryPage { rows: LibraryEntry[]; nextCursor: string | null; total: number; }

export function benchmarkAsWod(b: Benchmark): Wod {
  return {
    id: b.id, title: b.name, wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: null,
    timing: { rounds: 1, segments: [] }, library: true, teamSize: 1, teamShare: null,
    scoreType: b.scoreType, timeCapSeconds: b.timeCapSeconds, bodyText: b.bodyText, blocks: b.blocks,
    scalingNotes: null, benchmarkTemplateId: b.id,
  };
}

/**
 * Saved pieces first (server order: newest updated), then every benchmark the box has NOT copied,
 * in the server's kind-then-name order. Once a box piece carries a benchmark's id the global row
 * hides (spec D9) -- never two Frans.
 */
export function mergeLibrary(wods: Wod[], benchmarks: Benchmark[]): LibraryEntry[] {
  const kindById = new Map(benchmarks.map(b => [b.id, b.kind]));
  const copied = new Set(wods.map(w => w.benchmarkTemplateId).filter((id): id is string => !!id));
  return [
    ...wods.map(w => ({
      wod: w, global: false,
      benchmarkKind: w.benchmarkTemplateId ? kindById.get(w.benchmarkTemplateId) ?? null : null,
    })),
    ...benchmarks.filter(b => !copied.has(b.id))
      .map(b => ({ wod: benchmarkAsWod(b), benchmarkKind: b.kind, global: true })),
  ];
}

export interface TeamScoreInput {
  membershipIds: string[]; teamName?: string | null;
  rx: boolean; timeSeconds?: number | null; rounds?: number | null; reps?: number | null;
  load?: number | null; finished?: boolean | null; notes?: string | null; isPrivate: boolean;
}
export interface SkeletonPiece { id?: string; sortOrder?: number; label: string; wodType: string; }
export interface SessionRef {
  id: string; name: string; startAt: string; imagePath: string | null; programmingStatus: string;
}
export interface MyClass { session: SessionRef | null; booked: boolean; items: SessionItem[]; otherToday: SessionRef[]; }

export type WodInput = Partial<Omit<Wod, 'id' | 'blocks'>> & { blocks?: WodBlocks; saveToLibrary?: boolean };

export const PIECE_TYPES = ['WARMUP', 'STRENGTH', 'FOR_TIME', 'AMRAP', 'EMOM', 'INTERVAL', 'CIRCUIT', 'SKILL', 'CUSTOM'];

@Injectable({ providedIn: 'root' })
export class ProgrammingService {
  private http = inject(HttpClient);

  // movements (unchanged)
  movements(search?: string, category?: string): Observable<Movement[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (category) params = params.set('category', category);
    return this.http.get<Movement[]>('/api/box/movements', { params });
  }
  createMovement(m: { name: string; category: string; modality?: string; units?: string[]; loadable?: boolean }): Observable<Movement> {
    return this.http.post<Movement>('/api/box/movements', m);
  }
  patchMovement(id: string, patch: Partial<Movement>): Observable<Movement> {
    return this.http.patch<Movement>(`/api/box/movements/${id}`, patch);
  }

  // piece library (wods)
  wods(search?: string): Observable<Wod[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<Wod[]>('/api/box/wods', { params });
  }
  wod(id: string): Observable<Wod> { return this.http.get<Wod>(`/api/box/wods/${id}`); }
  createWod(w: WodInput): Observable<Wod> { return this.http.post<Wod>('/api/box/wods', w); }
  patchWod(id: string, w: WodInput): Observable<Wod> { return this.http.patch<Wod>(`/api/box/wods/${id}`, w); }
  deleteWod(id: string): Observable<void> { return this.http.delete<void>(`/api/box/wods/${id}`); }

  libraryEntries(): Observable<LibraryEntry[]> {
    return forkJoin([this.wods(), this.benchmarks()]).pipe(map(([w, b]) => mergeLibrary(w, b)));
  }

  wodHistory(day: string): Observable<WodHistoryRow[]> {
    const params = new HttpParams().set('day', day);
    return this.http.get<WodHistoryRow[]>('/api/box/wods/history', { params });
  }

  /** R3/R6: the Library page's paged, filtered read. Array fields append as repeated params. */
  libraryPage(query: LibraryQuery): Observable<LibraryPage> {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.macro) params = params.set('macro', query.macro);
    if (query.timing) params = params.set('timing', query.timing);
    for (const m of query.movement ?? []) params = params.append('movement', m);
    if (query.benchmarks) params = params.set('benchmarks', 'true');
    for (const k of query.kind ?? []) params = params.append('kind', k);
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.http.get<LibraryPage>('/api/box/library', { params });
  }

  // benchmarks (unchanged)
  benchmarks(kind?: string): Observable<Benchmark[]> {
    const params = kind ? new HttpParams().set('kind', kind) : undefined;
    return this.http.get<Benchmark[]>('/api/box/benchmarks', { params });
  }
  cloneBenchmark(id: string): Observable<Wod> { return this.http.post<Wod>(`/api/box/benchmarks/${id}/clone`, {}); }

  // class-instance programming
  sessionItems(sessionId: string): Observable<SessionItem[]> {
    return this.http.get<SessionItem[]>(`/api/box/sessions/${sessionId}/items`);
  }
  putItems(sessionId: string, items: ItemInput[]): Observable<SessionItem[]> {
    return this.http.put<SessionItem[]>(`/api/box/sessions/${sessionId}/items`, { items });
  }
  publishProgramming(sessionId: string, status: 'DRAFT' | 'PUBLISHED'): Observable<{ programmingStatus: string }> {
    return this.http.patch<{ programmingStatus: string }>(`/api/box/sessions/${sessionId}/programming`, { status });
  }
  putTeamScore(itemId: string, input: TeamScoreInput): Observable<unknown[]> {
    return this.http.post<unknown[]>(`/api/box/sessions/items/${itemId}/score/team`, input);
  }

  // skeletons on class types
  skeleton(templateId: string): Observable<SkeletonPiece[]> {
    return this.http.get<SkeletonPiece[]>(`/api/box/class-templates/${templateId}/skeleton`);
  }
  putSkeleton(templateId: string, pieces: SkeletonPiece[]): Observable<SkeletonPiece[]> {
    return this.http.put<SkeletonPiece[]>(`/api/box/class-templates/${templateId}/skeleton`,
      { pieces: pieces.map(p => ({ label: p.label, wodType: p.wodType })) });
  }

  // athlete WOD tab
  myClassToday(): Observable<MyClass> { return this.http.get<MyClass>('/api/box/my-class-today'); }

  // box weight unit, for the load field's suffix -- ATHLETE-minimum, so a coach may read it.
  weightUnit(): Observable<'KG' | 'LB'> {
    return this.http.get<{ weightUnit: 'KG' | 'LB' }>('/api/box/current').pipe(map(b => b.weightUnit));
  }
}

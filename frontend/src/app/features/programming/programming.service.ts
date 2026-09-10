import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Movement { id: string; name: string; category: string; modality: string | null; global: boolean; }

export const MACROS = ['WARMUP', 'STRENGTH', 'GYMNASTIC', 'WORKOUT'] as const;
export const TIMING_PRESETS = ['FOR_TIME', 'AMRAP', 'EMOM', 'TABATA', 'INTERVAL'] as const;
export const TEAM_SHARES = ['TOGETHER', 'SPLIT', 'RELAY'] as const;

export interface WodScale { text?: string; movementId?: string; reps?: string; load?: string; }

// `scaling` is legacy input only and never comes back populated: the server normalises an old
// free-text value into a one-entry `scales` list on read (spec 5A.2).
export interface WodLine {
  text: string; movementId?: string; reps?: string; load?: string; scales?: WodScale[];
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
  scoreable: boolean;
  scoreType?: string | null;
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
  createMovement(m: { name: string; category: string; modality?: string }): Observable<Movement> {
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
  duplicateWod(id: string): Observable<Wod> { return this.http.post<Wod>(`/api/box/wods/${id}/duplicate`, {}); }

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

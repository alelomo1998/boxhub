import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Movement { id: string; name: string; category: string; modality: string | null; global: boolean; }
export interface WodLine { text: string; movementId?: string; reps?: string; load?: string; scaling?: string; }
export interface WodBlock { label?: string; note?: string; lines: WodLine[]; }
export interface WodBlocks { blocks: WodBlock[]; }
export interface Wod {
  id: string; title: string; wodType: string; scoreType: string; timeCapSeconds: number | null;
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
export interface ItemInput { wodId: string; scoreable: boolean; scoreType?: string | null; }
export interface SkeletonPiece { id?: string; sortOrder?: number; label: string; wodType: string; }
export interface SessionRef {
  id: string; name: string; startAt: string; imagePath: string | null; programmingStatus: string;
}
export interface MyClass { session: SessionRef | null; booked: boolean; items: SessionItem[]; otherToday: SessionRef[]; }

export type WodInput = Partial<Omit<Wod, 'id' | 'blocks'>> & { blocks?: WodBlocks };

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
}

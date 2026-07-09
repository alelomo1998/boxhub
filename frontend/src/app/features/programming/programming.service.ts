import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Track { id: string; name: string; sortOrder: number; archived: boolean; }
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
export interface Slot {
  id: string; slotDate: string; trackId: string; trackName: string;
  wodId: string; wodTitle: string; status: string;
}
export interface BoardTrack { trackId: string; trackName: string; wod: Wod | null; status: string | null; }
export interface Board { date: string; tracks: BoardTrack[]; }

export type WodInput = Partial<Omit<Wod, 'id' | 'blocks'>> & { blocks?: WodBlocks };

@Injectable({ providedIn: 'root' })
export class ProgrammingService {
  private http = inject(HttpClient);

  // tracks
  tracks(): Observable<Track[]> { return this.http.get<Track[]>('/api/box/tracks'); }
  createTrack(name: string): Observable<Track> { return this.http.post<Track>('/api/box/tracks', { name }); }
  patchTrack(id: string, patch: Partial<Track>): Observable<Track> { return this.http.patch<Track>(`/api/box/tracks/${id}`, patch); }

  // movements
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

  // wods
  wods(search?: string): Observable<Wod[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<Wod[]>('/api/box/wods', { params });
  }
  wod(id: string): Observable<Wod> { return this.http.get<Wod>(`/api/box/wods/${id}`); }
  createWod(w: WodInput): Observable<Wod> { return this.http.post<Wod>('/api/box/wods', w); }
  patchWod(id: string, w: WodInput): Observable<Wod> { return this.http.patch<Wod>(`/api/box/wods/${id}`, w); }
  deleteWod(id: string): Observable<void> { return this.http.delete<void>(`/api/box/wods/${id}`); }
  duplicateWod(id: string): Observable<Wod> { return this.http.post<Wod>(`/api/box/wods/${id}/duplicate`, {}); }

  // benchmarks
  benchmarks(kind?: string): Observable<Benchmark[]> {
    const params = kind ? new HttpParams().set('kind', kind) : undefined;
    return this.http.get<Benchmark[]>('/api/box/benchmarks', { params });
  }
  cloneBenchmark(id: string): Observable<Wod> { return this.http.post<Wod>(`/api/box/benchmarks/${id}/clone`, {}); }

  // program (calendar)
  program(from: string, to: string, trackId?: string): Observable<Slot[]> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (trackId) params = params.set('trackId', trackId);
    return this.http.get<Slot[]>('/api/box/program', { params });
  }
  assignSlot(slotDate: string, trackId: string, wodId: string): Observable<Slot> {
    return this.http.put<Slot>('/api/box/program', { slotDate, trackId, wodId });
  }
  patchSlot(id: string, status: string): Observable<Slot> { return this.http.patch<Slot>(`/api/box/program/${id}`, { status }); }
  deleteSlot(id: string): Observable<void> { return this.http.delete<void>(`/api/box/program/${id}`); }
  publish(from: string, to: string, trackId?: string): Observable<{ published: number }> {
    return this.http.post<{ published: number }>('/api/box/program/publish', { from, to, trackId });
  }

  // board
  board(date?: string, includeDrafts?: boolean): Observable<Board> {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    if (includeDrafts) params = params.set('includeDrafts', 'true');
    return this.http.get<Board>('/api/box/wod-board', { params });
  }
}

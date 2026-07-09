import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Score {
  id: string; slotId: string; rx: boolean; timeSeconds: number | null; rounds: number | null;
  reps: number | null; load: number | null; finished: boolean; notes: string | null;
  isPrivate: boolean; scoreType: string;
}
export interface ScoreInput {
  rx: boolean; timeSeconds?: number | null; rounds?: number | null; reps?: number | null;
  load?: number | null; finished?: boolean; notes?: string | null; isPrivate: boolean;
}
export interface LeaderboardEntry {
  rank: number; athleteName: string; rx: boolean; timeSeconds: number | null;
  rounds: number | null; reps: number | null; load: number | null; finished: boolean;
}
export interface Leaderboard { scoreType: string; entries: LeaderboardEntry[]; }
export interface Lift {
  id: string; movementId: string; movementName: string; load: number; reps: number;
  performedOn: string; isPr: boolean; notes: string | null;
}
export interface LiftInput { movementId: string; load: number; reps?: number; performedOn?: string; notes?: string; }
export interface MyScore {
  slotId: string; slotDate: string; wodTitle: string; trackName: string; scoreType: string;
  rx: boolean; timeSeconds: number | null; rounds: number | null; reps: number | null;
  load: number | null; finished: boolean;
}
export interface BenchmarkHistory {
  benchmarkName: string; scoreType: string; timeSeconds: number | null; rounds: number | null;
  reps: number | null; load: number | null; achievedOn: string;
}

@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private http = inject(HttpClient);

  putScore(slotId: string, input: ScoreInput): Observable<Score> {
    return this.http.put<Score>(`/api/box/program/${slotId}/score`, input);
  }
  myScore(slotId: string): Observable<Score> {
    return this.http.get<Score>(`/api/box/program/${slotId}/score`);
  }
  leaderboard(slotId: string): Observable<Leaderboard> {
    return this.http.get<Leaderboard>(`/api/box/program/${slotId}/leaderboard`);
  }
  logLift(input: LiftInput): Observable<Lift> { return this.http.post<Lift>('/api/box/lifts', input); }
  lifts(movementId: string): Observable<Lift[]> {
    return this.http.get<Lift[]>('/api/box/lifts', { params: new HttpParams().set('movementId', movementId) });
  }
  prs(): Observable<Lift[]> { return this.http.get<Lift[]>('/api/box/lifts/prs'); }
  myScores(): Observable<MyScore[]> { return this.http.get<MyScore[]>('/api/box/my-scores'); }
  benchmarkHistory(): Observable<BenchmarkHistory[]> { return this.http.get<BenchmarkHistory[]>('/api/box/benchmark-history'); }
}

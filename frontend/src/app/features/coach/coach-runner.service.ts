import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TimerSpec } from '../../ui/timer';

export interface TimerState {
  specJson: string; status: string; startedAtEpoch: number | null; pausedElapsedMs: number; sessionItemId: string | null;
}
export interface ScoreCellInput {
  rx: boolean; timeSeconds?: number | null; rounds?: number | null; reps?: number | null;
  load?: number | null; finished?: boolean | null; notes?: string | null; isPrivate: boolean;
}

@Injectable({ providedIn: 'root' })
export class CoachRunnerService {
  private http = inject(HttpClient);

  timer(sessionId: string): Observable<TimerState | null> {
    return this.http.get<TimerState | null>(`/api/box/sessions/${sessionId}/timer`);
  }
  act(sessionId: string, action: string, body: { itemId?: string; spec?: TimerSpec } = {}): Observable<TimerState> {
    return this.http.post<TimerState>(`/api/box/sessions/${sessionId}/timer`, { action, ...body });
  }
  logFor(itemId: string, membershipId: string, input: ScoreCellInput): Observable<unknown> {
    return this.http.post(`/api/box/sessions/items/${itemId}/score/${membershipId}`, input);
  }
}

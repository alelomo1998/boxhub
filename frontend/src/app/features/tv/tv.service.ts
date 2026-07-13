import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TvState {
  view: 'CLASS' | 'IDLE';
  boxName: string;
  next: { name: string; startAt: string } | null;
  session: { id: string; name: string; startAt: string; durationMin: number;
             coachName: string | null; coachAvatarPath: string | null } | null;
  items: { type: string; title: string; bodyText: string | null }[];
  rail: { name: string; avatarPath: string | null; status: string;
          rank: number | null; score: string | null; rx: boolean | null }[];
  timer: {
    type: string; totalSeconds: number | null; rounds: number | null; workSeconds: number | null;
    restSeconds: number | null; startAtEpoch: number | null; pausedElapsedMs: number; status: string;
    pieceTitle: string | null; pieceBody: string | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class TvService {
  private http = inject(HttpClient);

  pair(): Observable<{ code: string; secret: string }> {
    return this.http.post<{ code: string; secret: string }>('/api/tv/pair', {});
  }

  poll(code: string, secret: string): Observable<{ token: string } | null> {
    // 202 has no body -> null; 200 -> {token}
    return this.http.post<{ token: string } | null>('/api/tv/pair/poll', { code, secret });
  }

  /** Native EventSource: auto-reconnect on gym wifi comes free. */
  stream(token: string): EventSource {
    return new EventSource('/api/tv/stream?token=' + encodeURIComponent(token));
  }
}

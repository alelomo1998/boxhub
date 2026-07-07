import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap, of, catchError } from 'rxjs';
import { ActiveBox, LoginResponse, MembershipDto } from './auth.models';

const K = {
  user: 'bh_user_token',
  refresh: 'bh_refresh_token',
  box: 'bh_box_token',
  activeBox: 'bh_active_box',
  memberships: 'bh_memberships',
} as const;

function safeParse<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    localStorage.removeItem(key); // corrupt value: drop it rather than brick bootstrap
    return fallback;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly memberships = signal<MembershipDto[]>(safeParse<MembershipDto[]>(K.memberships, []));
  readonly activeBox = signal<ActiveBox | null>(safeParse<ActiveBox | null>(K.activeBox, null));

  bearerToken(): string | null {
    return localStorage.getItem(K.box) ?? localStorage.getItem(K.user);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap(res => {
        localStorage.setItem(K.user, res.accessToken);
        localStorage.setItem(K.refresh, res.refreshToken);
        localStorage.setItem(K.memberships, JSON.stringify(res.memberships));
        localStorage.removeItem(K.box);
        localStorage.removeItem(K.activeBox);
        this.memberships.set(res.memberships);
        this.activeBox.set(null);
      }),
    );
  }

  selectBox(boxId: string): Observable<void> {
    const m = this.memberships().find(x => x.boxId === boxId);
    return this.http.post<{ accessToken: string }>('/api/auth/box-token', { boxId }).pipe(
      tap(res => {
        localStorage.setItem(K.box, res.accessToken);
        const active: ActiveBox = { boxId, boxName: m?.boxName ?? '', role: m?.role ?? 'ATHLETE' };
        localStorage.setItem(K.activeBox, JSON.stringify(active));
        this.activeBox.set(active);
      }),
      map(() => void 0),
    );
  }

  refresh(): Observable<boolean> {
    const rt = localStorage.getItem(K.refresh);
    if (!rt) return of(false);
    return this.http.post<LoginResponse>('/api/auth/refresh', { refreshToken: rt }).pipe(
      tap(res => {
        localStorage.setItem(K.user, res.accessToken);
        localStorage.setItem(K.refresh, res.refreshToken);
      }),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  logout(): void {
    Object.values(K).forEach(k => localStorage.removeItem(k));
    this.memberships.set([]);
    this.activeBox.set(null);
  }
}

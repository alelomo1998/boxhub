import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, firstValueFrom, from, map, of, switchMap, tap } from 'rxjs';
import { ActiveBox, MembershipDto, Role } from './auth.models';

const ACTIVE_BOX = 'bh_active_box';

export interface Session {
  id: string;
  email: string;
  name: string;
  memberships: MembershipDto[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  /** Null = anonymous. Tokens live in httpOnly cookies and are invisible to JS by design. */
  readonly session = signal<Session | null>(null);
  readonly activeBox = signal<ActiveBox | null>(null);
  readonly memberships = computed(() => this.session()?.memberships ?? []);

  /**
   * Called once at app start (provideAppInitializer). Fetches the XSRF cookie, then asks who
   * we are. A 401 simply means anonymous — it is not an error.
   */
  async bootstrap(): Promise<void> {
    await firstValueFrom(this.http.get('/api/auth/csrf', { observe: 'response' })).catch(() => null);
    const me = await firstValueFrom(
      this.http.get<Session>('/api/me').pipe(catchError(() => of(null))),
    );
    this.session.set(me);
    if (me) this.restoreActiveBox(me.memberships);
    else this.clearActiveBox();
  }

  login(email: string, password: string): Observable<Session | null> {
    return this.http.post<{ memberships: MembershipDto[] }>('/api/auth/login', { email, password }).pipe(
      tap(() => this.clearActiveBox()),
      // the login response carries memberships, but /api/me is the single source of truth —
      // re-bootstrap and wait for it (a bare `tap(async ...)` would not wait, so switchMap here).
      switchMap(() => from(this.bootstrap())),
      map(() => this.session()),
    );
  }

  selectBox(boxId: string): Observable<void> {
    const m = this.memberships().find(x => x.boxId === boxId);
    return this.http.post<void>('/api/auth/box-token', { boxId }).pipe(
      tap(() => {
        const active: ActiveBox = { boxId, boxName: m?.boxName ?? '', role: (m?.role ?? 'ATHLETE') as Role };
        localStorage.setItem(ACTIVE_BOX, JSON.stringify(active));
        this.activeBox.set(active);
      }),
      map(() => void 0),
    );
  }

  refresh(): Observable<boolean> {
    return this.http.post('/api/auth/refresh', {}).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  register(email: string, password: string, name: string): Observable<unknown> {
    return this.http.post('/api/auth/register', { email, password, name });
  }

  previewInvite(token: string): Observable<{ boxName: string; boxSlug: string; role: Role; email: string; planName: string | null }> {
    return this.http.get<{ boxName: string; boxSlug: string; role: Role; email: string; planName: string | null }>(`/api/invites/${token}`);
  }

  acceptInvite(token: string): Observable<MembershipDto> {
    return this.http.post<MembershipDto>(`/api/invites/${token}/accept`, {});
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(void 0)), // a failed logout still clears the client
      tap(() => this.clear()),
      map(() => void 0),
    );
  }

  logoutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-all', {}).pipe(tap(() => this.clear()), map(() => void 0));
  }

  hasSession(): boolean {
    return this.session() !== null;
  }

  /** Nulls session + activeBox and drops the localStorage key — the one legit way to go anonymous. */
  clear(): void {
    this.session.set(null);
    this.clearActiveBox();
  }

  private clearActiveBox(): void {
    this.activeBox.set(null);
    localStorage.removeItem(ACTIVE_BOX);
  }

  /** The active box id survives a reload; the membership behind it is re-validated here. */
  private restoreActiveBox(memberships: MembershipDto[]): void {
    const raw = localStorage.getItem(ACTIVE_BOX);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as ActiveBox;
      if (memberships.some(m => m.boxId === saved.boxId)) this.activeBox.set(saved);
      else localStorage.removeItem(ACTIVE_BOX); // membership gone: drop it
    } catch {
      localStorage.removeItem(ACTIVE_BOX);
    }
  }
}

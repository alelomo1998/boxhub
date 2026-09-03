import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { FeedPage, PrefRow, PrefUpdate } from './notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);

  /** The bell's badge. Owned here, exactly as MessagingService owns the envelope's, so a caller
   *  that forgets to refresh cannot leave it stale — that is how the envelope's badge once stuck
   *  after reading a message and stayed stuck until reload. */
  readonly unread = signal(0);

  refreshUnread(): void {
    this.http.get<{ count: number }>('/api/box/notifications/unread-count').subscribe({
      next: r => this.unread.set(r.count),
      error: () => {},
    });
  }

  list(cursor?: string | null): Observable<FeedPage> {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<FeedPage>('/api/box/notifications', { params });
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/box/notifications/${id}/read`, {})
      .pipe(tap(() => this.refreshUnread()));
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/box/notifications/read-all', {})
      .pipe(tap(() => this.unread.set(0)));
  }

  prefs(): Observable<PrefRow[]> {
    return this.http.get<PrefRow[]>('/api/box/me/notification-prefs');
  }

  savePrefs(updates: PrefUpdate[]): Observable<PrefRow[]> {
    return this.http.put<PrefRow[]>('/api/box/me/notification-prefs', updates);
  }
}

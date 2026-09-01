import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import {
  Contact, Conversation, ConversationDetail, ChatMessage, MyAnnouncement, AnnouncementRow,
  AnnouncementTarget, AnnouncementDetail, Segment,
} from './messaging.models';

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private http = inject(HttpClient);

  readonly unread = signal(0);

  /** The envelope's badge: unread summed across every conversation. Announcements moved off this
   *  badge onto athlete home (A1) — one request, not the old thread+announcements fan-out. */
  refreshUnread(): void {
    this.conversations().subscribe({
      next: rows => this.unread.set(rows.reduce((sum, r) => sum + r.unreadCount, 0)),
      error: () => {},
    });
  }

  // conversations (A1)
  contacts(search = ''): Observable<Contact[]> {
    return this.http.get<Contact[]>('/api/box/contacts', { params: { search } });
  }
  conversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>('/api/box/conversations');
  }
  conversation(membershipId: string): Observable<ConversationDetail> {
    return this.http.get<ConversationDetail>(`/api/box/conversations/${membershipId}`);
  }
  send(membershipId: string, body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`/api/box/conversations/${membershipId}/messages`, { body });
  }
  /** The header envelope's badge only reflects reality on its next 60s poll unless this refreshes
   *  it right away — the service owns the unread signal, so the refresh lives here rather than in
   *  every caller (a caller that forgets is exactly how the badge went stale after reading a
   *  message and staying stuck until reload). */
  markRead(membershipId: string): Observable<void> {
    return this.http.post<void>(`/api/box/conversations/${membershipId}/read`, {})
      .pipe(tap(() => this.refreshUnread()));
  }

  // announcements — unaffected by A1 (A1.6)
  myAnnouncements(): Observable<MyAnnouncement[]> {
    return this.http.get<MyAnnouncement[]>('/api/box/me/announcements');
  }
  markAnnouncementRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/box/me/announcements/${id}/read`, {});
  }
  announcements(): Observable<AnnouncementRow[]> {
    return this.http.get<AnnouncementRow[]>('/api/box/announcements');
  }
  sendAnnouncement(body: string, segment: Segment, segmentRef?: string): Observable<AnnouncementRow> {
    return this.http.post<AnnouncementRow>('/api/box/announcements', { body, segment, segmentRef: segmentRef ?? null });
  }
  announcementTargets(): Observable<AnnouncementTarget[]> {
    return this.http.get<AnnouncementTarget[]>('/api/box/announcements/targets');
  }
  announcementPreview(segment: Segment, segmentRef?: string): Observable<{ count: number }> {
    let params = new HttpParams().set('segment', segment);
    if (segmentRef) params = params.set('segmentRef', segmentRef);
    return this.http.get<{ count: number }>('/api/box/announcements/preview', { params });
  }
  announcementDetail(id: string): Observable<AnnouncementDetail> {
    return this.http.get<AnnouncementDetail>(`/api/box/announcements/${id}/recipients`);
  }
}

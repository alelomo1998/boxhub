import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Contact, Conversation, ConversationDetail, ChatMessage, MyAnnouncement, AnnouncementRow, Segment,
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
  markRead(membershipId: string): Observable<void> {
    return this.http.post<void>(`/api/box/conversations/${membershipId}/read`, {});
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
}

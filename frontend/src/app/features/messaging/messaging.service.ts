import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { Thread, ChatMessage, InboxRow, MyAnnouncement, AnnouncementRow, Segment } from './messaging.models';

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private http = inject(HttpClient);

  readonly unread = signal(0);

  /** The envelope's badge. Two GETs because there is no count endpoint — both are small. */
  refreshUnread(): void {
    forkJoin({ thread: this.myThread(), anns: this.myAnnouncements() }).subscribe({
      next: ({ thread, anns }) =>
        this.unread.set(MessagingService.unreadIn(thread) + anns.filter(a => !a.read).length),
      error: () => {},
    });
  }

  /** Staff messages newer than the member's read marker. */
  static unreadIn(t: Thread): number {
    const seen = t.memberLastReadAt ? new Date(t.memberLastReadAt).getTime() : 0;
    return t.messages.filter(m => m.senderSide === 'STAFF' && new Date(m.createdAt).getTime() > seen).length;
  }

  // member
  myThread(): Observable<Thread> { return this.http.get<Thread>('/api/box/me/thread'); }
  sendAsMember(body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>('/api/box/me/thread/messages', { body });
  }
  markMyThreadRead(): Observable<void> { return this.http.post<void>('/api/box/me/thread/read', {}); }
  myAnnouncements(): Observable<MyAnnouncement[]> {
    return this.http.get<MyAnnouncement[]>('/api/box/me/announcements');
  }
  markAnnouncementRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/box/me/announcements/${id}/read`, {});
  }

  // staff
  inbox(): Observable<InboxRow[]> { return this.http.get<InboxRow[]>('/api/box/threads'); }
  thread(membershipId: string): Observable<Thread> {
    return this.http.get<Thread>(`/api/box/threads/${membershipId}`);
  }
  sendAsStaff(membershipId: string, body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`/api/box/threads/${membershipId}/messages`, { body });
  }
  markThreadRead(membershipId: string): Observable<void> {
    return this.http.post<void>(`/api/box/threads/${membershipId}/read`, {});
  }
  announcements(): Observable<AnnouncementRow[]> {
    return this.http.get<AnnouncementRow[]>('/api/box/announcements');
  }
  sendAnnouncement(body: string, segment: Segment, segmentRef?: string): Observable<AnnouncementRow> {
    return this.http.post<AnnouncementRow>('/api/box/announcements', { body, segment, segmentRef: segmentRef ?? null });
  }
}

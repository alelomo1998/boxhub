import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MessagingService } from './messaging.service';
import { Conversation } from './messaging.models';

describe('MessagingService', () => {
  let service: MessagingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(MessagingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('contacts gets addressable people with a search param', () => {
    service.contacts('mar').subscribe();
    const req = http.expectOne('/api/box/contacts?search=mar');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('contacts defaults the search param to empty', () => {
    service.contacts().subscribe();
    const req = http.expectOne('/api/box/contacts?search=');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('conversations gets the caller\'s conversation list', () => {
    service.conversations().subscribe();
    const req = http.expectOne('/api/box/conversations');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('conversation gets one conversation by membershipId', () => {
    service.conversation('mem1').subscribe();
    const req = http.expectOne('/api/box/conversations/mem1');
    expect(req.request.method).toBe('GET');
    req.flush({ membershipId: 'mem1', name: 'Ada', role: 'COACH', avatarPath: null, messages: [] });
  });

  it('send posts the body to the conversation by membershipId', () => {
    service.send('mem1', 'Is the 6am on?').subscribe();
    const req = http.expectOne('/api/box/conversations/mem1/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Is the 6am on?' });
    req.flush({
      id: 'm1', body: 'Is the 6am on?', senderMembershipId: 'me', senderName: 'Ada',
      createdAt: '2026-08-28T00:00:00Z', mine: true,
    });
  });

  it('markRead posts an empty body to the conversation read endpoint by membershipId', () => {
    service.markRead('mem1').subscribe();
    const req = http.expectOne('/api/box/conversations/mem1/read');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null);

    // markRead triggers its own refreshUnread — the regression test for the badge staying stale
    // after a message is read until the page is reloaded.
    const refreshReq = http.expectOne('/api/box/conversations');
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([]);
  });

  it('markRead refreshes the unread badge from the server total, not a local decrement', () => {
    service.unread.set(5);
    service.markRead('mem1').subscribe();
    http.expectOne('/api/box/conversations/mem1/read').flush(null);

    const refreshReq = http.expectOne('/api/box/conversations');
    refreshReq.flush([
      { membershipId: 'a', name: 'Ada', role: 'COACH', avatarPath: null,
        lastMessagePreview: null, lastMessageAt: null, unreadCount: 2, needsReply: false },
    ]);
    expect(service.unread()).toBe(2);
  });

  it('refreshUnread sums unreadCount across the conversation list, one request', () => {
    service.refreshUnread();
    const req = http.expectOne('/api/box/conversations');
    expect(req.request.method).toBe('GET');
    const rows: Conversation[] = [
      { membershipId: 'a', name: 'Ada', role: 'COACH', avatarPath: null,
        lastMessagePreview: null, lastMessageAt: null, unreadCount: 2, needsReply: false },
      { membershipId: 'b', name: 'Marco', role: 'BOX_ADMIN', avatarPath: null,
        lastMessagePreview: null, lastMessageAt: null, unreadCount: 3, needsReply: true },
    ];
    req.flush(rows);
    expect(service.unread()).toBe(5);
  });

  it('myAnnouncements gets the member announcement list', () => {
    service.myAnnouncements().subscribe();
    const req = http.expectOne('/api/box/me/announcements');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('markAnnouncementRead posts to the announcement read endpoint by id', () => {
    service.markAnnouncementRead('a1').subscribe();
    const req = http.expectOne('/api/box/me/announcements/a1/read');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null);
  });

  it('announcements gets the announcement history', () => {
    service.announcements().subscribe();
    const req = http.expectOne('/api/box/announcements');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendAnnouncement posts body, segment and a null segmentRef when omitted', () => {
    service.sendAnnouncement('New schedule live.', 'EVERYONE').subscribe();
    const req = http.expectOne('/api/box/announcements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'New schedule live.', segment: 'EVERYONE', segmentRef: null });
    req.flush({ id: 'an1', body: 'New schedule live.', segment: 'EVERYONE', sentAt: '2026-08-28T00:00:00Z', sentCount: 10, readCount: 0 });
  });

  it('sendAnnouncement forwards a provided segmentRef for a class-roster send', () => {
    service.sendAnnouncement('6am is cancelled.', 'CLASS_ROSTER', 'sess1').subscribe();
    const req = http.expectOne('/api/box/announcements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: '6am is cancelled.', segment: 'CLASS_ROSTER', segmentRef: 'sess1' });
    req.flush({ id: 'an2', body: '6am is cancelled.', segment: 'CLASS_ROSTER', sentAt: '2026-08-28T00:00:00Z', sentCount: 8, readCount: 0 });
  });
});

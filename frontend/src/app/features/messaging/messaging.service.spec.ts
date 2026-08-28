import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  let service: MessagingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(MessagingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('myThread gets the member thread', () => {
    service.myThread().subscribe();
    const req = http.expectOne('/api/box/me/thread');
    expect(req.request.method).toBe('GET');
    req.flush({ id: null, messages: [], memberLastReadAt: null });
  });

  it('sendAsMember posts the body to the member thread', () => {
    service.sendAsMember('Is the 6am on?').subscribe();
    const req = http.expectOne('/api/box/me/thread/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Is the 6am on?' });
    req.flush({ id: 'm1', body: 'Is the 6am on?', senderSide: 'MEMBER', senderName: 'Ada', createdAt: '2026-08-28T00:00:00Z' });
  });

  it('markMyThreadRead posts an empty body to the member read endpoint', () => {
    service.markMyThreadRead().subscribe();
    const req = http.expectOne('/api/box/me/thread/read');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null);
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

  it('inbox gets the staff shared inbox', () => {
    service.inbox().subscribe();
    const req = http.expectOne('/api/box/threads');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('thread gets a member thread by membershipId', () => {
    service.thread('mem1').subscribe();
    const req = http.expectOne('/api/box/threads/mem1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: null, messages: [], memberLastReadAt: null });
  });

  it('sendAsStaff posts the body to the staff thread by membershipId', () => {
    service.sendAsStaff('mem1', 'Yes, see you there.').subscribe();
    const req = http.expectOne('/api/box/threads/mem1/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Yes, see you there.' });
    req.flush({ id: 'm2', body: 'Yes, see you there.', senderSide: 'STAFF', senderName: 'Coach', createdAt: '2026-08-28T00:00:00Z' });
  });

  it('markThreadRead posts an empty body to the staff read endpoint by membershipId', () => {
    service.markThreadRead('mem1').subscribe();
    const req = http.expectOne('/api/box/threads/mem1/read');
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

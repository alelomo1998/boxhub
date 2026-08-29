import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { AthleteMessagesPage } from './athlete-messages.page';
import { MessagingService } from './messaging.service';
import { Thread, ChatMessage, MyAnnouncement } from './messaging.models';

const THREAD_EMPTY: Thread = { id: null, messages: [], memberLastReadAt: null };

const STAFF_MSG: ChatMessage = {
  id: 'm1', body: 'Hey — sorted?', senderSide: 'STAFF', senderName: 'Marco', createdAt: '2026-08-28T09:00:00Z',
};
const THREAD_WITH_MSG: Thread = { id: 't1', messages: [STAFF_MSG], memberLastReadAt: null };

const ANN_UNREAD: MyAnnouncement = { id: 'a1', body: 'New schedule live.', sentAt: '2026-08-27T00:00:00Z', read: false };
const ANN_READ: MyAnnouncement = { id: 'a2', body: 'Holiday hours.', sentAt: '2026-08-20T00:00:00Z', read: true };

describe('AthleteMessagesPage', () => {
  let svc: jasmine.SpyObj<MessagingService>;

  function setup() {
    svc = jasmine.createSpyObj<MessagingService>('MessagingService',
      ['myThread', 'myAnnouncements', 'sendAsMember', 'markMyThreadRead', 'markAnnouncementRead', 'refreshUnread']);
    svc.markMyThreadRead.and.returnValue(of(undefined));
    svc.markAnnouncementRead.and.returnValue(of(undefined));
    // A real signal, not a spy: the page writes the badge directly (`unread.set(0)`) rather than
    // calling refreshUnread(), whose GETs would race the read POSTs fired beside them.
    (svc as { unread: WritableSignal<number> }).unread = signal(0);
    TestBed.configureTestingModule({
      imports: [AthleteMessagesPage],
      providers: [{ provide: MessagingService, useValue: svc }],
    });
  }

  // Catches: the loading branch missing from the state @switch, or state() not defaulting to
  // 'loading' before the fetch resolves.
  it('renders the loading state', () => {
    setup();
    svc.myThread.and.returnValue(new Subject());
    svc.myAnnouncements.and.returnValue(new Subject());
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stateline.err')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Loading');
  });

  // Catches: the error branch not wired, or "Try again" not calling load() again.
  it('renders the error state when the fetch fails, and "Try again" re-fetches', () => {
    setup();
    const thread$ = new Subject<Thread>();
    svc.myThread.and.returnValue(thread$);
    svc.myAnnouncements.and.returnValue(new Subject());
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    thread$.error('boom');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stateline.err')).not.toBeNull();

    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    (fixture.nativeElement.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(svc.myThread).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[data-testid="messages-empty"]')).not.toBeNull();
  });

  // Catches: the full-empty condition (no messages AND no announcements) not resolving to
  // <bh-empty>, or the composer being withheld from that state instead of staying reachable.
  it('renders the empty state when the thread has no messages and there are no announcements', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="messages-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="message-composer"]')).not.toBeNull();
  });

  // Catches: the @for tracking the wrong field, the testid binding broken, or the ready branch
  // not rendering both regions.
  it('renders messages and announcements in the ready state', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_WITH_MSG));
    svc.myAnnouncements.and.returnValue(of([ANN_UNREAD, ANN_READ]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="message-m1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-a1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="announcement-a2"]')).not.toBeNull();
  });

  // Catches: send() not trimming/forwarding the typed body, or draft() not clearing on success.
  it('send calls the service with the typed body and clears the draft on success', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.draft.set('Is the 6am on?');
    const sent: ChatMessage = { id: 'm9', body: 'Is the 6am on?', senderSide: 'MEMBER', senderName: null, createdAt: '2026-08-29T00:00:00Z' };
    svc.sendAsMember.and.returnValue(of(sent));
    cmp.send();
    expect(svc.sendAsMember).toHaveBeenCalledWith('Is the 6am on?');
    expect(cmp.draft()).toBe('');
  });

  // Catches: the guard living only in [disabled] on the button instead of in the handler — Enter
  // submits regardless of a disabled attribute, so this is the check that actually matters.
  it('send is blocked by the HANDLER on an empty/whitespace-only body', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.draft.set('   ');
    cmp.send();
    expect(svc.sendAsMember).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="composer-error"]')).not.toBeNull();
  });

  // Catches: a failed send silently discarding the typed text, or the error not surfacing inline.
  it('the send error preserves the typed text and shows an inline error', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.draft.set('Still there?');
    const err$ = new Subject<ChatMessage>();
    svc.sendAsMember.and.returnValue(err$);
    cmp.send();
    err$.error('down');
    fixture.detectChanges();
    expect(cmp.draft()).toBe('Still there?');
    expect(fixture.nativeElement.querySelector('[data-testid="composer-error"]')).not.toBeNull();
  });

  // Catches: the poll not suspending when the tab is hidden (wasted requests / a wrong-looking
  // unread badge racing a backgrounded tab), or not resuming when it becomes visible again.
  it('polling stops when the document is hidden', fakeAsync(() => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([]));
    const fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    expect(svc.myThread).toHaveBeenCalledTimes(1);

    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.myThread).toHaveBeenCalledTimes(1);

    visibility.and.returnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.myThread).toHaveBeenCalledTimes(2);

    fixture.destroy();
  }));

  // Catches: [attr.open] not bound to hasNew() at all (always open, always closed, or hardcoded).
  it('the notices disclosure renders open when there is an unread announcement and closed when there is none', () => {
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([ANN_UNREAD]));
    let fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    let details = fixture.nativeElement.querySelector('[data-testid="announcements-section"]') as HTMLDetailsElement;
    expect(details.open).toBeTrue();

    TestBed.resetTestingModule();
    setup();
    svc.myThread.and.returnValue(of(THREAD_EMPTY));
    svc.myAnnouncements.and.returnValue(of([ANN_READ]));
    fixture = TestBed.createComponent(AthleteMessagesPage);
    fixture.detectChanges();
    details = fixture.nativeElement.querySelector('[data-testid="announcements-section"]') as HTMLDetailsElement;
    expect(details.open).toBeFalse();
  });
});

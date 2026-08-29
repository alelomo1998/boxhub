import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { StaffInboxPage } from './staff-inbox.page';
import { MessagingService } from './messaging.service';
import { Thread, ChatMessage, InboxRow } from './messaging.models';

const ROW_NEEDS_REPLY: InboxRow = {
  membershipId: 'mem1', memberName: 'Giulia Rossi', lastMessagePreview: 'Can I move to the 6am?',
  lastMessageAt: '2026-08-29T14:02:00Z', needsReply: true,
};
const ROW_OK: InboxRow = {
  membershipId: 'mem2', memberName: 'Marco Bini', lastMessagePreview: 'Thanks!',
  lastMessageAt: '2026-08-25T09:00:00Z', needsReply: false,
};

const THREAD_EMPTY: Thread = { id: null, messages: [], memberLastReadAt: null };
const MEMBER_MSG: ChatMessage = {
  id: 'm1', body: 'Can I move to the 6am?', senderSide: 'MEMBER', senderName: null, createdAt: '2026-08-29T14:02:00Z',
};
const THREAD_WITH_MSG: Thread = { id: 't1', messages: [MEMBER_MSG], memberLastReadAt: null };

describe('StaffInboxPage', () => {
  let svc: jasmine.SpyObj<MessagingService>;

  function setup() {
    svc = jasmine.createSpyObj<MessagingService>('MessagingService',
      ['inbox', 'thread', 'sendAsStaff', 'markThreadRead', 'refreshUnread']);
    svc.markThreadRead.and.returnValue(of(undefined));
    (svc as { unread: WritableSignal<number> }).unread = signal(0);
    TestBed.configureTestingModule({
      imports: [StaffInboxPage],
      providers: [{ provide: MessagingService, useValue: svc }],
    });
  }

  // Catches: the loading branch missing from the state @switch, or state() not defaulting to
  // 'loading' before the fetch resolves.
  it('renders the loading state', () => {
    setup();
    svc.inbox.and.returnValue(new Subject());
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stateline.err')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Loading');
  });

  // Catches: the error branch not wired, or "Try again" not calling load() again.
  it('renders the error state when the fetch fails, and "Try again" re-fetches', () => {
    setup();
    const inbox$ = new Subject<InboxRow[]>();
    svc.inbox.and.returnValue(inbox$);
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    inbox$.error('boom');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stateline.err')).not.toBeNull();

    svc.inbox.and.returnValue(of([]));
    (fixture.nativeElement.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(svc.inbox).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-empty"]')).not.toBeNull();
  });

  // Catches: the empty condition (no threads at all) not resolving to <bh-empty>.
  it('renders inbox-empty when the list is empty', () => {
    setup();
    svc.inbox.and.returnValue(of([]));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-empty"]')).not.toBeNull();
  });

  // Catches: the @for tracking the wrong field, the testid binding broken, or needsReply being
  // recomputed in the component instead of rendered straight from the row's own flag.
  it('renders rows, and the needs-reply mark renders from the needsReply flag only', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY, ROW_OK]));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-row-mem1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-row-mem2"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-needs-reply-mem1"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-needs-reply-mem2"]')).toBeNull();
  });

  // Catches: selecting a row not loading that member's thread, or not marking it read.
  it('selecting a row loads that thread and marks it read', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    svc.thread.and.returnValue(of(THREAD_WITH_MSG));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="inbox-row-mem1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(svc.thread).toHaveBeenCalledWith('mem1');
    expect(svc.markThreadRead).toHaveBeenCalledWith('mem1');
    expect(fixture.nativeElement.querySelector('[data-testid="message-m1"]')).not.toBeNull();
  });

  // Catches: the thread pane not distinguishing "nothing selected yet" from "selected but empty".
  it('shows the pre-selection empty state before any conversation is chosen', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="thread-preselect-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="message-composer"]')).toBeNull();
  });

  // Catches: send() not forwarding the selected membershipId, or not trimming/forwarding the body.
  it('send calls sendAsStaff with the selected membershipId and the typed body', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    svc.thread.and.returnValue(of(THREAD_EMPTY));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.selectRow('mem1');
    fixture.detectChanges();
    cmp.draft.set('The 6am works, see you there.');
    const sent: ChatMessage = {
      id: 'm9', body: 'The 6am works, see you there.', senderSide: 'STAFF', senderName: 'Coach',
      createdAt: '2026-08-29T00:00:00Z',
    };
    svc.sendAsStaff.and.returnValue(of(sent));
    cmp.send();
    expect(svc.sendAsStaff).toHaveBeenCalledWith('mem1', 'The 6am works, see you there.');
    expect(cmp.draft()).toBe('');
  });

  // Catches: the guard living only in [disabled] on the button instead of in the handler.
  it('send is blocked by the handler on a whitespace-only body', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    svc.thread.and.returnValue(of(THREAD_EMPTY));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.selectRow('mem1');
    fixture.detectChanges();
    cmp.draft.set('   ');
    cmp.send();
    expect(svc.sendAsStaff).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="composer-error"]')).not.toBeNull();
  });

  // Catches: a failed send silently discarding the typed text, or the error not surfacing inline.
  it('a send error preserves the typed text', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    svc.thread.and.returnValue(of(THREAD_EMPTY));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.selectRow('mem1');
    fixture.detectChanges();
    cmp.draft.set('Still there?');
    const err$ = new Subject<ChatMessage>();
    svc.sendAsStaff.and.returnValue(err$);
    cmp.send();
    err$.error('down');
    fixture.detectChanges();
    expect(cmp.draft()).toBe('Still there?');
    expect(fixture.nativeElement.querySelector('[data-testid="composer-error"]')).not.toBeNull();
  });

  // Catches: the poll not suspending when the tab is hidden, or not resuming when visible again.
  it('polling stops when the document is hidden and resumes when visible', fakeAsync(() => {
    setup();
    svc.inbox.and.returnValue(of([]));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    expect(svc.inbox).toHaveBeenCalledTimes(1);

    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.inbox).toHaveBeenCalledTimes(1);

    visibility.and.returnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.inbox).toHaveBeenCalledTimes(2);

    fixture.destroy();
  }));

  // Catches: aria-expanded not bound to drawerOpen(), or Escape not closing the drawer / not
  // returning focus to the toggle.
  it('the mobile drawer: toggling sets aria-expanded, and Escape closes it', () => {
    setup();
    svc.inbox.and.returnValue(of([ROW_NEEDS_REPLY]));
    const fixture = TestBed.createComponent(StaffInboxPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const toggle = fixture.nativeElement.querySelector('[data-testid="inbox-list-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(cmp.drawerOpen()).toBeTrue();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(cmp.drawerOpen()).toBeFalse();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);

    fixture.destroy();
  });
});

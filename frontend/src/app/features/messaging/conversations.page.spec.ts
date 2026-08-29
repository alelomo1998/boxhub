import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { ConversationsPage } from './conversations.page';
import { MessagingService } from './messaging.service';
import { Contact, Conversation, ConversationDetail, ChatMessage } from './messaging.models';

const CONV_ADA: Conversation = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  lastMessagePreview: 'See you at 6am', lastMessageAt: '2026-08-28T09:00:00Z',
  unreadCount: 3, needsReply: true,
};
const CONV_SARA: Conversation = {
  membershipId: 'staff2', name: 'Sara', role: 'BOX_ADMIN', avatarPath: null,
  lastMessagePreview: 'Thanks!', lastMessageAt: '2026-08-27T09:00:00Z',
  unreadCount: 0, needsReply: false,
};
const MSG_1: ChatMessage = {
  id: 'm1', body: 'Hey — sorted?', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:00:00Z', mine: false,
};
const MSG_SENT: ChatMessage = {
  id: 'm2', body: 'On my way!', senderMembershipId: 'me', senderName: 'You',
  createdAt: '2026-08-28T09:05:00Z', mine: true,
};
const DETAIL_ADA: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null, messages: [MSG_1],
};
const CONTACT_ADA_DUP: Contact = { membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null };
const CONTACT_MARCO: Contact = { membershipId: 'staff1', name: 'Marco', role: 'COACH', avatarPath: null };

describe('ConversationsPage', () => {
  let svc: jasmine.SpyObj<MessagingService>;

  function setup() {
    svc = jasmine.createSpyObj<MessagingService>('MessagingService',
      ['contacts', 'conversations', 'conversation', 'send', 'markRead', 'refreshUnread']);
    svc.contacts.and.returnValue(of([]));
    svc.markRead.and.returnValue(of(undefined));
    // A real signal, not a spy: the shell writes/reads unread directly (deleted spec's pattern).
    (svc as unknown as { unread: WritableSignal<number> }).unread = signal(0);
    TestBed.configureTestingModule({
      imports: [ConversationsPage],
      providers: [{ provide: MessagingService, useValue: svc }],
    });
  }

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  // Catches: the loading branch missing from the state @switch, or state() not defaulting to
  // 'loading' before the fetch resolves.
  it('renders the loading state', () => {
    setup();
    svc.conversations.and.returnValue(new Subject());
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stateline.err')).toBeNull();
    expect(el.textContent).toContain('Loading');
  });

  // Catches: the error branch not wired, or "Try again" not calling load() again.
  it('renders the error state when the fetch fails, and Try again re-fetches', () => {
    setup();
    const conv$ = new Subject<Conversation[]>();
    svc.conversations.and.returnValue(conv$);
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    conv$.error('boom');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stateline.err')).not.toBeNull();

    svc.conversations.and.returnValue(of([]));
    (el.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="conversations-empty"]')).not.toBeNull();
  });

  // Catches: conversations-empty not rendered, or rendered even when a query is active.
  it('shows conversations-empty when there are none', () => {
    setup();
    svc.conversations.and.returnValue(of([]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="conversations-empty"]')).not.toBeNull();
  });

  // Catches: name, preview or role label dropped from the row markup.
  it('renders conversation rows with name, preview and role label', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="conversation-row-ath1"]')!;
    expect(row.textContent).toContain('Ada');
    expect(row.textContent).toContain('See you at 6am');
    expect(row.textContent).toContain('Athlete');
  });

  // Catches: the badge rendered unconditionally, or a stray badge at unreadCount 0.
  it('renders the unread badge from unreadCount, and it is absent at zero', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA, CONV_SARA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="conversation-unread-ath1"]')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('[data-testid="conversation-unread-staff2"]')).toBeNull();
  });

  // Catches: needsReply recomputed from other fields instead of rendered straight from the server
  // flag — CONV_SARA has messages/preview but needsReply:false, and must render nothing.
  it('renders the needs-reply mark from the needsReply flag, and it is absent when false', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA, CONV_SARA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="conversation-needs-reply-ath1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="conversation-needs-reply-staff2"]')).toBeNull();
  });

  // Catches: the row not wired to fetch the conversation, or the read POST not fired on open.
  it('selecting a row loads that conversation and marks it read', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(svc.conversation).toHaveBeenCalledWith('ath1');
    expect(svc.markRead).toHaveBeenCalledWith('ath1');
    expect(el.querySelector('[data-testid="message-m1"]')).not.toBeNull();
  });

  // Catches: the pane opening onto a composer with nothing selected — the rejected design.
  it('shows the pane pre-selection empty state before anything is selected', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="conversation-pane-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="message-composer"]')).toBeNull();
  });

  // Catches: no de-dup (Ada would appear twice), or contacts fired per keystroke instead of debounced.
  it('search surfaces contacts in a Start a chat group, excluding people already in the conversation list', fakeAsync(() => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.contacts.and.returnValue(of([CONTACT_ADA_DUP, CONTACT_MARCO]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const input = el.querySelector('[data-testid="messages-search"]') as HTMLInputElement;
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="contact-row-staff1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="contact-row-ath1"]')).toBeNull();
    fixture.destroy();
  }));

  // Catches: send() called with the wrong id/body, or the draft left behind after a successful send.
  it('sending calls send with the selected membershipId and the typed body, and clears the draft', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    svc.send.and.returnValue(of(MSG_SENT));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const textarea = el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement;
    textarea.value = 'On my way!';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form.composer') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(svc.send).toHaveBeenCalledWith('ath1', 'On my way!');
    expect((el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement).value).toBe('');
  });

  // Catches: the guard living only in [disabled] — Enter/submit must still be blocked in the handler.
  it('blocks send on a whitespace-only body without calling the service', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const textarea = el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement;
    textarea.value = '    ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form.composer') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(svc.send).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="composer-error"]')).not.toBeNull();
  });

  // Catches: the typed text lost on failure, or no inline error surfaced.
  it('preserves the typed text and shows an inline error when send fails', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    svc.send.and.returnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const textarea = el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement;
    textarea.value = 'Still there?';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form.composer') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="composer-error"]')).not.toBeNull();
    expect((el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement).value).toBe('Still there?');
  });

  // Catches: the poll left running while the tab is hidden, or never resumed on return.
  it('stops polling when hidden and resumes when visible', fakeAsync(() => {
    setup();
    svc.conversations.and.returnValue(of([]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    svc.conversations.calls.reset();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.conversations).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20000);
    expect(svc.conversations).toHaveBeenCalled();

    fixture.destroy();
  }));
});

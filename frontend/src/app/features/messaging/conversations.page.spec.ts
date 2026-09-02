import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { ConversationsPage } from './conversations.page';
import { MessagingService } from './messaging.service';
import { HomeService, Profile } from '../athlete/home.service';
import { Contact, Conversation, ConversationDetail, ChatMessage } from './messaging.models';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { AuthService } from '../../core/auth/auth.service';

/** Stubs `window.matchMedia('(max-width: 719px)')` so the narrow signal is controllable from a
 *  test rather than depending on ChromeHeadless's real (uncontrolled) viewport. Returns a fake
 *  `change` emitter the test can fire to simulate a resize. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches: initialMatches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: jasmine.createSpy('removeEventListener'),
  } as unknown as MediaQueryList;
  spyOn(window, 'matchMedia').and.returnValue(mql);
  return { fire: (matches: boolean) => listeners.forEach(cb => cb({ matches } as MediaQueryListEvent)) };
}

const MY_PROFILE: Profile = {
  membershipId: 'me', name: 'You', avatarPath: null, isPrivate: false, me: true,
  benchmarks: null, liftPrs: null, streakWeeks: null,
};

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
  counterpartLastReadAt: null,
};
const DETAIL_SARA: ConversationDetail = {
  membershipId: 'staff2', name: 'Sara', role: 'BOX_ADMIN', avatarPath: null, messages: [],
  counterpartLastReadAt: null,
};
// Read/Sent fixtures (M29a A1.8 #2) — MSG_1 (Ada, not mine) then MSG_SENT (mine, 09:05:00Z) as
// the newest message, so the status line's target is always MSG_SENT.
const DETAIL_LAST_MINE_READ: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_1, MSG_SENT], counterpartLastReadAt: '2026-08-28T09:05:00Z',
};
const DETAIL_LAST_MINE_SENT_NULL: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_1, MSG_SENT], counterpartLastReadAt: null,
};
const DETAIL_LAST_MINE_SENT_OLDER: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_1, MSG_SENT], counterpartLastReadAt: '2026-08-28T09:00:00Z',
};
// Newest message is the OTHER person's (MSG_1 only, mine: false) — no status should render at
// all, even though a read marker exists.
const DETAIL_LAST_OTHER: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_1], counterpartLastReadAt: '2026-08-29T00:00:00Z',
};
// Two consecutive messages from Ada on day 1 (avatar should collapse on the second), then one
// from "me" on day 2 (a day boundary resets the run even though nothing else changed).
const MSG_DAY1_A: ChatMessage = {
  id: 'd1a', body: 'Morning', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-27T10:00:00Z', mine: false,
};
const MSG_DAY1_B: ChatMessage = {
  id: 'd1b', body: 'You around later?', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-27T10:05:00Z', mine: false,
};
const MSG_DAY2_A: ChatMessage = {
  id: 'd2a', body: 'Yep, 6am class', senderMembershipId: 'me', senderName: 'You',
  createdAt: '2026-08-28T09:00:00Z', mine: true,
};
const DETAIL_TWO_DAY: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_DAY1_A, MSG_DAY1_B, MSG_DAY2_A], counterpartLastReadAt: null,
};
// Three same-sender messages inside one minute (seconds differ, minute doesn't) — the timestamp
// should collapse onto only the last of the run.
const MSG_MIN_A: ChatMessage = {
  id: 'min-a', body: 'One', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:01:05Z', mine: false,
};
const MSG_MIN_B: ChatMessage = {
  id: 'min-b', body: 'Two', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:01:30Z', mine: false,
};
const MSG_MIN_C: ChatMessage = {
  id: 'min-c', body: 'Three', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:01:50Z', mine: false,
};
const DETAIL_SAME_MINUTE: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_MIN_A, MSG_MIN_B, MSG_MIN_C], counterpartLastReadAt: null,
};
// Two messages in the same minute but from different senders — each keeps its own timestamp.
const MSG_DIFF_SENDER_A: ChatMessage = {
  id: 'ds-a', body: 'Hi', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:02:05Z', mine: false,
};
const MSG_DIFF_SENDER_B: ChatMessage = {
  id: 'ds-b', body: 'Hey', senderMembershipId: 'me', senderName: 'You',
  createdAt: '2026-08-28T09:02:40Z', mine: true,
};
const DETAIL_DIFF_SENDER_SAME_MINUTE: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_DIFF_SENDER_A, MSG_DIFF_SENDER_B], counterpartLastReadAt: null,
};
// Two messages from the same sender a minute apart — each keeps its own timestamp.
const MSG_DIFF_MIN_A: ChatMessage = {
  id: 'dm-a', body: 'Hi', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:03:05Z', mine: false,
};
const MSG_DIFF_MIN_B: ChatMessage = {
  id: 'dm-b', body: 'Hey', senderMembershipId: 'ath1', senderName: 'Ada',
  createdAt: '2026-08-28T09:04:05Z', mine: false,
};
const DETAIL_DIFF_MINUTE_SAME_SENDER: ConversationDetail = {
  membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null,
  messages: [MSG_DIFF_MIN_A, MSG_DIFF_MIN_B], counterpartLastReadAt: null,
};
const CONTACT_ADA_DUP: Contact = { membershipId: 'ath1', name: 'Ada', role: 'ATHLETE', avatarPath: null };
const CONTACT_MARCO: Contact = { membershipId: 'staff1', name: 'Marco', role: 'COACH', avatarPath: null };

/** Lets the fire-and-forget scroll-to-bottom call run. It schedules via setTimeout, NOT
 *  queueMicrotask: a microtask runs before change detection has written the messages into the DOM,
 *  so scrollHeight is still the old height and the assignment is a silent no-op. That shipped once
 *  and a conversation opened on its oldest message; awaiting a macrotask here is what keeps the
 *  test honest about the ordering the runtime actually needs. */
async function flushScroll(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve));
}

describe('ConversationsPage', () => {
  let svc: jasmine.SpyObj<MessagingService>;
  let homeSvc: jasmine.SpyObj<HomeService>;

  function setup(role: 'ATHLETE' | 'COACH' | 'BOX_ADMIN' = 'ATHLETE') {
    svc = jasmine.createSpyObj<MessagingService>('MessagingService',
      ['contacts', 'conversations', 'conversation', 'send', 'markRead', 'refreshUnread']);
    svc.contacts.and.returnValue(of([]));
    svc.markRead.and.returnValue(of(undefined));
    // A real signal, not a spy: the shell writes/reads unread directly (deleted spec's pattern).
    (svc as unknown as { unread: WritableSignal<number> }).unread = signal(0);
    // "My" avatar (M29a A1.7 #4) is initials-only, driven by the same profile call the shell
    // makes — mocked here so the page never touches HttpClient.
    homeSvc = jasmine.createSpyObj<HomeService>('HomeService', ['home', 'profile', 'myProfile', 'setAvatar', 'setPrivacy']);
    homeSvc.myProfile.and.returnValue(of(MY_PROFILE));
    TestBed.configureTestingModule({
      imports: [ConversationsPage],
      providers: [
        // Real AuthService (M29a A1.8 #3, the reach note) — it needs a real HttpClient injector
        // even though its methods are never called from these specs.
        provideHttpClient(withXhr()), provideHttpClientTesting(),
        { provide: MessagingService, useValue: svc },
        { provide: HomeService, useValue: homeSvc },
      ],
    });
    TestBed.inject(AuthService).activeBox.set({ boxId: 'box1', boxName: 'Demo Box', role });
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

  // Catches: a "needs reply" element resurfacing in the row markup (M29a A1.7 #1) — the flag stays
  // on the wire (CONV_ADA.needsReply is true) but the screen must never render it; the unread
  // badge + bold name are the only "not opened" signal now.
  it('renders no needs-reply element even when the needsReply flag is true', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA, CONV_SARA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="conversation-needs-reply-ath1"]')).toBeNull();
    expect(el.querySelector('.needs-reply')).toBeNull();
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

  // Catches the stale-validation-error bug the M29a announcements critique found on the sibling
  // composer: the message is set on a blocked send and must retire when the body is typed, not on
  // the next Send press. A screen reader that already announced the alert says nothing when it
  // silently stops being true.
  it('clears the empty-draft error as soon as the athlete types, not on the next send', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['send']({ preventDefault: () => {} } as unknown as Event);
    expect(page['sendError']()).toBeTruthy();
    expect(svc.send).not.toHaveBeenCalled();

    page['onDraftInput']('there it is');
    expect(page['sendError']()).toBeNull();
    fixture.destroy();
  });

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

  describe('per-conversation draft stash (P1 fix)', () => {
    function setupTwoConversations() {
      setup();
      svc.conversations.and.returnValue(of([CONV_ADA, CONV_SARA]));
      svc.conversation.and.callFake((id: string) => of(id === 'ath1' ? DETAIL_ADA : DETAIL_SARA));
    }

    function openRow(el: HTMLElement, testid: string) {
      (el.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement).click();
    }

    function typeDraft(el: HTMLElement, text: string) {
      const textarea = el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement;
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
    }

    function draftValue(el: HTMLElement): string {
      return (el.querySelector('[data-testid="message-composer"]') as HTMLTextAreaElement).value;
    }

    // Catches: openConversation() unconditionally clearing draft() instead of stashing it first —
    // a typed-but-unsent message would be silently destroyed by tapping a different row.
    it('restores a typed draft after switching to another conversation and back', () => {
      setupTwoConversations();
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();
      typeDraft(el, 'Draft for Ada');
      fixture.detectChanges();

      openRow(el, 'conversation-row-staff2');
      fixture.detectChanges();
      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();

      expect(draftValue(el)).toBe('Draft for Ada');
    });

    // Catches: the map read with the wrong key — a draft stashed for one conversation leaking into
    // a DIFFERENT conversation that never had anything typed.
    it('shows an empty draft box for a conversation with no stashed draft', () => {
      setupTwoConversations();
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();
      typeDraft(el, 'Draft for Ada');
      fixture.detectChanges();

      openRow(el, 'conversation-row-staff2');
      fixture.detectChanges();

      expect(draftValue(el)).toBe('');
    });

    // Catches: a successful send leaving the stashed copy behind, so reopening the conversation
    // later would resurrect an already-sent message back into the composer.
    it('clears the stashed draft on a successful send', () => {
      setupTwoConversations();
      svc.send.and.returnValue(of(MSG_SENT));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();
      typeDraft(el, 'first draft');
      fixture.detectChanges();
      openRow(el, 'conversation-row-staff2');
      fixture.detectChanges();
      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();
      expect(draftValue(el)).toBe('first draft');

      (el.querySelector('form.composer') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
      fixture.detectChanges();

      openRow(el, 'conversation-row-staff2');
      fixture.detectChanges();
      openRow(el, 'conversation-row-ath1');
      fixture.detectChanges();

      expect(draftValue(el)).toBe('');
    });
  });

  // Catches: grouping by a UTC slice of the ISO string instead of the local calendar day (which
  // would merge or split these groups differently depending on the runner's timezone), or a
  // separator drawn per-message instead of per day change.
  it('renders one day separator per distinct calendar day, and none within a single day', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_TWO_DAY));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="day-"]').length).toBe(2);
  });

  it('renders exactly one day separator for a single-day thread', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="day-"]').length).toBe(1);
  });

  // Catches: showAvatar computed wrong — either every message shows its own avatar (no
  // collapsing) or a run collapses across a day boundary it shouldn't.
  it('collapses the avatar on the second of two consecutive same-speaker messages, and shows it again after a day change', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_TWO_DAY));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const firstAvatar = el.querySelector('[data-testid="message-d1a"] bh-avatar');
    const secondAvatar = el.querySelector('[data-testid="message-d1b"] bh-avatar');
    const nextDayAvatar = el.querySelector('[data-testid="message-d2a"] bh-avatar');
    expect(firstAvatar?.classList.contains('spacer')).toBeFalse();
    expect(secondAvatar?.classList.contains('spacer')).toBeTrue();
    expect(nextDayAvatar?.classList.contains('spacer')).toBeFalse();
  });

  // Catches: showTime computed wrong — every message keeping its own stamp (no collapsing), or the
  // stamp landing on the wrong row of the run instead of the last one.
  it('collapses same-sender same-minute messages to one timestamp on the last of the run', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_SAME_MINUTE));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="message-min-a"] .meta')).toBeNull();
    expect(el.querySelector('[data-testid="message-min-b"] .meta')).toBeNull();
    expect(el.querySelector('[data-testid="message-min-c"] .meta')).not.toBeNull();
  });

  // Catches: showTime keyed off the minute alone, collapsing across a sender change it shouldn't.
  it('keeps its own timestamp on each message when different senders share a minute', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_DIFF_SENDER_SAME_MINUTE));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="message-ds-a"] .meta')).not.toBeNull();
    expect(el.querySelector('[data-testid="message-ds-b"] .meta')).not.toBeNull();
  });

  // Catches: showTime keyed off the sender alone, collapsing across a minute change it shouldn't —
  // and a UTC-string-slice minute compare, which would misgroup near a local-timezone offset.
  it('keeps its own timestamp on each message when the same sender spans different minutes', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_DIFF_MINUTE_SAME_SENDER));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="message-dm-a"] .meta')).not.toBeNull();
    expect(el.querySelector('[data-testid="message-dm-b"] .meta')).not.toBeNull();
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

  // Catches: dockHidden never set on open, or set from the wrong signal (e.g. the 900px pane
  // breakpoint instead of narrow's 719px).
  it('opening a conversation while narrow hides the shell dock', () => {
    setup();
    stubMatchMedia(true);
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.dockHidden()).toBeFalse();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(chrome.dockHidden()).toBeTrue();
  });

  // Catches: back() clearing selected() but leaving the dock hidden — the user would be stuck
  // with no navigation on the list pane.
  it('going back to the list restores the shell dock', () => {
    setup();
    stubMatchMedia(true);
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.dockHidden()).toBeTrue();

    (el.querySelector('.back') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(chrome.dockHidden()).toBeFalse();
  });

  // Catches: the one that matters — a leak here removes the dock, and with it navigation, from
  // every other screen in the app once the user leaves the messages route with a conversation
  // still open.
  it('destroying the page resets the shell dock, even mid-conversation', () => {
    setup();
    stubMatchMedia(true);
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.dockHidden()).toBeTrue();

    fixture.destroy();
    expect(chrome.dockHidden()).toBeFalse();
  });

  // Catches: dockHidden driven off selected() alone, hiding the dock on a wide viewport where
  // both panes already show side by side and the dock is still needed for navigation.
  it('opening a conversation while wide leaves the shell dock alone', () => {
    setup();
    stubMatchMedia(false);
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.dockHidden()).toBeFalse();
  });

  // Catches: the shell staying scrollable (drifting composer) because the screen never asked for
  // the viewport lock in the first place.
  it('locks the shell viewport while the screen is mounted', () => {
    setup();
    svc.conversations.and.returnValue(of([]));
    const fixture = TestBed.createComponent(ConversationsPage);
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.viewportLocked()).toBeFalse();
    fixture.detectChanges();
    expect(chrome.viewportLocked()).toBeTrue();
  });

  // Catches: the one that matters most here — a leak leaves the WHOLE app unable to scroll on
  // every other screen after navigating away from messages. Mirrors the equivalent dockHidden spec.
  it('destroying the page resets the shell viewport lock', () => {
    setup();
    svc.conversations.and.returnValue(of([]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const chrome = TestBed.inject(ShellChromeService);
    expect(chrome.viewportLocked()).toBeTrue();

    fixture.destroy();
    expect(chrome.viewportLocked()).toBeFalse();
  });

  // Catches: the thread left at its scroll-into-view default (the top / oldest messages) instead
  // of being pushed to the newest message once the conversation's rows are in the DOM.
  it('scrolls the thread to the bottom after a conversation loads', async () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_ADA));
    // A real element's native scrollTop setter clamps to the real (here: zero, since the fixture
    // has no genuine overflowing layout) scroll range, so stubbing scrollHeight alone still reads
    // back 0. Spy on both accessors at the prototype level instead and assert on what was actually
    // WRITTEN, not what a clamped read reports back — the thing the component code controls.
    spyOnProperty(Element.prototype, 'scrollHeight', 'get').and.returnValue(1200);
    let scrollTopWritten: number | undefined;
    spyOnProperty(Element.prototype, 'scrollTop', 'set').and.callFake(function (this: Element, v: number) {
      scrollTopWritten = v;
    });
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await flushScroll();

    expect(scrollTopWritten).toBe(1200);
  });

  // Catches: the status computed with string comparison instead of Date.getTime() — Java's
  // Instant serializes with a variable number of fractional-second digits, so a naive string
  // compare would get this backwards on some payloads even when the instants are equal.
  it('shows Read under the last message when counterpartLastReadAt is at or after its createdAt', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_LAST_MINE_READ));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const status = el.querySelector('[data-testid="message-status"]');
    expect(status?.textContent?.trim()).toBe('Read');
  });

  // Catches: Sent shown when the marker is actually current (inverted comparison), and the null
  // marker (nobody has read anything yet) not defaulting to Sent.
  it('shows Sent under the last message when counterpartLastReadAt is null, and when it is older', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_LAST_MINE_SENT_NULL));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="message-status"]')?.textContent?.trim()).toBe('Sent');

    svc.conversation.and.returnValue(of(DETAIL_LAST_MINE_SENT_OLDER));
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="message-status"]')?.textContent?.trim()).toBe('Sent');
  });

  // Catches: the status rendered under any last message regardless of sender — it must render
  // ONLY when the newest message is mine; the other person replying already proves they saw it.
  it('renders no status at all when the last message is the other person\'s', () => {
    setup();
    svc.conversations.and.returnValue(of([CONV_ADA]));
    svc.conversation.and.returnValue(of(DETAIL_LAST_OTHER));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="conversation-row-ath1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="message-status"]')).toBeNull();
  });

  // Catches: the reach note missing entirely, or reading the wrong signal for role (M29a A1.8
  // #3) — copy only, the actual boundary stays server-side in assertMayMessage.
  it('renders the athlete wording for an ATHLETE', () => {
    setup('ATHLETE');
    svc.conversations.and.returnValue(of([CONV_ADA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="reach-note"]')?.textContent).toContain('coaches');
  });

  it('renders the staff wording for a COACH', () => {
    setup('COACH');
    svc.conversations.and.returnValue(of([CONV_ADA]));
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="reach-note"]')?.textContent).toContain('anyone in your gym');
  });

  describe('athlete default contact list', () => {
    // Catches: the list not fetched/rendered by default for an athlete — the whole point of the
    // product decision (their addressable set is tiny, so show it instead of making them search).
    it('an ATHLETE with an empty query sees every addressable contact under Start a chat', () => {
      setup('ATHLETE');
      svc.conversations.and.returnValue(of([]));
      svc.contacts.and.returnValue(of([CONTACT_ADA_DUP, CONTACT_MARCO]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(svc.contacts).toHaveBeenCalledWith('');
      expect(el.querySelector('[data-testid="contact-row-ath1"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="contact-row-staff1"]')).not.toBeNull();
    });

    // Catches: fetching and listing the whole roster for staff instead of staying search-first.
    it('a COACH with an empty query sees none, and the roster is never fetched', () => {
      setup('COACH');
      svc.conversations.and.returnValue(of([]));
      svc.contacts.and.returnValue(of([CONTACT_ADA_DUP, CONTACT_MARCO]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(svc.contacts).not.toHaveBeenCalled();
      expect(el.querySelector('[data-testid="contact-row-ath1"]')).toBeNull();
      expect(el.querySelector('[data-testid="contact-row-staff1"]')).toBeNull();
    });

    // Catches: no de-dup between the default list and existing conversations — someone already
    // messaged would appear twice, once as a conversation row and again under Start a chat.
    it('someone already in the conversation list appears once, not under Start a chat', () => {
      setup('ATHLETE');
      svc.conversations.and.returnValue(of([CONV_ADA]));
      svc.contacts.and.returnValue(of([CONTACT_ADA_DUP, CONTACT_MARCO]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelectorAll('[data-testid="conversation-row-ath1"]').length).toBe(1);
      expect(el.querySelector('[data-testid="contact-row-ath1"]')).toBeNull();
      expect(el.querySelector('[data-testid="contact-row-staff1"]')).not.toBeNull();
    });

    // Catches: the empty state short-circuiting before the rows — an athlete with zero
    // conversations must still see their coaches/admin under Start a chat, plus the reach note.
    it('an athlete with zero conversations sees the contact list, not the bare empty card', () => {
      setup('ATHLETE');
      svc.conversations.and.returnValue(of([]));
      svc.contacts.and.returnValue(of([CONTACT_MARCO]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="conversations-empty"]')).toBeNull();
      expect(el.querySelector('[data-testid="contact-row-staff1"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="reach-note"]')).not.toBeNull();
    });

    // Catches: the genuinely-empty case (no conversations, no addressable contacts at all)
    // regressing — the bare empty card must still show, without the old "search above" copy.
    it('shows the bare empty card when an athlete has no conversations and no contacts at all', () => {
      setup('ATHLETE');
      svc.conversations.and.returnValue(of([]));
      svc.contacts.and.returnValue(of([]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="conversations-empty"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="reach-note"]')).toBeNull();
    });

    // Catches: search regressing for either role once the default-list branch was added.
    it('searching still filters and surfaces contacts for a COACH', fakeAsync(() => {
      setup('COACH');
      svc.conversations.and.returnValue(of([CONV_ADA]));
      svc.contacts.and.returnValue(of([CONTACT_MARCO]));
      const fixture = TestBed.createComponent(ConversationsPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const input = el.querySelector('[data-testid="messages-search"]') as HTMLInputElement;
      input.value = 'marco';
      input.dispatchEvent(new Event('input'));
      tick(300);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="contact-row-staff1"]')).not.toBeNull();
      fixture.destroy();
    }));
  });
});

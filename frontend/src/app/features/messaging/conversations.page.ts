import {
  Component, ChangeDetectionStrategy, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild,
  computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { MessagingService } from './messaging.service';
import { Contact, Conversation, ChatMessage } from './messaging.models';
import { Role } from '../../core/auth/auth.models';
import { roleLabel } from '../../core/auth/labels';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { SearchBarComponent } from '../../ui/search-bar.component';

/** Anyone the list can open a conversation with — an existing counterpart or a not-yet-messaged
 *  contact. Both shapes carry the same four fields, so selection is written against this once. */
type Person = { membershipId: string; name: string; role: Role; avatarPath: string | null };

/**
 * `ConversationsPage`: one screen for `/athlete/messages`, `/coach/inbox` and `/admin/messages`
 * (M29a Amendment A1). The backend already decides who the caller may address
 * (`MessagingService.assertMayMessage` server-side) — nothing here branches on role.
 *
 * List -> conversation, not a route change: `selected()` drives which pane shows on narrow
 * viewports (< 900px), purely via a `.has-selection` class — no `matchMedia` needed for layout,
 * only for the Escape-to-back shortcut, which must not fire on a wide layout where both panes are
 * already visible side by side.
 */
@Component({
  selector: 'bh-conversations',
  standalone: true,
  imports: [DatePipe, ButtonComponent, EmptyComponent, IconComponent, AvatarComponent, SearchBarComponent],
  template: `
    <div class="msg-root" [class.has-selection]="!!selected()">
      <section class="list-pane" aria-label="Conversations" i18n-aria-label="@@conversations.list.ariaLabel">
        <div class="list-head">
          <span class="k" i18n="@@conversations.heading">Messages</span>
          <bh-search-bar
            [(value)]="query"
            (search)="onSearch($event)"
            [debounceMs]="300"
            [label]="searchLabel"
            [placeholder]="searchPlaceholder"
            testId="messages-search" />
        </div>

        @switch (state()) {
          @case ('loading') { <p class="stateline" i18n="@@conversations.loading">Loading your messages…</p> }
          @case ('error') {
            <p class="stateline err">
              <span i18n="@@conversations.error">Couldn't load your messages.</span>
              <button class="retry" (click)="load()" i18n="@@conversations.retry">Try again</button>
            </p>
          }
          @default {
            @if (!hasQuery() && conversations().length === 0) {
              <bh-empty data-testid="conversations-empty" icon="mail" [title]="emptyTitle" [message]="emptyMessage" />
            } @else if (hasQuery() && filteredConversations().length === 0 && startAChatContacts().length === 0) {
              <bh-empty data-testid="search-empty" icon="search" [title]="searchEmptyTitle" [message]="searchEmptyMessage" />
            } @else {
              <div class="rows" aria-live="polite">
                @for (c of filteredConversations(); track c.membershipId) {
                  <button type="button" class="row" [class.selected]="selected()?.membershipId === c.membershipId"
                    [attr.data-testid]="'conversation-row-' + c.membershipId"
                    [attr.aria-current]="selected()?.membershipId === c.membershipId ? 'true' : null"
                    (click)="selectConversation(c)">
                    <bh-avatar [path]="c.avatarPath" [name]="c.name" size="sm" />
                    <span class="row-body">
                      <span class="row-top">
                        <span class="name" [class.unread]="c.unreadCount > 0">{{ c.name }}</span>
                        @if (c.unreadCount > 0) {
                          <span class="badge" [attr.data-testid]="'conversation-unread-' + c.membershipId"
                            [attr.aria-label]="unreadAriaLabel(c.unreadCount)">{{ cappedCount(c.unreadCount) }}</span>
                        }
                      </span>
                      <span class="row-sub">
                        <span class="role">{{ roleLabel(c.role) }}</span>
                        @if (c.lastMessagePreview) { <span class="preview">{{ c.lastMessagePreview }}</span> }
                      </span>
                    </span>
                    <span class="row-side">
                      @if (c.needsReply) {
                        <span class="needs-reply" [attr.data-testid]="'conversation-needs-reply-' + c.membershipId">
                          <span class="dot" aria-hidden="true"></span>
                          <span class="nr-label" i18n="@@conversations.row.needsReply">Needs reply</span>
                        </span>
                      }
                      @if (c.lastMessageAt) { <span class="time">{{ c.lastMessageAt | date:'d MMM, HH:mm' }}</span> }
                    </span>
                  </button>
                }

                @if (startAChatContacts().length) {
                  <span class="k group-k" i18n="@@conversations.startAChat">Start a chat</span>
                  @for (p of startAChatContacts(); track p.membershipId) {
                    <button type="button" class="row contact-row"
                      [attr.data-testid]="'contact-row-' + p.membershipId"
                      [attr.aria-current]="selected()?.membershipId === p.membershipId ? 'true' : null"
                      (click)="selectContact(p)">
                      <bh-avatar [path]="p.avatarPath" [name]="p.name" size="sm" />
                      <span class="row-body">
                        <span class="name">{{ p.name }}</span>
                        <span class="role">{{ roleLabel(p.role) }}</span>
                      </span>
                    </button>
                  }
                }
              </div>
            }
          }
        }
      </section>

      <section class="pane" data-testid="conversation-pane" (keydown.escape)="onConversationEscape()">
        @switch (paneState()) {
          @case ('idle') {
            <bh-empty data-testid="conversation-pane-empty" icon="mail" [title]="pickTitle" [message]="pickMessage" />
          }
          @case ('loading') { <p class="stateline" i18n="@@conversations.pane.loading">Loading…</p> }
          @case ('error') {
            <p class="stateline err">
              <span i18n="@@conversations.pane.error">Couldn't load this conversation.</span>
              <button class="retry" (click)="reload()" i18n="@@conversations.pane.retry">Try again</button>
            </p>
          }
          @default {
            @if (selected(); as p) {
              <header class="pane-head">
                <button type="button" class="back" (click)="back()" [attr.aria-label]="backLabel">
                  <bh-icon name="chevron-left" [size]="18" />
                </button>
                <bh-avatar [path]="p.avatarPath" [name]="p.name" size="sm" />
                <span class="pane-who">
                  <span class="pane-name">{{ p.name }}</span>
                  <span class="pane-role">{{ roleLabel(p.role) }}</span>
                </span>
              </header>

              <div class="thread" aria-live="polite">
                @if (messages().length === 0) {
                  <p class="thread-empty" data-testid="conversation-thread-empty" i18n="@@conversations.thread.empty">
                    Nothing here yet — send the first message.
                  </p>
                } @else {
                  @for (m of messages(); track m.id) {
                    <div class="msg" [class.mine]="m.mine" [attr.data-testid]="'message-' + m.id">
                      <p class="bubble">{{ m.body }}</p>
                      <span class="meta">
                        @if (!m.mine) { <span class="sender">{{ m.senderName }}</span> }
                        <span class="time">{{ m.createdAt | date:'d MMM, HH:mm' }}</span>
                      </span>
                    </div>
                  }
                }
              </div>

              <form class="composer" (submit)="send($event)" novalidate>
                <label for="composerInput" class="clabel" i18n="@@conversations.compose.label">Message</label>
                <div class="composer-row">
                  <textarea #composerInput id="composerInput" rows="2" data-testid="message-composer"
                    [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
                  <bh-button class="send-btn" variant="solid" type="submit"
                    [loading]="sending()" [label]="sendLabel">
                    @if (!sending()) { <bh-icon name="arrow-right" [size]="18" /> }
                  </bh-button>
                </div>
                @if (sendError()) {
                  <p class="err" role="alert" data-testid="composer-error">{{ sendError() }}</p>
                }
              </form>
            }
          }
        }
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .msg-root { display: grid; grid-template-columns: minmax(280px, 340px) 1fr; gap: var(--sp-5);
      min-height: 0; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }

    /* --- list pane --- */
    .list-pane { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; min-height: 0; }
    .list-head { display: flex; flex-direction: column; gap: var(--sp-3); }
    .rows { display: flex; flex-direction: column; overflow-y: auto; }
    .group-k { padding: var(--sp-3) 0 var(--sp-1); }

    .row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; min-height: var(--tap);
      text-align: left; background: transparent; border: none; border-top: 1px solid var(--hairline);
      padding: var(--sp-3) var(--sp-2); cursor: pointer; font: inherit; color: inherit; }
    .rows > .row:first-of-type { border-top: none; }
    .row:hover { background: var(--surface); }
    .row.selected, .row[aria-current="true"] { background: var(--surface-2); }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    .row-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .row-top { display: flex; align-items: center; gap: var(--sp-2); }
    .name { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .name.unread { font-weight: 700; }
    .row-sub { display: flex; gap: var(--sp-2); min-width: 0; overflow: hidden; }
    .role { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
    .preview { font-family: var(--font-body); font-size: var(--fs-sm); color: var(--bone-dim);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

    .row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .badge { min-width: 18px; height: 18px; padding: 0 5px; display: inline-flex; align-items: center;
      justify-content: center; border-radius: var(--r-full); background: var(--surface-2);
      border: 1px solid var(--hairline); color: var(--bone); font-family: var(--font-mono);
      font-size: var(--fs-meta); font-variant-numeric: tabular-nums; line-height: 1; }
    .needs-reply { display: inline-flex; align-items: center; gap: 5px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
    .nr-label { font-size: var(--fs-meta); color: var(--bone-dim); }
    .time { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* --- conversation pane --- */
    .pane { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; min-height: 0; }
    .pane-head { display: flex; align-items: center; gap: var(--sp-3); }
    .back { display: none; min-width: var(--tap); min-height: var(--tap); background: transparent;
      border: none; color: var(--bone); cursor: pointer; align-items: center; justify-content: center; }
    .back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .pane-who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pane-name { font-family: var(--font-body); font-weight: 700; font-size: var(--fs-body); color: var(--bone);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pane-role { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      text-transform: uppercase; letter-spacing: 0.05em; }

    .thread { display: flex; flex-direction: column; gap: var(--sp-3); flex: 1; min-height: 0; overflow-y: auto; }
    .thread-empty { color: var(--bone-dim); font-size: var(--fs-sm); }
    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 78%; align-self: flex-start; }
    .msg.mine { align-self: flex-end; align-items: flex-end; }
    .bubble { margin: 0; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4); font-family: var(--font-body);
      font-size: var(--fs-body); color: var(--bone); overflow-wrap: anywhere; }
    .msg.mine .bubble { background: var(--surface-2); }
    .meta { display: flex; gap: var(--sp-2); font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--faint); font-variant-numeric: tabular-nums; }

    /* composer — layout and selector specificity are load-bearing, see the M29a brief. */
    .composer { display: flex; flex-direction: column; gap: var(--sp-2); }
    .clabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .composer-row { display: flex; align-items: end; gap: var(--sp-2); }
    textarea { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); padding: var(--sp-3); min-height: var(--tap); resize: vertical; }
    textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .send-btn { flex-shrink: 0; }
    .send-btn ::ng-deep .btn.solid { width: var(--tap); min-width: var(--tap); padding: 0;
      border-radius: var(--r-full); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }

    @media (max-width: 899px) {
      .msg-root { display: block; }
      .msg-root.has-selection .list-pane { display: none; }
      .msg-root:not(.has-selection) .pane { display: none; }
      .back { display: inline-flex; }
    }
  `],
})
export class ConversationsPage implements OnInit, OnDestroy {
  private messaging = inject(MessagingService);

  @ViewChild('composerInput') private composerInputRef?: ElementRef<HTMLTextAreaElement>;

  protected readonly roleLabel = roleLabel;

  protected state = signal<'loading' | 'error' | 'ready'>('loading');
  protected conversations = signal<Conversation[]>([]);

  protected query = signal('');
  protected contactResults = signal<Contact[]>([]);
  private searchSubject = new Subject<string>();

  protected selected = signal<Person | null>(null);
  protected paneState = signal<'idle' | 'loading' | 'error' | 'ready'>('idle');
  protected messages = signal<ChatMessage[]>([]);

  protected draft = signal('');
  protected sending = signal(false);
  protected sendError = signal<string | null>(null);

  protected hasQuery = computed(() => this.query().trim().length > 0);
  protected filteredConversations = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.conversations();
    return this.conversations().filter(c => c.name.toLowerCase().includes(q));
  });
  protected startAChatContacts = computed(() => {
    if (!this.hasQuery()) return [];
    const existing = new Set(this.conversations().map(c => c.membershipId));
    return this.contactResults().filter(c => !existing.has(c.membershipId));
  });

  protected readonly searchLabel = $localize`:@@conversations.search.label:Search people`;
  protected readonly searchPlaceholder = $localize`:@@conversations.search.placeholder:Search…`;
  protected readonly emptyTitle = $localize`:@@conversations.empty.title:No messages yet`;
  protected readonly emptyMessage = $localize`:@@conversations.empty.message:Message your coaches or the box admin — search for a name above to start.`;
  protected readonly searchEmptyTitle = $localize`:@@conversations.searchEmpty.title:No match`;
  protected readonly searchEmptyMessage = $localize`:@@conversations.searchEmpty.message:Nobody in this box matches that search.`;
  protected readonly pickTitle = $localize`:@@conversations.pane.pick.title:Pick a conversation`;
  protected readonly pickMessage = $localize`:@@conversations.pane.pick.message:Select someone from the list to see your messages.`;
  protected readonly backLabel = $localize`:@@conversations.back:Back to messages`;
  protected readonly sendLabel = $localize`:@@conversations.compose.send:Send`;
  private readonly emptyDraftError = $localize`:@@conversations.compose.error.empty:Write a message before sending.`;
  private readonly tooLongError = $localize`:@@conversations.compose.error.tooLong:Message is too long (max 4000 characters).`;
  private readonly sendFailedError = $localize`:@@conversations.compose.error.failed:Couldn't send. Try again.`;

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  constructor() {
    this.searchSubject.pipe(
      switchMap(q => this.messaging.contacts(q).pipe(catchError(() => of([] as Contact[])))),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(list => this.contactResults.set(list));
  }

  ngOnInit(): void {
    this.load();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy(): void {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  load(): void {
    this.state.set('loading');
    this.messaging.conversations().subscribe({
      next: rows => { this.conversations.set(rows); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  protected onSearch(q: string): void {
    if (!q.trim()) { this.contactResults.set([]); return; }
    this.searchSubject.next(q);
  }

  protected cappedCount(n: number): string { return n > 99 ? '99+' : String(n); }

  /** Splitting one/other rather than interpolating a count into one sentence: a plural rule other
   *  than English's needs the branch, and it also sidesteps the `${n}:count:` placeholder-position
   *  bug documented on the shell's envelope (the same rule as `linkAriaLabel` there). */
  protected unreadAriaLabel(n: number): string {
    if (n === 1) return $localize`:@@conversations.row.unread.one:1 unread message`;
    return $localize`:@@conversations.row.unread.many:${n}:count: unread messages`;
  }

  protected selectConversation(c: Conversation): void { this.openConversation(c); }
  protected selectContact(p: Contact): void { this.openConversation(p); }

  private openConversation(person: Person): void {
    this.selected.set(person);
    this.paneState.set('loading');
    this.messages.set([]);
    this.draft.set('');
    this.sendError.set(null);
    this.messaging.conversation(person.membershipId).subscribe({
      next: detail => {
        this.messages.set(detail.messages);
        this.paneState.set('ready');
        this.messaging.markRead(person.membershipId).subscribe({ error: () => {} });
        this.zeroUnreadLocally(person.membershipId);
      },
      error: () => this.paneState.set('error'),
    });
  }

  protected reload(): void {
    const p = this.selected();
    if (p) this.openConversation(p);
  }

  private zeroUnreadLocally(membershipId: string): void {
    this.conversations.update(list => list.map(c =>
      c.membershipId === membershipId && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c));
  }

  protected back(): void {
    const id = this.selected()?.membershipId;
    this.selected.set(null);
    this.paneState.set('idle');
    if (id) {
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="conversation-row-${id}"], [data-testid="contact-row-${id}"]`);
        el?.focus();
      });
    }
  }

  protected onConversationEscape(): void {
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 899px)').matches) this.back();
  }

  protected send(event: Event): void {
    event.preventDefault();
    const person = this.selected();
    if (!person) return;
    const body = this.draft().trim();
    if (!body) { this.sendError.set(this.emptyDraftError); return; }
    if (body.length > 4000) { this.sendError.set(this.tooLongError); return; }

    this.sendError.set(null);
    this.sending.set(true);
    this.messaging.send(person.membershipId, body).subscribe({
      next: msg => {
        this.messages.update(list => [...list, msg]);
        this.sending.set(false);
        this.draft.set('');
        this.insertOrBumpConversation(person, msg);
        queueMicrotask(() => this.composerInputRef?.nativeElement.focus());
      },
      error: () => {
        this.sending.set(false);
        this.sendError.set(this.sendFailedError);
      },
    });
  }

  private insertOrBumpConversation(person: Person, msg: ChatMessage): void {
    this.conversations.update(list => {
      const idx = list.findIndex(c => c.membershipId === person.membershipId);
      if (idx === -1) {
        const created: Conversation = {
          membershipId: person.membershipId, name: person.name, role: person.role,
          avatarPath: person.avatarPath, lastMessagePreview: msg.body, lastMessageAt: msg.createdAt,
          unreadCount: 0, needsReply: false,
        };
        return [created, ...list];
      }
      const updated = { ...list[idx], lastMessagePreview: msg.body, lastMessageAt: msg.createdAt, needsReply: false };
      return [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
    });
  }

  private startPoll(): void {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.poll(), 20000);
  }

  private stopPoll(): void {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }

  /** A poll failure must never flip the screen to the error state — it's ambient refresh, not
   *  the initial load. */
  private poll(): void {
    this.messaging.conversations().subscribe({
      next: rows => this.conversations.set(rows),
      error: () => {},
    });
    const person = this.selected();
    if (person) {
      this.messaging.conversation(person.membershipId).subscribe({
        next: detail => this.messages.set(detail.messages),
        error: () => {},
      });
    }
  }
}

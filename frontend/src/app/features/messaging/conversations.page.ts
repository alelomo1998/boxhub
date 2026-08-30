import {
  Component, ChangeDetectionStrategy, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild,
  computed, effect, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { MessagingService } from './messaging.service';
import { Contact, Conversation, ChatMessage } from './messaging.models';
import { HomeService } from '../athlete/home.service';
import { Role } from '../../core/auth/auth.models';
import { roleLabel } from '../../core/auth/labels';
import { ShellChromeService } from '../../core/shell-chrome.service';
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
                        <span class="role">{{ roleLabel(c.role) }}</span>
                      </span>
                      @if (c.lastMessagePreview) {
                        <span class="row-sub">
                          <span class="preview">{{ c.lastMessagePreview }}</span>
                        </span>
                      }
                    </span>
                    <span class="row-side">
                      @if (c.unreadCount > 0) {
                        <span class="badge" [attr.data-testid]="'conversation-unread-' + c.membershipId"
                          [attr.aria-label]="unreadAriaLabel(c.unreadCount)">{{ cappedCount(c.unreadCount) }}</span>
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
                        <span class="row-top">
                          <span class="name">{{ p.name }}</span>
                          <span class="role">{{ roleLabel(p.role) }}</span>
                        </span>
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
                  @for (g of dayGroups(); track g.dayKey) {
                    <div class="day-sep" [attr.data-testid]="'day-' + g.dayKey" role="separator"
                      [attr.aria-label]="g.rows[0].msg.createdAt | date:'d MMMM'">
                      <span class="rule" aria-hidden="true"></span>
                      <span class="day-label">{{ g.rows[0].msg.createdAt | date:'d MMMM' }}</span>
                      <span class="rule" aria-hidden="true"></span>
                    </div>
                    @for (row of g.rows; track row.msg.id) {
                      <div class="msg" [class.mine]="row.msg.mine" [attr.data-testid]="'message-' + row.msg.id">
                        <bh-avatar class="msg-avatar" [class.spacer]="!row.showAvatar"
                          [attr.aria-hidden]="!row.showAvatar ? 'true' : null"
                          [path]="row.msg.mine ? null : p.avatarPath"
                          [name]="row.msg.mine ? myName() : p.name" size="sm" />
                        <span class="msg-body">
                          <p class="bubble">{{ row.msg.body }}</p>
                          <span class="meta">{{ row.msg.createdAt | date:'HH:mm' }}</span>
                        </span>
                      </div>
                    }
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
    /* Height chain for the pinned composer (M29a A1.7 #3): the host is otherwise a plain inline
       custom element and sizes to its content, so .pane never has a bounded height to scroll
       within and the composer just trails wherever the content ends. :host takes the full height
       the shell's flex .content already hands this route, .msg-root fills it, and grid's default
       stretch (or, on the sub-900px block layout, the explicit height below) hands that height to
       .pane, whose own flex column (.thread flex:1 + min-height:0) is what makes the thread scroll
       instead of the pane growing. */
    :host { display: block; height: 100%; min-height: 0; }
    .msg-root { height: 100%; display: grid; grid-template-columns: minmax(280px, 340px) 1fr; gap: var(--sp-5);
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
      text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0; }
    .preview { font-family: var(--font-body); font-size: var(--fs-sm); color: var(--bone-dim);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

    .row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .badge { min-width: 18px; height: 18px; padding: 0 5px; display: inline-flex; align-items: center;
      justify-content: center; border-radius: var(--r-full); background: var(--surface-2);
      border: 1px solid var(--hairline); color: var(--bone); font-family: var(--font-mono);
      font-size: var(--fs-meta); font-variant-numeric: tabular-nums; line-height: 1; }
    .time { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* --- conversation pane --- */
    /* height:100% here is what actually pins the composer on the sub-900px block layout below,
       where .pane is a plain block child of .msg-root rather than a stretched grid item. */
    .pane { height: 100%; display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; min-height: 0; }
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

    /* day separator — a divider, not a heading: quiet, centred, hairline either side. */
    .day-sep { display: flex; align-items: center; gap: var(--sp-3); margin: var(--sp-2) 0; }
    .day-sep .rule { flex: 1; border-top: 1px solid var(--hairline); }
    .day-label { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); white-space: nowrap; }

    .msg { display: flex; align-items: flex-start; gap: var(--sp-2); max-width: 78%; align-self: flex-start; }
    .msg.mine { align-self: flex-end; flex-direction: row-reverse; }
    .msg-avatar { flex-shrink: 0; }
    .msg-avatar.spacer { visibility: hidden; }
    .msg-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .msg.mine .msg-body { align-items: flex-end; }
    .bubble { margin: 0; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4); font-family: var(--font-body);
      font-size: var(--fs-body); color: var(--bone); overflow-wrap: anywhere; }
    .msg.mine .bubble { background: var(--surface-2); }
    .meta { font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--faint); font-variant-numeric: tabular-nums; }

    /* composer — layout and selector specificity are load-bearing, see the M29a brief. */
    /* STICKY, not a flex child pinned to the bottom of a full-height pane. The height chain that
       would allow the latter cannot resolve: the shells set .app to min-height 100dvh, which is
       NOT a definite height, so height 100% on this route falls back to auto and .thread grows to
       its content instead of scrolling inside a fixed box. Measured: pane 672px inside a .content
       that had itself grown to 776px, document scrolling 98px past the viewport, and the composer
       sitting at the document's end — underneath the fixed dock, which is exactly the bug this is
       fixing. Sticky needs no definite ancestor height: the page scrolls, the composer stays put.
       The bottom offset matches the shell's own dock reserve so it lands just above the dock, and
       the opaque ground plus a hairline stop messages showing through as they scroll behind it. */
    .composer { position: sticky; bottom: 0; z-index: 1; flex-shrink: 0;
      display: flex; flex-direction: column; gap: var(--sp-2);
      background: var(--ground); border-top: 1px solid var(--hairline);
      padding-top: var(--sp-3); }
    /* Below 719px the shell's dock is hidden by ShellChromeService.dockHidden while a
       conversation is open (the Instagram DM behaviour), so this offset is the true viewport
       bottom, not the dock reserve. */
    @media (max-width: 719px) {
      .composer { bottom: env(safe-area-inset-bottom); }
    }
    .clabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .composer-row { display: flex; align-items: end; gap: var(--sp-2); }
    textarea { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); padding: var(--sp-3); min-height: var(--tap); resize: none; }
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
  private homeService = inject(HomeService);
  private chrome = inject(ShellChromeService);

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

  /** The dock's own breakpoint (719px) — deliberately NOT the 900px pane breakpoint above, which
   *  only governs which of the two panes shows. Below 719px, with a conversation open, the dock
   *  is hidden and the composer anchors to the true viewport bottom (Instagram DM behaviour). */
  protected narrow = signal(false);
  private narrowQuery?: MediaQueryList;
  private narrowHandler = (e: MediaQueryListEvent) => this.narrow.set(e.matches);

  /** No avatar path for "me" exists on any messaging DTO (M29a A1.7 #4) — only the name, reused
   *  from the same profile call the shell already makes. `bh-avatar` falls back to initials with
   *  no `[path]`. */
  protected myName = signal('');

  /** Day-grouped, run-collapsed view of `messages()` — built here, not in the template, per the
   *  M29a brief. A run resets at both a sender change AND a day boundary, so the first message of
   *  a new day always shows its avatar even if the same person is still talking. `dayKey` is the
   *  LOCAL calendar date (`Date` getters, not the ISO string's UTC slice) so a late-evening message
   *  lands in the right day for the viewer. */
  protected dayGroups = computed(() => {
    const groups: { dayKey: string; rows: { msg: ChatMessage; showAvatar: boolean }[] }[] = [];
    let prevSender: string | null = null;
    for (const m of this.messages()) {
      const d = new Date(m.createdAt);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let group = groups[groups.length - 1];
      if (!group || group.dayKey !== dayKey) {
        group = { dayKey, rows: [] };
        groups.push(group);
        prevSender = null;
      }
      group.rows.push({ msg: m, showAvatar: m.senderMembershipId !== prevSender });
      prevSender = m.senderMembershipId;
    }
    return groups;
  });

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

    // Dock hidden ⇔ narrow AND a conversation is open — the Instagram DM behaviour. Driven by an
    // effect rather than set at each call site so it can never go stale as selected()/narrow()
    // change independently (search, back(), Escape, the media query listener).
    effect(() => this.chrome.dockHidden.set(this.narrow() && !!this.selected()));
  }

  ngOnInit(): void {
    this.load();
    this.homeService.myProfile().subscribe({
      next: p => this.myName.set(p.name),
      error: () => {},
    });
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.narrowQuery = window.matchMedia('(max-width: 719px)');
      this.narrow.set(this.narrowQuery.matches);
      this.narrowQuery.addEventListener('change', this.narrowHandler);
    }
  }

  ngOnDestroy(): void {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
    this.narrowQuery?.removeEventListener('change', this.narrowHandler);
    // Critical: reset unconditionally. Leaving this true after navigating away with a
    // conversation open would remove the dock — and with it navigation — from every other screen.
    this.chrome.dockHidden.set(false);
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

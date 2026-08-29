import {
  Component, ElementRef, OnInit, OnDestroy, ViewChild, computed, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MessagingService } from './messaging.service';
import { Thread, InboxRow } from './messaging.models';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';

/**
 * Staff inbox: the coach/admin twin of `athlete-messages.page.ts` — a two-pane split (list of
 * member conversations, selected thread) rather than the athlete's single conversation.
 *
 * `needsReply` is rendered exactly as the server sends it and never recomputed here — the same
 * rule as the athlete screen's "New" marker, for the same reason: this component doesn't know the
 * staff-side read state well enough to derive it, and guessing wrong is worse than a beat of lag.
 *
 * Mobile (< 900px) turns the list into a lateral drawer rather than a drill-down route, per the
 * explicit brief ("the lateral menu can be closed and open"). The drawer stays mounted at all
 * viewport sizes — `inert` + `aria-hidden` take it out of the tab order and a11y tree when closed
 * on mobile, rather than `@if`-unmounting it, so the slide transition has something to animate
 * between. At >= 900px `isDesktop()` forces both flags off regardless of `drawerOpen()`, which is
 * what makes the same element double as a static column there.
 */
@Component({
  selector: 'bh-staff-inbox',
  standalone: true,
  imports: [DatePipe, ButtonComponent, EmptyComponent, IconComponent],
  template: `
    <section class="inbox" data-testid="inbox-root">
      @switch (state()) {
        @case ('loading') { <p class="stateline" i18n="@@inbox.loading">Loading your inbox…</p> }
        @case ('error') {
          <p class="stateline err">
            <span i18n="@@inbox.error">Couldn't load the inbox.</span>
            <button class="retry" (click)="load()" i18n="@@inbox.retry">Try again</button>
          </p>
        }
        @default {
          @if (isEmpty()) {
            <bh-empty data-testid="inbox-empty" icon="inbox" [title]="emptyTitle" [message]="emptyMessage" />
          } @else {
            <button #drawerToggle type="button" class="drawer-toggle" data-testid="inbox-list-toggle"
              [attr.aria-expanded]="drawerOpen() ? 'true' : 'false'" aria-controls="inboxList"
              (click)="toggleDrawer()">
              <bh-icon name="users" [size]="16" />
              <span i18n="@@inbox.toggle.label">{rows().length, plural, one {1 conversation} other {{{rows().length}} conversations}}</span>
            </button>

            <div class="split">
              <aside class="list" id="inboxList" aria-label="Inbox conversations" i18n-aria-label="@@inbox.list.ariaLabel"
                [class.open]="drawerOpen()"
                [attr.aria-hidden]="hideList() ? 'true' : null"
                [attr.inert]="hideList() ? '' : null">
                <h2 class="k" i18n="@@inbox.list.heading">Inbox</h2>
                <div class="rows">
                  @for (row of rows(); track row.membershipId) {
                    <button type="button" class="row" [class.selected]="selected() === row.membershipId"
                      [attr.data-testid]="'inbox-row-' + row.membershipId"
                      [attr.aria-current]="selected() === row.membershipId ? 'true' : null"
                      (click)="selectRow(row.membershipId)">
                      <span class="row-top">
                        <span class="name">{{ row.memberName ?? anonymousLabel }}</span>
                        @if (row.needsReply) {
                          <span class="needs-reply" [attr.data-testid]="'inbox-needs-reply-' + row.membershipId">
                            <span class="dot" aria-hidden="true"></span>
                            <span class="nr-label" i18n="@@inbox.row.needsReply">Needs reply</span>
                          </span>
                        }
                      </span>
                      @if (row.lastMessagePreview) {
                        <span class="preview">{{ row.lastMessagePreview }}</span>
                      }
                      <span class="time num">{{ row.lastMessageAt | date:'d MMM, HH:mm' }}</span>
                    </button>
                  }
                </div>
              </aside>

              @if (mobileDrawerOpen()) {
                <div class="scrimlayer" data-testid="inbox-scrim" (click)="closeDrawer()"></div>
              }

              <section class="thread" data-testid="thread-pane">
                @if (!selected()) {
                  <bh-empty data-testid="thread-preselect-empty" icon="mail"
                    [title]="preselectTitle" [message]="preselectMessage" />
                } @else {
                  <header class="thead">
                    <h2 class="member-name">{{ selectedRow()?.memberName ?? anonymousLabel }}</h2>
                  </header>

                  @switch (threadState()) {
                    @case ('loading') { <p class="stateline" i18n="@@inbox.thread.loading">Loading conversation…</p> }
                    @case ('error') {
                      <p class="stateline err">
                        <span i18n="@@inbox.thread.error">Couldn't load this conversation.</span>
                        <button class="retry" (click)="loadThread(selected()!)" i18n="@@inbox.thread.retry">Try again</button>
                      </p>
                    }
                    @default {
                      @if (isThreadEmpty()) {
                        <bh-empty data-testid="thread-empty" icon="inbox"
                          [title]="threadEmptyTitle" [message]="threadEmptyMessage" />
                      } @else {
                        <div class="msgs-list">
                          @for (m of thread()!.messages; track m.id) {
                            <div class="bubble-row" [class.own]="m.senderSide === 'STAFF'"
                                 [attr.data-testid]="'message-' + m.id">
                              <div class="bubble">
                                <p class="body">{{ m.body }}</p>
                              </div>
                              <span class="meta num">
                                @if (m.senderSide === 'STAFF' && m.senderName) { {{ m.senderName }} · }
                                {{ m.createdAt | date:'d MMM, HH:mm' }}
                              </span>
                            </div>
                          }
                        </div>
                      }
                    }
                  }

                  <form class="composer" (submit)="send($event)" novalidate>
                    <label for="composerInput" class="clabel" i18n="@@inbox.compose.label">Reply</label>
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
              </section>
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { --z-scrim: 25; --z-drawer: 26; }

    .inbox { display: flex; flex-direction: column; gap: var(--sp-4); }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-3); }

    .drawer-toggle { display: none; }

    .split { display: grid; grid-template-columns: minmax(260px, 320px) 1fr; gap: var(--sp-5);
      align-items: start; min-width: 0; }

    .list { border: 1px solid var(--hairline); border-radius: var(--r-card); overflow-y: auto;
      max-height: calc(100dvh - var(--sp-10)); padding: var(--sp-4); min-width: 0; }
    .rows { display: flex; flex-direction: column; }
    .row { display: flex; flex-direction: column; align-items: flex-start; width: 100%; min-width: 0;
      min-height: var(--tap); padding: var(--sp-3) var(--sp-2); background: transparent; border: none;
      border-bottom: 1px solid var(--hairline); text-align: left; cursor: pointer; }
    .row:last-child { border-bottom: none; }
    .row:hover:not(.selected) { background: var(--surface); }
    .row.selected { background: var(--surface-2); }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .row-top { display: flex; align-items: center; gap: var(--sp-2); width: 100%; min-width: 0; }
    .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone); font-weight: 600; }
    /* --bone, not --volt — a staff plumbing screen. The box switcher already spent this shell's
       one volt element (design law, box-switcher note). */
    .needs-reply { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bone); flex-shrink: 0; }
    .nr-label { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--bone); }

    .preview { display: block; width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; font-family: var(--font-body); font-size: var(--fs-sm); color: var(--bone-dim);
      margin-top: 2px; }
    .time { display: block; margin-top: 4px; font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--faint); font-variant-numeric: tabular-nums; }

    .scrimlayer { display: none; }

    .thread { min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4);
      border: 1px solid var(--hairline); border-radius: var(--r-card); padding: var(--sp-5); }
    .member-name { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      color: var(--bone); overflow-wrap: anywhere; }

    .msgs-list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .bubble-row { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .bubble-row.own { align-items: flex-end; }
    .bubble { max-width: 78%; border: 1px solid var(--hairline); border-radius: var(--r-card);
      padding: var(--sp-3) var(--sp-4); background: var(--surface); }
    .bubble-row.own .bubble { background: var(--surface-2); }
    .body { margin: 0; font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone);
      overflow-wrap: anywhere; }
    .meta { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint); }

    .composer { display: flex; flex-direction: column; gap: var(--sp-2); }
    .clabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .composer-row { display: flex; align-items: end; gap: var(--sp-2); }
    textarea { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); padding: var(--sp-3); min-height: var(--tap); resize: vertical; }
    textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .send-btn { flex-shrink: 0; }
    .send-btn ::ng-deep .btn { min-width: var(--tap); padding: 0; border-radius: var(--r-full); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }

    @media (max-width: 899px) {
      .split { display: block; min-width: 0; }
      .drawer-toggle { display: inline-flex; align-items: center; gap: var(--sp-2); min-height: var(--tap);
        padding: 0 var(--sp-4); margin-bottom: var(--sp-4); background: var(--surface);
        border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
        font-family: var(--font-body); font-size: var(--fs-sm); font-weight: 600; cursor: pointer; }
      .drawer-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      .list { position: fixed; inset-block: 0; left: 0; width: min(86vw, 320px); max-height: none;
        z-index: var(--z-drawer); border-radius: 0; border-top: none; border-bottom: none; border-left: none;
        background: var(--surface); transform: translateX(-100%);
        transition: transform var(--dur) var(--ease-out); overflow-y: auto; }
      .list.open { transform: translateX(0); }
      .scrimlayer { display: block; position: fixed; inset: 0; background: var(--scrim);
        z-index: var(--z-scrim); }
    }
    @media (prefers-reduced-motion: reduce) {
      .list { transition: none; }
    }
  `],
})
export class StaffInboxPage implements OnInit, OnDestroy {
  private svc = inject(MessagingService);

  @ViewChild('composerInput') private composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('drawerToggle') private drawerToggle?: ElementRef<HTMLButtonElement>;

  readonly emptyTitle = $localize`:@@inbox.empty.title:Nothing yet`;
  readonly emptyMessage = $localize`:@@inbox.empty.message:Messages from members will show up here.`;
  readonly preselectTitle = $localize`:@@inbox.preselect.title:Pick a conversation`;
  readonly preselectMessage = $localize`:@@inbox.preselect.message:Choose a member from the inbox to read and reply.`;
  readonly threadEmptyTitle = $localize`:@@inbox.thread.empty.title:No messages yet`;
  readonly threadEmptyMessage = $localize`:@@inbox.thread.empty.message:Nothing here yet.`;
  readonly anonymousLabel = $localize`:@@inbox.row.unknownMember:Member`;
  readonly sendLabel = $localize`:@@inbox.compose.send:Send`;

  state = signal<'loading' | 'error' | 'ready'>('loading');
  rows = signal<InboxRow[]>([]);
  selected = signal<string | null>(null);
  threadState = signal<'loading' | 'error' | 'ready'>('ready');
  thread = signal<Thread | null>(null);
  draft = signal('');
  sending = signal(false);
  sendError = signal('');

  private mq = window.matchMedia('(min-width: 900px)');
  isDesktop = signal(this.mq.matches);
  drawerOpen = signal(false);

  isEmpty = computed(() => this.rows().length === 0);
  isThreadEmpty = computed(() => (this.thread()?.messages.length ?? 0) === 0);
  selectedRow = computed(() => this.rows().find(r => r.membershipId === this.selected()) ?? null);
  /** Off the a11y tree/tab order only when it's genuinely a hidden mobile drawer — never at
   *  >= 900px, where the same element is the static list column. */
  hideList = computed(() => !this.isDesktop() && !this.drawerOpen());
  mobileDrawerOpen = computed(() => !this.isDesktop() && this.drawerOpen());

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();
  private mqHandler = () => this.isDesktop.set(this.mq.matches);
  private escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drawerOpen()) this.closeDrawer();
  };

  ngOnInit() {
    this.load();
    document.addEventListener('visibilitychange', this.visHandler);
    document.addEventListener('keydown', this.escHandler);
    this.mq.addEventListener('change', this.mqHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
    document.removeEventListener('keydown', this.escHandler);
    this.mq.removeEventListener('change', this.mqHandler);
  }

  toggleDrawer() {
    this.drawerOpen.update(v => !v);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.drawerToggle?.nativeElement.focus();
  }

  load() {
    this.state.set('loading');
    this.svc.inbox().subscribe({
      next: rows => { this.rows.set(rows); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  selectRow(membershipId: string) {
    this.selected.set(membershipId);
    this.drawerOpen.set(false);
    this.loadThread(membershipId);
    this.svc.markThreadRead(membershipId).subscribe({ next: () => {}, error: () => {} });
  }

  loadThread(membershipId: string) {
    this.threadState.set('loading');
    this.svc.thread(membershipId).subscribe({
      next: t => { this.thread.set(t); this.threadState.set('ready'); },
      error: () => this.threadState.set('error'),
    });
  }

  private startPoll() {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.poll(), 20000);
  }

  private stopPoll() {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }

  /** Re-fetches the inbox list and, if a conversation is open, that thread. Never flips state()
   *  or threadState() on failure — a poll failure must not blank an already-reading screen. */
  private poll() {
    this.svc.inbox().subscribe({ next: rows => this.rows.set(rows), error: () => {} });
    const sel = this.selected();
    if (sel) {
      this.svc.thread(sel).subscribe({ next: t => this.thread.set(t), error: () => {} });
    }
  }

  send(event?: Event) {
    event?.preventDefault();
    const membershipId = this.selected();
    if (!membershipId) return;
    const body = this.draft().trim();
    // The real guard — Enter submits regardless of any button's [disabled].
    if (!body || body.length > 4000) {
      this.sendError.set($localize`:@@inbox.compose.error.invalid:Write a message (up to 4000 characters).`);
      return;
    }
    this.sendError.set('');
    this.sending.set(true);
    this.svc.sendAsStaff(membershipId, body).subscribe({
      next: m => {
        const t = this.thread();
        this.thread.set(t ? { ...t, messages: [...t.messages, m] } : { id: null, messages: [m], memberLastReadAt: null });
        this.draft.set('');
        this.sending.set(false);
        this.composerInput?.nativeElement.focus();
      },
      error: () => {
        this.sending.set(false);
        this.sendError.set($localize`:@@inbox.compose.error.failed:Couldn't send — try again.`);
      },
    });
  }
}

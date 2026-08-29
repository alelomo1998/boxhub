import {
  Component, ElementRef, OnInit, OnDestroy, ViewChild, computed, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MessagingService } from './messaging.service';
import { Thread, MyAnnouncement } from './messaging.models';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';

/**
 * Athlete messages: conversation-first. Notices are a collapsed disclosure bar — broadcast, rare,
 * read-only — that opens itself only when an announcement is genuinely new, so the thing the
 * athlete came to do (read the latest reply, answer it) owns the thumb zone.
 *
 * A poll only ever re-fetches the thread — never announcements — so a "New" marker, captured once
 * from the first load's `read` flags, can't be erased mid-visit while the athlete is still reading
 * it (M29a Task 8 brief).
 */
@Component({
  selector: 'bh-athlete-messages',
  standalone: true,
  imports: [DatePipe, ButtonComponent, EmptyComponent, IconComponent],
  template: `
    <section class="msgs" data-testid="messages-root">
      @switch (state()) {
        @case ('loading') { <p class="stateline" i18n="@@messages.loading">Loading your messages…</p> }
        @case ('error') {
          <p class="stateline err">
            <span i18n="@@messages.error">Couldn't load your messages.</span>
            <button class="retry" (click)="load()" i18n="@@messages.retry">Try again</button>
          </p>
        }
        @default {
          @if (isFullEmpty()) {
            <bh-empty data-testid="messages-empty" icon="inbox"
              [title]="emptyTitle" [message]="emptyMessage" />
          } @else {
            @if (announcements().length) {
              <details class="notices" data-testid="announcements-section" [attr.open]="hasNew() ? '' : null">
                <summary class="notices-bar">
                  <bh-icon name="chevron-right" [size]="16" class="chevron" />
                  <span class="k nb" i18n="@@messages.notices.heading">Notices</span>
                  @if (hasNew()) {
                    <span class="count num" i18n="@@messages.notices.count.new">{newCount(), plural, one {1 new} other {{{newCount()}} new}}</span>
                  } @else {
                    <span class="count num" i18n="@@messages.notices.count.total">{totalCount(), plural, one {1 notice} other {{{totalCount()}} notices}}</span>
                  }
                </summary>
                <div class="notices-list">
                  @for (a of announcements(); track a.id) {
                    <div class="notice" [class.new]="isNew(a.id)" [attr.data-testid]="'announcement-' + a.id">
                      <div class="notice-head">
                        @if (isNew(a.id)) {
                          <span class="dot" aria-hidden="true"></span>
                          <span class="new-label" i18n="@@messages.notice.new">New</span>
                        }
                        <span class="notice-meta num">{{ a.sentAt | date:'d MMM' }} · {{ a.sentAt | date:'HH:mm' }}</span>
                      </div>
                      <p class="notice-body">{{ a.body }}</p>
                    </div>
                  }
                </div>
              </details>
            }

            <section class="conv" data-testid="conversation-section">
              <h2 class="k" i18n="@@messages.conversation.heading">Conversation</h2>
              @if (isThreadEmpty()) {
                <bh-empty data-testid="thread-empty" icon="inbox"
                  [title]="threadEmptyTitle" [message]="threadEmptyMessage" />
              } @else {
                <div class="msgs-list">
                  @for (m of thread()!.messages; track m.id) {
                    <div class="bubble-row" [class.own]="m.senderSide === 'MEMBER'"
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
            </section>
          }

          <form class="composer" (submit)="send($event)" novalidate>
            <label for="composerInput" class="clabel" i18n="@@messages.compose.label">Message your gym</label>
            <div class="composer-row">
              <textarea #composerInput id="composerInput" rows="2" data-testid="message-composer"
                [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
              <!-- variant="solid", NOT the default primary: primary is volt-filled, and this
                   shell's one volt element is already the box switcher's mark. The solid variant
                   exists for exactly this — neutral filled, pressable, spends no volt budget.
                   Icon-only, so the accessible name comes from [label]; the glyph is aria-hidden
                   inside bh-icon and could never supply one. -->
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
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .msgs { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-5); }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-3); }

    /* Collapsed disclosure bar — broadcast, rare, read-only, so it is a bar rather than a
       standing section. Native <details>/<summary>: keyboard- and screen-reader-correct with no
       hand-rolled aria-expanded widget. */
    .notices { border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden; }
    .notices-bar { list-style: none; cursor: pointer; display: flex; align-items: center;
      gap: var(--sp-2); min-height: var(--tap); padding: 0 var(--sp-4); }
    .notices-bar::-webkit-details-marker { display: none; }
    .notices-bar:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .notices-bar .nb { margin: 0; }
    .chevron { color: var(--faint); transition: transform var(--dur) var(--ease-out); }
    .notices[open] .chevron { transform: rotate(90deg); }
    @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
    /* --bone, not --volt — the count is plumbing on a plumbing screen; the shell header's box
       switcher already spent this shell's one volt element. */
    .count { color: var(--bone); font-weight: 600; margin-left: auto; }

    .notices-list { border-top: 1px solid var(--hairline); }
    .notice { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--hairline); }
    .notice:last-child { border-bottom: none; }
    .notice-head { display: flex; align-items: center; gap: 6px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bone); flex-shrink: 0; }
    .new-label { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--bone); }
    .notice-meta { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      margin-left: auto; }
    .notice-body { margin: 4px 0 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); overflow-wrap: anywhere; }
    .notice.new .notice-body { font-weight: 600; }

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
    /* The control and its action on one line — the send sits beside what you typed, not stacked
       under it in a full-width bar. align-items:end keeps the circle on the last line as the
       textarea grows. */
    .composer-row { display: flex; align-items: end; gap: var(--sp-2); }
    textarea { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); padding: var(--sp-3); min-height: var(--tap); resize: vertical; }
    textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* Circular and square-tapped. bh-button owns min-height: var(--tap); this pins the width to
       match and rounds it, rather than re-implementing the control's markup in the screen. */
    .send-btn { flex-shrink: 0; }
    /* .btn.solid (0,3,0) deliberately out-specifies the component's own .btn.md (0,2,0), which
       carries the horizontal padding. Matching .btn alone ties on specificity and the winner then
       depends on stylesheet order — it lost, and the circle rendered 54x44. */
    .send-btn ::ng-deep .btn.solid { width: var(--tap); min-width: var(--tap); padding: 0;
      border-radius: var(--r-full); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
  `],
})
export class AthleteMessagesPage implements OnInit, OnDestroy {
  private svc = inject(MessagingService);

  @ViewChild('composerInput') private composerInput?: ElementRef<HTMLTextAreaElement>;

  readonly emptyTitle = $localize`:@@messages.empty.title:Nothing yet`;
  readonly emptyMessage = $localize`:@@messages.empty.message:Message your gym and they'll get back to you.`;
  readonly threadEmptyTitle = $localize`:@@messages.thread.empty.title:No messages yet`;
  readonly threadEmptyMessage = $localize`:@@messages.thread.empty.message:Say hello — your box will see it here.`;
  /** The icon-only send button's accessible name — the arrow is aria-hidden and supplies none. */
  readonly sendLabel = $localize`:@@messages.compose.send:Send`;

  state = signal<'loading' | 'error' | 'ready'>('loading');
  thread = signal<Thread | null>(null);
  announcements = signal<MyAnnouncement[]>([]);
  /** Captured ONLY from the first load's `read` flags — a later poll never touches announcements,
   *  so a "New" marker (and the bar's open-by-default state) can't change mid-visit while the
   *  athlete is still reading it. */
  private newAnnouncementIds = signal<ReadonlySet<string>>(new Set());
  draft = signal('');
  sending = signal(false);
  sendError = signal('');

  isFullEmpty = computed(() =>
    this.announcements().length === 0 && (this.thread()?.messages.length ?? 0) === 0);
  isThreadEmpty = computed(() => (this.thread()?.messages.length ?? 0) === 0);
  newCount = computed(() => this.newAnnouncementIds().size);
  totalCount = computed(() => this.announcements().length);
  hasNew = computed(() => this.newCount() > 0);

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  ngOnInit() {
    this.load();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  isNew(id: string): boolean {
    return this.newAnnouncementIds().has(id);
  }

  load() {
    this.state.set('loading');
    forkJoin({ thread: this.svc.myThread(), anns: this.svc.myAnnouncements() }).subscribe({
      next: ({ thread, anns }) => {
        this.thread.set(thread);
        this.announcements.set(anns);
        this.newAnnouncementIds.set(new Set(anns.filter(a => !a.read).map(a => a.id)));
        this.state.set('ready');
        this.markRead(thread, anns);
      },
      error: () => this.state.set('error'),
    });
  }

  private markRead(thread: Thread, anns: MyAnnouncement[]) {
    if (MessagingService.unreadIn(thread) > 0) {
      this.svc.markMyThreadRead().subscribe({ next: () => {}, error: () => {} });
    }
    for (const a of anns) {
      if (!a.read) {
        this.svc.markAnnouncementRead(a.id).subscribe({ next: () => {}, error: () => {} });
      }
    }
    // NOT refreshUnread(): its GETs would race the read POSTs just fired and could re-read the
    // pre-read state, settling the badge back to a stale count. This screen renders the whole
    // thread and every announcement, so once they are marked the count is zero by construction.
    // The shell's own 60s poll is the authority and will surface anything that arrives later.
    this.svc.unread.set(0);
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

  /** The 20s poll re-fetches the thread ONLY — never announcements (see newAnnouncementIds). A
   *  poll failure must not flip an already-reading screen into the error state. */
  private poll() {
    this.svc.myThread().subscribe({
      next: t => {
        this.thread.set(t);
        if (MessagingService.unreadIn(t) > 0) {
          this.svc.markMyThreadRead().subscribe({ next: () => this.svc.unread.set(0), error: () => {} });
        }
      },
      error: () => {},
    });
  }

  send(event?: Event) {
    event?.preventDefault();
    const body = this.draft().trim();
    // The real guard — Enter submits regardless of any button's [disabled].
    if (!body || body.length > 4000) {
      this.sendError.set($localize`:@@messages.compose.error.invalid:Write a message (up to 4000 characters).`);
      return;
    }
    this.sendError.set('');
    this.sending.set(true);
    this.svc.sendAsMember(body).subscribe({
      next: m => {
        const t = this.thread();
        this.thread.set(t ? { ...t, messages: [...t.messages, m] } : { id: null, messages: [m], memberLastReadAt: null });
        this.draft.set('');
        this.sending.set(false);
        this.composerInput?.nativeElement.focus();
      },
      error: () => {
        this.sending.set(false);
        this.sendError.set($localize`:@@messages.compose.error.failed:Couldn't send — try again.`);
      },
    });
  }
}

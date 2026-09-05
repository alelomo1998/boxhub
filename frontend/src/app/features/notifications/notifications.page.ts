import {
  Component, ElementRef, Injector, OnDestroy, OnInit, ChangeDetectionStrategy,
  afterNextRender, computed, inject, signal, viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from './notification.service';
import { FeedRow } from './notification.models';
import { NOTIFICATION_COPY, NotificationCopy } from './notification-copy';
import { MessagingService } from '../messaging/messaging.service';
import { MyAnnouncement } from '../messaging/messaging.models';
import { ShellChromeService } from '../../core/shell-chrome.service';
import { ButtonComponent } from '../../ui/button.component';
import { IconComponent } from '../../ui/icon.component';
import { EmptyComponent } from '../../ui/empty.component';
import { AlertComponent } from '../../ui/alert.component';
import { SheetComponent } from '../../ui/sheet.component';

/** One calendar-day cluster of rows, in the order the feed already arrives (newest first) — never
 *  re-sorted client-side. `kind` picks the label: 'today'/'yesterday' render a fixed string,
 *  'date' goes through DatePipe with `sample` (never hand-formatted). */
interface DayGroup {
  key: string;
  kind: 'today' | 'yesterday' | 'date';
  sample: string;
  rows: FeedRow[];
}

/**
 * `/{athlete,coach,admin}/notifications` — the in-app feed (M29b). Day-grouped, per-type icon +
 * mono eyebrow, unread carried by a --bone dot AND a heavier title (never colour alone).
 *
 * Locks the shell viewport for as long as it's mounted (ShellChromeService.viewportLocked, the
 * same mechanism ConversationsPage uses): the day header is sticky within `.scroll`, and sticky
 * positioning is relative to the nearest scrolling ancestor. Left to the window, it would fight
 * bh-shell-header's own `position: sticky; top:0`. Locking the shell gives this component a real
 * bounded height so `.scroll` becomes that ancestor instead.
 */
@Component({
  selector: 'bh-notifications',
  standalone: true,
  imports: [DatePipe, ButtonComponent, IconComponent, EmptyComponent, SheetComponent, AlertComponent],
  template: `
    <div class="nf" data-testid="notifications-page">
      <header class="page-header">
        <h1 class="title" tabindex="-1" #heading>{{ pageTitleLabel }}</h1>
        <bh-button variant="ghost" size="sm" [disabled]="notifications.unread() === 0"
                   [loading]="markAllPending()" (click)="onMarkAllRead()" testId="notifications-mark-all">
          <span i18n="@@notifications.markAllRead">Mark all read</span>
        </bh-button>
      </header>

      <!-- Mounted and unmounted with @if, never kept mounted with its text flipped: role="alert"
           only announces when the element carrying it is freshly inserted. -->
      @if (actionError(); as msg) {
        <bh-alert tone="danger" class="row-error">{{ msg }}</bh-alert>
      }

      <p class="sr-only" aria-live="polite" role="status">{{ liveStatus() }}</p>

      <div class="scroll">
        <!-- Deliberately NOT aria-live. A live region wrapping the rows themselves announces all
             30 of them on load and 11 more on every "Load older" — the loud twin of the silent
             failure this screen already fixed. The count below is what gets announced instead. -->
        <div class="results">
          @switch (state()) {
            @case ('loading') { <p class="stateline" i18n="@@notifications.loading">Loading…</p> }
            @case ('error') {
              <p class="stateline err">
                <span i18n="@@notifications.error">Couldn't load your notifications.</span>
                <button type="button" class="retry" (click)="load()" i18n="@@notifications.retry">Try again</button>
              </p>
            }
            @default {
              @if (rows().length === 0) {
                <bh-empty data-testid="notifications-empty" icon="bell" [title]="emptyTitle" />
              } @else {
                @for (g of grouped(); track g.key) {
                  <section class="day-group">
                    <div class="day-header">
                      @switch (g.kind) {
                        @case ('today') { <span>{{ todayLabel }}</span> }
                        @case ('yesterday') { <span>{{ yesterdayLabel }}</span> }
                        @default { <span>{{ g.sample | date:'d MMMM y' }}</span> }
                      }
                    </div>
                    @for (row of g.rows; track row.id) {
                      <button type="button" class="row" [class.unread]="!row.read"
                              [attr.data-testid]="'notification-row-' + row.id"
                              (click)="onRowTap(row)">
                        <!-- The dot and the heavier title are both purely visual, so on their own
                             they leave a screen reader unable to tell a new notification from a
                             seen one — on a screen whose whole job is that distinction. -->
                        @if (!row.read) {
                          <span class="sr-only" i18n="@@notifications.row.unread">Unread</span>
                        }
                        <span class="r-top">
                          <span class="r-lead">
                            <bh-icon [name]="copyFor(row).icon" [size]="15" />
                            <span class="r-eyebrow">{{ copyFor(row).eyebrow }}</span>
                          </span>
                          <span class="r-meta">
                            @if (!row.read) {
                              <span class="r-dot" aria-hidden="true" [attr.data-testid]="'notification-unread-' + row.id"></span>
                            }
                            <span class="r-time">{{ row.createdAt | date:'HH:mm' }}</span>
                          </span>
                        </span>
                        <span class="r-title">{{ copyFor(row).title(row.params) }}</span>
                        @if (copyFor(row).body(row.params); as b) { <span class="r-body">{{ b }}</span> }
                      </button>
                    }
                  </section>
                }
                @if (nextCursor()) {
                  <bh-button class="load-more" variant="ghost" [loading]="loadingMore()"
                             (click)="loadMore()" testId="notifications-load-more">
                    <span i18n="@@notifications.loadOlder">Load older</span>
                  </bh-button>
                }
              }
            }
          }
        </div>
      </div>
    </div>

    <bh-sheet [open]="annSheetOpen()" [title]="annSheetTitle()" [label]="annSheetTitle()"
              data-testid="notification-detail-sheet" (closed)="onAnnSheetClosed()">
      @switch (annState()) {
        @case ('loading') { <p class="stateline" i18n="@@notifications.detail.loading">Loading…</p> }
        @case ('error') {
          <p class="stateline err">
            <span i18n="@@notifications.detail.error">Couldn't load the full announcement.</span>
            <button type="button" class="retry" (click)="retryAnnouncements()" i18n="@@notifications.detail.retry">Try again</button>
          </p>
        }
        @default { <p class="ann-body">{{ selectedAnnouncement()?.body ?? annBodyPreview() }}</p> }
      }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host {
      display: block; height: 100%; min-height: 0;
      --z-day-header: 1;
    }
    .nf { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }

    /* Chrome above the scroller, not inside it — sized to its own content, no offset to measure.
       One row: the heading and the only action sit on the same line, which keeps this band short
       on a phone where the shell header is already above it. */
    .page-header { box-sizing: border-box; display: flex; align-items: center;
      justify-content: space-between; gap: var(--sp-3);
      background: var(--ground); border-bottom: 1px solid var(--hairline);
      padding: var(--sp-3) var(--sp-4); }
    /* Sized to share its line with the action at 320px rather than to shout — you arrive here by
       tapping the bell, so the heading confirms where you are instead of announcing it. */
    .title { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--bone); min-width: 0; }
    .title:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .row-error { display: block; margin: var(--sp-3) var(--sp-4) 0; }
    .results { padding: 0 var(--sp-4) var(--sp-4); }
    .stateline { color: var(--bone-dim); padding-top: var(--sp-4); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    /* No positioning, overflow or transform of its own — being a plain block-level parent is what
       gives each day's header its own containing block, so it releases at THIS section's bottom
       instead of every header in the list sharing .results as one containing block and piling up
       at the same offset. Any overflow value other than visible, or a transform/filter/contain,
       would create a new containing block here and break the day header's sticky positioning. */
    .day-group { display: block; }

    /* Centred between two rules, the same divider shape the login screen already uses, so a day
       reads as a break BETWEEN groups rather than as one more line of text inside one. The rules
       replace the old bottom border: two horizontals stacked a few pixels apart just looked like
       a mistake. Opaque --ground because rows scroll underneath it while it is pinned. */
    .day-header { position: sticky; top: 0; z-index: var(--z-day-header); background: var(--ground);
      padding: var(--sp-4) 0 var(--sp-2); display: flex; align-items: center; gap: var(--sp-3); }
    .day-header::before, .day-header::after { content: ''; flex: 1; height: 1px; background: var(--hairline); }
    .day-header span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }

    /* No uniform gap. An even three-line stack reads as one grey block, which is what made the
       title and its body blend: the eyebrow LABELS the title, so those two sit tight together,
       and the body is subordinate detail, so it gets three times the space above it. The rhythm
       is what groups them, not colour — the unread weight step has to stay free to do its own job. */
    .row { display: flex; flex-direction: column; gap: 0; width: 100%; min-width: 0; min-height: var(--tap);
      padding: var(--sp-3) 0; border: none; border-bottom: 1px solid var(--hairline); background: transparent;
      text-align: left; font: inherit; color: inherit; cursor: pointer; }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .row:hover { background: var(--surface); }

    .r-top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); min-width: 0; }
    .r-lead { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; flex: 1; color: var(--faint); }
    .r-eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; min-width: 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .r-meta { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
    /* --bone, not --volt — colour is never the only unread signal; the title's weight below
       carries it too. */
    .r-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bone); flex-shrink: 0; }
    .r-time { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* Tight line-height so a title that wraps to two lines still reads as ONE title. The seeded
       88-character class name is exactly that case. */
    .r-title { margin-top: var(--sp-1); font-family: var(--font-body); font-size: var(--fs-body);
      font-weight: 500; line-height: 1.25; color: var(--bone); overflow-wrap: anywhere; }
    .row.unread .r-title { font-weight: 700; }
    .r-body { margin-top: var(--sp-3); font-family: var(--font-body); font-size: var(--fs-sm);
      line-height: 1.45; color: var(--bone-dim); overflow-wrap: anywhere; }

    .load-more { margin-top: var(--sp-4); align-self: center; }

    .ann-body { margin: 0; font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone);
      overflow-wrap: anywhere; }
  `],
})
export class NotificationsPage implements OnInit, OnDestroy {
  protected notifications = inject(NotificationService);
  private messaging = inject(MessagingService);
  private router = inject(Router);
  private chrome = inject(ShellChromeService);
  private injector = inject(Injector);

  private heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected rows = signal<FeedRow[]>([]);
  protected nextCursor = signal<string | null>(null);
  protected state = signal<'loading' | 'error' | 'ready'>('loading');
  protected loadingMore = signal(false);
  protected markAllPending = signal(false);
  /** Whichever background action last failed. Null unmounts the banner, so the next
   *  failure re-MOUNTS it — role="alert" only announces on insertion, never on a text swap. */
  protected actionError = signal<string | null>(null);
  /** Announced instead of the rows themselves. Placeholder names follow their expression
   *  immediately — written at the end they ship as literal text past the build. */
  protected liveStatus = signal('');
  // A type the server knows and this build does not must not put a raw enum on screen.
  private readonly unknownEyebrow = $localize`:@@notifications.unknown.eyebrow:Update`;
  private readonly unknownTitle = $localize`:@@notifications.unknown.title:Your gym sent an update`;

  protected annSheetOpen = signal(false);
  protected annRow = signal<FeedRow | null>(null);
  protected annState = signal<'idle' | 'loading' | 'error' | 'ready'>('idle');
  protected myAnnouncements = signal<MyAnnouncement[] | null>(null);

  protected readonly pageTitleLabel = $localize`:@@notifications.page.title:Notifications`;
  protected readonly emptyTitle = $localize`:@@notifications.empty.title:Nothing yet`;
  private readonly markReadFailedMsg = $localize`:@@notifications.markRead.failed:Couldn't mark that as read. It'll still be here next time.`;
  private readonly loadOlderFailedMsg = $localize`:@@notifications.loadOlder.failed:Couldn't load older notifications.`;
  private readonly markAllFailedMsg = $localize`:@@notifications.markAll.failed:Couldn't mark everything as read.`;
  protected readonly todayLabel = $localize`:@@notifications.today:Today`;
  protected readonly yesterdayLabel = $localize`:@@notifications.yesterday:Yesterday`;

  protected grouped = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const row of this.rows()) {
      const kind = this.dayKind(row.createdAt);
      const key = kind === 'date' ? this.dayKey(row.createdAt) : kind;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else groups.push({ key, kind, sample: row.createdAt, rows: [row] });
    }
    return groups;
  });

  protected selectedAnnouncement = computed(() => {
    const row = this.annRow();
    const list = this.myAnnouncements();
    if (!row || !list) return null;
    return list.find(a => a.id === row.params['announcementId']) ?? null;
  });

  protected annBodyPreview = computed(() => String(this.annRow()?.params['bodyPreview'] ?? ''));

  protected annSheetTitle = computed(() => {
    const row = this.annRow();
    return row ? this.copyFor(row).eyebrow : '';
  });

  ngOnInit(): void {
    this.chrome.viewportLocked.set(true);
    this.load();
  }

  ngOnDestroy(): void {
    this.chrome.viewportLocked.set(false);
  }

  /** A type the server can emit that isn't (yet) in NOTIFICATION_COPY must not crash the feed —
   *  a blank row is invisible in every other test, but a thrown error takes the whole page down.
   *  The fallback closes over the row's own `type` rather than reading it out of `params` (it
   *  isn't in there), so it must be built per row, not shared as one static object. */
  protected copyFor(row: FeedRow): NotificationCopy {
    return NOTIFICATION_COPY[row.type]
      ?? { icon: 'bell', eyebrow: this.unknownEyebrow, title: () => this.unknownTitle, body: () => null };
  }

  load(): void {
    this.state.set('loading');
    this.notifications.list().subscribe({
      next: page => {
        this.rows.set(page.rows);
        this.nextCursor.set(page.nextCursor);
        this.state.set('ready');
        this.liveStatus.set(page.rows.length === 0
          ? $localize`:@@notifications.live.none:No notifications`
          : $localize`:@@notifications.live.count:${page.rows.length}:count: notifications`);
      },
      error: () => this.state.set('error'),
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.actionError.set(null);
    this.notifications.list(cursor).subscribe({
      next: page => {
        this.rows.update(rs => [...rs, ...page.rows]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
        this.liveStatus.set($localize`:@@notifications.live.more:${page.rows.length}:count: more notifications loaded`);
      },
      // Not silent: the spinner simply stopping is indistinguishable from an empty page.
      error: () => { this.loadingMore.set(false); this.actionError.set(this.loadOlderFailedMsg); },
    });
  }

  protected onRowTap(row: FeedRow): void {
    if (!row.read) {
      this.rows.update(rs => rs.map(r => r.id === row.id ? { ...r, read: true } : r));
      this.actionError.set(null);
      this.notifications.markRead(row.id).subscribe({
        // The optimistic flip must not stand on a failed request — revert it. The bell's own
        // unread count is authoritative, so refresh it too, keeping row and badge in agreement.
        // Reverting silently is not enough: the row simply reappearing as unread later reads as
        // a bug rather than as a failure, so say so.
        error: () => {
          this.rows.update(rs => rs.map(r => r.id === row.id ? { ...r, read: false } : r));
          this.notifications.refreshUnread();
          this.actionError.set(this.markReadFailedMsg);
        },
      });
    }
    if (row.link !== null) {
      this.router.navigateByUrl(row.link);
    } else {
      this.openAnnouncementSheet(row);
    }
  }

  private openAnnouncementSheet(row: FeedRow): void {
    this.annRow.set(row);
    this.annSheetOpen.set(true);
    if (this.myAnnouncements() === null) this.fetchAnnouncements();
  }

  protected retryAnnouncements(): void {
    this.fetchAnnouncements();
  }

  private fetchAnnouncements(): void {
    this.annState.set('loading');
    this.messaging.myAnnouncements().subscribe({
      next: rows => { this.myAnnouncements.set(rows); this.annState.set('ready'); },
      error: () => this.annState.set('error'),
    });
  }

  protected onAnnSheetClosed(): void {
    this.annSheetOpen.set(false);
    this.annRow.set(null);
  }

  /** Guarded here too, not just via [disabled] — a disabled button guards one path, never the
   *  action (binding). */
  protected onMarkAllRead(): void {
    if (this.notifications.unread() === 0) return;
    this.markAllPending.set(true);
    this.actionError.set(null);
    this.notifications.markAllRead().subscribe({
      // The server call already marked everything read — flip the rows already in memory rather
      // than refetching, which would discard every page the "Load older" button had already
      // fetched and flash the loading state back to page 1.
      next: () => {
        this.markAllPending.set(false);
        this.rows.update(rs => rs.map(r => r.read ? r : { ...r, read: true }));
        this.focusHeading();
      },
      // Not silent: rows staying unread with no word reads as the button doing nothing.
      error: () => { this.markAllPending.set(false); this.actionError.set(this.markAllFailedMsg); },
    });
  }

  /** The mark-all button goes natively `disabled` once unread hits 0 — that drops it out of the
   *  a11y tree and sends focus to <body>. Move it onto the heading instead. */
  private focusHeading(): void {
    afterNextRender(() => {
      this.heading()?.nativeElement.focus();
    }, { injector: this.injector });
  }

  private dayKind(iso: string): 'today' | 'yesterday' | 'date' {
    const d = new Date(iso);
    const now = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return 'date';
  }

  private dayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
}

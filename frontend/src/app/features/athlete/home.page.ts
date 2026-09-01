import { Component, Injector, OnInit, ChangeDetectionStrategy, afterNextRender, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AvatarComponent } from '../../ui/avatar.component';
import { SheetComponent } from '../../ui/sheet.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { HomeService, Home } from './home.service';
import { ProgrammingService, MyClass } from '../programming/programming.service';
import { BookingService } from '../booking/booking.service';
import { MessagingService } from '../messaging/messaging.service';
import { MyAnnouncement } from '../messaging/messaging.models';

/** Athlete home: announcement, next booking, today's class teaser, mini stats. */
@Component({
  selector: 'bh-home',
  standalone: true,
  imports: [DatePipe, RouterLink, AvatarComponent, SheetComponent, EmptyComponent, IconComponent],
  template: `
    <section class="home" data-testid="home-root">
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load your home.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (home(); as h) {
            @if (h.planExpiringSoon && h.stats.planDaysLeft !== null) {
              <div class="warn" role="status">
                Your plan expires in {{ h.stats.planDaysLeft }} {{ h.stats.planDaysLeft === 1 ? 'day' : 'days' }} — talk to your box.
              </div>
            }

            @if (h.announcement; as a) {
              <button type="button" class="card ann" data-testid="home-announcements-card"
                      (click)="openAnnouncementsSheet()">
                <span class="ann-top">
                  <span class="k" i18n="@@home.announcements.label">Announcements</span>
                  @if (cardUnreadCount() > 0) {
                    <span class="ann-badge" data-testid="home-announcements-unread"
                          [attr.aria-label]="unreadBadgeAriaLabel()">{{ cardUnreadCount() }}</span>
                  }
                </span>
                <span class="ann-sender-line">{{ senderLabel(a.sentByName) }}</span>
                <p class="ann-body">{{ a.body }}</p>
              </button>
            }

            @if (h.nextBooking; as b) {
              <a class="card next" routerLink="/athlete/book" [attr.data-testid]="'next-booking'">
                @if (b.imagePath) { <img class="next-img" [src]="b.imagePath" alt="" /> }
                <div class="next-body">
                  <span class="k">Your next class</span>
                  <div class="next-line">
                    <span class="next-time num">{{ b.startAt | date:'HH:mm' }}</span>
                    <span class="next-name">{{ b.className }}</span>
                  </div>
                  <div class="next-sub">
                    <span class="next-date">{{ b.startAt | date:'EEEE d MMM' }}</span>
                    <span class="next-state">{{ b.status === 'WAITLIST' ? 'Waitlist #' + b.waitlistPosition : 'Booked' }}
                      · {{ b.bookedCount }}/{{ b.capacity }}</span>
                  </div>
                  @if (b.participants.length) {
                    <div class="pals">
                      @for (p of b.participants; track p.name) {
                        <bh-avatar [path]="p.avatarPath" [name]="p.name" size="sm" />
                      }
                    </div>
                  }
                </div>
              </a>
            } @else {
              <a class="card empty-cta" routerLink="/athlete/book">
                <span class="k">No upcoming class</span>
                <span class="cta-line">Book your next session →</span>
              </a>
            }

            @if (todayClass(); as tc) {
              @if (tc.session && tc.items.length) {
                <a class="card teaser" routerLink="/athlete/wod">
                  <span class="k">Today at {{ tc.session.startAt | date:'HH:mm' }} — {{ tc.session.name }}</span>
                  <div class="pieces">
                    @for (i of tc.items; track i.id) {
                      <span class="piece" [class.scored]="i.scoreable">
                        {{ i.wod.title }}@if (i.myScoreLogged) { <span class="done">✓</span> }
                      </span>
                    }
                  </div>
                </a>
              }
            }

            <div class="stats">
              <div class="stat">
                <span class="s-val num">{{ h.stats.checkinsThisWeek }}</span>
                <span class="s-lab">classes this week</span>
              </div>
              <div class="stat">
                <span class="s-val num">{{ h.stats.streakWeeks }}</span>
                <span class="s-lab">week streak</span>
              </div>
              @if (h.stats.lastPr; as pr) {
                <div class="stat">
                  <span class="s-val num">{{ pr.load }}</span>
                  <span class="s-lab">last PR · {{ pr.movementName }}</span>
                </div>
              }
              @if (h.stats.planDaysLeft !== null && !h.planExpiringSoon) {
                <div class="stat">
                  <span class="s-val num">{{ h.stats.planDaysLeft }}</span>
                  <span class="s-lab">plan days left</span>
                </div>
              }
            </div>
          }
        }
      }

      <bh-sheet [open]="annSheetOpen()" title="Announcements" i18n-title="@@home.announcements.sheet.title"
                label="Announcements" i18n-label="@@home.announcements.sheet.title"
                data-testid="announcements-sheet" (closed)="onAnnSheetClosed()">
        @if (annView() === 'detail') {
          @if (annSelected(); as sel) {
            <div class="ann-detail">
              <button type="button" class="ann-back" data-testid="announcement-detail-back"
                      (click)="backToList()" [attr.aria-label]="annBackLabel">
                <bh-icon name="chevron-left" [size]="18" />
                <span i18n="@@home.announcements.back">Back</span>
              </button>
              <div class="ann-detail-head">
                <span class="ann-detail-sender">{{ senderLabel(sel.sentByName) }}</span>
                <span class="ann-detail-when">{{ sel.sentAt | date:'medium' }}</span>
              </div>
              <p class="ann-detail-body">{{ sel.body }}</p>
            </div>
          }
        } @else {
          @switch (annListState()) {
            @case ('loading') {
              <p class="stateline" i18n="@@home.announcements.loading">Loading…</p>
            }
            @case ('error') {
              <p class="stateline err">
                <span i18n="@@home.announcements.error">Couldn't load your announcements.</span>
                <button class="retry" type="button" (click)="loadAnnouncementsList()" i18n="@@home.announcements.retry">Try again</button>
              </p>
            }
            @default {
              @if (annList().length === 0) {
                <bh-empty data-testid="announcements-empty" icon="mail" [title]="annEmptyTitle" />
              } @else {
                <div class="ann-list-body">
                  <div class="ann-rows">
                    @for (a of annList(); track a.id) {
                      <button type="button" class="ann-row" [attr.data-testid]="'announcement-row-' + a.id"
                              (click)="openDetail(a)">
                        <span class="ann-row-top">
                          <span class="ann-row-sender" [class.unread]="!a.read">{{ senderLabel(a.sentByName) }}</span>
                          <span class="ann-row-when">{{ a.sentAt | date:'d MMM y' }}</span>
                        </span>
                        <span class="ann-row-preview">{{ a.body }}</span>
                        @if (!a.read) {
                          <span class="ann-unread-chip" [attr.data-testid]="'announcement-unread-' + a.id"
                                i18n="@@home.announcements.unreadChip">Unread</span>
                        }
                      </button>
                    }
                  </div>
                </div>
              }
            }
          }
        }
      </bh-sheet>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .home { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-4); }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }

    .warn { border: 1px solid var(--warn); border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4);
      color: var(--warn); font-size: var(--fs-sm); }

    .card { display: block; border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); padding: var(--sp-4); color: var(--bone); text-decoration: none; }
    .card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }

    /* The announcement card is now a button, not a static div — it opens the sheet below. Reset
       the default button chrome and give it its own min-height/focus ring, per the interactive
       cards on this screen. */
    .card.ann { cursor: pointer; text-align: left; width: 100%; font: inherit; color: inherit;
      min-height: var(--tap); min-width: 0; }
    .card.ann:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .ann-top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); min-width: 0; }
    .ann-badge { flex-shrink: 0; min-width: 18px; height: 18px; padding: 0 5px; display: inline-flex;
      align-items: center; justify-content: center; border-radius: var(--r-full); background: var(--surface-2);
      border: 1px solid var(--hairline); color: var(--bone); font-family: var(--font-mono);
      font-weight: 700; font-size: var(--fs-meta); font-variant-numeric: tabular-nums; line-height: 1; }
    .ann-sender-line { display: block; margin-top: 4px; min-width: 0; font-family: var(--font-body);
      font-weight: 700; font-size: var(--fs-sm); color: var(--bone);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ann-body { margin: var(--sp-2) 0 0; font-size: var(--fs-body); color: var(--bone); }

    .next { display: flex; gap: var(--sp-4); padding: 0; overflow: hidden; }
    .next-img { width: 108px; object-fit: cover; flex-shrink: 0; }
    .next-body { padding: var(--sp-4); min-width: 0; flex: 1; }
    .next-line { display: flex; align-items: baseline; gap: var(--sp-3); margin-top: 4px; }
    .next-time { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .next-name { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .next-sub { display: flex; gap: var(--sp-3); font-size: var(--fs-sm); color: var(--bone-dim); margin-top: 2px; }
    .pals { display: flex; gap: 4px; margin-top: var(--sp-3); }

    /* --bone, not --volt. The box switcher put a permanent volt mark in the shell header, so this
       screen carried two accents — and athlete home is not on the design law's hero list (WOD
       board, leaderboard, PR page, live runner, TV), which caps plumbing at one. The switcher's
       mark keeps the slot because it answers "which gym are you in now"; this stays primary by
       size, weight and case instead of colour. */
    .empty-cta .cta-line { display: block; margin-top: var(--sp-2); font-family: var(--font-display);
      font-weight: 700; font-size: var(--fs-h2); text-transform: uppercase; color: var(--bone); }

    .teaser .pieces { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
    .piece { border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 5px 12px;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .piece.scored { color: var(--bone); font-weight: 600; }
    .done { color: var(--good); margin-left: 5px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--sp-3); }
    .stat { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-3) var(--sp-4); display: flex; flex-direction: column; gap: 2px; }
    .s-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      font-variant-numeric: tabular-nums; }
    .s-lab { font-size: var(--fs-sm); color: var(--faint); }

    /* --- announcements sheet: list view --- */
    /* Fixed height, same reasoning as the staff announcements screen's class picker: the list's
       length varies per athlete and per box, and a content-sized box would grow and shrink the
       whole sheet as rows load — the height must not depend on what is inside it. */
    .ann-list-body { height: 55vh; max-height: 460px; overflow-y: auto; overscroll-behavior: contain; }
    .ann-rows { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
    .ann-row { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0;
      padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); cursor: pointer; text-align: left; font: inherit; color: inherit; }
    .ann-row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .ann-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); min-width: 0; }
    .ann-row-sender { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ann-row-sender.unread { font-weight: 700; }
    .ann-row-when { flex-shrink: 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--bone-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
    /* Two-line clamp: the row previews the body, the full text only shows in the detail view. */
    .ann-row-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; margin: 0; font-family: var(--font-body); font-size: var(--fs-sm);
      color: var(--bone-dim); overflow-wrap: anywhere; }
    /* --bone and weight, never a hue alone — the unread signal here is the word itself plus the
       bold sender name above, not a colour swap. */
    .ann-unread-chip { align-self: flex-start; font-family: var(--font-mono); font-size: var(--fs-meta);
      font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--bone);
      padding: 2px 8px; border: 1px solid var(--hairline); border-radius: var(--r-full); }

    /* --- announcements sheet: detail view --- */
    .ann-detail { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
    .ann-back { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--sp-2);
      min-height: var(--tap); padding: 0 var(--sp-2); margin: calc(var(--sp-2) * -1) 0 0 calc(var(--sp-2) * -1);
      background: transparent; border: none; color: var(--bone); cursor: pointer;
      font-family: var(--font-body); font-weight: 700; font-size: var(--fs-body); }
    .ann-back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .ann-detail-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); min-width: 0; }
    .ann-detail-sender { flex: 1; min-width: 0; font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-body); color: var(--bone); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ann-detail-when { flex-shrink: 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--bone-dim); font-variant-numeric: tabular-nums; }
    .ann-detail-body { margin: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); overflow-wrap: anywhere; }
  `],
})
export class HomePage implements OnInit {
  private homeSvc = inject(HomeService);
  private prog = inject(ProgrammingService);
  private booking = inject(BookingService);
  private messaging = inject(MessagingService);
  private injector = inject(Injector);

  home = signal<Home | null>(null);
  todayClass = signal<MyClass | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  /** The card's own badge. Seeded from the home aggregate's `announcementUnread` on load — home
   *  is one request, so the badge is visible on page open without a second fetch. Once the sheet's
   *  list is fetched and marked read, this is updated locally from that list; it is never
   *  refreshed by re-requesting home. */
  protected cardUnreadCount = signal(0);

  protected annSheetOpen = signal(false);
  protected annView = signal<'list' | 'detail'>('list');
  protected annList = signal<MyAnnouncement[]>([]);
  protected annListState = signal<'idle' | 'loading' | 'error' | 'ready'>('idle');
  protected annSelected = signal<MyAnnouncement | null>(null);

  protected readonly anonymousSender = $localize`:@@home.announcements.anonymousSender:Your gym`;
  protected readonly annEmptyTitle = $localize`:@@home.announcements.empty:Nothing from your gym yet`;
  protected readonly annBackLabel = $localize`:@@home.announcements.back.aria:Back to announcements`;

  ngOnInit() {
    this.load();
  }

  load() {
    this.state.set('loading');
    this.homeSvc.home().subscribe({
      next: h => {
        this.home.set(h);
        this.state.set('ready');
        this.cardUnreadCount.set(h.announcementUnread);
      },
      error: () => this.state.set('error'),
    });
    this.prog.myClassToday().subscribe({ next: tc => this.todayClass.set(tc), error: () => {} });
  }

  /** "<name>", or the neutral fallback for a system/seed send (`sentByName` null) — never the
   *  literal string "null", never blank. */
  protected senderLabel(name: string | null): string {
    return name ?? this.anonymousSender;
  }

  protected unreadBadgeAriaLabel(): string {
    const n = this.cardUnreadCount();
    if (n === 1) return $localize`:@@home.announcements.badge.aria.one:1 unread announcement`;
    return $localize`:@@home.announcements.badge.aria.many:${n}:count: unread announcements`;
  }

  /** Fetches the athlete's own announcements. Only ever called while the sheet is open (on open,
   *  and again from the error state's retry) — home carries the badge count, so this request is no
   *  longer needed on page load. The mark-read pass still checks annSheetOpen() so a response that
   *  lands after the athlete has already closed the sheet never marks anything read unseen. */
  protected loadAnnouncementsList(): void {
    this.annListState.set('loading');
    this.messaging.myAnnouncements().subscribe({
      next: rows => {
        this.annList.set(rows);
        this.annListState.set('ready');
        if (this.annSheetOpen()) this.markUnreadAsRead(rows);
      },
      error: () => this.annListState.set('error'),
    });
  }

  protected openAnnouncementsSheet(): void {
    this.annSheetOpen.set(true);
    this.annView.set('list');
    this.loadAnnouncementsList();
  }

  /** Opening the list marks all of it read (the user's ruling): announcements are short enough
   *  that seeing the row is reading it. Only the currently-unread ids get a request — never a
   *  bulk endpoint, per the milestone's authz-sweep rule; a failed mark-read is swallowed so the
   *  athlete still gets to read their announcements. */
  private markUnreadAsRead(rows: MyAnnouncement[]): void {
    const unreadIds = rows.filter(r => !r.read).map(r => r.id);
    if (unreadIds.length === 0) return;
    forkJoin(unreadIds.map(id => this.messaging.markAnnouncementRead(id))).subscribe({
      next: () => {
        const idSet = new Set(unreadIds);
        this.annList.update(list => list.map(a => idSet.has(a.id) ? { ...a, read: true } : a));
        this.cardUnreadCount.set(this.annList().filter(a => !a.read).length);
      },
      error: () => {}, // fail quietly — the list still renders, marks just stay as they were
    });
  }

  protected openDetail(a: MyAnnouncement): void {
    this.annSelected.set(a);
    this.annView.set('detail');
    afterNextRender(() => {
      document.querySelector<HTMLElement>('[data-testid="announcement-detail-back"]')?.focus();
    }, { injector: this.injector });
  }

  protected backToList(): void {
    const id = this.annSelected()?.id;
    this.annView.set('list');
    this.annSelected.set(null);
    afterNextRender(() => {
      if (id) document.querySelector<HTMLElement>(`[data-testid="announcement-row-${id}"]`)?.focus();
    }, { injector: this.injector });
  }

  protected onAnnSheetClosed(): void {
    this.annSheetOpen.set(false);
    this.annView.set('list');
    this.annSelected.set(null);
  }
}

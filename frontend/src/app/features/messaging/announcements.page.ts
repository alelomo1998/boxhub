import {
  Component, ChangeDetectionStrategy, ElementRef, Injector, LOCALE_ID, OnInit, ViewChild,
  afterNextRender, computed, effect, inject, signal,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { MessagingService } from './messaging.service';
import { AnnouncementRow, AnnouncementTarget, AnnouncementDetail, Segment } from './messaging.models';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { SheetComponent } from '../../ui/sheet.component';
import { AlertComponent } from '../../ui/alert.component';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { DayPagerComponent } from '../../ui/day-pager.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { SearchBarComponent } from '../../ui/search-bar.component';

/**
 * `AnnouncementsPage`: one screen for `/coach/announcements` and `/admin/announcements` (M29a
 * Task 10). Composer on top, history below — the shape is fixed, not a menu of layouts.
 *
 * The segment options offered are a presentation choice only: the server is what actually decides
 * who may announce to what (an admin sees every upcoming session, a coach only the ones they
 * coach), so reading the caller's own role here to choose what to offer cannot widen access —
 * it can only ever narrow what this picker shows below what the server would allow anyway.
 *
 * The "To" control and the class picker are rebuilt mobile-first (2026-08-31 ruling): a native
 * select collapses on iOS to a one-line wheel that cannot show a class's name, time, coach and
 * audience together, so both are real tappable rows/cards instead — see CLAUDE.md's binding
 * MOBILE FIRST section.
 */
@Component({
  selector: 'bh-announcements',
  standalone: true,
  imports: [DatePipe, ButtonComponent, SheetComponent, AlertComponent, EmptyComponent, IconComponent,
    DayPagerComponent, AvatarComponent, SearchBarComponent],
  template: `
    <div class="ann-root" data-testid="announcements-root">
      <header class="head">
        <span class="eyebrow" i18n="@@announcements.eyebrow">Your gym</span>
        <h1 class="title" i18n="@@announcements.title">Announcements</h1>
      </header>

      <form class="composer" data-testid="announcement-composer" (submit)="submit($event)" novalidate>
        @if (isAdmin()) {
          <fieldset class="segfield">
            <legend class="clabel" i18n="@@announcements.to.label">To</legend>
            <div class="seg-rows">
              <label class="seg-row" [class.sel]="segment() === 'EVERYONE'" data-testid="announcement-segment-everyone">
                <input class="vh" type="radio" name="announcementSegment" value="EVERYONE"
                       [checked]="segment() === 'EVERYONE'" (change)="segment.set('EVERYONE')" />
                <span class="seg-text">
                  <span class="seg-title" i18n="@@announcements.segment.everyone">Everyone in the box</span>
                  <span class="seg-sub" i18n="@@announcements.segment.everyone.sub">every active member</span>
                </span>
                @if (segment() === 'EVERYONE') { <bh-icon name="check" [size]="18" class="seg-check" /> }
              </label>
              <label class="seg-row" [class.sel]="segment() === 'CLASS_ROSTER'" data-testid="announcement-segment-class">
                <input class="vh" type="radio" name="announcementSegment" value="CLASS_ROSTER"
                       [checked]="segment() === 'CLASS_ROSTER'" (change)="segment.set('CLASS_ROSTER')" />
                <span class="seg-text">
                  <span class="seg-title" i18n="@@announcements.segment.classRoster">A class</span>
                  <span class="seg-sub" i18n="@@announcements.segment.classRoster.sub">everyone booked, waitlist included</span>
                </span>
                @if (segment() === 'CLASS_ROSTER') { <bh-icon name="check" [size]="18" class="seg-check" /> }
              </label>
              <label class="seg-row" [class.sel]="segment() === 'EXPIRING'" data-testid="announcement-segment-expiring">
                <input class="vh" type="radio" name="announcementSegment" value="EXPIRING"
                       [checked]="segment() === 'EXPIRING'" (change)="segment.set('EXPIRING')" />
                <span class="seg-text">
                  <span class="seg-title" i18n="@@announcements.segment.expiring">Members expiring soon</span>
                  <span class="seg-sub" i18n="@@announcements.segment.expiring.sub">lapsing within 14 days</span>
                </span>
                @if (segment() === 'EXPIRING') { <bh-icon name="check" [size]="18" class="seg-check" /> }
              </label>
            </div>
          </fieldset>
        } @else {
          <p class="seg-note" i18n="@@announcements.segment.coachNote">This goes to the class you choose below.</p>
        }

        @if (segment() === 'CLASS_ROSTER') {
          <button type="button" class="picker-trigger" data-testid="announcement-session-picker"
                  (click)="pickerDayOffset.set(0); pickerOpen.set(true)">
            @if (selectedTarget(); as t) {
              <span class="pt-label">{{ t.startAt | date:'EEE d MMM' }} · {{ t.startAt | date:'HH:mm' }} · {{ t.name }}</span>
            } @else {
              <span class="pt-label ph" i18n="@@announcements.class.placeholder">Choose a class</span>
            }
            <bh-icon name="chevron-right" [size]="18" />
          </button>
        }

        <div class="field">
          <label for="announcementBody" class="clabel" i18n="@@announcements.body.label">Message</label>
          <textarea #bodyInput id="announcementBody" data-testid="announcement-body" rows="4" maxlength="2000"
            [value]="body()" (input)="onBodyInput($any($event.target).value)"></textarea>
        </div>

        @if (formError()) {
          <p class="err" role="alert" data-testid="announcement-error">{{ formError() }}</p>
        }

        <bh-button class="full" variant="solid" size="lg" type="submit" [loading]="previewPending()" testId="announcement-send">
          @if (!previewPending()) { <span i18n="@@announcements.send.default">Send</span> }
        </bh-button>
      </form>

      <bh-sheet [open]="pickerOpen()" title="Choose a class" i18n-title="@@announcements.picker.title"
                label="Choose a class" i18n-label="@@announcements.picker.title"
                data-testid="announcement-picker-sheet" (closed)="pickerOpen.set(false)">
        <div class="picker">
          <bh-day-pager [offset]="pickerDayOffset()" (offsetChange)="onPickerDayChange($event)" [max]="13" />
          <div class="picker-body" #pickerBody>
          @switch (targetsState()) {
            @case ('loading') {
              <p class="stateline" i18n="@@announcements.targets.loading">Loading your classes…</p>
            }
            @case ('error') {
              <p class="stateline err">
                <span i18n="@@announcements.targets.error">Couldn't load your classes.</span>
                <button class="retry" type="button" (click)="loadTargets()" i18n="@@announcements.targets.retry">Try again</button>
              </p>
            }
            @default {
              @if (targets().length === 0) {
                <bh-empty data-testid="announcement-targets-empty" icon="calendar" [title]="targetsEmptyTitle" />
              } @else if (dayTargets().length === 0) {
                <p class="stateline" data-testid="announcement-day-empty" i18n="@@announcements.picker.dayEmpty">
                  No classes this day.
                </p>
              } @else {
                <div class="cards">
                  @for (t of dayTargets(); track t.id) {
                    <button type="button" class="tcard" [class.sel]="segmentRef() === t.id"
                            [style.background-image]="t.imagePath ? 'url(' + t.imagePath + ')' : null"
                            [attr.aria-pressed]="segmentRef() === t.id"
                            [attr.data-testid]="'announcement-target-' + t.id"
                            (click)="selectTarget(t)">
                      <span class="tc-body" [class.scrim]="!!t.imagePath">
                        <span class="tc-name">{{ t.name }}</span>
                        @if (t.coachName; as coach) { <span class="tc-coach">{{ byLabel(coach) }}</span> }
                        <span class="tc-meta">
                          <span class="num">{{ t.startAt | date:'HH:mm' }}</span>
                          <span class="num">{{ countsLabel(t) }}</span>
                        </span>
                        <span class="tc-reach num">{{ reachLabel(t.recipientCount) }}</span>
                      </span>
                    </button>
                  }
                </div>
              }
            }
          }
          </div>
        </div>
      </bh-sheet>

      <bh-sheet [open]="confirmOpen()" title="Send announcement?" i18n-title="@@announcements.confirm.title"
                label="Send announcement?" i18n-label="@@announcements.confirm.title" (closed)="confirmOpen.set(false)">
        <div class="confirm">
          <p class="explain" data-testid="announcement-confirm-count">{{ confirmMessage() }}</p>
          <p class="explain">{{ audienceLine() }}</p>
          @if (sendError()) {
            <bh-alert tone="danger" data-testid="announcement-send-error">{{ sendError() }}</bh-alert>
          }
          <div class="confirm-actions">
            <bh-button variant="ghost" (click)="cancelConfirm()" testId="announcement-cancel-send">
              <span i18n="@@announcements.confirm.cancel">Cancel</span>
            </bh-button>
            <bh-button variant="solid" [loading]="sendPending()" (click)="confirmSend()" testId="announcement-confirm-send">
              @if (!sendPending()) { <span i18n="@@announcements.confirm.send">Send</span> }
            </bh-button>
          </div>
        </div>
      </bh-sheet>

      <bh-sheet [open]="detailOpen()" label="Announcement details" i18n-label="@@announcements.detail.ariaLabel"
                data-testid="announcement-detail-sheet" (closed)="onDetailClosed()">
        @switch (detailState()) {
          @case ('loading') {
            <p class="stateline" i18n="@@announcements.detail.loading">Loading…</p>
          }
          @case ('error') {
            <p class="stateline err">
              <span i18n="@@announcements.detail.error">Couldn't load this announcement.</span>
              <button class="retry" type="button" (click)="retryDetail()" i18n="@@announcements.detail.retry">Try again</button>
            </p>
          }
          @default {
            @if (detail(); as d) {
              <div class="detail">
                @if (d.clazz; as c) {
                  <div class="tcard dclass" [style.background-image]="c.imagePath ? 'url(' + c.imagePath + ')' : null">
                    <span class="tc-body" [class.scrim]="!!c.imagePath">
                      <span class="tc-name">{{ c.name }}</span>
                      @if (c.coachName; as coach) { <span class="tc-coach">{{ byLabel(coach) }}</span> }
                      <span class="tc-meta">
                        <span class="num">{{ c.startAt | date:'EEE d MMM' }} · {{ c.startAt | date:'HH:mm' }}</span>
                      </span>
                    </span>
                  </div>
                } @else {
                  <div class="dseg">
                    <span class="dseg-title">{{ segmentLabel(d) }}</span>
                  </div>
                }

                <p class="dbody">{{ d.body }}</p>
                <div class="dmeta">
                  <span class="num">{{ d.sentAt | date:'medium' }}</span>
                  <span class="num">{{ readCountLabel(d) }}</span>
                </div>

                <bh-search-bar [(value)]="detailSearch" [label]="detailSearchLabel" [placeholder]="detailSearchLabel"
                               testId="announcement-recipient-search" />

                <div class="rlist" #detailList>
                  @if (filteredRecipients().length === 0) {
                    <bh-empty data-testid="announcement-recipients-empty" icon="search" [title]="noMatchTitle" />
                  } @else {
                    @for (r of filteredRecipients(); track r.membershipId) {
                      <div class="rrow" [attr.data-testid]="'announcement-recipient-' + r.membershipId">
                        <bh-avatar [path]="r.avatarPath" [name]="r.name" size="sm" />
                        <span class="rname">{{ r.name }}</span>
                        @if (r.readAt) {
                          <span class="rread" data-testid="announcement-recipient-read">
                            <bh-icon name="check" [size]="14" />
                            <span class="num">{{ readTimeLabel(r.readAt) }}</span>
                          </span>
                        } @else {
                          <span class="rread rread-unread num" data-testid="announcement-recipient-unread">—</span>
                        }
                      </div>
                    }
                  }
                </div>
              </div>
            }
          }
        }
      </bh-sheet>

      <section class="history" aria-label="Sent announcements" i18n-aria-label="@@announcements.history.ariaLabel">
        <h2 class="hist-title" i18n="@@announcements.history.heading">Sent</h2>
        @switch (historyState()) {
          @case ('loading') {
            <p class="stateline" i18n="@@announcements.history.loading">Loading your sent announcements…</p>
          }
          @case ('error') {
            <p class="stateline err">
              <span i18n="@@announcements.history.error">Couldn't load your sent announcements.</span>
              <button class="retry" type="button" (click)="loadHistory()" i18n="@@announcements.history.retry">Try again</button>
            </p>
          }
          @default {
            @if (history().length === 0) {
              <bh-empty data-testid="announcements-history-empty" icon="mail" [title]="historyEmptyTitle" [message]="historyEmptyMessage" />
            } @else {
              <div class="rows">
                @for (a of history(); track a.id) {
                  <button type="button" class="row" [attr.data-testid]="'announcement-row-' + a.id"
                          (click)="openDetail(a.id)">
                    <span class="row-content">
                      <span class="row-top">
                        <span class="seg">{{ segmentLabel(a) }}</span>
                        <span class="when">{{ a.sentAt | date:'medium' }}</span>
                      </span>
                      <span class="body">{{ a.body }}</span>
                      <span class="counts">{{ readCountLabel(a) }}</span>
                    </span>
                    <bh-icon name="chevron-right" [size]="18" class="row-chevron" />
                  </button>
                }
              </div>
            }
          }
        }
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .ann-root { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-6); }

    .head { margin-bottom: 0; }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }

    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    /* composer */
    .composer { display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-4);
      border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface); }
    .field { display: flex; flex-direction: column; gap: var(--sp-1); }
    .clabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    textarea { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      padding: var(--sp-3); resize: vertical; }
    textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }

    /* "To" radio rows — iOS-settings pattern: full-width tappable cards, not a native select
       (a wheel picker cannot show a segment's name AND its one-line explanation). Real
       <input type="radio"> gives native grouping/arrow-key nav/a11y for free; visually hidden with
       clip-path, never display:none, so it stays in the a11y tree and keyboard-reachable. */
    fieldset.segfield { border: 0; margin: 0; padding: 0; min-width: 0; display: flex;
      flex-direction: column; gap: var(--sp-2); }
    legend.clabel { padding: 0; margin-bottom: var(--sp-1); }
    .seg-rows { display: flex; flex-direction: column; gap: var(--sp-2); }
    .seg-row { position: relative; display: flex; align-items: center; gap: var(--sp-3);
      min-height: var(--tap); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface-2); cursor: pointer; }
    .seg-row.sel { border-color: var(--bone); }
    .seg-row:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
    .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
      white-space: nowrap; }
    .seg-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .seg-title { font-family: var(--font-body); font-weight: 700; color: var(--bone); }
    .seg-sub { font-size: var(--fs-sm); color: var(--bone-dim); }
    .seg-check { flex-shrink: 0; color: var(--bone); }
    .seg-note { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }

    /* Class picker trigger — opens the bh-sheet below instead of a native select, same reasoning
       as the "To" rows: a wheel picker truncates a class's name/time/coach/audience to one line. */
    .picker-trigger { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      width: 100%; min-height: var(--tap); padding: 0 var(--sp-4); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; text-align: left; }
    .picker-trigger:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .pt-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pt-label.ph { color: var(--bone-dim); }

    /* Sheet contents: day pager + full-bleed image cards (docs/design-ref booking-screen-example),
       never a small thumbnail beside a text column. */
    .picker { display: flex; flex-direction: column; gap: var(--sp-4); }
    /* Fixed height on purpose. The day pager sits directly above this box, and days hold a
       different number of classes, so a content-sized box made the whole sheet grow and shrink
       as you paged. Tapping through days rapidly then slid a card up under the finger that was
       still on the arrow, and you selected a class you never looked at. The height must not
       depend on what is inside it. */
    .picker-body { height: 55vh; max-height: 460px; overflow-y: auto; overscroll-behavior: contain; }
    /* A day with no classes is one short line in a 460px box. Left at the top it reads as a screen
       that failed to load rather than a day that is empty, so centre it in the space it has. */
    .picker-body:has(> .stateline:only-child) { display: grid; place-items: center; text-align: center; }
    .cards { display: flex; flex-direction: column; gap: var(--sp-3); }
    .tcard { position: relative; display: flex; align-items: flex-end; width: 100%; min-height: 160px;
      min-width: 0; border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden;
      background-color: var(--surface-2); background-size: cover; background-position: center;
      padding: 0; cursor: pointer; text-align: left; color: var(--bone); }
    .tcard.sel { border-color: var(--bone); border-width: 2px; }
    .tcard:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .tc-body { width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 2px;
      padding: var(--sp-3) var(--sp-4); }
    /* The scrim, not an invented gradient — a flat overlay under the text so it stays legible on
       any photo. Cards with no image skip it: they are already a plain --surface-2 card.
       --scrim-text, not --scrim: the backdrop weight leaves --bone-dim at 2.57:1 over a bright
       photo, which fails AA. The seeded images are dark enough to hide that. A gym's own are not. */
    .tc-body.scrim { background: var(--scrim-text); }
    .tc-name { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tc-coach { font-size: var(--fs-sm); color: var(--bone-dim); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .tc-meta { display: flex; flex-wrap: wrap; gap: var(--sp-2); font-family: var(--font-mono);
      font-size: var(--fs-meta); color: var(--bone-dim); }
    .tc-reach { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone);
      margin-top: 2px; }
    .num { font-variant-numeric: tabular-nums; }

    /* detail sheet — the class header reuses .tcard/.tc-* above rather than a second visual
       language. .dclass only turns off the picker card's own pointer/press affordances, since
       this one is a static header, not a button. */
    /* Capped to the sheet body's own ceiling so the sheet never gets a second scrollbar. Without
       this the header, body and search pushed the fixed-height list past the sheet, and BOTH the
       sheet and the list scrolled — a drag near the edge moved whichever one the pointer happened
       to be over. The list is the only thing that scrolls now. */
    .detail { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; max-height: 70vh; }
    .tcard.dclass { cursor: default; min-height: 140px; }
    .dseg { padding: var(--sp-4); border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface-2); }
    .dseg-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; color: var(--bone); }
    .dbody { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone);
      margin: 0; overflow-wrap: anywhere; }
    .dmeta { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    /* Same reasoning as .picker-body: an EVERYONE announcement in a full box can be hundreds of
       rows, and a content-sized list would grow under the search box as you typed. It takes the
       space .detail's cap leaves it rather than a fixed 45vh, so a long announcement body shortens
       the list instead of pushing it out of the sheet. min-height:0 is what lets a flex item
       shrink below its content and actually scroll. */
    .rlist { flex: 1 1 auto; min-height: 96px; max-height: 400px; overflow-y: auto;
      overscroll-behavior: contain; display: flex; flex-direction: column; gap: var(--sp-1); }
    .rrow { display: flex; align-items: center; gap: var(--sp-3); min-width: 0;
      padding: var(--sp-2) 0; min-height: var(--tap); }
    .rname { flex: 1; min-width: 0; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rread { flex-shrink: 0; display: inline-flex; align-items: center; gap: var(--sp-1);
      font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--good); }
    .rread-unread { color: var(--bone-dim); }

    /* confirm sheet */
    .confirm { display: flex; flex-direction: column; gap: var(--sp-4); }
    .explain { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }

    /* history */
    .history { display: flex; flex-direction: column; gap: var(--sp-3); }
    .hist-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; margin: 0; }
    .rows { display: flex; flex-direction: column; gap: var(--sp-3); }
    /* A row is now a button that opens the detail sheet — full width, left-aligned text, its own
       focus ring since it is interactive chrome now, not a static card. */
    .row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; min-width: 0;
      padding: var(--sp-4); border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); cursor: pointer; text-align: left; font: inherit; color: inherit; }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .row-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
    .row-chevron { flex-shrink: 0; color: var(--bone-dim); }
    .row-top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
    .seg { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    /* --faint is 4.27:1 on --surface-2 (fails AA) but the row background here is --surface, where
       it measures 5.07:1 — same distinction conversations.page.ts records for its selected row. */
    .when { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .row .body { display: block; font-family: var(--font-body); font-size: var(--fs-body);
      color: var(--bone); margin: 0; overflow-wrap: anywhere; }
    .counts { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      font-variant-numeric: tabular-nums; }
  `],
})
export class AnnouncementsPage implements OnInit {
  private messaging = inject(MessagingService);
  private auth = inject(AuthService);
  private locale = inject(LOCALE_ID);
  private injector = inject(Injector);

  @ViewChild('bodyInput') private bodyInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('pickerBody') private pickerBodyRef?: ElementRef<HTMLElement>;
  @ViewChild('detailList') private detailListRef?: ElementRef<HTMLElement>;

  protected readonly isAdmin = computed(() => this.auth.activeBox()?.role === 'BOX_ADMIN');

  /** Kept as a plain string signal, not `Segment`, so it stays independent of any two-way-bound
   *  form control's own value type — the real narrowing happens where it's read (submit/confirmSend
   *  cast to `Segment`), same reasoning as `segmentRef`. */
  protected segment = signal<string>(this.auth.activeBox()?.role === 'COACH' ? 'CLASS_ROSTER' : 'EVERYONE');
  protected segmentRef = signal('');
  protected body = signal('');

  protected targets = signal<AnnouncementTarget[]>([]);
  protected targetsState = signal<'loading' | 'error' | 'ready'>('loading');

  protected pickerOpen = signal(false);
  protected pickerDayOffset = signal(0);

  protected history = signal<AnnouncementRow[]>([]);
  protected historyState = signal<'loading' | 'error' | 'ready'>('loading');

  protected detailOpen = signal(false);
  protected detailState = signal<'loading' | 'error' | 'ready'>('loading');
  protected detail = signal<AnnouncementDetail | null>(null);
  protected detailSearch = signal('');
  private detailOpenId: string | null = null;

  protected previewPending = signal(false);
  protected sendPending = signal(false);
  protected previewCount = signal<number | null>(null);
  protected confirmOpen = signal(false);
  protected formError = signal<string | null>(null);
  protected sendError = signal<string | null>(null);

  private readonly emptyBodyError = $localize`:@@announcements.error.emptyBody:Write a message before sending.`;
  private readonly noClassError = $localize`:@@announcements.error.noClass:Choose a class first.`;
  private readonly previewFailedError = $localize`:@@announcements.error.previewFailed:Couldn't reach your gym. Try again.`;
  private readonly sendFailedError = $localize`:@@announcements.error.sendFailed:Couldn't send. Try again.`;

  protected readonly historyEmptyTitle = $localize`:@@announcements.history.empty.title:No announcements yet`;
  protected readonly historyEmptyMessage = $localize`:@@announcements.history.empty.message:Announcements you send to your gym show up here.`;
  protected readonly targetsEmptyTitle = $localize`:@@announcements.targets.empty:You have no upcoming classes to announce to.`;

  private readonly audienceEveryone = $localize`:@@announcements.confirm.audience.everyone:everyone in the box`;
  private readonly audienceExpiring = $localize`:@@announcements.confirm.audience.expiring:members expiring soon`;

  private readonly segLabelEveryone = $localize`:@@announcements.row.segment.everyone:Everyone in the box`;
  private readonly segLabelExpiring = $localize`:@@announcements.row.segment.expiring:Members expiring soon`;
  private readonly segLabelClass = $localize`:@@announcements.row.segment.classRoster:A class`;

  protected readonly detailSearchLabel = $localize`:@@announcements.detail.search.label:Find someone`;
  protected readonly noMatchTitle = $localize`:@@announcements.detail.search.empty:No one by that name`;

  /** The target the trigger and confirm sheet name — read once here rather than repeated in the
   *  template, same target list `dayTargets` filters from. */
  protected selectedTarget = computed(() => this.targets().find(t => t.id === this.segmentRef()) ?? null);

  /** Same client-side day filter `classes.page.ts` uses over its `daySessions`: `/targets` already
   *  returns the full 14-day window in one response, so the pager never re-fetches per day. */
  protected dayTargets = computed(() => {
    const d = new Date(); d.setDate(d.getDate() + this.pickerDayOffset());
    const key = d.toDateString();
    return this.targets().filter(t => new Date(t.startAt).toDateString() === key);
  });

  /** Sentence shown in the confirm sheet, built once the preview count resolves. Split one/many
   *  rather than interpolating unconditionally, same reasoning as the reach note's sibling on
   *  `conversations.page.ts`: a plural rule other than English's needs the branch. */
  protected confirmMessage = computed(() => {
    const n = this.previewCount();
    if (n === null) return '';
    if (n === 1) {
      return $localize`:@@announcements.confirm.count.one:This sends immediately to 1 person and cannot be undone.`;
    }
    return $localize`:@@announcements.confirm.count.many:This sends immediately to ${n}:count: people and cannot be undone.`;
  });

  /** Names the audience in words for the confirm sheet — for a class, the chosen target's name
   *  and start time, formatted through the locale-aware `formatDate`, not a hand-built string. */
  protected audienceLine = computed(() => {
    const seg = this.segment();
    if (seg === 'EVERYONE') return this.audienceEveryone;
    if (seg === 'EXPIRING') return this.audienceExpiring;
    const t = this.selectedTarget();
    if (!t) return '';
    const when = `${formatDate(t.startAt, 'EEE d MMM', this.locale)} · ${formatDate(t.startAt, 'HH:mm', this.locale)}`;
    return $localize`:@@announcements.confirm.audience.class:${t.name}:name: · ${when}:when:`;
  });

  /** The recipients sheet renders exactly this order — server-sorted (read-first alphabetical,
   *  then unread alphabetical) — so the search box only ever filters it, never re-sorts it. */
  protected filteredRecipients = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const q = this.detailSearch().trim().toLowerCase();
    if (!q) return d.recipients;
    return d.recipients.filter(r => r.name.toLowerCase().includes(q));
  });

  constructor() {
    // Filtering lands the list back at the top — without this a search typed while scrolled down
    // leaves the box showing whatever used to be at that offset, same bug the class picker's day
    // pager already guards against.
    effect(() => {
      this.detailSearch();
      const el = this.detailListRef?.nativeElement;
      if (el) el.scrollTop = 0;
    });
  }

  ngOnInit(): void {
    this.loadTargets();
    this.loadHistory();
  }

  protected loadTargets(): void {
    this.targetsState.set('loading');
    this.messaging.announcementTargets().subscribe({
      next: rows => { this.targets.set(rows); this.targetsState.set('ready'); },
      error: () => this.targetsState.set('error'),
    });
  }

  protected loadHistory(): void {
    this.historyState.set('loading');
    this.messaging.announcements().subscribe({
      next: rows => { this.history.set(rows); this.historyState.set('ready'); },
      error: () => this.historyState.set('error'),
    });
  }

  /** "by <coach>" — a name, so plain prose (Archivo), never mono. */
  protected byLabel(name: string): string {
    return $localize`:@@announcements.picker.by:by ${name}:name:`;
  }

  /** Counted, so mono/tabular in the template — the placeholder names sit immediately after each
   *  expression so neither one ships as literal ":booked:"/":waiting:" text. */
  protected countsLabel(t: AnnouncementTarget): string {
    return $localize`:@@announcements.picker.counts:${t.bookedCount}:booked: booked · ${t.waitlistCount}:waiting: waiting`;
  }

  /** The audience line on each card — computed server-side as `recipientCount`, never
   *  `bookedCount + waitlistCount` here, which would double-count anyone holding both a booked and
   *  a waitlist row. */
  protected reachLabel(n: number): string {
    if (n === 1) return $localize`:@@announcements.picker.reach.one:1 person would get it`;
    return $localize`:@@announcements.picker.reach.many:${n}:count: people would get it`;
  }

  /** Shared by the history row and the detail sheet's fallback header (no class), so it takes
   *  the one field both `AnnouncementRow` and `AnnouncementDetail` carry. */
  protected segmentLabel(a: { segment: Segment }): string {
    switch (a.segment) {
      case 'EVERYONE': return this.segLabelEveryone;
      case 'EXPIRING': return this.segLabelExpiring;
      default: return this.segLabelClass;
    }
  }

  protected readCountLabel(a: { readCount: number; sentCount: number }): string {
    return $localize`:@@announcements.history.readCount:${a.readCount}:read:/${a.sentCount}:sent: read`;
  }

  /** Read time in the recipient list: the clock alone when it happened today (no ambiguity), a
   *  short date otherwise — both through the locale-aware `formatDate`, never a hand-built string. */
  protected readTimeLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return formatDate(d, 'HH:mm', this.locale);
    return formatDate(d, 'd MMM', this.locale);
  }

  protected openDetail(id: string): void {
    this.detailOpenId = id;
    this.detailSearch.set('');
    this.detailOpen.set(true);
    this.loadDetail(id);
  }

  protected retryDetail(): void {
    if (this.detailOpenId) this.loadDetail(this.detailOpenId);
  }

  private loadDetail(id: string): void {
    this.detailState.set('loading');
    this.messaging.announcementDetail(id).subscribe({
      next: d => { this.detail.set(d); this.detailState.set('ready'); },
      error: () => this.detailState.set('error'),
    });
  }

  protected onDetailClosed(): void {
    this.detailOpen.set(false);
  }

  /** Picking a card closes the sheet and returns focus to the trigger that opened it — scheduled
   *  with afterNextRender, ordered to run only once Angular has actually written the closed sheet
   *  and the updated trigger label to the DOM. */
  /**
   * Paging to another day scrolls the list back to the top. The box has a fixed height and its own
   * scrollbar, so without this you land halfway down a day you have not seen the start of.
   */
  protected onPickerDayChange(offset: number): void {
    this.pickerDayOffset.set(offset);
    const el = this.pickerBodyRef?.nativeElement;
    if (el) el.scrollTop = 0;
  }

  /**
   * A validation message has to die when the thing it complains about is fixed, not when the user
   * presses the button again. Left standing while they type, it reads as "your correction did not
   * register" — and a screen reader, having announced the alert once, says nothing at all when it
   * stops being true. Both handlers below clear it the moment the input becomes valid.
   */
  protected onBodyInput(value: string): void {
    this.body.set(value);
    if (this.formError() && value.trim()) this.formError.set(null);
  }

  protected selectTarget(t: AnnouncementTarget): void {
    this.segmentRef.set(t.id);
    if (this.formError()) this.formError.set(null);
    this.pickerOpen.set(false);
    afterNextRender(() => {
      document.querySelector<HTMLElement>('[data-testid="announcement-session-picker"]')?.focus();
    }, { injector: this.injector });
  }

  /** The guard lives here, not in a disabled attribute — Enter submits a form regardless of any
   *  button's `[disabled]`, so an empty body or a missing class picked has to be caught on the
   *  way in, with focus moved onto whatever the caller needs to fix. */
  protected submit(event: Event): void {
    event.preventDefault();
    if (this.previewPending() || this.sendPending() || this.confirmOpen()) return;

    const body = this.body().trim();
    if (!body) {
      this.formError.set(this.emptyBodyError);
      afterNextRender(() => this.bodyInputRef?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    if (this.segment() === 'CLASS_ROSTER' && !this.segmentRef()) {
      this.formError.set(this.noClassError);
      afterNextRender(() => {
        document.querySelector<HTMLElement>('[data-testid="announcement-session-picker"]')?.focus();
      }, { injector: this.injector });
      return;
    }

    this.formError.set(null);
    this.previewPending.set(true);
    const ref = this.segment() === 'CLASS_ROSTER' ? this.segmentRef() : undefined;
    this.messaging.announcementPreview(this.segment() as Segment, ref).subscribe({
      next: res => {
        this.previewPending.set(false);
        this.previewCount.set(res.count);
        this.sendError.set(null);
        this.confirmOpen.set(true);
      },
      error: () => {
        this.previewPending.set(false);
        this.formError.set(this.previewFailedError);
      },
    });
  }

  protected cancelConfirm(): void {
    this.confirmOpen.set(false);
  }

  protected confirmSend(): void {
    if (this.sendPending()) return;
    const body = this.body().trim();
    const ref = this.segment() === 'CLASS_ROSTER' ? this.segmentRef() : undefined;
    this.sendPending.set(true);
    this.sendError.set(null);
    this.messaging.sendAnnouncement(body, this.segment() as Segment, ref).subscribe({
      next: row => {
        this.sendPending.set(false);
        this.history.update(list => [row, ...list]);
        this.body.set('');
        this.previewCount.set(null);
        this.confirmOpen.set(false);
        afterNextRender(() => {
          document.querySelector<HTMLElement>('[data-testid="announcement-send"]')?.focus();
        }, { injector: this.injector });
      },
      error: () => {
        this.sendPending.set(false);
        this.sendError.set(this.sendFailedError);
      },
    });
  }
}

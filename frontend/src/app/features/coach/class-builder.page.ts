import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, LOCALE_ID, OnInit, computed, inject, signal,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BookingService, SessionDetail, SessionView } from '../booking/booking.service';
import {
  ProgrammingService, Wod, MACROS, TIMING_PRESETS, ItemInput, SessionItem,
} from '../programming/programming.service';
import { ClassDraftStore, PieceDraft } from '../programming/class-draft.store';
import { PickSheetComponent, PickRow, PickResult } from '../programming/pick-sheet.component';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { BannerComponent } from '../../ui/banner.component';
import { EmptyComponent } from '../../ui/empty.component';
import { SheetComponent } from '../../ui/sheet.component';
import { SortableListComponent } from '../../ui/sortable-list.component';
import { HasUnsaved } from '../../core/unsaved.guard';

/** Mirrors the backend's WodTypeWire.toMacro exactly (spec 11c §2). Copied, not re-derived. */
const macroOf = (wodType: string) =>
  wodType === 'WARMUP' ? 'WARMUP'
  : wodType === 'STRENGTH' ? 'STRENGTH'
  : wodType === 'SKILL' ? 'GYMNASTIC'
  : 'WORKOUT';

/** Carried from the previous class builder's skeleton seed, unchanged in intent. */
const scoredByDefault = (type: string): boolean =>
  ['FOR_TIME', 'AMRAP', 'EMOM', 'INTERVAL', 'STRENGTH'].includes(type);

const MACRO_LABELS: Record<string, string> = {
  WARMUP: $localize`:@@class.macro.warmup:Warmup`,
  STRENGTH: $localize`:@@class.macro.strength:Strength`,
  GYMNASTIC: $localize`:@@class.macro.gymnastic:Gymnastic`,
  WORKOUT: $localize`:@@class.macro.workout:Workout`,
};

const PRESET_LABELS: Record<string, string> = {
  FOR_TIME: $localize`:@@class.preset.forTime:For time`,
  AMRAP: $localize`:@@class.preset.amrap:AMRAP`,
  EMOM: $localize`:@@class.preset.emom:EMOM`,
  TABATA: $localize`:@@class.preset.tabata:Tabata`,
  INTERVAL: $localize`:@@class.preset.interval:Interval`,
};

const NOT_SCORED = $localize`:@@class.score.notScored:not scored`;
const ANY_LABEL = $localize`:@@class.filter.any:Any`;

/** One row of the "copy to the day's other classes" sheet. `itemCount === null` means the fetch
 *  for that target's existing pieces hasn't resolved yet (or failed -- see `failed`); never
 *  treated as "empty" until it actually resolves to zero. */
interface CopyTarget {
  session: SessionView;
  itemCount: number | null;
  failed: boolean;
  checked: boolean;
}

/** One row's worth of content snippet, ~80 chars: long enough to tell pieces apart, short enough
 *  to never wrap a result row to three lines at 360px. */
const SNIPPET_CAP = 80;

/** One printable row of an expanded piece's body, flattened from `wod.blocks` (two levels deep,
 *  the server rejects a third). Built once per render by `expandedRows` so the template stays a
 *  flat @for instead of nested loops. */
type ExpandedRow =
  | { kind: 'label'; text: string; sub: boolean }
  | { kind: 'line'; reps?: string; text: string; load?: string; unit?: string; sub: boolean };

/** Walk one level of nesting -- blocks are exactly two levels deep (server rejects a third). */
function wodMatchesText(w: Wod, needle: string): boolean {
  if (!needle) return true;
  if (w.title.toLowerCase().includes(needle)) return true;
  for (const b of w.blocks?.blocks ?? []) {
    if ((b.lines ?? []).some(l => l.text?.toLowerCase().includes(needle))) return true;
    for (const sb of b.blocks ?? []) {
      if ((sb.lines ?? []).some(l => l.text?.toLowerCase().includes(needle))) return true;
    }
  }
  return false;
}

/**
 * The class stack: one screen per class instance, a reorderable list of pieces filled from the
 * library, written fresh, or left as an empty skeleton slot.
 *
 * Drafts live in ClassDraftStore so a round trip through the piece editor (build/piece/:index)
 * does not lose in-progress work -- the store, not this component, owns the array.
 */
@Component({
  selector: 'bh-class-builder',
  standalone: true,
  imports: [
    DatePipe, RouterLink, ButtonComponent, AlertComponent, EmptyComponent, SheetComponent,
    SortableListComponent, PickSheetComponent, BannerComponent,
  ],
  template: `
    <section class="page">
      <a class="back" routerLink="/coach/classes" i18n="@@class.back">‹ Classes</a>

      @switch (state()) {
        @case ('loading') {
          <p class="stateline" data-testid="stack-loading" i18n="@@class.loading">Loading class…</p>
        }
        @case ('error') {
          <div data-testid="stack-error">
            <bh-alert tone="danger" i18n="@@class.error">Couldn't load this class.</bh-alert>
            <bh-button variant="ghost" (click)="retry()" testId="stack-retry">
              <span i18n="@@class.retry">Try again</span>
            </bh-button>
          </div>
        }
        @default {
          @if (detail(); as d) {
            <header class="head">
              <div class="eyebrow-row">
                <span class="eyebrow">{{ d.startAt | date:'EEE d MMM · HH:mm' }}</span>
                @if (published()) {
                  <span class="pill live" data-testid="status-live" i18n="@@class.status.live">LIVE</span>
                } @else {
                  <span class="pill" data-testid="status-draft" i18n="@@class.status.draft">DRAFT</span>
                }
              </div>
              <h1 class="title">{{ d.name }}</h1>
            </header>

            <form (submit)="submit($event)" novalidate data-testid="stack-form">
              @if (drafts().length === 0) {
                <bh-empty data-testid="stack-empty" icon="inbox"
                          i18n-title="@@class.empty.title" title="No pieces yet"
                          i18n-message="@@class.empty.message" message="Add a slot to start building this class." />
              } @else {
                <bh-sortable-list [items]="drafts()" [itemLabel]="itemLabel" [canDragItem]="canDragItem"
                                   label="Class pieces" i18n-label="@@class.stack.aria"
                                   (reordered)="reorder($event)">
                  <ng-template let-d let-i="index">
                    <div class="stackrow" [attr.data-testid]="'piece-' + i">
                      @if (isEmpty(d)) {
                        <button type="button" class="rowbtn" (click)="openSlot(i)"
                                [attr.data-testid]="'slot-open-' + i">
                          <span class="num">{{ i + 1 }}</span>
                          <span class="rtext">
                            <span class="ptitle">{{ d.label }}</span>
                            <span class="meta" i18n="@@class.slot.empty">Empty — tap to fill</span>
                          </span>
                          <span class="chev" aria-hidden="true">&#x203A;</span>
                        </button>
                      } @else {
                        <button type="button" class="rowbtn" (click)="toggleExpand(i)"
                                [attr.aria-expanded]="expanded() === i"
                                [attr.data-testid]="'piece-toggle-' + i">
                          <span class="num">{{ i + 1 }}</span>
                          <span class="rtext">
                            <span class="ptitle">{{ d.wod!.title }}</span>
                            <span class="meta">{{ metaLine(d) }}</span>
                          </span>
                          <span class="chev" aria-hidden="true">{{ expanded() === i ? '˄' : '˅' }}</span>
                        </button>
                        @if (expanded() === i) {
                          <div class="expanded" [attr.data-testid]="'piece-expanded-' + i">
                            @if (expandedRows(d.wod); as rows) {
                              @if (rows.length) {
                                @for (r of rows; track $index) {
                                  @if (r.kind === 'label') {
                                    <p class="blocklabel" [class.sub]="r.sub">{{ r.text }}</p>
                                  } @else {
                                    <p class="rxline" [class.sub]="r.sub">
                                      @if (r.reps) { <span class="mono">{{ r.reps }}</span> }
                                      <span>{{ r.text }}</span>
                                      @if (r.load) {
                                        <span class="mono">{{ r.load }}{{ r.unit ? ' ' + r.unit : '' }}</span>
                                      }
                                    </p>
                                  }
                                }
                              } @else if (d.wod!.bodyText) {
                                <p class="rx">{{ d.wod!.bodyText }}</p>
                              }
                            }
                            <div class="expanded-foot">
                              <button type="button" class="editlink" (click)="editPiece(i)"
                                      [attr.data-testid]="'piece-edit-' + i">
                                <span i18n="@@class.piece.edit">Edit this piece</span> &#x203A;
                              </button>
                              @if (confirmRemove() === i) {
                                <div class="removeconfirm">
                                  <bh-button variant="ghost" size="sm" (click)="cancelRemoveBlock()"
                                             [testId]="'piece-remove-cancel-' + i">
                                    <span i18n="@@class.piece.removeCancel">Cancel</span>
                                  </bh-button>
                                  <bh-button variant="danger" size="sm" (click)="confirmRemoveBlock(i)"
                                             [testId]="'piece-remove-confirm-' + i">
                                    <span i18n="@@class.piece.removeConfirm">Remove</span>
                                  </bh-button>
                                </div>
                              } @else {
                                <bh-button variant="ghost-danger" size="sm" (click)="confirmRemove.set(i)"
                                           [testId]="'piece-remove-' + i">
                                  <span i18n="@@class.piece.remove">Remove</span>
                                </bh-button>
                              }
                            </div>
                          </div>
                        }
                      }
                    </div>
                  </ng-template>
                </bh-sortable-list>
              }

              <button type="button" class="addslot" data-testid="add-slot" (click)="addSlotOpen.set(true)">
                <span i18n="@@class.addSlot">Add a slot</span>
              </button>

              <footer class="foot">
                @if (formError()) {
                  <bh-alert tone="danger" data-testid="stack-save-error">{{ formError() }}</bh-alert>
                }
                <div class="saverow">
                  <bh-button type="button" variant="ghost" size="lg" class="full" [disabled]="saving()"
                             (click)="saveDraft()" testId="save-draft">
                    <span i18n="@@class.save.draft">Save draft</span>
                  </bh-button>
                  <!-- volt is legal here: the builder is on the hero list (user-ruled 2026-09-08),
                       and publishing IS live/now -- exactly what volt means. Don't "fix" this back
                       to strong; the pill above was demoted so this is the screen's one volt spend. -->
                  <bh-button type="submit" variant="primary" size="lg" class="full"
                             [loading]="saving()" testId="save-publish">
                    <span i18n="@@class.save.publish">Save and publish</span>
                  </bh-button>
                </div>
              </footer>

              <div class="copyaction">
                <bh-button type="button" variant="solid" size="lg" class="full"
                           [disabled]="!!copyDisabledReason()" testId="copy-day" (click)="openCopySheet()">
                  <span i18n="@@class.copyDay.button">Copy to the day's other classes</span>
                </bh-button>
                @if (copyDisabledReason(); as reason) {
                  <p class="copy-reason" data-testid="copy-day-reason">{{ reason }}</p>
                }
              </div>
            </form>

            <bh-pick-sheet [open]="slotSheetOpen()" [rows]="filteredLibraryRows()"
                           [allowFreeText]="false" [overlay]="slotStep() !== 'search'"
                           title="Fill this slot" i18n-title="@@class.slot.sheetTitle"
                           (search)="onLibrarySearch($event)" (picked)="onSlotPicked($event)"
                           (closed)="closeSlotSheet()">
              <div sheetFilters class="filterbtns">
                <button type="button" class="filterbtn" data-testid="filter-category"
                        (click)="slotStep.set('category')">
                  <span class="filter-k" i18n="@@class.slot.filterCategory">CATEGORY</span>
                  <span class="filter-v">{{ categoryFilterLabel() }}</span>
                </button>
                <button type="button" class="filterbtn" data-testid="filter-type"
                        (click)="slotStep.set('type')">
                  <span class="filter-k" i18n="@@class.slot.filterType">TYPE</span>
                  <span class="filter-v">{{ typeFilterLabel() }}</span>
                </button>
              </div>
              <button type="button" sheetLead class="writenew" data-testid="slot-write-new"
                      (click)="writeNewPiece()">
                <span i18n="@@class.slot.writeNew">＋ Write a new piece</span>
              </button>

              @if (slotStep() === 'category') {
                <div sheetOverlay class="stepbody" data-testid="slot-category-step">
                  <div class="rows">
                    <button type="button" class="prow" [class.sel]="categoryFilter() === ''"
                            data-testid="filter-category-ANY" (click)="pickCategory('')">
                      <span>{{ anyLabel }}</span>
                      @if (categoryFilter() === '') { <span class="mark" aria-hidden="true">&#x2713;</span> }
                    </button>
                    @for (m of macros; track m) {
                      <button type="button" class="prow" [class.sel]="categoryFilter() === m"
                              [attr.data-testid]="'filter-category-' + m" (click)="pickCategory(m)">
                        <span>{{ macroLabel(m) }}</span>
                        @if (categoryFilter() === m) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                      </button>
                    }
                  </div>
                  <div class="stepfoot">
                    <bh-button variant="ghost" size="lg" class="full" testId="slot-category-back"
                               (click)="slotStep.set('search')">
                      <span i18n="@@class.slot.back">Back</span>
                    </bh-button>
                  </div>
                </div>
              }
              @if (slotStep() === 'type') {
                <div sheetOverlay class="stepbody" data-testid="slot-type-step">
                  <div class="rows">
                    <button type="button" class="prow" [class.sel]="typeFilter() === ''"
                            data-testid="filter-type-ANY" (click)="pickType('')">
                      <span>{{ anyLabel }}</span>
                      @if (typeFilter() === '') { <span class="mark" aria-hidden="true">&#x2713;</span> }
                    </button>
                    @for (p of timingPresets; track p) {
                      <button type="button" class="prow" [class.sel]="typeFilter() === p"
                              [attr.data-testid]="'filter-type-' + p" (click)="pickType(p)">
                        <span>{{ presetLabel(p) }}</span>
                        @if (typeFilter() === p) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                      </button>
                    }
                  </div>
                  <div class="stepfoot">
                    <bh-button variant="ghost" size="lg" class="full" testId="slot-type-back"
                               (click)="slotStep.set('search')">
                      <span i18n="@@class.slot.back">Back</span>
                    </bh-button>
                  </div>
                </div>
              }
              @if (slotStep() === 'detail' && detailWod(); as w) {
                <div sheetOverlay class="stepbody" data-testid="slot-detail-step">
                  <h3 class="detail-title">{{ w.title }}</h3>
                  <p class="detail-meta">{{ libMeta(w) }}</p>
                  <div class="detail-rx">
                    @if (expandedRows(w); as rows) {
                      @if (rows.length) {
                        @for (r of rows; track $index) {
                          @if (r.kind === 'label') {
                            <p class="blocklabel" [class.sub]="r.sub">{{ r.text }}</p>
                          } @else {
                            <p class="rxline" [class.sub]="r.sub">
                              @if (r.reps) { <span class="mono">{{ r.reps }}</span> }
                              <span>{{ r.text }}</span>
                              @if (r.load) {
                                <span class="mono">{{ r.load }}{{ r.unit ? ' ' + r.unit : '' }}</span>
                              }
                            </p>
                          }
                        }
                      } @else if (w.bodyText) {
                        <p class="rx">{{ w.bodyText }}</p>
                      }
                    }
                  </div>
                  <div class="detail-actions">
                    <bh-button variant="ghost" size="lg" class="full" testId="slot-detail-back"
                               (click)="slotStep.set('search')">
                      <span i18n="@@class.slot.detail.back">Back</span>
                    </bh-button>
                    <bh-button variant="strong" size="lg" class="full" testId="slot-detail-select"
                               (click)="selectDetailWod()">
                      <span i18n="@@class.slot.detail.select">Select</span>
                    </bh-button>
                  </div>
                </div>
              }
            </bh-pick-sheet>

            <bh-sheet [open]="addSlotOpen()" title="Add a slot" i18n-title="@@class.addSlot.sheetTitle"
                      label="Add a slot" i18n-label="@@class.addSlot.aria" (closed)="addSlotOpen.set(false)">
              <div class="slotrows">
                @for (m of macros; track m) {
                  <button type="button" class="macrorow" [attr.data-testid]="'add-slot-' + m"
                          (click)="appendSlot(m)">
                    <span>{{ macroLabel(m) }}</span>
                  </button>
                }
              </div>
            </bh-sheet>

            <bh-sheet [open]="copyOpen()" title="Copy to the day's other classes"
                      i18n-title="@@class.copyDay.sheetTitle" label="Copy to the day's other classes"
                      i18n-label="@@class.copyDay.aria" (closed)="closeCopySheet()">
              <div class="ctrows">
                @for (t of copyTargets(); track t.session.id) {
                  <button type="button" class="ctrow" role="checkbox" [attr.aria-checked]="t.checked"
                          [attr.data-testid]="'copy-target-' + t.session.id"
                          (click)="toggleCopyTarget(t.session.id)">
                    <span class="ct-text">
                      <span class="ct-top">
                        <span class="ct-time">{{ t.session.startAt | date:'HH:mm' }}</span>
                        <span class="ct-name">{{ t.session.name }}</span>
                      </span>
                      <span class="ct-state">
                        @if (t.failed) {
                          <span i18n="@@class.copyDay.unknown">Couldn't check — skipped</span>
                        } @else if (t.itemCount === null) {
                          <span i18n="@@class.copyDay.checking">Checking…</span>
                        } @else if (t.itemCount === 0) {
                          <span i18n="@@class.copyDay.empty">Empty</span>
                        } @else {
                          <span i18n="@@class.copyDay.hasPieces">{t.itemCount, plural, =1 {1 piece already — will be replaced} other {{{ t.itemCount }} pieces already — will be replaced}}</span>
                        }
                      </span>
                    </span>
                    <span class="ct-box" [class.checked]="t.checked" aria-hidden="true">
                      @if (t.checked) { <span class="mark">&#x2713;</span> }
                    </span>
                  </button>
                }
              </div>
              <div class="ctfoot">
                @if (copyError()) {
                  <bh-alert tone="danger" data-testid="copy-day-error">{{ copyError() }}</bh-alert>
                }
                <bh-button type="button" variant="strong" size="lg" class="full" [loading]="copyBusy()"
                           [disabled]="checkedCopyCount() === 0" testId="copy-confirm" (click)="confirmCopy()">
                  <span i18n="@@class.copyDay.confirm">{checkedCopyCount(), plural, =1 {Copy to 1 class} other {Copy to {{ checkedCopyCount() }} classes}}</span>
                </bh-button>
              </div>
            </bh-sheet>
          }
        }
      }

      @if (banner(); as b) {
        <bh-banner [tone]="b.tone" [message]="b.message" [actionLabel]="b.actionLabel ?? ''"
                   (action)="retryLastSave()" (dismissed)="banner.set(null)" />
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .back { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--bone-dim);
      text-decoration: none; margin-bottom: var(--sp-2); }
    .back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .head { display: flex; flex-direction: column; gap: var(--sp-1); margin-bottom: var(--sp-4); }
    .eyebrow-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    /* The pill is NOT this screen's volt element -- "Save and publish" below is, and volt is one
       question per screen. LIVE is demoted to --good text/border, same idiom as classes.page.ts's
       .prog.pub (the list screen's own live marker). DRAFT is unchanged. */
    .pill { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 3px 8px; border: 1px solid var(--hairline);
      border-radius: var(--r-full); color: var(--faint); }
    .pill.live { color: var(--good); border-color: var(--good); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }

    /* ---- stack rows ------------------------------------------------------------------------ */
    .stackrow { display: flex; flex-direction: column; width: 100%; min-width: 0; }
    .rowbtn { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--sp-3);
      align-items: center; width: 100%; min-height: var(--tap); box-sizing: border-box;
      padding: 0; background: none; border: none; color: inherit; text-align: left; cursor: pointer; }
    .rowbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-xs); }
    .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700;
      color: var(--faint); min-width: 18px; }
    .rtext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ptitle { font-family: var(--font-body); font-weight: 600; font-size: var(--fs-body);
      color: var(--bone); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    .chev { flex-shrink: 0; color: var(--faint); font-size: var(--fs-body); }

    .expanded { display: flex; flex-direction: column; gap: var(--sp-3);
      padding: var(--sp-2) 0 0 calc(18px + var(--sp-3)); }
    .rx { margin: 0; font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone);
      white-space: pre-wrap; }
    .blocklabel { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
    .blocklabel:first-child { margin-top: 0; }
    .blocklabel.sub { padding-left: var(--sp-3); }
    .rxline { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2); margin: 0;
      font-size: var(--fs-sm); color: var(--bone); }
    .rxline.sub { padding-left: var(--sp-3); }
    .rxline .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums;
      color: var(--bone-dim); flex-shrink: 0; }
    .expanded-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      flex-wrap: wrap; }
    .editlink { display: inline-flex; align-items: center; gap: 4px; min-height: var(--tap);
      padding: 0; background: none; border: none; color: var(--bone-dim); text-decoration: none;
      font-family: var(--font-body); font-size: var(--fs-sm); cursor: pointer; }
    .editlink:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-xs); }
    /* Two-step remove, same idiom as the piece editor's own block remove: the opener is a
       danger-bordered ghost (never outshouts the volt publish button), Cancel/Remove replace it
       in place once armed. */
    .removeconfirm { display: flex; align-items: center; gap: var(--sp-2); }

    .addslot { width: 100%; min-height: var(--tap-lg); margin: var(--sp-3) 0; background: none;
      border: 1px dashed var(--hairline); border-radius: var(--r-ctl); color: var(--bone-dim);
      font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; cursor: pointer; }
    .addslot:hover { color: var(--bone); border-color: var(--bone-dim); }
    .addslot:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    /* The copy button is a real, always-enabled-looking action (bh-button solid), not the dashed
       .addslot quiet treatment -- that's what made it unfindable. Kept apart from "Add a slot"
       by the footer's own gap so the two never read as a pair. */
    .copyaction { margin-top: var(--sp-5); }
    .copy-reason { margin: var(--sp-2) 0 0; font-family: var(--font-body); font-size: var(--fs-sm);
      color: var(--faint); }

    .foot { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-5); }
    .full { width: 100%; }
    /* Save draft / Save and publish side by side (user-ruled 2026-09-12: "not like this, i dont
       like having 4 buttons stacked"). Publish gets the larger share so it still reads as primary
       -- volt already carries the hierarchy, this just gives it more room. class="full" is dropped
       from both bh-buttons: the grid gives each its width, and a long "Save and publish" wraps to
       two lines rather than overflow if a column is ever too narrow (measured at 320/360/393). */
    .saverow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: var(--sp-3); }

    /* ---- fill-slot sheet: lead row + segmented filters ------------------------------------- */
    .writenew { display: flex; align-items: center; width: 100%; box-sizing: border-box;
      min-height: var(--tap); padding: var(--sp-2); background: none; border: none;
      border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; cursor: pointer; }
    .writenew:hover { background: var(--surface-2); }
    .writenew:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    /* ---- fill-slot sheet: filter trigger buttons, same two-line chip idiom as the piece
       editor's meta strip -- --bone/--surface, never volt: this screen's volt budget is spent. */
    .filterbtns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
    .filterbtn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0;
      min-height: var(--tap); box-sizing: border-box; padding: var(--sp-2) var(--sp-3);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      color: var(--bone); text-align: left; cursor: pointer; }
    .filterbtn:hover { border-color: var(--bone-dim); }
    .filterbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .filter-k { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.08em; color: var(--bone-dim); }
    .filter-v { width: 100%; font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }

    /* ---- fill-slot sheet: category/type/detail steps -- same .prow + checkmark idiom as the
       piece editor's own meta sheets (copied, not reinvented). Back is the SAME bh-button the
       detail step uses -- same variant/size/position -- so all three steps read as one family. */
    .stepbody { display: flex; flex-direction: column; }
    .stepfoot { margin-top: var(--sp-3); }
    .prow { display: flex; align-items: center; justify-content: space-between; width: 100%;
      box-sizing: border-box; min-height: var(--tap); padding: 0 var(--sp-2); background: none;
      border: none; border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; }
    .stepbody .prow:last-child { border-bottom: none; }
    .prow:hover { background: var(--surface-2); }
    .prow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .prow.sel { font-weight: 700; }
    .mark { color: var(--bone); font-weight: 700; }

    /* ---- fill-slot sheet: piece detail step -- the prescription reuses .blocklabel/.rxline/.rx
       verbatim (same renderer as the stack's own expanded row), so only the step chrome is new. */
    .detail-title { margin: 0 0 2px; font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-h2); color: var(--bone); }
    .detail-meta { margin: 0 0 var(--sp-3); font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.04em; color: var(--bone-dim); }
    .detail-rx { display: flex; flex-direction: column; gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .detail-actions { display: flex; gap: var(--sp-3); }
    .detail-actions bh-button { flex: 1; min-width: 0; }

    /* ---- add-a-slot sheet: four full-width plain-verb rows --------------------------------- */
    .slotrows { display: flex; flex-direction: column; }
    .macrorow { width: 100%; box-sizing: border-box; min-height: var(--tap-lg); padding: 0 var(--sp-2);
      background: none; border: none; border-bottom: 1px solid var(--hairline); color: var(--bone);
      text-align: left; font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500;
      cursor: pointer; }
    .slotrows .macrorow:last-child { border-bottom: none; }
    .macrorow:hover { background: var(--surface-2); }
    .macrorow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    /* ---- copy-to-day sheet: same tap/divider idiom as .prow, two-line meta + a checkbox mark
       -- plumbing, no volt. ------------------------------------------------------------------ */
    .ctrows { display: flex; flex-direction: column; }
    .ctrow { display: flex; align-items: center; gap: var(--sp-3); width: 100%; box-sizing: border-box;
      min-height: var(--tap-lg); padding: var(--sp-2) 0; background: none; border: none;
      border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left; cursor: pointer; }
    .ctrows .ctrow:last-child { border-bottom: none; }
    .ctrow:hover { background: var(--surface-2); }
    .ctrow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .ct-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .ct-top { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
    .ct-time { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700;
      font-size: var(--fs-sm); color: var(--bone-dim); flex-shrink: 0; }
    .ct-name { font-family: var(--font-body); font-weight: 600; font-size: var(--fs-body);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ct-state { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    .ct-box { flex-shrink: 0; width: 22px; height: 22px; box-sizing: border-box;
      border: 1px solid var(--hairline); border-radius: var(--r-xs); display: grid; place-items: center; }
    .ct-box.checked { border-color: var(--bone); }
    .ctfoot { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-3); }
  `],
})
export class ClassBuilderPage implements OnInit, HasUnsaved {
  private booking = inject(BookingService);
  private prog = inject(ProgrammingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(ClassDraftStore);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private locale = inject(LOCALE_ID);

  readonly macros = MACROS;

  sessionId = '';
  detail = signal<SessionDetail | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  published = signal(false);
  library = signal<Wod[]>([]);

  drafts = this.store.drafts;
  expanded = signal<number | null>(null);
  /** Which expanded row is asking to confirm its Remove -- mirrors the piece editor's two-step
   *  remove idiom exactly (contract 12e). Only one row may ask at a time. */
  confirmRemove = signal<number | null>(null);

  slotSheetOpen = signal(false);
  slotIndex = signal<number | null>(null);
  searchTerm = signal('');
  categoryFilter = signal('');
  typeFilter = signal('');
  /** Which step the fill-slot sheet shows. `search` drives [overlay]="slotStep() !== 'search'"
   *  on bh-pick-sheet -- every other value swaps in this component's own [sheetOverlay] content. */
  slotStep = signal<'search' | 'category' | 'type' | 'detail'>('search');
  /** The result tapped on the search step, shown (not yet applied) on the detail step. */
  detailWod = signal<Wod | null>(null);

  addSlotOpen = signal(false);

  /** Other sessions on this class's own LOCAL calendar day, same name, excluding itself -- the
   *  copy button's candidate list. A session carries no link to its class type, so "same class
   *  type" is matched on name, exactly like `seedFromSkeleton`'s `ts.find(x => x.name === d.name)`.
   *  A real limitation (two differently-scheduled class types sharing a name would collide), not
   *  an oversight. */
  dayTargets = signal<SessionView[]>([]);
  copyOpen = signal(false);
  copyTargets = signal<CopyTarget[]>([]);
  copyBusy = signal(false);
  copyError = signal('');

  saving = signal(false);
  formError = signal('');
  /** One banner at a time -- a new outcome replaces whatever is showing rather than stacking. */
  banner = signal<{ tone: 'good' | 'danger'; message: string; actionLabel?: string } | null>(null);
  /** What Retry re-runs, set only by a failed save -- copy failures don't offer it. */
  private pendingRetry: (() => void) | null = null;

  readonly anyLabel = ANY_LABEL;
  readonly timingPresets = TIMING_PRESETS;

  categoryFilterLabel = computed(() => this.categoryFilter() ? this.macroLabel(this.categoryFilter()) : ANY_LABEL);
  typeFilterLabel = computed(() => this.typeFilter() ? this.presetLabel(this.typeFilter()) : ANY_LABEL);

  /** The last-SAVED state, not the current (possibly unsaved) drafts -- `store.baseline()` is
   *  exactly that snapshot. Drives the copy button's disabled state: copying an unsaved stack
   *  would copy nothing. */
  hasSavedPieces = computed(() =>
    (JSON.parse(this.store.baseline()) as PieceDraft[]).some(d => !this.isEmpty(d)));

  /** The copy button is always shown (a coach must be able to discover it); this is why it's
   *  disabled, rendered as a --faint meta line under the button, never a tooltip -- there is no
   *  tooltip on touch. Empty string means enabled. */
  copyDisabledReason = computed(() => {
    if (!this.dayTargets().length) {
      return $localize`:@@class.copyDay.noTargets:No other classes of this type today.`;
    }
    if (!this.hasSavedPieces()) {
      return $localize`:@@class.copyDay.nothingToCopy:Nothing to copy yet.`;
    }
    return '';
  });

  checkedCopyCount = computed(() => this.copyTargets().filter(t => t.checked).length);

  itemLabel = (d: PieceDraft, i: number) =>
    d.wod?.title || d.label || $localize`:@@class.piece.fallback:piece ${i + 1}:position:`;

  canDragItem = (_d: PieceDraft, i: number) => this.expanded() !== i;

  // ponytail: the whole library is fetched once and filtered in the browser, because the server
  // filters on title only and the user asked to filter by movement and by type as well. Move the
  // filter server-side if a box's library ever outgrows one response.
  filteredLibraryRows = computed<PickRow[]>(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const cat = this.categoryFilter();
    const type = this.typeFilter();
    return this.library()
      .filter(w => (!cat || w.macro === cat) && (!type || w.timingPreset === type) && wodMatchesText(w, q))
      .map(w => ({ id: w.id, primary: w.title, secondary: this.libMeta(w), detail: this.wodSnippet(w) || undefined }));
  });

  /** "WORKOUT · for time" / "WARMUP" -- the result row's and the detail step's second line. */
  libMeta(w: Wod): string {
    return w.timingPreset
      ? `${MACRO_LABELS[w.macro] ?? w.macro} · ${PRESET_LABELS[w.timingPreset] ?? w.timingPreset}`
      : (MACRO_LABELS[w.macro] ?? w.macro);
  }

  /** The result row's third line: the prescription's movement text, so a coach can tell pieces
   *  apart without opening each one. Built from the SAME rows the detail step and the class
   *  stack's expanded row render, so the snippet can never disagree with either. */
  private wodSnippet(w: Wod): string {
    const parts = this.expandedRows(w)
      .filter((r): r is Extract<ExpandedRow, { kind: 'line' }> => r.kind === 'line')
      .map(l => (l.reps ? `${l.reps} ${l.text}` : l.text));
    const text = parts.length ? parts.join(', ') : (w.bodyText ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.length > SNIPPET_CAP ? text.slice(0, SNIPPET_CAP - 1).trimEnd() + '…' : text;
  }

  /** Navigating INTO the piece editor is part of editing this class, not leaving it: the drafts
   *  travel in the store, so the guard's "leave and lose them?" would be a lie and its Cancel
   *  would block the flow outright. The shared guard only ever sees hasUnsaved(), so the page
   *  suppresses it for exactly that hop. */
  private toEditor = false;

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent) { if (this.hasUnsaved()) ev.preventDefault(); }

  private snapshot(): string { return JSON.stringify(this.store.drafts()); }
  hasUnsaved(): boolean {
    return !this.toEditor && this.state() === 'ready' && this.snapshot() !== this.store.baseline();
  }

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('id')!;
    this.prog.wods().subscribe({ next: w => this.library.set(w), error: () => {} });
    this.load();
  }

  retry() {
    this.state.set('loading');
    this.load();
  }

  private load() {
    this.booking.sessionDetail(this.sessionId).subscribe({
      next: d => {
        this.detail.set(d);
        this.published.set(d.programmingStatus === 'PUBLISHED');
        this.loadDayTargets(d);
        if (this.store.holds(this.sessionId)) {
          this.state.set('ready');
        } else {
          this.loadItems(d);
        }
      },
      error: () => this.state.set('error'),
    });
  }

  /** Never fails the screen: a failed fetch just leaves the copy button hidden (fail closed),
   *  not a broken control. */
  private loadDayTargets(d: SessionDetail) {
    const from = new Date(d.startAt); from.setHours(0, 0, 0, 0); // LOCAL midnight, not UTC
    const to = new Date(from); to.setDate(to.getDate() + 1);
    this.booking.listSessions(from.toISOString(), to.toISOString()).subscribe({
      next: sessions => this.dayTargets.set(sessions.filter(s => s.name === d.name && s.id !== this.sessionId)),
      error: () => this.dayTargets.set([]),
    });
  }

  private loadItems(d: SessionDetail) {
    this.prog.sessionItems(this.sessionId).subscribe({
      next: items => {
        if (items.length) {
          this.openDrafts(items.map(i => this.toDraft(i)));
        } else {
          this.seedFromSkeleton(d);
        }
      },
      error: () => this.state.set('error'),
    });
  }

  /** The one place a `SessionItem` becomes a `PieceDraft`. */
  private toDraft(i: SessionItem): PieceDraft {
    return {
      itemId: i.id, wod: i.wod, fromLibraryWodId: null,
      label: i.wod.title, macro: i.wod.macro, scoreable: i.scoreable, scoreType: null,
    };
  }

  /** Empty instance: pre-seed the stack from the class type's skeleton (structure only). Never
   *  errors out -- no matching template, or the fetch fails, both just leave an empty stack. */
  private seedFromSkeleton(d: SessionDetail) {
    this.booking.listTemplates().subscribe({
      next: ts => {
        const t = ts.find(x => x.name === d.name);
        if (!t) { this.openDrafts([]); return; }
        this.prog.skeleton(t.id).subscribe({
          next: sk => this.openDrafts(sk.map(p => ({
            itemId: null, wod: null, fromLibraryWodId: null, label: p.label,
            macro: macroOf(p.wodType), scoreable: scoredByDefault(p.wodType), scoreType: null,
          }))),
          error: () => this.openDrafts([]),
        });
      },
      error: () => this.openDrafts([]),
    });
  }

  private openDrafts(drafts: PieceDraft[]) {
    this.store.open(this.sessionId, drafts);
    this.state.set('ready');
  }

  // ---- row rendering ------------------------------------------------------------------------

  isEmpty(d: PieceDraft): boolean { return d.wod === null && d.fromLibraryWodId === null; }

  /** Flattens `wod.blocks` (label, lines, one level of sub-blocks) into printable rows. Empty
   *  when the piece has no blocks -- the caller falls back to the legacy `bodyText`. Takes the
   *  `Wod` directly (not a `PieceDraft`) so the fill-slot sheet's detail step -- which only ever
   *  has a library `Wod`, not a draft -- can reuse it too. */
  expandedRows(w: Wod | null): ExpandedRow[] {
    const blocks = w?.blocks?.blocks ?? [];
    const rows: ExpandedRow[] = [];
    for (const b of blocks) {
      if (b.label) rows.push({ kind: 'label', text: b.label, sub: false });
      for (const l of b.lines ?? []) {
        rows.push({ kind: 'line', reps: l.reps, text: l.text, load: l.load, unit: l.unit, sub: false });
      }
      for (const sb of b.blocks ?? []) {
        if (sb.label) rows.push({ kind: 'label', text: sb.label, sub: true });
        for (const l of sb.lines ?? []) {
          rows.push({ kind: 'line', reps: l.reps, text: l.text, load: l.load, unit: l.unit, sub: true });
        }
      }
    }
    return rows;
  }

  editRoute(i: number): unknown[] {
    return ['/coach', 'classes', this.sessionId, 'build', 'piece', i];
  }

  metaLine(d: PieceDraft): string {
    const w = d.wod!;
    const parts = [d.macro];
    if (!d.scoreable) {
      parts.push(NOT_SCORED);
    } else if (w.timingPreset) {
      parts.push((PRESET_LABELS[w.timingPreset] ?? w.timingPreset).toLowerCase());
    } else {
      parts.push(this.scoreWord(d.scoreType ?? w.scoreType));
    }
    if (w.timeCapSeconds) parts.push(this.capText(w.timeCapSeconds));
    return parts.join(' · ');
  }

  private scoreWord(scoreType: string): string {
    switch (scoreType) {
      case 'TIME': return $localize`:@@class.score.time:time`;
      case 'ROUNDS_REPS': return $localize`:@@class.score.roundsReps:rounds+reps`;
      case 'LOAD': return $localize`:@@class.score.load:load`;
      default: return $localize`:@@class.score.completion:completion`;
    }
  }

  private capText(sec: number): string {
    const mm = Math.floor(sec / 60);
    const ss = (sec % 60).toString().padStart(2, '0');
    return $localize`:@@class.cap:cap ${mm}:mins::${ss}:secs:`;
  }

  macroLabel(m: string): string { return MACRO_LABELS[m] ?? m; }
  presetLabel(p: string): string { return PRESET_LABELS[p] ?? p; }

  // ---- expand / reorder / remove ------------------------------------------------------------

  toggleExpand(i: number) {
    this.expanded.update(cur => (cur === i ? null : i));
    // A confirm armed on the row being collapsed (or left behind for a different row) is a trap
    // otherwise -- it would sit hidden, still live, for the coach to walk back into later.
    this.confirmRemove.set(null);
  }

  reorder(ev: { from: number; to: number }) {
    this.store.drafts.update(ds => {
      const next = [...ds];
      const [moved] = next.splice(ev.from, 1);
      next.splice(ev.to, 0, moved);
      return next;
    });
  }

  removeAt(i: number) {
    this.store.drafts.update(ds => ds.filter((_, idx) => idx !== i));
    this.expanded.set(null);
    setTimeout(() => this.focusAfterRemove(i), 0);
  }

  cancelRemoveBlock() {
    this.confirmRemove.set(null);
  }

  confirmRemoveBlock(i: number) {
    this.confirmRemove.set(null);
    this.removeAt(i);
  }

  private focusAfterRemove(i: number) {
    const root = this.host.nativeElement;
    const el =
      root.querySelector<HTMLElement>(`[data-testid="piece-toggle-${i}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="slot-open-${i}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="piece-toggle-${i - 1}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="slot-open-${i - 1}"]`) ??
      root.querySelector<HTMLElement>('[data-testid="add-slot"]');
    el?.focus();
  }

  // ---- fill an empty slot ---------------------------------------------------------------------

  openSlot(i: number) {
    this.slotIndex.set(i);
    this.categoryFilter.set(this.store.drafts()[i]?.macro ?? '');
    this.typeFilter.set('');
    this.searchTerm.set('');
    this.slotStep.set('search');
    this.detailWod.set(null);
    this.slotSheetOpen.set(true);
  }

  onLibrarySearch(term: string) { this.searchTerm.set(term); }

  /** A tapped result no longer fills the slot -- it opens the detail step. `selectDetailWod()`
   *  below is the only path that actually fills it. */
  onSlotPicked(result: PickResult) {
    if ('freeText' in result) return; // allowFreeText is false for this sheet
    const w = this.library().find(x => x.id === result.id);
    if (!w) return;
    this.detailWod.set(w);
    this.slotStep.set('detail');
  }

  pickCategory(m: string) {
    this.categoryFilter.set(m);
    this.slotStep.set('search');
  }

  pickType(p: string) {
    this.typeFilter.set(p);
    this.slotStep.set('search');
  }

  selectDetailWod() {
    const w = this.detailWod();
    const i = this.slotIndex();
    this.closeSlotSheet();
    if (i === null || !w) return;
    const d = this.store.drafts()[i];
    this.store.put(i, { ...d, wod: w, fromLibraryWodId: w.id });
  }

  closeSlotSheet() {
    this.slotSheetOpen.set(false);
    this.slotStep.set('search');
    this.detailWod.set(null);
  }

  writeNewPiece() {
    const i = this.slotIndex();
    this.closeSlotSheet();
    if (i === null) return;
    this.goToEditor(['/coach', 'classes', this.sessionId, 'build', 'piece', i]);
  }

  editPiece(i: number) {
    this.goToEditor(this.editRoute(i));
  }

  /** The one route both entrances into the piece editor share -- see `toEditor` above. */
  private goToEditor(commands: unknown[]) {
    this.toEditor = true;
    this.router.navigate(commands).then(ok => { if (!ok) this.toEditor = false; });
  }

  // ---- add a slot -----------------------------------------------------------------------------

  appendSlot(macro: string) {
    this.store.drafts.update(ds => [...ds, {
      itemId: null, wod: null, fromLibraryWodId: null, label: this.macroLabel(macro), macro,
      scoreable: true, scoreType: null,
    }]);
    this.addSlotOpen.set(false);
  }

  // ---- save -------------------------------------------------------------------------------

  submit(ev: Event) {
    ev.preventDefault();
    this.doSave(true);
  }

  saveDraft() { this.doSave(false); }

  /** `onSaved` runs only on a successful save -- the copy sheet's "save first" path (below) hooks
   *  in here rather than duplicating this save. */
  private doSave(publish: boolean, onSaved?: () => void) {
    if (this.saving()) return;
    const drafts = this.store.drafts();
    if (drafts.every(d => d.wod === null && d.fromLibraryWodId === null)) {
      this.formError.set($localize`:@@class.save.emptyError:Add at least one piece.`);
      return;
    }
    this.formError.set('');
    this.saving.set(true);

    const items: ItemInput[] = drafts
      .filter(d => d.wod || d.fromLibraryWodId)
      .map(d => ({
        id: d.itemId,
        wodId: d.fromLibraryWodId ? null : d.wod!.id,
        fromLibraryWodId: d.fromLibraryWodId,
        scoreable: d.scoreable,
        scoreType: d.scoreType ?? undefined,
      }));

    this.prog.putItems(this.sessionId, items).pipe(
      switchMap(() => publish ? this.prog.publishProgramming(this.sessionId, 'PUBLISHED') : of(null)),
      switchMap(() => this.prog.sessionItems(this.sessionId)),
    ).subscribe({
      next: freshItems => {
        // The server only returns FILLED pieces -- empty slots aren't sent, so a straight
        // rebuild from the response would drop them. Zip the filled drafts back in positionally
        // (they were sent in order and come back in order) and leave empty ones untouched.
        const current = this.store.drafts();
        const filledCount = current.filter(d => !this.isEmpty(d)).length;
        let k = 0;
        const merged = freshItems.length >= filledCount
          ? current.map(d => (this.isEmpty(d) ? d : this.toDraft(freshItems[k++])))
          : freshItems.map(i => this.toDraft(i));
        this.openDrafts(merged);
        if (publish) this.published.set(true);
        this.saving.set(false);
        this.pendingRetry = null;
        this.banner.set({
          tone: 'good',
          message: publish
            ? $localize`:@@class.save.publishedOk:Class published`
            : $localize`:@@class.save.ok:Saved`,
        });
        onSaved?.();
      },
      error: () => {
        this.saving.set(false);
        const msg = $localize`:@@class.save.error:Couldn't save — your pieces are still here, try again.`;
        this.formError.set(msg);
        this.pendingRetry = () => this.doSave(publish, onSaved);
        this.banner.set({ tone: 'danger', message: msg, actionLabel: $localize`:@@class.save.retry:Retry` });
      },
    });
  }

  /** Bound to the failed-save banner's action -- re-runs whichever save (draft or publish) just
   *  failed. The component doesn't dismiss the banner on action press; the next outcome replaces
   *  it either way. */
  retryLastSave() {
    this.pendingRetry?.();
  }

  // ---- copy to the day's other classes -----------------------------------------------------

  /** The disabled attribute guards one path only (Enter still submits a form regardless of a
   *  button's [disabled]) -- this guard is what actually stops the copy. */
  openCopySheet() {
    if (this.copyDisabledReason()) return;
    if (this.hasUnsaved()) {
      // Copying now would copy the last SAVED state, silently dropping whatever's unsaved --
      // save first (this class's own publish state, unchanged), then open on the fresh content.
      this.doSave(this.published(), () => this.beginCopySheet());
    } else {
      this.beginCopySheet();
    }
  }

  private beginCopySheet() {
    const targets = this.dayTargets();
    if (!targets.length) return;
    this.copyError.set('');
    this.copyTargets.set(targets.map(session => ({ session, itemCount: null, failed: false, checked: false })));
    this.copyOpen.set(true);
    for (const session of targets) {
      this.prog.sessionItems(session.id).subscribe({
        next: items => this.copyTargets.update(ts => ts.map(t =>
          t.session.id === session.id ? { ...t, itemCount: items.length, checked: items.length === 0 } : t)),
        // Unknown stays unticked and says so -- never silently treated as empty.
        error: () => this.copyTargets.update(ts => ts.map(t =>
          t.session.id === session.id ? { ...t, failed: true, checked: false } : t)),
      });
    }
  }

  toggleCopyTarget(sessionId: string) {
    this.copyTargets.update(ts => ts.map(t => (t.session.id === sessionId ? { ...t, checked: !t.checked } : t)));
  }

  closeCopySheet() {
    this.copyOpen.set(false);
    this.copyTargets.set([]);
    this.copyError.set('');
  }

  confirmCopy() {
    if (this.copyBusy()) return;
    const ticked = this.copyTargets().filter(t => t.checked);
    if (!ticked.length) return;
    const items: ItemInput[] = this.store.drafts()
      .filter(d => !this.isEmpty(d))
      .map(d => ({ id: null, wodId: null, fromLibraryWodId: d.wod!.id, scoreable: d.scoreable, scoreType: d.scoreType ?? undefined }));
    if (!items.length) return;
    const publish = this.published();

    this.copyBusy.set(true);
    this.copyError.set('');

    const writes = ticked.map(t => this.prog.putItems(t.session.id, items).pipe(
      switchMap(() => (publish ? this.prog.publishProgramming(t.session.id, 'PUBLISHED') : of(null))),
      map(() => ({ target: t, ok: true as const })),
      catchError(() => of({ target: t, ok: false as const })),
    ));

    forkJoin(writes).subscribe(results => {
      this.copyBusy.set(false);
      const succeeded = new Set(results.filter(r => r.ok).map(r => r.target.session.id));
      // Only the ones that actually wrote leave the list -- a failure stays so the coach can retry it.
      this.copyTargets.update(ts => ts.filter(t => !succeeded.has(t.session.id)));
      const failed = results.filter(r => !r.ok);
      if (failed.length) {
        const names = failed.map(r => formatDate(r.target.session.startAt, 'HH:mm', this.locale)).join(', ');
        const msg = $localize`:@@class.copyDay.partialFail:Couldn't copy to ${names}:times: — try again.`;
        this.copyError.set(msg);
        this.pendingRetry = null;
        this.banner.set({ tone: 'danger', message: msg });
      } else {
        this.banner.set({ tone: 'good', message: this.copyOkMessage(results.length) });
        this.pendingRetry = null;
        this.closeCopySheet();
      }
    });
  }

  /** Same wording the old inline "Copied to N classes" line used, split one/other the way
   *  `conversations.page.ts`'s `unreadAriaLabel` does -- $localize takes plain interpolation,
   *  not an ICU plural, outside a template. */
  private copyOkMessage(n: number): string {
    if (n === 1) return $localize`:@@class.copyDay.ok.one:Copied to 1 class`;
    return $localize`:@@class.copyDay.ok.many:Copied to ${n}:count: classes`;
  }
}

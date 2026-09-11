import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, computed, inject, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { BookingService, SessionDetail } from '../booking/booking.service';
import {
  ProgrammingService, Wod, MACROS, TIMING_PRESETS, ItemInput, SessionItem,
} from '../programming/programming.service';
import { ClassDraftStore, PieceDraft } from '../programming/class-draft.store';
import { PickSheetComponent, PickRow, PickResult } from '../programming/pick-sheet.component';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { EmptyComponent } from '../../ui/empty.component';
import { SheetComponent } from '../../ui/sheet.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
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
    SegmentedComponent, SortableListComponent, PickSheetComponent,
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
                  <span class="pill volt" data-testid="status-live" i18n="@@class.status.live">LIVE</span>
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
                            @if (expandedRows(d); as rows) {
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
                              <a class="editlink" [routerLink]="editRoute(i)"
                                 [attr.data-testid]="'piece-edit-' + i">
                                <span i18n="@@class.piece.edit">Edit this piece</span> &#x203A;
                              </a>
                              <bh-button variant="danger" size="sm" (click)="removeAt(i)"
                                         [testId]="'piece-remove-' + i">
                                <span i18n="@@class.piece.remove">Remove</span>
                              </bh-button>
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
                @if (savedOk()) {
                  <p role="status" data-testid="stack-saved-ok" i18n="@@class.save.ok">Saved</p>
                }
                <bh-button type="submit" variant="strong" size="lg" class="full"
                           [loading]="saving()" testId="save-publish">
                  <span i18n="@@class.save.publish">Save and publish</span>
                </bh-button>
                <bh-button type="button" variant="ghost" [disabled]="saving()" (click)="saveDraft()"
                           testId="save-draft">
                  <span i18n="@@class.save.draft">Save draft</span>
                </bh-button>
              </footer>
            </form>

            <bh-pick-sheet [open]="slotSheetOpen()" [rows]="filteredLibraryRows()"
                           [allowFreeText]="false"
                           title="Fill this slot" i18n-title="@@class.slot.sheetTitle"
                           (search)="onLibrarySearch($event)" (picked)="onSlotPicked($event)"
                           (closed)="closeSlotSheet()">
              <div sheetFilters>
                <bh-segmented [options]="categoryOptions" [(value)]="categoryFilter" tone="bone"
                               [wrap]="true" label="Category" i18n-label="@@class.slot.filterCategory" />
                <bh-segmented [options]="typeOptions" [(value)]="typeFilter" tone="bone"
                               [wrap]="true" label="Type" i18n-label="@@class.slot.filterType" />
              </div>
              <button type="button" sheetLead class="writenew" data-testid="slot-write-new"
                      (click)="writeNewPiece()">
                <span i18n="@@class.slot.writeNew">＋ Write a new piece</span>
              </button>
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
          }
        }
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
    /* The DRAFT/LIVE pill is this screen's one volt element, and only while LIVE -- law §5. */
    .pill { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 3px 8px; border: 1px solid var(--hairline);
      border-radius: var(--r-full); color: var(--faint); }
    .pill.volt { background: var(--volt); color: var(--on-volt); border-color: var(--volt); }
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
      color: var(--bone-dim); text-decoration: none; font-size: var(--fs-sm); }
    .editlink:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-xs); }

    .addslot { width: 100%; min-height: var(--tap-lg); margin: var(--sp-3) 0; background: none;
      border: 1px dashed var(--hairline); border-radius: var(--r-ctl); color: var(--bone-dim);
      font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; cursor: pointer; }
    .addslot:hover { color: var(--bone); border-color: var(--bone-dim); }
    .addslot:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .foot { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-5); }
    .full { width: 100%; }

    /* ---- fill-slot sheet: lead row + segmented filters ------------------------------------- */
    .writenew { display: flex; align-items: center; width: 100%; box-sizing: border-box;
      min-height: var(--tap); padding: var(--sp-2); background: none; border: none;
      border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; cursor: pointer; }
    .writenew:hover { background: var(--surface-2); }
    .writenew:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    /* ---- add-a-slot sheet: four full-width plain-verb rows --------------------------------- */
    .slotrows { display: flex; flex-direction: column; }
    .macrorow { width: 100%; box-sizing: border-box; min-height: var(--tap-lg); padding: 0 var(--sp-2);
      background: none; border: none; border-bottom: 1px solid var(--hairline); color: var(--bone);
      text-align: left; font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500;
      cursor: pointer; }
    .slotrows .macrorow:last-child { border-bottom: none; }
    .macrorow:hover { background: var(--surface-2); }
    .macrorow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  `],
})
export class ClassBuilderPage implements OnInit, HasUnsaved {
  private booking = inject(BookingService);
  private prog = inject(ProgrammingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(ClassDraftStore);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly macros = MACROS;

  sessionId = '';
  detail = signal<SessionDetail | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  published = signal(false);
  library = signal<Wod[]>([]);

  drafts = this.store.drafts;
  expanded = signal<number | null>(null);

  slotSheetOpen = signal(false);
  slotIndex = signal<number | null>(null);
  searchTerm = signal('');
  categoryFilter = signal('');
  typeFilter = signal('');

  addSlotOpen = signal(false);

  saving = signal(false);
  savedOk = signal(false);
  formError = signal('');

  categoryOptions: SegOption[] = [
    { value: '', label: ANY_LABEL },
    ...MACROS.map(m => ({ value: m, label: MACRO_LABELS[m] })),
  ];
  typeOptions: SegOption[] = [
    { value: '', label: ANY_LABEL },
    ...TIMING_PRESETS.map(p => ({ value: p, label: PRESET_LABELS[p] })),
  ];

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
      .map(w => ({
        id: w.id, primary: w.title,
        secondary: w.timingPreset
          ? `${MACRO_LABELS[w.macro] ?? w.macro} · ${PRESET_LABELS[w.timingPreset] ?? w.timingPreset}`
          : (MACRO_LABELS[w.macro] ?? w.macro),
      }));
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent) { if (this.hasUnsaved()) ev.preventDefault(); }

  private snapshot(): string { return JSON.stringify(this.store.drafts()); }
  hasUnsaved(): boolean { return this.state() === 'ready' && this.snapshot() !== this.store.baseline(); }

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
        if (this.store.holds(this.sessionId)) {
          this.state.set('ready');
        } else {
          this.loadItems(d);
        }
      },
      error: () => this.state.set('error'),
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
   *  when the piece has no blocks -- the caller falls back to the legacy `bodyText`. */
  expandedRows(d: PieceDraft): ExpandedRow[] {
    const blocks = d.wod?.blocks?.blocks ?? [];
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

  // ---- expand / reorder / remove ------------------------------------------------------------

  toggleExpand(i: number) {
    this.expanded.update(cur => (cur === i ? null : i));
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
    this.slotSheetOpen.set(true);
  }

  onLibrarySearch(term: string) { this.searchTerm.set(term); }

  onSlotPicked(result: PickResult) {
    this.slotSheetOpen.set(false);
    const i = this.slotIndex();
    if (i === null || 'freeText' in result) return;
    const w = this.library().find(x => x.id === result.id);
    if (!w) return;
    const d = this.store.drafts()[i];
    this.store.put(i, { ...d, wod: w, fromLibraryWodId: result.id });
  }

  closeSlotSheet() { this.slotSheetOpen.set(false); }

  writeNewPiece() {
    const i = this.slotIndex();
    this.slotSheetOpen.set(false);
    if (i === null) return;
    this.router.navigate(['/coach', 'classes', this.sessionId, 'build', 'piece', i]);
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

  private doSave(publish: boolean) {
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
        this.savedOk.set(true);
        setTimeout(() => this.savedOk.set(false), 2500);
      },
      error: () => {
        this.saving.set(false);
        this.formError.set($localize`:@@class.save.error:Couldn't save — your pieces are still here, try again.`);
      },
    });
  }
}

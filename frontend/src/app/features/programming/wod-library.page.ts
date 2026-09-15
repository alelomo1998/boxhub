import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, LOCALE_ID, afterNextRender,
  computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatDate } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, map, switchMap } from 'rxjs';
import { AlertComponent } from '../../ui/alert.component';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { FilterFacet, FilterSheetComponent, FilterStepDirective, FilterValue } from '../../ui/filter-sheet.component';
import { IconComponent } from '../../ui/icon.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SheetComponent } from '../../ui/sheet.component';
import { DayTone, WeekCalendarComponent } from '../../ui/week-calendar.component';
import { PieceCardComponent } from './piece-card.component';
import { LibraryEntry, LibraryQuery, MACROS, Movement, ProgrammingService, TIMING_PRESETS, WodHistoryRow } from './programming.service';
import {
  BENCHMARK_KIND_LABELS, ExpandedRow, expandedRows, eyebrowFor, MACRO_LABELS, PRESET_LABELS, SCORE_TYPE_LABELS,
} from './prescription';

type Load = 'loading' | 'ready' | 'error';

/**
 * The WOD library (M14c-b, spec §8 rev.1: D13-D22). One tab over a paged, filtered read of the
 * box's saved pieces or the global benchmarks, and a History tab keyed to the week strip's day.
 * Cards lead with the prescription because a coach knows a workout by its movements before its
 * name (spec D10).
 */
@Component({
  selector: 'bh-wod-library',
  standalone: true,
  imports: [RouterLink, AlertComponent, ButtonComponent, EmptyComponent, FilterSheetComponent,
    FilterStepDirective, IconComponent, SearchBarComponent, SegmentedComponent, SheetComponent,
    WeekCalendarComponent, PieceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lib">
      <!-- D13: no visible title -- the landmark is kept for a screen reader, never rendered. -->
      <h1 class="sr" i18n="@@library.title">Library</h1>

      <bh-segmented [options]="tabs" [(value)]="tab" [stretch]="true"
                    label="Library view" i18n-label="@@library.tabs.label" tone="bone" />

      @if (tab() === 'library') {
        <div class="toolsrow">
          <bh-search-bar [placeholder]="searchPlaceholder" label="Search pieces" i18n-label="@@library.search.label"
                         testId="lib-search" [stretch]="true" [value]="query()" (search)="onSearch($event)" />
          <button type="button" class="iconbtn" [attr.aria-label]="filterAriaLabel()"
                  data-testid="lib-filter" (click)="openFilters()">
            <bh-icon name="filter" />
            @if (activeFilterCount()) { <span class="badge">{{ activeFilterCount() }}</span> }
          </button>
          <!-- D14: the one volt element on this screen -- a coach's one action here is starting a
               new piece. -->
          <bh-button variant="primary" [label]="newPieceLabel" route="/coach/wods/new" testId="lib-new">
            <bh-icon name="plus" />
          </bh-button>
        </div>

        <div class="chiprow">
          <button type="button" class="chip" [attr.aria-pressed]="benchmarksOn()"
                  data-testid="lib-benchmarks-chip" (click)="toggleBenchmarks()">
            <span i18n="@@library.benchmarksChip">Benchmarks</span>
          </button>
          @for (c of activeChips(); track c.key + ':' + c.value) {
            <button type="button" class="chip fchip" [attr.data-testid]="'chip-remove-' + c.key + '-' + c.value"
                    [attr.aria-label]="removeChipAriaLabel(c.label)" (click)="removeChip(c.key, c.value)">
              <span>{{ c.label }}</span>
              <bh-icon name="x" [size]="14" />
            </button>
          }
          @if (shortSearchHint()) {
            <p class="hint" aria-live="polite" i18n="@@library.search.shortHint">Type at least 3 letters to search</p>
          }
        </div>

        @switch (libState()) {
          @case ('loading') { <p class="stateline" i18n="@@library.loading">Loading the library…</p> }
          @case ('error') {
            <bh-alert tone="danger" i18n="@@library.error">Couldn't load the library.</bh-alert>
            <bh-button variant="ghost" (click)="loadLibrary()" testId="lib-retry"><span i18n="@@library.retry">Try again</span></bh-button>
          }
          @default {
            @if (rows().length) {
              <ul class="grid" [class.refreshing]="refreshing()" [attr.aria-busy]="refreshing()">
                @for (e of rows(); track e.wod.id) {
                  <li>
                    @if (e.global) {
                      <button type="button" class="hit" (click)="openBenchmark(e)"
                              [attr.aria-labelledby]="'pc-title-' + e.wod.id" [attr.aria-describedby]="'pc-desc-' + e.wod.id"
                              [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="eyebrowFor(e.wod, e.benchmarkKind)" [benchmarkKind]="e.benchmarkKind" [weightUnit]="weightUnit()" />
                      </button>
                    } @else {
                      <a class="hit" [routerLink]="['/coach/wods', e.wod.id]"
                         [attr.aria-labelledby]="'pc-title-' + e.wod.id" [attr.aria-describedby]="'pc-desc-' + e.wod.id"
                         [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="eyebrowFor(e.wod, e.benchmarkKind)" [benchmarkKind]="e.benchmarkKind" [weightUnit]="weightUnit()" />
                      </a>
                    }
                  </li>
                }
              </ul>
              @if (nextCursor()) {
                <div #sentinel class="sentinel" data-testid="lib-sentinel"></div>
                @if (loadingMore()) { <p class="stateline" i18n="@@library.loadingMore">Loading more…</p> }
                @if (moreError()) {
                  <bh-alert tone="danger" i18n="@@library.moreError">Couldn't load more.</bh-alert>
                  <bh-button variant="ghost" (click)="loadMore()" testId="lib-more-retry"><span i18n="@@library.retry">Try again</span></bh-button>
                }
              }
            } @else {
              <bh-empty icon="search" [title]="noMatchTitle()">
                <bh-button variant="ghost" testId="lib-clear-nomatch" (click)="clearNoMatch()">
                  <span>{{ clearNoMatchLabel() }}</span>
                </bh-button>
              </bh-empty>
            }
          }
        }
      } @else {
        <bh-week-calendar [jump]="true" [min]="-3650" [max]="0" [(offset)]="historyOffset"
                          [tones]="historyDayTones()" [toneWords]="historyToneWords" />
        @switch (histState()) {
          @case ('loading') { <p class="stateline" i18n="@@library.history.loading">Loading history…</p> }
          @case ('error') {
            <bh-alert tone="danger" i18n="@@library.history.error">Couldn't load the history.</bh-alert>
            <bh-button variant="ghost" (click)="loadHistory(historyDay())" testId="hist-retry"><span i18n="@@library.retry">Try again</span></bh-button>
          }
          @default {
            @if (histRows().length) {
              <ul class="grid">
                @for (r of histRows(); track r.itemId) {
                  <li>
                    <a class="hit" [routerLink]="['/coach/classes', r.sessionId, 'build']"
                       [attr.aria-labelledby]="'pc-title-' + r.wod.id" [attr.aria-describedby]="'pc-desc-' + r.wod.id"
                       [attr.data-testid]="'hist-card-' + r.itemId">
                      <bh-piece-card [wod]="r.wod" [eyebrow]="histMeta(r)" [weightUnit]="weightUnit()" />
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <bh-empty icon="calendar" title="No class ran a piece on this day" i18n-title="@@library.history.dayEmpty" />
            }
          }
        }
      }
    </section>

    <bh-sheet [open]="!!bench()" [title]="bench()?.wod?.title ?? ''" label="Benchmark" i18n-label="@@library.bench.aria"
              (closed)="closeBenchmark()">
      @if (bench(); as b) {
        <div class="btop">
          <span class="eyebrow">
            @if (b.benchmarkKind) {
              <span class="bchip" i18n="@@library.card.benchmark">Benchmark</span>
              <span>{{ benchKindLabel() }}</span>
            }
            <span>{{ eyebrowFor(b.wod, b.benchmarkKind) }}</span>
          </span>
          @if (benchScoreLabel()) { <span class="bscore">{{ benchScoreLabel() }}</span> }
        </div>
        <div class="rx">
          @for (r of benchRows(); track $index) {
            @if (r.kind === 'label') {
              <p class="blocklabel" [class.sub]="r.sub">{{ r.text }}</p>
            } @else if (r.kind === 'line') {
              <p class="rxline" [class.sub]="r.sub">
                @if (r.reps) { <span class="mono">{{ r.reps }}{{ r.unit && r.unit !== 'REPS' ? ' ' + r.unit.toLowerCase() : '' }}</span> }
                <span>{{ r.text }}</span>
                @if (r.load) {
                  <span class="mono">({{ r.load }}{{ benchWeightSuffix() }})</span>
                }
              </p>
            } @else {
              <p class="blocknote" [class.sub]="r.sub">{{ r.text }}</p>
            }
          }
        </div>
        @if (addError()) { <bh-alert tone="danger" i18n="@@library.bench.addError">That did not add — try again.</bh-alert> }
        <bh-button variant="strong" size="lg" class="full" [loading]="adding()" (click)="addBenchmark()" testId="bench-add">
          <span i18n="@@library.bench.add">Add to library</span>
        </bh-button>
      }
    </bh-sheet>

    <bh-filter-sheet [open]="filterOpen()" [facets]="filterFacets" [(value)]="filters"
                     [count]="draftCount()" [summaries]="filterSummaries()"
                     title="Filters" i18n-title="@@library.filter.sheetTitle"
                     (draftChange)="onDraftChange($event)" (stepChange)="onFilterStep($event)" (closed)="filterOpen.set(false)">
      <ng-template bhFilterStep="movement" let-values let-set="set">
        <bh-search-bar placeholder="Movement name" i18n-placeholder="@@library.filter.movement.placeholder"
                       label="Search movements" i18n-label="@@library.filter.movement.searchLabel"
                       testId="filter-movement-search" [value]="movementTerm()" (search)="onMovementSearch($event)" />
        @if (movementTerm().trim().length < 2) {
          @if (values.length) {
            <ul class="mrows">
              @for (id of values; track id) {
                <li>
                  <button type="button" class="prow sel" aria-pressed="true"
                          [attr.data-testid]="'filter-movement-' + id" (click)="toggleMovement(id, values, set)">
                    <span>{{ movementName(id) }}</span>
                    <span class="mark" aria-hidden="true">&#x2713;</span>
                  </button>
                </li>
              }
            </ul>
          }
        } @else if (movementRows().length) {
          <ul class="mrows">
            @for (m of movementRows(); track m.id) {
              <li>
                <button type="button" class="prow" [class.sel]="values.includes(m.id)"
                        [attr.aria-pressed]="values.includes(m.id)"
                        [attr.data-testid]="'filter-movement-' + m.id" (click)="toggleMovement(m.id, values, set)">
                  <span>{{ m.name }}</span>
                  @if (values.includes(m.id)) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="stateline" i18n="@@library.filter.movement.noMatch">No movements match.</p>
        }
      </ng-template>
    </bh-filter-sheet>
  `,
  styles: [`
    .lib { display: flex; flex-direction: column; gap: var(--sp-4); }
    /* Visually-hidden landmark -- same idiom as bh-week-calendar's own .sr. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .toolsrow { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
    .toolsrow bh-search-bar { flex: 1 1 160px; min-width: 0; }
    .iconbtn { position: relative; display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0; min-width: var(--tap); min-height: var(--tap); background: var(--surface);
      color: var(--bone); border: 1px solid var(--hairline); border-radius: var(--r-full); cursor: pointer; }
    .iconbtn:hover { background: var(--surface-2); }
    .iconbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .badge { position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 3px;
      display: flex; align-items: center; justify-content: center; border-radius: var(--r-full);
      background: var(--bone); color: var(--on-bone); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-variant-numeric: tabular-nums; }
    .chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
    /* F3: the short-search hint rides the chip row's own line -- margin-left: auto pushes it to
       the end when the row has room, and it wraps under the chips like any other flex item when
       it doesn't, so it never adds vertical space on its own. */
    .hint { margin: 0 0 0 auto; color: var(--bone-dim); font-size: var(--fs-sm); }
    .chip { align-self: flex-start; display: inline-flex; align-items: center; min-height: var(--tap);
      padding: 0 var(--sp-3); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-full); color: var(--bone); font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); cursor: pointer; }
    .chip[aria-pressed="true"] { background: var(--bone); color: var(--on-bone); border-color: var(--bone); }
    .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .chip[aria-pressed="true"]:focus-visible { outline-color: var(--focus-inv); }
    /* F2: a removable filter chip -- same shape as Benchmarks, plus its x icon. */
    .fchip { gap: var(--sp-1); }
    .fchip bh-icon { color: var(--bone-dim); }
    .fchip:hover { background: var(--surface-2); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-3); }
    @media (min-width: 768px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1280px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    /* F1: a search/filter refresh dims the existing rows instead of replacing them with the
       loading line -- only a first load (no rows yet) shows that line. */
    .grid.refreshing { opacity: 0.5; transition: opacity var(--dur) var(--ease-out); }
    @media (prefers-reduced-motion: reduce) { .grid.refreshing { transition: none; } }
    .hit { display: block; height: 100%; min-height: var(--tap); width: 100%; padding: 0; text-align: left;
      background: none; border: 0; color: inherit; text-decoration: none; border-radius: var(--r-card); cursor: pointer; }
    .hit:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .sentinel { height: 1px; }
    /* ---- benchmark sheet: eyebrow row mirrors bh-piece-card's .top/.eyebrow/.chip/.score, under
       different class names since .chip is already the Benchmarks filter toggle on this page. */
    .btop { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3);
      margin-bottom: var(--sp-2); }
    .eyebrow, .bscore { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      text-transform: uppercase; letter-spacing: 0.06em; }
    .eyebrow { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; min-width: 0; }
    .bchip { color: var(--bone); border: 1px solid var(--hairline); border-radius: var(--edge); padding: 0 var(--sp-1); }
    .rx { display: flex; flex-direction: column; gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .blocklabel { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
    .blocklabel:first-child { margin-top: 0; }
    .blocklabel.sub { padding-left: var(--sp-3); }
    .blocknote { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.08em; color: var(--bone-dim); }
    .blocknote:first-child { margin-top: 0; }
    .blocknote.sub { padding-left: var(--sp-3); }
    .rxline { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2); margin: 0;
      font-size: var(--fs-sm); color: var(--bone); }
    .rxline.sub { padding-left: var(--sp-3); }
    .rxline .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums;
      color: var(--bone-dim); flex-shrink: 0; }
    .stateline { color: var(--bone-dim); }
    .mrows { list-style: none; margin: var(--sp-2) 0 0; padding: 0; display: flex; flex-direction: column; }
    .prow { display: flex; align-items: center; justify-content: space-between; width: 100%;
      box-sizing: border-box; min-height: var(--tap); padding: 0 var(--sp-2); background: none;
      border: none; border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; }
    .mrows li:last-child .prow { border-bottom: none; }
    .prow:hover { background: var(--surface-2); }
    .prow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .prow.sel { font-weight: 700; }
    .mark { color: var(--bone); font-weight: 700; }
  `],
})
export class WodLibraryPage {
  private prog = inject(ProgrammingService);
  private router = inject(Router);
  private locale = inject(LOCALE_ID);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  readonly tabs: SegOption[] = [
    { value: 'library', label: $localize`:@@library.tabs.library:Library` },
    { value: 'history', label: $localize`:@@library.tabs.history:History` },
  ];
  readonly searchPlaceholder = $localize`:@@library.search.placeholder:Name or movement`;
  readonly newPieceLabel = $localize`:@@library.new.label:New piece`;
  readonly eyebrowFor = eyebrowFor;

  readonly filterFacets: FilterFacet[] = [
    { key: 'movement', label: $localize`:@@library.filter.movement:Movement`, mode: 'multi' },
    { key: 'category', label: $localize`:@@library.filter.category:Category`, mode: 'single',
      options: MACROS.map(m => ({ value: m, label: MACRO_LABELS[m] })) },
    { key: 'timing', label: $localize`:@@library.filter.timing:Timing`, mode: 'single',
      options: TIMING_PRESETS.map(t => ({ value: t, label: PRESET_LABELS[t] })) },
    { key: 'kind', label: $localize`:@@library.filter.kind:Benchmark kind`, mode: 'multi',
      options: ['GIRL', 'HERO'].map(k => ({ value: k, label: BENCHMARK_KIND_LABELS[k] })) },
  ];

  tab = signal<'library' | 'history'>('library');
  query = signal('');
  weightUnit = signal<string | null>(null);

  // ---- Library tab: server-paged rows, filtered by the applied query + facets + Benchmarks chip.
  rows = signal<LibraryEntry[]>([]);
  nextCursor = signal<string | null>(null);
  libState = signal<Load>('loading');
  loadingMore = signal(false);
  moreError = signal(false);
  benchmarksOn = signal(false);
  filters = signal<FilterValue>({});
  /** F1: a search/filter refetch with rows already on screen dims them instead of swapping in the
   *  loading line -- only a genuine first load (no rows yet) uses libState('loading'). */
  refreshing = signal(false);

  private readonly sentinelEl = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer?: IntersectionObserver;
  private filtersInit = true;
  /** F1: a request token so a slow earlier libraryPage() response can never overwrite a newer
   *  one -- each loadLibrary() bumps it and its callbacks check it's still current before applying. */
  private loadSeq = 0;

  activeFilterCount = computed(() => Object.keys(this.filters()).length);
  /** F2: one chip per applied facet value, in filter-menu order -- Category/Timing (single) at
   *  most one each, then Movement and Benchmark kind (multi) one per picked value. Read from the
   *  APPLIED `filters()`, not the sheet's draft. */
  activeChips = computed(() => {
    const f = this.filters();
    const names = this.movementNames();
    const out: { key: string; value: string; label: string }[] = [];
    if (f['category']?.[0]) { const v = f['category'][0]; out.push({ key: 'category', value: v, label: MACRO_LABELS[v] ?? v }); }
    if (f['timing']?.[0]) { const v = f['timing'][0]; out.push({ key: 'timing', value: v, label: PRESET_LABELS[v] ?? v }); }
    for (const id of f['movement'] ?? []) out.push({ key: 'movement', value: id, label: names.get(id) ?? id });
    for (const k of f['kind'] ?? []) out.push({ key: 'kind', value: k, label: BENCHMARK_KIND_LABELS[k] ?? k });
    return out;
  });
  filterAriaLabel = computed(() => {
    const n = this.activeFilterCount();
    return n
      ? $localize`:@@library.filter.ariaWithCount:Filters, ${n}:count: active`
      : $localize`:@@library.filter.aria:Filters`;
  });
  noMatchTitle = computed(() => {
    const q = this.query().trim();
    return q
      ? $localize`:@@library.noMatch.title:Nothing matches “${q}:query:”`
      : $localize`:@@library.noMatch.titleGeneric:Nothing matches these filters`;
  });
  /** F3: 1-2 non-space characters is below the search floor (D18) -- the list is left alone, and
   *  this hint says why nothing changed. */
  shortSearchHint = computed(() => { const n = this.query().trim().length; return n === 1 || n === 2; });
  /** F4: the no-match empty state's one way out. Facets/Benchmarks win over search -- clearing
   *  those keeps the typed search text; with neither active, the button clears the search. */
  clearNoMatchLabel = computed(() => (this.activeFilterCount() > 0 || this.benchmarksOn())
    ? $localize`:@@library.noMatch.clearFilters:Clear filters`
    : $localize`:@@library.noMatch.clearSearch:Clear search`);

  // ---- Filter sheet: draft count is recomputed on open and on every draftChange, cancelling any
  // in-flight count with switchMap so a fast series of taps only ever shows the latest.
  filterOpen = signal(false);
  draftCount = signal<number | null>(null);
  private readonly counts$ = new Subject<FilterValue>();
  /** The sheet's DRAFT, not the applied `filters()` -- a summary must reflect what's picked before
   *  Apply, or every facet reads "Any" until you leave and reopen the sheet (R6b finding 1). Set
   *  in openFilters() and on every draftChange. */
  filterDraft = signal<FilterValue>({});

  movementTerm = signal('');
  movementRows = signal<Movement[]>([]);
  private readonly movementNames = signal<Map<string, string>>(new Map());
  filterSummaries = computed(() => {
    const out: Record<string, string> = {};
    const ids = this.filterDraft()['movement'] ?? [];
    if (!ids.length) return out;
    const names = this.movementNames();
    const labels = ids.map(id => names.get(id) ?? id);
    out['movement'] = labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
    return out;
  });

  // ---- History tab: the week strip picks a day; that day's pieces only (D19).
  historyOffset = signal(0);
  historyDay = computed(() => this.isoFromOffset(this.historyOffset()));
  /** F5: the visible week's Monday, as a computed (not a plain read of historyOffset) so the
   *  fetch effect below only fires on a WEEK change -- a same-week day tap produces the same
   *  string, and a computed's unchanged output never re-notifies its consumers. */
  private historyWeekStart = computed(() => this.weekRange(this.historyOffset()).from);
  histRows = signal<WodHistoryRow[]>([]);
  histState = signal<Load>('loading');
  /** F5: which days of the visible week ran a piece -- 'open' for a listed day, else the strip's
   *  own 'none' default. A failed fetch resets to {} rather than blocking the day list. */
  historyDayTones = signal<Record<string, DayTone>>({});
  readonly historyToneWords: Partial<Record<DayTone, string>> = {
    open: $localize`:@@library.history.tone.open:pieces ran`,
    none: $localize`:@@library.history.tone.none:nothing ran`,
  };

  // ---- Benchmark sheet (D8): unchanged from the first build.
  bench = signal<LibraryEntry | null>(null);
  benchRows = computed<ExpandedRow[]>(() => expandedRows(this.bench()?.wod ?? null));
  /** " kg" / " lb" for a load's mono suffix, "" when the box's weight unit isn't loaded yet --
   *  same fallback prescriptionLines already used for the card. */
  benchWeightSuffix = computed(() => { const u = this.weightUnit(); return u ? ' ' + u.toLowerCase() : ''; });
  benchKindLabel = computed(() => { const k = this.bench()?.benchmarkKind; return k ? BENCHMARK_KIND_LABELS[k] ?? k : ''; });
  /** Score type, then the cap in the class stack's own format ("cap 20:00") -- D8 asks for both. */
  benchScoreLabel = computed(() => {
    const w = this.bench()?.wod;
    if (!w) return '';
    const parts = [SCORE_TYPE_LABELS[w.scoreType] ?? ''];
    if (w.timeCapSeconds) {
      const mm = Math.floor(w.timeCapSeconds / 60);
      const ss = (w.timeCapSeconds % 60).toString().padStart(2, '0');
      parts.push($localize`:@@class.cap:cap ${mm}:mins::${ss}:secs:`);
    }
    return parts.filter(Boolean).join(' · ');
  });
  adding = signal(false);
  addError = signal(false);

  constructor() {
    this.loadLibrary();
    this.prog.weightUnit().subscribe({ next: u => this.weightUnit.set(u), error: () => {} });

    // Any applied-filter change resets rows and refetches page one. Skip the run the effect fires
    // at creation -- the constructor's loadLibrary() above already covers page one.
    effect(() => {
      const f = this.filters();
      if (this.filtersInit) { this.filtersInit = false; return; }
      if (f['kind']?.length) this.benchmarksOn.set(true); // D17: a kind pick turns the chip on.
      untracked(() => this.loadLibrary());
    });

    // History reloads whenever the selected day changes, but only while that tab is open.
    effect(() => {
      const t = this.tab();
      const day = this.historyDay();
      if (t === 'history') untracked(() => this.loadHistory(day));
    });

    // F5: the day-tone dots refetch only when the visible WEEK changes (weekStart is the same
    // string for every day in that week, so a same-week day tap doesn't refire this), and only
    // while History is open.
    effect(() => {
      const t = this.tab();
      this.historyWeekStart(); // tracked so a week change (not just any day change) refires this
      if (t === 'history') untracked(() => this.loadHistoryDays());
    });

    // Scroll paging: observe the sentinel after the grid, load the next page when it's visible.
    effect(() => {
      const el = this.sentinelEl()?.nativeElement;
      this.observer?.disconnect();
      this.observer = undefined;
      if (!el || typeof IntersectionObserver === 'undefined') return; // guard: absent in some test envs
      const obs = new IntersectionObserver(entries => {
        if (entries.some(en => en.isIntersecting)) this.loadMore();
      });
      obs.observe(el);
      this.observer = obs;
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());

    this.counts$.pipe(
      switchMap(v => this.prog.libraryPage({ ...this.queryFor(v), cursor: null })),
      map(p => p.total),
      takeUntilDestroyed(),
    ).subscribe(n => this.draftCount.set(n));
  }

  private isoFromOffset(offset: number): string {
    return this.dateIso(this.dateFromOffset(offset));
  }

  private dateFromOffset(offset: number): Date {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d;
  }

  private dateIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** F5: the Monday-Sunday range containing `offset`, local-calendar-date -- same Monday-first
   *  rule bh-week-calendar's own week() uses. */
  private weekRange(offset: number): { from: string; to: string } {
    const d = this.dateFromOffset(offset);
    const mondayIdx = (d.getDay() + 6) % 7; // JS Sunday=0 -> Monday-first index
    const monday = new Date(d); monday.setDate(d.getDate() - mondayIdx);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: this.dateIso(monday), to: this.dateIso(sunday) };
  }

  private queryFor(f: FilterValue): LibraryQuery {
    const q = this.query().trim();
    const benchmarks = this.benchmarksOn() || !!f['kind']?.length;
    return {
      q: q.length >= 3 ? q : undefined,
      macro: f['category']?.[0],
      timing: f['timing']?.[0],
      movement: f['movement']?.length ? f['movement'] : undefined,
      kind: f['kind']?.length ? f['kind'] : undefined,
      benchmarks: benchmarks || undefined,
    };
  }

  /** F1: rows already on screen stay (dimmed via `refreshing`) instead of being replaced by the
   *  loading line -- only a genuine first load (no rows yet) uses libState('loading'). `loadSeq`
   *  guards against a slower earlier response landing after a newer one. */
  loadLibrary() {
    const seq = ++this.loadSeq;
    const firstLoad = this.rows().length === 0;
    if (firstLoad) { this.libState.set('loading'); this.nextCursor.set(null); } else { this.refreshing.set(true); }
    this.moreError.set(false);
    this.prog.libraryPage(this.queryFor(this.filters())).subscribe({
      next: p => {
        if (seq !== this.loadSeq) return; // a newer loadLibrary() has already landed
        this.rows.set(p.rows); this.nextCursor.set(p.nextCursor); this.libState.set('ready'); this.refreshing.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.libState.set('error'); this.refreshing.set(false);
      },
    });
  }

  loadMore() {
    // ponytail: refreshing() also blocks scroll-paging -- a refresh is about to replace every row
    // (and its cursor) anyway, so a page-2 fetch mid-refresh would race the stale cursor against
    // the new filters. The grid+sentinel now stay mounted during a refresh (F1), so this guard is
    // new here; it wasn't needed while a refresh unmounted the sentinel via libState('loading').
    if (this.loadingMore() || this.refreshing() || !this.nextCursor()) return;
    this.loadingMore.set(true);
    this.moreError.set(false);
    this.prog.libraryPage({ ...this.queryFor(this.filters()), cursor: this.nextCursor() }).subscribe({
      next: p => { this.rows.update(r => [...r, ...p.rows]); this.nextCursor.set(p.nextCursor); this.loadingMore.set(false); },
      error: () => { this.loadingMore.set(false); this.moreError.set(true); },
    });
  }

  /** The page ignores 1-2 character terms (list unchanged); >=3 sends q; an emptied field reloads
   *  the unfiltered list (spec §8.3, D18's server-side floor). */
  onSearch(v: string) {
    this.query.set(v);
    const len = v.trim().length;
    if (len === 1 || len === 2) return;
    this.loadLibrary();
  }

  toggleBenchmarks() {
    this.benchmarksOn.update(on => !on);
    this.loadLibrary();
  }

  removeChipAriaLabel(label: string): string {
    return $localize`:@@library.filter.removeChip:Remove filter: ${label}:label:`;
  }

  /** F2: drops one value from one facet (the filters effect refetches). Focus moves to whatever
   *  chip now sits at the removed one's position, or the filter button once none are left. */
  removeChip(key: string, value: string) {
    const idx = this.activeChips().findIndex(c => c.key === key && c.value === value);
    const next = (this.filters()[key] ?? []).filter(v => v !== value);
    const updated = { ...this.filters() };
    if (next.length) updated[key] = next; else delete updated[key];
    this.filters.set(updated);
    // afterNextRender, not setTimeout: a timeout can run before the removed chip leaves the DOM,
    // focusing a node that is then destroyed -- focus fell to body on the live stack.
    afterNextRender(() => {
      const chips = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-testid^="chip-remove-"]');
      if (chips.length) chips[Math.min(idx, chips.length - 1)].focus();
      else this.host.nativeElement.querySelector<HTMLElement>('[data-testid="lib-filter"]')?.focus();
    }, { injector: this.injector });
  }

  /** F4: the no-match empty state's one way out -- clears search too, whichever branch: leaving
   *  the search text behind a "Clear filters" tap still shows nothing on 2+ char terms. Setting
   *  `query` directly (not `onSearch`, which would refetch on its own) keeps this to the ONE
   *  refetch the filters effect already fires. Either way focus lands back on the search field. */
  clearNoMatch() {
    if (this.activeFilterCount() > 0 || this.benchmarksOn()) {
      this.benchmarksOn.set(false);
      this.query.set('');
      this.filters.set({}); // the filters effect refetches
    } else {
      this.onSearch('');
    }
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[data-testid="lib-search"]')?.focus());
  }

  openFilters() {
    this.draftCount.set(null);
    this.filterDraft.set(this.filters());
    this.movementTerm.set('');
    this.movementRows.set([]);
    this.counts$.next(this.filters());
    this.filterOpen.set(true);
  }

  onDraftChange(v: FilterValue) {
    this.draftCount.set(null);
    this.filterDraft.set(v);
    this.counts$.next(v);
  }

  onMovementSearch(term: string) {
    this.movementTerm.set(term);
    const t = term.trim();
    if (t.length < 2) { this.movementRows.set([]); return; }
    this.prog.movements(t).subscribe({
      next: ms => {
        this.movementRows.set(ms);
        this.movementNames.update(map => {
          const next = new Map(map);
          for (const m of ms) next.set(m.id, m.name);
          return next;
        });
      },
      error: () => this.movementRows.set([]),
    });
  }

  toggleMovement(id: string, values: string[], set: (v: string[]) => void) {
    set(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  }

  /** Each visit to the Movement step starts from a blank search listing what is already picked;
   *  within a visit the results stay, so several movements can be ticked in a row. */
  onFilterStep(step: string | null) {
    if (step !== 'movement') return;
    this.movementTerm.set('');
    this.movementRows.set([]);
  }

  movementName(id: string): string {
    return this.movementNames().get(id) ?? id;
  }

  loadHistory(day: string) {
    this.histState.set('loading');
    this.prog.wodHistory(day).subscribe({
      next: rows => { this.histRows.set(rows); this.histState.set('ready'); },
      error: () => this.histState.set('error'),
    });
  }

  /** F5: which days of the visible Monday-Sunday week ran a piece. Never blocks the day list --
   *  a failed fetch just resets the dots to none for that week rather than erroring. */
  loadHistoryDays() {
    const { from, to } = this.weekRange(this.historyOffset());
    this.prog.historyDays(from, to).subscribe({
      next: days => {
        const tones: Record<string, DayTone> = {};
        for (const iso of days) tones[iso] = 'open';
        this.historyDayTones.set(tones);
      },
      error: () => this.historyDayTones.set({}),
    });
  }

  /** "CrossFit 06:00 · Workout". Browser-local time, as classes.page's date:'HH:mm' does. */
  histMeta(r: WodHistoryRow): string {
    return `${r.className} ${formatDate(r.startAt, 'HH:mm', this.locale)} · ${MACRO_LABELS[r.wod.macro] ?? r.wod.macro}`;
  }

  openBenchmark(e: LibraryEntry) { this.addError.set(false); this.bench.set(e); }
  closeBenchmark() { if (!this.adding()) this.bench.set(null); }

  addBenchmark() {
    const b = this.bench();
    if (!b || this.adding()) return;
    this.adding.set(true);
    this.addError.set(false);
    this.prog.cloneBenchmark(b.wod.id).subscribe({
      next: w => { this.adding.set(false); this.bench.set(null); this.router.navigate(['/coach/wods', w.id]); },
      error: () => { this.adding.set(false); this.addError.set(true); },
    });
  }
}

import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, LOCALE_ID,
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
import { WeekCalendarComponent } from '../../ui/week-calendar.component';
import { PieceCardComponent } from './piece-card.component';
import { LibraryEntry, LibraryQuery, MACROS, Movement, ProgrammingService, TIMING_PRESETS, WodHistoryRow } from './programming.service';
import { BENCHMARK_KIND_LABELS, libMeta, MACRO_LABELS, prescriptionLines, PRESET_LABELS } from './prescription';

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
                         testId="lib-search" [value]="query()" (search)="onSearch($event)" />
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

        <button type="button" class="chip" [attr.aria-pressed]="benchmarksOn()"
                data-testid="lib-benchmarks-chip" (click)="toggleBenchmarks()">
          <span i18n="@@library.benchmarksChip">Benchmarks</span>
        </button>

        @switch (libState()) {
          @case ('loading') { <p class="stateline" i18n="@@library.loading">Loading the library…</p> }
          @case ('error') {
            <bh-alert tone="danger" i18n="@@library.error">Couldn't load the library.</bh-alert>
            <bh-button variant="ghost" (click)="loadLibrary()" testId="lib-retry"><span i18n="@@library.retry">Try again</span></bh-button>
          }
          @default {
            @if (rows().length) {
              <ul class="grid">
                @for (e of rows(); track e.wod.id) {
                  <li>
                    @if (e.global) {
                      <button type="button" class="hit" (click)="openBenchmark(e)" [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="libMeta(e.wod)" [benchmarkKind]="e.benchmarkKind" [weightUnit]="weightUnit()" />
                      </button>
                    } @else {
                      <a class="hit" [routerLink]="['/coach/wods', e.wod.id]" [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="libMeta(e.wod)" [benchmarkKind]="e.benchmarkKind" [weightUnit]="weightUnit()" />
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
              <bh-empty icon="search" [title]="noMatchTitle()" />
            }
          }
        }
      } @else {
        <bh-week-calendar [jump]="true" [min]="-3650" [max]="0" [(offset)]="historyOffset" />
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
                    <a class="hit" [routerLink]="['/coach/classes', r.sessionId, 'build']" [attr.data-testid]="'hist-card-' + r.itemId">
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
        <p class="eyebrow">{{ libMeta(b.wod) }}</p>
        <ul class="rx">
          @for (l of benchLines(); track $index) { <li>{{ l }}</li> }
        </ul>
        @if (addError()) { <bh-alert tone="danger" i18n="@@library.bench.addError">That did not add — try again.</bh-alert> }
        <bh-button variant="strong" size="lg" class="full" [loading]="adding()" (click)="addBenchmark()" testId="bench-add">
          <span i18n="@@library.bench.add">Add to library</span>
        </bh-button>
      }
    </bh-sheet>

    <bh-filter-sheet [open]="filterOpen()" [facets]="filterFacets" [(value)]="filters"
                     [count]="draftCount()" [summaries]="filterSummaries()"
                     title="Filters" i18n-title="@@library.filter.sheetTitle"
                     (draftChange)="onDraftChange($event)" (closed)="filterOpen.set(false)">
      <ng-template bhFilterStep="movement" let-values let-set="set">
        <bh-search-bar placeholder="Movement name" i18n-placeholder="@@library.filter.movement.placeholder"
                       label="Search movements" i18n-label="@@library.filter.movement.searchLabel"
                       testId="filter-movement-search" [value]="movementTerm()" (search)="onMovementSearch($event)" />
        @if (movementTerm().trim().length < 2) {
          @if (values.length) {
            <ul class="mrows">
              @for (id of values; track id) {
                <li>
                  <button type="button" class="prow sel"
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
    .chip { align-self: flex-start; display: inline-flex; align-items: center; min-height: var(--tap);
      padding: 0 var(--sp-3); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-full); color: var(--bone); font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); cursor: pointer; }
    .chip[aria-pressed="true"] { background: var(--bone); color: var(--on-bone); border-color: var(--bone); }
    .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .chip[aria-pressed="true"]:focus-visible { outline-color: var(--focus-inv); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-3); }
    @media (min-width: 768px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1280px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .hit { display: block; height: 100%; min-height: var(--tap); width: 100%; padding: 0; text-align: left;
      background: none; border: 0; color: inherit; text-decoration: none; border-radius: var(--r-card); cursor: pointer; }
    .hit:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .sentinel { height: 1px; }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); text-transform: uppercase; }
    .rx { list-style: none; margin: 0 0 var(--sp-4); padding: 0; font-family: var(--font-mono); font-size: var(--fs-body); color: var(--bone); }
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

  readonly tabs: SegOption[] = [
    { value: 'library', label: $localize`:@@library.tabs.library:Library` },
    { value: 'history', label: $localize`:@@library.tabs.history:History` },
  ];
  readonly searchPlaceholder = $localize`:@@library.search.placeholder:Name or movement`;
  readonly newPieceLabel = $localize`:@@library.new.label:New piece`;
  readonly libMeta = libMeta;

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

  private readonly sentinelEl = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer?: IntersectionObserver;
  private filtersInit = true;

  activeFilterCount = computed(() => Object.keys(this.filters()).length);
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
  histRows = signal<WodHistoryRow[]>([]);
  histState = signal<Load>('loading');

  // ---- Benchmark sheet (D8): unchanged from the first build.
  bench = signal<LibraryEntry | null>(null);
  benchLines = computed(() => { const b = this.bench(); return b ? prescriptionLines(b.wod, this.weightUnit() ?? undefined) : []; });
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
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  loadLibrary() {
    this.libState.set('loading');
    this.rows.set([]);
    this.nextCursor.set(null);
    this.moreError.set(false);
    this.prog.libraryPage(this.queryFor(this.filters())).subscribe({
      next: p => { this.rows.set(p.rows); this.nextCursor.set(p.nextCursor); this.libState.set('ready'); },
      error: () => this.libState.set('error'),
    });
  }

  loadMore() {
    if (this.loadingMore() || !this.nextCursor()) return;
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
    // Cleared so re-entering the step (this facet now returns to the menu on every pick, same as
    // single/multi) doesn't show the last search (R6b finding 2).
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

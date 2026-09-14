import { ChangeDetectionStrategy, Component, computed, effect, inject, LOCALE_ID, signal, untracked } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AlertComponent } from '../../ui/alert.component';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SheetComponent } from '../../ui/sheet.component';
import { PieceCardComponent } from './piece-card.component';
import { LibraryEntry, ProgrammingService, WodHistoryRow } from './programming.service';
import { libMeta, MACRO_LABELS, prescriptionLines, wodMatchesText } from './prescription';

type Load = 'loading' | 'ready' | 'error';

/**
 * The WOD library (M14c-b, spec 2). Two tabs over one search: saved pieces with the global
 * benchmarks merged in, and History -- every piece a class ran. Cards lead with the prescription
 * because a coach knows a workout by its movements before its name.
 */
@Component({
  selector: 'bh-wod-library',
  standalone: true,
  imports: [DatePipe, RouterLink, AlertComponent, ButtonComponent, EmptyComponent, SearchBarComponent,
    SegmentedComponent, SheetComponent, PieceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lib">
      <header class="head">
        <h1 class="t-h1" i18n="@@library.title">Library</h1>
        <bh-button variant="strong" size="lg" class="new full" route="/coach/wods/new" testId="lib-new">
          <span i18n="@@library.new">New WOD</span>
        </bh-button>
      </header>

      <bh-segmented [options]="tabs" [(value)]="tab" label="Library view" i18n-label="@@library.tabs.label"
                    tone="bone" data-testid="lib-tab" />
      <bh-search-bar [placeholder]="searchPlaceholder" label="Search pieces" i18n-label="@@library.search.label"
                     testId="lib-search" [value]="query()" (search)="onSearch($event)" />

      @if (tab() === 'library') {
        @switch (libState()) {
          @case ('loading') { <p class="stateline" i18n="@@library.loading">Loading the library…</p> }
          @case ('error') {
            <bh-alert tone="danger" i18n="@@library.error">Couldn't load the library.</bh-alert>
            <bh-button variant="ghost" (click)="loadLibrary()" testId="lib-retry"><span i18n="@@library.retry">Try again</span></bh-button>
          }
          @default {
            @if (shownEntries().length) {
              <ul class="grid">
                @for (e of shownEntries(); track e.wod.id) {
                  <li>
                    @if (e.global) {
                      <button type="button" class="hit" (click)="openBenchmark(e)" [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="libMeta(e.wod)" [benchmarkKind]="e.benchmarkKind" />
                      </button>
                    } @else {
                      <a class="hit" [routerLink]="['/coach/wods', e.wod.id]" [attr.data-testid]="'lib-card-' + e.wod.id">
                        <bh-piece-card [wod]="e.wod" [eyebrow]="libMeta(e.wod)" [benchmarkKind]="e.benchmarkKind" />
                      </a>
                    }
                  </li>
                }
              </ul>
            } @else {
              <bh-empty icon="search" [title]="noMatchTitle()" message="Try a movement or a shorter name."
                        i18n-message="@@library.noMatch.message" />
            }
          }
        }
      } @else {
        @switch (histState()) {
          @case ('loading') { <p class="stateline" i18n="@@library.history.loading">Loading history…</p> }
          @case ('error') {
            <bh-alert tone="danger" i18n="@@library.history.error">Couldn't load the history.</bh-alert>
            <bh-button variant="ghost" (click)="loadHistory(true)" testId="hist-retry"><span i18n="@@library.retry">Try again</span></bh-button>
          }
          @default {
            @if (historyGroups().length) {
              @for (g of historyGroups(); track g.day) {
                <h2 class="rule">{{ g.day | date:'EEE d MMM' }}</h2>
                <ul class="grid">
                  @for (r of g.rows; track r.itemId) {
                    <li>
                      <a class="hit" [routerLink]="['/coach/classes', r.sessionId, 'build']" [attr.data-testid]="'hist-card-' + r.itemId">
                        <bh-piece-card [wod]="r.wod" [eyebrow]="histMeta(r)" />
                      </a>
                    </li>
                  }
                </ul>
              }
              @if (nextBefore()) {
                @if (moreError()) { <bh-alert tone="danger" i18n="@@library.history.moreError">Couldn't load more.</bh-alert> }
                <bh-button variant="ghost" size="lg" class="full" [loading]="morePending()" (click)="loadMore()" testId="hist-more">
                  <span i18n="@@library.history.more">Load older</span>
                </bh-button>
              }
            } @else if (query()) {
              <bh-empty icon="search" [title]="noMatchTitle()" />
            } @else {
              <bh-empty icon="calendar" title="No class has run a piece yet" i18n-title="@@library.history.empty"
                        message="Pieces show up here once a class with programming has started."
                        i18n-message="@@library.history.emptyMessage" />
            }
          }
        }
      }
    </section>

    <bh-sheet [open]="!!bench()" [title]="bench()?.wod?.title ?? ''" label="Benchmark" i18n-label="@@library.bench.aria"
              (closed)="closeBenchmark()" data-testid="bench-sheet">
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
  `,
  styles: [`
    .lib { display: flex; flex-direction: column; gap: var(--sp-4); }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--sp-3); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-3); }
    @media (min-width: 768px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1280px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .hit { display: block; height: 100%; min-height: var(--tap); width: 100%; padding: 0; text-align: left;
      background: none; border: 0; color: inherit; text-decoration: none; border-radius: var(--r-card); cursor: pointer; }
    .hit:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .rule { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--hairline); padding-bottom: var(--sp-1); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); text-transform: uppercase; }
    .rx { list-style: none; margin: 0 0 var(--sp-4); padding: 0; font-family: var(--font-mono); font-size: var(--fs-body); color: var(--bone); }
    .stateline { color: var(--bone-dim); }
    @media (max-width: 767px) { .new { flex-basis: 100%; } }
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
  readonly libMeta = libMeta;

  tab = signal<'library' | 'history'>('library');
  query = signal('');

  entries = signal<LibraryEntry[]>([]);
  libState = signal<Load>('loading');
  shownEntries = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.entries().filter(e => wodMatchesText(e.wod, q));
  });

  history = signal<WodHistoryRow[]>([]);
  histState = signal<Load>('loading');
  nextBefore = signal<string | null>(null);
  morePending = signal(false);
  moreError = signal(false);
  private historyLoaded = false;
  historyGroups = computed(() => {
    const groups: { day: string; rows: WodHistoryRow[] }[] = [];
    for (const r of this.history()) {
      const day = new Date(r.startAt).toDateString();
      const last = groups[groups.length - 1];
      if (last && new Date(last.day).toDateString() === day) last.rows.push(r);
      else groups.push({ day: r.startAt, rows: [r] });
    }
    return groups;
  });

  bench = signal<LibraryEntry | null>(null);
  benchLines = computed(() => { const b = this.bench(); return b ? prescriptionLines(b.wod) : []; });
  adding = signal(false);
  addError = signal(false);

  noMatchTitle = computed(() => $localize`:@@library.noMatch.title:Nothing matches “${this.query()}:query:”`);

  constructor() {
    this.loadLibrary();
    effect(() => {
      if (this.tab() === 'history' && !this.historyLoaded) untracked(() => this.loadHistory(true));
    });
  }

  loadLibrary() {
    this.libState.set('loading');
    this.prog.libraryEntries().subscribe({
      next: e => { this.entries.set(e); this.libState.set('ready'); },
      error: () => this.libState.set('error'),
    });
  }

  // ponytail: R1 made history a day endpoint (no search, no cursor); this page still queries/paginates
  // the old way, so it's wired to always ask for today and never page. R6 rewrites it for real.
  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** History is fetched lazily, the first time its tab opens, and again whenever its search changes. */
  loadHistory(reset: boolean) {
    if (reset) { this.histState.set('loading'); this.history.set([]); this.nextBefore.set(null); }
    this.historyLoaded = true;
    this.prog.wodHistory(this.today()).subscribe({
      next: rows => { this.history.set(rows); this.nextBefore.set(null); this.histState.set('ready'); },
      error: () => this.histState.set('error'),
    });
  }

  loadMore() {
    // no cursor on the day endpoint (R1) -- nextBefore is always null so this never fires.
  }

  onSearch(v: string) {
    this.query.set(v);
    if (this.tab() === 'history') this.loadHistory(true);
    else this.historyLoaded = false; // stale for the new query; refetch when History opens
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

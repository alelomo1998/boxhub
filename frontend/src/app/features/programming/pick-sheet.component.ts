import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { AlertComponent } from '../../ui/alert.component';
import { ButtonComponent } from '../../ui/button.component';
import { EmptyComponent } from '../../ui/empty.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { SheetComponent } from '../../ui/sheet.component';
import { MOVEMENT_CATEGORIES, MOVEMENT_UNITS, movementCategoryLabel } from './programming.service';

/** One offered option, whatever the domain object behind it is. `detail` is an optional third
 *  line -- a one-line content snippet -- rendered dimmer and smaller than `secondary`. `chip` is
 *  an optional leading badge on the secondary line (Library parity, user-ruled 2026-09-16 --
 *  e.g. a benchmark row's "Benchmark" chip, same idiom as bh-piece-card's own `.chip`). Domain
 *  content (a prescription, a movement list) belongs to the caller; this component just renders
 *  strings. */
export interface PickRow { id: string; primary: string; secondary?: string; detail?: string; chip?: string }

/** Either an option was chosen, or the coach kept what they typed. */
export type PickResult = { id: string } | { freeText: string };

/**
 * The mobile-first replacement for the native datalist. User-stated 2026-09-07: "we have to avoid
 * the basic combo and be mobile friendly" — a datalist on iOS is an affordance most people never
 * find, and mobile-first bans a native picker for anything richer than a short label.
 *
 * Domain-agnostic on purpose: the movement picker maps a movement to {name, category . modality}
 * and the library picker maps a wod to {title, macro . timing preset}, and this component knows
 * about neither.
 *
 * Feature-local rather than in ui/: it composes existing components for one feature area, and ui/
 * membership carries the gallery-and-baselines contract. Promote it if a third consumer appears.
 *
 * Two contracts a caller must honour:
 * - bh-sheet's `open` is a one-way input, and so is this one. Reset your own open signal to false
 *   in response to (closed) AND to (picked), or the sheet will not reopen.
 * - Rows are NOT filtered here. (search) emits the debounced term; the caller fetches or filters
 *   and pushes the result back through [rows], because the movement picker searches server-side.
 *
 * `allowCreate` gates a second step, entered from the free-text row instead of it emitting
 * `picked` directly: name (shown as a heading, not editable), unit multi-select, loadable
 * yes/no, confirm/back. The caller owns the actual create call (`create` output carries
 * `{ name, units, loadable }`) and feeds `createPending`/`createError` back in, because bh-sheet's
 * `open` is one-way and so is `step` here -- reset in `onClosed()`, same as `term`, so a reopened
 * sheet never resumes mid-create. Other consumers never set `allowCreate`, so they see no change.
 *
 * Two projection slots, search step only: `[sheetFilters]` sits above the results (below the
 * search bar) and `[sheetLead]` renders as the first row inside them. The caller owns whatever
 * fills these -- this component stays domain-agnostic. Projecting neither leaves the sheet
 * identical to before either slot existed.
 *
 * `overlay`, search step only: when true, the search UI (tools, filters, rows -- including
 * [sheetFilters] and [sheetLead]) is replaced by whatever the caller projects into
 * [sheetOverlay]. The caller owns that step's content, its heading and its way back -- this
 * component only yields the space. Keeps a sheet-on-a-sheet from ever being needed. A consumer
 * that never sets it sees exactly today's sheet.
 */
@Component({
  selector: 'bh-pick-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetComponent, SearchBarComponent, EmptyComponent, ButtonComponent, AlertComponent],
  template: `
    <bh-sheet [open]="open()" [title]="title()" [label]="title()" (closed)="onClosed()">
      @if (step() === 'search') {
        @if (!overlay()) {
          <div class="tools">
            <bh-search-bar [(value)]="term" [label]="searchLabel()" [placeholder]="searchPlaceholder()"
                           (search)="search.emit($event)" testId="pick-search" />
          </div>

          <ng-content select="[sheetFilters]" />

          <div class="rows" aria-live="polite">
            <ng-content select="[sheetLead]" />
            @for (r of rows(); track r.id) {
              <button type="button" class="row" [attr.data-testid]="'pick-row-' + r.id"
                      (click)="picked.emit({ id: r.id })">
                <span class="p">{{ r.primary }}</span>
                @if (r.chip || r.secondary) {
                  <span class="s">
                    @if (r.chip) { <span class="chip">{{ r.chip }}</span> }
                    @if (r.secondary) { <span>{{ r.secondary }}</span> }
                  </span>
                }
                @if (r.detail) { <span class="d">{{ r.detail }}</span> }
              </button>
            }

            <!-- Last, and only once something has been typed: a movement outside the library must
                 never be a dead end, but an empty free-text row offers nothing. -->
            @if (showFreeText()) {
              <button type="button" class="row free" data-testid="pick-free-text"
                      (click)="onFreeText()">
                <span class="p" i18n="@@pickSheet.freeText">Use "{{ term().trim() }}"</span>
                <span class="s" i18n="@@pickSheet.freeTextHint">NOT IN THE LIBRARY</span>
              </button>
            }

            @if (rows().length === 0 && !showFreeText()) {
              <bh-empty icon="search"
                        i18n-title="@@pickSheet.emptyTitle" title="Nothing found"
                        i18n-message="@@pickSheet.emptyMessage"
                        message="No option matches that search." />
            }
          </div>
        } @else {
          <ng-content select="[sheetOverlay]" />
        }
      } @else {
        <div class="create-step" data-testid="pick-create-step">
          <h3 class="create-name">{{ term().trim() }}</h3>

          <h4 class="create-heading" i18n="@@pickSheet.create.unitsHeading">Measured in</h4>
          <div class="rows">
            @for (u of units; track u) {
              <button type="button" class="prow" [class.sel]="createUnits().includes(u)"
                      [attr.data-testid]="'pick-create-unit-' + u" (click)="toggleCreateUnit(u)">
                <span>{{ u }}</span>
                @if (createUnits().includes(u)) { <span class="mark" aria-hidden="true">&#x2713;</span> }
              </button>
            }
          </div>

          <h4 class="create-heading" i18n="@@pickSheet.create.loadableHeading">Takes a load</h4>
          <div class="rows">
            <button type="button" class="prow" [class.sel]="createLoadable()"
                    data-testid="pick-create-loadable-yes" (click)="createLoadable.set(true)">
              <span i18n="@@pickSheet.create.loadableYes">Yes</span>
              @if (createLoadable()) { <span class="mark" aria-hidden="true">&#x2713;</span> }
            </button>
            <button type="button" class="prow" [class.sel]="!createLoadable()"
                    data-testid="pick-create-loadable-no" (click)="createLoadable.set(false)">
              <span i18n="@@pickSheet.create.loadableNo">No</span>
              @if (!createLoadable()) { <span class="mark" aria-hidden="true">&#x2713;</span> }
            </button>
          </div>

          <h4 class="create-heading" i18n="@@pickSheet.create.categoryHeading">Category</h4>
          <div class="rows">
            @for (c of categories; track c) {
              <button type="button" class="prow" [class.sel]="createCategory() === c"
                      [attr.data-testid]="'pick-create-category-' + c" (click)="createCategory.set(c)">
                <span>{{ categoryLabel(c) }}</span>
                @if (createCategory() === c) { <span class="mark" aria-hidden="true">&#x2713;</span> }
              </button>
            }
          </div>

          @if (createError()) {
            <bh-alert tone="danger" data-testid="pick-create-error">{{ createError() }}</bh-alert>
          }

          <div class="create-actions">
            <bh-button variant="ghost" size="lg" class="full" testId="pick-create-back" (click)="backToSearch()">
              <span i18n="@@pickSheet.create.back">Back</span>
            </bh-button>
            <bh-button variant="strong" size="lg" class="full" testId="pick-create-confirm"
                       [loading]="createPending()" (click)="confirmCreate()">
              <span i18n="@@pickSheet.create.confirm">Create movement</span>
            </bh-button>
          </div>
        </div>
      }
    </bh-sheet>`,
  styles: [`
    :host { display: contents; }
    .tools { margin-bottom: var(--sp-3); }
    /* Spacing only. The slot must NOT impose a layout: it did (a flex column), and it silently
       beat the consumer's own grid on specificity, stacking two filter buttons that were meant to
       sit side by side. The caller owns how its filters are arranged. */
    :host ::ng-deep [sheetFilters] { padding: 0 var(--sp-3) var(--sp-3); }
    .rows { display: flex; flex-direction: column; }
    .row { display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
      gap: var(--sp-1); width: 100%; min-height: var(--tap); box-sizing: border-box;
      padding: var(--sp-2) var(--sp-2); background: none; border: none;
      border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      cursor: pointer; }
    .row:last-child { border-bottom: none; }
    .row:hover { background: var(--surface-2); }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    /* The free-text row is an escape hatch, not another result — a heavier rule separates it. */
    .free { border-top: 1px solid var(--hairline); }
    .p { font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; }
    /* Mono because a secondary line is meta (category, modality, preset), never prose. Flex so an
       optional leading .chip sits beside the text with a gap, same row it always was when no
       chip is present (one flex item renders identically to plain inline text). */
    .s { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2);
      font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      letter-spacing: 0.04em; }
    /* Identical to bh-piece-card's own .chip (Library parity, user-ruled 2026-09-16) -- a
       benchmark row says so before its kind/timing, never a colour, just a bordered badge. */
    .chip { color: var(--bone); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 0 var(--sp-1); }
    /* The content snippet. It does NOT get a dimmer colour than .s: these rows paint on
       --surface-2, where --faint measures 4.27:1 and fails AA for body-sized text (it passes at
       4.70:1 on --surface, which is why it is fine elsewhere -- axe caught this one here and only
       here). The three lines are already told apart by voice: Archivo title, letterspaced meta,
       then the plain prescription. Never wraps -- a long one would otherwise grow the row to three
       lines at 360px. */
    .d { width: 100%; font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85; }

    /* ---- create step: same picker-row language as the editor's own meta sheets ------------- */
    .create-step { display: flex; flex-direction: column; gap: var(--sp-2); }
    .create-name { margin: 0 0 var(--sp-2); font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-h2); color: var(--bone); }
    .create-heading { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-meta);
      font-weight: 700; letter-spacing: 0.08em; color: var(--bone-dim); }
    .prow { display: flex; align-items: center; justify-content: space-between; width: 100%;
      box-sizing: border-box; min-height: var(--tap); padding: 0 var(--sp-2); background: none;
      border: none; border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; }
    .rows .prow:last-child { border-bottom: none; }
    .prow:hover { background: var(--surface-2); }
    .prow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .prow.sel { font-weight: 700; }
    .mark { color: var(--bone); font-weight: 700; }
    /* Pinned to the foot of the scrolling sheet body, not flowed after the questions. Measured at
       360x780 with the step open: the confirm sat at y=1135, 355px below the fold, because the
       step stacks a name, seven unit rows, two load rows and six category rows above it. It was
       reachable by scrolling, but a primary action you cannot see is one you may not know is
       there. The questions scroll under it; the decision stays put. */
    .create-actions { position: sticky; bottom: 0; z-index: 1;
      display: flex; gap: var(--sp-3); margin-top: var(--sp-3);
      padding: var(--sp-3) 0 var(--sp-1); background: var(--surface);
      border-top: 1px solid var(--hairline); }
    .create-actions bh-button { flex: 1; min-width: 0; }
  `],
})
export class PickSheetComponent {
  open = input(false);
  title = input('');
  rows = input<PickRow[]>([]);
  allowFreeText = input(true);
  /** Gates the second, movement-specific step. Off (default) for every other consumer. */
  allowCreate = input(false);
  createPending = input(false);
  createError = input('');
  /** When set, the search UI (tools, filters, rows) is replaced by whatever the caller projects
   *  into [sheetOverlay]. The caller owns the step's content, its heading and its way back --
   *  this component only yields the space. Keeps a sheet-on-a-sheet from ever being needed. */
  overlay = input(false);
  searchLabel = input($localize`:@@pickSheet.searchLabel:Search`);
  searchPlaceholder = input($localize`:@@pickSheet.searchPlaceholder:Search`);

  /** Debounced by bh-search-bar; the caller owns fetching and filtering. */
  search = output<string>();
  picked = output<PickResult>();
  /** `allowCreate` only. The caller makes the actual call and feeds createPending/createError back. */
  create = output<{ name: string; units: string[]; loadable: boolean; category: string }>();
  closed = output<void>();

  readonly units = MOVEMENT_UNITS;
  readonly categories = MOVEMENT_CATEGORIES;
  /** A class field, not an inline arrow: an arrow in the template mints a new identity each cycle. */
  readonly categoryLabel = movementCategoryLabel;
  readonly term = signal('');
  readonly showFreeText = computed(() => this.allowFreeText() && this.term().trim().length > 0);

  readonly step = signal<'search' | 'create'>('search');
  readonly createUnits = signal<string[]>(['REPS']);
  readonly createLoadable = signal(false);
  // A hand-typed movement outside the 122-item catalogue is most often a box-specific implement --
  // always a real category, unlike the synthesized 'OTHER' it replaces.
  readonly createCategory = signal<string>('ODD_OBJECT');

  constructor() {
    // bh-sheet only emits (closed) for a USER-initiated close (Escape/backdrop/X) -- its own
    // native 'close' handler is guarded to skip emitting when the PARENT already drove `open`
    // to false first (a successful pick or create), so onClosed() below never runs for that path
    // and term/step were staying stale for the sheet's next open. Watching `open` itself catches
    // both paths: a parent-driven close resets state here, a user-driven close resets it via
    // onClosed() (redundant with this, not harmful) after bubbling to the parent.
    effect(() => {
      if (!this.open()) {
        this.term.set('');
        this.step.set('search');
      }
    });
  }

  onFreeText() {
    if (this.allowCreate()) this.goToCreate();
    else this.picked.emit({ freeText: this.term().trim() });
  }

  private goToCreate() {
    this.createUnits.set(['REPS']);
    this.createLoadable.set(false);
    this.createCategory.set('ODD_OBJECT');
    this.step.set('create');
  }

  backToSearch() {
    this.step.set('search');
  }

  toggleCreateUnit(u: string) {
    this.createUnits.update(list => {
      if (list.includes(u)) {
        if (list.length === 1) return list; // at least one must stay selected
        return list.filter(x => x !== u);
      }
      return [...list, u]; // selection order -> first selected is the default
    });
  }

  confirmCreate() {
    this.create.emit({
      name: this.term().trim(), units: this.createUnits(), loadable: this.createLoadable(),
      category: this.createCategory(),
    });
  }

  onClosed() {
    this.term.set(''); // a reopened sheet starts clean, not on the last search
    this.step.set('search'); // same trap as bh-sheet's one-way `open` -- must be reset here too
    this.closed.emit();
  }
}

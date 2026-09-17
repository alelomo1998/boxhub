import {
  ChangeDetectionStrategy, Component, Directive, ElementRef, TemplateRef,
  computed, contentChildren, effect, inject, input, model, output, signal, viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';
import { SheetComponent } from './sheet.component';

export interface FilterOption { value: string; label: string; }
/** One filter. `options` present = the sheet renders the choice step itself; absent = the caller
 *  projects that step as <ng-template bhFilterStep="key" let-values let-set="set">. */
export interface FilterFacet { key: string; label: string; mode: 'single' | 'multi'; options?: FilterOption[]; }
export type FilterValue = Record<string, string[]>;

@Directive({ selector: 'ng-template[bhFilterStep]', standalone: true })
export class FilterStepDirective {
  key = input.required<string>({ alias: 'bhFilterStep' });
  tpl = inject(TemplateRef);
}

/**
 * Reusable filter sheet (spec D16): a menu of facets, each drilling into its own choice step, with
 * an Apply that shows the result count. Built for the Library page (R6) and reused by M25 on posts.
 *
 * Draft isolation: opening copies `value()` into a private `draft` signal; every tap edits the
 * draft only. Apply writes the draft into `value` and closes; any other close (Esc, backdrop, the
 * sheet's own X) discards the draft — nothing here touches `value` outside `apply()`.
 *
 * `open` carries the same one-way contract as bh-sheet itself (see sheet.component.ts): this
 * component only ever reads it, so the caller must reset its own `open` signal on `(closed)`.
 */
@Component({
  selector: 'bh-filter-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, ButtonComponent, IconComponent, SheetComponent],
  template: `
    <bh-sheet [open]="open()" [title]="title()" [label]="title()" (closed)="onSheetClosed()">
      @if (step() === null) {
        <div class="menu" data-testid="filter-menu">
          @for (f of facets(); track f.key) {
            <button type="button" class="frow" [attr.data-testid]="'filter-row-' + f.key"
                    (click)="openStep(f.key)">
              <span class="f-text">
                <span class="f-k">{{ f.label }}</span>
                <span class="f-v">{{ summaryFor(f) }}</span>
              </span>
              <bh-icon name="chevron-right" [size]="18" class="f-chev" />
            </button>
          }
        </div>
        <div class="menufoot">
          <bh-button variant="ghost" size="lg" testId="filter-clear" (click)="clearAll()">
            <span i18n="@@filterSheet.clear">Clear</span>
          </bh-button>
          <bh-button variant="strong" size="lg" class="full" testId="filter-apply"
                     [ariaDisabled]="count() === 0" (click)="apply()">
            @if (count() === null) {
              <span i18n="@@filterSheet.show.counting">Show results</span>
            } @else if (count() === 0) {
              <span i18n="@@filterSheet.show.zero">No results</span>
            } @else if (count(); as n) {
              <span i18n="@@filterSheet.show.n">{n, plural, =1 {Show 1 result} other {Show {{n}} results}}</span>
            }
          </bh-button>
        </div>
      } @else if (activeFacet(); as facet) {
        <div class="stepbody" [attr.data-testid]="'filter-step-' + facet.key">
          <h3 #stepheading class="stept" tabindex="-1" [id]="'filter-step-heading-' + facet.key"
              data-testid="filter-step-heading">{{ facet.label }}</h3>
          @if (facet.options; as opts) {
            @if (facet.mode === 'single') {
              <div class="rows" role="radiogroup" [attr.aria-labelledby]="'filter-step-heading-' + facet.key">
                <button type="button" class="prow" role="radio" [class.sel]="!selectedFor(facet).length"
                        [attr.aria-checked]="!selectedFor(facet).length"
                        [attr.data-testid]="'filter-opt-' + facet.key + '-any'"
                        (click)="pickSingle(facet.key, null)">
                  <span>{{ anyLabel }}</span>
                  @if (!selectedFor(facet).length) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                </button>
                @for (o of opts; track o.value) {
                  <button type="button" class="prow" role="radio" [class.sel]="isSelected(facet.key, o.value)"
                          [attr.aria-checked]="isSelected(facet.key, o.value)"
                          [attr.data-testid]="'filter-opt-' + facet.key + '-' + o.value"
                          (click)="pickSingle(facet.key, o.value)">
                    <span>{{ o.label }}</span>
                    @if (isSelected(facet.key, o.value)) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                  </button>
                }
              </div>
            } @else {
              <div class="rows">
                <button type="button" class="prow" [class.sel]="!selectedFor(facet).length"
                        [attr.aria-pressed]="!selectedFor(facet).length"
                        [attr.data-testid]="'filter-opt-' + facet.key + '-any'"
                        (click)="clearFacet(facet.key)">
                  <span>{{ anyLabel }}</span>
                  @if (!selectedFor(facet).length) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                </button>
                @for (o of opts; track o.value) {
                  <button type="button" class="prow" [class.sel]="isSelected(facet.key, o.value)"
                          [attr.aria-pressed]="isSelected(facet.key, o.value)"
                          [attr.data-testid]="'filter-opt-' + facet.key + '-' + o.value"
                          (click)="toggleMulti(facet.key, o.value)">
                    <span>{{ o.label }}</span>
                    @if (isSelected(facet.key, o.value)) { <span class="mark" aria-hidden="true">&#x2713;</span> }
                  </button>
                }
              </div>
            }
          } @else {
            <div class="custom" data-testid="filter-step-custom">
              <ng-container [ngTemplateOutlet]="customTpl(facet.key)"
                            [ngTemplateOutletContext]="{ $implicit: selectedFor(facet), set: customSetter(facet.key) }" />
            </div>
          }
          <div class="stepfoot">
            <bh-button variant="ghost" size="lg" class="full" testId="filter-step-back" (click)="back()">
              <span i18n="@@filterSheet.back">Back</span>
            </bh-button>
          </div>
        </div>
      }
    </bh-sheet>
  `,
  styles: [`
    :host { display: contents; }

    /* ---- menu: one row per facet, mono eyebrow label + draft summary --------------------------- */
    .menu { display: flex; flex-direction: column; }
    .frow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      width: 100%; box-sizing: border-box; min-height: var(--tap-lg); padding: var(--sp-2) 0;
      background: none; border: none; border-bottom: 1px solid var(--hairline); color: var(--bone);
      text-align: left; font-family: var(--font-body); cursor: pointer; }
    .menu .frow:last-child { border-bottom: none; }
    .frow:hover { background: var(--surface-2); }
    .frow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .f-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .f-k { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--bone-dim); }
    .f-v { font-size: var(--fs-body); color: var(--bone); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }
    .f-chev { flex-shrink: 0; color: var(--bone-dim); }
    .menufoot { display: flex; gap: var(--sp-3); margin-top: var(--sp-3); }
    .menufoot bh-button:last-child { flex: 1; min-width: 0; }

    /* ---- step body -- same .prow + checkmark idiom as class-builder's fill-slot sheet (copied,
       not reinvented): every consumer of a category/type-style picker in this product reads the
       same way. ------------------------------------------------------------------------------- */
    .stepbody { display: flex; flex-direction: column; }
    .stept { margin: 0 0 var(--sp-3); font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-h2); color: var(--bone); }
    .stept:focus-visible, .stept:focus { outline: 2px solid var(--focus); outline-offset: 2px; }
    .rows { display: flex; flex-direction: column; }
    .stepfoot { margin-top: var(--sp-3); }
    .prow { display: flex; align-items: center; justify-content: space-between; width: 100%;
      box-sizing: border-box; min-height: var(--tap); padding: 0 var(--sp-2); background: none;
      border: none; border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; }
    .rows .prow:last-child { border-bottom: none; }
    .prow:hover { background: var(--surface-2); }
    .prow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .prow.sel { font-weight: 700; }
    .mark { color: var(--bone); font-weight: 700; }
    /* The focus-ring clip this padding used to work around is now fixed at the source, in
       bh-sheet's own .body (M14c-b R6e-fix). */
    .custom { display: flex; flex-direction: column; gap: var(--sp-2); }
  `],
})
export class FilterSheetComponent {
  open = input(false);
  title = input($localize`:@@filterSheet.title:Filters`);
  facets = input.required<FilterFacet[]>();
  /** The APPLIED filters. Written only by Apply and Clear-all-then-Apply. */
  value = model<FilterValue>({});
  /** Result count for the current DRAFT; null while the caller is counting. */
  count = input<number | null>(null);
  /** Menu-row summary for a custom facet's draft value, e.g. {movement: 'Thruster +1'}. */
  summaries = input<Record<string, string>>({});
  /** Every draft change, so the caller can recount. */
  draftChange = output<FilterValue>();
  closed = output<void>();
  /** The step being shown: a facet key when a choice step opens, null when back on the menu. A
   *  caller resets per-visit state on it (the library clears its movement search on entry). Not
   *  emitted when the sheet opens -- it always opens on the menu. */
  stepChange = output<string | null>();

  protected readonly anyLabel = $localize`:@@filterSheet.any:Any`;

  /** Private draft -- copied from `value()` on every open, discarded on any close but Apply. */
  protected readonly draft = signal<FilterValue>({});
  /** null = menu; a facet key = that facet's choice step. */
  protected readonly step = signal<string | null>(null);

  protected readonly activeFacet = computed<FilterFacet | null>(() => {
    const key = this.step();
    if (key === null) return null;
    return this.facets().find(f => f.key === key) ?? null;
  });

  private readonly stepTemplates = contentChildren(FilterStepDirective);
  private readonly stepHeadingEl = viewChild<ElementRef<HTMLElement>>('stepheading');
  /** The host, used only for the return-to-menu-row query below -- NOT a viewChildren('menurow')
   *  query: the menu is torn down and rebuilt under the same structural @if as the step, and
   *  viewChildren read empty every single time an effect ran right after that swap (instrumented
   *  and confirmed), where the singular viewChild above (for the step heading, same swap) did not.
   *  A plain querySelector against the live DOM sidesteps whichever of the two that gap is in --
   *  the same idiom class-builder.page.ts's focusAfterRemove() already uses for its own
   *  which-control-replaced-this focus move. */
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Not a signal: read/written only from inside the effect below, on the same tick as the step
   *  change that set it -- a plain field is enough, and avoids a spurious reactive dependency. */
  private returnFocusKey: string | null = null;
  private lastOpen = false;

  constructor() {
    // Edge-triggered on open() going false -> true, same pattern bh-sheet's own effect uses for
    // showModal(): copy the applied value into a fresh draft and reset to the menu, so a previous
    // session's step or half-drafted change never leaks into the next open.
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !this.lastOpen) {
        this.draft.set({ ...this.value() });
        this.step.set(null);
      }
      this.lastOpen = isOpen;
    });

    // Focus moves to the step heading on step change.
    effect(() => {
      if (this.step() !== null) this.stepHeadingEl()?.nativeElement.focus();
    });

    // ...and back to the originating menu row when a step returns to the menu, whether via Back
    // or a single-select's auto-return -- both go through step.set(null) with returnFocusKey held.
    // Deferred a macrotask, unlike the heading effect above: the menu view is torn down and
    // rebuilt under the same structural @if the step is, and (confirmed by instrumenting it) both
    // a plain effect() and a viewChildren() query still read the pre-rebuild DOM/query result at
    // the moment this effect's dependency fires -- a macrotask runs after that rebuild settles.
    effect(() => {
      if (this.step() === null && this.returnFocusKey !== null) {
        const key = this.returnFocusKey;
        this.returnFocusKey = null;
        setTimeout(() => {
          this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="filter-row-${key}"]`)?.focus();
        });
      }
    });
  }

  protected customTpl(key: string): TemplateRef<unknown> | null {
    return this.stepTemplates().find(d => d.key() === key)?.tpl ?? null;
  }

  protected selectedFor(f: FilterFacet): string[] {
    return this.draft()[f.key] ?? [];
  }

  protected isSelected(key: string, value: string): boolean {
    return (this.draft()[key] ?? []).includes(value);
  }

  /** Options' labels joined, "+N" past two; a custom facet reads its summary from `summaries()`;
   *  empty reads "Any". */
  protected summaryFor(f: FilterFacet): string {
    if (!f.options) return this.summaries()[f.key] ?? this.anyLabel;
    const selected = this.draft()[f.key] ?? [];
    if (!selected.length) return this.anyLabel;
    const labels = f.options.filter(o => selected.includes(o.value)).map(o => o.label);
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  }

  protected openStep(key: string) {
    this.returnFocusKey = key;
    this.step.set(key);
    this.stepChange.emit(key);
  }

  protected back() {
    this.goMenu();
  }

  private goMenu() {
    this.step.set(null);
    this.stepChange.emit(null);
  }

  private emitDraft(next: FilterValue) {
    this.draft.set(next);
    this.draftChange.emit(next);
  }

  /** Single facet: any tap -- including "Any" -- selects and returns to the menu. */
  protected pickSingle(key: string, value: string | null) {
    const next = { ...this.draft() };
    if (value === null) delete next[key]; else next[key] = [value];
    this.emitDraft(next);
    this.goMenu();
  }

  /** Multi facet: an option toggles and returns to the menu (user-ruled 2026-09-14) -- selections
   *  still accumulate across visits, since the step shows what is already ticked. */
  protected toggleMulti(key: string, value: string) {
    const current = this.draft()[key] ?? [];
    const values = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    const next = { ...this.draft() };
    if (values.length) next[key] = values; else delete next[key];
    this.emitDraft(next);
    this.goMenu();
  }

  /** Multi facet's "Any" row: clears the facet and returns to the menu, like every other pick. */
  protected clearFacet(key: string) {
    const next = { ...this.draft() };
    delete next[key];
    this.emitDraft(next);
    this.goMenu();
  }

  /** Custom facet: `set()` updates the draft and STAYS on the step (user-ruled 2026-09-14): a
   *  projected step like the movement search is where several values get picked in one visit, so
   *  leaving on every pick would force a round trip per value. Back returns to the menu. */
  private setCustom(key: string, values: string[]) {
    const next = { ...this.draft() };
    if (values.length) next[key] = values; else delete next[key];
    this.emitDraft(next);
  }

  protected customSetter(key: string): (v: string[]) => void {
    return (v: string[]) => this.setCustom(key, v);
  }

  protected clearAll() {
    this.emitDraft({});
  }

  /** Guard in the handler, not [disabled] (CLAUDE.md): a zero-result draft keeps the sheet open
   *  and does nothing on Apply -- ariaDisabled above only dims it, it stays reachable. */
  protected apply() {
    if (this.count() === 0) return;
    this.value.set(this.draft());
    this.closed.emit();
  }

  protected onSheetClosed() {
    this.closed.emit();
  }
}

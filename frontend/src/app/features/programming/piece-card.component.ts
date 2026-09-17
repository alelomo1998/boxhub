import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Wod } from './programming.service';
import { BENCHMARK_KIND_LABELS, prescriptionLines, SCORE_TYPE_LABELS } from './prescription';

/** How many prescription lines a card shows. Fixed, so cards in a 2- or 3-column grid align. */
export const CARD_LINE_BUDGET = 3;

/**
 * One piece as a prescription card (spec 2, composition B). Presentational only: the page wraps
 * it in the link or button that makes it tappable, so the card never decides what a tap means.
 */
@Component({
  selector: 'bh-piece-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top" [id]="descId()">
      <span class="eyebrow">
        @if (benchmarkKind()) {
          <span class="chip" i18n="@@library.card.benchmark">Benchmark</span>
          <span>{{ kindLabel() }}</span>
        }
        @if (eyebrow()) { <span>{{ eyebrow() }}</span> }
      </span>
      @if (scoreLabel()) { <span class="score">{{ scoreLabel() }}</span> }
    </div>
    <h3 class="title" [id]="titleId()">{{ wod().title }}</h3>
    @if (lines().shown.length) {
      <ul class="rx">
        @for (l of lines().shown; track $index) { <li>{{ l }}</li> }
      </ul>
      @if (lines().more) {
        <p class="more" i18n="@@library.card.more">+{{ lines().more }} more</p>
      }
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4);
      background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); height: 100%; }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); }
    .eyebrow, .score { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      text-transform: uppercase; letter-spacing: 0.06em; }
    .eyebrow { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; min-width: 0; }
    .chip { color: var(--bone); border: 1px solid var(--hairline); border-radius: var(--edge); padding: 0 var(--sp-1); }
    .title { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; color: var(--bone); overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .rx { list-style: none; margin: 0; padding: 0; font-family: var(--font-mono); font-size: var(--fs-sm);
      color: var(--bone-dim); font-variant-numeric: tabular-nums; }
    .rx li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .more { margin: 0; font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
  `],
})
export class PieceCardComponent {
  wod = input.required<Wod>();
  eyebrow = input('');
  benchmarkKind = input<string | null>(null);
  /** The box's own weight unit (R2/D22), passed through to prescriptionLines so a load prints in
   *  the unit the coach reads in. null/omitted -- a load prints with no unit suffix. */
  weightUnit = input<string | null>(null);

  /** Ids for the wrapping link/button (the page owns the tappable element -- this card is only
   *  ever presentational) to name itself from the title and describe itself from the meta line,
   *  rather than reading the whole card as one run-on string (M14c-b audit P2). Keyed by the
   *  wod's own id, unique per rendered card in every grid this component appears in. */
  titleId = computed(() => `pc-title-${this.wod().id}`);
  descId = computed(() => `pc-desc-${this.wod().id}`);

  kindLabel = computed(() => { const k = this.benchmarkKind(); return k ? BENCHMARK_KIND_LABELS[k] ?? k : ''; });
  scoreLabel = computed(() => SCORE_TYPE_LABELS[this.wod().scoreType] ?? '');
  lines = computed(() => {
    const all = prescriptionLines(this.wod(), this.weightUnit() ?? undefined);
    return { shown: all.slice(0, CARD_LINE_BUDGET), more: Math.max(0, all.length - CARD_LINE_BUDGET) };
  });
}

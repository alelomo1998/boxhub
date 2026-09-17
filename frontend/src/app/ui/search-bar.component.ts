import { Component, DestroyRef, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { IconComponent } from './icon.component';

let seq = 0;

/**
 * A debounced search field. members.page fired one request per keystroke — filed in
 * docs/BACKLOG.md — which on a slow connection also means responses arriving out of order.
 *
 * The bound value updates on every keystroke so the input is never laggy; only the `search` output
 * is debounced, and it does not re-emit an unchanged term.
 */
@Component({
  selector: 'bh-search-bar',
  standalone: true,
  imports: [IconComponent],
  host: { '[class.stretch]': 'stretch()' },
  template: `
    <div class="sb" [class.stretch]="stretch()">
      <label class="sr" [attr.for]="id">{{ label() }}</label>
      <bh-icon name="search" [size]="16" />
      <input class="in" [id]="id" type="search" [value]="value()"
             [placeholder]="placeholder()"
             [attr.data-testid]="testId() || null"
             (input)="onInput($any($event.target).value)" />
    </div>`,
  styles: [`
    :host(.stretch) { display: block; }
    .sb { display: flex; align-items: center; gap: var(--sp-2); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 0 var(--sp-4);
      min-height: var(--tap); max-width: 340px; color: var(--faint); }
    /* stretch: fills whatever width the host's flex/grid context already gave it, instead of
       capping at 340px (M14c-b audit P2) -- default false leaves every existing consumer identical. */
    .sb.stretch { max-width: none; width: 100%; box-sizing: border-box; }
    .sb:focus-within { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .in { flex: 1; min-width: 0; background: none; border: none; color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); min-height: var(--tap); }
    .in:focus { outline: none; } /* the ring is on .sb, so the control reads as one thing */
    /* --faint on --surface-2 measures 4.27:1, under AA's 4.5:1 floor — --bone-dim clears it
       (7.18:1) and stays visually secondary to entered text (--bone, 14.46:1). */
    .in::placeholder { color: var(--bone-dim); }
    /* A visible label above a search field costs a line and buys nothing; the placeholder is not
       an accessible name, so the real label is present and visually hidden. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
      white-space: nowrap; }
  `],
})
export class SearchBarComponent {
  placeholder = input('');
  label = input('');
  debounceMs = input(250);
  testId = input('');
  /** Fills the row instead of capping at 340px (M14c-b audit P2: Library's search left a wide gap
   *  before the filter/+ buttons). Default false keeps every other consumer's layout unchanged. */
  stretch = input(false);
  value = model('');
  search = output<string>();

  readonly id = `bh-sb${seq++}`;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastEmitted = signal<string | null>(null);
  private lastTyped: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    // A value the consumer sets (e.g. a "Clear search" action) is the new baseline: without this,
    // retyping the query that was showing before the reset matched lastEmitted and never emitted.
    effect(() => {
      const v = this.value();
      untracked(() => { if (v !== this.lastTyped) { clearTimeout(this.timer); this.lastEmitted.set(v); } });
    });
  }

  onInput(v: string) {
    this.lastTyped = v;
    this.value.set(v); // immediate: the field must never lag behind typing
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.lastEmitted() === v) return;
      this.lastEmitted.set(v);
      this.search.emit(v);
    }, this.debounceMs());
  }
}

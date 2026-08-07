import { Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/**
 * The empty state. Law §11.6 makes this mandatory for every fetch — a list that renders nothing
 * when it has nothing is indistinguishable from a list that failed.
 *
 * Deliberately not a live region — an empty state is not an alert. A screen that swaps a results
 * list for `bh-empty` after a fetch must announce the change itself, typically by wrapping the
 * results region in `aria-live="polite"`.
 */
@Component({
  selector: 'bh-empty',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="empty">
      <bh-icon [name]="icon()" [size]="28" />
      @if (title()) { <p class="t">{{ title() }}</p> }
      @if (message()) { <p class="m">{{ message() }}</p> }
      <ng-content />
    </div>`,
  styles: [`
    .empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
      padding: var(--sp-8) var(--sp-4); text-align: center; color: var(--bone-dim); }
    bh-icon { color: var(--faint); }
    .t { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      color: var(--bone); margin: 0; }
    .m { margin: 0; font-size: var(--fs-sm); max-width: 34ch; }
  `],
})
export class EmptyComponent {
  icon = input<IconName>('inbox');
  title = input('');
  message = input('');
}

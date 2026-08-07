import { Component, computed, input } from '@angular/core';

/**
 * The top bar, shared by all three shells. It owns the bar and the brand block only — NOT the page
 * layout, because there isn't a shared one: athlete and coach are flex columns, admin is a grid
 * with a side nav and a PENDING banner. One shell component would have fitted none of them.
 */
@Component({
  selector: 'bh-shell-header',
  standalone: true,
  template: `
    <header class="top">
      <div class="brand">
        <span class="mark" aria-hidden="true">{{ initial() }}</span>
        <span class="bn">{{ boxName() }}</span>
      </div>
      @if (area()) { <span class="area">{{ area() }}</span> }
      <ng-content select="[nav]" />
      <div class="acts"><ng-content select="[actions]" /></div>
    </header>`,
  styles: [`
    .top { display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-5); border-bottom: 1px solid var(--hairline);
      position: sticky; top: 0; z-index: 20; background: var(--ground); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    /* The one volt element in the chrome. It is the box's identity, not an accent — but law §2.3
       still budgets it, which is why the wordmark renders monochrome in app chrome (law §10.2). */
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      flex-shrink: 0; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .area { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .acts { display: flex; gap: 2px; margin-left: auto; }
  `],
})
export class ShellHeaderComponent {
  boxName = input.required<string>();
  /** Rendered as a mono eyebrow beside the box name — "Coach", "Admin". Empty for athlete. */
  area = input('');

  /* The badge beside a box's name is the box's own initial. It used to be a hardcoded "B" for
     BoxHub, which survived the rename because a single letter does not look like a brand string —
     the same way the mail subject lines did. */
  initial = computed(() => (this.boxName() || '').trim().charAt(0).toUpperCase());
}

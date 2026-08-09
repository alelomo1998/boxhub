import { Component, input } from '@angular/core';
import { BRAND_NAME } from '../core/brand';

/**
 * The rxed wordmark: "rx" plain, "ed" inside the volt highlighter block — the same inversion
 * device the rest of the product runs on, so the logo is not a separate visual idea.
 *
 * It is type rather than an SVG asset, so it renders in the product's own webfont, inherits the
 * tokens, and scales without an export step.
 *
 * `variant` is not decoration. A volt-filled logo in the app header is a second volt element
 * competing with the screen's actual primary action, which design law v3 §2.3 forbids — so app
 * chrome gets `chrome` (monochrome bone) and only login, mail, the landing site and the TV idle
 * screen get `hero`. See spec §10.2.
 */
@Component({
  selector: 'bh-wordmark',
  standalone: true,
  template: `
    <!-- The visible glyphs are split across two elements purely so the highlighter can sit behind
         "ed", so they are hidden from assistive tech and the accessible name comes from the one
         visually-hidden span. Without aria-hidden a screen reader announces the name twice. -->
    <span class="wm" [class.hero]="variant() === 'hero'" [attr.data-size]="size()">
      <span class="a" aria-hidden="true">rx</span><span class="b" aria-hidden="true">ed</span>
      <span class="sr">{{ brand }}</span>
    </span>
  `,
  styles: [`
    .wm { display: inline-flex; align-items: baseline; font-family: var(--font-mono);
      font-weight: 700; letter-spacing: -0.05em; line-height: 1; color: var(--bone);
      user-select: none; position: relative; }
    .wm[data-size="sm"] { font-size: var(--fs-h2); }
    .wm[data-size="md"] { font-size: var(--fs-display); }
    .wm[data-size="lg"] { font-size: var(--fs-hero); }
    .b { background: var(--bone); color: var(--ground); padding: 0.06em 0.1em;
      border-radius: var(--r-xs); margin-left: 0.02em; }
    .wm.hero .b { background: var(--volt); color: var(--on-volt); }
    /* The visible letters live in two elements and would otherwise announce as two words. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class WordmarkComponent {
  variant = input<'chrome' | 'hero'>('chrome');
  size = input<'sm' | 'md' | 'lg'>('sm');
  protected readonly brand = BRAND_NAME;
}

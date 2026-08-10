import { Component, input } from '@angular/core';
import { WordmarkComponent } from './wordmark.component';

/**
 * The frame every auth screen sits in. Ten consumers on day one; before this, nine files each
 * carried a copy-pasted `.auth` / `.card` block.
 *
 * Two variants, assigned PER SCREEN and never per state (spec §2.1). Four of the screens change
 * shape as they run — forgot is a form until submitted, verify goes pending -> expired, reset has
 * an expired branch, join has an invalid branch — and keying the variant on state would make them
 * change layout mid-flight.
 *
 *  - `split`  — brand panel left, form right, above 720px. login / signup / start-box / join: the
 *               four screens a stranger arrives at from OUTSIDE the app.
 *  - `narrow` — one centred column at every width. The six mid-flow screens.
 *
 * Below 720px `split` collapses to `narrow`'s stacking, with the panel content ABOVE the form.
 * The panel is never dropped — see the spec's §2.2 and this component's spec file.
 *
 * The panel carries the SCREEN'S OWN eyebrow + headline, never a brand claim. That is deliberate:
 * a product claim written here would be written again when M19's landing site settles it.
 *
 * `.wrap` only ever centres (both axes, every width, both variants) — it must never set
 * `flex-direction: row`. The axis-flip for `split` lives on the inner `.card` instead. Those two
 * concerns were on the same element once; `.wrap` centred for the column direction and the
 * `≥720px` block flipped it to row but never re-declared `justify-content`, so it silently
 * centred on the new horizontal axis instead of filling it — 208px of dead background on each
 * side at 1440px. Splitting them is the fix, not just a value change: it is now structurally
 * impossible for a direction change to smuggle in an alignment change.
 */
@Component({
  selector: 'bh-auth-layout',
  standalone: true,
  imports: [WordmarkComponent],
  template: `
    <main class="wrap" [attr.data-variant]="variant()">
      <div class="card">
        <div class="panel">
          <bh-wordmark variant="hero" size="md" />
          <div class="panel-copy"><ng-content select="[panel]" /></div>
        </div>
        <div class="body"><ng-content /></div>
      </div>
    </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: var(--sp-6) var(--sp-4); }

    /* Plain stacked column is the base case for BOTH variants — narrow at every width, split
       below 720px. 420px is this codebase's existing form-column width (box-picker, settings,
       subscriptions, box-stripe all use it) — following the convention rather than inventing a
       number. No border/background/radius here: bounding the card visually is a split-only,
       desktop-only choice below. */
    .card { display: flex; flex-direction: column; width: 100%; max-width: 420px;
      gap: var(--sp-6); }
    .panel { display: flex; flex-direction: column; gap: var(--sp-6); }
    .panel-copy { display: flex; flex-direction: column; gap: var(--sp-2); }
    .body { display: flex; flex-direction: column; gap: var(--sp-4); }

    /* 720px is this codebase's breakpoint — 8 uses of max-width:720px, 6 of 719px, 1 of
       min-width:720px. Do not introduce a new one. Split only: narrow stays the plain column
       at every width. min-height, not height — login's tallest state adds an error alert plus a
       resend button and its own error; a fixed height would clip or overlap them, so the card
       must be free to grow past 480px with content. overflow:hidden keeps the panel's square
       corners from poking through the card's rounded border. */
    @media (min-width: 720px) {
      .wrap[data-variant="split"] .card { flex-direction: row; max-width: 760px; gap: 0;
        min-height: 480px; border: 1px solid var(--hairline); border-radius: var(--r-card);
        overflow: hidden; }
      .wrap[data-variant="split"] .panel { flex: 0 0 46%; justify-content: space-between;
        background: var(--surface); padding: var(--sp-8); }
      .wrap[data-variant="split"] .body { flex: 1; justify-content: center; padding: var(--sp-8); }
    }
  `],
})
export class AuthLayoutComponent {
  variant = input<'split' | 'narrow'>('narrow');
}

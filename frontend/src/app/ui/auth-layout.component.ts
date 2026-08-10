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
 */
@Component({
  selector: 'bh-auth-layout',
  standalone: true,
  imports: [WordmarkComponent],
  template: `
    <main class="wrap" [attr.data-variant]="variant()">
      <div class="panel">
        <bh-wordmark variant="hero" size="md" />
        <div class="panel-copy"><ng-content select="[panel]" /></div>
      </div>
      <div class="body"><ng-content /></div>
    </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
      gap: var(--sp-6); padding: var(--sp-6) var(--sp-4); }
    .panel { display: flex; flex-direction: column; gap: var(--sp-6); }
    .panel-copy { display: flex; flex-direction: column; gap: var(--sp-2); }
    .body { display: flex; flex-direction: column; gap: var(--sp-4); }

    /* Stacked-and-centred is the base case, so phone needs no override and the narrow variant
       needs no rules at all. Only the split's desktop form is an addition. */
    .wrap[data-variant="narrow"], .wrap[data-variant="split"] {
      align-items: stretch; max-width: 420px; margin: 0 auto; }

    /* 720px is this codebase's breakpoint — 8 uses of max-width:720px, 6 of 719px, 1 of
       min-width:720px. Do not introduce a new one. */
    @media (min-width: 720px) {
      .wrap[data-variant="split"] { flex-direction: row; align-items: stretch; max-width: none;
        margin: 0; padding: 0; gap: 0; }
      .wrap[data-variant="split"] .panel { flex: 0 0 42%; justify-content: space-between;
        background: var(--surface); border-right: 1px solid var(--hairline);
        padding: var(--sp-8); }
      .wrap[data-variant="split"] .body { flex: 1; justify-content: center;
        max-width: 420px; padding: var(--sp-8); }
    }
  `],
})
export class AuthLayoutComponent {
  variant = input<'split' | 'narrow'>('narrow');
}

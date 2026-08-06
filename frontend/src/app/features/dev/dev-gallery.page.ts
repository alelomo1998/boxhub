import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WordmarkComponent } from '../../ui/wordmark.component';
import { ProofWodBoardComponent } from './proof-wod-board.component';

/**
 * Unlisted, unguarded route at `/app/dev/components` — where M13b's design language is proven
 * against the real app before M13c builds ~22 components against it. Real CSP, real self-hosted
 * fonts, real tokens, real Angular: a static mockup cannot catch a font 404 under the app's own
 * CSP, which is exactly what happened in M5.5.
 *
 * No API call, no guard: fabricated data only, reachable on a real device to check the fonts
 * actually load. Unlinked from the rest of the product. Deletion at launch is filed in
 * docs/BACKLOG.md. Task 10 adds a second proof; M13c grows this into the full gallery.
 */
@Component({
  selector: 'bh-dev-gallery',
  standalone: true,
  imports: [WordmarkComponent, ProofWodBoardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="gallery">
      <header class="gallery-head">
        <bh-wordmark variant="chrome" size="md" />
        <h1 class="t-h2" i18n="Dev gallery page heading">Design language proof</h1>
      </header>
      <section>
        <h2 class="t-eyebrow" i18n="Section label above the WOD board proof">WOD board</h2>
        <bh-proof-wod-board />
      </section>
    </div>
  `,
  styles: [`
    .gallery { max-width: 720px; margin: 0 auto; padding: var(--sp-6) var(--sp-4);
      display: flex; flex-direction: column; gap: var(--sp-6); }
    .gallery-head { display: flex; align-items: center; gap: var(--sp-4); }
    .gallery-head h1 { margin: 0; color: var(--bone); }
  `],
})
export class DevGalleryPage {}

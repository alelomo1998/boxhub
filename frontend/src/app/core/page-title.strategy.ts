import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BRAND_NAME } from './brand';

/**
 * The browser tab follows the route instead of being stamped once at boot.
 *
 * Before this, `AppComponent` called `setTitle(BRAND_NAME)` in its constructor and nothing ever
 * changed it, so every screen in the product shared one tab title — which makes several tabs of the
 * same app indistinguishable, and makes browser history and bookmarks useless.
 *
 * Format is `Page · rxed`, and a route with no `title` falls back to the brand alone. The brand
 * comes from {@link BRAND_NAME} rather than a literal, so a future rename stays a one-value change.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${BRAND_NAME}` : BRAND_NAME);
  }
}

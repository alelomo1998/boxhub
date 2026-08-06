import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<router-outlet />`,
})
export class AppComponent {
  // The tab title belongs to PageTitleStrategy (core/page-title.strategy.ts), which runs on every
  // navigation and renders "Page · rxed". This component used to call setTitle(BRAND_NAME) once in
  // its constructor, which is exactly why every screen in the product shared one tab title.
  //
  // index.html's static <title> still renders before Angular boots — raw HTML cannot read a TS
  // constant — and stays in sync with BRAND_NAME by hand.
}

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { BRAND_NAME } from './core/brand';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<router-outlet />`,
})
export class AppComponent {
  // index.html's static <title> is what renders before this component ever runs (unavoidable —
  // raw HTML can't read a TS constant) and is kept in sync with BRAND_NAME by hand. This call
  // makes BRAND_NAME the source of truth from here on, so a rename only requires editing one file
  // plus the pre-boot fallback in index.html.
  constructor() {
    inject(Title).setTitle(BRAND_NAME);
  }
}

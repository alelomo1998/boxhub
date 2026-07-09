import { Component } from '@angular/core';

@Component({
  selector: 'bh-tag',
  standalone: true,
  template: `<span class="tag"><ng-content /></span>`,
  styles: [`.tag { font-family: var(--font-mono); font-size: 12px; color: var(--bone-dim); letter-spacing: 0.04em; }`],
})
export class TagComponent {}

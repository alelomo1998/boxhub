import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'bh-rail',
  standalone: true,
  template: `<nav class="rail"><ng-content /></nav>`,
  styles: [`
    .rail { border-right: 1px solid var(--hairline); padding: var(--sp-5) var(--sp-4);
      display: flex; flex-direction: column; gap: 3px; }
    @media (max-width: 720px) {
      .rail { flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--hairline); }
    }
  `],
})
export class RailComponent {}

@Component({
  selector: 'bh-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (link) {
      <a class="nav-item" [class.active]="active" [routerLink]="link" routerLinkActive="active">{{ label }}</a>
    } @else {
      <span class="nav-item" [class.active]="active">{{ label }}</span>
    }`,
  styles: [`
    .nav-item { display: block; padding: 9px 12px; border-radius: var(--edge); color: var(--bone-dim);
      font-size: 14px; font-weight: 500; border-left: 2px solid transparent; margin-left: -2px; cursor: pointer; }
    .nav-item.active { background: var(--surface-2); color: var(--bone); border-left-color: var(--red); }
  `],
})
export class NavItemComponent {
  @Input() label = '';
  @Input() active = false;
  @Input() link?: string;
}

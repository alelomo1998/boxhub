import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent, IconName } from './icon.component';

export interface DockTab { link: string; label: string; icon: IconName; }

/**
 * The floating pill dock — mobile primary navigation for all three shells. Absorbs the global
 * .bh-dock / .bh-dock-item classes from styles.scss.
 *
 * A dock item is an icon AND a text label, never an icon alone: the placeholder set this replaces
 * used "$" for Plan and "▮▮" for Home, which is the argument in one glyph.
 *
 * The shadow is sanctioned — law §5 permits shadows on things that physically float, and the dock
 * is one of the three.
 */
@Component({
  selector: 'bh-dock',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="dock" [attr.aria-label]="label()">
      @for (t of tabs(); track t.link) {
        <a class="item" [routerLink]="t.link" routerLinkActive="active"
           ariaCurrentWhenActive="page">
          <bh-icon [name]="t.icon" [size]="20" />
          <span class="tlabel">{{ t.label }}</span>
        </a>
      }
      <ng-content />
    </nav>`,
  styles: [`
    .dock { display: none; }
    @media (max-width: 719px) {
      .dock { position: fixed; left: var(--sp-4); right: var(--sp-4);
        bottom: calc(var(--sp-3) + env(safe-area-inset-bottom)); z-index: 30;
        display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px;
        background: var(--surface); border: 1px solid var(--hairline);
        border-radius: var(--r-full); padding: 6px; box-shadow: var(--shadow-float);
        max-width: 480px; margin: 0 auto; }
      .item, ::ng-deep .dock > button { display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 3px; min-height: 56px; border-radius: var(--r-full);
        color: var(--bone-dim); text-decoration: none; background: none; border: none;
        cursor: pointer; font: inherit; }
      .tlabel, ::ng-deep .dock > button .tlabel { font-family: var(--font-mono);
        font-size: var(--fs-meta); letter-spacing: 0.08em; text-transform: uppercase; }
      .item.active { background: var(--surface-2); color: var(--bone); }
      .item.active bh-icon { color: var(--volt); }
      .item:focus-visible, ::ng-deep .dock > button:focus-visible {
        outline: 2px solid var(--focus); outline-offset: -2px; }
    }
  `],
})
export class DockComponent {
  tabs = input.required<DockTab[]>();
  label = input('');
}

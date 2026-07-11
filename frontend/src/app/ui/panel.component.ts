import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-panel',
  standalone: true,
  template: `<div class="panel" [class.padded]="padded"><ng-content /></div>`,
  styles: [`
    .panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); }
    .panel.padded { padding: var(--sp-6); }
  `],
})
export class PanelComponent { @Input() padded = true; }

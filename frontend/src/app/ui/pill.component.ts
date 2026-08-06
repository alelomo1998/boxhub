import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'bh-pill',
  standalone: true,
  template: `<span class="pill {{ tone }}"><span class="d"></span>{{ label }}</span>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
      border-radius: var(--r-full); font-size: 12px; font-weight: 600; border: 1px solid transparent; }
    .d { width: 6px; height: 6px; border-radius: 50%; }
    .active { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent);
      background: color-mix(in srgb, var(--good) 13%, transparent); }
    .active .d { background: var(--good); }
    .suspended { color: var(--faint); border-color: var(--hairline); }
    .suspended .d { background: var(--faint); }
    .warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 34%, transparent);
      background: color-mix(in srgb, var(--warn) 14%, transparent); }
    .warn .d { background: var(--warn); }
    .live { color: var(--on-volt); background: var(--volt); }
    .live .d { background: var(--on-volt); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  `],
})
export class PillComponent {
  @Input() tone: 'active' | 'suspended' | 'live' | 'warn' = 'active';
  @Input() label = '';
}

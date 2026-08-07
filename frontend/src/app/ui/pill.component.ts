import { Component, input } from '@angular/core';

@Component({
  selector: 'bh-pill',
  standalone: true,
  template: `<span class="pill {{ tone() }}"><span class="d"></span>{{ label() }}</span>`,
  styles: [`
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
      border-radius: var(--r-full); font-size: var(--fs-sm); font-weight: 600; border: 1px solid transparent; }
    .d { width: 6px; height: 6px; border-radius: 50%; }
    .active { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent);
      background: color-mix(in srgb, var(--good) 13%, transparent); }
    .active .d { background: var(--good); }
    .suspended { color: var(--faint); border-color: var(--hairline); }
    .suspended .d { background: var(--faint); }
    .warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 34%, transparent);
      background: color-mix(in srgb, var(--warn) 14%, transparent); }
    .warn .d { background: var(--warn); }
    .danger { color: var(--on-danger); background: var(--danger); }
    .danger .d { background: var(--on-danger); }
    .live { color: var(--on-volt); background: var(--volt); }
    .live .d { background: var(--on-volt); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    @media (prefers-reduced-motion: reduce) { .live .d { animation: none; } }
  `],
})
export class PillComponent {
  tone = input<'active' | 'suspended' | 'live' | 'warn' | 'danger'>('active');
  label = input('');
}

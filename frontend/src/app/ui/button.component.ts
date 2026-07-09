import { Component, Input } from '@angular/core';

@Component({
  selector: 'bh-button',
  standalone: true,
  template: `<button [type]="type" [class]="'btn ' + variant + ' ' + size" [disabled]="disabled"><ng-content /></button>`,
  styles: [`
    .btn { border: none; border-radius: var(--edge); font-family: var(--font-body);
      font-weight: 700; font-size: 14px; letter-spacing: 0.01em; cursor: pointer; }
    .btn.sm { padding: 8px 13px; font-size: 13px; }
    .btn.md { padding: 11px 17px; }
    .btn.primary { background: var(--red); color: var(--on-red); transition: box-shadow .18s; }
    .btn.primary:hover:not(:disabled) { box-shadow: 0 6px 24px var(--red-glow); }
    .btn.ghost { background: transparent; color: var(--bone); border: 1px solid var(--hairline); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
  `],
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'ghost' = 'primary';
  @Input() size: 'md' | 'sm' = 'md';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
}

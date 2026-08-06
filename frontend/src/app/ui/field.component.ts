import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'bh-field',
  standalone: true,
  template: `
    <label class="field">
      <span class="lab">{{ label }}</span>
      <input class="input" [type]="type" [value]="value" [placeholder]="placeholder"
             (input)="valueChange.emit($any($event.target).value)" />
      @if (error) { <span class="err">{{ error }}</span> }
    </label>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .input { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 11px 13px; color: var(--bone);
      font-family: var(--font-body); font-size: 15px; }
    .input::placeholder { color: var(--faint); }
    .input:focus { border-color: var(--volt); outline: 2px solid var(--focus); outline-offset: 2px; }
    .err { color: var(--danger); font-size: 12px; }
  `],
})
export class FieldComponent {
  @Input() label = '';
  @Input() type = 'text';
  @Input() value = '';
  @Input() placeholder = '';
  @Input() error?: string;
  @Output() valueChange = new EventEmitter<string>();
}

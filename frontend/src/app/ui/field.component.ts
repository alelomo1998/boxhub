import { Component, computed, input, model } from '@angular/core';

let seq = 0;

/**
 * The product's text input. This component existed before M13c and NOTHING imported it — screens
 * used a global `.bh-input` class instead, and the two drifted apart on padding while both claimed
 * to be the app's text input. There is now one implementation.
 *
 * The label is wired with for/id rather than by wrapping, because an error message needs
 * aria-describedby and that needs an id anyway.
 */
@Component({
  selector: 'bh-field',
  standalone: true,
  template: `
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <input class="input" [id]="id" [type]="type()" [value]="value()"
             [placeholder]="placeholder()" [disabled]="disabled()"
             [attr.aria-invalid]="!!error()"
             [attr.aria-describedby]="error() ? id + '-err' : null"
             [attr.data-testid]="testId() || null"
             (input)="value.set($any($event.target).value)" />
      @if (error()) {
        <span class="err" [id]="id + '-err'" role="alert">{{ error() }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .input { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 13px; min-height: var(--tap); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); width: 100%; }
    .input::placeholder { color: var(--faint); }
    .input:hover:not(:disabled) { border-color: var(--faint); }
    .input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .input:disabled { color: var(--disabled); cursor: not-allowed; }
    .input[aria-invalid="true"] { border-color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-meta); }
  `],
})
export class FieldComponent {
  label = input('');
  type = input('text');
  value = model('');
  placeholder = input('');
  error = input<string | undefined>(undefined);
  disabled = input(false);
  testId = input('');

  /** Per-instance, so two fields on one screen never collide on for/id or aria-describedby. */
  readonly id = `bh-f${seq++}`;
}

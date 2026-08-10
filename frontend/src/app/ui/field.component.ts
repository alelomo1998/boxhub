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
      <div class="lab-row">
        <label class="lab" [attr.for]="id">{{ label() }}</label>
        <ng-content select="[labelAction]" />
      </div>
      <input class="input" [id]="id" [type]="type()" [value]="value()"
             [attr.name]="name() || null"
             [attr.autocomplete]="autocomplete() || null"
             [required]="required()"
             [placeholder]="placeholder()" [disabled]="disabled()"
             [attr.aria-invalid]="!!error()"
             [attr.aria-describedby]="error() ? id + '-err' : null"
             [attr.data-testid]="testId() || null"
             (input)="value.set($any($event.target).value)" />
      @for (msg of errors(); track msg) {
        <span class="err" [id]="id + '-err'" role="alert">{{ msg }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: var(--sp-1); }
    .lab-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-2); }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .input { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 var(--sp-3); min-height: var(--tap); color: var(--bone);
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
  name = input('');
  autocomplete = input('');
  required = input(false);

  /** Per-instance, so two fields on one screen never collide on for/id or aria-describedby. */
  readonly id = `bh-f${seq++}`;

  /**
   * A 0-or-1 array tracked BY THE MESSAGE, not an @if. A changed message is a different track
   * key, therefore a new node, therefore a fresh insertion — which is the only way role="alert"
   * announces reliably. @if only remounts across the falsy<->truthy boundary, so a second,
   * different validation message was silent. Filed against M13d in docs/BACKLOG.md.
   */
  protected readonly errors = computed(() => (this.error() ? [this.error()!] : []));
}

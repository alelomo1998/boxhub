import { Component, input, model } from '@angular/core';

let seq = 0;

/** The product's select. Options are projected, so callers keep full control of their contents. */
@Component({
  selector: 'bh-select',
  standalone: true,
  template: `
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <select class="sel" [id]="id" [disabled]="disabled()"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="error() ? id + '-err' : null"
              [attr.data-testid]="testId() || null"
              [value]="value()" (change)="value.set($any($event.target).value)">
        <ng-content />
      </select>
      @if (error()) {
        <span class="err" [id]="id + '-err'" role="alert">{{ error() }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .sel { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 13px; min-height: var(--tap); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); width: 100%; cursor: pointer; }
    .sel:hover:not(:disabled) { border-color: var(--faint); }
    .sel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .sel:disabled { color: var(--disabled); cursor: not-allowed; }
    .sel[aria-invalid="true"] { border-color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-meta); }
  `],
})
export class SelectComponent {
  label = input('');
  value = model('');
  error = input<string | undefined>(undefined);
  disabled = input(false);
  testId = input('');
  readonly id = `bh-s${seq++}`;
}

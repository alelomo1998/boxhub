import { AfterContentChecked, Component, computed, ElementRef, input, model, viewChild } from '@angular/core';

let seq = 0;

/** The product's select. Options are projected, so callers keep full control of their contents. */
@Component({
  selector: 'bh-select',
  standalone: true,
  template: `
    <div class="field">
      <label class="lab" [attr.for]="id">{{ label() }}</label>
      <select #sel class="sel" [id]="id" [disabled]="disabled()"
              [attr.name]="name() || null"
              [required]="required()"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="error() ? id + '-err' : null"
              [attr.data-testid]="testId() || null"
              [value]="value()" (change)="value.set($any($event.target).value)">
        <ng-content />
      </select>
      @for (msg of errors(); track msg) {
        <span class="err" [id]="id + '-err'" role="alert">{{ msg }}</span>
      }
    </div>`,
  styles: [`
    .field { display: flex; flex-direction: column; gap: var(--sp-1); }
    .lab { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); }
    .sel { background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 0 var(--sp-3); min-height: var(--tap); color: var(--bone);
      font-family: var(--font-body); font-size: var(--fs-body); width: 100%; cursor: pointer; }
    .sel:hover:not(:disabled) { border-color: var(--faint); }
    .sel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-color: var(--volt); }
    .sel:disabled { color: var(--disabled); cursor: not-allowed; }
    .sel[aria-invalid="true"] { border-color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-meta); }
  `],
})
export class SelectComponent implements AfterContentChecked {
  label = input('');
  value = model('');
  error = input<string | undefined>(undefined);
  disabled = input(false);
  testId = input('');
  name = input('');
  required = input(false);
  readonly id = `bh-s${seq++}`;

  /**
   * A 0-or-1 array tracked BY THE MESSAGE, not an @if. A changed message is a different track
   * key, therefore a new node, therefore a fresh insertion — which is the only way role="alert"
   * announces reliably. @if only remounts across the falsy<->truthy boundary, so a second,
   * different validation message was silent. Filed against M13d in docs/BACKLOG.md.
   */
  protected readonly errors = computed(() => (this.error() ? [this.error()!] : []));

  private readonly selectEl = viewChild.required<ElementRef<HTMLSelectElement>>('sel');

  // Options arrive via <ng-content />, so when a consumer populates them asynchronously (the
  // normal shape for API-backed data), [value] binds before the matching <option> exists and
  // the browser silently keeps its default first-option selection — it never self-corrects.
  //
  // afterRenderEffect looked like the obvious tool but doesn't fit: it's signal-dependency-gated
  // like effect() (confirmed by reading Angular 22's own source — AFTER_RENDER_PHASE_EFFECT_NODE
  // .phaseFn bails via `if (!this.dirty) return` unless a producer it read last time changed), so
  // it never reruns just because the parent repopulated projected <option>s — nothing signal-typed
  // changed. ngDoCheck() was tried next and also doesn't fit, for the opposite reason: it fires
  // unconditionally but too early — verified empirically that it runs before the parent has
  // finished updating projected content, so it still sees the stale/empty option list.
  // ngAfterContentChecked is the one hook Angular defines specifically as "runs after Angular
  // checks the content projected into the directive" — verified empirically that by the time it
  // fires the projected <option>s already reflect the new data, on the very render they arrive.
  // The equality guard stops it from fighting a selection the user just made.
  ngAfterContentChecked(): void {
    const el = this.selectEl().nativeElement;
    const v = this.value();
    if (el.value !== v) {
      el.value = v;
    }
  }
}

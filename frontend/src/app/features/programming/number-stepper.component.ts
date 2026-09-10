import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  inject,
  input,
  model,
} from '@angular/core';

/**
 * A numeric stepper for the piece editor's reps / load / seconds / rounds fields — user-ruled
 * 2026-09-10: those fields take numbers only, and the mobile keyboard is the wrong way to enter
 * one. `[−] [ 21 ] [+]`, where the middle IS a real `<input>` you can still tap and type into;
 * holding either button repeats.
 *
 * Feature-local rather than in ui/, same reasoning as pick-sheet.component.ts above it in this
 * file: it composes for one feature area, and ui/ membership carries the dev-gallery +
 * visual-baseline contract that a single consumer does not earn. Promote it if a third feature
 * consumes it.
 *
 * `value` is a RAW STRING, not a number, and renders verbatim. WodLine.reps/.load are strings on
 * the wire and stay that way, and wods already in the library carry free-text reps ("21-15-9",
 * "max") written under the old rule — coercing to a number here would silently blank those on
 * open. So this component only constrains what the coach *types* and what the buttons *produce*:
 * a value that doesn't parse as a finite number disables both buttons and renders untouched, and
 * starts parsing again the moment it's edited.
 */
@Component({
  selector: 'bh-number-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (label()) { <span class="label">{{ label() }}</span> }
      <div class="row">
        <button type="button" class="btn" [attr.data-testid]="testId() ? testId() + '-dec' : null"
                [attr.aria-label]="decreaseAriaLabel()" [disabled]="disabled() || decDisabled()"
                (pointerdown)="onPointerDown(-1)" (pointerup)="stopRepeat()"
                (pointercancel)="stopRepeat()" (pointerleave)="stopRepeat()">&minus;</button>
        <input class="in" type="text" [attr.inputmode]="allowDecimal() ? 'decimal' : 'numeric'"
               [value]="value()" [disabled]="disabled()"
               [attr.aria-label]="ariaLabel()" [attr.data-testid]="testId() || null"
               (input)="onInput($event)" />
        <button type="button" class="btn" [attr.data-testid]="testId() ? testId() + '-inc' : null"
                [attr.aria-label]="increaseAriaLabel()" [disabled]="disabled() || incDisabled()"
                (pointerdown)="onPointerDown(1)" (pointerup)="stopRepeat()"
                (pointercancel)="stopRepeat()" (pointerleave)="stopRepeat()">+</button>
        @if (suffix()) { <span class="suffix">{{ suffix() }}</span> }
      </div>
    </div>`,
  styles: [`
    :host { display: block; }
    .wrap { min-width: 0; }
    .label { display: block; font-family: var(--font-mono); font-size: var(--fs-meta);
      color: var(--bone-dim); letter-spacing: 0.06em; margin-bottom: var(--sp-1); }
    .row { display: flex; align-items: stretch; gap: var(--sp-2); min-width: 0; }
    .btn { flex: 0 0 auto; min-width: var(--tap); min-height: var(--tap);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      color: var(--bone); font-family: var(--font-mono); font-size: var(--fs-body);
      cursor: pointer; }
    .btn:disabled { color: var(--disabled); border-color: var(--hairline); cursor: not-allowed; }
    .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .in { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); color: var(--bone); font-family: var(--font-mono);
      font-variant-numeric: tabular-nums; font-size: var(--fs-body); text-align: center;
      min-height: var(--tap); }
    .in:disabled { color: var(--disabled); }
    .in:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .suffix { flex: 0 0 auto; align-self: center; font-family: var(--font-mono);
      font-size: var(--fs-meta); color: var(--bone-dim); }
  `],
})
export class NumberStepperComponent implements OnDestroy {
  value = model<string>('');
  min = input<number | null>(null);
  max = input<number | null>(null);
  step = input(1);
  allowDecimal = input(false);
  suffix = input('');
  label = input('');
  ariaLabel = input.required<string>();
  testId = input('');
  disabled = input(false);

  private holdTimeout: ReturnType<typeof setTimeout> | undefined;
  private holdInterval: ReturnType<typeof setInterval> | undefined;

  readonly decreaseAriaLabel = computed(() =>
    $localize`:@@numberStepper.decrease:Decrease ${this.ariaLabel()}:field:`);
  readonly increaseAriaLabel = computed(() =>
    $localize`:@@numberStepper.increase:Increase ${this.ariaLabel()}:field:`);

  /** null = doesn't parse as a finite number (buttons disabled); '' counts as 0, stepping only. */
  private readonly parsed = computed<number | null>(() => {
    const v = this.value();
    if (v === '') return 0;
    return /^\d+\.?\d*$/.test(v) ? parseFloat(v) : null;
  });

  readonly decDisabled = computed(() => {
    const p = this.parsed();
    const min = this.min();
    return p === null || (min !== null && p <= min);
  });

  readonly incDisabled = computed(() => {
    const p = this.parsed();
    const max = this.max();
    return p === null || (max !== null && p >= max);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopRepeat());
  }

  onInput(event: Event) {
    const el = event.target as HTMLInputElement;
    let filtered = '';
    let dotUsed = false;
    for (const ch of el.value) {
      if (ch >= '0' && ch <= '9') filtered += ch;
      else if (ch === '.' && this.allowDecimal() && !dotUsed) { filtered += ch; dotUsed = true; }
    }
    this.value.set(filtered);
    el.value = filtered; // a rejected keystroke must not leave the DOM and the signal disagreeing
  }

  onPointerDown(dir: 1 | -1) {
    if (this.disabled()) return;
    this.doStep(dir);
    this.holdTimeout = setTimeout(() => {
      this.holdInterval = setInterval(() => this.doStep(dir), 80);
    }, 400);
  }

  stopRepeat() {
    clearTimeout(this.holdTimeout);
    clearInterval(this.holdInterval);
  }

  ngOnDestroy() {
    this.stopRepeat();
  }

  private doStep(dir: 1 | -1) {
    const cur = this.parsed();
    if (cur === null) return;
    let next = cur + dir * this.step();
    const min = this.min();
    const max = this.max();
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
    this.value.set(String(Number(next.toFixed(10)))); // no trailing .0
  }
}

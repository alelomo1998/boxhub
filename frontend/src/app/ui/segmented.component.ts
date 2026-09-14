import { Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface SegOption { value: string; label: string; }

/**
 * A segmented control. The pre-M13c version used role="radio" with NO roving tabindex and no arrow
 * keys — filed in docs/BACKLOG.md — so every option was a tab stop and Tab walked THROUGH the group
 * instead of past it. A radiogroup is one tab stop; arrows move within it.
 */
@Component({
  selector: 'bh-segmented',
  standalone: true,
  host: { '[class.stretch]': 'stretch()' },
  template: `
    <div class="seg" role="radiogroup" [attr.aria-label]="label()"
         [class.tone-bone]="tone() === 'bone'" [class.wrap]="wrap()" [class.stretch]="stretch()">
      @for (o of options(); track o.value; let i = $index) {
        <button #opt type="button" class="opt" role="radio"
                [class.on]="o.value === value()"
                [attr.aria-checked]="o.value === value()"
                [tabIndex]="o.value === value() ? 0 : -1"
                (click)="value.set(o.value)"
                (keydown)="onKey($event, i)">{{ o.label }}</button>
      }
    </div>`,
  styles: [`
    .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-full); }
    .opt { min-height: var(--tap); padding: 0 var(--sp-4); border: none; background: transparent;
      color: var(--bone-dim); font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); border-radius: var(--r-full); cursor: pointer; }
    .opt:hover:not(.on) { color: var(--bone); }
    /* Inversion is how the design says "this one" (law §4). */
    .opt.on { background: var(--volt); color: var(--on-volt); }
    .opt:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A volt ring on the volt-filled selected segment is invisible — law §11.2. */
    .opt.on:focus-visible { outline-color: var(--focus-inv); }
    .seg.wrap { flex-wrap: wrap; }
    /* Full-width groups (e.g. a two-way split filling a card) — each option shares the row equally. */
    /* The HOST must take the row too: a content-width host leaves a 100%-wide group content-width. */
    :host(.stretch) { display: block; width: 100%; }
    .seg.stretch { display: flex; width: 100%; box-sizing: border-box; }
    .seg.stretch .opt { flex: 1 1 0; }
    .seg.tone-bone .opt.on { background: var(--bone); color: var(--on-bone); }
    /* A volt ring is invisible on volt; on a near-white bone fill it is invisible too. Both
       selected fills therefore take the inverted ring, for the same reason. */
    .seg.tone-bone .opt.on:focus-visible { outline-color: var(--focus-inv); }
  `],
})
export class SegmentedComponent {
  options = input.required<SegOption[]>();
  value = model.required<string>();
  label = input('');
  /** Selected-chip fill. 'volt' is the default so existing consumers are unchanged. Use 'bone'
   *  on a screen whose volt budget is already spent by the shell's box switcher -- a plumbing
   *  screen. --bone on --on-bone is 15.9:1 and is not volt, the same answer bh-button's `strong`
   *  variant gives to the same problem. */
  tone = input<'volt' | 'bone'>('volt');
  /** Let the group wrap onto more than one line. Five score options do not fit one line at 360px. */
  wrap = input(false);
  /** Fill the row width, each option sharing it equally. Default false keeps every current
   *  consumer's inline, content-width sizing unchanged. */
  stretch = input(false);

  private opts = viewChildren<ElementRef<HTMLButtonElement>>('opt');

  onKey(ev: KeyboardEvent, i: number) {
    const n = this.options().length;
    let next = i;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % n;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = n - 1;
    else return;

    ev.preventDefault();
    this.value.set(this.options()[next].value);
    // Selection follows focus, which is the WAI-ARIA radiogroup pattern.
    this.opts()[next]?.nativeElement.focus();
  }
}

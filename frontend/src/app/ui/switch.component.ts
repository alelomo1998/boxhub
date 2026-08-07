import { Component, input, model } from '@angular/core';

/**
 * A toggle. role="switch" on a real <button>, so Space and Enter work without any key handling of
 * our own — a div with a click listener does not.
 */
@Component({
  selector: 'bh-switch',
  standalone: true,
  template: `
    <button type="button" class="sw" role="switch" [attr.aria-checked]="checked()"
            [disabled]="disabled()" (click)="checked.set(!checked())">
      <span class="txt">
        <span class="lab">{{ label() }}</span>
        @if (hint()) { <span class="hint">{{ hint() }}</span> }
      </span>
      <span class="track" aria-hidden="true"><span class="knob"></span></span>
    </button>`,
  styles: [`
    .sw { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
      width: 100%; min-height: var(--tap); padding: 0; background: none; border: none;
      color: var(--bone); font: inherit; text-align: left; cursor: pointer; }
    .txt { display: flex; flex-direction: column; gap: 2px; }
    .lab { font-family: var(--font-body); font-size: var(--fs-body); }
    .hint { font-size: var(--fs-meta); color: var(--faint); }
    .track { width: var(--tap); height: 26px; border-radius: var(--r-full); flex-shrink: 0;
      background: var(--surface-2); border: 1px solid var(--hairline); padding: 2px;
      display: flex; transition: background var(--dur) var(--ease-out); }
    .knob { width: var(--sp-5); height: var(--sp-5); border-radius: var(--r-full); background: var(--faint);
      transition: transform var(--dur) var(--ease-out), background var(--dur) var(--ease-out); }
    .sw[aria-checked="true"] .track { background: var(--volt); border-color: var(--volt); }
    /* translateX(18px) is exact, not sloppy: border-box track content width is
       --tap(44) − 2×1px border − 2×2px padding = 38px; 38 − --sp-5(20) = 18. */
    .sw[aria-checked="true"] .knob { transform: translateX(18px); background: var(--on-volt); }
    .sw:disabled { opacity: .5; cursor: not-allowed; }
    .sw:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-ctl); }
    @media (prefers-reduced-motion: reduce) { .track, .knob { transition: none; } }
  `],
})
export class SwitchComponent {
  checked = model(false);
  label = input('');
  hint = input('');
  disabled = input(false);
}

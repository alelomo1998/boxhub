import { Component, ElementRef, ViewChild, effect, input, output, signal } from '@angular/core';

/**
 * Bottom sheet on native <dialog>: Esc-dismiss, focus containment and backdrop come free.
 * Slides up on mobile, centers on desktop. Reduced-motion: no slide, instant fade.
 * confirmClose: backdrop/Esc shows an inline "Discard entry?" bar instead of closing.
 *
 * `open` invariant: `open` is a one-way input, not a `model()` — the component only ever reads
 * it and cannot clear it. `onNativeClose()` emits `(closed)` but never touches `open()`. So every
 * caller MUST reset its own `open` signal to `false` in response to `(closed)`, or the signal
 * stays stuck `true` while the dialog is actually closed, and setting it `true` again later won't
 * re-run the effect — the sheet will not reopen. This isn't new: the old `@Input() set open` had
 * the same requirement. Current callers that reset correctly: `admin-shell.page.ts`,
 * `danger.page.ts`, `athlete-shell.page.ts`, `wod.page.ts`.
 */
@Component({
  selector: 'bh-sheet',
  standalone: true,
  template: `
    <dialog #dlg class="sheet" (close)="onNativeClose()" (cancel)="onCancel($event)"
            (click)="onBackdrop($event)" [attr.aria-label]="label()">
      <div class="grab" aria-hidden="true"></div>
      @if (title()) { <h2 class="sh-title">{{ title() }}</h2> }
      <div class="body"><ng-content /></div>
      @if (discardAsk()) {
        <div class="discard" role="alertdialog" aria-label="Discard entry?">
          <span class="d-msg">Discard your entry?</span>
          <button class="d-keep" type="button" (click)="keep()">Keep editing</button>
          <button class="d-drop" type="button" (click)="discard()">Discard</button>
        </div>
      }
    </dialog>
  `,
  styles: [`
    .sheet { border: 1px solid var(--hairline); border-radius: var(--r-lg) var(--r-lg) 0 0;
      background: var(--surface); color: var(--bone);
      padding: var(--sp-3) var(--sp-5) calc(var(--sp-6) + env(safe-area-inset-bottom));
      width: 100%; max-width: 560px; margin: auto auto 0; box-sizing: border-box;
      box-shadow: var(--shadow-float); }
    .sheet[open] { animation: rise var(--dur) var(--ease-out); }
    .sheet::backdrop { background: var(--scrim, rgba(10, 7, 4, 0.55)); } /* ::backdrop can't inherit :root vars in some engines; literal fallback mirrors the token */
    .grab { width: 44px; height: 5px; border-radius: var(--r-full); background: var(--hairline); margin: 0 auto var(--sp-4); }
    .sh-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 var(--sp-3); }
    .body { max-height: 70vh; overflow-y: auto; }
    .discard { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3);
      padding: var(--sp-2) var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface-2); }
    .d-msg { flex: 1; font-size: var(--fs-sm); }
    .d-keep, .d-drop { min-height: var(--tap); padding: 0 var(--sp-3); border-radius: var(--r-ctl);
      border: 1px solid var(--hairline); background: transparent; color: var(--bone);
      font-size: var(--fs-sm); cursor: pointer; }
    .d-drop { color: var(--danger); border-color: var(--danger); }
    .d-keep:focus-visible, .d-drop:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    @keyframes rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (min-width: 720px) {
      .sheet { border-radius: var(--r-lg); margin: auto; padding-bottom: var(--sp-5); }
      .grab { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .sheet[open] { animation: none; } }
  `],
})
export class SheetComponent {
  title = input('');
  label = input('Sheet');
  confirmClose = input(false);
  open = input(false);
  closed = output<void>();
  @ViewChild('dlg', { static: true }) dlg!: ElementRef<HTMLDialogElement>;

  discardAsk = signal(false);

  constructor() {
    // The dialog's own open/close state is driven directly off the `open` input signal — no local
    // mirror needed, since a signal already IS the up-to-date "desired" value the old @Input
    // setter used to copy into `isOpen` by hand.
    effect(() => {
      const el = this.dlg?.nativeElement;
      if (!el) return;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  onNativeClose() {
    this.discardAsk.set(false);
    if (this.open()) { this.closed.emit(); }
  }

  onCancel(ev: Event) { // Esc
    if (this.confirmClose()) { ev.preventDefault(); this.discardAsk.set(true); }
  }

  onBackdrop(ev: MouseEvent) {
    if (ev.target !== this.dlg.nativeElement) return; // click outside the content box only
    if (this.confirmClose()) this.discardAsk.set(true);
    else this.dlg.nativeElement.close();
  }

  keep() { this.discardAsk.set(false); }
  discard() { this.discardAsk.set(false); this.dlg.nativeElement.close(); }
}

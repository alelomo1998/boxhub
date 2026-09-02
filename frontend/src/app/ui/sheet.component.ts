import { Component, ElementRef, ViewChild, effect, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Bottom sheet on native <dialog>: Esc-dismiss, focus containment and backdrop come free.
 * Slides up on mobile, centers on desktop. Reduced-motion: no slide, instant fade.
 * confirmClose: backdrop/Esc shows an inline "Discard entry?" bar instead of closing.
 *
 * `open` invariant: `open` is a one-way input, not a `model()` — the component only ever reads
 * it and cannot clear it. `onNativeClose()` emits `(closed)` but never touches `open()`. So every
 * caller MUST reset its own `open` signal to `false` in response to `(closed)`, or the signal
 * stays stuck `true` while the dialog is actually closed, and setting it `true` again later won't
 * re-run the effect — the sheet will not reopen. This isn't new: the pre-M13c decorator-based
 * setter had the same requirement. Current callers that reset correctly: `admin-shell.page.ts`,
 * `danger.page.ts`, `athlete-shell.page.ts`, `wod.page.ts`.
 */
@Component({
  selector: 'bh-sheet',
  standalone: true,
  imports: [IconComponent],
  template: `
    <dialog #dlg class="sheet" (close)="onNativeClose()" (cancel)="onCancel($event)"
            (click)="onBackdrop($event)" [attr.aria-label]="label()">
      <!-- The grab handle is decoration: nothing here implements drag-to-dismiss, so it must not
           be the only exit. Plate 05 of the M23 sketch drew an explicit close control and it was
           never built — Escape and backdrop-tap worked, but neither is discoverable on a phone. -->
      <div class="grab" aria-hidden="true"></div>
      <div class="sh-head">
        @if (title()) { <h2 class="sh-title">{{ title() }}</h2> }
        <button type="button" class="sh-close" (click)="requestClose()"
                [attr.aria-label]="closeLabel()" data-testid="sheet-close">
          <bh-icon name="x" [size]="18" />
        </button>
      </div>
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
    /* The host must not be a box. A closed dialog is display:none, but the bh-sheet element around
       it still counted as a flex/grid item, so a parent with a gap paid that gap for a sheet that
       renders nothing: three sheets in one column put 72px of dead space on the announcements
       screen between the composer and the history. display:contents removes the host box; the
       dialog inside is positioned by the top layer and does not care what its parent's display is. */
    :host { display: contents; }
    .sheet { border: 1px solid var(--hairline); border-radius: var(--r-lg) var(--r-lg) 0 0;
      background: var(--surface); color: var(--bone);
      padding: var(--sp-3) var(--sp-5) calc(var(--sp-6) + env(safe-area-inset-bottom));
      width: 100%; max-width: 560px; margin: auto auto 0; box-sizing: border-box;
      box-shadow: var(--shadow-float); }
    .sheet[open] { animation: rise var(--dur) var(--ease-out); }
    /* ::backdrop cannot inherit :root vars in some engines, so the literal is what actually
       renders in Chrome — keep it EQUAL to --scrim in _tokens.scss. It had drifted to
       rgba(10, 7, 4, 0.55): weaker and warmer than the token, which is why content behind an
       open sheet stayed legible. The old comment claimed it mirrored the token; it did not. */
    .sheet::backdrop { background: var(--scrim, rgba(6, 9, 7, 0.62)); }
    .grab { width: 44px; height: 5px; border-radius: var(--r-full); background: var(--hairline); margin: 0 auto var(--sp-4); }
    .sh-head { display: flex; align-items: flex-start; gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .sh-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; letter-spacing: 0.02em; margin: 0; flex: 1; min-width: 0; }
    .sh-close { flex-shrink: 0; margin-left: auto; display: grid; place-items: center;
      min-width: var(--tap); min-height: var(--tap); margin-top: calc(var(--sp-2) * -1);
      margin-right: calc(var(--sp-2) * -1); background: none; border: none; cursor: pointer;
      color: var(--bone-dim); border-radius: var(--r-full); }
    .sh-close:hover { color: var(--bone); }
    .sh-close:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
  closeLabel = input($localize`:@@sheet.close:Close`);
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

  /** Same path as Escape and the backdrop: a close control must not be able to bypass the
   *  unsaved-work prompt that those two already respect. */
  requestClose() {
    if (this.confirmClose()) this.discardAsk.set(true);
    else this.dlg.nativeElement.close();
  }

  keep() { this.discardAsk.set(false); }
  discard() { this.discardAsk.set(false); this.dlg.nativeElement.close(); }
}

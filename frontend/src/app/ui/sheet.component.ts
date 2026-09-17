import { Component, DestroyRef, ElementRef, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/** Past this many px of downward drag on the handle/header, a release closes the sheet -- a
 *  behaviour constant, not a CSS breakpoint. */
const DRAG_CLOSE_PX = 80;

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
    <dialog #dlg class="sheet" tabindex="-1" [class.dragging]="dragging()" [style.transform]="dragTransform()"
            (close)="onNativeClose()" (cancel)="onCancel($event)" (click)="onBackdrop($event)"
            (pointermove)="onDragMove($event)" (pointerup)="onDragEnd($event)"
            (pointercancel)="onDragEnd($event)" [attr.aria-label]="label()">
      <!-- Below 720px the grab handle is a real drag-to-close affordance (onDragStart/Move/End) —
           a release past DRAG_CLOSE_PX closes the sheet, same path as the X. The X itself is
           visually hidden below 720px until it receives keyboard focus, because the swipe covers
           the pointer case; it stays in the DOM at full size so it is still the discoverable exit
           for screen-reader and keyboard users, who have no swipe gesture. At 720px and up neither
           of this changes: the handle stays decoration (display:none) and the X stays visible. -->
      <div class="grab" aria-hidden="true" (pointerdown)="onDragStart($event)"></div>
      <div class="sh-head" (pointerdown)="onDragStart($event)">
        @if (title()) { <h2 class="sh-title">{{ title() }}</h2> }
        <button type="button" class="sh-close" [class.phone]="isPhone()" (click)="requestClose()"
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
      box-shadow: var(--shadow-float); transition: transform var(--dur) var(--ease-out); }
    .sheet[open] { animation: rise var(--dur) var(--ease-out); }
    /* While a drag is live the translate must track the pointer 1:1, with no transition lag;
       the transition above is what performs the snap-back once the pointer lifts. */
    .sheet.dragging { transition: none; }
    /* The drag's own surfaces must not be a scroll/pan gesture: without this a touch swipe is
       claimed by the browser, which fires pointercancel a few px in, and the sheet never closes.
       A mouse drag never hits that path, which is why the first browser check passed. The body
       keeps its default so content inside the sheet still scrolls. */
    .grab, .sh-head { touch-action: none; }
    /* A 5px bar is too thin to catch a thumb, and a sheet with no title has no header to grab
       either (the X is clipped to 1px there). The pseudo-element widens the handle's hit area to a
       tap-sized band without moving anything on screen. */
    .grab { position: relative; }
    .grab::before { content: ''; position: absolute; inset: calc(var(--sp-3) * -1) calc(var(--sp-8) * -1); }
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
    /* Below 720px (isPhone, read live off matchMedia -- not this rule's own media query, so the
       spec can stub it) the X is visually hidden -- same clip pattern as bh-search-bar's .sr --
       but stays in the DOM at its normal size and position the moment it receives keyboard focus,
       so it never leaves keyboard/screen-reader users without a discoverable exit. */
    .sh-close.phone:not(:focus-visible) { position: absolute; width: 1px; height: 1px;
      min-width: 1px; min-height: 1px; margin: 0; padding: 0; border: 0; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; }
    /* overflow-y:auto clips a focused child's 2px outline-offset ring at the scrollport edge (R6b
       finding 3, generalised M14c-b R6e-fix: every sheet step had this, not only the one field
       that got padded before). Padding on all sides gives the ring room; the equal negative margin
       cancels it back out so content sits exactly where the sheet's own padding already put it. */
    .body { max-height: 70vh; overflow-y: auto; box-sizing: border-box;
      padding: var(--sp-2); margin: calc(var(--sp-2) * -1); }
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
    @media (prefers-reduced-motion: reduce) { .sheet[open] { animation: none; } .sheet { transition: none; } }
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

  /** Only true below 720px (this component's own breakpoint). Read live off matchMedia in the
   *  constructor rather than a CSS media query, so the hidden-X and drag specs can stub it
   *  deterministically regardless of the test runner's actual window size. */
  isPhone = signal(false);
  dragging = signal(false);
  dragY = signal(0);
  dragTransform = computed(() => (this.dragY() ? `translateY(${this.dragY()}px)` : null));

  private dragStartY = 0;
  private phoneQuery: MediaQueryList | null = null;

  constructor() {
    // The dialog's own open/close state is driven directly off the `open` input signal — no local
    // mirror needed, since a signal already IS the up-to-date "desired" value the old @Input
    // setter used to copy into `isOpen` by hand.
    effect(() => {
      const el = this.dlg?.nativeElement;
      if (!el) return;
      // showModal()'s own focusing steps land on the FIRST focusable descendant in tree order --
      // the close button, since it precedes any projected content -- which would make it
      // :focus-visible (and so, below 720px, visible) the instant every sheet opens. tabindex="-1"
      // on the dialog plus this explicit focus() puts initial focus on the sheet surface itself
      // instead, same accessible pattern most dialog libraries use, so the X starts hidden.
      if (this.open() && !el.open) { el.showModal(); el.focus(); }
      else if (!this.open() && el.open) el.close();
    });

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return; // guards Karma/SSR-less envs
    const destroyRef = inject(DestroyRef);
    this.phoneQuery = window.matchMedia('(max-width: 719.98px)');
    this.isPhone.set(this.phoneQuery.matches);
    const onPhoneChange = () => this.isPhone.set(this.phoneQuery!.matches);
    this.phoneQuery.addEventListener('change', onPhoneChange);
    destroyRef.onDestroy(() => this.phoneQuery?.removeEventListener('change', onPhoneChange));
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

  /** Bound on .grab and .sh-head only, never .body -- so content scrolling inside the sheet is
   *  never hijacked. */
  onDragStart(ev: PointerEvent) {
    if (!this.isPhone()) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    try { (ev.currentTarget as Element).setPointerCapture(ev.pointerId); }
    catch { /* a synthetic pointerId (tests) isn't a real active pointer -- capture is best-effort */ }
    this.dragStartY = ev.clientY;
    this.dragging.set(true);
  }

  onDragMove(ev: PointerEvent) {
    if (!this.dragging()) return;
    this.dragY.set(Math.max(0, ev.clientY - this.dragStartY)); // never translates above 0
  }

  /** Past DRAG_CLOSE_PX, the SAME requestClose() the X uses, so confirmClose still shows the
   *  discard bar. The translate always snaps back first: when guarded, the dialog itself does not
   *  close, so there is nothing left to reset once requestClose returns. */
  onDragEnd(ev: PointerEvent) {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const dy = this.dragY();
    this.dragY.set(0);
    if (dy > DRAG_CLOSE_PX) this.requestClose();
  }

  keep() { this.discardAsk.set(false); }
  discard() { this.discardAsk.set(false); this.dlg.nativeElement.close(); }
}

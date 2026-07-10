import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, effect, signal } from '@angular/core';

/**
 * Bottom sheet on native <dialog>: Esc-dismiss, focus containment and backdrop come free.
 * Slides up on mobile, centers on desktop. Reduced-motion: no slide, instant fade.
 */
@Component({
  selector: 'bh-sheet',
  standalone: true,
  template: `
    <dialog #dlg class="sheet" (close)="onNativeClose()" (cancel)="onNativeClose()"
            (click)="onBackdrop($event)" [attr.aria-label]="label">
      <div class="grab" aria-hidden="true"></div>
      @if (title) { <h2 class="sh-title">{{ title }}</h2> }
      <div class="body"><ng-content /></div>
    </dialog>
  `,
  styles: [`
    .sheet { border: 1px solid var(--hairline); border-radius: var(--edge) var(--edge) 0 0;
      background: var(--surface); color: var(--bone); padding: var(--sp-4) var(--sp-4) calc(var(--sp-5) + env(safe-area-inset-bottom));
      width: 100%; max-width: 560px; margin: auto auto 0; box-sizing: border-box; }
    .sheet[open] { animation: rise var(--dur) var(--ease-out); }
    .sheet::backdrop { background: var(--scrim, rgba(10, 7, 4, 0.55)); } /* ::backdrop can't inherit :root vars in some engines; literal fallback mirrors the token */
    .grab { width: 36px; height: 4px; border-radius: 2px; background: var(--hairline); margin: 0 auto var(--sp-3); }
    .sh-title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 var(--sp-3); }
    .body { max-height: 70vh; overflow-y: auto; }
    @keyframes rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (min-width: 720px) {
      .sheet { border-radius: var(--edge); margin: auto; padding-bottom: var(--sp-5); }
      .grab { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .sheet[open] { animation: none; } }
  `],
})
export class SheetComponent {
  @Input() title = '';
  @Input() label = 'Sheet';
  @Output() closed = new EventEmitter<void>();
  @ViewChild('dlg', { static: true }) dlg!: ElementRef<HTMLDialogElement>;

  private isOpen = signal(false);
  @Input() set open(v: boolean) { this.isOpen.set(v); }

  constructor() {
    effect(() => {
      const el = this.dlg?.nativeElement;
      if (!el) return;
      if (this.isOpen() && !el.open) el.showModal();
      else if (!this.isOpen() && el.open) el.close();
    });
  }

  onNativeClose() { if (this.isOpen()) { this.isOpen.set(false); this.closed.emit(); } }

  onBackdrop(ev: MouseEvent) {
    if (ev.target === this.dlg.nativeElement) this.dlg.nativeElement.close(); // click outside the content box
  }
}

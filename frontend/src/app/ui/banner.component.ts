import { Component, OnDestroy, OnInit, input, output, signal } from '@angular/core';
import { AlertComponent } from './alert.component';
import { ButtonComponent } from './button.component';

/** Dwell before auto-dismiss. Danger dwells longer — a failure needs more time to read, a
 *  trade the user chose knowingly when picking auto-dismiss for both tones. */
const DWELL_MS: Record<'good' | 'danger', number> = { good: 3000, danger: 7000 };

/**
 * A floating bottom-anchored confirmation. Composes `bh-alert` for tone/role/icon (law §3.1: a
 * semantic colour never fills a card, only a left rule + icon on --surface) rather than
 * re-implementing it — this component owns only positioning, the dwell timer and the optional
 * action slot.
 *
 * No `open` input on purpose: `bh-alert`'s own doc notes role="alert"/"status" only announce on
 * fresh insertion, not on an already-mounted element whose tone/content changes in place. Mount
 * this with `@if` and clear your own signal in `(dismissed)`.
 */
@Component({
  selector: 'bh-banner',
  standalone: true,
  imports: [AlertComponent, ButtonComponent],
  template: `
    <div class="row" [class.closing]="closing()"
         (mouseenter)="pause()" (mouseleave)="resume()"
         (focusin)="pause()" (focusout)="resume()">
      <bh-alert class="body" [tone]="tone()">{{ message() }}</bh-alert>
      @if (actionLabel()) {
        <bh-button variant="ghost" size="sm" (click)="action.emit()">{{ actionLabel() }}</bh-button>
      }
    </div>`,
  styles: [`
    :host { position: fixed; left: var(--sp-4); right: var(--sp-4); z-index: 25;
      display: flex; justify-content: center;
      bottom: calc(var(--sp-4) + env(safe-area-inset-bottom)); }
    /* Below 719px — the same breakpoint bh-dock itself switches on — a dock floats over this
       gutter, so the banner must clear it instead. --dock-h is the dock's declared outer height
       and the dock pins its own min-height to it, so this stays correct if the dock changes.
       The dock sits at bottom: calc(var(--sp-3) + safe-area); one more var(--sp-3) clears its top
       edge with a visible gap. Above 719px .dock is display:none and the plain gutter applies. */
    @media (max-width: 719px) {
      :host { bottom: calc(var(--dock-h) + var(--sp-3) + var(--sp-3) + env(safe-area-inset-bottom)); }
    }
    .row { display: flex; align-items: center; gap: var(--sp-2); width: 100%; max-width: 480px;
      animation: bh-banner-in var(--dur) var(--ease-out); }
    .row.closing { animation: bh-banner-out var(--dur) var(--ease-out) forwards; }
    .body { flex: 1; min-width: 0; }
    /* bh-alert carries no shadow of its own (law §5: shadows only on things that physically
       float) — this is the one case that does, so it's added by reaching into the child's
       encapsulated box the same way dock.component.ts already reaches into a projected child's
       markup with ::ng-deep, rather than re-implementing bh-alert's card here. */
    ::ng-deep bh-banner .body .alert { box-shadow: var(--shadow-float); }
    @keyframes bh-banner-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes bh-banner-out { to { opacity: 0; transform: translateY(8px); } }
    @media (prefers-reduced-motion: reduce) {
      .row, .row.closing { animation: none; }
    }
  `],
})
export class BannerComponent implements OnInit, OnDestroy {
  /** Which face it wears. `good` is a confirmation, `danger` a failure or a cancellation. */
  tone = input<'good' | 'danger'>('good');
  /** The message. Required — a banner with nothing to say should not be mounted. */
  message = input.required<string>();
  /** Optional single action. Both must be set for the button to render. */
  actionLabel = input('');
  action = output<void>();
  /** Emitted when the dwell elapses, so the caller can clear whatever signal mounted it. */
  dismissed = output<void>();

  protected readonly closing = signal(false);

  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;
  private remainingMs = 0;
  private deadline = 0;

  ngOnInit() {
    this.remainingMs = DWELL_MS[this.tone()];
    this.arm();
  }

  ngOnDestroy() {
    // A timer firing into a destroyed component is the classic leak here.
    if (this.dwellTimer) clearTimeout(this.dwellTimer);
    if (this.exitTimer) clearTimeout(this.exitTimer);
  }

  /** Hovering or focusing the banner pauses the dwell — the guard against a message
   *  disappearing while it's being read or its action reached for. */
  pause() {
    if (!this.dwellTimer) return;
    clearTimeout(this.dwellTimer);
    this.dwellTimer = null;
    this.remainingMs = Math.max(0, this.deadline - Date.now());
  }

  resume() {
    if (this.dwellTimer || this.closing()) return;
    this.arm();
  }

  private arm() {
    this.deadline = Date.now() + this.remainingMs;
    this.dwellTimer = setTimeout(() => this.beginClose(), this.remainingMs);
  }

  private beginClose() {
    this.dwellTimer = null;
    this.closing.set(true);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 200ms mirrors --dur (_tokens.scss) — the exit animation's own length, so the caller is
    // told to unmount only once the fade has actually finished playing, reduced-motion skips
    // straight to it since the fade itself is suppressed, not merely shortened.
    this.exitTimer = setTimeout(() => this.dismissed.emit(), reduced ? 0 : 200);
  }
}

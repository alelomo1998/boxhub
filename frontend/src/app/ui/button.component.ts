import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * The product's button. 32 call sites, so the input names and their accepted values are a public
 * API — `loading`, `variant="icon"` and `label` are additions, nothing was renamed.
 *
 * Design law §11.1 names seven states: default, hover, focus, active, disabled, loading, error.
 * Six apply here and are implemented. `error` is deliberately not this component's: a button
 * doesn't own an error, the field or the alert beside it renders it.
 */
@Component({
  selector: 'bh-button',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #body><ng-content /></ng-template>

    @if (href()) {
      <!-- A link styled as a button must BE an anchor: routerLink/href on a bh-button host emits
           no href at all, losing ctrl/cmd-click, open-in-new-tab and the correct role. Two real
           consumers: the Google control on login and on signup. -->
      <a [href]="href()" [class]="'btn ' + variant() + ' ' + size()"
         [attr.aria-label]="label() || null">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <button [type]="type()" [class]="'btn ' + variant() + ' ' + size()"
              [disabled]="disabled() || loading()" [attr.aria-busy]="loading()"
              [attr.aria-label]="label() || null">
        @if (loading()) { <span class="spin" aria-hidden="true"></span> }
        @if (!(loading() && variant() === 'icon')) { <ng-container [ngTemplateOutlet]="body" /> }
      </button>
    }`,
  styles: [`
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
      border: none; border-radius: var(--edge); font-family: var(--font-body);
      font-weight: 700; font-size: var(--fs-sm); letter-spacing: 0.01em; cursor: pointer;
      min-height: var(--tap); }
    a.btn { text-decoration: none; }
    .btn.sm { padding: 0 13px; }
    .btn.md { padding: 0 17px; }
    .btn.primary { background: var(--volt); color: var(--on-volt); }
    .btn.ghost { background: transparent; color: var(--bone); border: 1px solid var(--hairline); }
    /* Destructive confirms only — the click you least want. Never the action that merely OPENS a
       destroy flow; that one is a danger-bordered ghost, so the pair reads as an escalation. */
    .btn.danger { background: var(--danger); color: var(--on-danger); }
    /* Absorbs the shells' .iconbtn / .theme — the same control under two names in two files. */
    .btn.icon { background: transparent; color: var(--faint); min-width: var(--tap); padding: 0; }

    /* Hover is a rung on the surface ladder, never volt: a thing that turns volt has become
       live, and hovering it has not. Law §5. */
    .btn.ghost:hover:not(:disabled) { background: var(--surface-2); }
    .btn.icon:hover:not(:disabled) { color: var(--bone); background: var(--surface-2); }
    .btn.primary:hover:not(:disabled), .btn.danger:hover:not(:disabled) { filter: brightness(1.08); }
    .btn:active:not(:disabled) { transform: translateY(1px); }

    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn[aria-busy="true"] { cursor: progress; }

    .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A volt ring on the volt-filled primary is invisible — law §11.2, the single
       highest-traffic control in the product. */
    .btn.primary:focus-visible { outline-color: var(--focus-inv); }

    /* No gradient (law §2.4): the spinner is a ring with one transparent side. */
    .spin { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      border: 2px solid currentColor; border-right-color: transparent;
      animation: bh-spin var(--dur-spin) linear infinite; }
    @keyframes bh-spin { to { transform: rotate(360deg); } }
    /* Reduced motion: the ring stays, it just stops. aria-busy still announces the state, so
       nothing is lost for anyone. */
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

    :host(.full) { display: block; }
    :host(.full) .btn { width: 100%; }
  `],
})
export class ButtonComponent {
  variant = input<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  size = input<'md' | 'sm'>('md');
  type = input<'button' | 'submit'>('button');
  disabled = input(false);
  loading = input(false);
  label = input('');
  /** Set to render an <a> instead of a <button>. For real navigation only — an OAuth start, an
   *  external destination. Internal navigation is a text link with routerLink, not this. */
  href = input('');
}

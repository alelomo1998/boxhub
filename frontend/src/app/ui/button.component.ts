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
      <a [href]="href()" [class]="'btn ' + variant() + ' ' + size() + (dangerBorder() ? ' danger-border' : '')"
         [attr.aria-label]="label() || null" [attr.data-testid]="testId() || null">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <button [type]="type()" [class]="'btn ' + variant() + ' ' + size() + (dangerBorder() ? ' danger-border' : '')"
              [disabled]="disabled() || loading()" [attr.aria-busy]="loading()"
              [attr.aria-disabled]="ariaDisabled() ? 'true' : null"
              [attr.aria-label]="label() || null" [attr.data-testid]="testId() || null">
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
    /* Opt-in via dangerBorder(), not an external page-level class: the host tag a screen authors
       (<bh-button>) is a different encapsulation boundary than the <button> this template renders
       inside it, so a class from the *page's* styles never reaches it. Same trap CLAUDE.md records
       for bh-field/bh-select's testId, in CSS form instead of an attribute. */
    .btn.ghost.danger-border { color: var(--danger); border-color: var(--danger); }
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
    /* aria-disabled, not the native attribute: a row action (e.g. per-session sign-out) that goes
       natively disabled the instant it's pressed drops out of the a11y tree, dropping focus to
       <body> — no confirmation, no way back without re-tabbing from the top. The click guard lives
       in the handler; this is visual-only. */
    .btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
    .btn.ghost[aria-disabled="true"]:hover { background: transparent; }

    .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* A volt ring on the volt-filled primary is invisible — law §11.2, the single
       highest-traffic control in the product. --focus-inv only reads against the volt surface
       itself, so the ring has to sit ON that surface: a negative offset pulls it inside the
       button instead of out onto --ground (identical to --focus-inv, which made the positive
       offset invisible too). */
    .btn.primary:focus-visible { outline-color: var(--focus-inv); outline-offset: -2px; }

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
  /** Visual/aria-only guard — never the native `disabled` attribute. For a control whose row must
   *  stay in the a11y tree while its action is pending (see the CSS comment above); the real guard
   *  against a double-fire belongs in the click handler, not here. */
  ariaDisabled = input(false);
  /** Danger-bordered ghost: the control that OPENS a destructive flow, escalating against the
   *  filled `variant="danger"` control that EXECUTES it (design law). Defaults false so all
   *  existing call sites are unchanged; only meaningful on `variant="ghost"`. */
  dangerBorder = input(false);
  label = input('');
  /** Set to render an <a> instead of a <button>. For real navigation only — an OAuth start, an
   *  external destination. Internal navigation is a text link with routerLink, not this. */
  href = input('');
  testId = input('');
}

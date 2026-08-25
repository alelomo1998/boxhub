import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * How a person gets into a gym. Static today, and that is the point: the invite path already
 * works, so this tab is a real destination rather than a placeholder.
 *
 * M24 adds the directory ABOVE this content and leaves the invite path underneath — a gym's
 * link keeps working whether or not the gym chooses to be listed. Shaped that way deliberately
 * so M24 adds a section rather than re-shaping a screen.
 *
 * No code entry field. Invites are links; nothing on the backend redeems a typed code.
 */
@Component({
  selector: 'bh-join-gym',
  standalone: true,
  template: `
    <h1 class="t-display title" i18n="@@join.heading">Join a gym</h1>

    <div class="panel" data-testid="join-explainer">
      <h2 class="t-h2 eh" i18n="@@join.ask.heading">Ask your gym for a link</h2>
      <p class="p" i18n="@@join.ask.body">
        Gyms on rxed invite their members by email. The link in that email adds you straight
        away — there is no code to type.
      </p>
      <p class="p quiet" i18n="@@join.ask.mismatch">
        Clicked a link and nothing happened? It may have been sent to a different email address
        than the one you signed up with.
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .title { font-size: var(--fs-display); margin: 0 0 var(--sp-5); text-transform: uppercase;
      letter-spacing: -0.02em; }
    .panel { border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); padding: var(--sp-6) var(--sp-5);
      display: flex; flex-direction: column; gap: var(--sp-3); max-width: 480px; }
    .eh { margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
    .p { margin: 0; color: var(--bone-dim); font-size: var(--fs-sm); }
    .quiet { color: var(--faint); }
  `],
})
export class JoinGymPage {}

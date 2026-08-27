import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  imports: [RouterLink],
  template: `
    <h1 class="t-display title" i18n="@@join.heading">Join a gym</h1>

    <div class="panel" data-testid="join-explainer">
      <h2 class="t-h2 eh" i18n="@@join.ask.heading">Ask your gym for a link</h2>
      <p class="p" i18n="@@join.ask.body">
        Gyms on rxed invite their members by email. The link in that email adds you straight
        away — there is no code to type.
      </p>
      <p class="p" i18n="@@join.ask.mismatch">
        No link yet? Check your spam folder first — your gym may also simply not have sent it
        yet.
      </p>
      <p class="p" i18n="@@join.ask.mismatch2">
        If it was sent to a different email address than the one you signed up with, change your
        address and then ask your gym to send the invite again — fixing the address does not
        revive the old link.
      </p>
      <!-- The paragraphs above name the two failures this screen can predict, so it owes the
           reader the way to act on the addressing one. The address lives in the account area,
           which a boxless session can already reach. Without this the named problem is a dead end. -->
      <!-- Straight to change-email, not /account: the index guard sends desktop to Password, and
           the label has to match what the destination can actually do. That screen changes the
           address; it does not display the current one, so this cannot promise "check". -->
      <a class="p link" routerLink="/account/change-email" data-testid="join-check-email"
         i18n="@@join.ask.changeEmail">Change the email on your account</a>
      <!-- Neither named cause covers everything a real gym-side mistake can produce (wrong
           invite entirely, gym error). This closes the loop without inventing a mechanism this
           screen cannot offer — there is still nothing to click, just who to ask. -->
      <p class="p" i18n="@@join.ask.stillNothing">
        Still nothing? Ask your gym to confirm they invited the right address.
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* The flex child of the shell's .content is THIS host element, not anything inside it, so a
       margin-block:auto on an inner panel centred nothing. The host has to be the flex column. */
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0;
      width: 100%; max-width: 740px; margin-inline: auto; }
    /* Shares the content column's cap and centring. Centring only the rows left the heading
       pinned to the far left of a wide screen, detached from the content it names. */
    .title { font-size: var(--fs-display); margin: 0 0 var(--sp-5); text-transform: uppercase;
      letter-spacing: -0.02em; }
    /* margin-block centres the panel vertically inside .content (a flex column, set in
       hub-shell.page.ts) instead of top-anchoring with bare ground below on a short viewport. */
    .panel { border: 1px solid var(--hairline); border-radius: var(--r-card);
      background: var(--surface); padding: var(--sp-6) var(--sp-5);
      display: flex; flex-direction: column; gap: var(--sp-3); max-width: 480px;
      margin-block: auto; }
    .eh { margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
    .p { margin: 0; color: var(--bone-dim); font-size: var(--fs-sm); }
    .link { display: inline-flex; align-items: center; min-height: var(--tap);
      color: var(--bone); text-decoration: underline; text-underline-offset: 3px; }
    .link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `],
})
export class JoinGymPage {}

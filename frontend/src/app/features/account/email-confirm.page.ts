import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

type Status = 'pending' | 'done' | 'expired' | 'error';

/**
 * Landing page for the emailed "confirm your new address" link — exact path the backend mails
 * (AccountService.startEmailChange): /account/email?token=. permitAll on the backend: the link
 * is clicked from an inbox, possibly on a device with no session, so this page never assumes
 * one — it just posts the token and reports what happened.
 */
@Component({
  selector: 'bh-email-confirm',
  standalone: true,
  imports: [RouterLink, AlertComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <!-- Panel and body are separate top-level @switch blocks, same as verify/reset: an @case
           with more than one root node does not project into a named slot (NG8011), and the
           failure is silent — eyebrow/headline just never appear. Pending gets no panel case at
           all — no eyebrow/headline while the request is in flight. -->
      @switch (status()) {
        @case ('done') {
          <div panel>
            <p class="t-eyebrow" i18n="@@account.emailConfirm.done.eyebrow">Email confirmed</p>
            <h1 class="t-display title" i18n="@@account.emailConfirm.done.headline">Done</h1>
          </div>
        }
        @case ('expired') {
          <div panel>
            <p class="t-eyebrow" i18n="@@account.emailConfirm.expired.eyebrow">Link expired</p>
            <h1 class="t-display title" i18n="@@account.emailConfirm.expired.headline">Expired</h1>
          </div>
        }
        @case ('error') {
          <div panel>
            <p class="t-eyebrow" i18n="@@account.emailConfirm.error.eyebrow">Invalid link</p>
            <h1 class="t-display title" i18n="@@account.emailConfirm.error.headline">Not valid</h1>
          </div>
        }
      }

      @switch (status()) {
        @case ('pending') {
          <p class="stateline" data-testid="email-confirm-pending" i18n="@@account.emailConfirm.pending.copy">Confirming your new email…</p>
        }
        @case ('done') {
          <!-- Zero volt elements on this screen, in EVERY state — deliberate (M13d Task 17).
               The exit below is a plain text link, the same shape as expired/error's, not a
               bh-button. A volt primary here WAS wanted, and could not be built: bh-button
               renders an anchor only for real/external navigation and has no router input, and
               its own docstring says internal navigation should be a text link instead. Nesting
               a bh-button inside an anchor is an invalid content model, so that was refused too.
               The component question is filed in docs/BACKLOG.md alongside a real consumer bug
               (wod-library) so it gets decided once, product-wide. Do not quietly promote this
               exit to a button before that decision lands. -->
          <bh-alert tone="good" data-testid="email-confirm-done" i18n="@@account.emailConfirm.done.copy">Your email address has been updated. You can now sign in with the new address.</bh-alert>
          <p class="footer">
            <a routerLink="/auth/login" data-testid="email-confirm-done-login" i18n="@@account.emailConfirm.done.goToLogin">Go to login</a>
          </p>
        }
        @case ('expired') {
          <!-- An alert, not a plain <p>: expired is an OUTCOME exactly as done and error are,
               and this screen resolves with no user action. Left as a paragraph it was the one
               outcome of three that a screen reader was never told about. -->
          <bh-alert tone="warn" data-testid="email-confirm-expired" i18n="@@account.emailConfirm.expired.copy">This link has expired or was already used.</bh-alert>
          <p class="footer">
            <a routerLink="/auth/login" data-testid="email-confirm-expired-login" i18n="@@account.emailConfirm.expired.goToLogin">Go to login</a>
          </p>
        }
        @case ('error') {
          <!-- bh-alert's role is derived from tone (danger -> role="alert"), which is the live
               region this self-resolving screen needs: nothing here ever moves focus (there is
               no prior focused element to move it from), so the alert's own role is what
               announces the outcome to a screen reader. 'done' reuses the same mechanism
               (tone="good" -> role="status") for the same reason. 'expired' stays a plain
               paragraph with no live region, matching verify.page.ts's identical self-resolving
               expired state — the established precedent in this codebase. Do not also wrap the
               swapping region in a manual aria-live/role="status" — that would announce the
               error alert twice. -->
          <bh-alert tone="danger" data-testid="email-confirm-error" i18n="@@account.emailConfirm.error.copy">This confirmation link is invalid.</bh-alert>
          <p class="footer">
            <a routerLink="/auth/login" data-testid="email-confirm-error-login" i18n="@@account.emailConfirm.error.goToLogin">Go to login</a>
          </p>
        }
      }
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
    .footer a { color: var(--bone-dim); }
  `],
})
export class EmailConfirmPage implements OnInit {
  private auth = inject(AuthService);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  status = signal<Status>('pending');

  ngOnInit() {
    if (!this.token) { this.status.set('error'); return; }
    this.auth.confirmEmailChange(this.token).subscribe({
      next: () => this.status.set('done'),
      error: (e: HttpErrorResponse) => this.status.set(e.status === 410 ? 'expired' : 'error'),
    });
  }
}

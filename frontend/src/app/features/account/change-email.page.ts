import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Account / Email — second of the four sections redistributed off the old security.page.ts.
 * `emailGoogleOnly` is only known after a failed attempt (409 NO_PASSWORD_SET), same as Password —
 * there is no cheap up-front "does this account have a password" read.
 */
@Component({
  selector: 'bh-account-change-email',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent],
  template: `
    <h1 class="t-h3" i18n="@@account.email.heading">Email</h1>

    @if (googleOnly()) {
      <p class="muted" data-testid="email-google-only">
        <span i18n="@@account.email.googleOnly">You sign in with Google. To add a password, use</span>
        <a routerLink="/auth/forgot" data-testid="email-forgot-link" i18n="@@account.email.googleOnly.link">Forgot password</a>.
      </p>
    } @else {
      <form class="form" (submit)="submit($event)" novalidate data-testid="email-form">
        <!-- Above the fields (not pre-button like Password's disclosure): this explains how the
             whole flow works, so it needs reading before typing, not a per-click consequence. -->
        <p class="framing" i18n="@@account.email.framing">This changes only after the new address confirms it — click the link we send there. Your current email keeps working until then.</p>

        <bh-field label="NEW EMAIL" i18n-label="@@account.email.new.label" type="email"
                   name="newEmail" autocomplete="email" [required]="true"
                   [(value)]="newEmail" (valueChange)="newEmailError.set('')"
                   testId="email-new" [error]="newEmailError()" />

        <bh-field label="CURRENT PASSWORD" i18n-label="@@account.email.password.label" type="password"
                   name="currentPassword" autocomplete="current-password" [required]="true"
                   [(value)]="currentPassword" (valueChange)="currentPasswordError.set('')"
                   testId="email-password" [error]="currentPasswordError()" />

        @if (formError()) {
          <bh-alert tone="danger" data-testid="email-error">{{ formError() }}</bh-alert>
        }
        @if (success()) {
          <bh-alert tone="good" data-testid="email-success" i18n="@@account.email.success">Check {{ success() }} to confirm the change. Your current address stays active until you do.</bh-alert>
        }

        <bh-button type="submit" variant="solid" [loading]="pending()" testId="email-submit">
          @if (pending()) {
            <span i18n="@@account.email.submit.pending">Sending…</span>
          } @else {
            <span i18n="@@account.email.submit.default">Change email</span>
          }
        </bh-button>
      </form>
    }
  `,
  styles: [`
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .framing { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); align-items: flex-start; }
  `],
})
export class ChangeEmailPage {
  private auth = inject(AuthService);

  newEmail = signal('');
  currentPassword = signal('');
  newEmailError = signal('');
  currentPasswordError = signal('');
  formError = signal('');
  googleOnly = signal(false);
  /** Holds the address the confirmation went to; empty means no success yet. */
  success = signal('');
  pending = signal(false);

  submit(event?: Event) {
    event?.preventDefault();
    // Enter submits regardless of the button's own [disabled]/[loading] state — the guard
    // belongs here, on the action itself, not on the button (CLAUDE.md's explicit rule).
    if (this.pending()) return;

    this.newEmailError.set('');
    this.currentPasswordError.set('');
    this.formError.set('');
    this.success.set('');

    const email = this.newEmail().trim();
    if (!EMAIL_RE.test(email)) {
      this.newEmailError.set($localize`:@@account.email.new.error.invalid:Enter a valid email address.`);
      return;
    }

    this.pending.set(true);
    this.auth.startEmailChange(this.currentPassword(), email).subscribe({
      next: () => {
        this.pending.set(false);
        this.success.set(email);
        this.newEmail.set('');
        this.currentPassword.set('');
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 409 && e.error?.detail === 'NO_PASSWORD_SET') { this.googleOnly.set(true); return; }
        if (e.status === 409 && e.error?.detail === 'EMAIL_TAKEN') {
          this.newEmailError.set($localize`:@@account.email.new.error.taken:That address is already in use.`);
          return;
        }
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') {
          this.currentPasswordError.set($localize`:@@account.email.password.error.wrong:Current password is wrong.`);
          return;
        }
        this.formError.set($localize`:@@account.email.error.generic:Something went wrong — try again.`);
      },
    });
  }
}

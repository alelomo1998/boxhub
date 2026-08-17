import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';

const MIN_PASSWORD_LENGTH = 10;

/**
 * Account / Password — first of the four sections redistributed off the old security.page.ts.
 * `passwordGoogleOnly` is only known after a failed attempt (409 NO_PASSWORD_SET); there is no
 * cheap up-front "does this account have a password" read, so the form always renders first.
 */
@Component({
  selector: 'bh-account-password',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent],
  template: `
    <h1 class="t-h3" i18n="@@account.password.heading">Password</h1>

    @if (googleOnly()) {
      <p class="muted" data-testid="password-google-only">
        <span i18n="@@account.password.googleOnly">You sign in with Google. To add a password, use</span>
        <a routerLink="/auth/forgot" data-testid="password-forgot-link" i18n="@@account.password.googleOnly.link">Forgot password</a>.
      </p>
    } @else {
      <form class="form" (submit)="submit($event)" novalidate data-testid="password-form">
        <bh-field label="CURRENT PASSWORD" i18n-label="@@account.password.current.label" type="password"
                   name="currentPassword" autocomplete="current-password" [required]="true"
                   [(value)]="currentPassword" (valueChange)="currentPasswordError.set('')"
                   testId="password-current" [error]="currentPasswordError()" />

        <bh-field label="NEW PASSWORD" i18n-label="@@account.password.new.label" type="password"
                   name="newPassword" autocomplete="new-password" [required]="true"
                   [(value)]="newPassword" (valueChange)="newPasswordError.set('')"
                   testId="password-new" placeholder="min 10 characters" i18n-placeholder="@@account.password.new.placeholder"
                   [error]="newPasswordError()" />

        <!-- Before the button — a consequence of pressing it, same placement reset.page.ts uses. -->
        <p class="disclosure" i18n="@@account.password.disclosure">Changing your password signs you out on your other devices, and we'll email you to confirm.</p>

        @if (formError()) {
          <bh-alert tone="danger" data-testid="password-error">{{ formError() }}</bh-alert>
        }
        @if (success()) {
          <bh-alert tone="good" data-testid="password-success" i18n="@@account.password.success">Password changed. We've signed out your other devices and emailed you to confirm.</bh-alert>
        }

        <bh-button type="submit" variant="solid" [loading]="pending()" testId="password-submit">
          @if (pending()) {
            <span i18n="@@account.password.submit.pending">Saving…</span>
          } @else {
            <span i18n="@@account.password.submit.default">Change password</span>
          }
        </bh-button>
      </form>
    }
  `,
  styles: [`
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); align-items: flex-start; }
    .disclosure { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0; }
  `],
})
export class PasswordPage {
  private auth = inject(AuthService);

  currentPassword = signal('');
  newPassword = signal('');
  currentPasswordError = signal('');
  newPasswordError = signal('');
  formError = signal('');
  googleOnly = signal(false);
  success = signal(false);
  pending = signal(false);

  submit(event?: Event) {
    event?.preventDefault();
    // Enter submits regardless of the button's own [disabled]/[loading] state — the guard
    // belongs here, on the action itself, not on the button (CLAUDE.md's explicit rule).
    if (this.pending()) return;

    this.currentPasswordError.set('');
    this.newPasswordError.set('');
    this.formError.set('');
    this.success.set(false);

    const next = this.newPassword();
    if (next.length < MIN_PASSWORD_LENGTH) {
      this.newPasswordError.set($localize`:@@account.password.new.error.tooShort:Use at least 10 characters.`);
      return;
    }

    this.pending.set(true);
    this.auth.changePassword(this.currentPassword(), next).subscribe({
      next: () => {
        this.pending.set(false);
        this.success.set(true);
        this.currentPassword.set('');
        this.newPassword.set('');
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 409 && e.error?.detail === 'NO_PASSWORD_SET') { this.googleOnly.set(true); return; }
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') {
          this.currentPasswordError.set($localize`:@@account.password.current.error.wrong:Current password is wrong.`);
          return;
        }
        // passwordErrorMessage (PASSWORD_TOO_SHORT / PASSWORD_BREACHED, the HIBP backstop) returns
        // unmarked English — a known, already-filed pre-existing gap, not fixed here. Shared
        // mapping with signup/reset; not duplicated.
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) { this.newPasswordError.set(msg); return; }
        this.formError.set($localize`:@@account.password.error.generic:Something went wrong — try again.`);
      },
    });
  }
}

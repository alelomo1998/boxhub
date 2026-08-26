import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { BenchmarkBoardComponent } from '../../ui/benchmark-board.component';

@Component({
  selector: 'bh-login',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent, BenchmarkBoardComponent],
  template: `
    <bh-auth-layout variant="split">
      <!-- TWO projected blocks, not one. bh-auth-layout's panel is space-between, so projecting
           the board and the headline separately distributes wordmark / board / headline across the
           panel's height. Wrapping them in a single div collapses them into one flex child and the
           board slides down to sit on the headline, leaving a 181px void under the wordmark —
           measured, and the reason this markup looks the way it does. -->
      <bh-benchmark-board panel testId="login-benchmark" />

      <div panel>
        <p class="t-eyebrow" i18n="@@auth.login.panel.eyebrow">Rx · as prescribed</p>
        <h1 class="headline t-display" i18n="@@auth.login.panel.headline">Today's board is already up.</h1>
      </div>

      <form class="form" (submit)="submit($event)" novalidate data-testid="login-form">
        <bh-field label="EMAIL" i18n-label="@@auth.login.email.label" type="email"
                   name="email" autocomplete="username" [required]="true" [(value)]="email"
                   placeholder="you@email.com" i18n-placeholder="@@auth.login.email.placeholder" />

        <bh-field label="PASSWORD" i18n-label="@@auth.login.password.label" type="password"
                   name="password" autocomplete="current-password" [required]="true" [(value)]="password">
          <a labelAction class="forgot" routerLink="/auth/forgot" i18n="@@auth.login.forgot">Forgot?</a>
        </bh-field>

        @if (error()) {
          <bh-alert tone="danger" data-testid="login-error">{{ error() }}</bh-alert>
        }

        @if (unverified()) {
          <bh-button type="button" variant="ghost" size="sm" [loading]="resendPending()"
                     (click)="resend()" data-testid="login-resend">
            @if (resendPending()) {
              <span i18n="@@auth.login.resend.pending">Sending…</span>
            } @else {
              <span i18n="@@auth.login.resend.default">Resend verification email</span>
            }
          </bh-button>
          @if (resendError()) {
            <bh-alert tone="danger" data-testid="login-resend-error">{{ resendError() }}</bh-alert>
          }
        }

        <bh-button class="full" type="submit" [loading]="pending()">
          @if (pending()) {
            <span i18n="@@auth.login.submit.pending">Logging in…</span>
          } @else {
            <span i18n="@@auth.login.submit.default">Log in</span>
          }
        </bh-button>

        @if (showGoogle()) {
          <div class="divider"><span i18n="@@auth.login.divider">OR CONTINUE WITH</span></div>
          <bh-button class="full" variant="ghost" href="/oauth2/authorization/google"
                     label="Continue with Google" i18n-label="@@auth.login.google.label"
                     testId="login-google">
            <img src="google-mark.svg" alt="" width="18" height="18" />
          </bh-button>
        }

        <p class="footer">
          <span i18n="@@auth.login.footer.prefix">Own a gym? </span><a
             routerLink="/auth/start" i18n="@@auth.login.footer.link">Start your box</a>
        </p>
      </form>
    </bh-auth-layout>
  `,
  styles: [`
    .headline { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .forgot { font-size: var(--fs-meta); }
    .divider { display: flex; align-items: center; gap: var(--sp-3); }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--hairline); }
    .divider span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); white-space: nowrap; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = signal('');
  password = signal('');
  error = signal('');
  pending = signal(false);
  unverified = signal(false);
  resendPending = signal(false);
  resendError = signal('');
  showGoogle = signal(false);

  ngOnInit() {
    // Google button is opt-in per environment — a failed lookup just keeps it hidden.
    this.auth.providers().subscribe({ next: p => this.showGoogle.set(p.google), error: () => {} });

    // Google OAuth redirects back here on failure with one of these two codes.
    const oauthError = this.route.snapshot.queryParamMap.get('error');
    if (oauthError === 'google_email_unverified') {
      this.error.set($localize`:@@auth.login.error.oauthUnverified:That Google account's email isn't verified.`);
    } else if (oauthError === 'google') {
      this.error.set($localize`:@@auth.login.error.oauthFailed:Google sign-in failed — try again.`);
    }
  }

  submit(event?: Event) {
    event?.preventDefault();
    this.error.set('');
    this.unverified.set(false);
    this.pending.set(true);
    this.auth.login(this.email(), this.password()).subscribe({
      next: session => {
        this.pending.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) { this.router.navigateByUrl(returnUrl); return; }
        const memberships = session?.memberships ?? [];
        if (memberships.length === 1) {
          const m = memberships[0];
          this.auth.selectBox(m.boxId).subscribe({
            next: () => this.router.navigateByUrl(redirectForRole(m.role)),
            // box-token mint 403s a SUSPENDED/REJECTED box (M9). Without this arm the user who
            // just typed correct credentials would sit on the form with no feedback.
            error: () => this.error.set(
              $localize`:@@auth.login.error.boxUnavailable:This box is unavailable — contact your box for help.`),
          });
        } else {
          this.router.navigateByUrl('/gyms');
        }
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 403 && e.error?.detail === 'EMAIL_NOT_VERIFIED') {
          this.unverified.set(true);
          this.error.set($localize`:@@auth.login.error.unverified:Verify your email to sign in`);
          return;
        }
        if (e.status === 429) {
          this.error.set($localize`:@@auth.login.error.rateLimited:Too many attempts — try again later.`);
          return;
        }
        this.error.set($localize`:@@auth.login.error.invalidCredentials:Invalid email or password`);
      },
    });
  }

  resend() {
    this.resendError.set('');
    this.resendPending.set(true);
    this.auth.resendVerification(this.email()).subscribe({
      next: () => {
        this.resendPending.set(false);
        this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email() } });
      },
      error: () => {
        this.resendPending.set(false);
        this.resendError.set($localize`:@@auth.login.resendError:Could not resend — try again.`);
      },
    });
  }
}

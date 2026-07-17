import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-login',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <form class="card" (ngSubmit)="submit()" data-testid="login-form">
        <div class="brand"><span class="mark">B</span><span class="bn">BoxHub</span></div>
        <label class="f"><span>EMAIL</span>
          <input name="email" type="email" [(ngModel)]="email" required placeholder="you@email.com" /></label>
        <label class="f"><span>PASSWORD</span>
          <input name="password" type="password" [(ngModel)]="password" required /></label>
        @if (error()) { <p class="error" data-testid="login-error">{{ error() }}</p> }
        @if (unverified()) {
          <bh-button type="button" variant="ghost" size="sm" [disabled]="resendPending()"
                     (click)="resend()" data-testid="login-resend">
            {{ resendPending() ? 'Sending…' : 'Resend verification email' }}
          </bh-button>
          @if (resendError()) { <p class="error" data-testid="login-resend-error">{{ resendError() }}</p> }
        }
        <bh-button type="submit" [disabled]="pending()">{{ pending() ? 'Logging in…' : 'Log in' }}</bh-button>
        @if (showGoogle()) {
          <a class="google" href="/oauth2/authorization/google" data-testid="login-google">Continue with Google</a>
        }
        <p class="alt"><a href="/auth/forgot">Forgot password?</a> · <a href="/auth/signup">Create a box account</a></p>
      </form>
    </main>
  `,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-lg); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-4); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: var(--sp-2); }
    .mark { width: 34px; height: 34px; border-radius: var(--edge); background: var(--red); color: var(--on-red);
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 21px; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: 19px; text-transform: uppercase; letter-spacing: 0.02em; }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .f input { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 11px 13px; color: var(--bone); font-family: var(--font-body); font-size: 15px; }
    .f input:focus { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }
    .error { color: var(--red); font-size: 13px; margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
    .google { display: flex; align-items: center; justify-content: center; min-height: var(--tap);
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
      font-family: var(--font-body); font-weight: 700; font-size: var(--fs-sm); text-decoration: none; }
    .google:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
  `],
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = '';
  password = '';
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
    if (oauthError === 'google_email_unverified') this.error.set("That Google account's email isn't verified.");
    else if (oauthError === 'google') this.error.set('Google sign-in failed — try again.');
  }

  submit() {
    this.error.set('');
    this.unverified.set(false);
    this.pending.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: session => {
        this.pending.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) { this.router.navigateByUrl(returnUrl); return; }
        const memberships = session?.memberships ?? [];
        if (memberships.length === 1) {
          const m = memberships[0];
          this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
        } else {
          this.router.navigateByUrl('/auth/boxes');
        }
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 403 && e.error?.detail === 'EMAIL_NOT_VERIFIED') {
          this.unverified.set(true);
          this.error.set('Verify your email to sign in');
          return;
        }
        if (e.status === 429) { this.error.set('Too many attempts — try again later.'); return; }
        this.error.set('Invalid email or password');
      },
    });
  }

  resend() {
    this.resendError.set('');
    this.resendPending.set(true);
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.resendPending.set(false);
        this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email } });
      },
      error: () => {
        this.resendPending.set(false);
        this.resendError.set('Could not resend — try again.');
      },
    });
  }
}

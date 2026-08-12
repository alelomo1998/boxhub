import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { BenchmarkBoardComponent } from '../../ui/benchmark-board.component';

@Component({
  selector: 'bh-signup',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent, BenchmarkBoardComponent],
  template: `
    <bh-auth-layout variant="split">
      <!-- TWO projected blocks, same as login: the board and the eyebrow+headline separately, so
           bh-auth-layout's space-between panel distributes wordmark / board / headline across its
           height instead of collapsing into one flex child. -->
      <bh-benchmark-board panel testId="signup-benchmark" />

      <div panel>
        <p class="t-eyebrow" i18n="@@auth.signup.panel.eyebrow">Your box invited you</p>
        <h1 class="headline t-display" i18n="@@auth.signup.panel.headline">Set up your account.</h1>
      </div>

      <form class="form" (submit)="submit($event)" novalidate data-testid="signup-form">
        <bh-field label="NAME" i18n-label="@@auth.signup.name.label" type="text"
                   name="name" autocomplete="name" [required]="true" [(value)]="name"
                   testId="signup-name" placeholder="Jane Doe" i18n-placeholder="@@auth.signup.name.placeholder" />

        <bh-field label="EMAIL" i18n-label="@@auth.signup.email.label" type="email"
                   name="email" autocomplete="username" [required]="true" [(value)]="email"
                   testId="signup-email" placeholder="you@email.com" i18n-placeholder="@@auth.signup.email.placeholder" />

        <!-- No host data-testid: bh-field derives the error node's own hook as '<testId>-error',
             so 'signup-password-error' lands on the error span itself. -->
        <bh-field label="PASSWORD" i18n-label="@@auth.signup.password.label" type="password"
                   name="password" autocomplete="new-password" [required]="true" [(value)]="password"
                   testId="signup-password" placeholder="min 10 characters" i18n-placeholder="@@auth.signup.password.placeholder"
                   [error]="passwordError()" />

        @if (formError()) {
          <bh-alert tone="danger" data-testid="signup-error">{{ formError() }}</bh-alert>
        }

        <!-- Signup dead-ends with no gym otherwise — tell the user before they submit, not after. -->
        <p class="invite-note" i18n="@@auth.signup.inviteNote">
          You'll need an invite from your gym to join one — ask your coach for the link.
        </p>

        <bh-button class="full" type="submit" [loading]="pending()" testId="signup-submit">
          @if (pending()) {
            <span i18n="@@auth.signup.submit.pending">Creating…</span>
          } @else {
            <span i18n="@@auth.signup.submit.default">Create account</span>
          }
        </bh-button>

        @if (showGoogle()) {
          <div class="divider"><span i18n="@@auth.signup.divider">OR CONTINUE WITH</span></div>
          <bh-button class="full" variant="ghost" href="/oauth2/authorization/google"
                     label="Continue with Google" i18n-label="@@auth.signup.google.label"
                     testId="signup-google">
            <img src="google-mark.svg" alt="" width="18" height="18" />
          </bh-button>
        }

        <p class="footer">
          <span i18n="@@auth.signup.footer.login.prefix">Already have an account? </span><a
             routerLink="/auth/login" i18n="@@auth.signup.footer.login.link">Log in</a>
        </p>
        <p class="footer">
          <span i18n="@@auth.signup.footer.start.prefix">Own a gym? </span><a
             routerLink="/auth/start" i18n="@@auth.signup.footer.start.link">Start your box</a>
        </p>
      </form>
    </bh-auth-layout>
  `,
  styles: [`
    .headline { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .invite-note { font-size: var(--fs-sm); color: var(--faint); margin: 0; }
    .divider { display: flex; align-items: center; gap: var(--sp-3); }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--hairline); }
    .divider span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); white-space: nowrap; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class SignupPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  name = signal('');
  email = signal('');
  password = signal('');
  pending = signal(false);
  passwordError = signal('');
  formError = signal('');
  showGoogle = signal(false);

  ngOnInit() {
    // Google button is opt-in per environment — a failed lookup just keeps it hidden.
    this.auth.providers().subscribe({ next: p => this.showGoogle.set(p.google), error: () => {} });
  }

  submit(event?: Event) {
    event?.preventDefault();
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.register(this.email(), this.password(), this.name()).subscribe({
      // 201 always, even if the address is already registered — no enumeration signal here.
      next: () => {
        this.pending.set(false);
        this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email() } });
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) this.passwordError.set(msg);
        else this.formError.set($localize`:@@auth.signup.error.generic:Something went wrong — try again.`);
      },
    });
  }
}

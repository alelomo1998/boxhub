import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-signup',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <form class="card" (ngSubmit)="submit()" data-testid="signup-form">
        <p class="t-eyebrow">Create account</p>
        <h1 class="t-display title">Sign up</h1>
        <label class="f"><span>NAME</span>
          <input class="bh-input" name="name" required [(ngModel)]="name" data-testid="signup-name" /></label>
        <label class="f"><span>EMAIL</span>
          <input class="bh-input" name="email" type="email" required [(ngModel)]="email" data-testid="signup-email" /></label>
        <label class="f"><span>PASSWORD</span>
          <input class="bh-input" name="password" type="password" required minlength="10"
                 placeholder="min 10 characters" [(ngModel)]="password" data-testid="signup-password" />
          @if (passwordError()) { <span class="err" data-testid="signup-password-error">{{ passwordError() }}</span> }
        </label>
        @if (formError()) { <p class="err" data-testid="signup-error">{{ formError() }}</p> }
        <bh-button type="submit" [disabled]="pending()" data-testid="signup-submit">
          {{ pending() ? 'Creating…' : 'Create account' }}
        </bh-button>
        @if (showGoogle()) {
          <a class="google" href="/oauth2/authorization/google" data-testid="signup-google">Continue with Google</a>
        }
        <p class="alt">Already have an account? <a href="/auth/login">Log in</a></p>
      </form>
    </main>
  `,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-lg); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-4); }
    .title { font-size: var(--fs-hero); margin: 0 0 var(--sp-2); }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .err { color: var(--red); font-size: var(--fs-sm); margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
    .google { display: flex; align-items: center; justify-content: center; min-height: var(--tap);
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
      font-family: var(--font-body); font-weight: 700; font-size: var(--fs-sm); text-decoration: none; }
    .google:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
  `],
})
export class SignupPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  name = '';
  email = '';
  password = '';
  pending = signal(false);
  passwordError = signal('');
  formError = signal('');
  showGoogle = signal(false);

  ngOnInit() {
    // Google button is opt-in per environment — a failed lookup just keeps it hidden.
    this.auth.providers().subscribe({ next: p => this.showGoogle.set(p.google), error: () => {} });
  }

  submit() {
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.register(this.email, this.password, this.name).subscribe({
      // 201 always, even if the address is already registered — no enumeration signal here.
      next: () => this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email } }),
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) this.passwordError.set(msg);
        else this.formError.set('Something went wrong — try again.');
      },
    });
  }
}

import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-forgot',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        <p class="t-eyebrow">Reset password</p>
        <h1 class="t-display title">Forgot password</h1>
        @if (submitted()) {
          <!-- Same sentence no matter what the backend actually did — that's the no-enumeration
               promise made visible. Never branch on the response here. -->
          <p class="muted" data-testid="forgot-confirm">If that address has an account, we've sent a reset link.</p>
        } @else {
          <form (ngSubmit)="submit()" data-testid="forgot-form">
            <label class="f"><span>EMAIL</span>
              <input class="bh-input" name="email" type="email" required [(ngModel)]="email" data-testid="forgot-email" /></label>
            <bh-button type="submit" [disabled]="pending()" data-testid="forgot-submit">
              {{ pending() ? 'Sending…' : 'Send reset link' }}
            </bh-button>
          </form>
        }
        <p class="alt"><a href="/auth/login">Back to login</a></p>
      </div>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-lg); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-4); }
    .title { font-size: var(--fs-hero); margin: 0 0 var(--sp-2); }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class ForgotPage {
  private auth = inject(AuthService);
  email = '';
  pending = signal(false);
  submitted = signal(false);

  submit() {
    this.pending.set(true);
    // 202 always, and 429 on rate-limit — both look identical to the user by design.
    this.auth.forgotPassword(this.email).subscribe({
      next: () => { this.pending.set(false); this.submitted.set(true); },
      error: () => { this.pending.set(false); this.submitted.set(true); },
    });
  }
}

import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-reset',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        @if (expired()) {
          <p class="t-eyebrow">Link expired</p>
          <h1 class="t-display title">Expired</h1>
          <p class="muted" data-testid="reset-expired">This link has expired or was already used.</p>
          <p class="alt"><a href="/auth/forgot">Request a new link</a></p>
        } @else {
          <p class="t-eyebrow">Reset password</p>
          <h1 class="t-display title">New password</h1>
          <form (ngSubmit)="submit()" data-testid="reset-form">
            <label class="f"><span>NEW PASSWORD</span>
              <input class="bh-input" name="password" type="password" required minlength="10"
                     placeholder="min 10 characters" [(ngModel)]="password" data-testid="reset-password" />
              @if (passwordError()) { <span class="err" data-testid="reset-password-error">{{ passwordError() }}</span> }
            </label>
            @if (formError()) { <p class="err" data-testid="reset-error">{{ formError() }}</p> }
            <bh-button type="submit" [disabled]="pending()" data-testid="reset-submit">
              {{ pending() ? 'Saving…' : 'Set new password' }}
            </bh-button>
          </form>
        }
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
    .err { color: var(--volt); font-size: var(--fs-sm); margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class ResetPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  password = '';
  pending = signal(false);
  passwordError = signal('');
  formError = signal('');
  expired = signal(false);

  ngOnInit() {
    if (!this.token) this.expired.set(true);
  }

  submit() {
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.resetPassword(this.token, this.password).subscribe({
      // Cookies are already set by the response — bootstrap re-syncs the session mirror.
      next: () => this.router.navigateByUrl('/'),
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 410) { this.expired.set(true); return; }
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) this.passwordError.set(msg);
        else this.formError.set('Something went wrong — try again.');
      },
    });
  }
}

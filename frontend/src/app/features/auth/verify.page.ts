import { Component, OnDestroy, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';

const RESEND_COOLDOWN_MS = 60_000;

type Status = 'pending' | 'expired' | 'error';

@Component({
  selector: 'bh-verify',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        @switch (status()) {
          @case ('pending') {
            <p class="muted" data-testid="verify-pending">Verifying your email…</p>
          }
          @case ('expired') {
            <p class="t-eyebrow">Link expired</p>
            <h1 class="t-display title">Expired</h1>
            <p class="muted" data-testid="verify-expired">This link has expired or was already used.</p>
            <label class="f"><span>EMAIL</span>
              <input class="bh-input" type="email" required name="resendEmail"
                     [(ngModel)]="resendEmail" data-testid="verify-resend-email" /></label>
            @if (resent()) { <p class="ok" data-testid="verify-resent">Sent again.</p> }
            @if (resendError()) { <p class="err" data-testid="verify-resend-error">{{ resendError() }}</p> }
            <bh-button [disabled]="disabled() || resendPending()" (click)="resend()" data-testid="verify-resend">
              {{ resendPending() ? 'Sending…' : 'Resend verification email' }}
            </bh-button>
          }
          @case ('error') {
            <p class="t-eyebrow">Invalid link</p>
            <h1 class="t-display title">Not valid</h1>
            <p class="err" data-testid="verify-error">This verification link is invalid.</p>
            <p class="alt"><a href="/auth/signup">Back to sign up</a></p>
          }
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
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .ok { color: var(--good); font-size: var(--fs-sm); margin: 0; }
    .err { color: var(--red); font-size: var(--fs-sm); margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class VerifyPage implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cooldownTimer?: ReturnType<typeof setTimeout>;

  status = signal<Status>('pending');
  resendEmail = '';
  resent = signal(false);
  resendPending = signal(false);
  resendError = signal('');
  disabled = signal(false);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) { this.status.set('error'); return; }
    this.auth.verifyEmail(token).subscribe({
      // Cookies are already set by the response — bootstrap re-syncs the session mirror.
      next: () => this.router.navigateByUrl('/'),
      error: (e: HttpErrorResponse) => this.status.set(e.status === 410 ? 'expired' : 'error'),
    });
  }

  ngOnDestroy() {
    clearTimeout(this.cooldownTimer);
  }

  resend() {
    this.resendError.set('');
    this.resendPending.set(true);
    this.auth.resendVerification(this.resendEmail).subscribe({
      next: () => {
        this.resendPending.set(false);
        this.resent.set(true);
        this.disabled.set(true);
        this.cooldownTimer = setTimeout(() => this.disabled.set(false), RESEND_COOLDOWN_MS);
      },
      error: () => {
        this.resendPending.set(false);
        this.resendError.set('Could not resend — try again.');
      },
    });
  }
}

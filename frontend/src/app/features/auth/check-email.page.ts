import { Component, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';

const RESEND_COOLDOWN_MS = 60_000;

@Component({
  selector: 'bh-check-email',
  standalone: true,
  imports: [ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        <p class="t-eyebrow">Check your email</p>
        <h1 class="t-display title">Confirm your address</h1>
        <p class="muted" data-testid="check-email-copy">We sent a link to <strong>{{ email }}</strong>.</p>
        @if (resent()) { <p class="ok" data-testid="check-email-resent">Sent again.</p> }
        @if (resendError()) { <p class="err" data-testid="check-email-error">{{ resendError() }}</p> }
        <bh-button variant="ghost" [disabled]="disabled() || resendPending()" (click)="resend()" data-testid="check-email-resend">
          {{ resendPending() ? 'Sending…' : 'Resend' }}
        </bh-button>
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
    .muted strong { color: var(--bone); }
    .ok { color: var(--good); font-size: var(--fs-sm); margin: 0; }
    .err { color: var(--volt); font-size: var(--fs-sm); margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class CheckEmailPage implements OnDestroy {
  private auth = inject(AuthService);
  email = inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '';
  private cooldownTimer?: ReturnType<typeof setTimeout>;

  resent = signal(false);
  resendPending = signal(false);
  resendError = signal('');
  disabled = signal(false);

  ngOnDestroy() {
    clearTimeout(this.cooldownTimer);
  }

  resend() {
    this.resendError.set('');
    this.resendPending.set(true);
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.resendPending.set(false);
        this.resent.set(true);
        // Rate limit is 3/h per email — a bare re-enable would let a frustrated user hammer
        // it into a 429. One resend, then cool down.
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

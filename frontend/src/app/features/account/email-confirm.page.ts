import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

type Status = 'pending' | 'done' | 'expired' | 'error';

/**
 * Landing page for the emailed "confirm your new address" link — exact path the backend mails
 * (AccountService.startEmailChange): /account/email?token=. permitAll on the backend: the link
 * is clicked from an inbox, possibly on a device with no session, so this page never assumes
 * one — it just posts the token and reports what happened.
 */
@Component({
  selector: 'bh-email-confirm',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="auth">
      <div class="card">
        @switch (status()) {
          @case ('pending') {
            <p class="muted" data-testid="email-confirm-pending">Confirming your new email…</p>
          }
          @case ('done') {
            <p class="t-eyebrow">Email confirmed</p>
            <h1 class="t-display title">Done</h1>
            <p class="muted" data-testid="email-confirm-done">
              Your email address has been updated. You can now sign in with the new address.
            </p>
            <p class="alt"><a routerLink="/auth/login">Go to login</a></p>
          }
          @case ('expired') {
            <p class="t-eyebrow">Link expired</p>
            <h1 class="t-display title">Expired</h1>
            <p class="muted" data-testid="email-confirm-expired">This link has expired or was already used.</p>
          }
          @case ('error') {
            <p class="t-eyebrow">Invalid link</p>
            <h1 class="t-display title">Not valid</h1>
            <p class="err" data-testid="email-confirm-error">This confirmation link is invalid.</p>
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
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class EmailConfirmPage implements OnInit {
  private auth = inject(AuthService);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  status = signal<Status>('pending');

  ngOnInit() {
    if (!this.token) { this.status.set('error'); return; }
    this.auth.confirmEmailChange(this.token).subscribe({
      next: () => this.status.set('done'),
      error: (e: HttpErrorResponse) => this.status.set(e.status === 410 ? 'expired' : 'error'),
    });
  }
}

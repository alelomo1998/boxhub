import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

type Mode = 'loading' | 'open' | 'full' | 'error';

@Component({
  selector: 'bh-start-box',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        <p class="t-eyebrow">Start your box</p>
        @switch (mode()) {
          @case ('loading') { <p class="stateline" data-testid="start-loading">Loading…</p> }
          @case ('error') {
            <p class="stateline err" data-testid="start-fetch-error">Couldn't load signup — try again.</p>
            <bh-button variant="ghost" size="sm" (click)="loadMode()" data-testid="start-retry">Retry</bh-button>
          }
          @case ('open') {
            <h1 class="t-display title">Open your box</h1>
            <form (ngSubmit)="submit()" data-testid="start-form">
              <label class="f"><span>BOX NAME</span>
                <input class="bh-input" name="boxName" required [(ngModel)]="boxName" data-testid="start-box-name" /></label>
              <label class="f"><span>YOUR NAME</span>
                <input class="bh-input" name="name" required [(ngModel)]="name" data-testid="start-name" /></label>
              <label class="f"><span>EMAIL</span>
                <input class="bh-input" name="email" type="email" required [(ngModel)]="email" data-testid="start-email" /></label>
              <label class="f"><span>PASSWORD</span>
                <input class="bh-input" name="password" type="password" required minlength="10"
                       placeholder="min 10 characters" [(ngModel)]="password" data-testid="start-password" />
                @if (passwordError()) { <span class="err" data-testid="start-password-error">{{ passwordError() }}</span> }
              </label>
              @if (formError()) { <p class="err" data-testid="start-error">{{ formError() }}</p> }
              <bh-button type="submit" [disabled]="pending()" data-testid="start-submit">
                {{ pending() ? 'Creating…' : 'Create your box' }}
              </bh-button>
              <p class="alt">Already have an account? <a href="/auth/login">Log in</a></p>
            </form>
          }
          @case ('full') {
            <h1 class="t-display title">Join the waitlist</h1>
            @if (waitlisted()) {
              <p class="ok" data-testid="start-waitlist-success">You're on the list — we'll be in touch.</p>
            } @else {
              <p class="muted" data-testid="start-full-copy">We're at capacity right now — leave your details and we'll be in touch.</p>
              <form (ngSubmit)="submitWaitlist()" data-testid="waitlist-form">
                <label class="f"><span>BOX NAME</span>
                  <input class="bh-input" name="boxName" required [(ngModel)]="boxName" data-testid="waitlist-box-name" /></label>
                <label class="f"><span>EMAIL</span>
                  <input class="bh-input" name="email" type="email" required [(ngModel)]="email" data-testid="waitlist-email" /></label>
                @if (formError()) { <p class="err" data-testid="waitlist-error">{{ formError() }}</p> }
                <bh-button type="submit" [disabled]="pending()" data-testid="waitlist-submit">
                  {{ pending() ? 'Submitting…' : 'Join waitlist' }}
                </bh-button>
              </form>
            }
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
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
    .ok { color: var(--good); font-size: var(--fs-sm); margin: 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .stateline.err { color: var(--danger); }
    .alt { font-size: var(--fs-sm); margin: 0; }
  `],
})
export class StartBoxPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  boxName = '';
  name = '';
  email = '';
  password = '';

  mode = signal<Mode>('loading');
  pending = signal(false);
  passwordError = signal('');
  formError = signal('');
  waitlisted = signal(false);

  ngOnInit() {
    this.loadMode();
  }

  loadMode() {
    this.mode.set('loading');
    this.auth.signupMode().subscribe({
      next: r => this.mode.set(r.open ? 'open' : 'full'),
      error: () => this.mode.set('error'),
    });
  }

  submit() {
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.startBox(this.boxName, this.name, this.email, this.password).subscribe({
      next: res => {
        this.pending.set(false);
        // Mode flipped to APPROVAL/CLOSED between load and submit — swap to the waitlist
        // form with what's already typed (name/password aren't needed there).
        if (res.body?.full) { this.mode.set('full'); return; }
        this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email } });
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 503 && e.error?.detail === 'SIGNUP_RETRY') {
          this.formError.set('Try again in a moment.');
          return;
        }
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) this.passwordError.set(msg);
        else this.formError.set('Something went wrong — try again.');
      },
    });
  }

  submitWaitlist() {
    this.formError.set('');
    this.pending.set(true);
    this.auth.joinWaitlist(this.email, this.boxName).subscribe({
      next: () => {
        this.pending.set(false);
        this.waitlisted.set(true);
      },
      error: () => {
        this.pending.set(false);
        this.formError.set('Something went wrong — try again.');
      },
    });
  }
}

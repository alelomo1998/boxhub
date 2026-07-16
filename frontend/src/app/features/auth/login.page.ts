import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
        <bh-button type="submit">Log in</bh-button>
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
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = '';
  password = '';
  error = signal('');

  submit() {
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: session => {
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
      error: () => this.error.set('Invalid email or password'),
    });
  }
}

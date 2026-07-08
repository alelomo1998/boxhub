import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="login">
      <h1>BoxHub</h1>
      <form (ngSubmit)="submit()" data-testid="login-form">
        <input name="email" type="email" placeholder="Email" [(ngModel)]="email" required />
        <input name="password" type="password" placeholder="Password" [(ngModel)]="password" required />
        @if (error()) { <p class="error" data-testid="login-error">{{ error() }}</p> }
        <button type="submit">Log in</button>
      </form>
    </main>
  `,
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
      next: res => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) { this.router.navigateByUrl(returnUrl); return; }
        if (res.memberships.length === 1) {
          const m = res.memberships[0];
          this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
        } else {
          this.router.navigateByUrl('/auth/boxes');
        }
      },
      error: () => this.error.set('Invalid email or password'),
    });
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, Role } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-join',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <main class="auth">
      <div class="card">
        @if (invalid()) {
          <p class="t-eyebrow">Invite</p>
          <h1 class="t-display title">Not valid</h1>
          <p class="muted" data-testid="join-invalid">This invite link is invalid, expired, or already used.</p>
        } @else if (boxName()) {
          <p class="t-eyebrow">You're invited</p>
          <h1 class="t-display title">Join {{ boxName() }}</h1>
          <p class="muted">As <strong>{{ role() }}</strong>@if (planName()) { · plan <strong>{{ planName() }}</strong> }.</p>

          @if (loggedIn) {
            <bh-button (click)="acceptExisting()" data-testid="join-accept">Join {{ boxName() }}</bh-button>
          } @else {
            <form (ngSubmit)="registerAndJoin()">
              <label class="f"><span>YOUR NAME</span>
                <input class="bh-input" name="name" required [(ngModel)]="name" data-testid="join-name" /></label>
              <label class="f"><span>EMAIL</span>
                <input class="bh-input" name="email" type="email" required [(ngModel)]="email" data-testid="join-email" /></label>
              <label class="f"><span>PASSWORD</span>
                <input class="bh-input" name="password" type="password" required minlength="8"
                       placeholder="min 8 characters" [(ngModel)]="password" data-testid="join-password" /></label>
              <bh-button type="submit" data-testid="join-register">Create account & join</bh-button>
            </form>
            <p class="alt"><a [href]="'/auth/login?returnUrl=/join/' + token">Already have an account? Log in</a></p>
          }
          @if (error()) { <p class="err" data-testid="join-error">{{ error() }}</p> }
        }
      </div>
    </main>
  `,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-3); }
    .title { font-size: 44px; margin: 0 0 var(--sp-2); }
    .muted { color: var(--bone-dim); font-size: 15px; margin: 0 0 var(--sp-3); }
    .muted strong { color: var(--bone); }
    form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .alt { font-size: 13px; margin: var(--sp-2) 0 0; }
    .err { color: var(--red); font-size: 13px; margin: 0; }
  `],
})
export class JoinPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  token = inject(ActivatedRoute).snapshot.paramMap.get('token')!;

  loggedIn = this.auth.hasUserToken();
  name = '';
  email = '';
  password = '';
  readonly boxName = signal('');
  readonly role = signal<Role>('ATHLETE');
  readonly planName = signal<string | null>(null);
  readonly invalid = signal(false);
  readonly error = signal('');

  ngOnInit() {
    this.auth.previewInvite(this.token).subscribe({
      next: p => {
        this.boxName.set(p.boxName);
        this.role.set(p.role);
        this.planName.set(p.planName);
        this.email = p.email;
      },
      error: () => this.invalid.set(true),
    });
  }

  registerAndJoin() {
    this.error.set('');
    this.auth.register(this.email, this.password, this.name).pipe(
      switchMap(() => this.auth.login(this.email, this.password)),
      switchMap(() => this.auth.acceptInvite(this.token)),
      switchMap(m => this.auth.refresh().pipe(switchMap(() => this.auth.selectBox(m.boxId)), map(() => m.role))),
    ).subscribe({
      next: role => this.router.navigateByUrl(redirectForRole(role)),
      error: e => this.error.set(e.error?.detail ?? 'Could not join — try again'),
    });
  }

  acceptExisting() {
    this.error.set('');
    this.auth.acceptInvite(this.token).pipe(
      switchMap(m => this.auth.refresh().pipe(switchMap(() => this.auth.selectBox(m.boxId)), map(() => m.role))),
    ).subscribe({
      next: role => this.router.navigateByUrl(redirectForRole(role)),
      error: e => this.error.set(e.error?.detail ?? 'Could not join — try again'),
    });
  }
}

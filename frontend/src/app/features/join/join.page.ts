import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, Role } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-join',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="join">
      @if (invalid()) {
        <h1>Invite not valid</h1>
        <p data-testid="join-invalid">This invite link is invalid, expired, or already used.</p>
      } @else if (boxName()) {
        <h1>Join {{ boxName() }}</h1>
        <p>You've been invited as <strong>{{ role() }}</strong>@if (planName()) { with plan <strong>{{ planName() }}</strong> }.</p>

        @if (loggedIn) {
          <button (click)="acceptExisting()" data-testid="join-accept">Join {{ boxName() }}</button>
        } @else {
          <form (ngSubmit)="registerAndJoin()">
            <input name="name" required placeholder="Your name" [(ngModel)]="name" data-testid="join-name" />
            <input name="email" type="email" required [(ngModel)]="email" data-testid="join-email" />
            <input name="password" type="password" required minlength="8"
                   placeholder="Password (min 8 chars)" [(ngModel)]="password" data-testid="join-password" />
            <button type="submit" data-testid="join-register">Create account & join</button>
          </form>
          <p><a [href]="'/auth/login?returnUrl=/join/' + token">Already have an account? Log in</a></p>
        }
        @if (error()) { <p class="error" data-testid="join-error">{{ error() }}</p> }
      }
    </main>
  `,
})
export class JoinPage {
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
      // carry the authoritative role from the accept response, not the preview-time signal
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

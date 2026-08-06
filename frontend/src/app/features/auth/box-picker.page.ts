import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, MembershipDto } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-box-picker',
  standalone: true,
  template: `
    <main class="auth">
      <div class="card">
        <p class="t-eyebrow">Choose your box</p>
        <h1 class="t-display title">Your boxes</h1>
        @if (auth.memberships().length === 0) {
          <p class="empty">No memberships yet — ask your box admin for an invite.</p>
        }
        @if (error()) { <p class="error" data-testid="box-picker-error">{{ error() }}</p> }
        <div class="list">
          @for (m of auth.memberships(); track m.boxId) {
            <button class="box" (click)="pick(m)" [attr.data-testid]="'box-' + m.boxSlug">
              <span class="bn">{{ m.boxName }}</span>
              <span class="role">{{ m.role }}</span>
            </button>
          }
        </div>
      </div>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .auth { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-4); }
    .card { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-lg); padding: var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-3); }
    .title { font-size: 40px; margin: 0 0 var(--sp-4); }
    .empty { color: var(--bone-dim); font-size: 14px; }
    .error { color: var(--volt); font-size: 13px; margin: 0; }
    .list { display: flex; flex-direction: column; gap: var(--sp-2); }
    .box { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 14px 16px; cursor: pointer; text-align: left; transition: border-color .15s; }
    .box:hover { border-color: var(--volt); }
    .bn { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 20px;
      letter-spacing: -0.01em; color: var(--bone); }
    .role { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; color: var(--faint); text-transform: uppercase; }
  `],
})
export class BoxPickerPage {
  auth = inject(AuthService);
  private router = inject(Router);
  error = signal('');

  pick(m: MembershipDto) {
    this.error.set('');
    this.auth.selectBox(m.boxId).subscribe({
      next: () => this.router.navigateByUrl(redirectForRole(m.role)),
      // box-token mint 403s a SUSPENDED/REJECTED box (M9) — surface it instead of doing nothing.
      error: () => this.error.set('This box is unavailable — contact your box for help.'),
    });
  }
}

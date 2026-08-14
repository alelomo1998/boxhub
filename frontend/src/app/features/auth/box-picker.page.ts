import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, MembershipDto } from '../../core/auth/auth.models';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

@Component({
  selector: 'bh-box-picker',
  standalone: true,
  imports: [AlertComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <div panel>
        <p class="t-eyebrow" i18n="@@auth.boxPicker.eyebrow">Choose your box</p>
        <h1 class="t-display title" i18n="@@auth.boxPicker.headline">Your boxes</h1>
      </div>

      @if (auth.memberships().length === 0) {
        <p class="empty" i18n="@@auth.boxPicker.empty">No memberships yet — ask your box admin for an invite.</p>
      }

      @if (error()) {
        <bh-alert tone="danger" data-testid="box-picker-error">{{ error() }}</bh-alert>
      }

      <div class="list">
        @for (m of auth.memberships(); track m.boxId) {
          <button class="box" (click)="pick(m)" [disabled]="selecting() !== null"
                  [attr.aria-busy]="selecting() === m.boxId"
                  [attr.data-testid]="'box-' + m.boxSlug">
            <span class="bn">{{ m.boxName }}</span>
            @if (selecting() === m.boxId) {
              <!-- "Opening", not "Joining": the user is ALREADY a member of every box in this
                   list. Joining is what /join/:token does. -->
              <span class="role" i18n="@@auth.boxPicker.selecting">Opening…</span>
            } @else {
              <span class="role">{{ m.role }}</span>
            }
          </button>
        }
      </div>

      <!-- A real <button>, styled as a link: signing out is an ACTION, not navigation. Every other
           logout control in the product is a button too (admin-shell, coach-shell, console,
           account/security). An <a href> with preventDefault announces as a link, and offers a
           middle-click/open-in-new-tab affordance that does nothing. -->
      <p class="footer">
        <button type="button" class="linkish" (click)="signOut()"
                data-testid="box-picker-sign-out" i18n="@@auth.boxPicker.signOut">Log out</button>
      </p>
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .empty { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .list { display: flex; flex-direction: column; gap: var(--sp-2); }
    .box { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: var(--sp-3) var(--sp-4); cursor: pointer; text-align: left; transition: border-color .15s; }
    .box:hover:not(:disabled) { border-color: var(--bone-dim); }
    .box:disabled { opacity: .6; cursor: not-allowed; }
    .bn { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: var(--fs-h2);
      letter-spacing: -0.01em; color: var(--bone); }
    .role { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em; color: var(--faint); text-transform: uppercase; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
    .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--bone);
      text-decoration: underline; cursor: pointer; }
  `],
})
export class BoxPickerPage {
  auth = inject(AuthService);
  private router = inject(Router);
  error = signal('');
  /** boxId currently in flight, or null. Per-row pending — the list is @for-rendered, so a
   *  single global spinner would leave the user unable to tell which box they picked. */
  selecting = signal<string | null>(null);

  pick(m: MembershipDto) {
    if (this.selecting()) return;
    this.error.set('');
    this.selecting.set(m.boxId);
    this.auth.selectBox(m.boxId).subscribe({
      next: () => {
        this.selecting.set(null);
        this.router.navigateByUrl(redirectForRole(m.role));
      },
      // box-token mint 403s a SUSPENDED/REJECTED box (M9) — surface it instead of doing nothing.
      error: () => {
        this.selecting.set(null);
        this.error.set($localize`:@@auth.boxPicker.error:This box is unavailable — contact your box for help.`);
      },
    });
  }

  signOut() {
    this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
  }
}

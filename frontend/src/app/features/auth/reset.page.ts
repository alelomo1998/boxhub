import { Component, ElementRef, Injector, OnInit, afterNextRender, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage, redirectForRole } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

const MIN_PASSWORD_LENGTH = 10;

@Component({
  selector: 'bh-reset',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <!-- Panel and body are separate top-level @if blocks, same as forgot/verify: an @if branch
           with more than one root node does not project into a named slot (NG8011), and the
           failure is silent — eyebrow/headline just never appear. -->
      @if (boxUnavailable()) {
        <!-- Its own branch. The password WAS changed here; only the box token was refused. Left
             as a danger alert inside the still-visible form, it read as "your reset failed" under
             a "New password" heading — and invited a retry that would consume nothing, 410, and
             flip to "Expired", turning a success into an apparent total failure. -->
        <div panel>
          <p class="t-eyebrow" i18n="@@auth.reset.boxUnavailable.eyebrow">Password changed</p>
          <h1 class="t-display title" i18n="@@auth.reset.boxUnavailable.headline">Your box is unavailable.</h1>
        </div>
      } @else if (expired()) {
        <div panel>
          <p class="t-eyebrow" i18n="@@auth.reset.expired.eyebrow">Link expired</p>
          <h1 class="t-display title" i18n="@@auth.reset.expired.headline">Expired</h1>
        </div>
      } @else {
        <div panel>
          <p class="t-eyebrow" i18n="@@auth.reset.panel.eyebrow">Reset password</p>
          <h1 class="t-display title" i18n="@@auth.reset.panel.headline">New password</h1>
        </div>
      }

      @if (boxUnavailable()) {
        <bh-alert tone="warn" data-testid="reset-box-unavailable" i18n="@@auth.reset.boxUnavailable.copy">Your new password is saved, but this box is unavailable — contact your box for help.</bh-alert>
        <p class="footer">
          <a routerLink="/auth/login" i18n="@@auth.reset.boxUnavailable.backToLogin">Back to login</a>
        </p>
      } @else if (expired()) {
        <p class="muted" data-testid="reset-expired" i18n="@@auth.reset.expired.copy">This link has expired or was already used.</p>
        <p class="footer">
          <a routerLink="/auth/forgot" i18n="@@auth.reset.requestNew">Request a new link</a>
        </p>
      } @else {
        <form class="form" (submit)="submit($event)" novalidate data-testid="reset-form">
          <bh-field label="NEW PASSWORD" i18n-label="@@auth.reset.password.label" type="password"
                     name="password" autocomplete="new-password" [required]="true" [(value)]="password"
                     (valueChange)="passwordError.set('')"
                     testId="reset-password" placeholder="min 10 characters" i18n-placeholder="@@auth.reset.password.placeholder"
                     [error]="passwordError()" />

          <!-- Informational, not an alert — under the field and ahead of the button that causes
               it, so the user reads it before they act rather than after. -->
          <p class="disclosure" i18n="@@auth.reset.disclosure">Setting a new password signs you out on all your other devices.</p>

          @if (formError()) {
            <bh-alert tone="danger" data-testid="reset-error">{{ formError() }}</bh-alert>
          }

          <bh-button type="submit" [loading]="pending()" testId="reset-submit">
            @if (pending()) {
              <span i18n="@@auth.reset.submit.pending">Saving…</span>
            } @else {
              <span i18n="@@auth.reset.submit.default">Set new password</span>
            }
          </bh-button>
        </form>
      }
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .disclosure { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
    .footer a { color: var(--bone-dim); }
  `],
})
export class ResetPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  password = signal('');
  pending = signal(false);
  passwordError = signal('');
  formError = signal('');
  expired = signal(false);
  boxUnavailable = signal(false);

  ngOnInit() {
    if (!this.token) {
      this.expired.set(true);
      this.focusField('reset-expired');
    }
  }

  submit(event?: Event) {
    event?.preventDefault();
    // Enter in this lone-field form submits regardless of bh-button's [disabled] state — the
    // guard belongs here, on the action itself, not on the button.
    if (this.pending()) return;

    const value = this.password();
    if (value.length < MIN_PASSWORD_LENGTH) {
      this.passwordError.set($localize`:@@auth.reset.password.error:Use at least 10 characters.`);
      this.focusField('reset-password');
      return;
    }
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    // Cookies are already set by the response — bootstrap re-syncs the session mirror. No second
    // login call needed.
    this.auth.resetPassword(this.token, value).subscribe({
      next: session => {
        this.pending.set(false);
        const memberships = session?.memberships ?? [];
        if (memberships.length === 1) {
          const m = memberships[0];
          this.auth.selectBox(m.boxId).subscribe({
            next: () => this.router.navigateByUrl(redirectForRole(m.role)),
            // box-token mint 403s a SUSPENDED/REJECTED box (M9) — same arm as login/verify. The
            // password WAS reset successfully; only the box token was refused, so this stays a
            // form-level message (like login's arm) rather than flipping to a new page state.
            error: () => { this.boxUnavailable.set(true); this.focusField('reset-box-unavailable'); },
          });
        } else {
          this.router.navigateByUrl('/gyms');
        }
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        if (e.status === 410) {
          this.expired.set(true);
          // The submit button unmounts with the form when this flips to the expired branch,
          // dropping focus to <body> with no announcement. Fourth screen in this milestone to
          // need this — see forgot/verify.
          this.focusField('reset-expired');
          return;
        }
        const msg = passwordErrorMessage(e.error?.detail);
        if (msg) this.passwordError.set(msg);
        else this.formError.set($localize`:@@auth.reset.error.generic:Something went wrong — try again.`);
      },
    });
  }

  private focusField(testId: string) {
    // afterNextRender, NOT queueMicrotask/direct focus — this can run right after a structural
    // @if flip (form -> expired), and the target element doesn't exist in the DOM until Angular
    // re-renders. See forgot.page.ts for the same fix and its rationale.
    afterNextRender(() => {
      const el = this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!el) return;
      // A <p> is not focusable without tabindex, so focusing it would silently do nothing. Only
      // add it where it is missing: putting tabindex="-1" on an <input> would take that input OUT
      // of the tab order, which is the opposite of what this method is for.
      if (!el.matches('input, button, a[href], select, textarea')) el.setAttribute('tabindex', '-1');
      el.focus();
    }, { injector: this.injector });
  }
}

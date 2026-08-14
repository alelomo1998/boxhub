import { Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'bh-forgot',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <!-- Panel and body are separate top-level @if blocks, same as verify.page: an @if branch
           with more than one root node does not project into a named slot (NG8011), so panel
           and body cannot share one block. -->
      @if (submitted()) {
        <div panel>
          <!-- The eyebrow names the FLOW and stays put; only the headline moves on with the
               user. Repeating "Check your email" in both read as a rendering fault and gave the
               heading a duplicated accessible name. -->
          <p class="t-eyebrow" i18n="@@auth.forgot.confirm.eyebrow">Reset password</p>
          <h1 class="t-display title" i18n="@@auth.forgot.confirm.headline">Check your email</h1>
        </div>
      } @else {
        <div panel>
          <p class="t-eyebrow" i18n="@@auth.forgot.panel.eyebrow">Reset password</p>
          <h1 class="t-display title" i18n="@@auth.forgot.panel.headline">Forgot password</h1>
        </div>
      }

      @if (submitted()) {
        <!-- Same sentence no matter what the backend actually did — that's the no-enumeration
             promise made visible. Never branch on the response here. -->
        <p class="muted" data-testid="forgot-confirm" i18n="@@auth.forgot.confirm.copy">If that address has an account, we've sent a reset link.</p>
        <p class="footer">
          <button type="button" class="linklike" (click)="useDifferentAddress()" i18n="@@auth.forgot.useDifferent">Use a different address</button>
        </p>
      } @else {
        <form class="form" (submit)="submit($event)" novalidate data-testid="forgot-form">
          <bh-field label="EMAIL" i18n-label="@@auth.forgot.email.label" type="email"
                     name="email" autocomplete="email" [required]="true" [(value)]="email"
                     (valueChange)="emailError.set('')"
                     testId="forgot-email" placeholder="you@email.com" i18n-placeholder="@@auth.forgot.email.placeholder"
                     [error]="emailError()" />

          <bh-button type="submit" [loading]="pending()" testId="forgot-submit">
            @if (pending()) {
              <span i18n="@@auth.forgot.submit.pending">Sending…</span>
            } @else {
              <span i18n="@@auth.forgot.submit.default">Send reset link</span>
            }
          </bh-button>
        </form>
      }

      <p class="footer">
        <a routerLink="/auth/login" i18n="@@auth.forgot.backToLogin">Back to login</a>
      </p>
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
    .linklike { background: none; border: none; padding: 0; font: inherit; color: var(--bone);
      text-decoration: underline; text-underline-offset: 2px; cursor: pointer; min-height: var(--tap); }
    .linklike:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--edge); }
  `],
})
export class ForgotPage {
  private auth = inject(AuthService);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  email = signal('');
  pending = signal(false);
  submitted = signal(false);
  emailError = signal('');

  submit(event?: Event) {
    event?.preventDefault();
    // Enter in this lone-field form submits regardless of bh-button's [disabled] state — the
    // guard belongs here, on the action itself, not on the button.
    if (this.pending()) return;

    const value = this.email().trim();
    if (!EMAIL_RE.test(value)) {
      this.emailError.set($localize`:@@auth.forgot.email.error:Enter a valid email address.`);
      this.focusField('forgot-email');
      return;
    }
    this.emailError.set('');
    this.pending.set(true);
    // 202 always, and 429 on rate-limit — both look identical to the user by design. Branching
    // here, even for a friendlier message, would turn this screen into an account-enumeration
    // oracle.
    this.auth.forgotPassword(value).subscribe({
      next: () => { this.pending.set(false); this.submitted.set(true); },
      error: () => { this.pending.set(false); this.submitted.set(true); },
    });
  }

  useDifferentAddress() {
    this.submitted.set(false);
    this.focusField('forgot-email');
  }

  private focusField(testId: string) {
    // afterNextRender, NOT queueMicrotask/direct focus — this can run right after a structural
    // @if flip (submitted -> form), and the target input doesn't exist in the DOM until Angular
    // re-renders. See verify.page.ts for the same fix and its rationale.
    afterNextRender(() => {
      this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus();
    }, { injector: this.injector });
  }
}

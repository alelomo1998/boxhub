import { Component, ElementRef, Injector, OnDestroy, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

const RESEND_COOLDOWN_MS = 60_000;

@Component({
  selector: 'bh-check-email',
  standalone: true,
  imports: [RouterLink, ButtonComponent, AlertComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <div panel>
        <p class="t-eyebrow" i18n="@@auth.checkEmail.eyebrow">Check your email</p>
        <h1 class="t-display title" i18n="@@auth.checkEmail.headline">Confirm your address</h1>
      </div>

      @if (email) {
        <p class="muted" data-testid="check-email-copy" i18n="@@auth.checkEmail.copy.withEmail">We sent a link to <strong>{{ email }}</strong>.</p>
      } @else {
        <p class="muted" data-testid="check-email-copy" i18n="@@auth.checkEmail.copy.noEmail">We sent you a link.</p>
      }

      @if (resent()) {
        <bh-alert tone="good" data-testid="check-email-resent" i18n="@@auth.checkEmail.resentSuccess">Sent again — check your inbox.</bh-alert>
      }
      @if (resendError()) {
        <bh-alert tone="danger" data-testid="check-email-error">{{ resendError() }}</bh-alert>
      }

      <bh-button variant="ghost" [disabled]="disabled() || resendPending()" (click)="resend()" testId="check-email-resend">
        @if (resendPending()) {
          <span i18n="@@auth.checkEmail.resend.pending">Sending…</span>
        } @else if (disabled()) {
          <span i18n="@@auth.checkEmail.resend.cooldown">Resend in {{ secondsLeft() }}s</span>
        } @else {
          <span i18n="@@auth.checkEmail.resend.default">Resend</span>
        }
      </bh-button>

      <p class="footer">
        <a routerLink="/auth/login" i18n="@@auth.checkEmail.backToLogin">Back to login</a>
      </p>
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    /* overflow-wrap: a 47-char address overflowed the 375px viewport (scrollWidth 390 vs
       clientWidth 375). Email addresses have no spaces to break on. */
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; overflow-wrap: anywhere; }
    .muted strong { color: var(--bone); }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class CheckEmailPage implements OnDestroy {
  private auth = inject(AuthService);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);
  email = inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '';
  private cooldownTimer?: ReturnType<typeof setTimeout>;
  // Display-only ticker for the countdown label — the cooldown itself is still governed by
  // cooldownTimer below. A second timer, so it needs its own ngOnDestroy cleanup too.
  private countdownInterval?: ReturnType<typeof setInterval>;

  resent = signal(false);
  resendPending = signal(false);
  resendError = signal('');
  disabled = signal(false);
  secondsLeft = signal(0);

  ngOnDestroy() {
    clearTimeout(this.cooldownTimer);
    clearInterval(this.countdownInterval);
  }

  resend() {
    // A new attempt must clear whatever the previous one left behind — otherwise a stale "Sent
    // again" can sit on screen at the same time as a fresh error, or vice versa.
    this.resendError.set('');
    this.resent.set(false);
    this.resendPending.set(true);
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.resendPending.set(false);
        this.resent.set(true);
        // Rate limit is 3/h per email — a bare re-enable would let a frustrated user hammer
        // it into a 429. One resend, then cool down.
        this.disabled.set(true);
        this.secondsLeft.set(RESEND_COOLDOWN_MS / 1000);
        this.countdownInterval = setInterval(() => {
          const next = this.secondsLeft() - 1;
          this.secondsLeft.set(next);
          if (next <= 0) clearInterval(this.countdownInterval);
        }, 1000);
        this.cooldownTimer = setTimeout(() => this.disabled.set(false), RESEND_COOLDOWN_MS);
        this.focusResult('check-email-resent');
      },
      error: () => {
        this.resendPending.set(false);
        this.resendError.set($localize`:@@auth.checkEmail.error:Could not resend — try again.`);
        this.focusResult('check-email-error');
      },
    });
  }

  /**
   * Move focus onto the alert that just appeared. Two reasons, and the first is the one that
   * makes this necessary rather than nice: bh-button uses the NATIVE disabled attribute, so the
   * moment the cooldown starts, the button the user just pressed leaves the a11y tree and focus
   * falls to <body> — they would have to tab from the top of the page to reach anything. The
   * same defect scored a P1 on box-picker. Second, it announces the outcome, which a silently
   * swapped label does not.
   */
  private focusResult(testId: string) {
    // afterNextRender, NOT queueMicrotask. The app runs zone.js change detection with
    // eventCoalescing (app.config.ts), so the CD flush is deferred past the microtask queue —
    // a queueMicrotask callback runs BEFORE the alert exists, querySelector returns null, and
    // the whole focus move silently no-ops. That shipped here and a Karma spec did not catch it,
    // because fixture.detectChanges() forces the flush synchronously and hides the real timing.
    afterNextRender(() => {
      const el = this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!el) return;
      el.setAttribute('tabindex', '-1');
      el.focus();
    }, { injector: this.injector });
  }
}

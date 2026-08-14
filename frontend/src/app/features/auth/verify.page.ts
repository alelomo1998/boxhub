import { Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';

const RESEND_COOLDOWN_MS = 60_000;

type Status = 'pending' | 'expired' | 'error';

@Component({
  selector: 'bh-verify',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <!-- Panel content gets its OWN @switch, one node per @case — an @case with a sibling
           alongside [panel] does not project (NG8011: the compiler only projects a @case's
           single root node), so panel and body must be two separate top-level switches, not
           one @switch mixing both. Pending gets no panel case at all — same bare-line
           treatment as the original, no eyebrow/headline while a token is in flight. -->
      @switch (status()) {
        @case ('expired') {
          <div panel>
            <p class="t-eyebrow" i18n="@@auth.verify.expired.eyebrow">Link expired</p>
            <h1 class="t-display title" i18n="@@auth.verify.expired.headline">Expired</h1>
          </div>
        }
        @case ('error') {
          <div panel>
            <p class="t-eyebrow" i18n="@@auth.verify.error.eyebrow">Invalid link</p>
            <h1 class="t-display title" i18n="@@auth.verify.error.headline">Not valid</h1>
          </div>
        }
      }

      @switch (status()) {
        @case ('pending') {
          <p class="stateline" data-testid="verify-pending" i18n="@@auth.verify.pending.copy">Verifying your email…</p>
        }
        @case ('expired') {
          <p class="muted" data-testid="verify-expired" i18n="@@auth.verify.expired.copy">This link has expired or was already used.</p>

          <bh-field label="EMAIL" i18n-label="@@auth.verify.resend.email.label" type="email"
                     name="resendEmail" autocomplete="email" [required]="true"
                     [(value)]="resendEmail" testId="verify-resend-email" />

          @if (resent()) {
            <bh-alert tone="good" data-testid="verify-resent" i18n="@@auth.verify.resentSuccess">Sent again — check your inbox.</bh-alert>
          }
          @if (resendError()) {
            <bh-alert tone="danger" data-testid="verify-resend-error">{{ resendError() }}</bh-alert>
          }

          <bh-button [disabled]="disabled() || resendPending()" (click)="resend()" testId="verify-resend">
            @if (resendPending()) {
              <span i18n="@@auth.verify.resend.pending">Sending…</span>
            } @else if (disabled()) {
              <span i18n="@@auth.verify.resend.cooldown">Resend in {{ secondsLeft() }}s</span>
            } @else {
              <span i18n="@@auth.verify.resend.default">Resend verification email</span>
            }
          </bh-button>
        }
        @case ('error') {
          <bh-alert tone="danger" data-testid="verify-error">{{ errorMessage() }}</bh-alert>
          <p class="footer">
            <a routerLink="/auth/login" i18n="@@auth.verify.backToLogin">Back to login</a>
          </p>
        }
      }
    </bh-auth-layout>
  `,
  styles: [`
    .title { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class VerifyPage implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);
  private cooldownTimer?: ReturnType<typeof setTimeout>;
  // Display-only ticker for the countdown label — the cooldown itself is still governed by
  // cooldownTimer below. A second timer, so it needs its own ngOnDestroy cleanup too.
  private countdownInterval?: ReturnType<typeof setInterval>;

  status = signal<Status>('pending');
  errorMessage = signal('');
  resendEmail = signal('');
  resent = signal(false);
  resendPending = signal(false);
  resendError = signal('');
  disabled = signal(false);
  secondsLeft = signal(0);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status.set('error');
      this.errorMessage.set($localize`:@@auth.verify.error.invalid:This verification link is invalid.`);
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      // Cookies are already set by the response — bootstrap re-syncs the session mirror.
      next: session => {
        const memberships = session?.memberships ?? [];
        if (memberships.length === 1) {
          const m = memberships[0];
          this.auth.selectBox(m.boxId).subscribe({
            next: () => this.router.navigateByUrl(redirectForRole(m.role)),
            // box-token mint 403s a SUSPENDED/REJECTED box (M9). Without this arm the user who
            // just verified their email would sit on the page with no feedback.
            error: () => {
              this.status.set('error');
              this.errorMessage.set(
                $localize`:@@auth.verify.error.boxUnavailable:This box is unavailable — contact your box for help.`);
            },
          });
        } else {
          this.router.navigateByUrl('/auth/boxes');
        }
      },
      error: (e: HttpErrorResponse) => {
        if (e.status === 410) { this.status.set('expired'); return; }
        this.status.set('error');
        this.errorMessage.set($localize`:@@auth.verify.error.invalid:This verification link is invalid.`);
      },
    });
  }

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
    this.auth.resendVerification(this.resendEmail()).subscribe({
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
        this.focusResult('verify-resent');
      },
      error: () => {
        this.resendPending.set(false);
        this.resendError.set($localize`:@@auth.verify.resend.error:Could not resend — try again.`);
        this.focusResult('verify-resend-error');
      },
    });
  }

  /**
   * Move focus onto the alert that just appeared. bh-button uses the NATIVE disabled attribute,
   * so the moment the cooldown starts, the button the user just pressed leaves the a11y tree and
   * focus falls to <body>. See check-email.page.ts for the full rationale — same fix, copied.
   */
  private focusResult(testId: string) {
    // afterNextRender, NOT queueMicrotask. The app runs zone.js change detection with
    // eventCoalescing (app.config.ts), so a queueMicrotask callback runs BEFORE the alert exists,
    // querySelector returns null, and the focus move silently no-ops.
    afterNextRender(() => {
      const el = this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!el) return;
      el.setAttribute('tabindex', '-1');
      el.focus();
    }, { injector: this.injector });
  }
}

import { Component, ElementRef, Injector, OnInit, ViewChild, afterNextRender, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { passwordErrorMessage, fieldErrorMessages } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { BenchmarkBoardComponent } from '../../ui/benchmark-board.component';

type Mode = 'loading' | 'open' | 'full' | 'error';

@Component({
  selector: 'bh-start-box',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent, BenchmarkBoardComponent],
  template: `
    <bh-auth-layout variant="split">
      <!-- TWO projected blocks, same as login/signup: the board and the eyebrow+headline separately,
           so bh-auth-layout's space-between panel distributes wordmark / board / headline across its
           height instead of collapsing into one flex child. The panel is IDENTICAL in every mode —
           the form beside it already carries the open-vs-waitlist difference. -->
      <bh-benchmark-board panel testId="start-benchmark" />

      <div panel>
        <p class="t-eyebrow" i18n="@@auth.startBox.panel.eyebrow">For box owners</p>
        <h1 class="headline t-display" i18n="@@auth.startBox.panel.headline">Run your gym on rxed.</h1>
      </div>

      @switch (mode()) {
        @case ('loading') {
          <p class="stateline" data-testid="start-loading" i18n="@@auth.startBox.loading">Loading…</p>
        }
        @case ('error') {
          <p class="stateline err" data-testid="start-fetch-error" i18n="@@auth.startBox.fetchError">Couldn't load signup — try again.</p>
          <bh-button variant="ghost" size="sm" (click)="loadMode()" testId="start-retry">
            <span i18n="@@auth.startBox.retry">Retry</span>
          </bh-button>
        }
        @case ('open') {
          <form class="form" (submit)="submit($event)" novalidate data-testid="start-form">
            <bh-field label="BOX NAME" i18n-label="@@auth.startBox.boxName.label" type="text"
                       name="boxName" autocomplete="organization" [required]="true" [(value)]="boxName"
                       testId="start-box-name" placeholder="Iron Box CrossFit" i18n-placeholder="@@auth.startBox.boxName.placeholder"
                       [error]="boxNameError()" />

            <bh-field label="YOUR NAME" i18n-label="@@auth.startBox.name.label" type="text"
                       name="name" autocomplete="name" [required]="true" [(value)]="name"
                       testId="start-name" placeholder="Jane Doe" i18n-placeholder="@@auth.startBox.name.placeholder"
                       [error]="nameError()" />

            <bh-field label="EMAIL" i18n-label="@@auth.startBox.email.label" type="email"
                       name="email" autocomplete="username" [required]="true" [(value)]="email"
                       testId="start-email" placeholder="you@email.com" i18n-placeholder="@@auth.startBox.email.placeholder"
                       [error]="emailError()" />

            <!-- No host data-testid: bh-field derives the error node's own hook as '<testId>-error',
                 so 'start-password-error' lands on the error span itself. -->
            <bh-field label="PASSWORD" i18n-label="@@auth.startBox.password.label" type="password"
                       name="password" autocomplete="new-password" [required]="true" [(value)]="password"
                       testId="start-password" placeholder="min 10 characters" i18n-placeholder="@@auth.startBox.password.placeholder"
                       [error]="passwordError()" />

            @if (formError()) {
              <bh-alert tone="danger" data-testid="start-error">{{ formError() }}</bh-alert>
            }

            <bh-button class="full" type="submit" [loading]="pending()" testId="start-submit">
              @if (pending()) {
                <span i18n="@@auth.startBox.submit.pending">Creating…</span>
              } @else {
                <span i18n="@@auth.startBox.submit.default">Create your box</span>
              }
            </bh-button>

            <p class="footer">
              <span i18n="@@auth.startBox.footer.prefix">Already have an account? </span><a
                 routerLink="/auth/login" i18n="@@auth.startBox.footer.link">Log in</a>
            </p>
          </form>
        }
        @case ('full') {
          @if (waitlisted()) {
            <p class="ok" data-testid="start-waitlist-success" i18n="@@auth.startBox.waitlistSuccess">You're on the list — we'll be in touch.</p>
            <p class="footer">
              <a routerLink="/auth/login" data-testid="start-waitlist-back-to-login" i18n="@@auth.startBox.waitlistSuccess.backToLogin">Back to login</a>
            </p>
          } @else {
            @if (flippedFromSubmit()) {
              <bh-alert #waitlistFlipNotice tabindex="-1" tone="warn" data-testid="start-waitlist-flip-notice"
                        i18n="@@auth.startBox.waitlistFlipNotice">
                The platform reached capacity while you were signing up. We've kept your box name and email below for the waitlist.
              </bh-alert>
            }
            <p class="muted" data-testid="start-full-copy" i18n="@@auth.startBox.fullCopy">We're at capacity right now — leave your details and we'll be in touch.</p>
            <form class="form" (submit)="submitWaitlist($event)" novalidate data-testid="waitlist-form">
              <bh-field label="BOX NAME" i18n-label="@@auth.startBox.waitlist.boxName.label" type="text"
                         name="boxName" autocomplete="organization" [required]="true" [(value)]="boxName"
                         testId="waitlist-box-name" placeholder="Iron Box CrossFit" i18n-placeholder="@@auth.startBox.waitlist.boxName.placeholder" />

              <bh-field label="EMAIL" i18n-label="@@auth.startBox.waitlist.email.label" type="email"
                         name="email" autocomplete="username" [required]="true" [(value)]="email"
                         testId="waitlist-email" placeholder="you@email.com" i18n-placeholder="@@auth.startBox.waitlist.email.placeholder" />

              @if (formError()) {
                <bh-alert tone="danger" data-testid="waitlist-error">{{ formError() }}</bh-alert>
              }

              <bh-button class="full" type="submit" [loading]="pending()" testId="waitlist-submit">
                @if (pending()) {
                  <span i18n="@@auth.startBox.waitlist.submit.pending">Submitting…</span>
                } @else {
                  <span i18n="@@auth.startBox.waitlist.submit.default">Join waitlist</span>
                }
              </bh-button>
            </form>
          }
        }
      }
    </bh-auth-layout>
  `,
  styles: [`
    .headline { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .stateline { color: var(--bone-dim); margin: 0; }
    .stateline.err { color: var(--danger); }
    .ok { color: var(--good); font-size: var(--fs-sm); margin: 0; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class StartBoxPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private injector = inject(Injector);

  // Focus target for the mid-submit flip notice — read via afterNextRender once it mounts,
  // since @ViewChild only reflects the DOM after the next render, not the signal write.
  @ViewChild('waitlistFlipNotice', { read: ElementRef }) waitlistFlipNoticeRef?: ElementRef<HTMLElement>;

  boxName = signal('');
  name = signal('');
  email = signal('');
  password = signal('');

  mode = signal<Mode>('loading');
  pending = signal(false);
  boxNameError = signal('');
  nameError = signal('');
  emailError = signal('');
  passwordError = signal('');
  formError = signal('');

  private el: ElementRef<HTMLElement> = inject(ElementRef);

  /** DOM order — picks which invalid field to focus after a failed submit. */
  private readonly fieldOrder: Array<[key: 'boxName' | 'name' | 'email' | 'password', testId: string]> = [
    ['boxName', 'start-box-name'], ['name', 'start-name'],
    ['email', 'start-email'], ['password', 'start-password'],
  ];
  waitlisted = signal(false);
  // True only when 'full' was reached by a submit flipping under the user, not a cold load —
  // that distinction is what tells the flip notice apart from someone landing on a closed platform.
  flippedFromSubmit = signal(false);

  ngOnInit() {
    this.loadMode();
  }

  loadMode() {
    this.mode.set('loading');
    this.auth.signupMode().subscribe({
      next: r => this.mode.set(r.open ? 'open' : 'full'),
      error: () => this.mode.set('error'),
    });
  }

  submit(event?: Event) {
    event?.preventDefault();
    this.boxNameError.set('');
    this.nameError.set('');
    this.emailError.set('');
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.startBox(this.boxName(), this.name(), this.email(), this.password()).subscribe({
      next: res => {
        this.pending.set(false);
        // Mode flipped to APPROVAL/CLOSED between load and submit — swap to the waitlist
        // form with what's already typed (name/password aren't needed there).
        if (res.body?.full) {
          this.mode.set('full');
          this.flippedFromSubmit.set(true);
          // Focus moves onto the notice once it's actually in the DOM — the form just changed
          // out from under a keyboard/screen-reader user and focus was left on <body>.
          afterNextRender(() => this.waitlistFlipNoticeRef?.nativeElement.focus(), { injector: this.injector });
          return;
        }
        this.router.navigate(['/auth/check-email'], { queryParams: { email: this.email() } });
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        // SIGNUP_RETRY stays ahead of everything: it is the bounded slug-collision retry giving
        // up, it belongs to no field, and it is retryable — a generic message would lose that.
        if (e.status === 503 && e.error?.detail === 'SIGNUP_RETRY') {
          this.formError.set($localize`:@@auth.startBox.error.retry:Try again in a moment.`);
          return;
        }

        const fieldErrors = fieldErrorMessages(e);
        // A password-policy code (PASSWORD_TOO_SHORT / PASSWORD_BREACHED) is more specific than
        // the generic mapped message for that field, so it wins when both are present.
        const pwMsg = passwordErrorMessage(e.error?.detail);
        if (pwMsg) fieldErrors['password'] = pwMsg;

        this.boxNameError.set(fieldErrors['boxName'] ?? '');
        this.nameError.set(fieldErrors['name'] ?? '');
        this.emailError.set(fieldErrors['email'] ?? '');
        this.passwordError.set(fieldErrors['password'] ?? '');

        // Show the top-of-form alert ONLY when nothing landed on a field — otherwise the user is
        // told twice. Focus the first bad field: at 375px this form's submit sits below the fold.
        const first = this.fieldOrder.find(([key]) => fieldErrors[key]);
        if (first) {
          this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${first[1]}"]`)?.focus();
        } else {
          this.formError.set($localize`:@@auth.startBox.error.generic:Something went wrong — try again.`);
        }
      },
    });
  }

  submitWaitlist(event?: Event) {
    event?.preventDefault();
    this.formError.set('');
    this.pending.set(true);
    this.auth.joinWaitlist(this.email(), this.boxName()).subscribe({
      next: () => {
        this.pending.set(false);
        this.waitlisted.set(true);
      },
      error: () => {
        this.pending.set(false);
        this.formError.set($localize`:@@auth.startBox.waitlist.error.generic:Something went wrong — try again.`);
      },
    });
  }
}

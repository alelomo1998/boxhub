import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, Role, passwordErrorMessage, fieldErrorMessages } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { BenchmarkBoardComponent } from '../../ui/benchmark-board.component';

@Component({
  selector: 'bh-join',
  standalone: true,
  imports: [RouterLink, ButtonComponent, FieldComponent, AlertComponent, AuthLayoutComponent, BenchmarkBoardComponent],
  template: `
    <bh-auth-layout variant="split">
      <!-- TWO projected blocks, same as login/signup/start-box: the board and the eyebrow+headline
           separately, so bh-auth-layout's space-between panel distributes wordmark / board /
           headline across its height instead of collapsing into one flex child. Unlike its three
           siblings, join's panel copy has three variants (loading/invalid/valid) — the headline
           names a box that isn't known until previewInvite resolves. -->
      <bh-benchmark-board panel testId="join-benchmark" />

      <div panel>
        @if (previewLoading()) {
          <p class="t-eyebrow" i18n="@@auth.join.panel.eyebrow">You're invited</p>
          <h1 class="headline t-display" i18n="@@auth.join.panel.headline.loading">Finding your invite…</h1>
        } @else if (invalid()) {
          <p class="t-eyebrow" i18n="@@auth.join.panel.eyebrow.invalid">Invite</p>
          <h1 class="headline t-display" i18n="@@auth.join.panel.headline.invalid">This invite isn't valid.</h1>
        } @else {
          <p class="t-eyebrow" i18n="@@auth.join.panel.eyebrow">You're invited</p>
          <h1 class="headline t-display" i18n="@@auth.join.panel.headline">Join {{ boxName() }}.</h1>
        }
      </div>

      @if (previewLoading()) {
        <p class="stateline" data-testid="join-loading" i18n="@@auth.join.loading">Loading…</p>
      } @else if (invalid()) {
        <p class="stateline" data-testid="join-invalid" i18n="@@auth.join.invalid">This invite link is invalid, expired, or already used.</p>
        <p class="footer">
          <a routerLink="/auth/login" data-testid="join-invalid-back-to-login" i18n="@@auth.join.invalid.backToLogin">Back to login</a>
        </p>
      } @else {
        @if (planName()) {
          <p class="roleline" i18n="@@auth.join.roleLine.plan">You've been invited as {{ roleLabel() }} · plan {{ planName() }}.</p>
        } @else {
          <p class="roleline" i18n="@@auth.join.roleLine">You've been invited as {{ roleLabel() }}.</p>
        }

        @if (loggedIn) {
          @if (formError()) {
            <bh-alert tone="danger" data-testid="join-error">{{ formError() }}</bh-alert>
          }
          <bh-button class="full" [loading]="pending()" (click)="acceptExisting()" testId="join-accept">
            @if (pending()) {
              <span i18n="@@auth.join.accept.pending">Joining…</span>
            } @else {
              <span i18n="@@auth.join.accept.default">Join {{ boxName() }}</span>
            }
          </bh-button>
        } @else {
          <form class="form" (submit)="submit($event)" novalidate data-testid="join-form">
            <bh-field label="YOUR NAME" i18n-label="@@auth.join.name.label" type="text"
                       name="name" autocomplete="name" [required]="true" [(value)]="name"
                       testId="join-name" placeholder="Jane Doe" i18n-placeholder="@@auth.join.name.placeholder"
                       [error]="nameError()" />

            <bh-field label="EMAIL" i18n-label="@@auth.join.email.label" type="email"
                       name="email" autocomplete="username" [required]="true" [(value)]="email"
                       testId="join-email" [error]="emailError()" />

            <!-- No host data-testid: bh-field derives the error node's own hook as '<testId>-error',
                 so 'join-password-error' lands on the error span itself. -->
            <bh-field label="PASSWORD" i18n-label="@@auth.join.password.label" type="password"
                       name="password" autocomplete="new-password" [required]="true" [(value)]="password"
                       testId="join-password" placeholder="min 10 characters" i18n-placeholder="@@auth.join.password.placeholder"
                       [error]="passwordError()" />

            @if (formError()) {
              <bh-alert tone="danger" data-testid="join-error">{{ formError() }}</bh-alert>
            }

            <bh-button class="full" type="submit" [loading]="pending()" testId="join-register">
              @if (pending()) {
                <span i18n="@@auth.join.submit.pending">Creating…</span>
              } @else {
                <span i18n="@@auth.join.submit.default">Create account & join</span>
              }
            </bh-button>

            <p class="footer">
              <span i18n="@@auth.join.footer.prefix">Already have an account? </span><a
                 routerLink="/auth/login" [queryParams]="{ returnUrl: '/join/' + token }"
                 i18n="@@auth.join.footer.link">Log in</a>
            </p>
          </form>
        }
      }
    </bh-auth-layout>
  `,
  styles: [`
    .headline { font-size: var(--fs-display); margin: var(--sp-2) 0 0; }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); }
    .roleline { color: var(--bone-dim); font-size: var(--fs-body); margin: 0 0 var(--sp-2); }
    .stateline { color: var(--bone-dim); margin: 0; }
    .footer { font-size: var(--fs-sm); margin: 0; text-align: center; }
  `],
})
export class JoinPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private el: ElementRef<HTMLElement> = inject(ElementRef);
  token = inject(ActivatedRoute).snapshot.paramMap.get('token')!;

  loggedIn = this.auth.hasSession();
  name = signal('');
  email = signal('');
  password = signal('');
  pending = signal(false);
  nameError = signal('');
  emailError = signal('');
  passwordError = signal('');
  formError = signal('');

  readonly boxName = signal('');
  readonly role = signal<Role>('ATHLETE');
  readonly planName = signal<string | null>(null);
  readonly invalid = signal(false);
  readonly previewLoading = signal(true);

  readonly roleLabel = computed(() => {
    switch (this.role()) {
      case 'COACH': return $localize`:@@auth.join.role.coach:Coach`;
      case 'BOX_ADMIN': return $localize`:@@auth.join.role.boxAdmin:Box admin`;
      default: return $localize`:@@auth.join.role.athlete:Athlete`;
    }
  });

  // DOM order — used to pick the first invalid field to focus.
  private readonly fieldOrder: Array<[key: 'name' | 'email' | 'password', testId: string]> = [
    ['name', 'join-name'], ['email', 'join-email'], ['password', 'join-password'],
  ];

  ngOnInit() {
    this.auth.previewInvite(this.token).subscribe({
      next: p => {
        this.boxName.set(p.boxName);
        this.role.set(p.role);
        this.planName.set(p.planName);
        this.email.set(p.email);
        this.previewLoading.set(false);
      },
      error: () => {
        this.invalid.set(true);
        this.previewLoading.set(false);
      },
    });
  }

  submit(event?: Event) {
    event?.preventDefault();
    this.nameError.set('');
    this.emailError.set('');
    this.passwordError.set('');
    this.formError.set('');
    this.pending.set(true);
    this.auth.register(this.email(), this.password(), this.name(), this.token).pipe(
      switchMap(() => this.auth.login(this.email(), this.password())),
      switchMap(() => this.auth.acceptInvite(this.token)),
      switchMap(m => this.auth.refresh().pipe(switchMap(() => this.auth.selectBox(m.boxId)), map(() => m.role))),
    ).subscribe({
      next: role => {
        this.pending.set(false);
        this.router.navigateByUrl(redirectForRole(role));
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        // Field-attributable errors (password policy / bean validation) can only originate from
        // the register stage — login/acceptInvite/selectBox never emit them — so a match here
        // always means the register call, regardless of its position in the chain.
        const fieldErrors = fieldErrorMessages(e);
        const pwMsg = passwordErrorMessage(e.error?.detail);
        if (pwMsg) fieldErrors['password'] = pwMsg;

        const first = this.fieldOrder.find(([key]) => fieldErrors[key]);
        if (first) {
          this.nameError.set(fieldErrors['name'] ?? '');
          this.emailError.set(fieldErrors['email'] ?? '');
          this.passwordError.set(fieldErrors['password'] ?? '');
          this.el.nativeElement.querySelector<HTMLElement>(`[data-testid="${first[1]}"]`)?.focus();
          return;
        }
        this.formError.set(this.formLevelError(e));
      },
    });
  }

  acceptExisting() {
    this.formError.set('');
    this.pending.set(true);
    this.auth.acceptInvite(this.token).pipe(
      switchMap(m => this.auth.refresh().pipe(switchMap(() => this.auth.selectBox(m.boxId)), map(() => m.role))),
    ).subscribe({
      next: role => {
        this.pending.set(false);
        this.router.navigateByUrl(redirectForRole(role));
      },
      error: (e: HttpErrorResponse) => {
        this.pending.set(false);
        this.formError.set(this.formLevelError(e));
      },
    });
  }

  /**
   * 409/410/403 are never field-attributable — they're about the invite or the box, not
   * anything the user typed — so they always render as a form-level alert. Keyed on status
   * alone: within this screen's two call chains, 409/410 can only come from acceptInvite() and
   * 403 only from selectBox(), so status disambiguates without also matching the backend's exact
   * detail string (which for 403 varies: BOX_SUSPENDED vs "no active membership", both meaning
   * the same thing to this screen — reusing login's own blanket 403 handling, unchanged).
   */
  private formLevelError(e: HttpErrorResponse): string {
    if (e.status === 409) {
      return $localize`:@@auth.join.error.alreadyMember:You're already a member of this box.`;
    }
    if (e.status === 410) {
      return $localize`:@@auth.join.error.expired:This invite just expired or was already used.`;
    }
    if (e.status === 403) {
      return $localize`:@@auth.join.error.boxUnavailable:This box is unavailable — contact your box for help.`;
    }
    return $localize`:@@auth.join.error.generic:Something went wrong — try again.`;
  }
}

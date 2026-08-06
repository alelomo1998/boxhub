import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, AccountSession } from '../../core/auth/auth.service';
import { passwordErrorMessage } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { SheetComponent } from '../../ui/sheet.component';
import { PillComponent } from '../../ui/pill.component';

type SessionsState = 'loading' | 'error' | 'ready';

/**
 * Account security: password, email, sessions, export, delete — one page, reached from all
 * three shells. Lives at a top-level route (not nested under athlete/coach/admin) since it
 * has to work for every role; `back()` returns wherever the caller actually came from.
 */
@Component({
  selector: 'bh-security',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, ButtonComponent, SheetComponent, PillComponent],
  template: `
    <main class="page">
      <button class="back" type="button" (click)="back()">← Back</button>
      <h1 class="t-display title">Security</h1>

      <section class="bh-section">
        <h2 class="t-h3">Password</h2>
        @if (passwordGoogleOnly()) {
          <p class="muted" data-testid="password-google-only">
            You sign in with Google. To add a password, use
            <a routerLink="/auth/forgot" data-testid="password-forgot-link">Forgot password</a>.
          </p>
        } @else {
          <form (ngSubmit)="changePassword()" data-testid="password-form">
            <label class="f"><span>CURRENT PASSWORD</span>
              <input class="bh-input" type="password" required name="currentPassword"
                     [(ngModel)]="currentPassword" data-testid="password-current" /></label>
            <label class="f"><span>NEW PASSWORD</span>
              <input class="bh-input" type="password" required minlength="10" name="newPassword"
                     placeholder="min 10 characters" [(ngModel)]="newPassword" data-testid="password-new" /></label>
            @if (passwordError()) { <p class="err" data-testid="password-error">{{ passwordError() }}</p> }
            @if (passwordSuccess()) {
              <p class="ok" data-testid="password-success">Password changed. Other devices have been signed out.</p>
            }
            <bh-button type="submit" size="sm" [disabled]="passwordPending()" data-testid="password-submit">
              {{ passwordPending() ? 'Saving…' : 'Change password' }}
            </bh-button>
          </form>
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h3">Email</h2>
        @if (emailGoogleOnly()) {
          <p class="muted" data-testid="email-google-only">
            You sign in with Google. To add a password, use
            <a routerLink="/auth/forgot" data-testid="email-forgot-link">Forgot password</a>.
          </p>
        } @else {
          <form (ngSubmit)="changeEmail()" data-testid="email-form">
            <label class="f"><span>NEW EMAIL</span>
              <input class="bh-input" type="email" required name="newEmail"
                     [(ngModel)]="newEmail" data-testid="email-new" />
              @if (emailFieldError()) { <span class="err" data-testid="email-field-error">{{ emailFieldError() }}</span> }
            </label>
            <label class="f"><span>CURRENT PASSWORD</span>
              <input class="bh-input" type="password" required name="emailPassword"
                     [(ngModel)]="emailPassword" data-testid="email-password" /></label>
            @if (emailFormError()) { <p class="err" data-testid="email-form-error">{{ emailFormError() }}</p> }
            @if (emailSentTo()) {
              <p class="ok" data-testid="email-sent">
                Check {{ emailSentTo() }} to confirm the change. Your current address stays active until you do.
              </p>
            }
            <bh-button type="submit" size="sm" [disabled]="emailPending()" data-testid="email-submit">
              {{ emailPending() ? 'Saving…' : 'Change email' }}
            </bh-button>
          </form>
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h3">Sessions</h2>
        @switch (sessionsState()) {
          @case ('loading') { <p class="stateline" data-testid="sessions-loading">Loading sessions…</p> }
          @case ('error') { <p class="stateline err" data-testid="sessions-error">Couldn't load your sessions — try again later.</p> }
          @default {
            @if (sessions().length) {
              <ul class="list" data-testid="sessions-list">
                @for (s of sessions(); track s.id) {
                  <li>
                    <span class="who">
                      <b>{{ s.device }}</b>
                      <span class="meta">{{ s.ip }} · last seen {{ s.lastSeen | date:'dd MMM yyyy, HH:mm' }}</span>
                    </span>
                    @if (s.current) { <bh-pill tone="active" label="This device" /> }
                    <bh-button variant="ghost" size="sm" [disabled]="revokingId() === s.id"
                               (click)="revokeSession(s)" [attr.data-testid]="'signout-one-' + s.id">
                      {{ revokingId() === s.id ? 'Signing out…' : (s.current ? 'Sign out this device' : 'Sign out') }}
                    </bh-button>
                  </li>
                }
              </ul>
            } @else {
              <p class="stateline" data-testid="sessions-empty">No active sessions.</p>
            }
            @if (revokeError()) { <p class="err" data-testid="revoke-error">{{ revokeError() }}</p> }
            @if (signOutError()) { <p class="err" data-testid="signout-error">{{ signOutError() }}</p> }
            <bh-button variant="ghost" size="sm" [disabled]="signOutPending()" (click)="signOutEverywhere()" data-testid="signout-all">
              {{ signOutPending() ? 'Signing out…' : 'Sign out everywhere' }}
            </bh-button>
          }
        }
      </section>

      <section class="bh-section danger">
        <h2 class="t-h3">Danger zone</h2>
        @if (exportError()) { <p class="err" data-testid="export-error">{{ exportError() }}</p> }
        <bh-button variant="ghost" size="sm" [disabled]="exportPending()" (click)="downloadExport()" data-testid="export-download">
          {{ exportPending() ? 'Preparing…' : 'Download my data' }}
        </bh-button>
        <bh-button variant="ghost" size="sm" class="deletebtn" (click)="openDelete()" data-testid="delete-open">
          Delete my account
        </bh-button>
      </section>
    </main>

    <bh-sheet [open]="deleteOpen()" title="Delete my account" label="Delete my account" (closed)="deleteOpen.set(false)">
      <div class="del">
        <p class="explain" data-testid="delete-explain">
          Your name, email, photo and login are permanently deleted. Your scores stay in your box's history,
          without your name on them.
        </p>
        @if (exportError()) { <p class="err" data-testid="delete-export-error">{{ exportError() }}</p> }
        <bh-button variant="ghost" size="sm" [disabled]="exportPending()" (click)="downloadExport()" data-testid="delete-download">
          {{ exportPending() ? 'Preparing…' : 'Download my data first' }}
        </bh-button>

        @if (deleteNeedsPassword()) {
          <label class="f"><span>PASSWORD</span>
            <input class="bh-input" type="password" name="deletePassword"
                   [(ngModel)]="deletePassword" data-testid="delete-password" /></label>
        }

        <label class="f"><span>TYPE DELETE TO CONFIRM</span>
          <input class="bh-input" type="text" name="deleteConfirm" autocomplete="off"
                 [(ngModel)]="deleteConfirmText" data-testid="delete-confirm-text" /></label>

        @if (deleteError()) { <p class="err" data-testid="delete-error">{{ deleteError() }}</p> }

        <bh-button variant="primary" [disabled]="!canDelete() || deletePending()" (click)="submitDelete()" data-testid="delete-submit">
          {{ deletePending() ? 'Deleting…' : 'Delete my account' }}
        </bh-button>
      </div>
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .page { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-8); }
    .back { align-self: flex-start; min-height: var(--tap); padding: 0 var(--sp-2); background: transparent;
      border: none; color: var(--faint); font-size: var(--fs-sm); cursor: pointer; }
    .back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .title { font-size: var(--fs-hero); margin: 0 0 var(--sp-2); }
    .bh-section { gap: var(--sp-3); }
    form { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
    .f { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .ok { color: var(--good); font-size: var(--fs-sm); margin: 0; }
    .err { color: var(--volt); font-size: var(--fs-sm); margin: 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .stateline.err { color: var(--volt); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-2) 0; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .who { display: flex; flex-direction: column; gap: 2px; }
    .who b { font-weight: 600; font-size: var(--fs-body); }
    .who .meta { color: var(--faint); font-size: var(--fs-meta); font-family: var(--font-mono); }
    .danger { padding-top: var(--sp-4); border-top: 1px solid var(--hairline); }
    .deletebtn { color: var(--volt); border-color: var(--volt); }
    .del { display: flex; flex-direction: column; gap: var(--sp-4); align-items: stretch; }
    .explain { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
  `],
})
export class SecurityPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private location = inject(Location);

  // Password
  currentPassword = '';
  newPassword = '';
  passwordPending = signal(false);
  passwordError = signal('');
  passwordGoogleOnly = signal(false);
  passwordSuccess = signal(false);

  // Email
  newEmail = '';
  emailPassword = '';
  emailPending = signal(false);
  emailFieldError = signal('');
  emailFormError = signal('');
  emailGoogleOnly = signal(false);
  emailSentTo = signal('');

  // Sessions
  sessions = signal<AccountSession[]>([]);
  sessionsState = signal<SessionsState>('loading');
  signOutPending = signal(false);
  signOutError = signal('');

  // Export
  exportPending = signal(false);
  exportError = signal('');

  // Delete — send no password first; a 422 WRONG_PASSWORD back from the server means "this
  // account has a password and it wasn't supplied (or was wrong)", so we reveal the field and
  // let the user retry. A Google-only account never sees the field because it never gets that 422.
  deleteOpen = signal(false);
  deleteConfirmText = '';
  deletePassword = '';
  deleteNeedsPassword = signal(false);
  deletePending = signal(false);
  deleteError = signal('');

  ngOnInit() {
    this.loadSessions();
  }

  back() {
    this.location.back();
  }

  // Per-row revoke ("I lost my phone"): one family, not logout-all. Keyed by the row being
  // revoked so only that row shows pending — a single boolean would disable every button.
  revokingId = signal<string | null>(null);
  revokeError = signal<string | null>(null);

  revokeSession(s: AccountSession) {
    this.revokingId.set(s.id);
    this.revokeError.set(null);
    this.auth.revokeSession(s.id).subscribe({
      next: () => {
        this.revokingId.set(null);
        // Revoking the session you are currently holding ends it — the cookie is dead, so stay
        // consistent with signOutEverywhere and land on login rather than a page that will 401.
        if (s.current) { this.auth.clear(); this.router.navigate(['/auth/login']); return; }
        this.loadSessions();
      },
      error: () => {
        this.revokingId.set(null);
        this.revokeError.set("Couldn't sign out that device — try again.");
      },
    });
  }

  loadSessions() {
    this.sessionsState.set('loading');
    this.auth.sessions().subscribe({
      next: s => { this.sessions.set(s); this.sessionsState.set('ready'); },
      error: () => this.sessionsState.set('error'),
    });
  }

  changePassword() {
    this.passwordError.set('');
    this.passwordGoogleOnly.set(false);
    this.passwordSuccess.set(false);
    this.passwordPending.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.passwordPending.set(false);
        this.passwordSuccess.set(true);
        this.currentPassword = '';
        this.newPassword = '';
      },
      error: (e: HttpErrorResponse) => {
        this.passwordPending.set(false);
        if (e.status === 409 && e.error?.detail === 'NO_PASSWORD_SET') { this.passwordGoogleOnly.set(true); return; }
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') { this.passwordError.set('Current password is wrong.'); return; }
        const msg = passwordErrorMessage(e.error?.detail);
        this.passwordError.set(msg ?? 'Something went wrong — try again.');
      },
    });
  }

  changeEmail() {
    this.emailFieldError.set('');
    this.emailFormError.set('');
    this.emailGoogleOnly.set(false);
    this.emailSentTo.set('');
    this.emailPending.set(true);
    const target = this.newEmail;
    this.auth.startEmailChange(this.emailPassword, target).subscribe({
      next: () => {
        this.emailPending.set(false);
        this.emailSentTo.set(target);
        this.newEmail = '';
        this.emailPassword = '';
      },
      error: (e: HttpErrorResponse) => {
        this.emailPending.set(false);
        if (e.status === 409 && e.error?.detail === 'EMAIL_TAKEN') { this.emailFieldError.set('That address is already in use.'); return; }
        if (e.status === 409 && e.error?.detail === 'NO_PASSWORD_SET') { this.emailGoogleOnly.set(true); return; }
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') { this.emailFormError.set('Current password is wrong.'); return; }
        this.emailFormError.set('Something went wrong — try again.');
      },
    });
  }

  signOutEverywhere() {
    this.signOutError.set('');
    this.signOutPending.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => {
        this.signOutPending.set(false);
        this.signOutError.set("Couldn't sign out other devices — try again.");
      },
    });
  }

  downloadExport() {
    this.exportError.set('');
    this.exportPending.set(true);
    this.auth.exportData().subscribe({
      next: data => {
        this.exportPending.set(false);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boxhub-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exportPending.set(false);
        this.exportError.set("Couldn't export your data — try again.");
      },
    });
  }

  openDelete() {
    this.deleteConfirmText = '';
    this.deletePassword = '';
    this.deleteNeedsPassword.set(false);
    this.deleteError.set('');
    this.deleteOpen.set(true);
  }

  canDelete(): boolean {
    return this.deleteConfirmText === 'DELETE' && (!this.deleteNeedsPassword() || this.deletePassword.length > 0);
  }

  submitDelete() {
    if (!this.canDelete() || this.deletePending()) return;
    this.deleteError.set('');
    this.deletePending.set(true);
    this.auth.deleteAccount(this.deleteNeedsPassword() ? this.deletePassword : undefined).subscribe({
      next: () => {
        this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
      },
      error: (e: HttpErrorResponse) => {
        this.deletePending.set(false);
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') {
          // Second+ attempt already had the field visible and the user typed something — tell
          // them it was wrong, not to do the thing they just did.
          this.deleteError.set(this.deleteNeedsPassword() ? 'That password is wrong.' : 'Enter your password to confirm.');
          this.deleteNeedsPassword.set(true);
          return;
        }
        if (e.status === 409 && e.error?.detail === 'LAST_ADMIN') {
          const box = this.auth.activeBox()?.boxName ?? 'your box';
          this.deleteError.set(`You're the only admin of ${box}. Make someone else an admin before deleting your account.`);
          return;
        }
        this.deleteError.set('Something went wrong — try again.');
      },
    });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, AccountSession } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { EmptyComponent } from '../../ui/empty.component';
import { PillComponent } from '../../ui/pill.component';

type SessionsState = 'loading' | 'error' | 'ready';

/**
 * Account / Sessions — third of the four sections redistributed off the old security.page.ts.
 * `device` now carries a short readable label ("Chrome on macOS" / "Unknown device"), parsed
 * server-side (DeviceLabel) — rendered here as plain text, no client-side parsing.
 */
@Component({
  selector: 'bh-account-sessions',
  standalone: true,
  imports: [DatePipe, ButtonComponent, AlertComponent, EmptyComponent, PillComponent],
  template: `
    <h1 class="t-h3" i18n="@@account.sessions.heading">Sessions</h1>

    @switch (state()) {
      @case ('loading') {
        <!-- Skeleton, not spinner text — design law v3. -->
        <div class="skel-list" data-testid="sessions-loading" aria-hidden="true">
          @for (i of skelRows; track i) {
            <div class="row">
              <span class="who">
                <span class="bh-skel skel-line skel-device"></span>
                <span class="bh-skel skel-line skel-meta"></span>
              </span>
              <span class="bh-skel skel-btn"></span>
            </div>
          }
        </div>
      }
      @case ('error') {
        <bh-alert tone="danger" data-testid="sessions-error">
          <span i18n="@@account.sessions.error">Couldn't load your sessions — try again.</span>
        </bh-alert>
        <bh-button variant="ghost" size="sm" (click)="load()" testId="sessions-retry">
          <span i18n="@@account.sessions.retry">Try again</span>
        </bh-button>
      }
      @default {
        @if (sessions().length) {
          <ul class="list" data-testid="sessions-list">
            @for (s of sessions(); track s.id) {
              <li class="row">
                <span class="who">
                  <b>{{ s.device }}</b>
                  <span class="meta">{{ s.ip }} · <span i18n="@@account.sessions.lastSeen">last seen</span> {{ s.lastSeen | date:'dd MMM yyyy, HH:mm' }}</span>
                </span>
                @if (s.current) {
                  <bh-pill tone="active" label="This device" i18n-label="@@account.sessions.currentPill" />
                }
                <!-- aria-disabled, NOT disabled/loading — those bind bh-button's native disabled
                     attribute, which would drop this exact row out of the a11y tree the instant
                     it's pressed. The real guard against a double-fire is in revoke() below. -->
                <bh-button variant="ghost" size="sm" [ariaDisabled]="revokingId() === s.id"
                           (click)="revoke(s)" [testId]="'signout-one-' + s.id">
                  @if (revokingId() === s.id) {
                    <span i18n="@@account.sessions.signOut.pending">Signing out…</span>
                  } @else if (s.current) {
                    <span i18n="@@account.sessions.signOut.thisDevice">Sign out this device</span>
                  } @else {
                    <span i18n="@@account.sessions.signOut.default">Sign out</span>
                  }
                </bh-button>
              </li>
            }
          </ul>
        } @else {
          <bh-empty title="No active sessions" i18n-title="@@account.sessions.empty.title" data-testid="sessions-empty" />
        }

        @if (rowError()) {
          <bh-alert tone="danger" data-testid="sessions-row-error">{{ rowError() }}</bh-alert>
        }
        @if (signOutError()) {
          <bh-alert tone="danger" data-testid="signout-error">{{ signOutError() }}</bh-alert>
        }

        <bh-button variant="ghost" size="sm" [loading]="signOutPending()" (click)="signOutEverywhere()" testId="signout-all">
          @if (signOutPending()) {
            <span i18n="@@account.sessions.signOutAll.pending">Signing out…</span>
          } @else {
            <span i18n="@@account.sessions.signOutAll.default">Sign out everywhere</span>
          }
        </bh-button>
      }
    }
  `,
  styles: [`
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-3) 0; border-bottom: 1px solid var(--hairline); }
    .row:last-child { border-bottom: none; }
    .who { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
    .who b { font-weight: 600; font-size: var(--fs-body); color: var(--bone); }
    .who .meta { color: var(--faint); font-size: var(--fs-meta); font-family: var(--font-mono); }

    .skel-list { display: flex; flex-direction: column; }
    .skel-line { display: block; border-radius: var(--r-xs); }
    .skel-device { width: 9rem; height: 0.9rem; margin-bottom: var(--sp-1); }
    .skel-meta { width: 13rem; height: 0.7rem; }
    .skel-btn { width: 5.5rem; height: var(--tap); border-radius: var(--edge); }
  `],
})
export class SessionsPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  sessions = signal<AccountSession[]>([]);
  state = signal<SessionsState>('loading');
  skelRows = [0, 1, 2];

  // Per-row revoke ("I lost my phone"). Keyed by the row being revoked so only that row shows
  // pending — a single boolean would disable every button in the list at once.
  revokingId = signal<string | null>(null);
  rowError = signal('');

  signOutPending = signal(false);
  signOutError = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.state.set('loading');
    this.auth.sessions().subscribe({
      next: s => { this.sessions.set(s); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  revoke(s: AccountSession) {
    if (this.revokingId() === s.id) return;
    this.revokingId.set(s.id);
    this.rowError.set('');
    this.auth.revokeSession(s.id).subscribe({
      next: () => {
        this.revokingId.set(null);
        // Revoking the session you're currently holding ends it — the cookie is dead, so stay
        // consistent with signOutEverywhere and land on login rather than a page that will 401.
        if (s.current) { this.auth.clear(); this.router.navigate(['/auth/login']); return; }
        this.load();
      },
      error: () => {
        this.revokingId.set(null);
        this.rowError.set($localize`:@@account.sessions.rowError:Couldn't sign out that device — try again.`);
      },
    });
  }

  signOutEverywhere() {
    if (this.signOutPending()) return;
    this.signOutError.set('');
    this.signOutPending.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => {
        this.signOutPending.set(false);
        this.signOutError.set($localize`:@@account.sessions.signOutAllError:Couldn't sign out other devices — try again.`);
      },
    });
  }
}

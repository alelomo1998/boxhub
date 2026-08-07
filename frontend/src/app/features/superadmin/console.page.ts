import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';
import { DataTableComponent } from '../../ui/data-table.component';

type FetchState = 'loading' | 'error' | 'ready';

interface BoxRow {
  id: string; name: string; slug: string; status: string; createdAt: string; ownerEmail: string;
}
interface WaitlistRow { email: string; boxName: string; createdAt: string; }
interface Settings { signupMode: string; maxBoxes: number; }
interface AuditRow {
  id: string; actorEmail: string; action: string; boxId: string | null; detail: string | null; createdAt: string;
}

@Component({
  selector: 'bh-superadmin-console',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent, PillComponent, DataTableComponent],
  template: `
    <main class="page">
      <header class="head">
        <h1 class="t-display title">Superadmin</h1>
        <bh-button variant="ghost" size="sm" (click)="logout()" data-testid="console-logout">Log out</bh-button>
      </header>

      <section class="bh-section">
        <h2 class="t-h2">Pending queue</h2>
        @switch (queueState()) {
          @case ('loading') { <p class="stateline" data-testid="queue-loading">Loading…</p> }
          @case ('error') { <p class="stateline err" data-testid="queue-error">Couldn't load the pending queue — try again.</p> }
          @default {
            @if (pendingBoxes().length) {
              <bh-data-table testId="queue-table">
                <thead><tr><th>Name</th><th>Slug</th><th>Owner</th><th>Created</th><th></th></tr></thead>
                <tbody>
                  @for (b of pendingBoxes(); track b.id) {
                    <tr [attr.data-testid]="'queue-row-' + b.id">
                      <td class="mname">{{ b.name }}</td>
                      <td>{{ b.slug }}</td>
                      <td>{{ b.ownerEmail }}</td>
                      <td class="num">{{ b.createdAt | date:'dd MMM yyyy' }}</td>
                      <td class="actions">
                        <bh-button variant="ghost" size="sm" [disabled]="queueActionId() === b.id"
                                   (click)="approve(b)" [attr.data-testid]="'queue-approve-' + b.id">Approve</bh-button>
                        <bh-button variant="ghost" size="sm" [disabled]="queueActionId() === b.id"
                                   (click)="reject(b)" [attr.data-testid]="'queue-reject-' + b.id">Reject</bh-button>
                        @if (queueErrors()[b.id]) {
                          <p class="err" [attr.data-testid]="'queue-row-error-' + b.id">{{ queueErrors()[b.id] }}</p>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </bh-data-table>
            } @else {
              <p class="stateline" data-testid="queue-empty">No boxes waiting.</p>
            }
          }
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h2">All boxes</h2>
        @switch (boxesState()) {
          @case ('loading') { <p class="stateline" data-testid="boxes-loading">Loading…</p> }
          @case ('error') { <p class="stateline err" data-testid="boxes-error">Couldn't load boxes — try again.</p> }
          @default {
            @if (allBoxes().length) {
              <bh-data-table testId="boxes-table">
                <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Owner</th><th>Created</th><th></th></tr></thead>
                <tbody>
                  @for (b of allBoxes(); track b.id) {
                    <tr [attr.data-testid]="'box-row-' + b.id">
                      <td class="mname">{{ b.name }}</td>
                      <td>{{ b.slug }}</td>
                      <td><bh-pill [tone]="b.status === 'ACTIVE' ? 'active' : 'suspended'" [label]="b.status" /></td>
                      <td>{{ b.ownerEmail }}</td>
                      <td class="num">{{ b.createdAt | date:'dd MMM yyyy' }}</td>
                      <td class="actions">
                        @if (b.status === 'ACTIVE') {
                          <bh-button variant="ghost" size="sm" [disabled]="boxesActionId() === b.id"
                                     (click)="suspend(b)" [attr.data-testid]="'box-suspend-' + b.id">Suspend</bh-button>
                        }
                        @if (b.status === 'SUSPENDED') {
                          <bh-button variant="ghost" size="sm" [disabled]="boxesActionId() === b.id"
                                     (click)="reactivate(b)" [attr.data-testid]="'box-reactivate-' + b.id">Reactivate</bh-button>
                        }
                        @if (boxesErrors()[b.id]) {
                          <p class="err" [attr.data-testid]="'box-row-error-' + b.id">{{ boxesErrors()[b.id] }}</p>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </bh-data-table>
            } @else {
              <p class="stateline" data-testid="boxes-empty">No boxes yet.</p>
            }
          }
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h2">Waitlist</h2>
        @switch (waitlistState()) {
          @case ('loading') { <p class="stateline" data-testid="waitlist-loading">Loading…</p> }
          @case ('error') { <p class="stateline err" data-testid="waitlist-error">Couldn't load the waitlist — try again.</p> }
          @default {
            @if (waitlist().length) {
              <ul class="list" data-testid="waitlist-list">
                @for (w of waitlist(); track w.email) {
                  <li>
                    <span class="who"><b>{{ w.boxName }}</b> <span class="meta">{{ w.email }} · {{ w.createdAt | date:'dd MMM yyyy' }}</span></span>
                  </li>
                }
              </ul>
            } @else {
              <p class="stateline" data-testid="waitlist-empty">No one on the waitlist.</p>
            }
          }
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h2">Settings</h2>
        @switch (settingsState()) {
          @case ('loading') { <p class="stateline" data-testid="settings-loading">Loading…</p> }
          @case ('error') { <p class="stateline err" data-testid="settings-error">Couldn't load settings — try again.</p> }
          @default {
            <form (ngSubmit)="saveSettings()" data-testid="settings-form">
              <label class="f"><span>SIGNUP MODE</span>
                <select class="bh-select" name="signupMode" [(ngModel)]="signupMode" data-testid="settings-signup-mode">
                  <option value="OPEN">OPEN</option>
                  <option value="APPROVAL">APPROVAL</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
              <label class="f"><span>MAX BOXES</span>
                <input class="bh-input" type="number" name="maxBoxes" min="0" [(ngModel)]="maxBoxes" data-testid="settings-max-boxes" /></label>
              @if (settingsError()) { <p class="err" data-testid="settings-form-error">{{ settingsError() }}</p> }
              <bh-button type="submit" size="sm" [disabled]="settingsPending()" data-testid="settings-save">
                {{ settingsPending() ? 'Saving…' : 'Save' }}
              </bh-button>
            </form>
          }
        }
      </section>

      <section class="bh-section">
        <h2 class="t-h2">Audit log</h2>
        @switch (auditState()) {
          @case ('loading') { <p class="stateline" data-testid="audit-loading">Loading…</p> }
          @case ('error') { <p class="stateline err" data-testid="audit-error">Couldn't load the audit log — try again.</p> }
          @default {
            @if (auditRows().length) {
              <bh-data-table testId="audit-table">
                <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Box</th><th>Detail</th></tr></thead>
                <tbody>
                  @for (a of auditRows(); track a.id) {
                    <tr [attr.data-testid]="'audit-row-' + a.id">
                      <td class="num">{{ a.createdAt | date:'dd MMM yyyy, HH:mm' }}</td>
                      <td>{{ a.actorEmail }}</td>
                      <td><bh-pill tone="active" [label]="a.action" /></td>
                      <td>{{ a.boxId || '—' }}</td>
                      <td>{{ a.detail || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </bh-data-table>
            } @else {
              <p class="stateline" data-testid="audit-empty">No superadmin actions recorded yet.</p>
            }
          }
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-8); padding: var(--sp-6); }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: var(--fs-hero); margin: 0; }
    .stateline { color: var(--bone-dim); margin: 0; }
    .stateline.err { color: var(--danger); }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: var(--sp-1) 0 0; }
    .actions { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .who b { font-weight: 600; }
    .who .meta { color: var(--faint); font-size: var(--fs-meta); font-family: var(--font-mono); margin-left: 8px; }
    .f { display: flex; flex-direction: column; gap: 6px; max-width: 260px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    form { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
  `],
})
export class ConsolePage implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);

  // Pending queue
  pendingBoxes = signal<BoxRow[]>([]);
  queueState = signal<FetchState>('loading');
  queueActionId = signal<string | null>(null);
  queueErrors = signal<Record<string, string>>({});

  // All boxes
  allBoxes = signal<BoxRow[]>([]);
  boxesState = signal<FetchState>('loading');
  boxesActionId = signal<string | null>(null);
  boxesErrors = signal<Record<string, string>>({});

  // Waitlist
  waitlist = signal<WaitlistRow[]>([]);
  waitlistState = signal<FetchState>('loading');

  // Settings
  signupMode = 'OPEN';
  maxBoxes = 0;
  settingsState = signal<FetchState>('loading');
  settingsPending = signal(false);
  settingsError = signal('');

  // Audit log
  auditRows = signal<AuditRow[]>([]);
  auditState = signal<FetchState>('loading');

  ngOnInit() {
    this.loadQueue();
    this.loadBoxes();
    this.loadWaitlist();
    this.loadSettings();
    this.loadAudit();
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
  }

  loadQueue() {
    this.queueState.set('loading');
    this.http.get<BoxRow[]>('/api/admin/boxes', { params: new HttpParams().set('status', 'PENDING') }).subscribe({
      next: rows => { this.pendingBoxes.set(rows); this.queueState.set('ready'); },
      error: () => this.queueState.set('error'),
    });
  }

  loadBoxes() {
    this.boxesState.set('loading');
    this.http.get<BoxRow[]>('/api/admin/boxes').subscribe({
      next: rows => { this.allBoxes.set(rows); this.boxesState.set('ready'); },
      error: () => this.boxesState.set('error'),
    });
  }

  loadWaitlist() {
    this.waitlistState.set('loading');
    this.http.get<WaitlistRow[]>('/api/admin/waitlist').subscribe({
      next: rows => { this.waitlist.set(rows); this.waitlistState.set('ready'); },
      error: () => this.waitlistState.set('error'),
    });
  }

  loadSettings() {
    this.settingsState.set('loading');
    this.http.get<Settings>('/api/admin/settings').subscribe({
      next: s => {
        this.signupMode = s.signupMode;
        this.maxBoxes = s.maxBoxes;
        this.settingsState.set('ready');
      },
      error: () => this.settingsState.set('error'),
    });
  }

  loadAudit() {
    this.auditState.set('loading');
    this.http.get<AuditRow[]>('/api/admin/audit').subscribe({
      next: rows => { this.auditRows.set(rows); this.auditState.set('ready'); },
      error: () => this.auditState.set('error'),
    });
  }

  approve(b: BoxRow) {
    this.queueErrors.update(e => ({ ...e, [b.id]: '' }));
    this.queueActionId.set(b.id);
    this.http.post<BoxRow>(`/api/admin/boxes/${b.id}/approve`, {}).subscribe({
      next: () => {
        this.queueActionId.set(null);
        this.pendingBoxes.update(rows => rows.filter(r => r.id !== b.id));
        this.loadBoxes();
        this.loadAudit();
      },
      error: (e: HttpErrorResponse) => {
        this.queueActionId.set(null);
        this.queueErrors.update(errs => ({ ...errs, [b.id]: this.queueErrorMessage(e) }));
      },
    });
  }

  reject(b: BoxRow) {
    this.queueErrors.update(e => ({ ...e, [b.id]: '' }));
    this.queueActionId.set(b.id);
    this.http.post<BoxRow>(`/api/admin/boxes/${b.id}/reject`, {}).subscribe({
      next: () => {
        this.queueActionId.set(null);
        this.pendingBoxes.update(rows => rows.filter(r => r.id !== b.id));
        this.loadBoxes();
        this.loadAudit();
      },
      error: (e: HttpErrorResponse) => {
        this.queueActionId.set(null);
        this.queueErrors.update(errs => ({ ...errs, [b.id]: this.queueErrorMessage(e) }));
      },
    });
  }

  suspend(b: BoxRow) {
    this.boxesErrors.update(e => ({ ...e, [b.id]: '' }));
    this.boxesActionId.set(b.id);
    this.http.post<BoxRow>(`/api/admin/boxes/${b.id}/suspend`, {}).subscribe({
      next: () => { this.boxesActionId.set(null); this.loadBoxes(); this.loadAudit(); },
      error: () => {
        this.boxesActionId.set(null);
        this.boxesErrors.update(errs => ({ ...errs, [b.id]: 'Something went wrong — try again.' }));
      },
    });
  }

  reactivate(b: BoxRow) {
    this.boxesErrors.update(e => ({ ...e, [b.id]: '' }));
    this.boxesActionId.set(b.id);
    this.http.post<BoxRow>(`/api/admin/boxes/${b.id}/reactivate`, {}).subscribe({
      next: () => { this.boxesActionId.set(null); this.loadBoxes(); this.loadAudit(); },
      error: () => {
        this.boxesActionId.set(null);
        this.boxesErrors.update(errs => ({ ...errs, [b.id]: 'Something went wrong — try again.' }));
      },
    });
  }

  saveSettings() {
    this.settingsError.set('');
    this.settingsPending.set(true);
    this.http.patch<Settings>('/api/admin/settings', { signupMode: this.signupMode, maxBoxes: this.maxBoxes }).subscribe({
      next: () => {
        this.settingsPending.set(false);
        this.loadSettings();
        this.loadAudit();
      },
      error: (e: HttpErrorResponse) => {
        this.settingsPending.set(false);
        const detail = e.error?.detail;
        this.settingsError.set(
          detail === 'BAD_SIGNUP_MODE' ? 'Invalid signup mode.'
          : detail === 'BAD_MAX_BOXES' ? 'Max boxes must be zero or more.'
          : 'Something went wrong — try again.');
      },
    });
  }

  private queueErrorMessage(e: HttpErrorResponse): string {
    if (e.status === 409 && e.error?.detail === 'CAP_REACHED') return 'Cap reached — raise max boxes or reject something.';
    return 'Something went wrong — try again.';
  }
}

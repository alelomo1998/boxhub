import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button.component';
import { FieldComponent } from '../../ui/field.component';
import { AlertComponent } from '../../ui/alert.component';
import { SheetComponent } from '../../ui/sheet.component';
import { BRAND_NAME } from '../../core/brand';

/**
 * Account / Danger zone — last of the four sections redistributed off the old security.page.ts.
 * Export sits above delete on purpose: "download my data first" only reads as the natural next
 * step if it's seen before delete (spec §6.4).
 */
@Component({
  selector: 'bh-account-danger',
  standalone: true,
  imports: [ButtonComponent, FieldComponent, AlertComponent, SheetComponent],
  template: `
    <h1 class="t-h3" i18n="@@account.danger.heading">Danger zone</h1>

    <section class="export">
      <h2 class="t-h3" i18n="@@account.danger.export.heading">Export your data</h2>
      <p class="muted" i18n="@@account.danger.export.intro">Download a copy of everything tied to your account.</p>
      @if (exportError()) {
        <bh-alert tone="danger" data-testid="export-error">{{ exportError() }}</bh-alert>
      }
      <bh-button variant="ghost" size="sm" [loading]="exportPending()" (click)="downloadExport()" testId="export-download">
        @if (exportPending()) {
          <span i18n="@@account.danger.export.pending">Preparing…</span>
        } @else {
          <span i18n="@@account.danger.export.default">Download my data</span>
        }
      </bh-button>
    </section>

    <section class="delete">
      <h2 class="t-h3" i18n="@@account.danger.delete.heading">Delete my account</h2>
      <bh-button variant="ghost" size="sm" [dangerBorder]="true" (click)="openDelete()" testId="delete-open">
        <span i18n="@@account.danger.delete.open">Delete my account</span>
      </bh-button>
    </section>

    <bh-sheet [open]="deleteOpen()" title="Delete my account" i18n-title="@@account.danger.delete.open"
              label="Delete my account" i18n-label="@@account.danger.delete.open" (closed)="deleteOpen.set(false)">
      <div class="del">
        <p class="explain" i18n="@@account.danger.delete.explain" data-testid="delete-explain">
          Your name, email, photo and login are permanently deleted. Your scores stay in your box's history,
          without your name on them.
        </p>
        @if (exportError()) {
          <bh-alert tone="danger" data-testid="delete-export-error">{{ exportError() }}</bh-alert>
        }
        <bh-button variant="ghost" size="sm" [loading]="exportPending()" (click)="downloadExport()" testId="delete-download">
          @if (exportPending()) {
            <span i18n="@@account.danger.export.pending">Preparing…</span>
          } @else {
            <span i18n="@@account.danger.delete.downloadFirst">Download my data first</span>
          }
        </bh-button>

        @if (deleteNeedsPassword()) {
          <bh-field label="PASSWORD" i18n-label="@@account.danger.delete.password.label" type="password"
                     name="deletePassword" autocomplete="current-password"
                     [(value)]="deletePassword" testId="delete-password" />
        }

        <bh-field label="TYPE DELETE TO CONFIRM" i18n-label="@@account.danger.delete.confirm.label" type="text"
                   name="deleteConfirm" autocomplete="off"
                   [(value)]="deleteConfirmText" testId="delete-confirm-text" />

        @if (deleteError()) {
          <bh-alert tone="danger" data-testid="delete-error">{{ deleteError() }}</bh-alert>
        }

        <bh-button variant="danger" [disabled]="!canDelete() || deletePending()" [loading]="deletePending()"
                   (click)="submitDelete()" testId="delete-submit">
          @if (deletePending()) {
            <span i18n="@@account.danger.delete.submit.pending">Deleting…</span>
          } @else {
            <span i18n="@@account.danger.delete.submit.default">Delete my account</span>
          }
        </bh-button>
      </div>
    </bh-sheet>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--sp-8); }
    .export, .delete { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    .del { display: flex; flex-direction: column; gap: var(--sp-4); align-items: stretch; }
    .explain { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
  `],
})
export class DangerPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  // Export
  exportPending = signal(false);
  exportError = signal('');

  // Delete — send no password first; a 422 WRONG_PASSWORD back from the server means "this
  // account has a password and it wasn't supplied (or was wrong)", so we reveal the field and
  // let the user retry. A Google-only account never sees the field because it never gets that
  // 422 — anonymize() skips the password check entirely when passwordHash is null. Do not "fix"
  // this by sending the password eagerly on the first attempt.
  deleteOpen = signal(false);
  deleteConfirmText = signal('');
  deletePassword = signal('');
  deleteNeedsPassword = signal(false);
  deletePending = signal(false);
  deleteError = signal('');

  downloadExport() {
    if (this.exportPending()) return;
    this.exportError.set('');
    this.exportPending.set(true);
    this.auth.exportData().subscribe({
      next: data => {
        this.exportPending.set(false);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${BRAND_NAME.toLowerCase()}-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exportPending.set(false);
        this.exportError.set($localize`:@@account.danger.export.error:Couldn't export your data — try again.`);
      },
    });
  }

  openDelete() {
    this.deleteConfirmText.set('');
    this.deletePassword.set('');
    this.deleteNeedsPassword.set(false);
    this.deleteError.set('');
    this.deleteOpen.set(true);
  }

  canDelete(): boolean {
    return this.deleteConfirmText() === 'DELETE' && (!this.deleteNeedsPassword() || this.deletePassword().length > 0);
  }

  submitDelete() {
    if (!this.canDelete() || this.deletePending()) return;
    this.deleteError.set('');
    this.deletePending.set(true);
    this.auth.deleteAccount(this.deleteNeedsPassword() ? this.deletePassword() : undefined).subscribe({
      next: () => {
        this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
      },
      error: (e: HttpErrorResponse) => {
        this.deletePending.set(false);
        if (e.status === 422 && e.error?.detail === 'WRONG_PASSWORD') {
          // Second+ attempt already had the field visible and the user typed something — tell
          // them it was wrong, not to do the thing they just did.
          this.deleteError.set(this.deleteNeedsPassword()
            ? $localize`:@@account.danger.delete.password.wrong:That password is wrong.`
            : $localize`:@@account.danger.delete.password.reveal:Enter your password to confirm.`);
          this.deleteNeedsPassword.set(true);
          return;
        }
        if (e.status === 409 && e.error?.detail === 'LAST_ADMIN') {
          const box = this.auth.activeBox()?.boxName
            ?? $localize`:@@account.danger.delete.lastAdmin.boxFallback:your box`;
          this.deleteError.set($localize`:@@account.danger.delete.lastAdmin:You're the only admin of ${box}:box:. Make someone else an admin before deleting your account.`);
          return;
        }
        this.deleteError.set($localize`:@@account.danger.delete.error.generic:Something went wrong — try again.`);
      },
    });
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-admin-settings',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="bh-section form">
      <h2 class="t-h2">Settings</h2>
      <form (ngSubmit)="save()">
        <label class="f"><span>NAME</span><input class="bh-input" name="name" [(ngModel)]="name" data-testid="settings-name" /></label>
        <label class="f"><span>TIMEZONE</span><input class="bh-input" name="timezone" [(ngModel)]="timezone" /></label>
        <label class="f"><span>LOGO URL</span><input class="bh-input" name="logoUrl" [(ngModel)]="logoUrl" placeholder="https://…" /></label>
        <div class="actions">
          <bh-button type="submit" data-testid="settings-save">Save</bh-button>
          @if (saved()) { <span class="ok" data-testid="settings-saved">Saved ✓</span> }
        </div>
      </form>
    </section>
  `,
  styles: [`
    .form form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .actions { display: flex; align-items: center; gap: var(--sp-3); }
    .ok { color: var(--good); font-size: 13px; font-weight: 600; }
  `],
})
export class SettingsPage implements OnInit {
  private admin = inject(AdminService);
  name = '';
  timezone = '';
  logoUrl = '';
  readonly saved = signal(false);

  ngOnInit() {
    this.admin.getSettings().subscribe(s => {
      this.name = s.name;
      this.timezone = s.timezone;
      this.logoUrl = s.logoUrl ?? '';
    });
  }

  save() {
    this.saved.set(false);
    this.admin.patchSettings({ name: this.name, timezone: this.timezone, logoUrl: this.logoUrl })
      .subscribe(() => this.saved.set(true));
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from './admin.service';

@Component({
  selector: 'bh-admin-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>Settings</h2>
      <form (ngSubmit)="save()">
        <label>Name <input name="name" [(ngModel)]="name" data-testid="settings-name" /></label>
        <label>Timezone <input name="timezone" [(ngModel)]="timezone" /></label>
        <label>Logo URL <input name="logoUrl" [(ngModel)]="logoUrl" placeholder="https://…" /></label>
        <button type="submit" data-testid="settings-save">Save</button>
        @if (saved()) { <span data-testid="settings-saved">Saved ✓</span> }
      </form>
    </section>
  `,
})
export class SettingsPage {
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

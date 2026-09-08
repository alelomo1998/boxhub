import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';

@Component({
  selector: 'bh-admin-settings',
  standalone: true,
  imports: [FormsModule, ButtonComponent, SegmentedComponent],
  template: `
    <section class="bh-section form">
      <h2 class="t-h2">Settings</h2>
      <form (ngSubmit)="save()">
        <label class="f"><span i18n="@@admin.settings.name">NAME</span><input class="bh-input" name="name" [(ngModel)]="name" data-testid="settings-name" /></label>
        <label class="f"><span i18n="@@admin.settings.timezone">TIMEZONE</span><input class="bh-input" name="timezone" [(ngModel)]="timezone" /></label>
        <label class="f"><span i18n="@@admin.settings.logoUrl">LOGO URL</span><input class="bh-input" name="logoUrl" [(ngModel)]="logoUrl" placeholder="https://…" /></label>
        <div class="f">
          <span i18n="@@admin.settings.weightUnit">WEIGHT UNIT</span>
          <bh-segmented [options]="weightUnitOptions" [(value)]="weightUnit" tone="bone"
                        label="Weight unit" />
        </div>
        <div class="actions">
          <bh-button type="submit" data-testid="settings-save">Save</bh-button>
          @if (saved()) { <span class="ok" data-testid="settings-saved" i18n="@@admin.settings.saved">Saved ✓</span> }
        </div>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .form form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .actions { display: flex; align-items: center; gap: var(--sp-3); }
    .ok { color: var(--good); font-size: var(--fs-sm); font-weight: 600; }
  `],
})
export class SettingsPage implements OnInit {
  private admin = inject(AdminService);
  name = '';
  timezone = '';
  logoUrl = '';
  weightUnit = 'KG';
  readonly weightUnitOptions: SegOption[] = [
    { value: 'KG', label: 'KG' },
    { value: 'LB', label: 'LB' },
  ];
  readonly saved = signal(false);

  ngOnInit() {
    this.admin.getSettings().subscribe(s => {
      this.name = s.name;
      this.timezone = s.timezone;
      this.logoUrl = s.logoUrl ?? '';
      this.weightUnit = s.weightUnit;
    });
  }

  save() {
    this.saved.set(false);
    this.admin.patchSettings({ name: this.name, timezone: this.timezone, logoUrl: this.logoUrl,
      weightUnit: this.weightUnit as 'KG' | 'LB' })
      .subscribe(() => this.saved.set(true));
  }
}

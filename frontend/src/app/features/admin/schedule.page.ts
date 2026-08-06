import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { BookingService, ClassTemplate, SessionView } from '../booking/booking.service';
import { ButtonComponent } from '../../ui/button.component';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

@Component({
  selector: 'bh-admin-schedule',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Schedule</h2>

      <h3 class="t-h3">Weekly templates</h3>
      <form class="row" (ngSubmit)="create()">
        <input class="bh-input" name="name" required placeholder="Class name" [(ngModel)]="name" data-testid="template-name" />
        <select class="bh-select" name="weekday" [(ngModel)]="weekday" data-testid="template-weekday">
          @for (d of days; track d; let i = $index) { <option [ngValue]="i">{{ d }}</option> }
        </select>
        <input class="bh-input tm" name="startTime" type="time" [(ngModel)]="startTime" />
        <input class="bh-input dur" name="durationMin" type="number" min="1" [(ngModel)]="durationMin" />
        <input class="bh-input dur" name="capacity" type="number" min="1" [(ngModel)]="capacity" placeholder="cap" />
        <bh-button type="submit" size="sm" data-testid="template-create">Add</bh-button>
      </form>
      @if (error()) { <p class="err">{{ error() }}</p> }
      <ul class="list">
        @for (t of templates(); track t.id) {
          <li>
            <span class="who"><b class="nm">{{ days[t.weekday] }} {{ t.startTime }}</b>
              <span class="meta">{{ t.name }} · {{ t.durationMin }}min · cap {{ t.capacity }}</span></span>
            @if (t.active) {
              <bh-button variant="ghost" size="sm" (click)="deactivate(t)" [attr.data-testid]="'template-off-' + t.id">Deactivate</bh-button>
            } @else { <span class="off">inactive</span> }
          </li>
        } @empty { <li class="muted">No templates yet.</li> }
      </ul>

      <h3 class="t-h3 sub">Next two weeks</h3>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>When</th><th>Class</th><th>Booked</th><th></th></tr></thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr [attr.data-testid]="'session-' + s.id">
                <td class="num">{{ s.startAt | date:'EEE d MMM · HH:mm' }}</td>
                <td><span class="mname">{{ s.name }}</span>@if (s.status === 'CANCELLED') { <span class="cx">cancelled</span> }</td>
                <td class="num">{{ s.bookedCount }} / {{ s.capacity }}</td>
                <td>@if (s.status !== 'CANCELLED') {
                  <bh-button variant="ghost" size="sm" (click)="cancelSession(s)" [attr.data-testid]="'session-cancel-' + s.id">Cancel</bh-button>
                }</td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">No sessions generated yet.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
    .tm { max-width: 120px; } .dur { max-width: 90px; }
    .err { color: var(--volt); font-size: 13px; margin: 0; }
    .sub { margin-top: var(--sp-6); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 11px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .nm { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 16px; }
    .meta { color: var(--faint); font-size: 13px; margin-left: 10px; }
    .off { font-family: var(--font-mono); font-size: 11px; color: var(--faint); }
    .cx { font-family: var(--font-mono); font-size: 11px; color: var(--volt); margin-left: 8px; }
    .muted { color: var(--bone-dim); padding: var(--sp-3); }
  `],
})
export class SchedulePage implements OnInit {
  private booking = inject(BookingService);
  days = DAYS;
  name = ''; weekday = 0; startTime = '06:00'; durationMin = 60; capacity = 12;
  readonly templates = signal<ClassTemplate[]>([]);
  readonly sessions = signal<SessionView[]>([]);
  readonly error = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.booking.listTemplates().subscribe(t => this.templates.set(t));
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 864e5).toISOString();
    this.booking.listSessions(from, to).subscribe(s => this.sessions.set(s));
  }

  create() {
    if (!this.name) return;
    this.error.set('');
    this.booking.createTemplate({
      name: this.name, weekday: this.weekday, startTime: this.startTime,
      durationMin: this.durationMin, capacity: this.capacity,
    }).subscribe({
      next: () => { this.name = ''; this.load(); },
      error: e => this.error.set(e.error?.detail ?? 'Could not create template'),
    });
  }

  deactivate(t: ClassTemplate) { this.booking.patchTemplate(t.id, { active: false }).subscribe(() => this.load()); }
  cancelSession(s: SessionView) { this.booking.patchSession(s.id, { status: 'CANCELLED' }).subscribe(() => this.load()); }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, Plan } from './admin.service';

@Component({
  selector: 'bh-admin-plans',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>Plans</h2>
      <form (ngSubmit)="create()">
        <input name="name" required placeholder="Plan name" [(ngModel)]="name" data-testid="plan-name" />
        <input name="durationDays" type="number" min="1" [(ngModel)]="durationDays" data-testid="plan-duration" />
        <input name="weeklyClassLimit" type="number" min="1" placeholder="Weekly limit (optional)"
               [(ngModel)]="weeklyClassLimit" />
        <button type="submit" data-testid="plan-create">Add plan</button>
      </form>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <ul>
        @for (p of plans(); track p.id) {
          <li>
            {{ p.name }} — {{ p.durationDays }} days
            @if (p.weeklyClassLimit) { — {{ p.weeklyClassLimit }}/week }
            <button (click)="archive(p)" [attr.data-testid]="'plan-archive-' + p.name">Archive</button>
          </li>
        } @empty { <li>No plans yet.</li> }
      </ul>
    </section>
  `,
})
export class PlansPage {
  private admin = inject(AdminService);
  name = '';
  durationDays = 30;
  weeklyClassLimit: number | null = null;
  readonly plans = signal<Plan[]>([]);
  readonly error = signal('');

  ngOnInit() { this.load(); }
  load() { this.admin.listPlans().subscribe(p => this.plans.set(p)); }

  create() {
    if (!this.name) return;
    this.error.set('');
    this.admin.createPlan({
      name: this.name, durationDays: this.durationDays,
      weeklyClassLimit: this.weeklyClassLimit ?? undefined,
    }).subscribe({
      next: () => { this.name = ''; this.load(); },
      error: e => this.error.set(e.error?.detail ?? 'Could not create plan'),
    });
  }

  archive(p: Plan) {
    this.admin.patchPlan(p.id, { archived: true }).subscribe(() => this.load());
  }
}

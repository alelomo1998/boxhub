import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, Plan } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-admin-plans',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Plans</h2>
      <form class="row" (ngSubmit)="create()">
        <input class="bh-input" name="name" required placeholder="Plan name" [(ngModel)]="name" data-testid="plan-name" />
        <input class="bh-input dur" name="durationDays" type="number" min="1" [(ngModel)]="durationDays" data-testid="plan-duration" />
        <input class="bh-input" name="weeklyClassLimit" type="number" min="1" placeholder="Weekly limit (optional)"
               [(ngModel)]="weeklyClassLimit" />
        <bh-button type="submit" size="sm" data-testid="plan-create">Add plan</bh-button>
      </form>
      @if (error()) { <p class="err">{{ error() }}</p> }
      <ul class="list">
        @for (p of plans(); track p.id) {
          <li>
            <span class="who"><b class="pn">{{ p.name }}</b>
              <span class="meta num">{{ p.durationDays }} days@if (p.weeklyClassLimit) { · {{ p.weeklyClassLimit }}/week }</span></span>
            <bh-button variant="ghost" size="sm" (click)="archive(p)" [attr.data-testid]="'plan-archive-' + p.name">Archive</bh-button>
          </li>
        } @empty { <li class="empty">No plans yet.</li> }
      </ul>
    </section>
  `,
  styles: [`
    .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
    .dur { max-width: 100px; }
    .err { color: var(--red); font-size: 13px; margin: 0; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .pn { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 17px; }
    .meta { color: var(--faint); font-size: 13px; margin-left: 10px; }
    .empty { color: var(--bone-dim); font-size: 14px; }
  `],
})
export class PlansPage implements OnInit {
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

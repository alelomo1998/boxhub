import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { AdminService, Entitlement, Plan } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-admin-plans',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Plans</h2>
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading plans…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load plans.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          <form class="row" (ngSubmit)="create()">
            <input class="bh-input" name="name" required placeholder="Plan name" [(ngModel)]="name" data-testid="plan-name" />
            <input class="bh-input dur" name="durationDays" type="number" min="1" [(ngModel)]="durationDays" data-testid="plan-duration" />
            <input class="bh-input price" name="price" type="number" min="0" step="0.01" placeholder="Price"
                   [(ngModel)]="priceInput" data-testid="plan-price" />
            <select class="bh-select" name="entitlement" [(ngModel)]="entitlement" data-testid="plan-entitlement">
              <option value="UNLIMITED">Unlimited</option>
              <option value="WEEKLY_LIMIT">Weekly limit</option>
            </select>
            <input class="bh-input dur" name="weeklyClassLimit" type="number" min="1" placeholder="Weekly limit"
                   [(ngModel)]="weeklyClassLimit" [disabled]="entitlement === 'UNLIMITED'" />
            <bh-button type="submit" size="sm" data-testid="plan-create">Add plan</bh-button>
          </form>
          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          <ul class="list">
            @for (p of plans(); track p.id) {
              <li>
                <span class="who"><b class="pn">{{ p.name }}</b>
                  <span class="meta num">{{ p.priceCents / 100 | currency: p.currency.toUpperCase() }}
                    · {{ p.durationDays }} days
                    · {{ p.entitlement === 'UNLIMITED' ? 'Unlimited' : (p.weeklyClassLimit + '/week') }}</span></span>
                <bh-button variant="ghost" size="sm" (click)="archive(p)" [attr.data-testid]="'plan-archive-' + p.name">Archive</bh-button>
              </li>
            } @empty { <li class="empty">No plans yet.</li> }
          </ul>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
    .dur { max-width: 100px; }
    .price { max-width: 100px; }
    .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .pn { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 17px; }
    .meta { color: var(--faint); font-size: var(--fs-sm); margin-left: 10px; }
    .empty { color: var(--bone-dim); font-size: 14px; }
  `],
})
export class PlansPage implements OnInit {
  private admin = inject(AdminService);
  name = '';
  durationDays = 30;
  priceInput: number | null = null;
  entitlement: Entitlement = 'UNLIMITED';
  weeklyClassLimit: number | null = null;
  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly plans = signal<Plan[]>([]);
  readonly error = signal('');

  ngOnInit() { this.load(); }
  load() {
    this.state.set('loading');
    this.admin.listPlans().subscribe({
      next: p => { this.plans.set(p); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  create() {
    if (!this.name) return;
    this.error.set('');
    this.admin.createPlan({
      name: this.name, durationDays: this.durationDays,
      weeklyClassLimit: this.entitlement === 'WEEKLY_LIMIT' ? (this.weeklyClassLimit ?? undefined) : undefined,
      priceCents: this.priceInput != null ? Math.round(this.priceInput * 100) : undefined,
      // No currency on the wire: a plan uses the BOX's currency, which the server supplies and now
      // rejects a mismatch against (M39 / M-5). This select used to offer EUR/USD/GBP freely, so a
      // single box could hold plans in three currencies and a revenue SUM would add cents of euros
      // to cents of dollars. The plan list below renders each plan's actual currency.
      entitlement: this.entitlement,
    }).subscribe({
      next: () => {
        this.name = ''; this.priceInput = null; this.weeklyClassLimit = null; this.entitlement = 'UNLIMITED';
        this.load();
      },
      error: e => this.error.set(e.error?.detail ?? 'Could not create plan'),
    });
  }

  archive(p: Plan) {
    this.admin.patchPlan(p.id, { archived: true }).subscribe(() => this.load());
  }
}

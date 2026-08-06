import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminService, Member, Plan, PaymentMethod, Subscription } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';

interface Recorded { sub: Subscription; planName: string; currency: string; discountCents: number; }

/** Maps the record-payment error `detail` codes to friendly copy (M10 T7 brief). */
function mapRecordError(e: { status?: number; error?: { detail?: string } }): string {
  switch (e.error?.detail) {
    case 'INVALID_METHOD': return 'Choose a valid payment method.';
    case 'INVALID_PRICE': return 'Price cannot be negative.';
    case 'SWITCH_REQUIRES_CANCEL': return 'This member already has an active plan — cancel it below, then record the new one.';
    default: return e.status === 404 ? "Couldn't find that member or plan." : "Couldn't record the payment — try again.";
  }
}

@Component({
  selector: 'bh-admin-subscriptions',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, RouterLink, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Record payment</h2>
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading members and plans…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load members or plans.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          <form class="form" (ngSubmit)="record()">
            <label class="f"><span>SEARCH</span>
              <input class="bh-input" placeholder="Search name or email" [ngModel]="search()" name="search"
                     (ngModelChange)="onSearch($event)" data-testid="rp-search" />
            </label>

            <label class="f"><span>MEMBER</span>
              <select class="bh-select" name="member" [(ngModel)]="selectedMembershipId" data-testid="rp-member">
                <option value="" disabled>Select a member</option>
                @for (m of members(); track m.membershipId) {
                  <option [value]="m.membershipId">{{ m.name }} · {{ m.email }}@if (m.planName) { — {{ m.planName }} }</option>
                }
              </select>
            </label>

            @if (selectedMember(); as sm) {
              @if (sm.subscriptionId) {
                <div class="cancel-row">
                  <span>Current plan: {{ sm.planName }}</span>
                  <bh-button type="button" variant="ghost" size="sm"
                             [disabled]="cancelState() === 'pending'" (click)="cancelPlan(sm)" data-testid="rp-cancel">
                    {{ cancelState() === 'pending' ? 'Cancelling…' : 'Cancel plan' }}
                  </bh-button>
                </div>
                @if (cancelError()) { <p class="err" role="alert" data-testid="rp-cancel-error">{{ cancelError() }}</p> }
              }
            }

            <label class="f"><span>PLAN</span>
              <select class="bh-select" name="plan" [ngModel]="selectedPlanId"
                      (ngModelChange)="onPlanChange($event)" data-testid="rp-plan">
                <option value="" disabled>Select a plan</option>
                @for (p of plans(); track p.id) {
                  <option [value]="p.id">{{ p.name }} — {{ p.priceCents / 100 | currency: p.currency.toUpperCase() }}</option>
                }
              </select>
            </label>

            <label class="f"><span>METHOD</span>
              <select class="bh-select" name="method" [(ngModel)]="method" data-testid="rp-method">
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label class="f"><span>AGREED PRICE</span>
              <input class="bh-input" name="price" type="number" min="0" step="0.01" required
                     [(ngModel)]="priceInput" data-testid="rp-price" />
              @if (discountPreview() > 0) {
                <span class="discount" data-testid="rp-discount-preview">
                  discount: {{ discountPreview() / 100 | currency: (selectedPlan()?.currency ?? 'eur').toUpperCase() }}
                </span>
              }
            </label>

            <label class="f"><span>NOTE (OPTIONAL)</span>
              <input class="bh-input" name="note" [(ngModel)]="priceNote" data-testid="rp-note" />
            </label>

            @if (saveError()) { <p class="err" role="alert" data-testid="rp-error">{{ saveError() }}</p> }
            <bh-button type="submit"
                       [disabled]="saveState() === 'pending' || !selectedMembershipId || !selectedPlanId || priceInput == null"
                       data-testid="rp-submit">
              {{ saveState() === 'pending' ? 'Recording…' : 'Record payment' }}
            </bh-button>
          </form>

          @if (lastRecorded(); as r) {
            <div class="confirm" role="status" data-testid="rp-confirmed">
              Recorded {{ r.sub.priceCents / 100 | currency: r.currency.toUpperCase() }} for {{ r.planName }}.
              @if (r.discountCents > 0) {
                <span class="discount">({{ r.discountCents / 100 | currency: r.currency.toUpperCase() }} discount)</span>
              }
              <a class="receipt-link" [routerLink]="['/receipts', r.sub.paymentId]" data-testid="rp-receipt-link">View receipt</a>
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--volt); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .f select { margin-top: 6px; }
    .discount { color: var(--warn); font-size: 12px; }
    .cancel-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-3); border: 1px dashed var(--hairline); border-radius: var(--r-card);
      background: var(--surface-2); font-size: var(--fs-sm); color: var(--bone-dim); }
    .err { color: var(--volt); font-size: var(--fs-sm); }
    .confirm { margin-top: var(--sp-4); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface-2); color: var(--good); font-size: var(--fs-sm); }
    .receipt-link { display: inline-block; margin-left: var(--sp-3); color: var(--bone); text-decoration: underline; }
  `],
})
export class SubscriptionsPage implements OnInit {
  private admin = inject(AdminService);

  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly members = signal<Member[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly search = signal('');

  selectedMembershipId = '';
  selectedPlanId = '';
  method: PaymentMethod = 'CASH';
  priceInput: number | null = null;
  priceNote = '';

  readonly saveState = signal<'idle' | 'pending' | 'error'>('idle');
  readonly saveError = signal('');
  readonly lastRecorded = signal<Recorded | null>(null);

  readonly cancelState = signal<'idle' | 'pending' | 'error'>('idle');
  readonly cancelError = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    forkJoin({
      members: this.admin.listMembers(this.search(), 0),
      plans: this.admin.listPlans(),
    }).subscribe({
      next: ({ members, plans }) => { this.members.set(members.content); this.plans.set(plans); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  // Live filter as the admin types — a fresh page-0 lookup, not a full page-state reload
  // (mirrors members.page.ts's search-as-you-type convention).
  onSearch(value: string) {
    this.search.set(value);
    this.admin.listMembers(value, 0).subscribe(p => this.members.set(p.content));
  }

  selectedPlan(): Plan | undefined { return this.plans().find(p => p.id === this.selectedPlanId); }
  selectedMember(): Member | undefined { return this.members().find(m => m.membershipId === this.selectedMembershipId); }

  cancelPlan(m: Member) {
    if (!m.subscriptionId) return;
    this.cancelState.set('pending');
    this.cancelError.set('');
    this.admin.cancelSubscription(m.subscriptionId).subscribe({
      next: () => { this.cancelState.set('idle'); this.onSearch(this.search()); },
      error: () => { this.cancelState.set('error'); this.cancelError.set("Couldn't cancel — try again."); },
    });
  }

  onPlanChange(planId: string) {
    this.selectedPlanId = planId;
    const plan = this.plans().find(p => p.id === planId);
    if (plan) this.priceInput = plan.priceCents / 100; // pre-filled from list price, still editable
  }

  discountPreview(): number {
    const plan = this.selectedPlan();
    if (!plan || this.priceInput == null) return 0;
    return Math.max(0, plan.priceCents - Math.round(this.priceInput * 100));
  }

  record() {
    if (!this.selectedMembershipId || !this.selectedPlanId || this.priceInput == null) return;
    this.saveState.set('pending');
    this.saveError.set('');
    const plan = this.selectedPlan();
    const priceCents = Math.round(this.priceInput * 100);
    this.admin.recordPayment({
      membershipId: this.selectedMembershipId, planId: this.selectedPlanId,
      method: this.method, priceCents, priceNote: this.priceNote || undefined,
    }).subscribe({
      next: sub => {
        this.saveState.set('idle');
        this.lastRecorded.set({
          sub, planName: plan?.name ?? '', currency: plan?.currency ?? 'eur',
          discountCents: plan ? Math.max(0, plan.priceCents - sub.priceCents) : 0,
        });
        this.priceNote = '';
        this.onSearch(this.search()); // refresh the picked member's planName
      },
      error: e => { this.saveState.set('error'); this.saveError.set(mapRecordError(e)); },
    });
  }
}

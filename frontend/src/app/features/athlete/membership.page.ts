import { Component, inject, signal, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MembershipService, MySubscription, PlanSummary } from './membership.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

/** Maps checkout error `detail` codes to friendly copy (M10 T7 brief). */
function mapCheckoutError(e: { error?: { detail?: string } }): string {
  switch (e.error?.detail) {
    case 'STRIPE_NOT_CONNECTED': return 'This box has not connected Stripe yet.';
    // Cancelling is BOX_ADMIN-only, so the athlete has no control that does it themselves.
    case 'SWITCH_REQUIRES_CANCEL': return 'Ask your box to cancel your current plan first.';
    default: return "Couldn't start checkout — try again.";
  }
}

@Component({
  selector: 'bh-athlete-membership',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ButtonComponent, PillComponent],
  template: `
    <section class="mem">
      <header class="head"><span class="eyebrow">Membership</span><h1 class="title">Your plan</h1></header>

      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading your membership…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load your membership.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (data(); as d) {
            @if (d.subscription && d.plan) {
              <div class="card" data-testid="current-plan">
                <div class="row"><span class="pn">{{ d.plan.name }}</span>
                  <bh-pill [tone]="statusTone(d.subscription.status)" [label]="d.subscription.status" /></div>
                <div class="price num">{{ d.subscription.priceCents / 100 | currency: d.plan.currency.toUpperCase() }}</div>
                <div class="meta">
                  @if (d.subscription.currentPeriodEnd) {
                    Renews/expires {{ d.subscription.currentPeriodEnd | date:'dd MMM yyyy' }}
                  } @else { No expiry }
                </div>
              </div>
            } @else {
              <p class="stateline" data-testid="no-plan">You don't have an active plan yet.</p>
            }

            @if (d.stripeAvailable) {
              <h2 class="sh">Plans</h2>
              @if (checkoutError()) { <p class="err" role="alert" data-testid="checkout-error">{{ checkoutError() }}</p> }
              <ul class="plans">
                @for (p of plans(); track p.id) {
                  <li>
                    <span class="who"><b>{{ p.name }}</b>
                      <span class="meta num">{{ p.priceCents / 100 | currency: p.currency.toUpperCase() }}</span></span>
                    <bh-button size="sm" [disabled]="checkingOut() === p.id" (click)="subscribe(p.id)"
                               [attr.data-testid]="'subscribe-' + p.id">
                      {{ checkingOut() === p.id ? 'Redirecting…' : 'Subscribe' }}
                    </bh-button>
                  </li>
                } @empty { <li class="empty">No plans available yet.</li> }
              </ul>
            }
          }
        }
      }
    </section>
  `,
  styles: [`
    .mem { max-width: 560px; }
    .head { margin-bottom: var(--sp-5); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--red); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .card { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-5); display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--sp-6); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
    .pn { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 20px; }
    .price { font-family: var(--font-body); font-weight: 700; font-size: 34px; }
    .card .meta { color: var(--faint); font-size: var(--fs-sm); }
    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: 0 0 var(--sp-3); }
    .err { color: var(--red); font-size: var(--fs-sm); }
    .plans { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .plans li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .plans li:last-child { border-bottom: none; }
    .who b { font-weight: 600; }
    .who .meta { color: var(--faint); font-size: 12px; font-family: var(--font-mono); margin-left: 8px; }
    .empty { color: var(--bone-dim); font-size: 14px; }
  `],
})
export class MembershipPage implements OnInit {
  private svc = inject(MembershipService);

  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly data = signal<MySubscription | null>(null);
  readonly plans = signal<PlanSummary[]>([]);
  readonly checkingOut = signal<string | null>(null);
  readonly checkoutError = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    forkJoin({ mine: this.svc.mySubscription(), plans: this.svc.listPlans() }).subscribe({
      next: ({ mine, plans }) => { this.data.set(mine); this.plans.set(plans); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  statusTone(status: string): 'active' | 'warn' | 'suspended' {
    if (status === 'ACTIVE') return 'active';
    if (status === 'PAST_DUE') return 'warn';
    return 'suspended';
  }

  subscribe(planId: string) {
    this.checkingOut.set(planId);
    this.checkoutError.set('');
    this.svc.checkout(planId).subscribe({
      next: ({ url }) => this.redirectTo(url),
      error: e => { this.checkingOut.set(null); this.checkoutError.set(mapCheckoutError(e)); },
    });
  }

  // Broken out so tests can spy past it — assigning window.location.href for real would navigate
  // the Karma/ChromeHeadless test runner itself to an external URL.
  protected redirectTo(url: string) { window.location.href = url; }
}

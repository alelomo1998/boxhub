import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ReceiptService, Receipt } from './receipt.service';
import { ButtonComponent } from '../../ui/button.component';

/** Printable payment receipt. Reached by paymentId — an emailed link (PaymentReceipts), or the
 *  "View receipt" link admin/subscriptions.page.ts renders from the paymentId SubscriptionController
 *  #record returns. No in-app payment HISTORY list exists yet, so this is still a deep-link target,
 *  not something with its own nav entry. */
@Component({
  selector: 'bh-receipt',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ButtonComponent],
  template: `
    <section class="receipt">
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading receipt…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load this receipt.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (receipt(); as r) {
            <div class="paper">
              <header class="rhead">
                <span class="box">{{ r.boxName }}</span>
                <span class="eyebrow">Receipt</span>
              </header>
              <dl class="lines">
                <div class="line"><dt>Plan</dt><dd>{{ r.planName }}</dd></div>
                <div class="line">
                  <dt>Period</dt>
                  <dd>{{ r.periodStart | date:'dd MMM yyyy' }}@if (r.periodEnd) { – {{ r.periodEnd | date:'dd MMM yyyy' }} }</dd>
                </div>
                <div class="line"><dt>Method</dt><dd>{{ r.method }}</dd></div>
                <!-- Guard on listPriceCents, not just discountCents: both are null together for a
                     payment recorded before the list price was snapshotted (M12b), and narrowing
                     the one we divide is what makes this type-safe as well as correct. -->
                @if (r.listPriceCents !== null && r.discountCents) {
                  <div class="line">
                    <dt>List price</dt><dd class="num">{{ r.listPriceCents / 100 | currency: r.currency.toUpperCase() }}</dd>
                  </div>
                  <div class="line">
                    <dt>Discount</dt>
                    <dd class="num" data-testid="receipt-discount">-{{ r.discountCents / 100 | currency: r.currency.toUpperCase() }}</dd>
                  </div>
                }
                <div class="line total">
                  <dt>Total paid</dt><dd class="num" data-testid="receipt-total">{{ r.amountCents / 100 | currency: r.currency.toUpperCase() }}</dd>
                </div>
                <div class="line"><dt>Date</dt><dd>{{ r.createdAt | date:'dd MMM yyyy' }}</dd></div>
              </dl>
              <bh-button class="no-print" (click)="print()" data-testid="receipt-print">Print</bh-button>
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .receipt { max-width: 480px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--volt); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .paper { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-6); }
    .rhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--sp-5); }
    .box { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: 20px; }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .lines { margin: 0; }
    .line { display: flex; justify-content: space-between; gap: var(--sp-3); padding: 8px 0;
      border-bottom: 1px solid var(--hairline); }
    .line dt { color: var(--faint); font-size: var(--fs-sm); margin: 0; }
    .line dd { margin: 0; font-size: var(--fs-sm); }
    .line.total dt, .line.total dd { font-weight: 700; font-size: var(--fs-h2); color: var(--bone); border: none; }
    .line.total { border-bottom: none; }
    .no-print { margin-top: var(--sp-5); }
    @media print { .no-print { display: none; } }
  `],
})
export class ReceiptPage implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(ReceiptService);

  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly receipt = signal<Receipt | null>(null);

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    const id = this.route.snapshot.paramMap.get('paymentId')!;
    this.svc.get(id).subscribe({
      next: r => { this.receipt.set(r); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  print() { window.print(); }
}

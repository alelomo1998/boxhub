import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from './admin.service';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

/**
 * Connect/disconnect the box's own Stripe restricted key + webhook secret. Key material is
 * write-only — the backend never returns it (GET only reports {connected}), so this page never
 * displays a previously-saved key; the inputs are for entering a NEW key only.
 */
@Component({
  selector: 'bh-admin-box-stripe',
  standalone: true,
  imports: [FormsModule, ButtonComponent, PillComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Stripe</h2>
      @switch (state()) {
        @case ('loading') { <p class="stateline">Checking connection…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load Stripe status.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          <p class="status-row">
            @if (connected()) {
              <bh-pill tone="active" label="Connected" />
              <bh-button variant="ghost" size="sm" (click)="disconnect()" [disabled]="disconnecting()"
                         data-testid="stripe-disconnect">
                {{ disconnecting() ? 'Disconnecting…' : 'Disconnect' }}
              </bh-button>
            } @else {
              <bh-pill tone="suspended" label="Not connected" />
            }
          </p>

          <form class="form" (ngSubmit)="connect()">
            <label class="f"><span>RESTRICTED KEY</span>
              <input class="bh-input" name="restrictedKey" type="password" required
                     [(ngModel)]="restrictedKey" placeholder="rk_live_…" data-testid="stripe-key" />
            </label>
            <label class="f"><span>WEBHOOK SECRET</span>
              <input class="bh-input" name="webhookSecret" type="password" required
                     [(ngModel)]="webhookSecret" placeholder="whsec_…" data-testid="stripe-secret" />
            </label>
            @if (saveError()) { <p class="err" role="alert" data-testid="stripe-error">{{ saveError() }}</p> }
            <div class="actions">
              <bh-button type="submit" [disabled]="saveState() === 'pending'" data-testid="stripe-connect">
                {{ saveState() === 'pending' ? 'Connecting…' : (connected() ? 'Replace key' : 'Connect') }}
              </bh-button>
              @if (saveState() === 'saved') { <span class="ok" data-testid="stripe-saved">Connected ✓</span> }
            </div>
          </form>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--red); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .status-row { display: flex; align-items: center; gap: var(--sp-3); }
    .form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; margin-top: var(--sp-5); }
    .f { display: flex; flex-direction: column; gap: 6px; }
    .f span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
    .err { color: var(--red); font-size: var(--fs-sm); margin: 0; }
    .actions { display: flex; align-items: center; gap: var(--sp-3); }
    .ok { color: var(--good); font-size: 13px; font-weight: 600; }
  `],
})
export class BoxStripePage implements OnInit {
  private admin = inject(AdminService);

  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  readonly connected = signal(false);
  readonly disconnecting = signal(false);
  readonly saveState = signal<'idle' | 'pending' | 'error' | 'saved'>('idle');
  readonly saveError = signal('');

  restrictedKey = '';
  webhookSecret = '';

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.admin.stripeStatus().subscribe({
      next: s => { this.connected.set(s.connected); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  connect() {
    if (!this.restrictedKey || !this.webhookSecret) return;
    this.saveState.set('pending');
    this.saveError.set('');
    this.admin.connectStripe(this.restrictedKey, this.webhookSecret).subscribe({
      next: () => {
        this.connected.set(true);
        this.saveState.set('saved');
        this.restrictedKey = ''; // write-only: never keep entered secrets around after a successful save
        this.webhookSecret = '';
      },
      error: () => {
        this.saveState.set('error');
        this.saveError.set("Couldn't connect Stripe — check the key and secret and try again.");
        // input preserved: restrictedKey/webhookSecret untouched so the admin doesn't retype
      },
    });
  }

  disconnect() {
    if (!confirm('Disconnect Stripe? Athletes will no longer be able to subscribe online.')) return;
    this.disconnecting.set(true);
    this.admin.disconnectStripe().subscribe({
      next: () => { this.connected.set(false); this.disconnecting.set(false); },
      error: () => { this.disconnecting.set(false); },
    });
  }
}

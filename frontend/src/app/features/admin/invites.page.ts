import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AdminService, Invite, Plan } from './admin.service';
import { Role } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'bh-admin-invites',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Invites</h2>

      @if (pending()) {
        <div class="pending-card" data-testid="invites-pending">
          <p>Available once your box is approved.</p>
        </div>
      } @else {
        <form class="row" (ngSubmit)="create()">
          <input class="bh-input" name="email" type="email" required placeholder="member@email.com"
                 [(ngModel)]="email" data-testid="invite-email" />
          <select class="bh-select" name="role" [(ngModel)]="role" data-testid="invite-role">
            <option>ATHLETE</option><option>COACH</option><option>BOX_ADMIN</option>
          </select>
          <select class="bh-select" name="planId" [(ngModel)]="planId" data-testid="invite-plan">
            <option [ngValue]="undefined" disabled>Select a plan</option>
            <option [ngValue]="null">No plan (bill manually)</option>
            @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
          </select>
          <bh-button type="submit" size="sm" [disabled]="!email || (plans().length > 0 && planId === undefined)"
                     data-testid="invite-create">Create invite</bh-button>
        </form>
        @if (createError()) { <p class="err" role="alert">{{ createError() }}</p> }
      }

      @if (lastLink()) {
        <div class="linkbox">
          <span class="lbl">LINK</span>
          <code data-testid="invite-link">{{ lastLink() }}</code>
          <bh-button type="button" size="sm" (click)="copy()" data-testid="invite-copy">{{ copied() ? 'Copied!' : 'Copy' }}</bh-button>
        </div>
      }

      <h3 class="t-h3">Pending</h3>
      <ul class="list">
        @for (i of invites(); track i.id) {
          <li>
            <span class="who"><b>{{ i.email }}</b> <span class="meta">{{ i.role }} · expires {{ i.expiresAt | date:'dd MMM yyyy' }}</span></span>
            <bh-button variant="ghost" size="sm" (click)="revoke(i)" [attr.data-testid]="'invite-revoke-' + i.email">Revoke</bh-button>
          </li>
        } @empty { <li class="empty">No pending invites.</li> }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
    .linkbox { display: flex; align-items: center; gap: var(--sp-3); padding: 12px 14px;
      background: var(--surface-2); border: 1px dashed var(--hairline); border-radius: var(--r-card); }
    .linkbox .lbl { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; color: var(--faint); }
    .linkbox code { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone); }
    .linkbox bh-button { margin-left: auto; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .who b { font-weight: 600; }
    .who .meta { color: var(--faint); font-size: 12px; font-family: var(--font-mono); margin-left: 8px; }
    .empty { color: var(--bone-dim); font-size: 14px; }
    .pending-card { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface-2);
      padding: var(--sp-4); color: var(--bone-dim); font-size: var(--fs-sm); }
    .err { color: var(--danger); font-size: var(--fs-sm); }
  `],
})
export class InvitesPage implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  email = '';
  role: Role = 'ATHLETE';
  // undefined = no explicit choice made yet — the disabled placeholder option. A box with priced
  // plans must force an explicit pick (a real plan, or the explicit "No plan (bill manually)")
  // rather than silently defaulting to plan-less, which produces an unbookable member (M10 review).
  planId: string | null | undefined = undefined;
  readonly invites = signal<Invite[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly lastLink = signal('');
  readonly copied = signal(false);
  readonly createError = signal('');

  pending() { return this.auth.activeBoxStatus() === 'PENDING'; }

  ngOnInit() {
    this.admin.listPlans().subscribe(p => this.plans.set(p));
    this.load();
  }

  load() { this.admin.listInvites().subscribe(i => this.invites.set(i)); }

  create() {
    if (!this.email) return;
    if (this.plans().length > 0 && this.planId === undefined) return; // must pick a plan or "No plan"
    this.createError.set('');
    this.admin.createInvite({ email: this.email, role: this.role, planId: this.planId ?? undefined })
      .subscribe({
        next: inv => {
          this.lastLink.set(location.origin + inv.link);
          this.copied.set(false);
          this.email = '';
          this.load();
        },
        error: e => {
          // belt and braces: the form is hidden once PENDING, but status can flip mid-session —
          // a request already in flight can still land a 403 BOX_PENDING.
          this.createError.set(e.status === 403 && e.error?.detail === 'BOX_PENDING'
            ? "Available once your box is approved."
            : "Couldn't create invite — try again.");
        },
      });
  }

  copy() {
    navigator.clipboard.writeText(this.lastLink()).then(() => this.copied.set(true));
  }

  revoke(i: Invite) {
    this.admin.revokeInvite(i.id).subscribe(() => this.load());
  }
}

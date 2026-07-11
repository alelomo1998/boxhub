import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AdminService, Invite, Plan } from './admin.service';
import { Role } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';

@Component({
  selector: 'bh-admin-invites',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Invites</h2>
      <form class="row" (ngSubmit)="create()">
        <input class="bh-input" name="email" type="email" required placeholder="member@email.com"
               [(ngModel)]="email" data-testid="invite-email" />
        <select class="bh-select" name="role" [(ngModel)]="role" data-testid="invite-role">
          <option>ATHLETE</option><option>COACH</option><option>BOX_ADMIN</option>
        </select>
        <select class="bh-select" name="planId" [(ngModel)]="planId">
          <option [ngValue]="null">No plan</option>
          @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
        </select>
        <bh-button type="submit" size="sm" data-testid="invite-create">Create invite</bh-button>
      </form>

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
  styles: [`
    .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
    .linkbox { display: flex; align-items: center; gap: var(--sp-3); padding: 12px 14px;
      background: var(--surface-2); border: 1px dashed var(--hairline); border-radius: var(--r-card); }
    .linkbox .lbl { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; color: var(--faint); }
    .linkbox code { font-family: var(--font-mono); font-size: 13px; color: var(--bone); }
    .linkbox bh-button { margin-left: auto; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: 12px 4px; border-bottom: 1px solid var(--hairline); }
    .list li:last-child { border-bottom: none; }
    .who b { font-weight: 600; }
    .who .meta { color: var(--faint); font-size: 12px; font-family: var(--font-mono); margin-left: 8px; }
    .empty { color: var(--bone-dim); font-size: 14px; }
  `],
})
export class InvitesPage implements OnInit {
  private admin = inject(AdminService);
  email = '';
  role: Role = 'ATHLETE';
  planId: string | null = null;
  readonly invites = signal<Invite[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly lastLink = signal('');
  readonly copied = signal(false);

  ngOnInit() {
    this.admin.listPlans().subscribe(p => this.plans.set(p));
    this.load();
  }

  load() { this.admin.listInvites().subscribe(i => this.invites.set(i)); }

  create() {
    if (!this.email) return;
    this.admin.createInvite({ email: this.email, role: this.role, planId: this.planId ?? undefined })
      .subscribe(inv => {
        this.lastLink.set(location.origin + inv.link);
        this.copied.set(false);
        this.email = '';
        this.load();
      });
  }

  copy() {
    navigator.clipboard.writeText(this.lastLink()).then(() => this.copied.set(true));
  }

  revoke(i: Invite) {
    this.admin.revokeInvite(i.id).subscribe(() => this.load());
  }
}

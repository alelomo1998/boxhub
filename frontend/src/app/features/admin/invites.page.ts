import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AdminService, Invite, Plan } from './admin.service';
import { Role } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-admin-invites',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <section>
      <h2>Invites</h2>
      <form (ngSubmit)="create()">
        <input name="email" type="email" required placeholder="member@email.com"
               [(ngModel)]="email" data-testid="invite-email" />
        <select name="role" [(ngModel)]="role" data-testid="invite-role">
          <option>ATHLETE</option><option>COACH</option><option>BOX_ADMIN</option>
        </select>
        <select name="planId" [(ngModel)]="planId">
          <option [ngValue]="null">No plan</option>
          @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
        </select>
        <button type="submit" data-testid="invite-create">Create invite</button>
      </form>

      @if (lastLink()) {
        <p class="invite-link">
          Share this link: <code data-testid="invite-link">{{ lastLink() }}</code>
          <button type="button" (click)="copy()" data-testid="invite-copy">
            {{ copied() ? 'Copied!' : 'Copy' }}
          </button>
        </p>
      }

      <h3>Pending</h3>
      <ul>
        @for (i of invites(); track i.id) {
          <li>
            {{ i.email }} — {{ i.role }} — expires {{ i.expiresAt | date:'dd/MM/yyyy' }}
            <button (click)="revoke(i)" [attr.data-testid]="'invite-revoke-' + i.email">Revoke</button>
          </li>
        } @empty { <li>No pending invites.</li> }
      </ul>
    </section>
  `,
})
export class InvitesPage {
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

import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AdminService, Member, PageResponse, Plan } from './admin.service';
import { Role } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-admin-members',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <section>
      <h2>Members</h2>
      <input placeholder="Search name or email" [ngModel]="search()" name="search"
             (ngModelChange)="onSearch($event)" data-testid="member-search" />
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Plan</th><th>Expires</th><th></th></tr>
        </thead>
        <tbody>
          @for (m of page().content; track m.membershipId) {
            <tr [attr.data-testid]="'member-' + m.email">
              <td>{{ m.name }}</td>
              <td>{{ m.email }}</td>
              <td>
                <select [ngModel]="m.role" [name]="'role-' + m.membershipId"
                        (ngModelChange)="patch(m, { role: $event })">
                  <option>ATHLETE</option><option>COACH</option><option>BOX_ADMIN</option>
                </select>
              </td>
              <td>
                <select [ngModel]="m.status" [name]="'status-' + m.membershipId"
                        (ngModelChange)="patch(m, { status: $event })">
                  <option>ACTIVE</option><option>SUSPENDED</option>
                </select>
              </td>
              <td>
                <select [ngModel]="m.planId" [name]="'plan-' + m.membershipId"
                        (ngModelChange)="patch(m, { planId: $event })">
                  <option [ngValue]="null">—</option>
                  @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
                </select>
              </td>
              <td>
                {{ m.expiresAt | date:'dd/MM/yyyy' }}
                @if (m.expiringSoon) { <span class="badge-warn" data-testid="expiring">expiring</span> }
              </td>
              <td>@if (error() === m.membershipId) { <span class="error">failed</span> }</td>
            </tr>
          }
        </tbody>
      </table>
      @if (page().totalPages > 1) {
        <button (click)="go(-1)" [disabled]="pageIndex() === 0">Prev</button>
        <span>{{ pageIndex() + 1 }} / {{ page().totalPages }}</span>
        <button (click)="go(1)" [disabled]="pageIndex() + 1 >= page().totalPages">Next</button>
      }
    </section>
  `,
})
export class MembersPage implements OnInit {
  private admin = inject(AdminService);
  readonly search = signal('');
  readonly pageIndex = signal(0);
  readonly page = signal<PageResponse<Member>>({ content: [], totalElements: 0, totalPages: 0 });
  readonly plans = signal<Plan[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.admin.listPlans().subscribe(p => this.plans.set(p));
    this.load();
  }

  onSearch(value: string) {
    this.search.set(value);
    this.pageIndex.set(0);
    this.load();
  }

  go(delta: number) {
    this.pageIndex.update(i => i + delta);
    this.load();
  }

  load() {
    this.admin.listMembers(this.search(), this.pageIndex()).subscribe(p => this.page.set(p));
  }

  patch(m: Member, patch: Partial<{ role: Role; status: string; planId: string }>) {
    this.error.set(null);
    this.admin.patchMember(m.membershipId, patch).subscribe({
      next: () => this.load(),
      error: () => { this.error.set(m.membershipId); this.load(); }, // e.g. last-admin 409: reload reverts select
    });
  }
}

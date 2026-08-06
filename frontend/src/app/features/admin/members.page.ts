import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, Member, PageResponse } from './admin.service';
import { Role } from '../../core/auth/auth.models';
import { ButtonComponent } from '../../ui/button.component';
import { PillComponent } from '../../ui/pill.component';

@Component({
  selector: 'bh-admin-members',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, ButtonComponent, PillComponent],
  template: `
    <section class="bh-section">
      <div class="bh-section-head">
        <h2 class="t-h2">Members <span class="count">{{ page().totalElements }} total</span></h2>
        <input class="bh-input" placeholder="Search name or email" [ngModel]="search()" name="search"
               (ngModelChange)="onSearch($event)" data-testid="member-search" />
      </div>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead>
            <tr><th>Member</th><th>Role</th><th>Status</th><th>Plan</th><th>Expires</th></tr>
          </thead>
          <tbody>
            @for (m of page().content; track m.membershipId) {
              <tr [attr.data-testid]="'member-' + m.email">
                <td><div class="mname">{{ m.name }}</div><div class="memail">{{ m.email }}</div></td>
                <td>
                  <select class="bh-select" [ngModel]="m.role" [name]="'role-' + m.membershipId"
                          (ngModelChange)="patch(m, { role: $event })">
                    <option>ATHLETE</option><option>COACH</option><option>BOX_ADMIN</option>
                  </select>
                </td>
                <td>
                  <select class="bh-select" [ngModel]="m.status" [name]="'status-' + m.membershipId"
                          (ngModelChange)="patch(m, { status: $event })">
                    <option>ACTIVE</option><option>SUSPENDED</option>
                  </select>
                </td>
                <td>
                  <!-- read-only: plan assignment moved to POST /api/box/subscriptions (M10 T7) -->
                  @if (m.planName) {
                    {{ m.planName }}
                  } @else {
                    <a class="no-plan" routerLink="/admin/subscriptions" data-testid="no-plan">No active plan</a>
                  }
                </td>
                <td class="num">
                  {{ m.expiresAt | date:'dd MMM yyyy' }}
                  @if (m.expiringSoon) { <span data-testid="expiring"><bh-pill tone="warn" label="expiring" /></span> }
                  @if (error() === m.membershipId) { <span class="failed">· failed</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (page().totalPages > 1) {
        <div class="pager">
          <bh-button variant="ghost" size="sm" [disabled]="pageIndex() === 0" (click)="go(-1)">Prev</bh-button>
          <span class="num">{{ pageIndex() + 1 }} / {{ page().totalPages }}</span>
          <bh-button variant="ghost" size="sm" [disabled]="pageIndex() + 1 >= page().totalPages" (click)="go(1)">Next</bh-button>
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .count { font-family: var(--font-mono); font-size: 12px; color: var(--faint); text-transform: none; letter-spacing: 0.06em; margin-left: 10px; }
    .bh-section-head .bh-input { max-width: 240px; }
    .failed { color: var(--danger); font-size: 12px; font-family: var(--font-mono); margin-left: 8px; }
    .no-plan { color: var(--faint); text-decoration: underline; font-size: var(--fs-sm); }
    .pager { display: flex; align-items: center; gap: var(--sp-3); }
  `],
})
export class MembersPage implements OnInit {
  private admin = inject(AdminService);
  readonly search = signal('');
  readonly pageIndex = signal(0);
  readonly page = signal<PageResponse<Member>>({ content: [], totalElements: 0, totalPages: 0 });
  readonly error = signal<string | null>(null);

  ngOnInit() {
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

  patch(m: Member, patch: Partial<{ role: Role; status: string }>) {
    this.error.set(null);
    this.admin.patchMember(m.membershipId, patch).subscribe({
      next: () => this.load(),
      error: () => { this.error.set(m.membershipId); this.load(); }, // e.g. last-admin 409: reload reverts select
    });
  }
}

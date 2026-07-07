import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, MembershipDto } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-box-picker',
  standalone: true,
  template: `
    <main>
      <h1>Choose your box</h1>
      @if (auth.memberships().length === 0) {
        <p>No memberships yet — ask your box admin for an invite.</p>
      }
      @for (m of auth.memberships(); track m.boxId) {
        <button (click)="pick(m)" [attr.data-testid]="'box-' + m.boxSlug">
          {{ m.boxName }} — {{ m.role }}
        </button>
      }
    </main>
  `,
})
export class BoxPickerPage {
  auth = inject(AuthService);
  private router = inject(Router);

  pick(m: MembershipDto) {
    this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
  }
}

import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'bh-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="admin-nav">
      <h1>Box Admin</h1>
      <nav>
        <a routerLink="members" routerLinkActive="active">Members</a>
        <a routerLink="invites" routerLinkActive="active">Invites</a>
        <a routerLink="plans" routerLinkActive="active">Plans</a>
        <a routerLink="settings" routerLinkActive="active">Settings</a>
      </nav>
    </header>
    <router-outlet />
  `,
})
export class AdminShellPage {}

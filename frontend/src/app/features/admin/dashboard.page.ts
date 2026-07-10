import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService, AdminStats } from './admin.service';

/** Admin dashboard: headline KPIs + shortcuts. Full analytics is milestone M8. */
@Component({
  selector: 'bh-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="dash">
      <header class="head">
        <span class="eyebrow">This week</span>
        <h1 class="title">Dashboard</h1>
      </header>

      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading numbers…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load stats.
            <button class="retry" (click)="load()">Try again</button></p>
        }
        @default {
          @if (stats(); as s) {
            <div class="kpis">
              <a class="kpi" routerLink="/admin/members" data-testid="kpi-members">
                <span class="k-val num">{{ s.activeMembers }}</span>
                <span class="k-lab">active members</span>
              </a>
              <a class="kpi" routerLink="/admin/schedule" data-testid="kpi-fill">
                <span class="k-val num">{{ s.weekAttendance.fillPct }}<span class="k-unit">%</span></span>
                <span class="k-lab">fill so far this week
                  <span class="k-sub num">{{ s.weekAttendance.booked }}/{{ s.weekAttendance.capacity }} spots ·
                    {{ s.weekAttendance.checkins }} checked in</span></span>
              </a>
              <a class="kpi" [class.hot]="s.expiringPlans > 0" routerLink="/admin/members" data-testid="kpi-expiring">
                <span class="k-val num">{{ s.expiringPlans }}</span>
                <span class="k-lab">plans expiring ≤ 14 days</span>
              </a>
            </div>

            <h2 class="sh">Quick actions</h2>
            <div class="shortcuts">
              <a class="cut" routerLink="/admin/invites">Invite a member</a>
              <a class="cut" routerLink="/admin/schedule">Edit the schedule</a>
              <a class="cut" routerLink="/admin/plans">Manage plans</a>
              <a class="cut" routerLink="/admin/settings">Box settings</a>
            </div>

            <p class="note">Full analytics (economics, engagement, class stats) lands with milestone M8.</p>
          }
        }
      }
    </section>
  `,
  styles: [`
    .dash { max-width: 900px; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--red); }
    .retry { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); cursor: pointer; margin-left: var(--sp-2); }
    .head { margin-bottom: var(--sp-5); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }

    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-4); }
    .kpi { border: 1px solid var(--hairline); border-radius: var(--edge); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); display: flex; flex-direction: column; gap: 4px;
      color: var(--bone); text-decoration: none; }
    .kpi:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .kpi.hot { border-color: var(--warn); }
    .k-val { font-family: var(--font-display); font-weight: 800; font-size: 44px; line-height: 1;
      font-variant-numeric: tabular-nums; }
    .k-unit { font-size: 24px; color: var(--bone-dim); }
    .k-lab { font-size: var(--fs-sm); color: var(--bone-dim); display: flex; flex-direction: column; }
    .k-sub { color: var(--faint); font-size: var(--fs-meta); font-family: var(--font-mono); }
    .num { font-variant-numeric: tabular-nums; }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: var(--sp-6) 0 var(--sp-3); }
    .shortcuts { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
    .cut { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-4);
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
      text-decoration: none; font-size: var(--fs-sm); }
    .cut:hover { background: var(--surface-2); }
    .cut:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .note { margin-top: var(--sp-6); color: var(--faint); font-size: var(--fs-sm); }
  `],
})
export class DashboardPage implements OnInit {
  private admin = inject(AdminService);

  stats = signal<AdminStats | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.admin.adminStats().subscribe({
      next: s => { this.stats.set(s); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }
}

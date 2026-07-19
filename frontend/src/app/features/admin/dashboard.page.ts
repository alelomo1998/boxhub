import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService, AdminStats } from './admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { BookingService, ClassTemplate } from '../booking/booking.service';

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

      @if (showSetupGuide()) {
        <div class="setup" data-testid="setup-guide">
          <h2 class="sh">Get set up</h2>
          @switch (setupState()) {
            @case ('loading') { <p class="stateline">Checking your setup…</p> }
            @case ('error') {
              <p class="stateline err">Couldn't load setup status.
                <button class="retry" (click)="loadTemplates()">Try again</button></p>
            }
            @default {
              <ol class="steps">
                <li class="step" [class.done]="step1Done()">
                  <span class="dot" aria-hidden="true">{{ step1Done() ? '✓' : '1' }}</span>
                  <span class="s-body">
                    <a routerLink="/admin/schedule">Create a class type</a>
                  </span>
                </li>
                <li class="step" [class.done]="step2Done()">
                  <span class="dot" aria-hidden="true">{{ step2Done() ? '✓' : '2' }}</span>
                  <span class="s-body">
                    <a routerLink="/admin/schedule">Check your weekly schedule</a>
                  </span>
                </li>
                <li class="step" [class.locked]="!boxActive()">
                  <span class="dot" aria-hidden="true">{{ boxActive() ? '3' : '🔒' }}</span>
                  @if (boxActive()) {
                    <span class="s-body"><a routerLink="/admin/invites">Invite your members</a></span>
                  } @else {
                    <span class="s-body">Invite your members <span class="lock-note">unlocks on approval</span></span>
                  }
                </li>
              </ol>
            }
          }
        </div>
      }

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
    .kpi { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
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

    .setup { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); margin-bottom: var(--sp-5); }
    .setup .sh { margin: 0 0 var(--sp-3); }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
    .step { display: flex; align-items: center; gap: var(--sp-3); }
    .dot { display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--r-full);
      border: 1px solid var(--hairline); color: var(--faint); font-size: var(--fs-meta); flex-shrink: 0; }
    .step.done .dot { background: var(--good); border-color: var(--good); color: var(--on-red); }
    .s-body { font-size: var(--fs-sm); color: var(--bone); }
    .s-body a { color: var(--bone); }
    .step.locked .s-body { color: var(--faint); }
    .lock-note { color: var(--faint); font-size: var(--fs-meta); font-family: var(--font-mono);
      text-transform: uppercase; margin-left: var(--sp-2); }
  `],
})
export class DashboardPage implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private booking = inject(BookingService);

  stats = signal<AdminStats | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  templates = signal<ClassTemplate[]>([]);
  setupState = signal<'loading' | 'error' | 'ready'>('loading');

  boxStatus = computed(() => this.auth.activeBoxStatus());
  boxActive = computed(() => this.boxStatus() === 'ACTIVE');

  // step1/step2 both read GET /api/box/class-templates (BookingService.listTemplates — the same
  // call the Types page uses, see types.page.ts). Each ClassTemplate row already carries its own
  // weekday + startTime (there's no separate nested "slots" collection on this endpoint), so
  // "has weekly slots" reduces to the same non-empty check as "class type exists" today. Kept as
  // two distinct booleans (rather than one reused everywhere) so the steps stay independently
  // correct if slots ever move to their own field.
  step1Done = computed(() => this.templates().length > 0);
  step2Done = computed(() => this.templates().some(t => t.weekday !== undefined && !!t.startTime));

  showSetupGuide = computed(() => {
    const status = this.boxStatus();
    if (status === 'PENDING') return true;
    if (status === 'ACTIVE') return this.setupState() !== 'ready' || this.templates().length === 0;
    return false;
  });

  ngOnInit() {
    this.load();
    this.loadTemplates();
  }

  loadTemplates() {
    this.setupState.set('loading');
    this.booking.listTemplates().subscribe({
      next: ts => { this.templates.set(ts); this.setupState.set('ready'); },
      error: () => this.setupState.set('error'),
    });
  }

  load() {
    this.state.set('loading');
    this.admin.adminStats().subscribe({
      next: s => { this.stats.set(s); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }
}

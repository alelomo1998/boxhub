import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** A nested item under a top-level sidebar section — the indent-guide case in spec §9. */
interface SidebarChild {
  readonly label: string;
  readonly active?: boolean;
}

/** One top-level sidebar item. Icon-only when the sidebar is collapsed. */
interface SidebarItem {
  readonly icon: string;
  readonly label: string;
  readonly active?: boolean;
  readonly children?: readonly SidebarChild[];
}

/** One fabricated row of the members table. */
interface AdminMemberRow {
  readonly initials: string;
  readonly name: string;
  readonly email: string;
  readonly plan: string;
  readonly status: 'active' | 'lapsing';
  readonly joined: string;
  readonly visits: number;
}

/**
 * The plumbing half of M13b's proof — a dense admin table against the new language, and the
 * harder claim: that the language stays quiet on an ordinary screen. Identity bleeding into
 * plumbing (forms, tables) was one of the three stated reasons the previous direction was
 * retired, and a hero screen cannot demonstrate its own absence.
 *
 * Exactly one element on this whole proof carries `data-accent="volt"` — the primary action
 * ("Invite member"). Every status is `--good` / `--warn` text beside a dot, never a fill. The
 * sidebar's active item and hovered rows climb the surface ladder (`--surface` → `--surface-2`),
 * never volt. Nothing here talks to an API; all data is fabricated for this screen.
 */
@Component({
  selector: 'bh-proof-admin-members',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="proof" data-proof="admin-members">
      <div class="shell">
        <aside class="sidebar" [class.collapsed]="collapsed()">
          <div class="side-head">
            <span class="brand">
              <span class="badge" aria-hidden="true">R</span>
              @if (!collapsed()) {
                <span
                  class="bn"
                  style="font-weight: 700; font-size: var(--fs-sm); overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap"
                  i18n="@@dev.members.brand"
                  >rxed admin</span
                >
              }
            </span>
            <button
              type="button"
              class="collapse-btn"
              [attr.aria-expanded]="!collapsed()"
              [attr.title]="collapsed() ? expandLabel : collapseLabel"
              [attr.aria-label]="collapsed() ? expandLabel : collapseLabel"
              (click)="collapsed.set(!collapsed())"
            >
              <span aria-hidden="true">{{ collapsed() ? '»' : '«' }}</span>
            </button>
          </div>

          <nav class="nav" aria-label="Admin">
            <p class="section-label" i18n="@@dev.members.sectionMain">Main</p>
            @for (item of mainNav; track item.label) {
              <a
                class="s-item"
                [class.active]="item.active"
                href="javascript:void(0)"
                [attr.title]="collapsed() ? item.label : null"
                [attr.aria-label]="item.label"
              >
                <span class="icon" aria-hidden="true">{{ item.icon }}</span>
                @if (!collapsed()) {
                  <span class="label">{{ item.label }}</span>
                }
              </a>
              @if (item.children && !collapsed()) {
                <ul class="subnav">
                  @for (child of item.children; track child.label) {
                    <li>
                      <a class="sub-item" [class.active]="child.active" href="javascript:void(0)">{{ child.label }}</a>
                    </li>
                  }
                </ul>
              }
            }

            <p class="section-label" i18n="@@dev.members.sectionSettings">Settings</p>
            @for (item of settingsNav; track item.label) {
              <a
                class="s-item"
                href="javascript:void(0)"
                [attr.title]="collapsed() ? item.label : null"
                [attr.aria-label]="item.label"
              >
                <span class="icon" aria-hidden="true">{{ item.icon }}</span>
                @if (!collapsed()) {
                  <span class="label">{{ item.label }}</span>
                }
              </a>
            }
          </nav>

          <div class="user-card">
            <span class="badge rd" aria-hidden="true">AK</span>
            @if (!collapsed()) {
              <span class="who">
                <!-- A person's name: not i18n-marked, per spec §12.1 — vocabulary, not prose. -->
                <span
                  style="font-size: var(--fs-sm); font-weight: 500; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap"
                  >Alex Kirov</span
                >
                <span style="color: var(--faint); font-size: var(--fs-meta)" i18n="@@dev.members.userRole">Box admin</span>
              </span>
            }
          </div>
        </aside>

        <div class="main">
          <header class="page-head">
            <h2 class="t-h2" style="margin: 0" i18n="@@dev.members.heading">Members</h2>
            <button type="button" class="primary" data-accent="volt" i18n="@@dev.members.inviteAction">
              Invite member
            </button>
          </header>

          <div class="filters">
            <input
              class="bh-input"
              style="flex: 1 1 220px"
              type="search"
              i18n-placeholder="@@dev.members.searchPlaceholder"
              placeholder="Search by name or email"
              i18n-aria-label="@@dev.members.searchLabel"
              aria-label="Search members"
            />
            <select class="bh-select" i18n-aria-label="@@dev.members.statusFilterLabel" aria-label="Filter by status">
              <option i18n="@@dev.members.statusFilterAll">All statuses</option>
              <option i18n="@@dev.members.statusFilterActive">Active</option>
              <option i18n="@@dev.members.statusFilterLapsing">Lapsing</option>
            </select>
            <select class="bh-select" i18n-aria-label="@@dev.members.planFilterLabel" aria-label="Filter by plan">
              <option i18n="@@dev.members.planFilterAll">All plans</option>
              @for (plan of fabricatedPlanNames; track plan) {
                <option>{{ plan }}</option>
              }
            </select>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th class="t-eyebrow-tight" i18n="@@dev.members.colMember">Member</th>
                  <th class="t-eyebrow-tight" i18n="@@dev.members.colPlan">Plan</th>
                  <th class="t-eyebrow-tight" i18n="@@dev.members.colStatus">Status</th>
                  <th class="t-eyebrow-tight" i18n="@@dev.members.colJoined">Joined</th>
                  <th class="t-eyebrow-tight num-col" i18n="@@dev.members.colVisits">Visits</th>
                </tr>
              </thead>
              <tbody>
                @for (m of fabricatedMembers; track m.email) {
                  <tr>
                    <td>
                      <div class="member-cell">
                        <span class="badge rd" aria-hidden="true">{{ m.initials }}</span>
                        <span class="who">
                          <!-- A member's name and email: fabricated data, not prose — not i18n-marked. -->
                          <span style="font-weight: 500">{{ m.name }}</span>
                          <span class="memail">{{ m.email }}</span>
                        </span>
                      </div>
                    </td>
                    <td style="max-width: 220px; word-break: break-word">
                      <!-- Plan names are box-defined vocabulary, like a benchmark WOD's name — not
                           i18n-marked. One is deliberately long German text (spec §12): the column
                           wraps rather than truncating and stays inside its own scroll container. -->
                      {{ m.plan }}
                    </td>
                    <td>
                      <span class="status" [class.active]="m.status === 'active'" [class.lapsing]="m.status === 'lapsing'">
                        <span class="dot" aria-hidden="true"></span>
                        {{ m.status === 'active' ? statusActiveLabel : statusLapsingLabel }}
                      </span>
                    </td>
                    <td class="num-mono">{{ m.joined | date: 'mediumDate' }}</td>
                    <td class="num-mono num-col">{{ m.visits }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section class="state-demo">
        <p class="t-eyebrow" i18n="@@dev.members.loadingLabel">Loading</p>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="t-eyebrow-tight" i18n="@@dev.members.colMember">Member</th>
                <th class="t-eyebrow-tight" i18n="@@dev.members.colPlan">Plan</th>
                <th class="t-eyebrow-tight" i18n="@@dev.members.colStatus">Status</th>
                <th class="t-eyebrow-tight" i18n="@@dev.members.colJoined">Joined</th>
                <th class="t-eyebrow-tight num-col" i18n="@@dev.members.colVisits">Visits</th>
              </tr>
            </thead>
            <tbody>
              <tr class="skel-row">
                <td><span class="bh-skel" style="width: 9.5rem; height: 1rem;"></span></td>
                <td><span class="bh-skel" style="width: 6rem; height: 1rem;"></span></td>
                <td><span class="bh-skel" style="width: 4rem; height: 1rem;"></span></td>
                <td><span class="bh-skel" style="width: 5rem; height: 1rem;"></span></td>
                <td><span class="bh-skel" style="width: 2.5rem; height: 1rem;"></span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="state-demo">
        <p class="t-eyebrow" i18n="@@dev.members.emptyLabel">Empty state</p>
        <div class="empty">
          <p style="margin: 0; font-size: var(--fs-body)" i18n="@@dev.members.emptyMessage">No members match these filters.</p>
          <p style="margin: 0; color: var(--faint); font-size: var(--fs-sm)" i18n="@@dev.members.emptyHint">Try clearing a filter or search term.</p>
        </div>
      </section>
    </div>
  `,
  styles: [`
    /* :focus-visible defaults to var(--focus) globally (styles.scss) — only the volt-filled
       .primary button below needs an override, for the reason in spec §11.2. */
    .side-head, .brand, .collapse-btn, .s-item, .sub-item, .user-card, .member-cell,
    .page-head, .filters, .status { display: flex; align-items: center; }
    .proof, .sidebar, .main, .nav, .subnav, .who, .state-demo, .empty { display: flex;
      flex-direction: column; }

    .proof { gap: var(--sp-6); }
    .shell { display: flex; align-items: stretch; border: 1px solid var(--hairline);
      border-radius: var(--r-card); overflow: hidden; background: var(--surface); }

    .sidebar { width: 208px; flex-shrink: 0; border-right: 1px solid var(--hairline);
      background: var(--ground); }
    .sidebar.collapsed { width: 56px; }
    .sidebar.collapsed .side-head { flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); }
    .sidebar.collapsed .section-label { display: none; }

    .badge { display: grid; place-items: center; width: 28px; height: 28px;
      border-radius: var(--r-xs); font-family: var(--font-mono); font-weight: 700; font-size: var(--fs-meta);
      color: var(--bone); background: var(--surface-2); }
    .badge.rd { border-radius: var(--r-full); }

    .side-head { justify-content: space-between; gap: var(--sp-2); padding: var(--sp-3);
      border-bottom: 1px solid var(--hairline); }
    .brand { gap: var(--sp-2); min-width: 0; }
    .collapse-btn { min-width: var(--tap); min-height: var(--tap); justify-content: center;
      background: none; border: none; color: var(--faint); border-radius: var(--r-xs); cursor: pointer; }

    .nav { padding: var(--sp-3) var(--sp-2); gap: 2px; flex: 1; overflow-y: auto; }
    .section-label { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); margin: var(--sp-3) var(--sp-2) var(--sp-1); }

    .s-item { gap: var(--sp-3); min-height: var(--tap); padding: 0 var(--sp-2);
      border-radius: var(--r-xs); color: var(--bone-dim); text-decoration: none; font-size: var(--fs-sm); }
    .s-item .icon { width: 20px; text-align: center; }
    .s-item .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .s-item.active, .s-item:hover { background: var(--surface-2); }
    .s-item.active { color: var(--bone); }

    /* Nested items: indent guide is a hairline rule, not a background. */
    .subnav { list-style: none; margin: 0 0 var(--sp-1) var(--sp-4); padding: 0 0 0 var(--sp-4);
      border-left: 1px solid var(--hairline); gap: 2px; }
    .sub-item { min-height: 32px; padding: 0 var(--sp-2); border-radius: var(--r-xs);
      color: var(--faint); text-decoration: none; font-size: var(--fs-sm); }
    .sub-item.active, .sub-item:hover { color: var(--bone); }
    .sub-item:hover { background: var(--surface-2); }

    .user-card { gap: var(--sp-2); padding: var(--sp-3); border-top: 1px solid var(--hairline); }
    .who { min-width: 0; }

    .main { flex: 1; min-width: 0; padding: var(--sp-5); gap: var(--sp-4); }
    .page-head { justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
    /* The one volt element on the whole proof. */
    .primary { background: var(--volt); color: var(--on-volt); border: none; border-radius: var(--edge);
      padding: 0 var(--sp-4); min-height: var(--tap); font-weight: 700; font-size: var(--fs-sm);
      cursor: pointer; }
    .primary:focus-visible { outline: 2px solid var(--focus-inv); outline-offset: 2px; }

    .filters { flex-wrap: wrap; gap: var(--sp-2); }

    .table-wrap { overflow-x: auto; margin-top: var(--sp-2); }
    .table { border-collapse: collapse; width: 100%; }
    .table th, .table td { border-bottom: 1px solid var(--hairline); padding: var(--sp-3); }
    .table th { text-align: left; color: var(--faint); }
    .table td { color: var(--bone-dim); font-size: var(--fs-sm); vertical-align: middle; }
    .table tbody tr:last-child td { border-bottom: none; }
    .table tbody tr:hover td { background: var(--surface-2); }
    .num-col { text-align: right; }

    .member-cell { gap: var(--sp-3); min-width: 0; }
    .memail { color: var(--faint); font-family: var(--font-mono); font-size: var(--fs-meta); }

    .status { gap: var(--sp-1); font-size: var(--fs-sm); color: var(--status-c); }
    .status .dot { width: 6px; height: 6px; border-radius: var(--r-full); background: var(--status-c); }
    .status.active { --status-c: var(--good); }
    .status.lapsing { --status-c: var(--warn); }

    .num-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

    .state-demo { gap: var(--sp-2); }
    .empty { align-items: center; gap: var(--sp-1); border: 1px solid var(--hairline);
      border-radius: var(--r-card); padding: var(--sp-6); }
    .empty-msg { margin: 0; font-size: var(--fs-body); }
    .empty-hint { margin: 0; color: var(--faint); font-size: var(--fs-sm); }

    @media (max-width: 767px) {
      .sidebar { width: 56px; }
      .sidebar .label, .sidebar .section-label, .sidebar .bn, .sidebar .who, .subnav { display: none; }
    }
  `],
})
export class ProofAdminMembersComponent {
  protected readonly collapsed = signal(false);

  protected readonly expandLabel = $localize`:@@dev.members.expandSidebar:Expand sidebar`;
  protected readonly collapseLabel = $localize`:@@dev.members.collapseSidebar:Collapse sidebar`;
  protected readonly statusActiveLabel = $localize`:@@dev.members.statusActive:Active`;
  protected readonly statusLapsingLabel = $localize`:@@dev.members.statusLapsing:Lapsing`;

  protected readonly mainNav: readonly SidebarItem[] = [
    { icon: '▦', label: $localize`:@@dev.members.navDashboard:Dashboard` },
    {
      icon: '◉',
      label: $localize`:@@dev.members.navMembers:Members`,
      active: true,
      children: [
        { label: $localize`:@@dev.members.navMembersAll:All members`, active: true },
        { label: $localize`:@@dev.members.navMembersWaivers:Waivers` },
      ],
    },
    { icon: '▤', label: $localize`:@@dev.members.navSchedule:Schedule` },
    { icon: '≡', label: $localize`:@@dev.members.navProgramming:Programming` },
  ];

  protected readonly settingsNav: readonly SidebarItem[] = [
    { icon: '$', label: $localize`:@@dev.members.navBilling:Billing` },
    { icon: '⚇', label: $localize`:@@dev.members.navTeam:Team` },
    { icon: '⚙', label: $localize`:@@dev.members.navPreferences:Preferences` },
  ];

  // Plan names are box-defined vocabulary (like a member's name), never translated — see the
  // template comment above the plan cell. One is deliberately long German text: spec §12 checks
  // the type scale against the longest German string, not the English one.
  protected readonly fabricatedPlanNames: readonly string[] = [
    'Unlimited',
    'Drop-in',
    'Founders',
    'Jahresmitgliedschaft mit unbegrenztem Zugang',
  ];

  protected readonly fabricatedMembers: readonly AdminMemberRow[] = [
    { initials: 'MK', name: 'Mara Kessler', email: 'mara.kessler@example.com', plan: 'Unlimited', status: 'active', joined: '2023-11-02', visits: 142 },
    { initials: 'TB', name: 'Theo Bracken', email: 'theo.bracken@example.com', plan: 'Drop-in', status: 'lapsing', joined: '2024-06-18', visits: 9 },
    { initials: 'PA', name: 'Priya Anand', email: 'priya.anand@example.com', plan: 'Founders', status: 'active', joined: '2022-05-30', visits: 311 },
    { initials: 'JW', name: 'Jonas Weidner', email: 'jonas.weidner@example.com', plan: 'Jahresmitgliedschaft mit unbegrenztem Zugang', status: 'active', joined: '2024-01-09', visits: 58 },
    { initials: 'DF', name: 'Dario Fontane', email: 'dario.fontane@example.com', plan: 'Unlimited', status: 'lapsing', joined: '2023-09-21', visits: 27 },
    { initials: 'LV', name: 'Lena Voss', email: 'lena.voss@example.com', plan: 'Drop-in', status: 'active', joined: '2024-03-14', visits: 6 },
  ];
}

import { Component, ChangeDetectionStrategy, OnInit, computed, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';
import { PrefRow } from './notification.models';
import { NOTIFICATION_PREF_COPY, NotificationPrefCopy } from './notification-copy';
import { AuthService } from '../../core/auth/auth.service';
import { SwitchComponent } from '../../ui/switch.component';
import { PanelComponent } from '../../ui/panel.component';
import { EmptyComponent } from '../../ui/empty.component';
import { PillComponent } from '../../ui/pill.component';

/** A fetched row plus this screen's own transient state — never sent to the server. */
interface PrefRowVm extends PrefRow {
  pending: boolean;
  error: string | null;
}

interface GroupDef {
  key: string;
  types: string[];
  /** The staff group is role-gated, not shell-gated (a BOX_ADMIN can legitimately be in the
   *  athlete shell and still owns staff notifications) — keyed on AuthService.activeBox()?.role. */
  staffOnly?: boolean;
}

interface RenderGroup {
  key: string;
  heading: string;
  rows: PrefRowVm[];
}

/** The confirmed group membership, in display order. Explicit lists rather than deriving from
 *  NOTIFICATION_COPY's key order — that map's order is incidental, this one is the shape. */
const GROUP_DEFS: GroupDef[] = [
  { key: 'time-critical', types: [
    'WAITLIST_PROMOTED', 'CLASS_CANCELLED', 'CLASS_TIME_CHANGED',
    'COACH_CHANGED', 'LATE_CANCEL_UNREFUNDED', 'NO_SHOW_RECORDED',
  ] },
  { key: 'announcements', types: ['NEW_ANNOUNCEMENT'] },
  { key: 'training', types: ['PROGRAMMING_PUBLISHED'] },
  { key: 'money', types: ['SUBSCRIPTION_EXPIRING', 'PAYMENT_FAILED', 'MEMBERSHIP_BLOCKED'] },
  { key: 'gym', types: ['INVITE_ACCEPTED', 'NEW_MEMBER_JOINED'], staffOnly: true },
];

/**
 * `/{athlete,coach,admin}/notifications/settings` — one row per feed type, grouped, saving on
 * change (M29b). No form, no submit button: `bh-switch` saves itself the moment it moves.
 *
 * Renders only the types the API actually returned, so a type the server stops sending simply
 * disappears rather than leaving a dead row. A returned type this build has no group for lands in
 * a final "Other" section instead of vanishing — a preference the user cannot reach is worse than
 * an ugly one.
 */
@Component({
  selector: 'bh-notification-prefs',
  standalone: true,
  imports: [SwitchComponent, PanelComponent, EmptyComponent, PillComponent],
  template: `
    <div class="pf" data-testid="notification-prefs-page">
      <header class="page-header">
        <h1 class="title" i18n="@@notifications.prefs.page.title">Notification settings</h1>
      </header>

      <div class="results">
          @switch (state()) {
            @case ('loading') { <p class="stateline" i18n="@@notifications.prefs.loading">Loading…</p> }
            @case ('error') {
              <p class="stateline err">
                <span i18n="@@notifications.prefs.error">Couldn't load your notification settings.</span>
                <button type="button" class="retry" (click)="load()" i18n="@@notifications.prefs.retry">Try again</button>
              </p>
            }
            @default {
              @if (groups().length === 0) {
                <bh-empty data-testid="notification-prefs-empty" icon="bell" [title]="emptyTitle" />
              } @else {
                @for (g of groups(); track g.key) {
                  <section class="group" [attr.aria-labelledby]="'pref-group-' + g.key">
                    <div class="group-header"><h2 [id]="'pref-group-' + g.key">{{ g.heading }}</h2></div>
                    <bh-panel class="group-panel">
                      @for (row of g.rows; track row.type) {
                        <div class="pref-row">
                          @if (row.mandatory) {
                            <!-- No fake control to tap: a real bh-switch here differs from a live
                                 one only by a luminance drop, invites a tap that does nothing, and
                                 disappears from the tab order and a11y tree. bh-pill isn't a
                                 control at all, and its label keeps the "Always on" state in words. -->
                            <div class="locked-row">
                              <div class="locked-text">
                                <span class="locked-label">{{ prefCopy(row.type).label }}</span>
                                <p class="locked-reason">{{ prefCopy(row.type).hint }}</p>
                              </div>
                              <bh-pill tone="suspended" [label]="alwaysOnLabel" [attr.data-testid]="'pref-locked-' + row.type" />
                            </div>
                          } @else {
                            <!-- Deliberately NOT disabled while saving. bh-switch dims a disabled
                                 control to opacity .5, so a save flashed the whole full-width row
                                 dim and back — a flick on any real network. The optimistic flip is
                                 the feedback; re-entry is guarded in onToggle instead. -->
                            <bh-switch [checked]="row.enabled" (checkedChange)="onToggle(row, $event)"
                                       [label]="prefCopy(row.type).label" [hint]="prefCopy(row.type).hint"
                                       [testId]="'pref-switch-' + row.type" />
                          }
                          @if (row.error) {
                            <p class="row-err" role="alert" [attr.data-testid]="'pref-error-' + row.type">{{ row.error }}</p>
                          }
                        </div>
                      }
                    </bh-panel>
                  </section>
                }
              }
            }
          }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* No internal scroller and no height:100%. Settings pages in this app flow and let the
       shell scroll; an internal scroller reserves none of the shell's dock padding, which
       is what cut the last row off on a short viewport. */
    :host { display: block; }

    .page-header { box-sizing: border-box; background: var(--ground); border-bottom: 1px solid var(--hairline);
      padding: var(--sp-3) var(--sp-4); }
    .title { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--bone); }

    .results { padding: 0 var(--sp-4) var(--sp-4); }
    .stateline { color: var(--bone-dim); padding-top: var(--sp-4); }
    .stateline.err { color: var(--danger); }
    .retry { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); min-height: var(--tap); padding: 0 var(--sp-4); margin-left: var(--sp-2); cursor: pointer; }
    .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .group { margin-top: var(--sp-4); }
    /* Same centred mono divider the feed's day headers use — the two screens read as siblings. */
    .group-header { padding: 0 0 var(--sp-2); display: flex; align-items: center; gap: var(--sp-3); }
    .group-header::before, .group-header::after { content: ''; flex: 1; height: 1px; background: var(--hairline); }
    .group-header h2 { margin: 0; font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.18em;
      text-transform: uppercase; color: var(--faint); font-weight: 400; }

    .group-panel { padding: 0 var(--sp-4); }
    /* min-width: 0 is what lets a long label wrap inside bh-switch's flex row instead of pushing
       the track off the edge at 320px. */
    .pref-row { min-width: 0; padding: var(--sp-3) 0; border-bottom: 1px solid var(--hairline); }
    .pref-row:last-child { border-bottom: none; }

    /* Full contrast, outside the pill — the label and reason are what tell someone why the row
       cannot be changed, so they never inherit the pill's quieter treatment. */
    /* flex-start, not center: the reason runs to four lines on a 393px phone, and a centred pill
       floats halfway down the paragraph instead of reading as the label's state. */
    .locked-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
    .locked-text { min-width: 0; }
    /* The pill is a flex item beside wrapping prose, so without this it shrinks and breaks its
       own two-word label across two lines inside the oval. nowrap is set on the host and
       inherits into the pill, which keeps app/ui/ untouched. */
    .locked-row bh-pill { flex-shrink: 0; white-space: nowrap; }
    .locked-label { font-family: var(--font-body); font-size: var(--fs-body); color: var(--bone); }
    .locked-reason { margin: var(--sp-1) 0 0; font-family: var(--font-body); font-size: var(--fs-sm);
      color: var(--bone-dim); }

    .row-err { margin: var(--sp-2) 0 0; font-family: var(--font-body); font-size: var(--fs-sm);
      color: var(--danger); }
  `],
})
export class NotificationPrefsPage implements OnInit {
  private notifications = inject(NotificationService);
  private auth = inject(AuthService);

  protected rows = signal<PrefRowVm[]>([]);
  protected state = signal<'loading' | 'error' | 'ready'>('loading');

  protected readonly emptyTitle = $localize`:@@notifications.prefs.empty.title:Nothing to configure yet`;
  // A save that fails must never be silent — the row it belongs to already says which setting.
  private readonly saveFailedMsg = $localize`:@@notifications.prefs.save.failed:Couldn't save that change. Try again.`;
  private readonly unknownLabel = $localize`:@@notifications.pref.unknown.label:Notification setting`;
  private readonly unknownHint = $localize`:@@notifications.pref.unknown.hint:A setting this app doesn't recognize yet.`;
  protected readonly alwaysOnLabel = $localize`:@@notifications.prefs.alwaysOn:Always on`;

  // The old heading named the registry's own urgency classification, not how a member thinks,
  // and it oversold two of its six rows: late cancellations and no-shows are retrospective, not
  // urgent-now.
  private readonly classesHeading = $localize`:@@notifications.prefs.group.classes:Classes and bookings`;
  // The old heading sat directly above a single row whose label was that same word.
  private readonly fromYourGymHeading = $localize`:@@notifications.prefs.group.fromYourGym:From your gym`;
  private readonly trainingHeading = $localize`:@@notifications.prefs.group.training:Training`;
  private readonly moneyHeading = $localize`:@@notifications.prefs.group.money:Money and membership`;
  // The old heading for this staff-only group would have collided with the group above it.
  private readonly membersHeading = $localize`:@@notifications.prefs.group.members:Members`;
  private readonly otherHeading = $localize`:@@notifications.prefs.group.other:Other`;

  protected readonly isStaff = computed(() => {
    const role = this.auth.activeBox()?.role;
    return role === 'COACH' || role === 'BOX_ADMIN';
  });

  protected readonly groups = computed<RenderGroup[]>(() => {
    const rows = this.rows();
    const byType = new Map(rows.map(r => [r.type, r]));
    const known = new Set(GROUP_DEFS.flatMap(g => g.types));
    const staff = this.isStaff();
    const out: RenderGroup[] = [];
    for (const def of GROUP_DEFS) {
      if (def.staffOnly && !staff) continue;
      const groupRows = def.types
        .map(t => byType.get(t))
        .filter((r): r is PrefRowVm => r !== undefined);
      if (groupRows.length > 0) out.push({ key: def.key, heading: this.headingFor(def.key), rows: groupRows });
    }
    const orphans = rows.filter(r => !known.has(r.type));
    if (orphans.length > 0) out.push({ key: 'other', heading: this.otherHeading, rows: orphans });
    return out;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.notifications.prefs().subscribe({
      next: rows => {
        this.rows.set(rows.map(r => ({ ...r, pending: false, error: null })));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected prefCopy(type: string): NotificationPrefCopy {
    return NOTIFICATION_PREF_COPY[type] ?? { label: this.unknownLabel, hint: this.unknownHint };
  }

  /** Guarded here, not only via bh-switch's [disabled] — a disabled control guards one path,
   *  never the action, and a locked row must never reach savePrefs regardless of how it's called. */
  protected onToggle(row: PrefRowVm, next: boolean): void {
    if (row.mandatory) return;
    // The control stays enabled during a save, so guard a second tap here rather than in the DOM.
    if (row.pending) return;
    const prev = row.enabled;
    this.patchRow(row.type, { enabled: next, pending: true, error: null });
    this.notifications.savePrefs([{ type: row.type, channel: row.channel, enabled: next }]).subscribe({
      next: () => this.patchRow(row.type, { pending: false }),
      // Revert AND say so — the switch simply flipping back with no word reads as it doing nothing.
      error: () => this.patchRow(row.type, { enabled: prev, pending: false, error: this.saveFailedMsg }),
    });
  }

  private headingFor(key: string): string {
    switch (key) {
      case 'time-critical': return this.classesHeading;
      case 'announcements': return this.fromYourGymHeading;
      case 'training': return this.trainingHeading;
      case 'money': return this.moneyHeading;
      case 'gym': return this.membersHeading;
      default: return this.otherHeading;
    }
  }

  private patchRow(type: string, patch: Partial<PrefRowVm>): void {
    this.rows.update(rs => rs.map(r => r.type === type ? { ...r, ...patch } : r));
  }
}

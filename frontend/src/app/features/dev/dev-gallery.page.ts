import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { BenchmarkBoardComponent } from '../../ui/benchmark-board.component';
import { ButtonComponent } from '../../ui/button.component';
import { DataTableComponent } from '../../ui/data-table.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { EmptyComponent } from '../../ui/empty.component';
import { FieldComponent } from '../../ui/field.component';
import { ICON_NAMES, IconComponent } from '../../ui/icon.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { NotificationService } from '../notifications/notification.service';
import { PanelComponent } from '../../ui/panel.component';
import { PillComponent } from '../../ui/pill.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SelectComponent } from '../../ui/select.component';
import { SheetComponent } from '../../ui/sheet.component';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { SwitchComponent } from '../../ui/switch.component';
import { DayTone, WeekCalendarComponent } from '../../ui/week-calendar.component';
import { WordmarkComponent } from '../../ui/wordmark.component';
import { ProofAdminMembersComponent } from './proof-admin-members.component';
import { ProofWodBoardComponent } from './proof-wod-board.component';

/**
 * Unlisted, unguarded route at `/app/dev/components` — where M13b's design language is proven
 * against the real app before M13c builds ~22 components against it. Real CSP, real self-hosted
 * fonts, real tokens, real Angular: a static mockup cannot catch a font 404 under the app's own
 * CSP, which is exactly what happened in M5.5.
 *
 * No API call, no guard: fabricated data only, reachable on a real device to check the fonts
 * actually load. Unlinked from the rest of the product. Deletion at launch is filed in
 * docs/BACKLOG.md. Task 10 adds a second proof; M13c grows this into the full gallery.
 */

/** Design law §11.1's seven states, in the order every ledger lists them. */
export const STATE_NAMES = ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error'] as const;
export type StateName = (typeof STATE_NAMES)[number];

/**
 * How a section discharges its obligation for one state.
 * - `rendered` — a labelled cell on this page shows it
 * - `hand`     — real but not capturable statically (hover, focus, active); check it by hand
 * - `na`       — the component cannot have it, and `why` says why
 */
export type Disposition = 'rendered' | 'hand' | 'na';

export interface StateEntry {
  state: StateName;
  how: Disposition;
  /** Required when `how` is 'na'. Rendered after an em dash; the completeness spec asserts it. */
  why?: string;
}

/** ponytail: dev gallery must never call the API (file doc above: "no API call ... fabricated
 *  data only") — bh-notification-bell's ngOnInit calls refreshUnread() unconditionally, so this
 *  page needs a stand-in that never touches HttpClient. */
export class GalleryNotificationService extends NotificationService {
  override refreshUnread(): void {}
}

/**
 * Dev-gallery only. bh-notification-bell's count comes from an injected, providedIn:'root'
 * NotificationService, so every instance on a page shares one signal — fine in the app (one bell
 * per shell), useless for showing zero/one/many/99+ side by side. A component-level provider
 * gives each demo cell its OWN GalleryNotificationService instance instead of reimplementing the
 * bell's markup.
 */
@Component({
  selector: 'bh-gallery-notification-bell',
  standalone: true,
  imports: [NotificationBellComponent],
  template: `<bh-notification-bell route="." [testId]="testId()" />`,
  providers: [{ provide: NotificationService, useClass: GalleryNotificationService }],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GalleryNotificationBellComponent implements OnInit {
  private svc = inject(NotificationService);
  count = input.required<number>();
  testId = input.required<string>();
  ngOnInit() { this.svc.unread.set(this.count()); }
}

@Component({
  selector: 'bh-dev-gallery',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    WordmarkComponent, ProofWodBoardComponent, ProofAdminMembersComponent,
    IconComponent, ButtonComponent, FieldComponent, SelectComponent,
    PanelComponent, AlertComponent, EmptyComponent, DataTableComponent,
    ShellHeaderComponent, DockComponent, SegmentedComponent, SwitchComponent, SearchBarComponent,
    AvatarComponent, PillComponent, WeekCalendarComponent, SheetComponent, AuthLayoutComponent,
    BenchmarkBoardComponent, GalleryNotificationBellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="gallery">
      <ng-template #ledger let-key>
        <ul class="ledger" [attr.data-ledger]="key">
          @for (e of ledgers[key]; track e.state) {
            <li [attr.data-state]="e.state" [attr.data-how]="e.how" [class]="'lg lg-' + e.how">
              <span class="lg-state">{{ e.state }}</span>
              <span class="lg-how">{{ e.how }}</span>
              @if (e.why) { <span class="lg-why">— {{ e.why }}</span> }
            </li>
          }
        </ul>
      </ng-template>
      <header class="gallery-head">
        <bh-wordmark variant="chrome" size="md" />
        <h1 class="t-h2" i18n="Dev gallery page heading">Design language proof</h1>
      </header>

      <!-- Twenty sections on one scroll. Without this the only way to reach a known component is
           browser-find, which needs you to already know its name — a workbench with no index is a
           filing cabinet with no labels on the drawers (impeccable critique, M13f). Rendered from
           the ledgers map, so a section added without a ledger cannot get a nav entry either: the
           Karma gate and this index fail together, never separately.
           Component names are identifiers, not prose — not i18n-marked, per this file's precedent. -->
      <nav class="gnav" aria-labelledby="gnav-label">
        <span class="gnav-label t-eyebrow" id="gnav-label" i18n="@@dev.gallery.nav.label">Jump to</span>
        @for (key of sectionKeys; track key) {
          <a class="gnav-link" [href]="'#' + key">{{ key }}</a>
        }
      </nav>
      <section>
        <h2 class="t-eyebrow" i18n="Section label above the WOD board proof">WOD board</h2>
        <div class="board-wrap">
          <bh-proof-wod-board />
        </div>
      </section>
      <section>
        <h2 class="t-eyebrow" i18n="Section label above the admin members proof">Admin members</h2>
        <bh-proof-admin-members />
      </section>

      <section class="gsec" id="icon" data-gallery="icon">
        <h2 class="t-h2" i18n="@@dev.gallery.icon.heading">Icon</h2>
        <p class="note" i18n="@@dev.gallery.icon.note">
          Always aria-hidden and paired with a text label elsewhere; every name in the set is
          rendered below to eyeball stroke consistency.
        </p>
        <div class="icongrid">
          <!-- Icon identifiers, not prose — not i18n-marked. -->
          @for (n of iconNames; track n) {
            <div class="iconcell">
              <bh-icon [name]="n" [size]="24" />
              <span class="iconname">{{ n }}</span>
            </div>
          }
        </div>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'icon' }" />
      </section>

      <section class="gsec" id="button" data-gallery="button">
        <h2 class="t-h2" i18n="@@dev.gallery.button.heading">Button</h2>

        <p class="gsub" i18n="@@dev.gallery.button.variant.primary">Primary</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="primary" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="primary" [disabled]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="primary" [loading]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>

        <p class="gsub" i18n="@@dev.gallery.button.variant.ghost">Ghost</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost" [disabled]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost" [loading]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.ariaDisabled">Aria-disabled</span>
            <bh-button variant="ghost" [ariaDisabled]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>

        <p class="gsub" i18n="@@dev.gallery.button.variant.ghostDanger">Ghost-danger</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost-danger" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost-danger" [disabled]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost-danger" [loading]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
        </div>

        <p class="gsub" i18n="@@dev.gallery.button.variant.solid">Solid</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="solid" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="solid" [disabled]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="solid" [loading]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.solid">
          Solid: a neutral --surface-2 fill for screens with no single primary action (account's four
          co-equal section saves) — reads as pressable without spending the zero-volt budget.
        </p>

        <p class="gsub" i18n="@@dev.gallery.button.variant.strong">Strong</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="strong" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="strong" [disabled]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="strong" [loading]="true" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell wide">
            <span class="stlabel" i18n="@@dev.gallery.button.strong.full">strong + lg + full</span>
            <bh-button class="full" variant="strong" size="lg" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.strong">
          Strong: a --bone fill with --on-bone ink, for THE one primary action on a screen that has
          no volt to spend. Volt means live / now / winning, and a plumbing screen's save is none of
          those — but solid is too quiet for a lone primary action: it sits one token step from the
          card behind it with only a hairline between, and read as an empty box on the announcements
          composer. At most one per screen; a second strong button is two primary actions. Hover and
          focus are checkable by hand only. The focus ring inverts to --focus-inv and sits inside the
          button, because --focus IS volt and volt on a near-white fill is barely there.
        </p>

        <p class="gsub" i18n="@@dev.gallery.button.variant.danger">Danger</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="danger" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="danger" [disabled]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="danger" [loading]="true" i18n="@@dev.gallery.button.sampleDangerLabel">Delete</bh-button>
          </div>
        </div>

        <p class="gsub" i18n="@@dev.gallery.button.variant.icon">Icon</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="icon" label="Settings" i18n-label="@@dev.gallery.button.iconLabel">
              <bh-icon name="settings" />
            </bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="icon" [disabled]="true" label="Settings" i18n-label="@@dev.gallery.button.iconLabel">
              <bh-icon name="settings" />
            </bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="icon" [loading]="true" label="Settings" i18n-label="@@dev.gallery.button.iconLabel">
              <bh-icon name="settings" />
            </bh-button>
          </div>
        </div>

        <p class="gsub" i18n="@@dev.gallery.button.size.heading">Size</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.md">md</span>
            <bh-button variant="primary" size="md" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.sm">sm</span>
            <bh-button variant="primary" size="sm" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.smGhost">sm ghost</span>
            <bh-button variant="ghost" size="sm" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.button.size.lg">lg</span>
            <bh-button variant="solid" size="lg" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
          <div class="cell wide">
            <span class="stlabel" i18n="@@dev.gallery.button.size.lgFull">lg + full</span>
            <bh-button class="full" variant="solid" size="lg" i18n="@@dev.gallery.button.sampleLabel">Save</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.size">
          md and sm keep the same min-height (--tap): sm narrows the horizontal padding only, so a
          small button is never a small tap target. 52 call sites use sm. lg is the exception and
          the only size that changes height (--tap-lg, 56px): it is a screen's single primary action
          on a phone, where 44px is the accessible minimum rather than the right size. It normally
          pairs with the full class, which makes the host fill its container's width.
        </p>

        <p class="gsub" i18n="@@dev.gallery.button.link.heading">As a link</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost" href="/app/dev/components" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost" href="/app/dev/components" [loading]="true" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost" href="/app/dev/components" [disabled]="true" i18n="@@dev.gallery.button.link.sample">Continue</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.link">
          With href set, bh-button renders a real anchor — routerLink or href on the host emits no
          href at all, losing ctrl/cmd-click and open-in-new-tab. An anchor cannot be natively
          disabled, so the loading and disabled cells withhold href entirely, which also drops them
          out of the tab order. Tab through this row to confirm only the first cell is reachable.
        </p>

        <p class="gsub" i18n="@@dev.gallery.button.route.heading">As an internal link</p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-button variant="ghost" route="/app/dev/components" i18n="@@dev.gallery.button.route.sample">Open</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.loading">Loading</span>
            <bh-button variant="ghost" route="/app/dev/components" [loading]="true" i18n="@@dev.gallery.button.route.sample">Open</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-button variant="ghost" route="/app/dev/components" [disabled]="true" i18n="@@dev.gallery.button.route.sample">Open</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.button.note.route">
          The route input is the INTERNAL counterpart of href: an anchor carrying routerLink, so navigation
          stays client-side where href would reload the whole app. It exists because without it a
          screen had to hand-roll an anchor and re-derive this button's border, radius and --tap in
          its own CSS — which about 25 of them did. Same inert rule as href: the loading and
          disabled cells drop the routerLink and leave the tab order.
        </p>

        <p class="note" i18n="@@dev.gallery.button.note.hoverActiveFocus">
          Hover, active and focus aren't shown statically — hover on ghost/icon climbs --surface to
          --surface-2 (primary/danger brighten via filter instead); click-and-hold on any variant
          translates it 1px; tab to it for the focus ring, a solid 2px outline that inverts to
          --focus-inv on the volt primary so the ring stays visible.
        </p>
        <p class="note" i18n="@@dev.gallery.button.note.ariaDisabled">
          Aria-disabled looks like Disabled but isn't it — it sets aria-disabled instead of the
          native disabled attribute, so the control the user just pressed stays in the accessibility
          tree and keeps focus, rather than dropping it to &lt;body&gt;. For a row action whose own
          click has to guard against a double-fire while pending (account sessions' per-row sign-out).
        </p>
        <p class="note" i18n="@@dev.gallery.button.note.ghostDanger">
          Ghost-danger is its own variant, not a ghost plus a flag — the flag was only ever valid
          on one variant, so most variant/flag pairs emitted a class with no rule behind it and
          rendered nothing. For the control that OPENS a destructive flow (account danger zone's
          "Delete my account"), escalating against the filled variant="danger" control that
          EXECUTES it.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'button' }" />
      </section>

      <section class="gsec" id="field" data-gallery="field">
        <h2 class="t-h2" i18n="@@dev.gallery.field.heading">Field</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-field label="Box name" i18n-label="@@dev.gallery.field.label"
                      placeholder="CrossFit Riverside" i18n-placeholder="@@dev.gallery.field.placeholder" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.filled">Filled</span>
            <bh-field label="Box name" i18n-label="@@dev.gallery.field.label" value="CrossFit Riverside" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.error">Error</span>
            <bh-field label="Box name" i18n-label="@@dev.gallery.field.label"
                      error="Required" i18n-error="@@dev.gallery.field.errorSample" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-field label="Box name" i18n-label="@@dev.gallery.field.label" value="CrossFit Riverside" [disabled]="true" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.field.state.withAction">With label action</span>
            <bh-field label="PASSWORD" i18n-label="@@dev.gallery.field.passwordLabel">
              <a labelAction href="#" i18n="@@dev.gallery.field.actionLabel">Forgot?</a>
            </bh-field>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.field.note.hoverFocus">
          Hover and focus aren't shown statically — hover on an enabled field lightens the border to
          --faint; tab to it for the same 2px outline, border turns --volt while focused.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'field' }" />
      </section>

      <section class="gsec" id="select" data-gallery="select">
        <h2 class="t-h2" i18n="@@dev.gallery.select.heading">Select</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-select label="Plan" i18n-label="@@dev.gallery.select.label">
              <!-- Sample plan names: fabricated data, not prose — not i18n-marked. -->
              <option value="found">Foundations</option>
              <option value="unl">Unlimited</option>
              <option value="drop">Drop-in</option>
            </bh-select>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.filled">Filled</span>
            <bh-select label="Plan" i18n-label="@@dev.gallery.select.label" value="unl">
              <option value="found">Foundations</option>
              <option value="unl">Unlimited</option>
              <option value="drop">Drop-in</option>
            </bh-select>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.error">Error</span>
            <bh-select label="Plan" i18n-label="@@dev.gallery.select.label"
                       error="Required" i18n-error="@@dev.gallery.select.errorSample">
              <option value="found">Foundations</option>
              <option value="unl">Unlimited</option>
              <option value="drop">Drop-in</option>
            </bh-select>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-select label="Plan" i18n-label="@@dev.gallery.select.label" value="unl" [disabled]="true">
              <option value="found">Foundations</option>
              <option value="unl">Unlimited</option>
              <option value="drop">Drop-in</option>
            </bh-select>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.select.note.hoverFocus">
          Hover and focus aren't shown statically — same border/outline behaviour as the field above.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'select' }" />
      </section>

      <section class="gsec" id="panel" data-gallery="panel">
        <h2 class="t-h2" i18n="@@dev.gallery.panel.heading">Panel</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.panel.variant.padded">Padded (default)</span>
            <bh-panel class="demo-w220">
              <p class="t-body demo-flush" i18n="@@dev.gallery.panel.sampleBody">Panel content</p>
            </bh-panel>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.panel.variant.unpadded">Unpadded</span>
            <bh-panel [padded]="false" class="demo-w220">
              <p class="t-body demo-flush-pad" i18n="@@dev.gallery.panel.sampleBody">Panel content</p>
            </bh-panel>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.panel.note.noStates">
          bh-panel is a static card — background + hairline border, no shadow per law §5. Only the
          padded/unpadded layout variant shown above.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'panel' }" />
      </section>

      <section class="gsec" id="alert" data-gallery="alert">
        <h2 class="t-h2" i18n="@@dev.gallery.alert.heading">Alert</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.alert.tone.danger">Danger</span>
            <bh-alert tone="danger" i18n="@@dev.gallery.alert.sample.danger">Something went wrong saving this change.</bh-alert>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.alert.tone.warn">Warn</span>
            <bh-alert tone="warn" i18n="@@dev.gallery.alert.sample.warn">This plan expires in three days.</bh-alert>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.alert.tone.good">Good</span>
            <bh-alert tone="good" i18n="@@dev.gallery.alert.sample.good">Changes saved.</bh-alert>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.alert.tone.info">Info</span>
            <bh-alert tone="info" i18n="@@dev.gallery.alert.sample.info">Check your inbox to confirm your email.</bh-alert>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.alert.note.noStates">
          bh-alert is a standing message, not an interactive control. Tone is the axis that varies;
          role switches between alert and status by tone so a failed save interrupts and a quiet
          info line doesn't.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'alert' }" />
      </section>

      <section class="gsec" id="empty" data-gallery="empty">
        <h2 class="t-h2" i18n="@@dev.gallery.empty.heading">Empty</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.empty.variant.plain">Without action</span>
            <bh-empty icon="inbox" title="No members yet" i18n-title="@@dev.gallery.empty.title"
                      message="Invites will show up here once sent." i18n-message="@@dev.gallery.empty.message" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.empty.variant.withAction">With action</span>
            <bh-empty icon="inbox" title="No members yet" i18n-title="@@dev.gallery.empty.title"
                      message="Invites will show up here once sent." i18n-message="@@dev.gallery.empty.message">
              <bh-button variant="primary" size="sm" i18n="@@dev.gallery.empty.action">Send invite</bh-button>
            </bh-empty>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.empty.note.noStates">
          The projected action button (right) carries the button's own state contract, shown in
          full above.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'empty' }" />
      </section>

      <section class="gsec" id="data-table" data-gallery="data-table">
        <h2 class="t-h2" i18n="@@dev.gallery.dataTable.heading">Data table</h2>
        <bh-data-table caption="Members" i18n-caption="@@dev.gallery.dataTable.caption">
          <thead>
            <tr>
              <th class="t-eyebrow-tight" i18n="@@dev.gallery.dataTable.colMember">Member</th>
              <th class="t-eyebrow-tight" i18n="@@dev.gallery.dataTable.colEmail">Email</th>
              <th class="t-eyebrow-tight" i18n="@@dev.gallery.dataTable.colVisits">Visits</th>
            </tr>
          </thead>
          <!-- Member names, emails and visit counts: fabricated data, not prose — not i18n-marked. -->
          <tbody>
            <tr>
              <td><span class="mname">Priya Shah</span></td>
              <td><span class="memail">priya&#64;example.com</span></td>
              <td class="num">142</td>
            </tr>
            <tr>
              <td><span class="mname">Marcus Webb</span></td>
              <td><span class="memail">marcus&#64;example.com</span></td>
              <td class="num">57</td>
            </tr>
            <tr>
              <td><span class="mname">Aiko Tanaka</span></td>
              <td><span class="memail">aiko&#64;example.com</span></td>
              <td class="num">301</td>
            </tr>
          </tbody>
        </bh-data-table>
        <p class="note" i18n="@@dev.gallery.dataTable.note.cardMode">
          Data-label card mode ships deliberately unused — no screen has adopted it yet.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'data-table' }" />
      </section>

      <section class="gsec" id="sheet" data-gallery="sheet">
        <h2 class="t-h2" i18n="@@dev.gallery.sheet.heading">Sheet</h2>
        <p class="note" i18n="@@dev.gallery.sheet.note.interactiveOnly">
          Interactive-only — bh-sheet mounts a native &lt;dialog&gt;, so it cannot render statically;
          open it below to check the rise animation, backdrop and Esc-dismiss, and focus containment
          by hand.
        </p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.sheet.trigger.plain">Plain</span>
            <bh-button variant="primary" size="sm" (click)="sheetOpen.set(true)"
                       i18n="@@dev.gallery.sheet.openLabel">Open sheet</bh-button>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.sheet.trigger.confirmClose">Confirm-close</span>
            <bh-button variant="primary" size="sm" (click)="sheetConfirmOpen.set(true)"
                       i18n="@@dev.gallery.sheet.openConfirmLabel">Open sheet (confirm close)</bh-button>
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.sheet.note.confirmClose">
          The confirm-close sheet guards Esc and a backdrop click with a "Discard your entry?" bar
          instead of closing outright — try Esc or clicking outside it to see the guard.
        </p>

        <bh-sheet [open]="sheetOpen()" title="Demo sheet" i18n-title="@@dev.gallery.sheet.title"
                  label="Demo sheet" i18n-label="@@dev.gallery.sheet.label"
                  (closed)="sheetOpen.set(false)">
          <p class="t-body" i18n="@@dev.gallery.sheet.body">
            This sheet has no confirm-close guard — Esc or a backdrop click dismisses it right away.
          </p>
        </bh-sheet>

        <bh-sheet [open]="sheetConfirmOpen()" [confirmClose]="true" title="Demo sheet"
                  i18n-title="@@dev.gallery.sheet.title" label="Demo sheet" i18n-label="@@dev.gallery.sheet.label"
                  (closed)="sheetConfirmOpen.set(false)">
          <p class="t-body" i18n="@@dev.gallery.sheet.bodyConfirm">
            This sheet has the confirm-close guard — try to dismiss it with Esc or a backdrop click.
          </p>
        </bh-sheet>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'sheet' }" />
      </section>

      <section class="gsec" id="shell-header" data-gallery="shell-header">
        <h2 class="t-h2" i18n="@@dev.gallery.shellHeader.heading">Shell header</h2>
        <p class="note" i18n="@@dev.gallery.shellHeader.note">
          The top bar shared by all three shells — brand mark, box name, an optional mono area
          eyebrow, and a nav slot plus an actions slot.
        </p>
        <div class="shellwrap">
          <bh-shell-header boxName="Demo Box" area="Coach">
            <!-- Sample nav item: not a real route, not i18n-marked. -->
            <nav nav aria-label="Coach"><a href="#" class="demo-navlink">Classes</a></nav>
            <bh-button actions variant="icon" label="Log out" i18n-label="@@dev.gallery.shellHeader.logoutLabel">
              <bh-icon name="log-out" />
            </bh-button>
          </bh-shell-header>
        </div>
        <div class="shellwrap">
          <bh-shell-header [customBrand]="true" area="Admin">
            <!-- The host's own brand block. In the product this slot holds the box switcher,
                 which injects AuthService and therefore cannot live in app/ui/. -->
            <button brand class="demo-brandbtn" type="button">
              <span class="demo-brandmark" aria-hidden="true">C</span>
              <span i18n="@@dev.gallery.shellHeader.customBrand">CrossFit Oslo</span>
            </button>
          </bh-shell-header>
        </div>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'shell-header' }" />
      </section>

      <section class="gsec" id="dock" data-gallery="dock">
        <h2 class="t-h2" i18n="@@dev.gallery.dock.heading">Dock</h2>
        <p class="note" i18n="@@dev.gallery.dock.note">
          Floating pill mobile nav, absorbed from the global .bh-dock rules. Hidden by design above
          719px (law: the dock is mobile-only chrome) — this section can't show it live at desktop
          width, so shrink the viewport below 719px to see the pill; every item pairs an icon with a
          text label, never a glyph alone. The highlighted "active" item marks the current route, not
          a momentary press — the dock has no separate pressed state.
        </p>
        <div class="dockwrap">
          <bh-dock [tabs]="dockSample" label="Athlete" />
        </div>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'dock' }" />
      </section>

      <section class="gsec" id="segmented" data-gallery="segmented">
        <h2 class="t-h2" i18n="@@dev.gallery.segmented.heading">Segmented</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.segmented.state.rx">RX selected</span>
            <bh-segmented [options]="segOptions" value="rx" label="Division" i18n-label="@@dev.gallery.segmented.label" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.segmented.state.sc">Scaled selected</span>
            <bh-segmented [options]="segOptions" value="sc" label="Division" i18n-label="@@dev.gallery.segmented.label" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.segmented.note">
          Hover and focus aren't shown statically — hover on an unselected segment lightens its text
          to --bone; tab to the group for a solid 2px ring that inverts to --focus-inv on the
          volt-filled selected segment. The group is one tab stop; arrow keys move the selection
          within it, and selection follows focus.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'segmented' }" />
      </section>

      <section class="gsec" id="switch" data-gallery="switch">
        <h2 class="t-h2" i18n="@@dev.gallery.switch.heading">Switch</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-switch label="Private" i18n-label="@@dev.gallery.switch.label"
                       hint="off the leaderboard" i18n-hint="@@dev.gallery.switch.hint" class="demo-w220" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.switch.state.on">On</span>
            <bh-switch [checked]="true" label="Private" i18n-label="@@dev.gallery.switch.label"
                       hint="off the leaderboard" i18n-hint="@@dev.gallery.switch.hint" class="demo-w220" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.disabled">Disabled</span>
            <bh-switch [disabled]="true" label="Private" i18n-label="@@dev.gallery.switch.label"
                       hint="off the leaderboard" i18n-hint="@@dev.gallery.switch.hint" class="demo-w220" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.switch.note.hoverFocus">
          Tab to it for a solid 2px --focus ring against the sheet surface — it stays --focus rather
          than inverting, since the ring sits on the button, not the volt track.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'switch' }" />
      </section>

      <section class="gsec" id="notification-bell" data-gallery="notification-bell">
        <h2 class="t-h2" i18n="@@dev.gallery.notificationBell.heading">Notification bell</h2>
        <p class="note" i18n="@@dev.gallery.notificationBell.note">
          The header bell, sibling of the messages envelope beside it in every shell — same badge
          styling, same 60s poll, its own count. Rendered here against a stand-in service so this
          page never calls the API; the ledger below marks disabled, loading and error
          not-applicable, because it is a link whose only variable is a number.
        </p>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.notificationBell.state.zero">Zero (no badge)</span>
            <bh-gallery-notification-bell [count]="0" testId="dev-notification-bell-zero" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.notificationBell.state.one">One</span>
            <bh-gallery-notification-bell [count]="1" testId="dev-notification-bell-one" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.notificationBell.state.many">Many</span>
            <bh-gallery-notification-bell [count]="5" testId="dev-notification-bell-many" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.notificationBell.state.capped">99+</span>
            <bh-gallery-notification-bell [count]="140" testId="dev-notification-bell-capped" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.notificationBell.note.focus">
          Tab to it for a solid 2px --focus ring, inherited from shell-header's shared .acts a
          rule — it has no focus styling of its own. No disabled, loading or empty state either:
          it is always interactive when rendered, fetches nothing that this page can show pending,
          and a failed refresh silently keeps the last known count.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'notification-bell' }" />
      </section>

      <section class="gsec" id="search-bar" data-gallery="search-bar">
        <h2 class="t-h2" i18n="@@dev.gallery.searchBar.heading">Search bar</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.default">Default</span>
            <bh-search-bar label="Search members" i18n-label="@@dev.gallery.searchBar.label"
                           placeholder="Search…" i18n-placeholder="@@dev.gallery.searchBar.placeholder" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.filled">Filled</span>
            <!-- Sample name: fabricated data, not prose — not i18n-marked. -->
            <bh-search-bar label="Search members" i18n-label="@@dev.gallery.searchBar.label"
                           placeholder="Search…" value="Priya" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.searchBar.note">
          Debounces its search output at 250ms — the bound value updates on every keystroke so the
          field never lags, only the emitted search term is delayed and deduped, and an unchanged
          term is never re-emitted. The focus ring lives on the pill, not the inner input, so the
          control reads as one thing.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'search-bar' }" />
      </section>

      <section class="gsec" id="avatar" data-gallery="avatar">
        <h2 class="t-h2" i18n="@@dev.gallery.avatar.heading">Avatar</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.avatar.size.sm">Sm</span>
            <!-- Sample name: fabricated data, not prose — not i18n-marked. -->
            <bh-avatar [path]="null" name="Ada Lovelace" size="sm" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.avatar.size.md">Md</span>
            <bh-avatar [path]="null" name="Grace Hopper" size="md" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.avatar.size.lg">Lg</span>
            <bh-avatar [path]="null" name="Katherine Johnson" size="lg" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.avatar.size.xl">Xl</span>
            <bh-avatar [path]="null" name="Margaret Hamilton" size="xl" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.state.error">Error</span>
            <!-- Sample name and path: fabricated data, not prose — not i18n-marked. A 404 on this
                 path is what actually exercises the (error) handler, not just [path]="null". -->
            <bh-avatar path="/dev-gallery-broken-avatar.jpg" name="Broken Path" size="md" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.avatar.note">
          Initials fallback shown by default — no path is loadable in the size cells above. The
          Error cell demonstrates the same fallback triggered live by a broken image path via the
          (error) handler. The initials glyph is sized in container-query units off the circle's
          own width (42/38/34cqi across sm/md/lg-xl), not from the type scale: a plain percentage
          would resolve against the inherited font-size rather than the box, and a small monogram
          needs a proportionally larger glyph to stay legible.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'avatar' }" />
      </section>

      <section class="gsec" id="pill" data-gallery="pill">
        <h2 class="t-h2" i18n="@@dev.gallery.pill.heading">Pill</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.pill.tone.active">Active</span>
            <bh-pill tone="active" label="Active" i18n-label="@@dev.gallery.pill.sample.active" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.pill.tone.suspended">Suspended</span>
            <bh-pill tone="suspended" label="Suspended" i18n-label="@@dev.gallery.pill.sample.suspended" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.pill.tone.warn">Warn</span>
            <bh-pill tone="warn" label="Expiring" i18n-label="@@dev.gallery.pill.sample.warn" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.pill.tone.danger">Danger</span>
            <bh-pill tone="danger" label="Cancelled" i18n-label="@@dev.gallery.pill.sample.danger" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.pill.tone.live">Live</span>
            <bh-pill tone="live" label="Live now" i18n-label="@@dev.gallery.pill.sample.live" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.pill.note">
          Live is the only tone that fills volt — it means the class running right now, nothing
          else. Danger fills the chip per law §3.1; the pulsing dot on live rests under reduced
          motion instead of animating.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'pill' }" />
      </section>

      <section class="gsec" id="week-calendar" data-gallery="week-calendar">
        <h2 class="t-h2" i18n="@@dev.gallery.weekCalendar.heading">Week calendar</h2>
        <bh-week-calendar [tones]="galleryTones()" />
        <!-- A SECOND instance, bounded tight, so the disabled state is on this page EVERY day.
             The one above only shows disabled cells when today is not a Monday: on a Monday the
             whole calendar week is in range and nothing dims, which would make the ledger's
             "disabled: rendered" claim true six days in seven. A ledger that is conditionally
             true is the omission it exists to prevent. -->
        <bh-week-calendar [max]="2" />
        <p class="note" i18n="@@dev.gallery.weekCalendar.note">
          Offset is a model — two-way bound by the athlete book page, the coach classes page and
          the admin schedule page. Chevrons page a week and disable at the [0, max] bounds; a swipe
          pages a day; tapping a day jumps to it. Dots carry availability by SHAPE, not hue —
          filled is open, a hollow ring is full, a flat tick is no classes — and each day's
          aria-label states it in words, so the strip works with no dot visible at all. Days
          outside [0, max] render dimmed and are not selectable — the second strip is bounded to
          max=2 so that disabled state is visible here on any day of the week, not only when today
          falls mid-week.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'week-calendar' }" />
      </section>

      <section class="gsec" id="wordmark" data-gallery="wordmark">
        <h2 class="t-h2" i18n="@@dev.gallery.wordmark.heading">Wordmark</h2>
        <div class="row">
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.wordmark.variant.chrome">Chrome</span>
            <bh-wordmark variant="chrome" size="md" />
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.wordmark.variant.hero">Hero</span>
            <bh-wordmark variant="hero" size="md" />
          </div>
        </div>
        <p class="note" i18n="@@dev.gallery.wordmark.note">
          Chrome is monochrome bone — app shells never compete with the screen's own volt element.
          Hero fills volt behind "ed" and is reserved for login, mail, the landing site and the TV
          idle screen, where the logo itself is the subject.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'wordmark' }" />
      </section>

      <section class="gsec" id="auth-layout" data-gallery="auth-layout">
        <h2 class="t-h2" i18n="@@dev.gallery.authLayout.heading">Auth layout</h2>
        <p class="note" i18n="@@dev.gallery.authLayout.note.noStates">
          A frame, not a control — bh-auth-layout defers all interactive state to the projected
          form's fields and buttons, shown in their own sections above. Variant is assigned per
          screen and never per state.
        </p>

        <p class="gsub" i18n="@@dev.gallery.authLayout.variant.split">Split</p>
        <div class="authwrap">
          <bh-auth-layout variant="split">
            <div panel>
              <p class="t-eyebrow" i18n="@@dev.gallery.authLayout.split.eyebrow">Welcome back</p>
              <h1 class="t-h2" i18n="@@dev.gallery.authLayout.split.headline">Log in to your box.</h1>
            </div>
            <bh-field label="Email" i18n-label="@@dev.gallery.authLayout.split.emailLabel" />
            <bh-button variant="primary" i18n="@@dev.gallery.authLayout.split.cta">Log in</bh-button>
          </bh-auth-layout>
        </div>

        <p class="gsub" i18n="@@dev.gallery.authLayout.variant.narrow">Narrow</p>
        <div class="authwrap">
          <bh-auth-layout variant="narrow">
            <div panel>
              <h1 class="t-h2" i18n="@@dev.gallery.authLayout.narrow.headline">Check your email.</h1>
            </div>
            <p class="t-body" i18n="@@dev.gallery.authLayout.narrow.body">
              We sent a confirmation link to your inbox.
            </p>
          </bh-auth-layout>
        </div>

        <p class="note" i18n="@@dev.gallery.authLayout.note.viewport">
          Split only shows its side-by-side panel above 720px — shrink the viewport below that to
          see it collapse to the same stacked, centred column narrow uses at every width, with the
          panel content moving above the form.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'auth-layout' }" />
      </section>

      <section class="gsec" id="benchmark-board" data-gallery="benchmark-board">
        <h2 class="t-h2" i18n="@@dev.gallery.benchmarkBoard.heading">Benchmark board</h2>
        <p class="note" i18n="@@dev.gallery.benchmarkBoard.note.noStates">
          Pure information, not a control. Two distinct seeded prescriptions are drawn at random on
          every mount; reload this page to see a different pair. Hides below 720px in the real auth
          screens (checked in the browser, not shown here).
        </p>
        <div class="benchwrap">
          <bh-benchmark-board testId="gallery-benchmark" />
        </div>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'benchmark-board' }" />
      </section>
    </div>
  `,
  styles: [`
    /* Wide enough for the admin members proof's sidebar + table; the WOD board keeps its own
       narrower rhythm via .board-wrap so widening this container doesn't stretch that hero. */
    .gallery { max-width: 1100px; margin: 0 auto; padding: var(--sp-6) var(--sp-4);
      display: flex; flex-direction: column; gap: var(--sp-6); }
    .gallery-head { display: flex; align-items: center; gap: var(--sp-4); }
    .gallery-head h1 { margin: 0; color: var(--bone); }
    .board-wrap { max-width: 640px; }

    /* Component sections (Task 11) — a scannable workbench, not a hero screen: a heading, a row of
       states per variant, a note where a state can't be shown by setting an input. */
    /* The index. Wraps rather than scrolls: at phone width a horizontally-scrolling nav hides
       most of its own targets, which defeats the point of having one. */
    .gnav { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-2) var(--sp-3);
      padding-bottom: var(--sp-4); border-bottom: 1px solid var(--hairline); }
    .gnav-label { color: var(--faint); margin-right: var(--sp-1); }
    .gnav-link { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      text-decoration: none; border-bottom: 1px solid transparent; }
    .gnav-link:hover { color: var(--bone); border-bottom-color: var(--hairline); }
    .gnav-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* Anchored sections must clear the top edge, or the heading lands flush against it. */
    .gsec { scroll-margin-top: var(--sp-4); }
    .gsec { display: flex; flex-direction: column; gap: var(--sp-3);
      padding-top: var(--sp-6); border-top: 1px solid var(--hairline); }
    .gsec h2 { margin: 0; color: var(--bone); }
    .gsub { margin: var(--sp-2) 0 0; font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .row { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-start; }
    .cell { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
    /* full stretches to its container, so it needs a container with a width to show anything. */
    .cell.wide { flex: 1 1 260px; align-items: stretch; }
    .stlabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--faint); }
    /* The state ledger: a uniform, machine-checkable declaration of all seven states per
       component, replacing per-section freeform prose. dev-gallery.page.spec.ts asserts that
       every section accounts for every state, so an omission fails the build instead of looking
       identical to a deliberate "this component cannot have it". */
    .ledger { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
      gap: var(--sp-1); }
    .lg { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .lg-state { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--faint); min-width: 9ch; }
    .lg-how { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    .lg-na .lg-how { color: var(--faint); }
    .lg-why { max-width: 52ch; }
    /* At phone width the reason wraps onto its own full-bleed line BETWEEN two state rows, so it
       reads as unattached prose and you cannot tell which state it belongs to — the ledger stops
       being a table and becomes a list of orphaned sentences. Found by eyeballing the regenerated
       phone baselines; desktop never shows it, because the reason fits inline there. Two columns
       below the dock breakpoint put the reason under its own disposition, indented past the state
       name, so a row stays visually one row however many lines it takes. */
    @media (max-width: 719px) {
      .lg { display: grid; grid-template-columns: 9ch 1fr; column-gap: var(--sp-2); row-gap: 0; }
      .lg-state { grid-column: 1; }
      .lg-how, .lg-why { grid-column: 2; }
    }
    .note { margin: 0; font-size: var(--fs-sm); color: var(--bone-dim); max-width: 60ch; }
    .icongrid { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
    .iconcell { display: flex; flex-direction: column; align-items: center; gap: var(--sp-1);
      width: 84px; color: var(--bone-dim); }
    .iconname { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--faint);
      text-align: center; word-break: break-word; }
    .shellwrap { border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden; }
    /* bh-auth-layout's .wrap is min-height:100vh by design (a real screen fills the viewport) — the
       border + overflow:hidden here is purely to frame the demo on this scrolling page; it plays
       no part in the component's own layout. */
    .authwrap { border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden; }
    /* Framed like the auth panel it actually sits in (bh-auth-layout's split panel is --surface,
       padding var(--sp-8)) so the board is checked against its real background, not bare --ground. */
    .benchwrap { max-width: 320px; padding: var(--sp-8); background: var(--surface);
      border: 1px solid var(--hairline); border-radius: var(--r-card); }
    /* Real shells project nav items sized to --tap; this demo anchor needs the same minimum so the
       gallery doesn't model an undersized tap target (impeccable finding). */
    .demo-navlink { display: inline-flex; align-items: center; min-height: var(--tap); }
    /* bh-dock is position:fixed, pinned to the real viewport bottom — without a containing block
       here it floats over the whole gallery page instead of staying inside this section (that's
       the defect e2e/tests/visual.spec.ts used to work around by ripping the dock out of the DOM
       before every screenshot). contain: paint makes this box the containing block for its fixed
       descendant and clips anything that would escape it — the fix belongs here, not in bh-dock,
       whose fixed positioning is correct product behaviour. Below the same 719px breakpoint
       bh-dock itself uses, the box needs real height or the now-contained pill gets clipped by that
       same contain: paint. The pill is 68px (56px .item min-height + 6px+6px .dock padding) and it
       sits at bottom: calc(var(--sp-3) + env(safe-area-inset-bottom)), i.e. 12px plus whatever the
       device reserves. 68 + 12 = 80; the shipped 96px carries 16px of headroom for that
       safe-area inset, which is 0 in a desktop browser and non-zero on a real phone — without it
       the pill would clip on exactly the devices this section exists to model. Left empty above
       719px, where .dock is display:none and there's nothing to contain. */
    .dockwrap { position: relative; min-height: var(--tap); contain: paint; }
    @media (max-width: 719px) {
      .dockwrap { min-height: 96px; }
    }

    /* Demo-only layout geometry (fixed widths, margin resets) that used to live in inline style=""
       attributes — blocked by the app's strict CSP (no unsafe-inline). Moved here as classes. */
    .demo-w220 { width: 220px; }
    .demo-flush { margin: 0; }
    .demo-flush-pad { margin: 0; padding: var(--sp-3); }

    .demo-brandbtn { display: flex; align-items: center; gap: 10px; background: none;
      border: 1px solid transparent; border-radius: var(--r-ctl); padding: 3px var(--sp-2) 3px 3px;
      min-height: var(--tap); cursor: pointer; font: inherit; color: var(--bone); }
    .demo-brandbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .demo-brandmark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center; font-family: var(--font-display);
      font-weight: 800; font-size: var(--fs-body); }
  `],
})
export class DevGalleryPage {
  protected readonly ledgers: Record<string, StateEntry[]> = {
    icon: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.hover:decorative and always aria-hidden — the control around it owns every interaction` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.focus:never focusable; it is never the interactive element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.active:never pressed directly` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.disabled:inherits currentColor, so the disabled host dims it` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.loading:renders a static path; it fetches nothing` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.icon.error:an unknown name is a build-time type error, not a runtime state` },
    ],
    'data-table': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.focus:rows are not focusable; any focusable control inside a cell owns its own ring` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.active:rows are not pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.disabled:presentational — it renders whatever rows it is given` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.loading:the screen owns the fetch and renders bh-empty or a spinner in its place` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.dataTable.error:the screen renders bh-alert beside it; a table does not own an error` },
    ],
    'shell-header': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.hover:renders no interactive element of its own — the projected brand, nav links and action buttons carry their own, shown in their own sections` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.focus:never focusable itself; the projected brand, nav links and action buttons carry their own focus ring` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.active:never pressed itself; the projected brand, nav links and action buttons carry their own` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.disabled:chrome is never disabled; it is present or it is not rendered` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.loading:renders synchronously from the already-resolved session` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.shellHeader.error:chrome has nothing to fail at; the routed screen renders its own error` },
    ],
    dock: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.hover:no hover treatment of its own — the current-route highlight and the focus ring are the tab's only feedback` },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'rendered' },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.disabled:a tab a role cannot reach is omitted, never shown disabled` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.loading:a static tab list; it fetches nothing` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.dock.error:navigation chrome has nothing to fail at` },
    ],
    'week-calendar': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'rendered' },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.weekCalendar.loading:it derives its own dates; the screen beside it owns the fetch and its spinner. Absent tones is a resting state, not a loading one` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.weekCalendar.error:a date cannot fail to be a date; the screen renders any fetch error` },
    ],
    'auth-layout': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.hover:a layout frame with no interactive surface of its own` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.focus:never focusable; the projected form owns focus` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.disabled:a frame is not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.loading:the projected screen renders its own pending state inside the panel` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.authLayout.error:the projected screen renders bh-alert inside the panel` },
    ],
    'benchmark-board': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.hover:a read-only board; nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.focus:contains no focusable element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.active:nothing is pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.disabled:presentational — it renders the rows it is given` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.loading:the screen owns the fetch` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.benchmarkBoard.error:the screen renders bh-alert beside it` },
    ],
    button: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'hand' },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'rendered' },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.button.error:a button does not own an error; the field or alert beside it renders it` },
    ],
    field: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.field.active:no :active rule of its own; a text field is typed into, not pressed` },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.field.loading:fetches nothing; the screen owns any pending state around it` },
      { state: 'error', how: 'rendered' },
    ],
    select: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.select.active:no :active rule of its own; a choice is picked, not pressed` },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.select.loading:fetches nothing; the screen owns any pending state around it` },
      { state: 'error', how: 'rendered' },
    ],
    panel: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.hover:a static card with no interactive surface of its own` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.focus:never focusable; whatever is projected inside it owns focus` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.disabled:a card is not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.loading:renders synchronously from whatever is projected into it` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.panel.error:a card has no error of its own; content projected inside it renders its own` },
    ],
    alert: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.hover:a message, not a control — nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.focus:not focusable; it is announced by role, not reached by tab` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.active:nothing is pressable` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.disabled:a message is shown or it is not rendered` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.alert.loading:renders synchronously from the text it is given` },
      { state: 'error', how: 'rendered' },
    ],
    empty: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.hover:a static placeholder — nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.focus:not focusable itself; a projected action button carries its own focus ring, shown in its own section` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.active:nothing is pressable itself` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.disabled:not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.loading:renders synchronously from the title and message it is given; the screen shows this in place of a spinner once loading is over` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.empty.error:a no-results state, not a failure; the screen renders bh-alert for an actual fetch error` },
    ],
    sheet: [
      { state: 'default', how: 'hand' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.sheet.hover:no hover treatment of its own` },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.sheet.active:no active-press styling of its own` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.sheet.disabled:a sheet is open or it is not rendered; it has no disabled state` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.sheet.loading:renders whatever content it is given; the projected screen owns any fetch` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.sheet.error:has no error of its own; content projected inside it renders its own error, shown in its own section` },
    ],
    segmented: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.segmented.active:no active-press styling of its own; the selected fill is the only feedback` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.segmented.disabled:no disabled input on this component; it is always interactive when rendered` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.segmented.loading:a static list of choices; it fetches nothing` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.segmented.error:a choice cannot be invalid; the surrounding form renders its own error` },
    ],
    switch: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.switch.hover:the button has no hover treatment of its own` },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.switch.active:no active-press styling of its own; the checked-state colour and knob position are the only feedback` },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.switch.loading:toggles synchronously; it does not fetch` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.switch.error:a boolean choice cannot be invalid; the surrounding form renders its own error` },
    ],
    'notification-bell': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.notificationBell.hover:inherits its hover colour from shell-header's shared .acts a rule; it has none of its own` },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.notificationBell.active:no active-press styling of its own; the badge count is the only feedback` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.notificationBell.disabled:a link, always reachable; it has no disabled state` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.notificationBell.loading:the badge reads an already-fetched count; it has no pending state of its own` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.notificationBell.error:a failed refresh silently keeps the last known count; the feed page renders its own error for an actual fetch failure` },
    ],
    'search-bar': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.searchBar.hover:no hover treatment of its own` },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.searchBar.active:no active-press styling of its own` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.searchBar.disabled:no disabled input on this component` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.searchBar.loading:debounces its own output only; the screen owns any fetch and its own loading state` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.searchBar.error:has no error of its own; the screen renders bh-empty for no results` },
    ],
    avatar: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.avatar.hover:a static image or badge; nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.avatar.focus:never focusable; it is not an interactive element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.avatar.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.avatar.disabled:not a control; it cannot be disabled` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.avatar.loading:loading="lazy" is a native image hint, not a visual pending state; nothing changes until the image resolves or errors` },
      { state: 'error', how: 'rendered' },
    ],
    pill: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.hover:a static badge; nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.focus:never focusable; it is not an interactive element` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.disabled:not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.loading:renders synchronously from the tone and label it is given` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.pill.error:tone is a status label, not an interaction error — danger marks a cancelled membership, not a failed action` },
    ],
    wordmark: [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.hover:static type — nothing in it responds to a pointer` },
      { state: 'focus', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.focus:never focusable` },
      { state: 'active', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.active:never pressed` },
      { state: 'disabled', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.disabled:not a control` },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.loading:renders synchronously from the variant and size it is given` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.wordmark.error:brand type has no error state` },
    ],
  };
  protected readonly iconNames = ICON_NAMES;
  /** Drives the jump-to index. Same keys as `ledgers`, so the index cannot drift from the sections. */
  protected readonly sectionKeys = Object.keys(this.ledgers);
  protected readonly segOptions: SegOption[] = [{ value: 'rx', label: 'RX' }, { value: 'sc', label: 'Scaled' }];
  // bh-sheet's `open` input is one-way (see sheet.component.ts JSDoc) — the component never clears
  // it, so this page must reset its own signal on (closed) or the sheet could never reopen.
  protected readonly sheetOpen = signal(false);
  protected readonly sheetConfirmOpen = signal(false);
  protected readonly dockSample: DockTab[] = [
    { link: '.', label: 'Home', icon: 'house' },
    { link: '.', label: 'Book', icon: 'calendar-plus' },
    { link: '.', label: 'WOD', icon: 'clipboard-list' },
  ];
  /** ponytail: fabricated, per this page's "no API call — fabricated data only" rule. Keyed off
   *  real dates so the strip renders all three tones whatever day the gallery is opened. */
  protected readonly galleryTones = computed<Record<string, DayTone>>(() => {
    const iso = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    return { [iso(0)]: 'open', [iso(1)]: 'open', [iso(2)]: 'full' };
  });
}

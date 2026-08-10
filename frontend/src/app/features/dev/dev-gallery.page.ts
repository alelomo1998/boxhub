import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AlertComponent } from '../../ui/alert.component';
import { AuthLayoutComponent } from '../../ui/auth-layout.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { DataTableComponent } from '../../ui/data-table.component';
import { DayPagerComponent } from '../../ui/day-pager.component';
import { DockComponent, DockTab } from '../../ui/dock.component';
import { EmptyComponent } from '../../ui/empty.component';
import { FieldComponent } from '../../ui/field.component';
import { ICON_NAMES, IconComponent } from '../../ui/icon.component';
import { PanelComponent } from '../../ui/panel.component';
import { PillComponent } from '../../ui/pill.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SelectComponent } from '../../ui/select.component';
import { SheetComponent } from '../../ui/sheet.component';
import { ShellHeaderComponent } from '../../ui/shell-header.component';
import { SwitchComponent } from '../../ui/switch.component';
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
@Component({
  selector: 'bh-dev-gallery',
  standalone: true,
  imports: [
    WordmarkComponent, ProofWodBoardComponent, ProofAdminMembersComponent,
    IconComponent, ButtonComponent, FieldComponent, SelectComponent,
    PanelComponent, AlertComponent, EmptyComponent, DataTableComponent,
    ShellHeaderComponent, DockComponent, SegmentedComponent, SwitchComponent, SearchBarComponent,
    AvatarComponent, PillComponent, DayPagerComponent, SheetComponent, AuthLayoutComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="gallery">
      <header class="gallery-head">
        <bh-wordmark variant="chrome" size="md" />
        <h1 class="t-h2" i18n="Dev gallery page heading">Design language proof</h1>
      </header>
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

      <section class="gsec" data-gallery="icon">
        <h2 class="t-h2" i18n="@@dev.gallery.icon.heading">Icon</h2>
        <p class="note" i18n="@@dev.gallery.icon.note">
          Always aria-hidden and paired with a text label elsewhere — bh-icon carries no state
          contract of its own; every name in the set is rendered below to eyeball stroke consistency.
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
      </section>

      <section class="gsec" data-gallery="button">
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
        </div>

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

        <p class="note" i18n="@@dev.gallery.button.note.hoverActiveFocus">
          Hover, active and focus aren't shown statically — hover on ghost/icon climbs --surface to
          --surface-2 (primary/danger brighten via filter instead); click-and-hold on any variant
          translates it 1px; tab to it for the focus ring, a solid 2px outline that inverts to
          --focus-inv on the volt primary so the ring stays visible.
        </p>
        <p class="note" i18n="@@dev.gallery.button.note.noError">
          No error state — a button doesn't own an error; the field or alert beside it renders it.
        </p>
      </section>

      <section class="gsec" data-gallery="field">
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
        </div>
        <p class="note" i18n="@@dev.gallery.field.note.hoverFocus">
          Hover and focus aren't shown statically — hover on an enabled field lightens the border to
          --faint; tab to it for the same 2px outline, border turns --volt while focused. No active
          or loading state of its own.
        </p>
      </section>

      <section class="gsec" data-gallery="select">
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
          No active or loading state of its own.
        </p>
      </section>

      <section class="gsec" data-gallery="panel">
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
          bh-panel has no state contract — it's a static card (background + hairline border, no shadow
          per law §5). No hover, focus, active, disabled, loading or error state; only the
          padded/unpadded layout variant shown above.
        </p>
      </section>

      <section class="gsec" data-gallery="alert">
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
          bh-alert is a standing message, not an interactive control — no hover, focus, active,
          disabled or loading state. Tone is the axis that varies, not the 7-state contract; role
          switches between alert and status by tone so a failed save interrupts and a quiet info
          line doesn't.
        </p>
      </section>

      <section class="gsec" data-gallery="empty">
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
          bh-empty has no state contract of its own — no hover, focus, active, disabled, loading or
          error. The projected action button (right) carries the button's own state contract, shown
          in full above.
        </p>
      </section>

      <section class="gsec" data-gallery="data-table">
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
        <p class="note" i18n="@@dev.gallery.dataTable.note.hover">
          Hover a row to check: background climbs to --surface. No focus, active, disabled or loading
          state of its own — data-label card mode ships deliberately unused, no screen has adopted it
          yet.
        </p>
      </section>

      <section class="gsec" data-gallery="sheet">
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
      </section>

      <section class="gsec" data-gallery="shell-header">
        <h2 class="t-h2" i18n="@@dev.gallery.shellHeader.heading">Shell header</h2>
        <p class="note" i18n="@@dev.gallery.shellHeader.note">
          The top bar shared by all three shells — brand mark, box name, an optional mono area
          eyebrow, and a nav slot plus an actions slot. No state contract of its own; the projected
          nav links and action buttons carry their own.
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
      </section>

      <section class="gsec" data-gallery="dock">
        <h2 class="t-h2" i18n="@@dev.gallery.dock.heading">Dock</h2>
        <p class="note" i18n="@@dev.gallery.dock.note">
          Floating pill mobile nav, absorbed from the global .bh-dock rules. Hidden by design above
          719px (law: the dock is mobile-only chrome) — this section can't show it live at desktop
          width, so shrink the viewport below 719px to see the pill; every item pairs an icon with a
          text label, never a glyph alone. No hover treatment of its own; tab to an item for the
          focus ring. The highlighted "active" item marks the current route, not a momentary press —
          the dock has no separate pressed state.
        </p>
        <div class="dockwrap">
          <bh-dock [tabs]="dockSample" label="Athlete" />
        </div>
      </section>

      <section class="gsec" data-gallery="segmented">
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
      </section>

      <section class="gsec" data-gallery="switch">
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
          Hover isn't shown statically — the button has no hover treatment of its own; tab to it for
          a solid 2px --focus ring against the sheet surface (it stays --focus rather than inverting,
          since the ring sits on the button, not the volt track).
        </p>
      </section>

      <section class="gsec" data-gallery="search-bar">
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
          term is never re-emitted. No hover, active, disabled or loading state of its own; the
          focus ring lives on the pill, not the inner input, so the control reads as one thing.
        </p>
      </section>

      <section class="gsec" data-gallery="avatar">
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
        </div>
        <p class="note" i18n="@@dev.gallery.avatar.note">
          Initials fallback shown here — no path is ever loadable in this fabricated data. A broken
          image path falls back to the same initials via the (error) handler. The initials glyph is
          sized as a ratio of the circle (36%), not a type-scale token — see Task 9.
        </p>
      </section>

      <section class="gsec" data-gallery="pill">
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
      </section>

      <section class="gsec" data-gallery="day-pager">
        <h2 class="t-h2" i18n="@@dev.gallery.dayPager.heading">Day pager</h2>
        <bh-day-pager />
        <p class="note" i18n="@@dev.gallery.dayPager.note">
          Offset is a model — two-way bound by the athlete book page and the coach classes page.
          Previous/Next arrows disable at the [0, max] bounds. Their aria-labels are marked for
          translation and are also asserted verbatim by e2e, which passes because the suite runs
          against the English source — a locale switch would need those selectors revisited.
        </p>
      </section>

      <section class="gsec" data-gallery="wordmark">
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
          idle screen, where the logo itself is the subject. Not interactive — no hover, focus,
          active, disabled, loading or error state of its own.
        </p>
      </section>

      <section class="gsec" data-gallery="auth-layout">
        <h2 class="t-h2" i18n="@@dev.gallery.authLayout.heading">Auth layout</h2>
        <p class="note" i18n="@@dev.gallery.authLayout.note.noStates">
          A frame, not a control — bh-auth-layout has no hover, focus, active, disabled, loading or
          error state of its own; those belong to the projected form's fields and buttons, shown in
          their own sections above. Variant is assigned per screen and never per state.
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
      </section>
    </div>
  `,
  styles: [`
    /* Wide enough for the admin members proof's sidebar + table; the WOD board keeps its own
       narrower rhythm via .board-wrap so widening this container doesn't stretch Task 9's hero. */
    .gallery { max-width: 1100px; margin: 0 auto; padding: var(--sp-6) var(--sp-4);
      display: flex; flex-direction: column; gap: var(--sp-6); }
    .gallery-head { display: flex; align-items: center; gap: var(--sp-4); }
    .gallery-head h1 { margin: 0; color: var(--bone); }
    .board-wrap { max-width: 640px; }

    /* Component sections (Task 11) — a scannable workbench, not a hero screen: a heading, a row of
       states per variant, a note where a state can't be shown by setting an input. */
    .gsec { display: flex; flex-direction: column; gap: var(--sp-3);
      padding-top: var(--sp-6); border-top: 1px solid var(--hairline); }
    .gsec h2 { margin: 0; color: var(--bone); }
    .gsub { margin: var(--sp-2) 0 0; font-family: var(--font-body); font-weight: 700;
      font-size: var(--fs-sm); color: var(--bone-dim); }
    .row { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-start; }
    .cell { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
    .stlabel { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--faint); }
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
       same contain: paint: 68px pill (56px item + 6px+6px padding) + 12px bottom gap. Left empty
       above 719px, where .dock is display:none and there's nothing to contain. */
    .dockwrap { position: relative; min-height: var(--tap); contain: paint; }
    @media (max-width: 719px) {
      .dockwrap { min-height: 96px; }
    }

    /* Demo-only layout geometry (fixed widths, margin resets) that used to live in inline style=""
       attributes — blocked by the app's strict CSP (no unsafe-inline). Moved here as classes. */
    .demo-w220 { width: 220px; }
    .demo-flush { margin: 0; }
    .demo-flush-pad { margin: 0; padding: var(--sp-3); }
  `],
})
export class DevGalleryPage {
  protected readonly iconNames = ICON_NAMES;
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
}

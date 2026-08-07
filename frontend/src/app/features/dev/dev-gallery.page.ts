import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AlertComponent } from '../../ui/alert.component';
import { ButtonComponent } from '../../ui/button.component';
import { DataTableComponent } from '../../ui/data-table.component';
import { EmptyComponent } from '../../ui/empty.component';
import { FieldComponent } from '../../ui/field.component';
import { ICON_NAMES, IconComponent } from '../../ui/icon.component';
import { PanelComponent } from '../../ui/panel.component';
import { SelectComponent } from '../../ui/select.component';
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
            <bh-panel style="width: 220px">
              <p class="t-body" style="margin: 0" i18n="@@dev.gallery.panel.sampleBody">Panel content</p>
            </bh-panel>
          </div>
          <div class="cell">
            <span class="stlabel" i18n="@@dev.gallery.panel.variant.unpadded">Unpadded</span>
            <bh-panel [padded]="false" style="width: 220px">
              <p class="t-body" style="margin: 0; padding: var(--sp-3)" i18n="@@dev.gallery.panel.sampleBody">Panel content</p>
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
  `],
})
export class DevGalleryPage {
  protected readonly iconNames = ICON_NAMES;
}

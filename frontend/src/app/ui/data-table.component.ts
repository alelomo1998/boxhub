import { Component, input } from '@angular/core';

/**
 * The product's table. Replaces the global .bh-table, which had 7 consumers and no way to become
 * anything else.
 *
 * Column headers can't carry a class — the component doesn't own consumer <th> elements — so the
 * `::ng-deep thead th` rule below duplicates .t-eyebrow-tight's properties directly instead: mono is
 * ~15% wider than Archivo, uppercase adds more, and German adds 20-35% on top, so 0.18em across six
 * headers is a horizontal scrollbar on the admin's primary screen. Law §6.3 weakens the eyebrow here
 * deliberately (0.06em, not 0.18em).
 *
 * CARD MODE is shipped and unused. A <td data-label="…"> becomes a labelled row on a phone instead
 * of a cell in a scroll-table — the BACKLOG's "admin tables on phone are scroll-tables, not cards".
 * No screen adopts it in M13c, because adding data-label to a screen's cells changes that screen's
 * phone layout, and M13c redesigns no screen. Each screen opts in during its own rebuild.
 */
@Component({
  selector: 'bh-data-table',
  standalone: true,
  template: `
    <div class="wrap">
      <table [attr.data-testid]="testId() || null">
        @if (caption()) { <caption>{{ caption() }}</caption> }
        <ng-content />
      </table>
    </div>`,
  styles: [`
    .wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; font-size: var(--fs-sm); }
    caption { text-align: left; font-family: var(--font-mono); font-size: var(--fs-meta);
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint);
      padding-bottom: var(--sp-2); }
    ::ng-deep thead th { text-align: left; padding: 9px 12px; font-family: var(--font-mono);
      font-size: var(--fs-meta); letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--faint); font-weight: 500; border-bottom: 2px solid var(--hairline);
      white-space: normal; }
    ::ng-deep tbody td { padding: 13px 12px; border-bottom: 1px solid var(--hairline); }
    ::ng-deep tbody tr:last-child td { border-bottom: none; }
    /* Hover is a rung on the surface ladder (law §5), never volt. */
    ::ng-deep tbody tr:hover td { background: var(--surface); }
    /* Pre-M13b, .mname was uppercase at a raw 17px. Dropped both deliberately: design law v3
       (frontend/src/styles/_fonts.scss) says names read better in mixed case and reserves uppercase
       for mono eyebrows only, and --fs-body replaces the raw px with the type scale. Real visual
       change on 4 cells: member name (members, rebuilt M15), box name (superadmin console, M18
       x2), session name (schedule, M14) — each screen picks this up again at its own rebuild. */
    ::ng-deep .mname { font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-body); letter-spacing: -0.005em; }
    ::ng-deep .memail { color: var(--faint); font-size: var(--fs-meta);
      font-family: var(--font-mono); }

    @media (max-width: 719px) {
      ::ng-deep tbody td[data-label] { display: flex; justify-content: space-between;
        gap: var(--sp-4); padding: 8px 12px; border-bottom: none; }
      ::ng-deep tbody td[data-label]::before { content: attr(data-label);
        font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--faint); }
      ::ng-deep tbody tr:has(td[data-label]) { display: block; border: 1px solid var(--hairline);
        border-radius: var(--r-card); margin-bottom: var(--sp-3); padding: var(--sp-2) 0; }
      ::ng-deep thead:has(~ tbody td[data-label]) { display: none; }
    }
  `],
})
export class DataTableComponent { caption = input(''); testId = input(''); }

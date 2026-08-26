import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto, redirectForRole } from '../../core/auth/auth.models';
import { roleLabel, isReachable } from '../../core/auth/labels';
import { SheetComponent } from '../../ui/sheet.component';

/**
 * The box name in the shell header, turned into the control that moves you between gyms.
 *
 * A FEATURE component, not a ui/ one: it injects AuthService and Router, and app/ui/ stays
 * presentational. It is projected into bh-shell-header's [brand] slot, which exists for exactly
 * this. It also owns its own button, so its data-testid and aria attributes land on the real
 * element — an attribute on a component HOST does not reach the element inside it, which cost
 * M13c four fixes and blocked the form-control migration entirely.
 *
 * It renders even when the person holds one gym: All gyms is their only route to /gyms/join.
 *
 * Multi-tab staleness needs nothing here. M21 shipped it: the interceptor asserts X-Box-Id on
 * /api/box/** and re-mints once on a 409 STALE_BOX.
 */
@Component({
  selector: 'bh-box-switcher',
  standalone: true,
  imports: [SheetComponent, RouterLink],
  template: `
    <button type="button" class="switcher" (click)="open.set(true)"
            data-testid="box-switcher"
            [attr.aria-label]="switchLabel()" aria-haspopup="dialog">
      <span class="mark" aria-hidden="true">{{ initial() }}</span>
      <span class="bn">{{ activeName() }}</span>
      <!-- Literal glyph, not &#-notation: the numeric entity for this triangle is 9662, and
           the raw-hex gate (design-system 8.1) reads that as a colour and goes red. -->
      <span class="chev" aria-hidden="true">▾</span>
    </button>

    <bh-sheet [open]="open()" title="Switch gym" i18n-title="@@switcher.title"
              label="Switch gym" i18n-label="@@switcher.label" (closed)="open.set(false)">
      @if (open()) {
        <div class="rows">
          @for (m of others(); track m.boxId) {
            <button type="button" class="row" (click)="switchTo(m)"
                    [attr.data-testid]="'switch-to-' + m.boxSlug">
              <span class="rmark" aria-hidden="true">{{ letter(m) }}</span>
              <span class="meta">
                <span class="rname">{{ m.boxName }}</span>
                <span class="rrole">{{ label(m) }}</span>
              </span>
              <span class="go" aria-hidden="true">&rsaquo;</span>
            </button>
          }
        </div>
        <a class="allgyms" routerLink="/gyms" (click)="open.set(false)"
           data-testid="switcher-all-gyms">
          <span i18n="@@switcher.allGyms">All gyms</span>
          <span class="go" aria-hidden="true">&rsaquo;</span>
        </a>
      }
    </bh-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .switcher { display: flex; align-items: center; gap: 10px; min-width: 0;
      background: none; border: 1px solid transparent; border-radius: var(--r-ctl);
      padding: 3px var(--sp-2) 3px 3px; margin-left: -3px; min-height: var(--tap);
      cursor: pointer; font: inherit; color: inherit; }
    .switcher:hover { border-color: var(--hairline); background: var(--surface); }
    .switcher:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* The one volt element in the chrome, unchanged in meaning: it marks the gym you are in NOW.
       The chevron is not volt — a second accent here would make the accent decorative. */
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center; flex-shrink: 0;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body); }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .chev { color: var(--faint); font-size: var(--fs-meta); flex-shrink: 0; }

    .rows { display: flex; flex-direction: column; gap: var(--sp-2); }
    .row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; text-align: left;
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: var(--sp-3); cursor: pointer; font: inherit; color: inherit; }
    .row:hover { border-color: var(--bone-dim); }
    .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .rmark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--surface);
      color: var(--bone-dim); border: 1px solid var(--hairline); display: grid; place-items: center;
      flex-shrink: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body); }
    .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .rname { font-family: var(--font-display); font-weight: 800; text-transform: uppercase;
      font-size: var(--fs-body); color: var(--bone); overflow-wrap: anywhere; }
    .rrole { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--bone-dim); }
    .go { color: var(--faint); flex-shrink: 0; }

    .allgyms { display: flex; align-items: center; justify-content: space-between;
      min-height: var(--tap); margin-top: var(--sp-3); padding: 0 var(--sp-2);
      border-top: 1px solid var(--hairline); color: var(--bone); text-decoration: none; }
    .allgyms:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `],
})
export class BoxSwitcherComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  open = signal(false);
  private switching = signal(false);

  activeName = computed(() => this.auth.activeBox()?.boxName ?? '');
  initial = computed(() => this.activeName().trim().charAt(0).toUpperCase());
  switchLabel = computed(() =>
    $localize`:@@switcher.control.label:Switch gym — currently ${this.activeName()}:gym:`);

  /** Every OTHER gym you can actually open. An unreachable gym is not offered at all: the mint
   *  would 403 it, and a row that only ever fails is worse than no row. */
  others = computed(() => {
    const activeId = this.auth.activeBox()?.boxId;
    return this.auth.memberships().filter(m => m.boxId !== activeId && isReachable(m.boxStatus));
  });

  letter(m: MembershipDto): string { return (m.boxName || '').trim().charAt(0).toUpperCase(); }
  label(m: MembershipDto): string { return roleLabel(m.role); }

  switchTo(m: MembershipDto): void {
    // Guard in the handler, never a [disabled] attribute — a native disabled drops the pressed
    // control out of the a11y tree and sends focus to <body>.
    if (this.switching()) return;
    this.switching.set(true);
    this.auth.selectBox(m.boxId).subscribe({
      next: () => {
        this.switching.set(false);
        this.open.set(false);
        // The role in the TARGET gym. Roles differ per gym; the page you are on may not exist
        // for the role you hold over there.
        this.router.navigateByUrl(redirectForRole(m.role));
      },
      error: () => {
        this.switching.set(false);
        this.open.set(false);
      },
    });
  }
}

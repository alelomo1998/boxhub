import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto, redirectForRole } from '../../core/auth/auth.models';
import { roleLabel, boxStatusLabel, isReachable } from '../../core/auth/labels';
import { AlertComponent } from '../../ui/alert.component';

/**
 * The hub. One screen for zero gyms and for five — they are the same question asked of
 * different data, and splitting them is how the old box picker and a boxless empty state
 * would have drifted apart.
 *
 * Everything here comes from /api/me, which a boxless session may already read: Membership is
 * deliberately NOT a @TenantId entity. If you ever add a field to this screen, check the entity
 * first — since M21 a tenant-less read of a @TenantId table returns EMPTY rather than erroring,
 * and a test written under actAsBox stays green over it (docs/TENANCY.md §8.3).
 */
@Component({
  selector: 'bh-gyms',
  standalone: true,
  imports: [AlertComponent, RouterLink],
  template: `
    <h1 class="t-display title" i18n="@@gyms.heading">Your gyms</h1>

    @if (error()) {
      <bh-alert tone="danger" data-testid="gyms-error">{{ error() }}</bh-alert>
    }

    @if (auth.memberships().length === 0) {
      <div class="empty" data-testid="gyms-empty">
        <h2 class="t-h2 eh" i18n="@@gyms.empty.heading">No gyms yet</h2>
        <p class="ep" i18n="@@gyms.empty.body">
          Your gym sends you an invite link. Accept it and the gym shows up here.
        </p>
        <a class="cta" routerLink="/gyms/join" data-testid="gyms-empty-cta"
           i18n="@@gyms.empty.cta">How to join</a>
      </div>
    } @else {
      <div class="gyms">
        @for (m of auth.memberships(); track m.boxId) {
          @if (isReachable(m.boxStatus)) {
            <button class="gym" (click)="enter(m)"
                    [attr.aria-busy]="entering() === m.boxId"
                    [attr.aria-disabled]="entering() !== null ? 'true' : null"
                    [attr.data-testid]="'gym-' + m.boxSlug">
              <span class="mk" [class.mark]="isCurrent(m)" aria-hidden="true">{{ initial(m) }}</span>
              <span class="meta">
                <span class="gname">{{ m.boxName }}</span>
                <span class="grole">{{ label(m) }}</span>
              </span>
              @if (isCurrent(m)) {
                <span class="chip now" i18n="@@gyms.current">Current</span>
              } @else if (entering() === m.boxId) {
                <span class="chip now" i18n="@@gyms.opening">Opening…</span>
              } @else {
                <span class="go" aria-hidden="true">&rsaquo;</span>
              }
            </button>
          } @else {
            <!-- Not a button. An unreachable gym is not an action that fails; it is not an
                 action. A disabled button would still take focus order for nothing. -->
            <div class="gym off" [attr.data-testid]="'gym-' + m.boxSlug">
              <span class="mk muted" aria-hidden="true">{{ initial(m) }}</span>
              <span class="meta">
                <span class="gname">{{ m.boxName }}</span>
                <span class="grole">{{ label(m) }}</span>
              </span>
              <span class="chip off-chip">{{ statusLabel(m) }}</span>
            </div>
          }
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .title { font-size: var(--fs-display); margin: 0 0 var(--sp-5); text-transform: uppercase;
      letter-spacing: -0.02em; }
    .gyms { display: flex; flex-direction: column; gap: var(--sp-2); max-width: 640px; }
    .gym { display: flex; align-items: center; gap: var(--sp-3); width: 100%; text-align: left;
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: var(--sp-3) var(--sp-4); cursor: pointer; font: inherit; color: inherit;
      transition: border-color .15s; }
    .gym:hover:not([aria-disabled]) { border-color: var(--bone-dim); }
    .gym[aria-disabled] { opacity: .6; cursor: not-allowed; }
    .gym:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .gym.off { background: var(--surface); cursor: default; }

    /* The gym you are in NOW carries the accent — the same volt mark bh-shell-header already
       uses for the same meaning. Every other gym gets the identical shape with no accent, so
       volt keeps meaning "now" instead of becoming a decorative avatar. */
    .mk { width: 30px; height: 30px; border-radius: var(--r-ctl); flex-shrink: 0;
      display: grid; place-items: center; font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-body); background: var(--surface); color: var(--bone-dim);
      border: 1px solid var(--hairline); }
    .mk.mark { background: var(--volt); color: var(--on-volt); border-color: var(--volt); }
    .mk.muted { color: var(--faint); }

    .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    /* min-width:0 + overflow-wrap: a long unbreakable gym name pushed the whole PAGE into
       horizontal scroll at 200% text on the old picker. Measured there; do not drop either. */
    .gname { min-width: 0; overflow-wrap: anywhere; font-family: var(--font-display);
      font-weight: 800; text-transform: uppercase; font-size: var(--fs-h2);
      letter-spacing: -0.01em; color: var(--bone); line-height: 1.15; }
    .gym.off .gname { color: var(--faint); }
    /* --bone-dim, not --faint: this sits on --surface-2, where --faint measures 4.27:1 and
       fails AA. The token's documented 5.1:1 is against --ground, and nothing here is. */
    .grole { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      color: var(--bone-dim); text-transform: uppercase; }
    /* --faint (4.70:1 on --surface), NOT --disabled (2.18:1). --disabled's AA exemption is for
       an inactive CONTROL's own label; this row is deliberately a div and not a control, and the
       role it names is real information about the member. Matches .gname's choice one rule up. */
    .gym.off .grole { color: var(--faint); }
    .go { color: var(--faint); font-size: var(--fs-h2); flex-shrink: 0; }

    /* --bone-dim, not --faint, for the same reason .grole above carries it: the chip on a
       reachable row sits on --surface-2, where --faint measures 4.27:1 and fails AA. This is
       live status text ("Current", "Opening…") at --fs-meta, so it is not large-text exempt.
       The off-row chip sits on --surface (4.70:1) and would have passed, but one colour for
       one component beats two that differ by which row they landed on. */
    .chip { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; padding: 3px var(--sp-2); border-radius: var(--r-full);
      border: 1px solid var(--hairline); color: var(--bone-dim); flex-shrink: 0; white-space: nowrap; }

    .empty { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column;
      align-items: flex-start; gap: var(--sp-3); max-width: 480px; }
    .eh { margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
    .ep { margin: 0; color: var(--bone-dim); font-size: var(--fs-sm); }
    .cta { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-5);
      border-radius: var(--r-ctl); background: var(--volt); color: var(--on-volt);
      font-weight: 700; text-decoration: none; }
    /* The ring INVERTS on a volt surface — a volt ring on a volt button is invisible. */
    .cta:focus-visible { outline: 2px solid var(--focus-inv); outline-offset: 2px; }
  `],
})
export class GymsPage {
  auth = inject(AuthService);
  private router = inject(Router);

  error = signal('');
  /** boxId in flight, or null. Per-row: a single global spinner leaves the user unable to tell
   *  which gym they picked, which scored a defect on the old picker. */
  entering = signal<string | null>(null);

  protected readonly isReachable = isReachable;

  initial(m: MembershipDto): string { return (m.boxName || '').trim().charAt(0).toUpperCase(); }
  label(m: MembershipDto): string { return roleLabel(m.role); }
  statusLabel(m: MembershipDto): string { return boxStatusLabel(m.boxStatus, m.role) ?? ''; }
  isCurrent(m: MembershipDto): boolean { return this.auth.activeBox()?.boxId === m.boxId; }

  enter(m: MembershipDto): void {
    // The guard is HERE, not on a [disabled] attribute: a native disabled drops the pressed
    // control out of the a11y tree and sends focus to <body>.
    if (this.entering()) return;
    if (!isReachable(m.boxStatus)) return;
    this.error.set('');
    this.entering.set(m.boxId);
    this.auth.selectBox(m.boxId).subscribe({
      next: () => {
        this.entering.set(null);
        // The role in the TARGET gym. Roles differ per gym — that is what M21 made real — so
        // "the same page in the new gym" is frequently a page this person cannot enter.
        this.router.navigateByUrl(redirectForRole(m.role));
      },
      // Status can change between page load and tap, so the mint can still 403 (M9). The row
      // being marked is the fast path, not the only guard.
      error: () => {
        this.entering.set(null);
        this.error.set($localize`:@@gyms.error.unavailable:This gym is unavailable — contact your gym for help.`);
      },
    });
  }
}

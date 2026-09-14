import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';

/**
 * The top bar, shared by all three shells. It owns the bar and the brand block only — NOT the page
 * layout, because there isn't a shared one: athlete and coach are flex columns, admin is a grid
 * with a side nav and a PENDING banner. One shell component would have fitted none of them.
 *
 * D23: sticky lives on the HOST, not the inner <header> — the inner element's containing block
 * was the host itself, exactly its own height, so `position: sticky` on it never had anywhere to
 * stick. Below 768px the host also slides away on scroll-down and returns on scroll-up, so the
 * header stays reachable without permanently eating viewport on a phone.
 */
@Component({
  selector: 'bh-shell-header',
  standalone: true,
  host: { '[class.hide]': 'hidden()', '(focusin)': 'onFocusIn()' },
  template: `
    <header class="top">
      <!-- ng-content inside a control-flow block is only INSTANTIATED when that branch renders,
           so this is safe precisely because customBrand is a per-shell constant and never
           toggles at runtime. If a consumer ever needs to flip it live, move the branch to a
           class binding on .brand instead of switching the projection on and off. -->
      @if (customBrand()) {
        <ng-content select="[brand]" />
      } @else {
        <div class="brand">
          <span class="mark" aria-hidden="true">{{ initial() }}</span>
          <span class="bn">{{ boxName() }}</span>
        </div>
      }
      @if (area()) { <span class="area">{{ area() }}</span> }
      <ng-content select="[nav]" />
      <div class="acts"><ng-content select="[actions]" /></div>
    </header>`,
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 20;
      transition: transform var(--dur) var(--ease-out); }
    :host(.hide) { transform: translateY(-100%); }
    @media (prefers-reduced-motion: reduce) { :host { transition: none; } }
    .top { display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-5); border-bottom: 1px solid var(--hairline);
      background: var(--ground); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    /* The one volt element in the chrome. It is the box's identity, not an accent — but law §2.3
       still budgets it, which is why the wordmark renders monochrome in app chrome (law §10.2). */
    .mark { width: 30px; height: 30px; border-radius: var(--r-ctl); background: var(--volt);
      color: var(--on-volt); display: grid; place-items: center;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      flex-shrink: 0; }
    .bn { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-body);
      text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .area { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .acts { display: flex; gap: 2px; margin-left: auto; flex-shrink: 0; }
    /* The projected brand (the box switcher) is a flex item exactly as .brand is, and needs the
       same permission to shrink: a flex item's default min-width:auto refuses to go below its
       content width, so the header overflowed at 320px once the bell joined .acts. The switcher's
       own button already carries min-width:0 and its name already ellipsizes; only the host —
       the actual flex item — was missing it. Projected content carries the CONSUMER's
       encapsulation attribute, so ::ng-deep is how this component already reaches .acts a. */
    ::ng-deep .top > [brand] { min-width: 0; }
    /* Projected action links (e.g. Security) render as a real <a> so RouterLink emits an href —
       it only does that on a/area hosts, never on bh-button. Projected content carries the
       consumer's encapsulation attribute, not this component's, so a scoped selector can't reach
       it; ::ng-deep scoped under .acts is how data-table.component.ts and dock.component.ts style
       their own projected content, and this matches that pattern. Must visually match the icon
       button beside it (Log out). */
    ::ng-deep .acts a { display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--tap); min-height: var(--tap); border-radius: var(--r-full);
      color: var(--faint); text-decoration: none; }
    ::ng-deep .acts a:hover { color: var(--bone); }
    ::ng-deep .acts a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `],
})
export class ShellHeaderComponent {
  /** Empty when the host projects its own brand — see customBrand. */
  boxName = input('');
  /** Rendered as a mono eyebrow beside the box name — "Coach", "Admin". Empty for athlete. */
  area = input('');
  /**
   * The host supplies the brand block itself, projected into [brand], and the default mark +
   * name is not rendered. Two consumers need this and they are the same need: the hub has no
   * box to name, and the three box shells put the SWITCHER there. An explicit input rather than
   * a contentChild query, because a boolean is greppable and a content query is not — and
   * because app/ui/ stays presentational, so the switcher (which injects AuthService and Router)
   * cannot live in here.
   */
  customBrand = input(false);

  /* The badge beside a box's name is the box's own initial. It used to be a hardcoded "B" for
     BoxHub, which survived the rename because a single letter does not look like a brand string —
     the same way the mail subject lines did. */
  initial = computed(() => (this.boxName() || '').trim().charAt(0).toUpperCase());

  /** D23: only ever true below 768px, and never while focus sits inside the header. */
  protected hidden = signal(false);

  private lastScrollY = 0;
  private phoneQuery: MediaQueryList | null = null;

  constructor() {
    if (typeof window === 'undefined') return; // guards Karma/SSR-less test envs
    const hostEl = inject(ElementRef<HTMLElement>).nativeElement;
    const destroyRef = inject(DestroyRef);

    const onScroll = () => {
      if (!this.phoneQuery?.matches) return;
      const y = window.scrollY;
      const headerH = hostEl.offsetHeight;
      if (y <= headerH) this.hidden.set(false);
      else if (y - this.lastScrollY > 8) this.hidden.set(true);
      else if (this.lastScrollY - y > 8) this.hidden.set(false);
      this.lastScrollY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    destroyRef.onDestroy(() => window.removeEventListener('scroll', onScroll));

    if (typeof window.matchMedia === 'function') {
      this.phoneQuery = window.matchMedia('(max-width: 767.98px)');
      const onChange = () => { if (!this.phoneQuery!.matches) this.hidden.set(false); };
      this.phoneQuery.addEventListener('change', onChange);
      destroyRef.onDestroy(() => this.phoneQuery?.removeEventListener('change', onChange));
    }
  }

  /** Tabbing (or a click handler moving focus) into a slid-away header must never strand focus
   *  somewhere invisible. */
  protected onFocusIn() { this.hidden.set(false); }
}

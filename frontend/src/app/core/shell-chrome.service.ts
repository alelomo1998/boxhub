import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Root-provided so a screen (the conversation composer) and the three shells share one flag
 *  without a parent/child input chain. */
@Injectable({ providedIn: 'root' })
export class ShellChromeService {
  /** Set by a screen that needs the whole viewport bottom (the conversation composer).
      The shells hide the dock and drop its reserved padding while this is true. */
  readonly dockHidden = signal(false);

  /** A screen that manages its own internal scrolling (the conversations screen) locks the shell
      to the viewport, so the document does not scroll and the screen's own regions do. */
  readonly viewportLocked = signal(false);

  /** The detail screen's dynamic `<h1>` text (M17a). Set by the screen once its data resolves — a
   *  class name is not known until the fetch resolves, so a route `title` resolver would stall
   *  navigation. Cleared automatically on every navigation that leaves a detail route, so a stale
   *  name can never leak onto the next screen even if a screen forgets to reset it on destroy. */
  readonly detailTitle = signal<string | null>(null);

  private readonly _detail = signal(false);
  private readonly _backTo = signal<string | null>(null);
  /** Whether the deepest activated route is a detail screen (route `data.detail`). Route-driven,
   *  not screen-set: a service flag a screen forgets to reset on destroy leaks into the next
   *  screen, a route-owned computation cannot. */
  readonly detail = this._detail.asReadonly();
  /** Where a detail screen's back control returns to (route `data.backTo`), null outside one. */
  readonly backTo = this._backTo.asReadonly();

  private router = inject(Router);

  constructor() {
    // A first load lands on the route before any NavigationEnd this service sees — read the
    // current routerState once here too, not only from the subscription below.
    this.readRoute();
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.readRoute());
  }

  private readRoute() {
    let snap: ActivatedRouteSnapshot = this.router.routerState.root.snapshot;
    while (snap.firstChild) snap = snap.firstChild;
    const isDetail = !!snap.data['detail'];
    this._detail.set(isDetail);
    this._backTo.set(isDetail ? (snap.data['backTo'] ?? null) : null);
    // Belt and braces: a class name from one detail screen must never survive into the next
    // screen, detail or not — the screen itself also clears this on ngOnDestroy.
    if (!isDetail) this.detailTitle.set(null);
  }
}

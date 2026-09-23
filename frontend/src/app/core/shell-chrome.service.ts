import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Walks a router state's root snapshot to the deepest activated child — the route whose own
 *  `data` actually applies (`data.detail`, `data.backTo`, ...). Exported so `app.config.ts`'s
 *  view-transition skip predicate (M17a Task 12b) reads the same route this service reads, rather
 *  than re-walking `firstChild` a second time. */
export function deepestRoute(snap: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  while (snap.firstChild) snap = snap.firstChild;
  return snap;
}

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

  /** The travelling title's `view-transition-name` suffix (M17a Task 12b) — the session id the
   *  detail screen is showing. Set by the screen alongside `detailTitle`, for the same reason
   *  (not known until the fetch resolves) and cleared the same two ways (route-driven here, and
   *  the screen's own ngOnDestroy as belt and braces). The shell header's `.dtitle` binds this so
   *  it carries the SAME name as the card's `.nm` it grew from — bh-class-card derives its own
   *  half of the pair straight from the session id, no service involved on that side. */
  readonly detailMorphKey = signal<string | null>(null);

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
    const snap = deepestRoute(this.router.routerState.root.snapshot);
    const isDetail = !!snap.data['detail'];
    this._detail.set(isDetail);
    // A `backTo` written as a route path (`/athlete/class/:id`) resolves against the route's OWN
    // params, so a nested detail screen (class detail's workout, M17a Task 12c) returns to its
    // parent rather than to the top of the flow; a param-less `backTo` (`/athlete/book`) is
    // unchanged since the regex simply finds nothing to replace.
    const raw = snap.data['backTo'] as string | undefined;
    this._backTo.set(isDetail && raw ? raw.replace(/:(\w+)/g, (_, p: string) => snap.params[p] ?? '') : null);
    // Belt and braces: a class name (or its morph key) from one detail screen must never survive
    // into the next screen, detail or not — the screen itself also clears both on ngOnDestroy.
    if (!isDetail) { this.detailTitle.set(null); this.detailMorphKey.set(null); }
  }
}

import { Component, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * The index of the area. On phone it renders nothing: the layout's nav is the menu, and this
 * route existing is what makes "back" from a section land on that menu. At desktop the menu is
 * always visible beside the content, so an empty content column would just read as broken —
 * hence the redirect to the first section, done by `accountIndexGuard` below rather than from
 * this component's own lifecycle: a component-lifecycle `navigateByUrl` starts a SECOND
 * navigation, and on a cold bootstrap that second navigation raced the still-in-flight initial
 * one and silently lost — the URL stayed on `/account` with this empty template rendered. A
 * CanActivate guard redirects (via `UrlTree`) inside the router's own resolution of the FIRST
 * navigation, so there is no second navigation to race with.
 */
@Component({
  selector: 'bh-account-index',
  standalone: true,
  // ponytail: no markup by design — the layout's nav is the entire phone UI here. Do not "fix".
  template: ``,
})
export class AccountIndexPage {}

/** Matches the layout's own 720px breakpoint. Exported so the guard and its spec share one definition. */
export const isDesktopViewport = () => window.matchMedia('(min-width: 720px)').matches;

export const accountIndexGuard: CanActivateFn = () =>
  isDesktopViewport() ? inject(Router).parseUrl('/account/password') : true;

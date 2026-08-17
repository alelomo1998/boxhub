import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The index of the area. On phone it renders nothing: the layout's nav is the menu, and this
 * route existing is what makes "back" from a section land on that menu. At desktop the menu is
 * always visible beside the content, so an empty content column would just read as broken —
 * hence the redirect to the first section.
 */
@Component({
  selector: 'bh-account-index',
  standalone: true,
  // ponytail: no markup by design — the layout's nav is the entire phone UI here. Do not "fix".
  template: ``,
})
export class AccountIndexPage implements OnInit {
  private router = inject(Router);

  /** Overridable in tests. Matches the layout's own 720px breakpoint. */
  isDesktop = () => window.matchMedia('(min-width: 720px)').matches;

  ngOnInit() {
    if (this.isDesktop()) this.router.navigateByUrl('/account/password', { replaceUrl: true });
  }
}

import { CanDeactivateFn } from '@angular/router';

export interface HasUnsaved { hasUnsaved(): boolean; }

/* Nav-guard confirm() is the sanctioned exception to the no-alert rule: it must block routing synchronously. */
export const unsavedGuard: CanDeactivateFn<HasUnsaved> = (c) =>
  !c.hasUnsaved() || confirm('You have unsaved pieces — leave and lose them?');

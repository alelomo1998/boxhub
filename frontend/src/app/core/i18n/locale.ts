import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';

/**
 * Registers a locale for this session: Angular's date/number/currency formatting data
 * (`registerLocaleData`) and, if supplied, a `$localize` translation catalog
 * (`loadTranslations`) — then returns the `LOCALE_ID` to bootstrap with.
 *
 * Single bundle, runtime loading, no locale segment in the URL (decided at spec review,
 * docs/superpowers/specs/2026-08-02-m13a-baseline-design.md §3): a locale-prefixed URL would
 * force every emailed link through `Mailer` to carry a locale, coupling it to URL construction
 * that `AppUrls` deliberately keeps apart. Loading happens here, at bootstrap, from data the
 * caller already has — not from a locale segment in the URL.
 *
 * English is the source language and the only one that ships (M13a): no locale data to
 * register, no catalog to load, so `initLocale()` with no arguments is a no-op and 'en-US' is
 * exactly what Angular already defaults to. Wiring a resolved user/box locale
 * (`users.locale` / `boxes.locale`, Flyway V18) into this call is for the locale-switcher UI —
 * see docs/BACKLOG.md.
 */
export function initLocale(
  localeId = 'en-US',
  // `any` matches @angular/common's own registerLocaleData signature — the shape is the default
  // export of an `@angular/common/locales/<code>` module, which Angular does not type publicly.
  localeData?: unknown,
  catalog?: Record<string, string>,
): string {
  if (localeData) registerLocaleData(localeData, localeId);
  if (catalog) loadTranslations(catalog);
  return localeId;
}

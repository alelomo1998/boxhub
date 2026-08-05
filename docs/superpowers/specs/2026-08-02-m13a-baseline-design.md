# M13a — Baseline (design)

**Date:** 2026-08-02 · **Status:** approved · **Base:** `main` @ `81ae5db`
**Program:** `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`
**Flyway:** **V18** — `users.locale` + `boxes.locale` (§3). The only schema change here.

Supersedes `2026-08-02-m13-foundations-design.md`, which mixed plumbing with design work. That file
is deleted; its component inventory moves to M13c and its auth-screen section to M13d.

## The defining constraint

**Nothing in this milestone changes how anything looks.** Every screen must render identically
before and after. That is not modesty about scope — it is what makes a milestone containing three
Angular majors, a test-runner migration, a URL move and i18n *verifiable at all*. If a screen looks
different, something broke and we want to know immediately rather than discover it under a redesign.

Three risky mechanical changes, one constraint that catches all three.

## 1. Angular 19.2 → 22, including Karma → Vitest

Three majors, one `ng update` per major, full gate green before the next. Angular 19 is EOL and
`npm audit --omit=dev` reports 6 high advisories, all cascades of an SSR hydration CVE this
client-rendered-only app cannot reach.

**RETRACTED 2026-08-02 — Angular 22 does NOT remove Karma.**

An earlier draft of this spec claimed that Angular 20 deprecated Karma, 21 defaulted to Vitest, and
**22 removed Karma entirely**, making a 184-spec runner migration the largest risk in the milestone.
That claim came from a secondary web article and **it is false**. Verified directly against the
published package:

```
@angular-devkit/build-angular@22.1.2 builders:
  application, app-shell, browser, browser-esbuild, dev-server,
  extract-i18n, karma, server, ng-packagr, ssr-dev-server, prerender

  karma: implementation ./src/builders/karma
         description "Run Karma unit tests"
  peerDependencies: karma ^6.3.0
```

A real builder with an implementation, a schema and an active peer dependency — not a deprecation
stub.

**How it was caught, because the method matters more than the fact:** the same article also named
`ng generate @angular/core:karma-to-vitest` as the migration command. That schematic does not exist
in Angular 21.2.19 — the executor dispatched to run it found `Schematic "karma-to-vitest" not found`,
stopped rather than improvising a hand-rolled migration, and reported. Since one claim from that
source was demonstrably wrong, the other was checked instead of trusted.

**Consequence: the runner migration is cut from this milestone**, and both of its justifications are
dead. It was never a speed win (Karma runs in ~4s; the documented "hour" was iCloud), and it is not a
compatibility requirement. The remaining work would have been 43 spec files — 30 of them using
`HttpTestingController` — translated off Jasmine with no compatibility shim, via an experimental
hidden schematic. Filed in `docs/BACKLOG.md` against the release that actually removes Karma.

- The Playwright e2e suite is unaffected either way; it drives a real browser and knows nothing about
  the unit runner.
- **What the upgrade actually is, now that the runner migration is cut:** three `ng update` runs, one
  per major, each fully gated. Karma stays. `zone.js` stays.
- **Both justifications for a Vitest migration died on 2026-08-02, in that order.** First the speed
  argument: the spec had cited Karma's ~1-hour local runtime, which after the move off iCloud turned
  out to be **~4 seconds** — the filesystem, never the runner. Then the compatibility argument, above:
  Angular 22 ships the karma builder. Nothing was left, so the task was cut.

  Worth keeping as a pattern: a justification that survives only because nobody measured it is not a
  justification. Both of these had been written into a spec and would have bought a 43-file migration.

zone.js is retained — zoneless is a separate decision, deliberately not taken while crossing three
majors. **Verify Angular 22 still supports zone.js** before planning on it; if it does not, that is a
finding to escalate, not to work around.

## 2. The `/app` migration

The application moves under `/app`, freeing `/` for the landing site (M19). Until then `/` is a
**redirect to `/app`**.

### `BOXHUB_APP_URL` must split in two

It serves three consumers with different needs:

| Consumer | Needs | After the split |
|---|---|---|
| `Mailer.link()` — verify, reset, join, account-email, login | the **app** path | origin + `/app` |
| `StripeCheckoutService` success/cancel → `/membership` | the **app** path | origin + `/app` |
| `OAuth2SecurityConfig` → `/login/oauth2/code/google` | the **server root** | origin, unchanged |

That third row is why this cannot be done by setting `BOXHUB_APP_URL=https://host/app`. nginx proxies
`/login/oauth2/` at the root and Google matches `redirect_uri` against a console registration, so a
prefixed value breaks SSO **in production only** — precisely the bug M12c fixed on 2026-07-29.

The design: `BOXHUB_APP_URL` stays the bare origin; a new `boxhub.app-base` (default `/app`) is
prefixed by `Mailer.link()` and the Stripe return URLs; OAuth uses the origin alone.

### Already-sent emails must keep working

**Missing from the first draft.** Verification, reset, invite and email-change links already sitting
in real inboxes point at `/auth/verify?token=`, `/join/<token>` and friends. After the move those
paths 404, and the tokens they carry are single-use and time-limited — a user clicking one gets a
dead link with no way to tell why.

nginx keeps permanent redirects from every old app path to its `/app` equivalent, preserving query
string and path parameters. These are not temporary: invite tokens live for days, and there is no
cost to leaving the redirects in place indefinitely.

### Everything else that moves

`APP_BASE_HREF`, the nginx SPA location, the `sub_filter` CSP-nonce injection, the `= /index.html`
no-cache block, every e2e navigation, and Angular's `**` wildcard.

The `bh_rt` cookie is `Path=/api/auth` and the API stays at `/api`, so **no cookie path changes** —
stated explicitly because MockMvc does not enforce RFC 6265 path matching, so a mistake here would
pass every backend test and fail only in a real browser. That has shipped once already (M8-T9).

**Proof:** an e2e assertion that every emailed link resolves to a live route, following a real
message out of Mailpit — the M8 lesson, where three emailed links shipped dead. Plus the existing SSO
routing assertion, unchanged and still green.

## 3. i18n infrastructure

There is none today: no `@angular/localize`, no locale configuration, every string inline in a
template, and all 11 Thymeleaf mail templates hardcoded English. The default box timezone is
`Europe/Rome`.

Built now because retrofitting after a component library and 40 redesigned screens costs several
times more than building it in — and because M13b's type scale has to be chosen against translated
text, since Italian and German run 20–35% longer than English.

Scope:
- `@angular/localize`, every user-facing string marked for extraction.
- **The brand name becomes a single value while we are in there.** `boxhub.com` and `boxhub.io` are
  unavailable, so the product will be renamed (see the roadmap). There are 18 user-facing
  occurrences today — 8 in `frontend/src`, 9 across seven mail templates, one `BOXHUB_MAIL_FROM`
  default. Centralising them costs nothing during a pass that touches every string anyway, and makes
  the eventual rename two values plus a logo. **Internal namespaces are not touched**: `com.boxhub.*`,
  `BOXHUB_*`, `bh-*`, database and image names all stay.
- **Locale-aware dates, numbers and currency.** We do not have this either: money is formatted
  `€xx.xx` by hand at the frontend edge today. Integer cents stay the storage format everywhere —
  that rule does not change, only the rendering.
- Per-locale mail templates. Thymeleaf message bundles, resolved from the recipient's locale.
- English ships as the only complete locale. Italian is a translation job afterwards, not a refactor.

### Decided — where locale lives

**User-level, with the box as the default.** Both levels, not either.

- `users.locale` — defaulted from `Accept-Language` at registration, changeable in
  `account/security`. This is the column `Mailer` reads, and it is why the storage cannot be skipped:
  mail is sent from an `@Async` job after commit, with no request and therefore no header.
- `boxes.locale` — the default an invited member inherits. A box sets its language once; a member who
  differs can override.

Both land in **Flyway V18**, the only schema change in this milestone.

Knock-on: `Mailer.send` currently takes `(to, subject, template, vars)` and resolves nothing about
the recipient. It needs the locale — which means either the caller passes it or `Mailer` looks it up
by address. Callers already hold the `User` in most cases; the lapse job and the webhook do not, and
those are exactly the paths where a wrong language would be most visible.

### Decided — the locale does not appear in the URL

**Single bundle, runtime loading** via `@angular/localize`'s `loadTranslations()`. One URL, one build.

Rejected: per-locale bundles at `/app/en/`, `/app/it/`. It is the Angular-blessed path and it is
faster at runtime, but it multiplies the build output, adds locale routing to an nginx config already
carrying the `/app` move in this same milestone, and — the deciding factor — it would force every
emailed link to carry a locale prefix, so `Mailer` would need the recipient's locale to build a *URL*
rather than only to pick a template. That couples two things this design deliberately keeps apart.

## Out of scope

- **Any visual change whatsoever.** See the defining constraint.
- The icon set and the shared app shell — both moved to M13c, because both are visual and M13b has
  not yet decided the language they should express.
- Zoneless change detection.
- Actually translating anything into Italian.
- The component library (M13c), the auth screens (M13d).

## Gates

- **Full suite green after each of the three majors**, not only at the end. A failure after 19→20 is
  cheap to diagnose; the same failure found after 19→22 is not.
- **The frontend suite must pass on Vitest with the same 184 specs.** A reduced count means specs
  were dropped, not migrated — that is a failure, not a simplification.
- `ng build --configuration production` after every step; the only gate that type-checks templates,
  and major upgrades are exactly when template checking tightens.
- e2e at `retries: 0` on a fresh stack — the only gate that sees the `/app` migration at all.
- **A visual diff of every screen before and after**, since "nothing looks different" is this
  milestone's central claim and nothing else checks it. Screenshots against the pre-migration build,
  compared by hand or with Playwright.

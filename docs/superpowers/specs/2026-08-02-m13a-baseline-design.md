# M13a — Baseline (design)

**Date:** 2026-08-02 · **Status:** draft, two open decisions · **Base:** `main` @ `81ae5db`
**Program:** `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`
**Flyway:** **V18 expected** (user locale — see §3).

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

**The part that was missing from the first draft, and is the largest risk in the milestone:**
Angular 20 deprecated Karma, 21 made Vitest the default, and **22 removes Karma support entirely**.
Our 184 specs run on Karma. So this is not "run `ng update` three times" — it contains a test-runner
migration, and it gets its own task and its own gate.

- `ng generate @angular/core:karma-to-vitest` handles standard configurations. What needs
  re-verifying by hand: every `HttpTestingController` flush, `fakeAsync`/`tick`, and `TestBed` setup.
  M12a's ledger records two specs that passed `tsc` and failed only under a real runner — `tsc` is
  blind to exactly this class of defect, so it cannot stand in as the gate here.
- The Playwright e2e suite is unaffected; it drives a real browser and knows nothing about the unit
  runner.
- **This is a large upside, not only a cost.** The current Karma run takes about an hour locally and
  emits nothing until the end, which is why frontend work on this project has repeatedly shipped on
  `tsc` alone. Vitest is reported 5–10× faster. Every milestone after this one is frontend-heavy, so
  a usable frontend gate compounds.

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
- **Locale-aware dates, numbers and currency.** We do not have this either: money is formatted
  `€xx.xx` by hand at the frontend edge today. Integer cents stay the storage format everywhere —
  that rule does not change, only the rendering.
- Per-locale mail templates. Thymeleaf message bundles, resolved from the recipient's locale.
- English ships as the only complete locale. Italian is a translation job afterwards, not a refactor.

### Open decision 1 — where does locale live?

Mail is sent from a background job with no request context, so the recipient's locale has to be
*stored*, not inferred from a header. That implies a `users.locale` column (Flyway V18), defaulted
from `Accept-Language` at registration and changeable in `account/security`.

The alternative is box-level locale, which is wrong for a platform serving multiple countries but
right for a single box whose members share a language — and it is one fewer thing for a member to
configure.

**Recommendation: user-level, with the box's locale as the default for invited members.** Both, not
either: the box sets the default, the member can override.

### Open decision 2 — does the URL carry the locale?

Angular's standard i18n builds one bundle per locale, served from `/app/en/`, `/app/it/`. That is
the well-trodden path, and it is fast — no runtime translation cost. But it multiplies the build
output, complicates the nginx config we are already changing in this milestone, and means a user
switching language navigates rather than re-renders.

The alternative is a single bundle with runtime locale loading, which keeps one URL and one build at
the cost of leaving the Angular-blessed path.

**Recommendation: single bundle, runtime loading.** We ship one locale for now, the nginx config is
already carrying the `/app` move in this same milestone, and a language switch that reloads the page
is a worse experience than one that does not.

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

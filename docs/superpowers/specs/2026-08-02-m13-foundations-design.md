# M13 — Foundations (design)

**Date:** 2026-08-02 · **Status:** draft, awaiting review · **Base:** `main` @ `ced0fc6`
**Program:** `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`
**Flyway:** none expected. No schema change.

## What this milestone is for

Every screen complaint from the 2026-08-02 tour reduces to the same root cause: **there is no
component library.** Ten `bh-*` components exist, one of them (`bh-field`) is dead code, and there
is no form, table, overlay or chart primitive anywhere. So every screen hand-assembles raw
`<input>`, `<select>` and `.bh-table` markup — which is why the schedule, invite and plan forms are
each "a line of combo boxes". They are not badly designed screens. They are screens with nothing to
be built from.

M13 builds the parts. **It redesigns no product screen.** The milestones that follow assemble rather
than invent, and nothing is paid for twice.

It also moves the two baselines that would otherwise invalidate that work: the Angular version, and
the URL the app lives at.

## Scope, in build order

The order is not arbitrary — each step would be redone if a later one moved first.

### 1. Angular 19.2 → 22

Three majors: 19→20→21→22, one `ng update` per major, each with the full gate green before the next.
Angular 19 is EOL and `npm audit --omit=dev` reports 6 high advisories, all cascades of an SSR
hydration CVE this client-rendered-only app cannot reach.

**zone.js is retained.** Angular 20+ has stable zoneless change detection and this app is already
signals-based, so zoneless is attractive — but crossing three majors of breaking changes *and*
changing the change-detection model at once means a failure could come from either. Zoneless is
evaluated separately, after 22 is green.

When this lands, three things in `.github/workflows/ci.yml` change together: the per-push npm gate
goes to `--audit-level=high`, `continue-on-error` comes off the nightly informational step, and npm
folds back into the OSV gate. All three are currently held open *only* by Angular 19's advisories.

### 2. The `/app` migration

The application moves under `/app`; `/` is freed for the landing site (M19). Until then `/` is a
**redirect to `/app`** — no placeholder page, nothing to throw away.

**`BOXHUB_APP_URL` must split in two, and this is the sharp edge of the whole milestone.**
It currently serves three consumers with different needs:

| Consumer | Needs | After the split |
|---|---|---|
| `Mailer.link()` — verify, reset, join, account-email, login links | the **app** path | `BOXHUB_APP_URL` + `/app` |
| `StripeCheckoutService` success/cancel → `/membership` | the **app** path | `BOXHUB_APP_URL` + `/app` |
| `OAuth2SecurityConfig` → `/login/oauth2/code/google` | the **server root** | `BOXHUB_APP_URL` unchanged |

That third row is why this cannot be done by setting `BOXHUB_APP_URL=https://host/app` and calling
it finished. nginx proxies `/login/oauth2/` at the root, and Google matches the `redirect_uri`
against a console registration — so a prefixed value breaks SSO **in production only**, which is
precisely the bug M12c just fixed. The design is: `BOXHUB_APP_URL` stays the bare origin, a new
`boxhub.app-base` (default `/app`) is prefixed by `Mailer.link()` and the Stripe return URLs, and
OAuth continues to use the origin alone.

Also moving: `APP_BASE_HREF`, the nginx SPA location, the `sub_filter` CSP-nonce injection and the
`= /index.html` no-cache block, every e2e navigation, and the Angular `**` wildcard. The `bh_rt`
cookie is `Path=/api/auth` and the API stays at `/api`, so no cookie path changes — that is worth
stating explicitly, because MockMvc does not enforce cookie paths and a mistake there would only
appear in a real browser.

**Proof:** an e2e assertion that every emailed link resolves to a live route (the M8 lesson — three
emailed links shipped dead), plus the existing SSO routing assertion, which must still pass
unchanged.

### 3. Icon system

Lucide, MIT. Only the icons actually used are inlined into an SVG sprite at build time — the CSP
blocks external requests, and this is the same constraint that forced self-hosted fonts. One
`bh-icon` component, stroke width bound to a token. Replaces the `⎋ ⌘ ◐` placeholder glyphs, which
the M5.5 critique already flagged as reading like a placeholder system.

### 4. `bh-app-shell`

Header CSS is ~90% duplicated across the athlete, coach and admin shells, and logout/theme controls
sit in a different place in each. One shell, configured per role: nav items, dock items, and where
identity actions live. Deletes three near-identical implementations.

### 5. The component library

Grouped by what they unblock. **Every component below has a named consumer in a specific later
milestone** — nothing here is speculative, and any component that loses its consumer is cut.

| Component | Consumers |
|---|---|
| `bh-modal` (centered) | M14 class detail · M15 member detail · M16 plan edit |
| `bh-drawer` (lateral) | M14 slot editing · M15 invite create |
| `bh-confirm` | M14 delete class type · M16 cancel subscription · M18 reject box |
| `bh-form-field` (label + hint + error) | every form in M14–M18 |
| `bh-select` · `bh-textarea` · `bh-toggle` · `bh-segmented` | every form; `bh-textarea` first needed by M14 class description and M15 invite notes |
| `bh-form-grid` | the layout system that ends "the form is a line" |
| `bh-data-table` (sort, paginate, card-mode on phone) | M15 members · M16 plans + subscriptions · M18 boxes |
| `bh-search-bar` (debounced) · `bh-pagination` | M15 members |
| `bh-state` (loading / error / empty + retry) | every fetch, per design law v2 |
| `bh-stat-tile` · `bh-sparkline` | M15–M18 analytics headers |
| `bh-image-upload` (preview) | M14 class photos · M17 avatar |
| `bh-icon` · `bh-app-shell` | everywhere |

`bh-segmented` and `bh-toggle` already exist as one-off markup inside the score sheet; the backlog
records that the segmented control has `role="radio"` without roving tabindex or arrow keys.
Extracting them fixes that once instead of per screen.

**Deliberately deferred, with reasons — confirm or override at review:**

- **`bh-week-calendar` → M14.** It has exactly one consumer, it is the highest-uncertainty component
  in the set, and its API is determined by scheduling interactions that do not exist yet
  (drag to move a slot? click-drag to set duration? overlapping slots?). Built against a gallery it
  would almost certainly be built twice — the exact outcome this whole ordering exists to avoid.
- **`bh-chart-line`, `bh-chart-bar` → M15.** Which chart answers which question is an analytics
  design decision, and those are made per role in M15–M18. `bh-stat-tile` and `bh-sparkline` are
  well-understood enough to build now; a full chart system is not. The `dataviz` skill governs the
  system when it is built.

### 6. Component gallery

`/app/dev/components` — every component, every state: loading, error, empty, disabled, both themes,
mobile and desktop. It is the build target, the review surface, the impeccable critique surface and
the regression check.

It **ships in production, unlisted and unlinked**, rendering only fabricated sample data — no API
calls, no real box data. That is deliberate: M5.5 shipped a P0 where brand fonts 404'd only under
the real nginx build, and a gallery you can open on a real phone against the real CSP is how that
class of bug gets caught. **It must be removed before launch** — filed in `docs/BACKLOG.md` under
Launch → Production, not left as a comment someone hopes to find.

## Explicitly out of scope

- Any product screen redesign. If a screen changes here, the milestone has failed its purpose.
- Zoneless change detection.
- The landing site (M19).
- Tailwind, Angular Material. The styling architecture stays SCSS + CSS custom properties,
  tokens-only. The gap was never the styling layer; it was the absence of components.
- **Storybook.** Considered and rejected. It is the industry-standard version of the gallery, and
  the isolation and documentation arguments are real — but it runs its **own build**, so it exercises
  neither our nginx, nor the CSP, nor the `sub_filter` nonce injection. It would therefore not have
  caught the M5.5 P0 where brand fonts 404'd under the real build, which the in-app gallery does
  catch. A second build pipeline in a project with 11 total dependencies, that still misses the
  failure class we have actually hit, is not worth it.
- **Figma / the Figma MCP.** The design language lives in `_tokens.scss` and the gallery; there is
  no Figma source to convert from, and the MCP requires permission on a file that does not exist.
  Revisit at M19 if the landing site is designed visually first.
- **Visual-regression and automated a11y checks.** Both are worth having and both were deliberately
  cut to keep this milestone tight — M13 already carries three Angular majors, a URL migration, an
  icon system, a shell and the component library. Filed in `docs/BACKLOG.md` as follow-ups, to be
  added once the components exist and have stabilised, which is also when baselines stop churning.

## Gates

Standard, plus two specific to this milestone:

- **The full suite must be green after each of the three major upgrades**, not only at the end.
  A failure after `19→20` is cheap to diagnose; the same failure discovered after `19→22` is not.
- **`ng build --configuration production` after every step.** It is the only gate that type-checks
  Angular templates, and a major upgrade is exactly when template type-checking tightens.
- e2e at `retries: 0` on a fresh stack — it is the only gate that sees the `/app` migration at all.

## Open question for review

The two deferrals above (`bh-week-calendar`, the chart components) shrink M13 and push work into
M14/M15. The alternative is building them here against fabricated data. My recommendation is to
defer; the counter-argument is that M13 is the milestone whose whole job is components, and
splitting that work makes later milestones carry hidden component cost.

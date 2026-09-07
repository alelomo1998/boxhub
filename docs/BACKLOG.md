# Backlog

**Organised by DESTINATION, not by origin milestone.** (Re-triaged 2026-07-27 — it had grown to 120
open lines filed by *when* they were deferred, which told you nothing about *what to do*.)

Every open item below belongs to exactly one destination. When you finish a milestone, delete its
section rather than striking items through; the closed-item archive at the bottom keeps only
entries whose history is still load-bearing.

**Four kinds of thing live here, and they are not the same:**
- **Scheduled** — assigned to a milestone (M13–M20, Project 2, Launch → Production). Real work, real
  owner. Numbering was reset on 2026-08-02; see
  `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`.
- **Accepted** — a decision, not debt. Do not "fix" without re-opening the decision.
- **Watch-list** — correct today, revisit when a named trigger fires. Not scheduled on purpose.
- **Archive** — done or dead. Kept only where the reasoning still matters.

---

## Launch → Production

> **OWNED SINCE 2026-08-22: this block is M28, and it is the NEXT milestone.** It was raised unowned
> at three consecutive milestone closes. Do not re-file items from here as unscheduled. See
> `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` §8.

*The deploy itself.*

- **Remove the component gallery at `/app/dev/components`** (M13). It ships in production unlisted
  and unlinked, rendering fabricated sample data only — deliberately, so the design system can be
  checked on a real device against the real CSP and the real font pipeline, which is where M5.5's
  font P0 hid. It has no place in a launched product. Delete the route, the page and its sample
  fixtures.
- **Email deliverability.** Dev uses Mailpit. Production needs a real SMTP provider with SPF, DKIM
  and DMARC, or verification, password-reset, invite and receipt mail lands in spam. **The entire
  auth flow depends on mail arriving** — an unverifiable account is an unusable one. Found
  2026-08-02; it had never been named anywhere.
- **Error monitoring and uptime.** There is none: no error tracking, no uptime check, no log
  aggregation. Today the discovery mechanism for a 500 at 6am is the box owner sending an email.
- **Measure the rate limits against a real class-opening rush.** `application.yml` says verbatim
  *"It has NOT been measured against a real class-opening rush — do that before launch."* That
  sentence existed **only in that comment**, in no backlog and no milestone. A whole gym shares one
  NAT IP, so a false 429 at midnight when classes open is a product failure, not a save.
- **Terms of service, privacy policy, and a DPA with boxes.** BoxHub is the processor and the box is
  the controller — documented internally, stated to nobody. EU gyms, real PII (names, emails,
  attendance, payments), real money. The pages themselves live with M19.
- **Verify DST transitions.** Box timezone drives week windows, the no-show sweep and day bucketing.
  Europe/Rome shifts twice a year and none of it is tested; M5.5 already shipped one UTC-vs-local
  bucketing bug.
- TLS/HSTS enforcement, domain, firewall, SSH hardening, Postgres backups **and a restore drill**,
  secrets delivery on the host, log retention, CI deploy on green. When TLS lands, set
  `BOXHUB_COOKIE_SECURE=true` in the host's `.env` (M12c added the variable and wired it through
  compose; the dev stack runs it `false` over plain HTTP).
- **Verify Google SSO end to end against real Google credentials on the real domain.** M12c proved
  the nginx routing and the `redirect_uri` *shape* — the dev stack runs a fake client id that
  reaches Google's consent screen and stops. Nothing yet exercises a real token exchange, the
  callback, or `GoogleLinkService`'s 4-branch linking policy against the live provider. Do this
  before the pilot, not during it.
- **`LogHygieneTest`'s PII guarantee only covers the surfaces it drives.** M12c redacted every
  address the test could actually see: `AuthController.LoginRequest`, `Mailer`'s two log lines,
  `InviteAdminController.CreateInviteRequest` and `CreatedInviteResponse`. Seven other DTOs carry an
  email field and are not driven by it — `AuthController.RegisterRequest` (still prints it in full),
  `UserResponse`, `SignupBoxResponse`, `MeResponse`, `MemberDto`, `SessionController.RosterEntry`,
  `InvitePublicController.PreviewResponse`, `SuperadminBoxController.WaitlistRow`,
  `InviteAdminController.InviteDto`. Redacting them blind is untested work; widening the test's
  driven surfaces is the real fix, and it belongs with log retention.

## PROJECT 3 · Box discovery — DELETED as a separate project, absorbed 2026-08-18

Was proposed here 2026-08-11. On 2026-08-18 the user deleted it as a standalone project and folded
it into the main program: *"i want to DELETE part 3 and migrate all in part 1 because i recognize
them like a core function of rxed."*

**Everything it raised is carried, in full, into
`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`** — the public cross-tenant read
path and its fail-OPEN hazard into **M21**; the box-profile schema, the signed-media contradiction
and the GDPR obligation over staff photos into **M22**; the boxless app shell into **M23**; and the
directory, the box page, the drop-in, the moderation question and the reversal of M13d's
invite-only signup copy into **M24**.

**One of its open questions is now answered:** the directory is **signed-in only**, not public to the
internet — so no SSR, and no merge with M19. The rest are still open and are listed under M24 in the
v3 document.

## The rework program — items by destination milestone

*The old "M12 · UX/UI rework" section is gone: it was one bucket for what is now eight milestones.
Every item below kept its wording and gained a home.*

> **Destination labels below are still valid as of 2026-08-18.** The v3 roadmap
> (`docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`) deliberately did **not**
> renumber M14–M20, precisely so these `→ M15`, `→ M16`, `→ M17`, `→ M18` labels keep working.
> Three things did move, and only these:
>
> - **M14 split into M14a / M14b / M14c** — model, schedule surfaces, builder. Items labelled
>   `→ M14 Class model & schedule` land in M14b or M14c; the instance-builder save bug is M14c.
> - **The shared-layer debt from M13c/M13d/M13e now has an owner: M13f**, which opens Phase 2.
>   That covers the `bh-button` variant matrix, the gallery's scroll-coupled baselines, the account
>   area's skipped consistency pass, the delete sheet's missing axe coverage, `passwordErrorMessage()`
>   and `AccountService.startEmailChange`.
> - **New milestones M21–M27 exist** for the four pillars added on 2026-08-18. Nothing already filed
>   below was reassigned to them.

### → M13 Foundations

*~~Angular 19 → 22~~ — **DONE in M13a** (2026-08-02), now at 22.1.0 with TypeScript 6.0.3. The
per-push npm gate tightened to `--audit-level=high --omit=dev`. `continue-on-error` on the nightly
step was **kept**, against the plan: without `--omit=dev` it still exits 1 on three transitive
dev-only advisories (`brace-expansion`, `fast-uri`, `socket.io-parser` via Karma), and a permanently
red nightly job is how a scan stops being read. Folding npm into the OSV gate is therefore still open.*

- Admin tables on phone are scroll-tables, not cards. *(`bh-data-table` now ships card mode — a
  `<td data-label="…">` renders as a labelled row instead of a scroll-table cell — but no screen
  adopts it. Adopting it changes that screen's phone layout, which M13c's own-scope lock forbade;
  the fix is each screen's rebuild wiring up `data-label`.)*
- Sheet discard bar doesn't move focus on appear. *(Fix once in `bh-sheet` rather than per screen.)*
- Sheet component: no focus trap beyond native `<dialog>`, no swipe-to-dismiss.
- Coach + admin surfaces are pre-rebuild. The components now exist (`bh-field`, `bh-select`,
  `bh-button`, `bh-data-table`, …) and M13c tokenised 36 on-scale raw `font-size` sites in
  `features/`, but adoption is still open: 27 raw `<input>` and 18 raw `<button>` remain in
  admin+coach templates instead of `bh-field`/`bh-button`, and only 2 of the 16 admin+coach screens
  read a loading signal. *(M13 supplies the components; each surface milestone applies them.)*

### → M13c Component library — Angular 22 compatibility shims to revisit

*Created by M13a's `ng update` to Angular 22 on 2026-08-02, accepted deliberately because M13a's
defining constraint is that nothing changes behaviourally. Both are opt-outs of newer Angular
defaults, and M13c is rebuilding the component layer anyway — the right moment to drop them.*

- **`ChangeDetectionStrategy.Eager` is now off all 18 rebuilt `ui/` components** — M13c dropped it
  component-by-component as part of the rebuild. It remains on 51 other components, measured by
  grep: `app.component.ts` plus 50 under `features/` (not the `~45` this entry used to guess). Each
  surface milestone (M14–M18) still owns dropping its own as it rebuilds that screen. **Worth
  recording:** Angular 22's implicit default when `changeDetection` is omitted is `OnPush`, not the
  old eager `Default` — confirmed in the compiler, which only emits a component's `changeDetection`
  field when it differs from `OnPush`. So the 18 `ui/` components already get the newer, faster
  default just by omitting the decorator; no further work needed there.
- **`withXhr()` is still on `provideHttpClient`** (`app.config.ts` plus ~33 spec files), untouched
  by M13c. Angular 22 moved the default HTTP transport; this pins the old one. Open on its own —
  no longer bundled with `ChangeDetectionStrategy.Eager` above, which M13c partially resolved.

*Not filed: the `extendedDiagnostics` suppression the same migration added to `tsconfig.app.json` and
`tsconfig.spec.json`. It was measured (build with it removed: exit 0, zero violations of
`nullishCoalescingNotNullable` or `optionalChainNotNullable`) and removed during M13a rather than
carried, because it hid nothing and would have silently loosened a standard.*

### → M13c Component library — raised by M13b (2026-08-06)

- **Inline `style=""` in template markup does not count toward `anyComponentStyle` at all.** A real
  hole in that gate. Recorded before someone discovers it as a workaround rather than as a fact.
- **The three standing budget warnings** — `instance-builder.page.ts` (+456 B), `tv-shell.page.ts`
  (+256 B), `progress.page.ts` (+17 B) — now print silently. M13c Task 10 raised the
  `anyComponentStyle` warning threshold to 6 kB (error stays 8 kB), which sits above all three; the
  underlying components are unchanged, nobody split or trimmed them, the budget moved instead. Each
  screen's own rebuild (M14 / Project 2 / M17) is still the real fix. Filed again because a silenced
  warning nobody has written down is how the next person concludes there was never a problem.

### → M14–M18 — 41 off-scale `font-size` px values, one decision per screen

`grep -rhoE 'font-size:\s*[0-9]+px' frontend/src/app/features` returns 41 raw values today, and
every one is off-scale: 9px×1, 10px×9, 12px×8, 14px×10, 16px×2, 17px×2, 18px×2, 19px×1, 21px×1,
22px×1, 24px×1, 34px×1, 44px×2. They stayed raw deliberately, not by oversight — M13c Task 10
tokenised the 36 sites that landed exactly on a `--fs-*` value and left these alone. No token on the
scale is 17px, so converting one of these means *choosing* a nearby size, which is a visible design
decision M13c's component-only scope did not authorize.

Not debt to pay down blind. Frame it as a question for each screen's rebuild (M14–M18): for this
site, which `--fs-*` token was this actually meant to be, and does the resulting visual change need
its own note in that screen's review?

### → M16 Admin: commerce — email subject lines are not translatable (M13a debt, found in M13b)

Six subject lines are Java literals passed straight to `Mailer.send(to, subject, …)` →
`helper.setSubject()`. Unlike the template *bodies*, they never pass through `messages.properties`,
so **a German recipient gets an English subject above a German body**: `SubscriptionLapseJob:103`,
`PaymentReceipts:52` and `:68`, `InviteAdminController:72`, `SuperadminBoxController:67` and `:75`.

M13b routed them through `Brand.NAME` (`aa75673`) so the rename is complete, but that is branding,
not i18n. `Mailer` **already resolves a per-recipient locale** for the template, so the plumbing
exists and only the wiring and six bundle keys are missing.

Worth noting how this survived M13a's i18n sweep: subject strings do not look like brand strings or
like template content, so a search framed around either misses them entirely.

### → M16 Admin: commerce — the categorical chart palette does not exist

**The palette as it stands cannot draw a chart**, and M16 and M18 both ship analytics. There is one
accent (`--volt`) and three semantic hues, and **all three semantics already mean something** —
charting a five-series breakdown in volt / green / orange / red tells the reader that one series is
an error and another is a warning.

Constraints for whoever designs it: a categorical ramp must be **new hues**, must not reuse
`--good` / `--warn` / `--danger`, must hold **4.5:1 against `--ground`**, and must stay
distinguishable from volt. Deliberately not invented in M13b — a ramp designed against imaginary
data is a ramp that gets redesigned. Recorded in design law v3 §17. **This is the one open gap large
enough to change the base palette later.**

### → Launch → Production — icon assets beyond the favicon

M13b ships `public/favicon.svg` only. `index.html` references exactly one icon and there is no
`apple-touch-icon`, no web manifest, and no `theme-color`. Deliberately not smuggled into the design
milestone. Decide when the marketing site (M19) or the pilot forces it.

### → M23 App entry & shells

- **~25 screens still hand-roll a link-as-button, now that `bh-button` supports `route`.** M14b added
  the missing input (an `<a routerLink>` branch keeping client-side routing) and converted
  `coach/classes.page.ts`, which is what the critique's P1 was about. The remaining screens were
  deliberately NOT swept — that is its own pass, not a milestone-closing change. **Note for whoever
  does it:** `href` and `route` take different strings, because `index.html` sets `base href="/app/"`
  — `href` carries the `/app` prefix and `route` must omit it, or the link resolves to
  `/app/app/...`. The gallery's own sample shipped with exactly that bug.

- ~~**`bh-button` has a link mode but no `routerLink` mode, so 25 screens hand-roll a link-as-button.**~~ FIXED in M14b's follow-up; see the entry above for what remains.
  Found by the M14b critique on `coach/classes.page.ts` (its `.act` class re-implements the button's
  border/radius/`--tap` CSS for Build / Check-in / Run), then confirmed as systemic: ~25 feature
  screens carry the same shape. It reads as a straight violation of *"re-implementing a component's
  markup in a screen is a bug"* — **but the obvious fix is wrong.** `bh-button`'s link branch emits a
  plain `[attr.href]`, so swapping these in-app navigations onto it turns client-side routes into
  FULL PAGE RELOADS. Closing this properly means teaching `bh-button` `routerLink` (a `ui/` API
  change, M13c's clean zone, every consumer affected) and only then swapping. Not taken in M14b:
  a shared-component API change on merge day is exactly the wrong time.


- **The shell header squeezes the box switcher FIRST, so the gym name is the thing that
  disappears.** Found while fixing the 401px floor (M14b, 2026-09-06). Now that the header takes
  real width pressure, the flex order means `.acts` (three tap targets, rigid at the `--tap` 44px
  a11y floor — correctly so) and the `.area` label ("Admin") both outrank the switcher, so the gym
  name clips to **76 of 87px at 393** and to **3px at 320**, leaving only the volt mark. The
  overlap and the overflow are fixed; this is the leftover *priority* question. The switcher is
  described in `CLAUDE.md` as the shell's one volt element, meaning *the gym you are in now* — it
  should be the LAST thing to give up space, not the first. The `.area` label is the expendable
  one: it duplicates what the dock's active tab already says. Not fixed in M14b because reordering
  the header is a design decision, not a bug fix.

### → M15 Admin: people — signup collects only name + email; birthday / gender / address are missing

Raised by the user 2026-08-11 while M13d rebuilt signup. **Deliberately not built in M13d**: the
milestone rebuilds screens, and this is a data-model change. Deferring is cheap — signup is a
vertical form, so extra fields are additive rather than a rebuild — while building it now costs a
Flyway migration, entity + DTO + validation, and an extension of the GDPR export and anonymize
flows to cover new PII.

**`users` holds only** `id`, `email`, `password_hash`, `name`, `created_at`, plus `email_verified`,
the backoff columns, `locale` (V18) and `anonymized_at` (V12). None of the three exist.

**Each field needs its own answer before any of it is built — they are not one item:**

- **Gender — probably NOT a signup field, and this is the one worth thinking about first.** CrossFit
  RX loads are gendered: the seeded benchmarks read `Thrusters (95/65 lb)`, male/female. So what the
  product actually needs is an **RX load category on the athlete's scoring identity**, which belongs
  with leaderboards and scoring (**M17**), not with the account. Asking "gender" at signup and
  asking "which RX loads do you use" at scoring are different questions with different answers, and
  conflating them is how a schema gets stuck. Also the more sensitive of the three under GDPR.
- **Birthday** — needs a stated purpose. Age-banded programming? A legal minimum age? Birthday
  shout-outs on the board? Each implies a different requiredness and a different surface.
- **Address** — needs a purpose too. Billing already runs through Stripe, which collects its own
  billing address, so this may be redundant. Emergency contact would be a different field entirely.

**Whoever picks this up must also decide:** required or optional; asked at signup or later in a
profile screen (M5 already shipped athlete profiles, which is the natural home); what an existing
user sees; and whether each field joins `GET /api/me/export` and the anonymizing `DELETE /api/me`.
The GDPR flows are not optional extras here — the project is the processor and EU gyms are the
controllers.

### → M13d Auth & account screens

- **`a { color: var(--volt) }` is a GLOBAL rule, so every link in the product is volt — which breaks
  the one-volt-element law on every plumbing screen.** `frontend/src/styles.scss:14`. Found by the
  M13c impeccable critique, which measured it on the real login screen: the `Log in` button (correct
  — the primary action) **plus** "Forgot password?", "Create a box account" and "Start your box", all
  rendering `rgb(223,255,78)`. That is **four** volt elements where design law §2.3 says exactly one.
  Because it lives in a bare `a` selector it is not a mistake on one screen, it is the default
  everywhere.

  **Deliberately not fixed in M13c.** Changing a global anchor colour repaints every link on ~40
  screens, and the visual-regression baselines cover only the gallery — so the blast radius is
  entirely unverified. M13d rebuilds login, signup, forgot, reset and start-box, which is where the
  critique actually observed it, so it owns both the fix and the screens that prove it.

  The fix is a decision, not a find-and-replace: links are not primary actions, so the base anchor
  should be `--bone` (or inherit) with volt reserved for the one control that *is* the answer to the
  screen's question. Whoever does it should also ask the critique's own question — was the
  one-volt-element rule ever enforced by a gate, or only by eye on hero screens?

- **A second, different error message on `bh-field` / `bh-select` may not be announced.** Both gate
  their `<span role="alert">` behind `@if (error())`. Angular's `@if` only tears the node down and
  recreates it across the falsy↔truthy boundary, so `"Required"` → `"Invalid format"` updates the
  *same* DOM node in place. `bh-alert`'s own JSDoc states the mechanism this breaks: `role="alert"`
  announces reliably only when the element is **freshly inserted**, not when its content changes.
  Found in M13c Task 11 and confirmed independently in review; deliberately not fixed there, because
  the fix belongs with a real consumer. **M13d hits this immediately** — eleven form screens, and
  re-validation producing a second message is the normal case, not an edge case. Likely fix: key the
  `@if` on the message value, or emit through a signal that remounts.

- **The admin-facing invite link takes a redirect hop.** `InviteAdminController.java:76` returns the
  raw `/join/<token>` path and `invites.page.ts:109` builds the displayed/copied link as
  `location.origin + inv.link`. After M13a's `/app` move that still works — `/join/` is one of the
  permanently-redirected prefixes — but it lands via a 301 instead of directly. The *emailed* invite
  is already correct, because it goes through `Mailer.link()` and therefore `AppUrls.appLink()`; only
  the copy-from-the-admin-page path is inconsistent. Found by the M13a T6 executor, deliberately left
  out of scope. Fix by having the backend return the `/app`-prefixed path.
- **Self-serve box signup (`BoxSignupTx.createOwnerAndBox`) doesn't read `Accept-Language`.** M13a T8
  wired the header only at `AuthController#register`; the owner created via `/api/auth/signup-box`
  gets `users.locale = 'en'` unconditionally. Plan named "the registration path" singular — this one
  was left out deliberately, not missed.
- **No self-service endpoint for a user to change `users.locale` after registration.** M13a T8 stores
  the column and seeds it (Accept-Language at registration, the invite's box locale for an invited
  member) but `/api/me/**` has no generic profile-write route today — only `PATCH /api/me/password`
  and `POST /api/me/email` exist, both narrower than a settings PATCH. Adding one (e.g.
  `PATCH /api/me/locale`) needs a `MIN_ROLE` entry in `AuthzConformanceTest`, which is the
  orchestrator's call, not an executor's — left for whichever task first needs a user-facing
  language switcher (Task 9/10 or M13d).
- **`bh-button` cannot render as an anchor, and M13d's eleven auth screens are all links styled as
  buttons** ("Create a box account", "Start your box", "Forgot password?"). `RouterLink` only emits
  an `href` when the host element is `a`/`area` — `bh-button`'s host tag is `bh-button`, so
  `<bh-button routerLink="…">` silently produces no `href` (no ctrl/cmd-click, no "open in new tab",
  wrong a11y role). `wod-library.page.ts:15` already works around it today —
  `<a routerLink="/coach/wods/new"><bh-button size="sm">+ New WOD</bh-button></a>` — which nests a
  `<button>` inside an `<a>`, an invalid HTML content model. Found fixing the same bug in the coach/
  admin shells' Security link (M13c Task 6 review). Fix: polymorphic rendering on `bh-button` (an
  `as="a"` input, or similar) or a separate link component styled to match — decide once M13d has
  real consumers in front of it. Do not build ahead of that.

### → Chore: unify the two nginx configs

`docker/nginx-tls.conf` (M13a T7) is a 154-line copy of `docker/nginx.conf` differing only in
`listen 443 ssl` plus two `ssl_*` lines. They must be kept in sync **by hand**, and every milestone
from M13c on adds locations. TLS is opt-in and rarely run, so drift would sit unnoticed until someone
next tries to verify cookies under TLS and finds a half-broken app.

Fix: extract the shared server body into a snippet both `include`, the way
`snippets/security-headers.conf` already works. Deliberately not done inside T7, whose constraint was
that the default plain-HTTP path must not be touched — this refactor edits it, so it needs its own
full e2e run.

### → M16 Admin: commerce — stale user-visible milestone reference

- **`dashboard.page.ts:89` tells box owners "Full analytics … lands with milestone M8."** That is
  user-visible copy naming a milestone that never meant analytics (M8 was auth & accounts), and it is
  doubly wrong after the 2026-08-02 renumbering — analytics is now a section of each role's milestone,
  not one of its own. The javadoc at `dashboard.page.ts:7` repeats it. Spotted during M13a's visual
  check; deliberately not fixed there, because that milestone's constraint was that nothing changes.
  Fix when the dashboard is rebuilt.

### → M14 Class model & schedule

- **Two endpoints disagree about what "booked" means, and M14b made the disagreement visible.**
  `SessionController.java:75` computes a session's `bookedCount` from status **`BOOKED` only**;
  `SessionDetailController.java:79` builds its `active` grid from **`BOOKED` or `CHECKED_IN`**. So
  the moment anyone checks in, the schedule row reads "2/14 booked" and the class-detail sheet
  opened *from that row* reads "3/14" for the same session — observed live, then confirmed in
  source. M14b did not cause it; it put the two numbers side by side, which is why it is now
  obvious. **The open question is bigger than the display:** if capacity checks also count `BOOKED`
  only, a check-in frees a place and the class can be overbooked. Verify that before choosing which
  number is the right one — the detail's is the more truthful of the two for a human reading it.

- **Instance-builder save creates new `wod` rows on every edited re-save** — quick-created pieces become
  library wods each time, so the library grows unboundedly. The fix is dedupe-or-update-in-place, a design
  change to this screen's save model. **Still open after M14a, deliberately.** M14a built the mechanism —
  `wod.library` and `WodService.attachToSession`, which copies a library WOD so the class owns its content —
  but nothing calls it: the live attach path is still `SessionItemController.replace`, which stores the
  incoming `wodId` directly. Wiring it naively reproduces the bug wearing `library = false`, because the
  builder re-sends the id it last received, so the second save would copy the copy. Closing it needs
  copy-vs-update-in-place logic keyed on whether the incoming wod is a library row or this session's own
  copy — **M14c**, with the builder rebuild, which is also the only milestone allowed to change what that
  endpoint returns.
- **A pre-M14a `CIRCUIT`, `CUSTOM` or `SKILL` wod reopens with a blank type select** — M14a replaced
  `wod.wod_type` with `macro` + `timing_preset` and keeps `wodType` on the wire as
  `timingPreset ?? macro`, which is lossy for exactly those three: `CIRCUIT`/`CUSTOM` read back as
  `WORKOUT` and `SKILL` as `GYMNASTIC`, none of which are options in `wod-builder`'s legacy `<select>`.
  Accepted at the time (user decision, 2026-08-19) because the alternative was either editing the
  frontend, which M14a forbade itself, or keeping a dead column the migration test asserts is gone.
  **M14c** rebuilds that select against the real axes and the loss disappears with it.
- Builder score-type select is still a 5-option decision per scored piece.
- No coach-facing help for the skeleton → instance → publish flow.
- Drag-and-drop reorder + drag-to-move calendar slots (today: up/down + click-assign).
- **A capacity change regenerates rather than applying in place, so it is refused on any slot with a
  booked session in range.** Deliberate (M14b decision 8) — one mechanism, not two: every scheduling
  edit routes through `SlotRegenerationService`, which refuses rather than cancelling, because
  cancelling would mail everyone booked. The cost is that raising a capacity from 12 to 14, which
  harms nobody, is refused exactly as moving the class an hour earlier would be; the admin's way
  through is the `applyFrom` retry, which only helps for dates *after* the booked ones. Revisit if
  the pilot finds the refusal too blunt — the narrow fix is an in-place capacity update that skips
  regeneration entirely, since capacity alone changes no session's identity.

### → M15 Admin: people

- **The admin members proof clips below its designed width, and `bh-data-table`'s card mode exists
  but nothing adopts it.** Found by the M13c critique at 375 and 768: at 375 the `PLAN / STATUS /
  JOINED / VISITS` columns are cut mid-word with no visible scroll affordance; at 768 — a real
  coach-tablet width — `JOINED` wraps to three lines and `VISITS` is pushed off-screen entirely.
  M13c shipped card mode on `bh-data-table` (activates per-cell on `<td data-label="…">`) precisely
  for this, but adopting it changes a screen's phone layout, which M13c forbade itself. **Adopting it
  is this milestone's job**, on the real members table — the proof screen is only where it was
  spotted.
- **The members search placeholder truncates at 768px** — renders as `"Search by name or em"`, hard
  clipped, no ellipsis. English already breaks it, so translation will be worse; §12 of design law
  exists for exactly this.
- `members.page` search fires one request per keystroke — no debounce. *(`bh-search-bar` solves it.)*

### → M16 Admin: commerce
- `INVALID_PLAN` / `INVALID_MEMBERSHIP` (400 from `POST /api/box/subscriptions`) have no friendly copy.
- Mail templates duplicate the accent hex — now `#dfff4e` with `#0d110e` text, across **8** CTA
  buttons, not 4 (M13b swapped them off the retired `#D7263D`). Centralise. *(Email clients can't use
  CSS custom properties, so this needs a build-time or template-fragment answer, not a token.)*
  **Carry the contrast reason with it:** the buttons previously set `color:#fff` on the accent, and
  white on volt is 1.1:1. Whoever centralises this must centralise the text colour too, or the next
  accent change silently reintroduces an unreadable button.

### → M17 Athlete
- **The class row/card is ONE shared component across athlete Book and coach Classes, with the
  ACTIONS differing by role (user-ruled 2026-09-06).** M14b gave both screens the week strip but
  explicitly left their rows alone — its spec annotates the sketch *"the component owns the strip,
  not the rows"*, and §4.2 keeps `book.page.ts`'s photo cards as M17a's. That left the coach row
  with no owning milestone at all; this ruling gives it one rather than leaving it to be
  rediscovered. Build it once, vary the actions (athlete: book / cancel / waitlist; coach: open the
  class, check-in, run it), not the layout. `docs/design-ref/screens/booking-screen-example.webp` is
  the binding reference for the shape — full-bleed image with the text on a scrim over it, not a
  thumbnail beside text — and **nothing implements it today**. M17a therefore covers
  `athlete/book.page.ts`, `athlete/class-detail.page.ts` **and** `coach/classes.page.ts`'s rows.
- Score form has no cancel/delete of a logged score (edit-only); no way to delete a lift entry.
- Booking error renders at the list top, not in the card foot next to the button that caused it.
- Leaderboard button could show score count ("3 posted"); score-save could show your rank ("you're 3rd")
  as the peak-end beat.
- `progression-chart` aria conveys count + best only, not per-point data (a table alternative exists below it).
- Shared leaderboard URL loses the WOD title (query param); leaderboard `track e.rank` breaks on tied ranks
  if the API ever ties.

### → M18 Superadmin
- Superadmin console per-row actions share one `queueActionId`/`boxesActionId` signal, so clicking approve
  on row A then reject on row B before A resolves re-enables A mid-flight (internal tool, duplicate-submit
  window).

### → M13 Foundations (auth & account screens)
*Ten screens, assigned to M13 on 2026-08-02 as the component library's first real consumer: login, signup, box picker, check-email, verify, forgot, reset, join,*
*account/security, account/email.*
- `verify.page` does not auto-select a box even with a single membership (pre-existing M8; the M9 e2e
  routes through `/auth/boxes` to work around it).
- join page: accept/register tail duplication; login link is a plain href, not `routerLink`; admin pages
  use `ngOnInit` without `implements OnInit`.

### → Project 2 The Room
- Score grid: no auto-advance to the next athlete, no Enter-to-save, no sticky clock while scrolling to
  Scores, Reset zeroes elapsed with no confirm, no hint text on EMOM/Tabata fields.
- Coach check-in long-press maps to contextmenu (desktop right-click); verify iOS Safari on a real device.
- Timer initial-GET has no distinct loading vs empty state.

### → Unscheduled chore
- Impeccable detector false-positive: Angular `[src]` bindings inside `@if` guards trip `broken-image` —
  consider a repo-level ignore if the noise annoys.
- **Nothing in the app links from one shell to another, so a `BOX_ADMIN` cannot reach `/coach` or
  `/athlete` except by typing the URL.** `roleGuard(['ATHLETE','COACH','BOX_ADMIN'])` admits them and
  `roleGuard(['COACH','BOX_ADMIN'])` admits them, but every `routerLink` in `features/admin`,
  `features/coach` and `features/athlete` stays inside its own area — measured 2026-08-25, zero
  cross-shell links in the codebase. **In a small box the owner coaches and trains, so this is the
  norm rather than an edge case.** Deliberately excluded from M23 by the user (2026-08-25) to keep
  that milestone to box switching; it is filed rather than fixed because the control would sit in
  the same place in the chrome as M23's box switcher, so whoever takes it touches
  `bh-shell-header` a second time. **Not scheduled — needs a destination.**

## Project 2 · The Room *(TV board — owned end to end there)*

- **TV command (M7.5)** — `tv_devices.view`, manual per-device board/leaderboard/timer selection. User has
  confirmed this is genuinely needed, not polish: auto-driven-only TVs aren't realistic for a multi-screen box.
- **Heats/teams** — split the roster into n heats/teams plus a team score model; the runner's roster strip is
  where it slots in.
- Timer audio/beeps + last-3 countdown on the TV (today: visual only).
- Per-device views, timers, PR-celebration takeover.
- **An ACTIVE `TvDevice` keeps its `pairing_code` forever** (`TvPairingService.claim` retains it so the TV's
  in-flight poll still resolves), so the 6-digit code space fills monotonically as boxes pair devices. M11's
  purge only sweeps stale PENDING rows. Null the code once the first post-claim poll succeeds.
- Admin TVs page: `renameTv()` service method has no UI hookup (list is claim + remove only).

## M15 · Programming & tracking depth  *(after M12 — these ship screens)*

- **Types-page fan-out** (image/skeleton applied per weekly slot row) — a partial failure leaves slots inconsistent. Descoped from M12b: the suggested fix is making "class type" a first-class entity, i.e. a schema refactor rather than a bug fix.
- Movement media: videos, coaching cues, images (seed is names + category + modality only).
- WOD versioning / revision history / comments.
- **Snapshot-on-publish** — editing a published WOD is currently live, so athletes see edits immediately,
  including after scores exist.
- Tag system + search-by-movement across the WOD library.
- Structured minute-by-minute EMOM/interval modelling (hybrid text lines cover it for now).
- Bulk-copy a full week to another week / programming-cycle templates.
- **Load unit (kg/lb) per-box setting + conversion** — loads are unitless product-wide today, and the
  leaderboard hero makes it louder. *(Was filed twice, M4 and M5.5.)*
- Rep-adjusted 1RM estimation for PRs (auto-PR is raw best-load, rep-agnostic).
- Score photos/videos; comments/reactions on scores.
- Cross-box/global benchmark leaderboards (e.g. an all-boxes Fran board).
- Advanced charting: zoom, multi-movement overlay, PR trend lines.
- Realtime/live leaderboard push for athletes (the athlete board is on-load only; the TV already has SSE).
- Offline IndexedDB score queue — the runner grid is optimistic + per-cell retry, so a mid-outage reload
  loses unsent cells.
- FOR_TIME cannot be armed without a cap (`buildSpec` requires `totalSeconds>0`) — uncapped count-up
  For Time is unsupported.
- "Bookings open at" windows (a class that opens for booking at a set time).

## M16 · Payments depth  *(after M12)*

- Stripe recurring / auto-renew (v1 is Checkout, one payment per period, manual renewal driven by the lapse email).
- Class-packs / credit punch-cards (N-session decrementing buckets) — v1 entitlements are UNLIMITED or WEEKLY_LIMIT.
- **Full entitlement model on a plan (user-stated 2026-08-22).** Today `Plan` carries ONE field,
  `weekly_class_limit` (`Plan.java:17`). The asked-for shape is six independent limits, each
  nullable = infinite: **daily**, **weekly**, **monthly**, **total entries**, **total
  cancellations** — plus **a per-athlete entry ledger** so every booking an athlete has ever used
  is tracked and countable, which is what makes "total possible entries" enforceable at all rather
  than merely displayed. Note this subsumes the class-packs line above: an N-session decrementing
  bucket IS "total entries" with a counter behind it, so build them together or the second one
  rewrites the first.
  **Sequencing risk, flagged rather than decided:** this changes `Plan`'s shape and the booking
  engine's entitlement check, and **six Phase 2 screen milestones (M23 → M26) render and edit plans
  against the current one-integer shape.** Landing it after them means rewriting those screens —
  the exact "building on a wrong shape" cost M13f existed to avoid. The schema half may deserve to
  come forward as its own small milestone before M23, on the same argument. Decide before M23's
  spec is written, not after.
- Reusable named per-user discount catalog (a "20% student" rule that auto-reapplies on renewal) — v1 stores
  the agreed price per subscription.
- Online per-user discounts / Stripe coupons — self-serve Checkout charges list price only.
- PDF receipts (v1 is a printable HTML page).
- Proration / plan-change mid-period; refunds; grace-period window on lapse; pending-confirmation offline handshake.
- Stripe Connect (OAuth, no stored keys) — revisit post-v1 if BoxHub ever takes a cut.

## M17 · Platform & accounts  *(after M12)*

- **Superadmin account model** to replace the `BOXHUB_SUPERADMIN_EMAILS` env allowlist — no account, no
  per-superadmin identity beyond the email claim. *(Was filed twice, M8 and M11.)*
- **Full audit log** — every admin action and member-data access, hash-chained/immutable rows, retention
  policy, search + filter UI, export. M11 ships only the minimal superadmin lifecycle log.
- Box deletion / box-level data export — BoxHub is the processor, the box is the controller; separate design.
- Existing logged-in user creates a second box ("Start your box" while authenticated).
- Slug rename + freeing the slugs of REJECTED boxes.
- Waitlist auto-notify when capacity opens (M9 is capture-only; contact is manual).
- Approval SLA / reminder emails for boxes sitting in the pending queue.
- "Your password was changed" notice email to the old address (standard account-security practice).
- Bound the `@Async` Mailer queue before any bulk/broadcast email feature (Spring's default executor is
  unbounded — fine at pilot mail volume).

---

## Watch-list — correct today, revisit when the named trigger fires

*Deliberately unscheduled. Every one is marked "fine at pilot scale" in its original review; scheduling them
now would be speculative work with no load data behind it.*

- `MemberController.toDto` runs `activeFor` + a plan lookup per row — a 100-member page costs ~200 extra
  queries where the pre-M10 version cost one join. **Trigger:** member lists get slow, or a box passes ~200 members.
- `HistoryController`/`LeaderboardController` use `findAll()` maps for name/context lookup. **Trigger:** a box's
  history grows hot.
- `LiftController /prs` groups in Java over all the athlete's lifts. **Trigger:** an athlete with years of history.
- Invite `pending()` filters in memory. **Trigger:** a box's invite history grows.
- Coach `upsertFor` could use `findByIdAndBoxId` single-query instead of `findById` + lazy box filter.
- **Redis-backed distributed rate limiting** and **Redis pub/sub for the SSE emitter registry** — both are
  per-node in-memory, which matches the one-VPS target. **Trigger:** a second node actually exists.
- **`NG0956` track-by-identity warning during Karma** (found 2026-08-20 in M13f Task 1). Angular reports
  *"tracking expression (track by identity) caused re-creation of the entire collection of size 1"* twice per
  Karma run. Not investigated to a specific `@for`, and deliberately so — M13f's scope is the *test signal*,
  and this is a render-perf smell, not a false gate. Candidates, all tracking a value rather than a stable id:
  `field.component.ts:31` and `select.component.ts:21` (`@for (msg of errors(); track msg)`),
  `benchmark-board.component.ts:54` (`track line`). Re-creating one node costs nothing, which is why this is
  a watch-list item and not a fix. **Trigger:** the same pattern appears on a collection that is actually
  large — a member list, a leaderboard, a booking roster — where re-creating every node on each change
  detection is real work. **First diagnostic step:** the warning fires during Karma, so bisect by running one
  spec file at a time rather than reading the templates.

## Accepted — decisions, not debt

- **`Membership.role`/`status` stay plain Strings rather than enums.** The DB already check-constrains both, behaviour would not change, and the edit churns many files. Retired from M12b as YAGNI.

*Do not "fix" these without re-opening the decision that made them.*

- Refresh-token concurrent double-use race (no row lock; tokens are random and single-use).
- `WodService.deserialize` swallows bad JSON to empty blocks — defensive, and only reachable via direct DB
  tampering since every write goes through `serialize`.
- OPEN-mode signup cap is soft/racy (check-then-act before the tx); APPROVAL-mode is hard (atomic in-tx
  recheck). Accepted at single-node/pilot scale.
- The auth interceptor's `catchError` routes a genuine non-token failure of a refresh-retried request into the
  logout path (pre-M8 quirk, preserved deliberately).
- Interceptor reselect `catchError` rethrows the outer error, not the reselect error — intentional, so the
  caller sees the original 401.
- Frontend concurrent 401s trigger parallel refresh calls (no de-dupe) — cosmetic token churn.
- `login`/`refresh` membership-mapping duplication in `AuthController` — extract a helper at the *third* caller.
- `AuthController.boxToken`'s `userRepo` lookup is load-bearing (`mem.getUser()` is a lazy proxy outside the
  tx, OSIV off) — fetch-join only if it ever matters.
- `payment-receipt.html` divides cents by 100 inside the Thymeleaf template — email cannot route through the
  Angular frontend's formatting, so this is the only backend-side currency formatting. No DTO or stored value
  uses a float.
- `register` timing: the not-proven-by-invite path pays a synchronous `EmailTokenService.issue()` round-trip
  the invite path skips. Theoretical only — an attacker must already hold the 256-bit token to take the fast path.
- The Stripe webhook returns 400 for a **forged signature on a known session id**. Stripe's own convention and
  the only misconfiguration signal an operator gets; exploiting it requires already holding an unguessable
  session id. (The unknown-vs-no-credentials oracle was closed in M11 T6 — both now return 200.)

## Standing instructions

- **Re-verify the CSRF matcher and `securityContext` repository wiring on any Spring Security upgrade** —
  both M8 fixes are coupled to filter-chain internals. **This fired on 2026-07-27:** Spring Boot 3.4→3.5 moved
  Spring Security 6.4→6.5. Re-verified then by the full backend suite (390/0) plus e2e 26/26 on a rebuilt
  stack, which exercises the real cookie + CSRF paths. Repeat this on the next upgrade.

---

## Archive — closed, kept only where the reasoning still matters

**Closed by M13f (2026-08-20)** — the TV timer quarantine (`runner.spec.ts`, "TV shows the clock
when a coach starts a timer"), open since 2026-08-05 as a flake and quarantined 2026-08-06:
- ~~The TV never learns a timer started~~ — frames arrived carrying no timer because
  `TvStateService.compose()`'s `@TenantId` read on `ClassTimer` had no ambient tenant. Fixed as a
  side effect of M21, thirteen days after the quarantine and unnoticed until now:
  `TvStreamService.push()` (`TvStreamService.java:86`) wraps compose in
  `TenantContext.runAsBox(c.boxId(), ...)`, landed in `9b4917e` (2026-08-19). Re-verified 2026-08-20
  by re-enabling the `test.fixme` and running it three times — once on a freshly rebuilt (`down -v`)
  stack, twice more against that same stack without a rebuild, which is the exact condition that
  used to reproduce the failure. All three passed. `test.fixme` deleted at `runner.spec.ts:52`; the
  assertions were not softened, they needed no change. The 2026-08-05 "open flake" entry and the
  2026-08-06 quarantine were one bug, filed twice — both close here together.
  **The generalisable point:** the fix was accidental — nobody set out to fix the TV timer in M21,
  it fell out of the tenant-fail-closed work. A deferred defect list is a hypothesis about the
  current state of the code, not a standing inventory; it has to be re-checked against what actually
  shipped since, not assumed still true.

**Closed by M12a (2026-07-27)** — the whole section is gone, all seven items resolved:
- ~~Per-test e2e DB isolation~~ — the three separately-filed symptoms had one cause. `e2e/tests/_support.ts`
  stamps every created entity with a run id. Proven by running the suite twice against the same stack with
  no reset, which fails before the change.
- ~~`runner.spec.ts` SSE flake~~ — measured first: delivery is 2.34s +/-18ms against a 15s budget, so latency
  was never the constraint. The spec now asserts the SSE frame arrived *before* asserting the clock
  rendered, so a failure names which half broke.
- ~~`TvStreamService` scope test~~ — the old test's comment called a wrong-scope token "impractical" to
  fake. It wasn't. Negative control: removing the scope check yields a 500 (a box token has no `device_id`),
  not a 401.
- ~~`box-settings` partial-patch branches~~ — timezone-only and logo-clear. Blank `logoUrl` maps to null,
  not `""` — the test asserts what the code does.
- ~~Join-fetch regression detector~~ — needed `entityManager.clear()` first, or the lazy proxy resolves from
  the L1 cache and the statement count is 1 either way. Negative control: `expected: 1L but was: 2L`.
- ~~Google race self-verification~~ — a counter on `GoogleLinkTx`, read via a method: direct field access
  NPEs because the bean is CGLIB-proxied and Objenesis skips the constructor on the proxy shell.
- ~~Register concurrent-race path~~ — **was never open.** `RegistrationTest` has raced it since M9
  (`5d86ecd`); the negative control was run against the *existing* test and it failed on `users_email_key`.
  The backlog entry was stale.

**Closed by M12c (2026-07-29)** — no Flyway; the whole section is gone, all four items resolved:
- ~~Google SSO unreachable behind nginx~~ — `/oauth2/` and `/login/oauth2/` proxy blocks, plus an
  explicit OAuth `redirectUri` built from `BOXHUB_APP_URL`. The second half was not in the backlog
  entry and would have left the button dead in production anyway: `CommonOAuth2Provider.GOOGLE`'s
  default `{baseUrl}` template resolves against the request, which behind nginx is plain http on an
  internal host. **`server.forward-headers-strategy` was tried first and rejected** — it installs
  `ForwardedHeaderFilter` globally, which rewrites `getRemoteAddr()` from the client-appendable
  `X-Forwarded-For` and re-opens the rate-limit IP spoofing M1-T9 closed;
  `RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket` caught it as 429 → 401. Negative
  controls: `http://localhost/...` for the redirect_uri, `Received: 200` (the SPA) for the routing.
- ~~compose `:-` secret fallbacks~~ — `env_file` + `docker/.env.example`, all `:-` removed from
  secrets, `docker/.env` gitignored, CI creates it. Proven by contrast: rendering the OLD compose
  file with no `.env` on disk exits 0 and prints the dev JWT secret, Stripe encryption key and media
  link secret in full; the new one exits 1 and renders nothing. `BOXHUB_COOKIE_SECURE` was added at
  the same time — it was set nowhere, so a prod deploy issued auth cookies without `Secure` over
  TLS. `deploy.sh` now refuses a `.env` carrying a DEV-ONLY value **or**
  `SPRING_PROFILES_ACTIVE=dev`, the latter because `DevDataSeeder` is the only `@Profile` bean and
  would seed four demo accounts, one superadmin, on a README-published password into production.
- ~~WebP EXIF gap~~ — WebP dropped rather than patched. TwelveMonkeys, the upgrade path the old
  `ponytail:` comment named, is reader-only and would have silently transcoded the user's file to
  JPEG. WebP appeared nowhere but the allowed-types map and two `accept` attributes.
  `uploadedJpegLosesExifGpsData` stayed green through the collapse, which is what made it safe.
- ~~Email addresses logged in DTO lines~~ — `Mailer` masks (`h***@t.io`, still enough to correlate a
  delivery failure with a member), and `LogHygieneTest` grew two address assertions plus two
  vacuous-pass guards. Found iteratively, each address traced to its source before being redacted:
  `LoginRequest.toString()` → `Mailer`'s `to=` → `CreateInviteRequest` (had no `toString()` at all)
  and `CreatedInviteResponse` (M11 had redacted its `link`, not its `email`). The guarantee's
  remaining limit is filed under Launch → Production above rather than fixed blind.

**Closed by M12b (2026-07-27)** — Flyway V16 and V17:
- ~~Drop the unwritten `memberships.expires_at`~~ — V16. No surviving reader in Java, JPQL or templates.
- ~~Self-serve owner cannot book their own classes~~ / ~~plan-less invitee cannot book~~ — both now get an
  ACTIVE no-expiry subscription on a per-box synthetic `Comped` plan, following V14's grandfather
  precedent (`subscription.plan_id` is NOT NULL, so a plan-less comp is impossible). Proven by tests that
  assert a real BOOKING, not the existence of a row.
- ~~Receipts compute the discount against the plan's CURRENT list price~~ — V16 adds
  `payment.list_price_cents`, snapshotted at both creation sites. Rows predating it stay NULL and the
  receipt OMITS the discount rather than inventing one.
- ~~`checkout.session.async_payment_failed` unhandled~~ — V17 widens the status check; the row goes
  PENDING → FAILED and the member is emailed, idempotently.
- ~~Box timezone unvalidated~~ — rejected on create AND patch (the brief named only patch).
- ~~`checkin`/`uncheck`/`no-show` 500 on a missing `bookingId`~~ — now 400. Fixed with a null check placed
  AFTER the guards, not `@Valid`: `@Valid` runs during argument resolution, so it would have returned 400
  to unauthorised callers and broken `AuthzConformanceTest`'s foreign-box probe.
- ~~`SuperadminAuditRepository` append-only by convention~~ — extends `Repository<>` now, so the guarantee
  is structural.
- ~~Member patch accepts a foreign `planId`~~ — **was never open.** `PatchMemberRequest(String role,
  String status)` has no `planId`; M10 removed it. The entry was stale.

**Closed by M11** (these sat open in the backlog long after they were done):
- ~~Media reads unauthenticated; add signed URLs + EXIF strip~~ — M11 T4. *(WebP gap tracked in M12c.)*
- ~~TV stream token rides a query param~~ — M11 T5, now the `bh_tv` httpOnly cookie.
- ~~Superadmin audit log~~ — M11 T7.
- ~~Per-session kill~~ — M11 T8, `DELETE /api/auth/sessions/{familyId}`.
- ~~No purge job for expired refresh_tokens / invites / TV pairing codes~~ — M11 T10.
- ~~Audit all `@TenantId` entities for tenant-agnostic JPQL~~ — M11 T3; `docs/TENANCY.md` is now the
  convention note, and the audit found a 4th live instance on the public invite preview.
- ~~The Stripe webhook's unknown-vs-no-credentials existence oracle~~ — M11 T6, both paths return 200.

**Dead — the thing they describe no longer exists:**
- ~~`program_slot` unique-conflict surfaces as 500~~ — `program_slot` was **dropped in M5 (Flyway V7)**.
- ~~Coach bulk score-entry grid~~ — shipped as the M7 runner score grid.
- ~~Login page `selectBox` failure is silent~~ — fixed in M9 T7 (error arms on both call sites, with specs).

**Moved, not dropped:**
- ~~2FA / TOTP for box owners + superadmins~~ — promoted to a real milestone, **M14**, on the v1 roadmap.

**Closed in M0/M1:** box-token renewal on refresh (M1-T10) · auth rate limiting (M1-T9) · memberships FK
on-delete (M1-T1) · refresh discarding memberships (M1-T14) · invite email delivery (M8-T11) ·
server-side logout/revocation (M8 + M11-T8).

## Watch-list addition — Karma → Vitest

**Trigger: the Angular release that actually removes the karma builder.** Not Angular 22 — verified
2026-08-02 that `@angular-devkit/build-angular@22.1.2` ships `karma` with a `karma ^6.3.0` peer
dependency. A secondary article claimed 22 removed it; the same article also named a migration
schematic (`ng generate @angular/core:karma-to-vitest`) that does not exist, which is what prompted
checking the package directly.

When the trigger fires: 43 spec files, 30 using `HttpTestingController`, 7 using `spyOn`, 4 using
`fakeAsync`, 2 using `tick`. `@angular/build`'s vitest runner carries no Jasmine compatibility shim,
so those need real translation rather than a config flip. Do it with a supported migration path, not
the experimental hidden `refactor-jasmine-vitest` schematic.

**Not a performance argument.** Karma runs the 184 specs in ~4 seconds.
- `--faint` on `--surface-2` measures 4.27:1 and fails WCAG AA. Fixed so far only where M13c/M13d owned the code (bh-field + bh-search-bar placeholders, box-picker's role label). ~19 other files use the pairing, all on M15/M16-owned screens — sweep them when those milestones rebuild. The token's documented 5.1:1 is against `--ground`; measure against the surface the text actually sits on.
- box-picker's pending row swaps the role label for "Opening…" with no `aria-live` region, so a screen-reader user relies entirely on `aria-busy` support. P2 from the M13d Task 12 critique.
- Four M13d screens (check-email, verify, forgot, and box-picker in its own variant) each carry a private copy of the same "move focus after a state swap" helper — `afterNextRender` + `querySelector` + conditional `tabindex="-1"` + `focus()`. Extract one shared helper in M13d Task 21's consistency pass; not done per-screen because it would edit screens already built, critiqued and closed.
- DESIGN-LAW QUESTION (needs the user, not a fix): `--focus` is `var(--volt)`, so a focused-and-invalid `bh-field` renders a volt outer ring around a danger border. Volt otherwise means live/now/primary and is never a status colour. Decide whether the focus ring should invert on an invalid field. Product-wide — every form field. Raised by the M13d Task 16 critique.
- `bh-field` has no persistent hint slot: `min 10 characters` guidance sits in the placeholder and vanishes on the first keystroke, so the requirement is only visible before typing and after failing. Needs a new input on a component with 20+ consumers.
- reset's two routes into the expired branch (no token at init, and a 410 mid-submit) render identical copy; the 410 route never tells the user the password they just submitted was not saved.
- BUG (invalid content model, pre-existing): `frontend/src/app/features/programming/wod-library.page.ts:16` nests `<bh-button>` inside `<a routerLink>`, producing a `<button>` inside an `<a>`. Found by the M13d Task 17 executor while checking whether `bh-button` supports routerLink.
- COMPONENT QUESTION, now with two real consumers: `bh-button` has `href` (real/external navigation) but no `routerLink`, and its docstring says internal navigation should be a text link instead. M13c deferred this to "M13d with real consumers in front of it" — M13d Task 17 wanted a volt primary that navigates internally and settled for a text link. Decide once, with the wod-library bug above in view: either add routerLink support, or affirm the text-link rule and fix wod-library to match.
- `verify` and `account/email` both collapse every non-410 failure (500, timeout, 403) into "this link is invalid", with no retry offered — a transient server error is misdiagnosed as a bad link. Fix both together, or they split.
- `account/email`'s route title is static ("Confirm email") across all four outcomes; a multi-tab user cannot tell from the tab whether it succeeded.

## The account area — SHIPPED in M13e (2026-08-17)

This section used to propose the milestone. It is done and merged: `/account` is a routed area with
a session-only guard, a layout (lateral nav at desktop, list -> detail on phone) and four sections;
a password change now mails a notification; the sessions list shows a readable device label.

What was **not** done, and is genuinely still open, is filed as individual lines above rather than
here — desktop sparseness, the heading tier, the `bh-button` API consolidation, the delete sheet's
missing axe coverage, and the gallery's scroll-coupled baselines.

## ~~dependency-scan is red on main (not caused by M13d)~~ — RESOLVED, verified 2026-08-25

> **No longer true.** `dependency-scan` has passed on `main` at every run checked: `ef4a8a6`,
> `3bf0d56`, and the scheduled run on 2026-08-24. The advisory that caused it cleared on its own, as
> a newly-published advisory against an unchanged dependency eventually does. **`osv-scanner.toml`
> was never touched, which is the right outcome** — nobody reached for the ignore file. Kept below
> for the reasoning, which still applies the next time it fires.

### Original entry
- `osv-scan` exits 1 against `backend/target/bom.json` (107 packages). It **first failed on the scheduled run at 04:40 on 2026-08-17, before M13d merged**, and last succeeded 2026-08-10 — so it is a newly-published advisory against an unchanged dependency. Verified M13d changed no dependencies at all: the only `package.json` diff in the whole milestone adds an `extract-i18n` npm script, and the scan gates the backend SBOM only.
- The workflow has no severity threshold by design — it fails on any finding — and `osv-scanner.toml` at the repo root is the documented place for findings that are real but deliberately not blocking. Read the advisory first and decide; do not reach for the ignore file by reflex.
- `passwordErrorMessage()` (`frontend/src/app/core/auth/auth.models.ts:28-34`) returns **unmarked English** for `PASSWORD_TOO_SHORT` and `PASSWORD_BREACHED`, so those two sentences are untranslatable. Six consumers now: reset, signup, join, start-box, the legacy security page, and M13e's password section. Repeatedly described as "already filed" during M13d and M13e — it was not; a reviewer grepped and found no entry. Filed now.
- `AccountService.startEmailChange` sends its confirmation mail from **inside** an `@Transactional` method, violating the project's mail-fires-strictly-after-commit rule. `Mailer.send` is `@Async`, which moves it off-thread but does not make it after-commit — so a rollback after the send still leaves the mail delivered. Pre-existing, found while adding the password-change notification (M13e Task 10), which deliberately puts its own send in the controller for exactly this reason. Fix by moving the send to `AccountController` after the service call returns, as the password path now does.
- Account area, desktop: the content is a 900px column centred in a 1440 viewport, so the fields occupy roughly a third of the width with dead space right and below. Same family as the original "clamped, no side space" complaint, milder. Raised at M13e review; user chose not to fix then.
- Account area: the in-page section heading duplicates the active nav item on desktop ("Password" appears as both). Could drop the heading at desktop only, keeping it on phone where the nav is hidden. Raised at M13e review; user chose not to fix then.
- Account area: the phone MENU state (the list half of list→detail) has no visual-regression baseline, so nothing guards the layout the user originally objected to. Raised at M13e review; user chose not to add it then.
- The dev gallery's `data-gallery` sections are coupled through scroll position, so any edit that changes one section's height cascades dirty visual baselines for every section after it — M13e's `solid` addition dirtied 54 unrelated files this way. Decouple by resetting scroll/viewport per section screenshot so gallery growth stops churning the whole baseline set.


## M16a leftovers (2026-08-22)

- **No-show fee** (M16). A fee is money — Stripe, receipts, proration — which the M16a spec §1.1
  assigns to M16, not to the entitlement model. M16a already gets the *entitlement* half right with
  no flag needed: a `NO_SHOW` booking was never cancelled, so its `ENTRY` ledger row stays unrefunded
  and the class stays consumed. Raised by the user at M16a's design; scoped out deliberately, not
  forgotten.
- **Per-limit 409 reason on booking** (M14b/M17). `BookingService.book` reports the bare
  `LIMIT_REACHED` because `frontend/src/app/features/athlete/book.page.ts:166` switches on that exact
  string and M16a freezes every frontend number. `entryLimitViolated()` already names which of the
  eight rules bound; it reaches the wire when the athlete booking screen is rebuilt and can render it.
  The screen's copy is also stale — it says "weekly class limit" for what is now one of eight.
- **`CANCEL_LIMIT_REACHED` has no copy** (M14b/M17). `book.page.ts`'s `reason()` has no case for it,
  so a cancellation blocked by a plan's cancellation limit currently renders the generic
  "Something went wrong — try again."
- **Delete the `entitlement` / `weeklyClassLimit` wire shim** (M14b/M17). Both columns are gone; the
  fields are derived in `PlanController.PlanDto` and `SubscriptionController.PlanSummaryDto` purely
  so `plans.page.ts` and `membership.service.ts` keep working. `PlanController.requireWeeklyLimit`
  goes with them. Whichever milestone rebuilds the plan admin screen owns this.
- **No box settings UI for the cancellation policy** (M15). `boxes.allow_late_cancel`,
  `late_cancel_refunds_entry` and `count_waitlist_cancellations` are served and PATCHable on
  `/api/box/settings`, but nothing renders them — M15 is where the box-settings screen gets its UI.


---

## Owned by the v1.0 programme (2026-08-22) — not open backlog

The Wodify feature-gap audit produced these; each now has a milestone in
`docs/ROADMAP-AT-A-GLANCE.md`. Listed so nobody re-files them as unscheduled.

| Item | Owner |
|---|---|
| In-app messaging, staff↔member threads, notification inbox, SMS | **M29** |
| Digital waivers, e-sign, versioning, re-sign on change | **M30** |
| POS / retail / add-to-invoice, family groups & shared payments, payroll calculator | **M16** |
| Lead management, conversion board, campaigns, automation rules engine, at-risk | **M32** |
| Pre-built reports, insights dashboards, LEG / ARM | **Analytics brief** (written 2026-08-27) → M15 / M16 / M18 |
| **Lifecycle seed data** — `DevDataSeeder` emits no `membership_event` rows, so a LEG/churn screen renders empty against demo data. M39 left this deliberately: a blanket JOINED-for-all would not provide the shapes the screen needs (a churned member, a long-tenured one, a suspended-then-reactivated one). Design it with the screen. | **M15a** |
| Weekly streaks | **M17** |
| Sending mail from the gym's own domain | **M28** |
| Custom branding — **logo and name only** | **M15** |
| **Importing a box's existing data from Wodify / PushPress / Zen Planner / TeamUp / Mindbody** — people, subscriptions, plans, **attendance history**, **WOD scores / benchmarks / lift PRs**, waiver state, schedule, payments. CSV-first with per-platform presets. | **M33** |

**Cut from v1.0:** API access, heart-rate tracking, 24/7 door access control (hardware partnerships,
not code), anything AI, per-gym website builder, per-gym theming.

**Deferred with a trigger:** on-demand media library — reopens when rxed earns enough to upgrade the
server (`docs/VPS-DEPLOYMENT.md` flags the storage limit). Custom report builder — v1.1.

**Editing a class's programming DELETES every score logged against it (found by the analytics
brief, 2026-08-27). Live and reachable — needs a decision, not a quiet fix.**
`PUT /api/box/sessions/{sessionId}/items` calls `items.deleteBySessionId(sessionId)`
(`programming/SessionItemController.java:94`) and recreates the items fresh, and
`wod_score.session_item_id` is `on delete cascade` (`V7__class_model.sql:53`). There is **no guard
on existing scores and no date guard** — it works on a class that finished last month. A coach
reordering two pieces, or fixing a typo, after a class has been scored silently destroys every
athlete's result for that class. `M33` names performance history as *the real switching cost for a
CrossFit box*, which is what makes this expensive rather than annoying. Verified directly, not
inferred. **Open question: fix now as a defect, or fold into `M14c-a`, which rebuilds the builder
anyway?** Full context: `docs/superpowers/specs/2026-08-27-analytics-brief.md` §2 D-1.

**A TV SSE push can go missing, and the TV is dropped silently (OPEN — found 2026-08-28).**
Evidence, from a CI failure rather than a theory: the TV's `data-frames` attribute sat at **2** for
the entire 15s window, across 34 polls, while the coach armed AND started a timer — each of which
publishes `TvStateChanged`. So at least one push never reached a connected, live TV. Not a pairing or
connect-latency problem: the spec now waits for the TV to go live first, and it had.
`TvStreamService.push()` removes a connection on ANY exception, so a board silently stops updating
and the only symptom is a stale screen in a gym. **M39+ added a WARN there**, so the next occurrence
leaves evidence — before, it left none, which is why this has never been diagnosable.
**Not yet root-caused.** Candidates: an emitter erroring mid-push and being dropped, or the event
firing inside `TimerService.act`'s transaction. Needs instrumentation plus a repro under load; the
30s sweep masks it in production, which is why no gym has reported it. **Owner: M37** (The Room: the
TV) — read this before rebuilding the whiteboard.

**TV timer e2e went red in CI on 2026-08-28 — the spec now asserts the product's real contract.** `runner.spec.ts` "TV shows the clock when a coach starts a timer" failed once in CI with
`data-timer="none"`, the same SYMPTOM as the M21 tenancy bug M13f closed — but a different cause.
The tenancy guard is intact (`TvStreamService.java:86`), and `connect()` sends an initial snapshot
synchronously, so no event is ever lost. The spec was simply timing the wrong thing: its 15s budget
had to cover tv-shell's **3000ms pairing poll**, the EventSource connect AND the push, and on a
loaded CI runner that is not always enough. It waits for the TV to go live before the coach
starts the timer, and asserts within **35s** rather than 15s. That number is derived, not picked:
`TvStreamService`'s 30s sweep is the system's GUARANTEED delivery path, and an event push is the
fast path, not the promise — so a shorter assertion demands more than the product offers.
**`retries: 0` is load-bearing** and was not touched; `playwright.config.ts` records why.

**Dev seeder loses a class near midnight (found M23, pre-existing).**
`DevDataSeeder.todaySession()` places the two demo classes at `Instant.now().minus(20m)` and
`Instant.now().plus(40m)`, and its comment claims this holds "regardless of seed time". It does
not: the offsets are raw instants with no clamp to the box's local day, so seeding within ~40
minutes of midnight pushes one class out of the box-timezone "today" the coach screens query.
Measured 2026-08-26/27 — at 23:46 `Burn It` landed on tomorrow and `programming.spec.ts` failed;
at 00:02 `WOD Class`/Fran landed on yesterday and `tracking.spec.ts` + `runner.spec.ts` failed.
Both are green outside the window. Fix: clamp both sessions to the box's local day (e.g. seed at
fixed local hours) rather than offsetting from now. Until then CI is time-of-day dependent.

**Write-path abuse limits are near-absent, and it is a class, not a bug (found M29a, mostly pre-existing).**
`AuthRateLimitFilter.WRITE_PATTERNS` is an explicit four-path allowlist — `/api/box/invites`,
`/api/box/media`, `/api/box/subscriptions/checkout`, `/api/box/sessions/*/book`. Everything else
falls through to the global ceiling alone: **1200/min, and keyed on IP, never on the user**
(`globalCounters.get(ip, ...)` — there is no per-membership dimension anywhere in the filter).
Measured 2026-08-29: **47 POST endpoints, 4 rate-limited. 41 request records, 11 carrying `@Size`.**
Two consequences, both real:
- A logged-in member can create ~1200 rows/min on any write endpoint. `POST /api/box/lifts` is the
  worst shape found — **ATHLETE**-reachable, unbounded rows, and a free-text `String notes` with **no
  `@Size` cap at all**. It pre-dates M29a. `POST /api/box/me/thread/messages` (M29a) has the same
  absent limit but does cap body at 4000.
- Because the buckets are per-IP and **a whole gym sits behind one NAT address** (`application.yml`
  says so verbatim), one member spamming burns the shared ceiling and can 429 their own coaches
  mid-class — which that same comment calls "a product bug, not a save".
**Do NOT fix by adding paths to `WRITE_PATTERNS`.** That bucket is per-IP and already holds
`booking`; `application.yml` records that it has never been measured against a class-opening rush,
so widening it makes a false 429 on booking *more* likely. The correct shape is a per-membership
limit keyed on `TenantContext`, plus `@Size` on every free-text field. Owned by **M40**.

## M29a §10 — deferred out of messaging, closed 2026-09-02

Recorded at milestone close so the next reader knows these were decided, not missed.

- **Notification events, the global in-app inbox, the shell bell** — **M29b**, execution position 8,
  the next milestone. `docs/NOTIFICATIONS.md` is the registry; its §4.2.1 records exactly what M29a
  left ready for `NEW_ANNOUNCEMENT`, including that M29b must **share
  `announcement_recipient.read_at` rather than invent a second read state**.
- **Push delivery** — **M27c**. Until it ships, a message to a coach is seen when the coach next
  opens rxed; an announcement reaches nobody who does not open the app. Known deferral (A1.8 #1),
  not an oversight.
- **SMS, automation rules, campaign builder** — **M32b**.
- **Member ↔ member messaging** — **permanently out**, not deferred. It would mean moderation,
  blocking and abuse reporting for a community that already lives in WhatsApp.
- Attachments and images, message search, message edit/delete, scheduled sends, typing indicators.
- **Per-thread rate limiting** — the abuse surface is a member spamming their own conversations.
  Folded into the M40 item above; note `POST /api/box/conversations/{membershipId}/messages`
  replaced the `me/thread` route named there and caps its body at 4000.
- **Unifying `HomeController`'s 7-day athlete expiry banner with `EXPIRING_SOON_DAYS = 14`.**
  Deliberately left alone: it answers a different question ("is *my* plan about to lapse") for a
  different reader. **Resolve it before `SUBSCRIPTION_EXPIRING` ships**, or the notification badge
  and the home banner will disagree on screen about who is expiring.

### Found during M29a, not owned by it

- **`bh-button`'s `solid` variant reads as barely a button** when it is a screen's single primary
  action: measured `--surface-2` (#1d231e) on a `--surface` (#151a16) card, separated only by a 1px
  hairline. Not a design-law violation — volt would be wrong on a plumbing screen and `solid` is the
  documented alternative — but `solid` was shaped for screens with several co-equal actions, so a
  lone primary action inherits the wrong emphasis. Raised by the announcements critique (P2, twice)
  and **put to the product owner rather than changed**: the fix is a new shared treatment
  (`--bone`-filled, dark text, still not volt) that every zero-volt screen would inherit, so it owes
  a dev-gallery section and new visual baselines. Compounds at the confirm dialog, where the
  point-of-no-return button carries the same low-contrast treatment.
- **The confirm sheet does not restate the message body**, only the recipient count and audience —
  it relies on the composer being visible behind the sheet, which is not guaranteed for a long
  message (the body allows 2000 characters). Recognition-rather-than-recall gap, P3.
- **No way to duplicate or resend a past announcement**, though the outbox sits directly above the
  composer showing exactly that need. Possibly deliberate friction (every send stays a conscious
  act); a product question, not a defect.

### Found during M29b, not owned by it

- **`NEW_MEMBER_JOINED` has no trigger and ships unemitted.** There is no route by which somebody
  joins an *existing* box other than accepting an invite (which is `INVITE_ACCEPTED`'s). The only
  non-invite membership creation is `BoxSignupTx`, which makes a box and its owner together, so the
  notification would tell the new owner that they themselves joined. The enum constant stays; the
  milestone that adds a **public self-signup to an existing box** emits it in one line. Full
  reasoning in the M29b spec §5.3.

- **Admin shell overflows horizontally on mobile (401px floor at 320/360/393).** Pre-existing, not
  M29b: the header's own children fit (last ends at 381 of 393) and hiding the dock changes
  nothing, so a grid item under `.admin`'s single mobile column carries a 401px min-content that
  neither `grid-template-columns: 1fr` nor `main { min-width: 0 }` collapses. M29b's header bell
  briefly took it to 447; moving Security and Log out into the profile sheet returned it to its
  pre-M29b 401. Needs a bisect of the column's grid items. Admin is desktop-first, so this is a
  polish item, not a pilot blocker.

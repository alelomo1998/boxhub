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

*The deploy itself. Not scheduled into a milestone — this is the launch phase on the v1 roadmap.*

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

## QUARANTINED — the TV never learns a timer started (`runner.spec`, 2026-08-06)

**Status: the bug is real and unfixed; the test is `test.fixme()`d so it stops holding the build
red.** `e2e/tests/runner.spec.ts`, "TV shows the clock when a coach starts a timer".

**Why quarantine rather than fix:** the TV is **Project 2 (The Room)** and Project 1 does not ship
it, so a Project 2 defect should not gate Project 1's build. That is a scope decision taken
deliberately with the user on 2026-08-06 — **not** a judgement that the bug is minor. It is a real
defect in shipped code, and the board on the wall is this product's stated wedge.

**What was preserved rather than thrown away:** the original test did three things and only the third
was broken. It is now split, so `coach arms a timer from the runner and starts it` **still runs and
still gates** — the coach writes server-authoritative timer state and reads it back, with no SSE
involved. Only the TV's observation of that state is quarantined. Suite is 28 passed + 1 skipped.

`fixme` rather than `skip` on purpose: it stays visible in every run's output as unfinished work,
instead of quietly disappearing the way a skip does.

**RE-ENABLE WHEN** Project 2 starts, or `compose()`'s timer lookup is fixed — whichever comes first.
Delete the `fixme`; **do not soften the assertions.** They are correct and the product is not.

Verified after quarantining: 28 passed on a `down -v` stack **and** on an immediate second run
against that same stack — which is the exact condition that reproduced the failure.

---

### The evidence, kept because the next person should not have to re-derive it

`main` was red from 2026-08-05 until this quarantine.

```
2026-08-06  21aab79  failure   <- M13b merge
2026-08-05  2ea5e41  failure
2026-08-05  f894004  success   <- a RE-RUN of a commit that had already failed
2026-08-02  3d0824d  failure
```

Every failure is the same single assertion, `runner.spec.ts:45`, with 27 of 28 passing. **M13b did
not cause it** — it was already failing on `2ea5e41`, before the milestone branched — but M13b
merged onto a red `main` and `main` is still red.

**The "non-deterministic flake" label was wrong**, and it came from one re-run passing. Two of the
last three runs failed, on different commits, with the same signature.

### What is now established

The `data-frames` counter M12a added is doing its job. Across three failures:

| Where | frames observed | data-timer |
|---|---|---|
| CI `2ea5e41` | 0 → 1 | `none` throughout |
| CI `21aab79` | 0 → 1 → **2** | `none` throughout |
| Local, dirty stack | 0 → 1 | `none` throughout |

**Frames arrive and carry no timer.** That eliminates SSE transport, the 15s budget and the `/app`
move — all previously suspected. The bug is that the composed `TvState` has no running timer at a
point where the coach has already started one.

**It reproduces locally on demand**: run the e2e suite twice against one stack. It failed twice in a
row that way, including a solo re-run, and passed 28/28 on a `down -v` rebuilt stack. Nobody needs to
wait for CI any more.

### A hypothesis that was checked and does NOT hold

`TimerService.act()` is `@Transactional` and publishes `TvStateChanged` **inside** the transaction
(`TimerService.java:65`), which looks exactly like the inverse of this project's "mail strictly after
commit" rule. It was checked and it does not explain the failure: `TvStreamService.onChange`
(`TvStreamService.java:63`) is a plain `@EventListener`, so it runs **synchronously on the calling
thread**, and `TvStateService.compose()` is `@Transactional(readOnly = true)` with default
propagation — it joins the caller's transaction and therefore *should* see the uncommitted write.

Recorded so the next person does not spend the same hour confirming it. It is still worth re-checking
against `runAsBox`, which swaps the security context before composing, since a *new* transaction
opened there would see a different picture — that was not verified either way.

### Next step

Add logging inside `compose()` for the timer lookup specifically, then reproduce with the
two-runs-one-stack recipe. The question to answer is narrow: at the moment a frame is composed, does
`timers.findBySessionId(...)` return an empty result, a `PENDING` row, or a `RUNNING` row that is
lost later in the mapping?

---

## Open flake — `runner.spec` data-timer half, first seen 2026-08-05

**M12a predicted this exact case and said to revisit if it happened. It happened.**

On the M13a merge commit, CI's e2e job failed at `runner.spec.ts:45`:
`expect(tv-stream).toHaveAttribute('data-timer','RUNNING')` → **received `"none"`**, 27 passed / 1
failed. **Re-running the same commit passed.** Non-deterministic, and therefore not an M13a
regression — but a flake at `retries: 0` erodes exactly what M12a bought when it removed retries.

What is already known, so the next investigation does not redo it:
- M12a *measured* local SSE delivery at **2.34s ±18ms against a 15s budget** — latency was never the
  local constraint, and it ruled out a cause without explaining CI.
- The assertion is deliberately split in two so a failure names which half broke. This is the **first
  half**: the SSE frame carrying a running timer, not the clock render. So the frame never showed
  `RUNNING` within 15s.
- CI is ~2.6× slower than local overall (53.3s vs 20.4s for the suite), which does not obviously
  exhaust a 15s budget.
- The `/app` move is **not** implicated: `TvService.stream()` uses `new EventSource('/api/tv/stream')`
  — an absolute path, unaffected by `<base href>`. Checked.

Next step is to capture `data-frames` alongside `data-timer` on failure, which distinguishes "no frame
arrived at all" from "frames arrived carrying no timer" — those have completely different causes
(transport vs. the backend never publishing `TvStateChanged`).

### 2026-08-06, during M13b — that diagnostic fired, and there is now a reliable reproduction

Playwright's call log on the failure reads:

```
 8 × data-frames="0" data-timer="none"
26 × data-frames="1" data-timer="none"
```

**A frame arrived and carried no timer.** That answers M12a's open question and eliminates transport:
it is not SSE delivery, and it is not the 15s budget. The remaining candidates are the backend never
publishing `TvStateChanged` for that transition, or `TvStateService.compose()` snapshotting before the
timer write is visible.

**More useful still: this is reproducible on demand.** It failed *deterministically* — twice, including
a solo re-run — on a stack that had **already run the e2e suite once**, and then passed 28/28 on a
`down -v` rebuilt stack. So the trigger correlates with accumulated state, not with chance.

Two consequences worth holding separately:
- Whoever investigates no longer has to wait for CI to flake. Run the suite twice against one stack.
- **It may not be a flake at all.** "Non-deterministic" was inferred from one CI failure that passed on
  re-run; state accumulation across a re-run would produce exactly that pattern. CI does start fresh,
  so the CI failure is not *obviously* the same phenomenon — but the two should be reconciled rather
  than assumed distinct, and the fixed-name TV devices the `runner`/`tv` specs leave behind are the
  first thing to look at.

## PROJECT 3 (proposed) · Box discovery — the app as a way to FIND a gym

**Raised by the user 2026-08-11. This is a new product surface, not a backlog item, and it needs its
own brainstorm -> spec -> plan cycle before any of it is built.** Recorded here in full so the
thinking is not lost, and filed OUTSIDE the rework program because it does not belong to any
existing milestone.

**The idea:** a user can create an account with no gym, enter the app, and browse the boxes
registered on the platform. rxed becomes two products sharing one account: a way to FIND a box for
the unaffiliated user, and the classic box experience for members. To support it, box registration
asks for far more — location, staff, courses, and whatever else a consultable public box page needs.

**Why this is large, stated so nobody scopes it as "a screen":**

1. **It needs a PUBLIC, CROSS-TENANT read path, and that is the most dangerous shape in this
   codebase.** Every box-scoped entity is `@TenantId`, and `docs/TENANCY.md` is explicit that a
   tenant-less read fails **OPEN to root** rather than closed. A directory reads across all boxes
   with no box token at all. Whatever serves it needs a deliberately designed access path —
   native SQL or an explicit unfiltered projection — plus its own conformance coverage, because
   `AuthzConformanceTest` defaults to DENY and a new public route must declare its intent.
2. **Box registration grows a schema.** Location (and therefore geo/search), staff, courses,
   photos, opening hours. New columns, new admin editing surface, new media handling — note that
   M11 made media reads signed and short-lived, which a PUBLIC page contradicts and must resolve.
3. **Two new public screens** — a directory/search list and a box detail page — which overlap
   **M19 (landing site)**. Ordering between them is a real decision: a public box page is marketing
   register, not product register.
4. **Moderation.** A publicly listed box page is marketing copy the platform hosts. M9 already has
   a PENDING/ACTIVE/SUSPENDED box lifecycle and a superadmin approval queue; a public page probably
   has to hang off that rather than invent a second one.
5. **GDPR.** Staff names and photos are personal data belonging to people who are not the account
   holder. The export and anonymize flows exist and would need to cover it.

**It reverses a decision already shipped.** M13d removed "Create a box account" from login and added
"you'll need an invite from your gym" to signup, because signing up without a gym dead-ends on an
empty box picker. **Under discovery that is exactly backwards** — a gym-less account becomes the
intended entry path and the box picker's empty state becomes a directory. Both changes are correct
for the product as it stands today and must be revisited together the moment this is scheduled.

**Open before anything is built:** is the directory public to the internet or only to signed-in
users? Does a box opt in to being listed? Who edits the public page — the box or the platform? Is
there search by location, and does that mean geocoding? What does the unaffiliated user's app shell
even look like, given the current three shells all assume a box?

## The rework program — items by destination milestone

*The old "M12 · UX/UI rework" section is gone: it was one bucket for what is now eight milestones
(see `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`). Every item below kept its
wording and gained a home.*

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
- **Instance-builder save creates new `wod` rows on every edited re-save** — quick-created pieces become
  library wods each time, so the library grows unboundedly. The fix is dedupe-or-update-in-place, a design
  change to this screen's save model.
- **Day pager** (Book + coach Classes): no swipe, chevrons outside the thumb zone, no week-strip with
  availability dots — paging to the next open class can take 13 taps. 14-day bound.
- Builder score-type select is still a 5-option decision per scored piece.
- No coach-facing help for the skeleton → instance → publish flow.
- Drag-and-drop reorder + drag-to-move calendar slots (today: up/down + click-assign).

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

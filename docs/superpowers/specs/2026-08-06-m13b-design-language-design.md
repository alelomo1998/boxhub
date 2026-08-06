# rxed — Design Language (Design Law v3)

**Date:** 2026-08-06 · **Milestone:** M13b · **Status:** approved direction, pre-build

**This document is binding, and it supersedes `docs/superpowers/specs/2026-07-08-design-system-design.md`
in full — including its "Design law v2 (M5)" amendment.** Where that document and this one disagree,
this one wins. The v2 process rules it carried (state is never silent, WCAG AA, shells, overlays via
`bh-sheet`, the impeccable gate) are **retained verbatim in §11 and §12**, because they were never the
part that was wrong. What is replaced is the *visual* language: the palette, the type, the shape
language, and the effects budget.

The product is renamed here too: **BoxHub → rxed** (`rxed.app`).

---

## 1. Thesis

**A workout is a prescription. `rxed` types it, posts it, and marks where you are.**

The reference world is the CrossFit Open broadcast and `games.crossfit.com`: a black board, hard-ruled
panels, a highlighter marking the live line, and the workout itself typed in monospace like something
handed to you rather than rendered for you. Boldness comes from **contrast and inversion**, not from
glow, gradients, or texture.

This replaces the previous thesis ("broadcast confidence, heritage craft" — warm ink, bone type, race
red). That direction was a competent first draft and it was retired for three stated reasons: it did
not read as a product worth paying for, its warm/brown palette read as dated, and its editorial
treatment bled into plumbing screens that should have stayed calm.

**What carries forward unchanged** is the product thinking, which was never a palette:

> Gyms are dark. The room is the product. Identity lives in hero screens; plumbing stays
> conventional-and-excellent.

## 2. Non-negotiables

1. **Tokens only.** No component or screen hardcodes a colour, font, radius, spacing, duration, or
   type size. Everything reads a CSS custom property. A raw hex outside `frontend/src/styles/_tokens.scss`
   is a bug. (The one sanctioned exception is HTML email — see §10.4.)
2. **Dark only.** There is no light theme. `#0D110E` is the ground, everywhere, always.
3. **Volt is the only accent, and it always means one thing:** *live · now · primary · winning.*
   Two volt elements competing for attention on one screen is a bug. Volt is never decorative and
   never a status fill.
4. **No glow. No gradients. No drop shadows on flat surfaces. No fake textures** (chalk, paper, metal,
   grunge). No skeuomorphism. Depth is a surface ladder plus hairlines.
5. **Identity lives in hero screens, not plumbing.** Buttons, forms and tables stay conventional and
   excellent. Distinctiveness is spent on the surfaces in §8.
6. **Numbers are tabular and monospaced.** Any figure that could line up in a column.
7. **Mono is banned from prose.** It carries the prescription voice (§6.2), never a paragraph.
8. **Respect `prefers-reduced-motion`.** Every animation has an alternative.

### 2.1 Why dark-only, stated so it can be re-opened deliberately

The light theme is deleted, not deprecated: `ThemeService`, the `data-theme` attribute mechanism, the
`prefers-color-scheme` block, and the `@mixin light-tokens` half of the token file all go.

The argument for it: black-and-volt is a dark-native identity, a light rendering of it is a different
and weaker design, and every colour decision made twice is a contrast bug waiting to happen — the
token file already carries two "WCAG AA: relit" comments from exactly that. The gym is dark, the TV is
dark, and the phone in a gym is dark.

The argument against, recorded honestly: outdoor and bright-lobby readability is worse, some users
simply prefer light, and this is a deletion we would have to reverse if a pilot box complains. The
reversal is not free but it is bounded — the token file is the only place the values live, so a light
theme returns as one mixin plus a toggle, not as a rewrite.

**Trigger to re-open: a pilot box asks for it, or an accessibility need surfaces.** Not before.

## 3. Colour

All values are dark-theme values because there is only one theme.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0D110E` | page background — chalkboard black, a trace of green, never warm, never pure `#000` |
| `--surface` | `#151A16` | cards, panels, content areas |
| `--surface-2` | `#1D231E` | raised / inset — inputs, active nav, hovered rows |
| `--hairline` | `#2A322C` | 1px borders, rules, dividers |
| `--bone` | `#F2F4EF` | primary text — 17.2:1 on ground |
| `--bone-dim` | `#A7B0A6` | secondary text — 8.4:1 on ground |
| `--faint` | `#7C8779` | tertiary text, placeholders — 5.1:1 on ground |
| `--volt` | `#DFFF4E` | **the accent.** live / now / primary / winning. 16.9:1 on ground |
| `--on-volt` | `#0D110E` | text on volt — 16.9:1, identical to the inverse |
| `--good` | `#7FBF6A` | positive status (active, paid, checked in) |
| `--warn` | `#F0883E` | caution (expiring, lapsing) |
| `--danger` | `#E5484D` | destructive actions, errors, validation failures |
| `--scrim` | `rgba(6, 9, 7, 0.62)` | overlay scrim behind sheets and dialogs |
| `--focus` | `#DFFF4E` | focus ring colour — the same volt, used as a solid outline |

**Contrast**: the ratios above are computed against `--ground` and are binding minimums, not targets.
Every value must be re-verified in the browser during implementation, and every text token must clear
**4.5:1**. Volt-on-ground and ground-on-volt are both 16.9:1, which is the point of the inversion
device — it is contrast-neutral, so a component can invert without a contrast review.

### 3.1 Red is no longer the accent, so red finally means danger

Under the old law `--red` was simultaneously the brand accent and the only warm signal available, so
error states borrowed the brand colour: `color: var(--red)` appears **84 times** in `frontend/src`
today, mixing "this is primary" with "this is broken". Volt takes the accent role and `--danger`
takes red back for destructive actions and errors only.

`--warn` also moves. At `#E0A32E` it is amber, which is a neighbour of chartreuse and would read as a
weak volt; it becomes orange so that caution and accent cannot be confused at a glance.

**Semantic colours stay quiet.** They are never a fill for a whole row or card — they colour a dot, a
label, or a thin left rule. Volt is the only colour permitted to fill.

## 4. The three devices

The entire visual language is three devices. Everything else on a screen is neutral.

**1. Inversion.** A volt fill with `--on-volt` text. This is how the design says *this one*. It marks
the current line of a workout, the leading row of a leaderboard, the primary button, the live
indicator, the selected segment. Nothing else inverts.

**2. The hard rule.** A 1px `--hairline` divides; a 2px `--volt` border promotes a panel to *the
subject of the screen*. At most one 2px volt border is on screen at a time. This replaces the previous
law's "2px `--bone` for major breaks".

**3. Mono.** The prescription voice — §6.2.

### 4.1 Glow is deleted, and it was mostly a focus ring anyway

The old law rationed glow to three places. Measured in the current codebase, `--red-glow` occurs 57
times in `frontend/src`; two of those are its own token definitions, leaving **55 real uses — and 51
of them are `box-shadow: 0 0 0 3px` or `inset 0 0 0 3px` focus rings.** Only 4 are decorative glow
(`0 6px 24px` ×2, `0 0 14px`, `0 0 12px`). The ration rule was bookkeeping around a focus ring.

- The focus ring becomes a **solid 2px `--focus` outline with a 2px offset**, not a shadow. It is more
  visible, it survives forced-colors mode, and it does not need a ration rule.
- The 4 decorative uses lose their glow. The elements that had them already invert — inversion is the
  emphasis, and a glow on top of it was redundant.

The token `--red-glow` is therefore not renamed to `--volt-glow`; it is replaced by `--focus`, because
that is what it was.

## 5. Elevation

Depth is a **surface ladder plus hairlines**. `--ground` → `--surface` → `--surface-2`, each with a
1px `--hairline`. There are no shadows on flat, in-page surfaces.

The one exception is **things that physically float**: the mobile dock, `bh-sheet`, and dialogs. Those
keep `--shadow-float`, retuned to the new ground. A shadow anywhere else is a bug.

## 6. Type

### 6.1 Faces

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display / UI / body | **Archivo** | 400, 500, 700, 800 | already installed; 800 is added for display |
| Prescription / numeric | **JetBrains Mono** | 400, 700 | new |

**Saira Condensed is deleted.** Self-hosted via `@fontsource` as today (the CSP blocks font CDNs), so
this is a swap of `angular.json` style entries, not a new delivery mechanism. Current entries are
saira 600/700/800 + archivo 400/500/700 (6 files); the replacement is archivo 400/500/700/800 +
jetbrains-mono 400/700 (6 files). No net weight added.

`--font-display` and `--font-body` both resolve to Archivo. They stay two tokens because they mean
different things at the call site, and because a future display face can be swapped in one line.

### 6.2 The prescription voice

**JetBrains Mono carries anything that was measured, prescribed, or counted:**

- workout lines and movement prescriptions
- scores, loads, reps, times, ranks, counts
- the clock, in every form
- eyebrows and section labels (uppercase, tracked)
- table column headers and meta
- codes, IDs, pairing codes, `RX` / `SC` badges

**Archivo carries anything that was written or named:** athlete and coach names, WOD names, screen
titles, body copy, button labels, form labels, help text, error messages.

The test, when it is ambiguous: *would a coach have written this on a whiteboard, or typed it into a
form?* Whiteboard is mono.

This is the identity, and it is the reason the name works: `rxed` types the prescription.

### 6.3 Scale

Tokenised as `--fs-*`; screens read tokens, never raw px. Sizes are fixed rem, deliberately — the
product register is an app, not a document, and `clamp()`-driven display sizes were never used.

| Token | Size | Face / weight | Use |
|---|---|---|---|
| `--fs-hero` | 2.5rem / 40px | Archivo 800, tight tracking | screen titles, hero WOD names |
| `--fs-display` | 1.75rem / 28px | Archivo 800 or Mono 700 | celebrated figures, board names |
| `--fs-h2` | 1.25rem / 20px | Archivo 700 | section headings |
| `--fs-body` | 0.9375rem / 15px | Archivo 400 | body and UI |
| `--fs-sm` | 0.8125rem / 13px | Archivo 400 / Mono 400 | secondary, table cells |
| `--fs-meta` | 0.6875rem / 11px | Mono 400, `0.18em` tracking, uppercase | eyebrows, column heads |

Display sizes take `letter-spacing: -0.02em` and `text-wrap: balance`. Mono takes **positive**
tracking at small sizes and **zero** at body size and above; mono is already wide and tracking it out
at 15px breaks the line length.

The scale is unchanged from M13a in values. It is re-stated here because the faces changed under it,
and because §12 constrains it.

## 7. Space and shape

**Spacing** is unchanged: `--sp-1..10` = 4 / 8 / 12 / 16 / 20 / 24 / 40 / 64. It works, and changing a
working scale would churn every screen for nothing.

**Radius tightens.** The M5.5 scale (10 / 14 / 20) is softer than any reference chosen for this
direction — the broadcast is square, `games.crossfit.com` is square, Linear runs 4 / 6 / 8.

| Token | Was | Now | Use |
|---|---|---|---|
| `--r-ctl` | 10px | **8px** | buttons, inputs, selects, chips |
| `--r-card` | 14px | **12px** | cards, panels, rows-as-cards |
| `--r-lg` | 20px | **12px** | sheets, dialogs, hero containers |
| `--r-full` | 999px | 999px | pills, dock, segmented controls |
| `--r-xs` | — | **4px** | new: badges, small status chips, the `RX` tag |

`--edge` remains an alias of `--r-ctl` — it has **48 call sites** and renaming it buys nothing.
`--r-lg` collapsing into `--r-card`'s value is deliberate: at 20px a sheet read as a consumer app, and
the two tokens stay separate names so a future divergence costs one line.

## 8. Where identity lives

Hero surfaces carry the language and get bespoke attention when their milestone builds them. Plumbing
stays conventional.

- **WOD board** (athlete) — the day's programming, posted. Black panel, 2px volt border, mono lines,
  the current piece inverted.
- **Leaderboard / session results** — ranked, names in Archivo, scores in mono tabular, leader row
  inverted.
- **Athlete PR / progress** — celebrated figures in mono, movement history.
- **Live class runner** (coach) — real-time, glanceable, the clock enormous and in mono.
- **TV / big screen** — its own high-contrast layout on these same tokens. Already forced-dark, so
  §2.1 costs it nothing.

Everything else — auth, admin, settings, forms, tables — is plumbing. Plumbing gets exactly one volt
element per screen: the primary action.

## 9. Shells

**Athlete and coach stay phone-first**: bottom-tab app shells, ≤5 tabs, thumb-zone primary actions,
safe-area aware, `--tap` 44px minimum. Unchanged from design law v2 §4.

**Admin desktop becomes a full SaaS shell.** This is a stated requirement, and the structure largely
exists already — what changes is the treatment:

- collapsible left sidebar with an **icon-only collapsed state** and tooltips on hover
- section labels in mono uppercase (`MAIN`, `SETTINGS`) at `--fs-meta`
- nested items with indent guides
- the user card pinned to the bottom
- top bar carrying page context and the single primary action

On mobile the admin shell keeps the M5 behaviour: bottom tabs plus a More sheet.

## 10. Brand

### 10.1 The name

**`rxed`**, lowercase, always. Domain `rxed.app`. Pronounced "R-X-ed" — Rx as in *as prescribed*,
verbed. It is gym vocabulary, not English, so it survives translation untouched: no `i18n` string ever
translates the brand.

**Internal namespaces do not change**: `com.boxhub.*` packages, `BOXHUB_*` environment variables, the
`bh-*` CSS prefix, database and Docker image names, the `boxhub_tv_paired` storage key. Nobody sees
them and churning them is pure risk for zero gain.

### 10.2 The wordmark and mark — decided 2026-08-06

Purely typographic, cut from JetBrains Mono outlines. **No invented shape.** An invented mark has to
earn its meaning over years; a letterform arrives already meaning something, and it cannot drift
off-brand because it *is* the product's typeface.

**Wordmark:** `rxed`, lowercase, tight tracking. `rx` plain, **`ed` set inside the volt highlighter
block** with `--on-volt` text. The highlighter lands on the suffix, so the logo reads the name as the
verb it is — and it is the same inversion device (§4.1) that runs through the whole product rather
than a separate visual idea bolted on.

**Square mark:** `rx` in a volt block, for the favicon, the app icon, the TV corner and the email
header. It is a crop of the wordmark's container, not of its letters, so it may highlight `rx` while
the wordmark highlights `ed` — the two are never seen at the same size.

Below roughly 24px the mark needs **looser tracking and a heavier weight** than the wordmark; that is
a separate optical cut, not the same file scaled down.

`.app` is not part of any lockup.

#### The accent rule applies to the logo, and it is the reason there are two colour variants

A volt-filled logo sitting in the app header on every screen is a second volt element competing with
the screen's actual primary action, which §2.3 forbids. The logo does not get an exemption:

- **App chrome (athlete, coach and admin headers): the wordmark renders in `--bone`, monochrome, with
  no volt at all.** The logo is chrome, not accent.
- **Volt variant only where the logo is the subject:** the login and signup screens, the mail header,
  the landing site, and the TV idle screen.

#### Deliverables

- **wordmark** SVG in both variants — bone-on-ground for chrome, volt-on-ground where it is the hero,
  plus a ground-on-volt cut for placement on a volt field
- **square mark** SVG, same two treatments, with the small-size optical cut
- **favicon** replacing `public/favicon.ico` (currently the only icon asset — verified 2026-08-06:
  `index.html` references exactly one, `<link rel="icon" type="image/x-icon" href="favicon.ico">`,
  and there is no apple-touch-icon, web manifest or `theme-color`). Adding those is not in scope; if
  the mark makes them worth having, they are filed, not smuggled in.

#### Explored and rejected, so it is not re-litigated

A drawn **℞ monogram** — the real prescription symbol, with its crossbar overshooting the descender
so the glyph and the highlighter were the same stroke — was the only *invented* candidate with a
genuine idea in it, and it was rejected on one ground: out of context ℞ reads pharmacy, not gym. It
survives inside the sport, where "I Rx'd it" is spoken vocabulary, but the M19 landing site has to
work on people who have never set foot in a box.

Also drawn and rejected: a struck `x` (merges to a blob at 16px, and "struck through" reads as
*cancelled* — the wrong verb), and a checkbox (semantically exact, visually indistinguishable from
every to-do app ever shipped).

### 10.3 The rename is four values, not eighteen

The v2 roadmap measured "18 user-facing occurrences — 8 in `frontend/src`, 9 across seven mail
templates". **That count is stale.** M13a's i18n work routed the mail templates through
`messages.properties` with `{0}` brand parameters, and collapsed the frontend occurrences onto
`BRAND_NAME`. Verified on 2026-08-06:

| # | Location | What |
|---|---|---|
| 1 | `frontend/src/app/core/brand.ts:17` | `BRAND_NAME` |
| 2 | `frontend/src/index.html:8` | pre-boot `<title>` |
| 3 | `backend/src/main/java/com/boxhub/shared/Brand.java:17` | `Brand.NAME` |
| 4 | `backend/src/main/resources/application.yml:68` | `BOXHUB_MAIL_FROM` default, including the `no-reply@boxhub.local` sender domain |

Plus **8 non-rendering Thymeleaf `th:text` fallback strings** across the mail templates. They never
reach a user — the real copy comes from `messages.properties` — but they are read by developers, so
they are updated for consistency, and that is the only reason.

Four test files reference `BoxHub` (`SecretDefaultsTest`, `MailTemplatesI18nTest`,
`MailerLocaleResolutionTest`, `OAuth2RedirectUriTest`). Whether any of them *asserts* the string is
checked during implementation; none is assumed either way here.

The javadoc on `Brand.java` and `brand.ts` says a rename is "coming before M13b". After this
milestone it is done — both comments are rewritten rather than left describing a future that happened.

### 10.4 Mail is the one place raw hex is legal

HTML email cannot use CSS custom properties, so the mail templates hardcode the accent: `#D7263D`
appears **8 times** across them. That is the retired race red, and after this milestone it points at a
colour that exists nowhere else in the product.

The mail accent becomes volt — **with `--on-volt` text, never white.** White on `#DFFF4E` is
unreadable, and the current templates set `color:#fff` on the accent button. This is the one sanctioned
violation of §2.1's tokens-only rule, and it is why the backlog item to centralise the mail accent
(filed to M16) is worth doing later; it is not done here.

## 11. Accessibility (retained from design law v2, unchanged)

1. **Text contrast ≥ 4.5:1**, verified in the browser, not asserted from a table.
2. **`:focus-visible` rings everywhere** — now a solid 2px `--focus` outline at 2px offset.
3. **Labels wired to inputs.** Every input has a programmatic label.
4. **`prefers-reduced-motion` alternative for every animation.**
5. **`--tap` 44px minimum** for every interactive target.
6. **State is never silent.** Every fetch renders loading, error and empty states; every save shows
   pending → success or inline error, with the user's input preserved. Gym wifi is a design constraint.

**Colour is never the only signal.** Volt marks the live line, but the live line also carries a label;
`--good` / `--warn` / `--danger` always accompany text or an icon, never stand alone.

## 12. i18n constrains the type scale

Italian and German run **20–35% longer than English**, and JetBrains Mono is wider than Archivo at the
same size. Both facts bite the same place: control sizing.

- The type scale and every control's minimum width are checked against the **longest German string**,
  not the English one. A button that fits "Save" and breaks on "Speichern ändern" is not done.
- **Mono is banned from prose** (§2.7) partly for this reason — a translated mono paragraph is
  unreadable at any line length that fits a phone.
- Buttons and labels wrap rather than truncate. Truncation with an ellipsis is allowed only where the
  full value is available another way (a title attribute, a detail view).
- Numeric-only mono content is immune to all of this, which is most of where mono is used.

## 13. Motion

Unchanged in character: 150–250ms, `--ease-out` exponential, motion conveys state rather than
decorating. Tab swaps, save confirmations, a result posting to the board. No orchestrated page loads,
no parallax, no bounce.

What changes: **emphasis animations no longer fade a glow**, because there is no glow. A thing that
becomes live *inverts*, and the inversion may cross-fade.

## 14. What M13b ships

1. **`_tokens.scss` rewritten** — §3, §6.3, §7 as custom properties. The light-theme mixin, the
   `prefers-color-scheme` block and the `data-theme` selectors are deleted.
2. **`ThemeService` deleted**, with its spec, and unwired from its consumers. Verified references
   today: `app.component.ts`, `app.config.ts`, `admin-shell.page.ts`, `coach-shell.page.ts`,
   `profile-sheet.component.ts`, `tv-shell.page.ts`, plus `theme.service.spec.ts` and
   `app.config.spec.ts`. The theme toggle disappears from every shell's UI.
3. **Font swap** — `angular.json` style entries, `_tokens.scss` family values, `package.json`
   dependencies. Saira Condensed out, JetBrains Mono in, Archivo 800 added.
4. **Token rename** — `--red` → `--volt`, `--on-red` → `--on-volt`, `--red-glow` → `--focus` (with
   the shadow-to-outline change at each of its 51 focus-ring sites). Measured on 2026-08-06 with
   `grep -rho -- '--red[a-z-]*\|--on-red' frontend/src | sort | uniq -c`, which counts the token
   definitions too: **`--red` 100, `--red-glow` 57, `--on-red` 11**, spread across **53 files**
   outside `_tokens.scss`. `--danger` is introduced and the error-state subset of the old `--red`
   uses moves onto it — that subset is identified by reading each site, not by a blanket replace, and
   `color: var(--red)` alone appears 84 times, so the split is the real work in this task.
5. **The proof** — the WOD board and admin members, rendered at a new dev-only route with fabricated
   data. See §15.
6. **Wordmark, square mark, favicon.**
7. **Rename** — the four values in §10.3, the 8 template fallbacks, the mail accent hex.
8. **`DESIGN.md` rewritten** at the repo root.
9. **`CLAUDE.md` updated** — its design-rules block currently states warm dark, race red, rationed
   glow, and a first-class light theme. All four are now wrong.
10. **`PRODUCT.md`** checked for brand and palette references.

## 15. What M13b does NOT ship

**No product screen is redesigned.** M13c rebuilds the component library and M17 rebuilds the athlete
surface; restyling the real WOD board now means building it twice, which is the exact double-work this
rework program exists to avoid. This is a boundary the v2 roadmap already fixed, and it holds.

**The proof is a dev-only route.** Verified on 2026-08-06: `/app/dev/components` **does not exist yet**
— the backlog entry naming it for deletion at launch is forward-looking, and M13c creates it. M13b
creates that route early and puts the two proof screens on it; M13c grows it into the full gallery, and
launch deletes it. One route, one eventual deletion.

The proof renders fabricated data inside the real application: real CSP, real self-hosted fonts, real
tokens, real Angular. That is what makes it a proof rather than a picture — M5.5's font P0 (the brand
faces 404'd for a whole milestone) is exactly the class of bug a static mockup cannot catch.

**Existing screens are not hand-corrected.** Because the token *names* survive, every existing screen
recolours to black-and-volt automatically when the token file changes. Some will look wrong — a screen
built assuming a warm ground will have odd emphasis. That is expected and it is not fixed here; those
screens are rebuilt in M13c–M18. The bar for M13b is that the app still *works* and nothing is
illegible, not that every pre-rework screen looks designed.

**No component is built.** The proof composes what exists. New components are M13c.

**Visual-regression and axe-core checks are not added here** — they belong with the component library
(M13c), because baselines churn while components are still being designed. Already filed.

## 16. Enforcement

- **`_tokens.scss` is the only place raw values live.** A hex outside it — excepting the mail
  templates, §10.4 — is a bug and is greppable.
- **After the rename, `grep -r -- '--red' frontend/src` must return zero.** That is the migration's
  completion test, and it is cheap enough to run in review.
- **`grep -ri 'saira' frontend/` must return zero**, including `package.json` and `angular.json`.
- **No `data-theme`, no `prefers-color-scheme`, no `ThemeService` anywhere in `frontend/src`.**
- The gates are the real ones: `npm test -- --watch=false --browsers=ChromeHeadless`,
  `ng build --configuration production` (the only gate that type-checks Angular templates), the
  backend suite for the rename, and the e2e suite — which includes the font smoke test that exists
  because the brand faces once 404'd in production for an entire milestone.
- **The impeccable gate applies**: shape → build → critique ≥ 28/40, no open P0/P1, before merge.

## 17. Open, and deliberately not decided here

- **The square mark's form** — decided by drawing both candidates in §10.2, not by argument.
- **Whether `--fs-hero` at 40px is enough** for the TV, which is viewed from across a room and today
  overrides sizes locally. The TV is Project 2's surface; M13b does not retune it, but the token file
  should not assume a phone is the only viewer.
- **Icon set.** The backlog records that Unicode glyphs (⎋ ⌘ ◐) read as a placeholder icon system.
  Choosing a real one is M13c's job, with the components that consume it.

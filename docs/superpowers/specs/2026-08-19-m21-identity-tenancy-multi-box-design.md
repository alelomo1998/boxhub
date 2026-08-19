# M21 — identity & tenancy for multi-box (2026-08-19)

**Phase 1, milestone 2 of 2.** Follows M14a. Governs `docs/TENANCY.md`, which this milestone rewrites.
Programme: `docs/superpowers/specs/2026-08-18-v3-roadmap-platform-expansion.md`, M21 section.

The v3 roadmap calls this **the most dangerous milestone in this program** and flags it as
orchestrator-implemented work under `CLAUDE.md`'s "genuinely difficult or delicate" clause. Tenancy is
named in that clause explicitly.

---

## 1. What is already true, verified against the code

Measured on 2026-08-19 by reading the files, not inferred from the roadmap.

**Multi-box already works at the identity layer.** `Membership` is deliberately not `@TenantId`;
`MembershipRepository.findByUserIdWithBox` returns every box a user belongs to; the box picker and the
user-token → box-token exchange ship; `uq_subscription_active` (V14) is unique on `membership_id`, so
two active subscriptions at two boxes is already legal. **This milestone needs no migration. V22 stays
free.**

**Three token shapes** (`identity/TokenService.java`): `scope=user` (no `box_id`), `scope=box`
(`box_id` + `role`), `scope=tv`. Cookies `bh_at` and `bh_bt` (`identity/CookieService.java`), both on
the 15m `access-ttl`; `bh_rt` is `Path=/api/auth`, 30d.

**`shared/CookieBearerTokenResolver` is where the hazard lives.** Header first, then cookies — and
`bh_bt` wins **only** on `/api/box/**`. Everywhere else the user token wins:

```java
if (request.getRequestURI().startsWith("/api/box/")) {
    return box != null ? box : user;
}
return user != null ? user : box;
```

So **any route outside `/api/box/**` authenticates boxless by construction.** `TenantContext.boxIdOrNull()`
returns null → `TenantIdentifierResolver` resolves `NO_TENANT` → `isRoot()` is true → Hibernate
**disables the tenant filter entirely** → the read sees every box. A directory endpoint added at
`/api/directory` inherits that on day one, silently, with no code review signal.

**Fifteen `@TenantId` entities** (the roadmap's "42 files" is files *mentioning* the annotation):
`Announcement`, `Booking`, `ClassSession`, `ClassType`, `Invite`, `Payment`, `Plan`, `ScheduleSlot`,
`Subscription`, `ClassTimer`, `LiftEntry`, `WodScore`, `SessionItem`, `TemplatePiece`, `Wod`.
Deliberately **not** tenant-scoped, each with a written reason: `Box`, `BoxStripe`, `BoxWaitlist`,
`Membership`, `Movement`, `TvDevice`, `SuperadminAudit`, `BenchmarkTemplate`, `User`, `AuthIdentity`,
`EmailToken`, `RefreshToken`, `PlatformSetting`.

**`Movement` is the working precedent for a cross-box read** — not `@TenantId`, read with an explicit
predicate (`MovementRepository.findVisible`): `where m.boxId is null or m.boxId = :box`.

**Exactly one production path relies on fail-open.** `BookingMaintenance.nightlyNoShowSweep` →
`BookingService.sweepNoShows`, whose derived queries on `ClassSession` and `Booking` run with no
security context. Everything else that crosses boxes already establishes a tenant or bypasses the ORM:
`SubscriptionLapseJob` (`boxes.findAll()` then `runAsBox` per box), `SessionGenerator`,
`TvStreamService`, `StripeWebhookController`, `InvitePublicController`, `BoxSignupService`,
`DevDataSeeder`, and the four registered native methods (`InviteRepository#findByTokenHash`,
`#burnIfUnaccepted` and `#purgeAcceptedOrExpired`, plus `PaymentRepository#findByStripeSessionId`).
Note `docs/TENANCY.md`'s native-methods table lists only three — `#purgeAcceptedOrExpired` was added
later and never made the table. Fixing that is part of §4's rewrite.

**The boxless surface today:** `/api/me/**`, `POST /api/auth/box-token`, `GET /api/auth/sessions`,
`DELETE /api/auth/sessions/{familyId}`, `POST /api/auth/logout-all`, `POST /api/invites/{token}/accept`.
`AuthzConformanceTest` files all of them under `NON_BOX_SCOPE` with the value `SELF`.

**The active box is one cookie plus one `localStorage` key.** `bh_bt`, and `bh_active_box` read by
`AuthService.restoreActiveBox`. `localStorage` is shared across tabs.

---

## 2. The four decisions

Taken with the user on 2026-08-19, before any code was written. Recorded so no later milestone
re-derives them.

| # | Decision |
|---|---|
| 1 | **Tenant-less reads fail CLOSED.** `isRoot(NO_TENANT)` becomes false; cross-box access becomes an explicit `runAsRoot` opt-in. |
| 2 | **One active box, plus a staleness guard.** The cookie and the exchange endpoint are unchanged; `/api/box/**` gains an `X-Box-Id` assertion header and a 409 on mismatch. |
| 3 | **A boxless token writes nothing into a box**, except a closed and individually named list of relationship-creating routes. |
| 4 | **M21 ships mechanism, not endpoints.** Phase 1's "no endpoints, no DTOs, no screens" rule holds; the path is proven against routes that already cross boxes. |

---

## 3. Fail-closed tenancy

### 3.1 The flip

`shared/TenantIdentifierResolver` today:

```java
private static final UUID NO_TENANT = new UUID(0L, 0L);

public UUID resolveCurrentTenantIdentifier() {
    UUID boxId = TenantContext.boxIdOrNull();
    return boxId == null ? NO_TENANT : boxId;
}

public boolean isRoot(UUID tenantId) { return NO_TENANT.equals(tenantId); }
```

After M21 there are **two** sentinels:

- `NO_TENANT` (all zeros) — no ambient tenant. `isRoot` returns **false**, so Hibernate enables the
  filter with the sentinel as its value. Every `@TenantId` read returns **empty**; there is no
  `boxes` row with that id, so nothing can ever match.
- `ROOT` — returned **only** when `TenantContext` carries an explicit root flag. `isRoot` returns true
  for it and only for it, so the filter is disabled exactly where someone asked for that in writing.

Write behaviour is unchanged: an insert of a `@TenantId` entity under `NO_TENANT` still stamps the
zeros and still dies on the foreign key. `docs/TENANCY.md`'s failure mode 2 is untouched.

### 3.2 `runAsRoot`

```java
// shared/TenantContext
public static <T> T runAsRoot(Supplier<T> action)
public static void runAsRoot(Runnable action)
```

A `ThreadLocal<Boolean>` set in a `try`/`finally`, restored to its **previous** value rather than
cleared (so nesting is safe). It obeys the same load-bearing ordering law as `runAsBox`: **install it
before the Hibernate session/transaction opens**, because Hibernate resolves and caches the tenant once
at session-open time. A `runAsRoot` inside an already-running `@Transactional` method is a no-op, and
that is the single most repeated tenancy mistake in this codebase.

`runAsBox` wins over `runAsRoot` when both are active — a real box id is always more specific than
"see everything", and the consolidated implementation (§3.3) enforces that rather than leaving it to
call order.

### 3.3 One `runAsBox`, not eight

`runAsBox` is currently copy-pasted as **eight method definitions across seven files**:

| File | Line | Shape |
|---|---|---|
| `box/StripeWebhookController.java` | 249 | `<T> T (UUID, Supplier<T>)` |
| `box/BoxSignupService.java` | 121 | `void (UUID, Runnable)` |
| `box/InvitePublicController.java` | 89, 94 | both |
| `box/SubscriptionLapseJob.java` | 108 | `<T> T (UUID, Supplier<T>)` |
| `box/SessionGenerator.java` | 88 | `void (UUID, Runnable)` |
| `shared/DevDataSeeder.java` | 480 | `void (UUID, Runnable)` |
| `display/TvStreamService.java` | 99 | `<T> T (UUID, Supplier<T>)` |

They move to `TenantContext` as two overloads, and every call site delegates. This is not tidying: with
two sentinels in play, a `runAsBox` nested inside a `runAsRoot` must restore the *root* state on exit as
well as the authentication, and eight independent implementations is eight chances to get that wrong.
The javadoc on each site (which is genuinely informative — `SessionGenerator`'s explains why it is not
`@Transactional`) stays at the call site.

### 3.4 The known caller, and the test that never tested it

`BookingMaintenance.nightlyNoShowSweep` gains `runAsRoot`. It must wrap the **call** to
`bookingService.sweepNoShows`, not live inside it — `sweepNoShows` is `@Transactional`, so by the time
its body runs the session already exists and the tenant is already cached.

Its only test is `SessionApiTest#sweepFlipsPastBookedToNoShow`, and **it runs under
`actAsBox(boxA.getId())`**. It therefore never exercises the tenant-less path the scheduler actually
takes: it would stay green after this flip while the nightly sweep silently stopped flipping anything,
in every box, forever. This is exactly the class M14a paid for — a test that cannot fail against the
bug it appears to cover. Replaced per §7.

### 3.5 The trade this accepts, in writing

An accidental cross-box read goes from **silent-everything** (a breach) to **silent-empty** (a bug).
It does not become loud.

A loud version is deliberately not built. `resolveCurrentTenantIdentifier()` is called for **every**
Hibernate session, including the many that touch no `@TenantId` entity at all (login, register,
`/api/me`, every `Membership`/`Box`/`User` read), and it cannot see which entities the session will
touch. Throwing there breaks the application; throwing only for tenant-scoped entities needs a Hibernate
event listener or a `StatementInspector`, which is more machinery than the residual risk justifies once
the default is closed. `runAsRoot` is greppable, and that is the audit surface.

---

## 4. The boxless session contract

Written into `docs/TENANCY.md` as the rule, not left to precedent.

**A token with no `box_id` claim may READ:**

1. its own account and its own memberships (`/api/me/**`, `/api/auth/sessions`) — unchanged;
2. a **declared public projection** of any box. That projection must come from one of three places,
   and nothing else:
   - a table that is not `@TenantId` (the `Movement`/`Box`/`Membership` pattern, explicit predicate);
   - a `runAsBox(targetBoxId, …)` block, where the target is resolved from the request and the tenant
     filter stays **on**, scoped to exactly that box;
   - a registered `@Query(nativeQuery = true)` method carrying its own `WHERE`, listed in
     `docs/TENANCY.md`'s native-methods table with a written reason.

   A plain derived or JPQL read of a `@TenantId` entity from a boxless path is a bug. After §3 it
   returns empty rather than leaking, but it is still a bug, and the empty result is the symptom.

**A token with no `box_id` claim may WRITE:**

- its own account (`PATCH /api/me/password`, `POST /api/me/email`, `DELETE /api/me`, session
  revocation) — unchanged;
- **nothing else inside a box**, except routes on a closed list that exists to *create the caller's
  relationship to a box*. Today that list has exactly one entry: `POST /api/invites/{token}/accept`,
  which already resolves the box from an unguessable token and wraps the tenant-scoped half in
  `runAsBox`. M22's drop-in and any join-request route are added to that list **by name, in this
  document's successor**, not by analogy.

**`runAsRoot` is for platform jobs.** It must never appear on a thread serving a user request. Gate:

```sh
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'   # must be empty
```

The rationale is not aesthetic: a request thread has a caller whose authorisation is knowable, so
"see every box" is always the wrong tool there — the right one is `runAsBox(theBoxTheyAsked for)` plus
an authorisation check on whether that box is theirs to see.

---

## 5. The box-switch model

### 5.1 What does not change

One active box at a time. `POST /api/auth/box-token` still checks for an ACTIVE membership, still runs
`BoxStatusGuard.requireReachable`, still sets a single `bh_bt`. `TenantContext` is per-request and
derives from the token, so a user holding three boxes needs no change to it whatsoever: the third box
is a third token, minted the same way as the first.

### 5.2 What changes: the staleness guard

`localStorage` is shared between tabs and `bh_bt` is a single cookie, so switching box in tab A silently
repoints tab B. Tab B still renders box B and its next write lands in box A. Invisible with one box;
routine once multi-box is the product.

`/api/box/**` therefore gains an **assertion header**:

```
X-Box-Id: <the box the client believes is active>
```

A Spring MVC `HandlerInterceptor` registered for `/api/box/**` compares it to the JWT's `box_id` claim:

- **mismatch** → `throw new ResponseStatusException(HttpStatus.CONFLICT, "STALE_BOX")`, which
  `ApiExceptionHandler` already renders as problem+json with `detail: STALE_BOX` — the same shape as
  every booking reason code;
- **absent** → no assertion, request proceeds. API clients, the TV surface and existing e2e specs send
  no header and must keep working;
- **match** → proceeds.

A `HandlerInterceptor`, not a servlet `Filter`, precisely so the existing `@RestControllerAdvice`
renders the error. A filter runs outside the DispatcherServlet and would have to write the problem+json
body by hand.

**This does not weaken `docs/TENANCY.md`'s "never trust box ids from request params".** The header can
only *reject* a request; it never *resolves* a tenant. The tenant still comes from the token and only
from the token. Say this in the doc explicitly — at a glance the header looks like the exact thing the
rule forbids, and the next reader deserves the distinction rather than a re-litigation.

### 5.3 The client half

`frontend/src/app/core/auth/auth.interceptor.ts` sends the header for `/api/box/**` from
`auth.activeBox()`, and handles `409` + `detail === 'STALE_BOX'` by re-minting through
`auth.selectBox(activeBox.boxId)` and retrying **once** — structurally the same recovery it already
performs for a 401, and it must reuse that shape rather than inventing a second one.

Two tabs on two boxes cost one extra round-trip per switch-back, and every request executes under the
box its own tab intended. That is the correct outcome, and it is the whole point.

---

## 6. Conformance coverage

`AuthzConformanceTest` defaults to DENY, keyed by `METHOD + pattern`. A route that is in neither
`PUBLIC_ALLOWLIST` nor `MIN_ROLE` nor `NON_BOX_SCOPE` lands in `unlisted` and **fails the build**. So a
future `/api/directory` route is already covered by construction; what M21 owes is the written answer to
*which intent it must declare*, because `SELF` — the only non-superadmin value the map has today — is
wrong for a route that reads other people's boxes.

**M21 documents the label; M24 lands it with the first route.** The new value is `CROSS_BOX`, for a
boxless route reading a declared public projection of boxes the caller does not belong to. Adding the
label and its probe family now, with zero routes carrying it, would be scaffolding that rots — and the
`MIN_PROBES` census asserts probe *floors*, so an empty family is either a zero floor (worthless) or a
red build (dishonest).

**One thing recorded now so M24 does not rediscover it:** the sweep's leak detection works by planting a
marker string in **box A's name** and asserting it never appears in a response served to box B. Under a
directory, a box's name is *legitimately public*. A `CROSS_BOX` probe must therefore assert the absence
of **private** markers — a member's email, a plan name, an invite token — and must not assert the
absence of the box name. Splitting `markers` into private and public is M24's first task on that file.

**Every edit to `AuthzConformanceTest` in this milestone is made by the orchestrator, not an executor.**
That is a `CLAUDE.md` rule and it applies here with unusual force. The only edits M21 expects to need are
zero; if the flip or the guard changes a route's observed status, that is a finding to investigate, not
a line to adjust.

---

## 7. Tests, each with the mutation it catches

The M14a lesson is binding: if you cannot name the mutation a test catches, it is decoration, and the
negative control — break it, watch it go red, revert — is what review demonstrably does not replace.

| Test | Asserts | Mutation it catches |
|---|---|---|
| `TenantIdIsolationTest` — the pinned fail-open case **inverts** | a tenant-less session sees **zero** rows across two seeded boxes | restoring `isRoot(NO_TENANT) == true` |
| `TenantIdIsolationTest` — new sibling | a `runAsRoot` session sees **both** boxes' rows | dropping the `ROOT` sentinel, or `runAsRoot` failing to set the flag |
| `TenantIdIsolationTest` — new sibling | `runAsBox(A)` **inside** `runAsRoot` sees only A, and root is restored on exit | a consolidated `runAsBox` that clears rather than restores the root flag |
| `BookingMaintenance` two-box sweep (replaces `SessionApiTest#sweepFlipsPastBookedToNoShow`) | run **tenant-less**, the sweep flips a past BOOKED in **both** boxes | removing `runAsRoot` from `nightlyNoShowSweep`; the current single-box, `actAsBox`-ambient test catches neither that nor the flip |
| `BoxStalenessGuardTest` — mismatch | `X-Box-Id` naming another box → 409, `detail: STALE_BOX` | deleting the interceptor |
| `BoxStalenessGuardTest` — match and absent | matching header → 2xx; no header → 2xx | an interceptor that rejects the absent-header case and breaks every existing client |
| Grep gate | `runAsRoot` in no `*Controller.java` | a cross-box read written the easy way |
| `auth.interceptor.spec.ts` | header sent for `/api/box/**` only; 409 `STALE_BOX` → one `selectBox` + one retry; a second 409 gives up | an interceptor that retries forever, or that sends the header to `/api/me` |

**The existing 486 backend tests are the blast-radius detector.** Any test that read tenant-less and
relied on seeing everything now goes red. Each red is triaged into exactly one of two buckets, and the
executor states which: *a real caller owed a `runAsRoot`*, or *a test that was lying about what it
covered*. A third bucket — "adjust the assertion to whatever it now returns" — is not available.

---

## 8. Deliberately NOT modelled

Phase 1's binding rule requires every milestone in it to state what it does not model and why that shape
is a screen's decision rather than a table's.

- **The public projection's shape** — which fields of a box are public, and whether its schedule is
  among them. M22 owns the box public profile schema; M24 owns the page. M21 fixes only *how* such a
  read is allowed to reach the database.
- **The visitor / drop-in relationship** — whether a non-member buying a drop-in becomes a `Membership`
  row with a new status, or something else. M22's schema, and it is exactly the kind of table that goes
  wrong when modelled against no screen.
- **The boxless shell, the box switcher UI, and the app's home for a user with no box** — M23, which
  the roadmap requires to ship sketches at 375 and 1440 before anything is built.
- **A throwing interceptor for tenant-less reads** — §3.5, with the reason.
- **Server-side revocation of a box token on switch** — a `bh_bt` for box A stays technically valid for
  its remaining TTL after the user switches to box B. It always has; the staleness guard means a stale
  token can no longer be used *accidentally by our own client*, and revocation lists are on
  `docs/BACKLOG.md` for the whole token family, not just this one.

---

## 9. Gates

| Gate | Before | After |
|---|---|---|
| Backend tests | 486 | rises |
| Karma | 408 | rises **by the interceptor specs only** — the one named frontend exception |
| axe | 29 cases, 0 violations | **frozen** |
| Visual | 31 specs / 88 baselines | **frozen** |
| e2e | 64 passed + 1 skipped | unchanged (the skip is Project 2's quarantined TV/SSE defect) |
| Production build | clean | clean |
| Flyway | V21 applied | **V22 still free — this milestone adds no migration** |

Any movement in axe or visual means scope leaked into a screen; find out what before accepting it.
`e2e/visual.sh` runs in its Linux container, never Playwright locally. CI is the gate, not a local green.

---

## 10. Execution

**Orchestrator-implemented** (`CLAUDE.md`, "genuinely difficult or delicate"): the resolver flip and the
`ROOT` sentinel, `runAsRoot`, the `runAsBox` consolidation, the staleness interceptor, the
`docs/TENANCY.md` rewrite, and any edit whatsoever to `AuthzConformanceTest`.

**Executors (Sonnet), one brief per task:** the backend suite-breakage triage, the two-box tenant-less
sweep test, the frontend interceptor change and its specs. Every brief carries the negative-control
instruction verbatim, and every brief lists the files that **depend on** the change, not the files the
change is — `docs/PREFLIGHT.md` moment 1.

**Order matters.** The flip lands first and red is expected; triage follows it. The staleness guard is
independent of the flip and can proceed in parallel. `docs/TENANCY.md` is rewritten last, against what
actually shipped rather than against this document.

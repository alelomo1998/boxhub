# Next session — open **M28, Launch → Production**.

**M16a is merged, `main` is green, CI is green.** **The roadmap was re-planned on 2026-08-22** and
M28 is now first, ahead of M23.

**Read `docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md` before anything else** — it changes
what "the pilot" means, and most of what you think you know about the roadmap order is from before it.

**The headline: the pilot IS v1.0.** Not a slice — a complete, finished product the box tests in
**full**. A feature may be **built but idle** (Stripe ships, works and is tested; no money flows
because the pilot is free), **never absent**. A feature the box cannot try is a feature the pilot
cannot evaluate. Then v1.0.1 is bug fixes, v1.1.0 is what the box asks for.
**Twenty milestones, one €99 tier, everything included.**

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m28-launch-production
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even
> if a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. The escape hatch is already set in `.claude/settings.local.json`
> (`"worktree": {"bgIsolation": "none"}`) — that file is gitignored globally, so a fresh clone needs
> it again.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`** — the v1.0 programme. What the pilot
   is, the €99 one-tier decision, the full Wodify gap audit, and §8's M28 scope.
3. **`docs/superpowers/specs/2026-07-28-m12c-production-readiness-design.md`** — M12c hardened the
   deploy once and **explicitly deferred one bullet to Launch → Production, listing it**. That list
   is M28's spine. It also tells you what is already done, so you do not rebuild it.
4. **`docs/VPS-DEPLOYMENT.md`** — the agreed OVH target, storage and backup limits, pre-production
   blockers. M28 is the milestone this document was written for.
5. **`docs/ROADMAP-AT-A-GLANCE.md`** — the twenty-milestone order. Never infer order from a number.
6. **`docs/HANDOFF.md`** — the M16a section and the v1.0 re-plan section.
7. **`docs/PREFLIGHT.md`** at its four moments.

## What M28 is

**The deploy.** It goes first so **every milestone after it is deployable and viewable on a real
device on a real domain** — worth a great deal for the nineteen milestones that follow, most of which
are screens.

From M12c's deferred bullet, verbatim: **TLS/HSTS, domain, firewall, SSH hardening, Postgres backups
+ a restore drill, secrets delivery, log retention, CI deploy on green.** Plus, added by the v1.0
programme: **real SMTP with SPF/DKIM/DMARC**, error monitoring and uptime, `BOXHUB_COOKIE_SECURE=true`,
ToS/privacy/DPA (EU PII — and it must cover M33's import, where the box is controller and rxed is
processor), rate limits measured against a class-opening rush, sending gym mail from the gym's own
domain, and **deleting `/app/dev/components`**.

**No overlap with M12c** — compose env files, `BOXHUB_COOKIE_SECURE` plumbing, OAuth nginx locations,
WebP removal and log PII masking are already done. **Read M12c before scoping, or you will rebuild
its work.**

**Why it matters more than it looks:** *"invoices and password-reset emails don't arrive"* is the
loudest complaint against **both** Wodify and PushPress. Shipping that same bug is the one unforced
error available to us, and it is a bug of **deployment**, not of code. See `docs/POSITIONING.md` §5.

**M28 has a spec's worth of scope but NO spec and NO plan.** Start with `superpowers:brainstorming`:
the *scope* is known, the **decisions** are not — which SMTP provider, which monitoring and uptime
stack, what the restore drill has to prove, what the legal documents actually say, and how far
"sending from the gym's own domain" goes.

## The gate for M28 is different — read this twice

| Gate | Value | Rule for M28 |
|---|---|---|
| Backend suite | **535 / 0 / 0** | **Hold.** M28 is infrastructure; it may add a few tests, it must break none. |
| Karma | **419** | **Hold** |
| e2e | **67 passed, 0 failed, 0 skipped** | **Hold** |
| `e2e/visual.sh` | **31 specs, zero dirty baselines** | **Hold** |
| Migration head | **V28** | Likely unchanged — M28 probably needs no migration |
| §8.1 greps | all eight zero bytes | Stay zero |
| `SecretDefaultsTest` | green | **Must stay green.** M28 adds real secrets; not one gains a working default. |
| `AuthzConformanceTest` | green, untouched | Orchestrator only, and M28 adds no routes |

**The test numbers are NOT this milestone's evidence.** The evidence is that the deploy actually
works, measured:

- a **restore drill actually performed** — a real backup restored into a real empty database, and
  something read back out of it
- **mail actually delivered to a real external inbox**, with SPF, DKIM and DMARC observed passing
- **TLS actually graded** by an external checker
- **monitoring actually alerting** — break something on purpose and watch the alert arrive
- **rate limits actually measured** under a simulated class-opening rush, not reasoned about

**A checklist ticked without a measurement is not this milestone's output.** This is the same rule as
"did I look, or did I read a report?" from `docs/PREFLIGHT.md` moment 4, applied to infrastructure.

## Settled decisions — do NOT re-litigate

All user-stated 2026-08-22, recorded in the v1.0 programme spec:

- **Notifications are IN-APP ONLY. No email notifications.** Auth mail is separate and still needs
  M28's SMTP. Real push arrives with M27, inside v1.0.
- **Messaging is staff ↔ member 1:1, both directions, coaches included. No member↔member.**
- **Branding is logo and name only.** Colours and style stay rxed; the design law's dark-only and
  single-accent rules were considered and **not** re-opened.
- **Import is CSV-first** with per-platform presets (Wodify, PushPress, Zen Planner, TeamUp,
  Mindbody). API connectors are v1.1 at the earliest.
- **Cut:** public API access, heart-rate tracking, 24/7 door access, anything AI, per-gym website
  builder, per-gym theming.
- **Deferred with triggers:** on-demand media library (reopens when rxed earns enough to upgrade the
  server), custom report builder (v1.1).
- **In v1.0 despite an earlier "we don't build that":** POS/retail (M16) and lead management +
  campaigns (M32). The box must be able to test everything.

## Debt M16a left, each with a named owner

- **The wire shim.** `plan.entitlement` and `plan.weeklyClassLimit` are gone as columns but still
  served, derived, from `PlanController.PlanDto` and `SubscriptionController.PlanSummaryDto`, with
  `PlanController.requireWeeklyLimit` guarding the case `plans.page.ts` can still send. **M16 kills
  all three** when it ships the eight-limit plan editor.
- **The eight limits have no UI.** A box cannot configure a punch-card or a daily cap today. **M16.**
- **The per-box cancellation policy has no UI** — `allow_late_cancel`, `late_cancel_refunds_entry`,
  `count_waitlist_cancellations` are served and PATCHable, nothing renders them. **M15.**
- **`CANCEL_LIMIT_REACHED` has no copy** in `book.page.ts`'s `reason()`, so a cancellation blocked by
  a plan limit renders "Something went wrong — try again". **M14b/M17.**

## The rules this programme keeps relearning — all fired again in M16a

**Verify every recorded claim against current code before planning against it.** M16a's spec made
three assertions that were false: that regeneration deletes live bookings (it *refuses* them and
deletes only CANCELLED rows), that its late-cancel rule was reachable (`PAST_CUTOFF` made it dead
code), and that `resolveEntitlement` was pure redundancy (it guards a live screen). The plan then
added two of its own: seven tests were really eight, and `countInWeek` was called dead while
`HomeController` still uses it. **Five false claims in one milestone.**

**Weight executor pushback heavily.** Two executors refused to commit around a red test or a count
mismatch, and both were right. That is the designed behaviour, not friction.

**Run the negative control on every test — it is not a formality.** One M16a mutation was a **false
negative**: the fixture sat a year ahead of `now()`, so a `now()`-anchored window contained neither
session and the test stayed green under the exact mutation it existed to catch. Only *running* the
mutation revealed it. **If you cannot name the mutation a test catches, say so instead of counting it
as coverage.**

**A calendar- or clock-dependent test is a coin flip.** Pin fixtures to an explicit weekday in an
explicit zone. `BookingEngineTest.nextMondayAtTen()` and `EntitlementLimitsTest`'s anchor are the
pattern to copy.

## Traps that have already cost time

- **`docker compose` lives at `docker/docker-compose.yml`, NOT the repo root.**
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **Use `mvn clean test`, not bare `mvn test`,** after reverting anything.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **cwd does not persist between commands.** Absolute paths everywhere.
- **`npm test` alone hangs** (watch mode). Always `-- --watch=false --browsers=ChromeHeadless`.
- **e2e:** `docker compose -f docker/docker-compose.yml build frontend backend`, then `up -d`, then
  `cd e2e && npx playwright test`. Rebuild the image first or you measure a stale bundle.
- **`e2e/visual.sh` runs in a Linux container** — never Playwright locally, or you compare against
  baselines your renderer never wrote.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing. Merge to
  `main`, then **wait for the run and read it**.
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work (tenancy, concurrency, money, the booking engine)
and trivial glue. Executors and reviewers are **Sonnet**. Executors never guess — blocked or
plan-conflicts-with-reality goes back to the orchestrator.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only.

**Every box-scoped endpoint gets happy + auth-denied + cross-tenant-denied tests.**

**Every FE feature ships through impeccable** (shape → build → critique ≥28/40, no open P0/P1),
**scoped to one screen at a time** — never once over the milestone at the end. Expect 3–5
look-and-adjust rounds per screen. *(Not applicable to M28, which has no screens.)*

**One caution specific to M28:** it touches secrets, DNS, TLS and a live host. **Anything outward-facing
or hard to reverse gets confirmed with the user first** — buying a domain, sending real mail to real
addresses, pointing DNS, provisioning the VPS. Executors do not take those actions on their own.

## NO LONGER UNOWNED

`Launch → Production` was raised unowned at three consecutive milestone closes. **It is M28, and it
is next.** Do not re-file its items into the backlog as unscheduled.

## After M28

`M23 → M29 → M14b → M14c → M17 → analytics brief → M15 → M16 → M30 → M33 → M32 → M24 → M25 → M26 →
Project 2 (The Room) → M18 → M27 → M19 → M20 → **v1.0 → pilot**`

Read the order from `docs/ROADMAP-AT-A-GLANCE.md`, never from a number. Four milestones are new —
**M29** messaging & notifications, **M30** waivers & agreements, **M33** data import & migration,
**M32** growth & automation — and two things moved:

- **Project 2 (The Room) is no longer walled off and now runs BEFORE the beta.** The class runner
  and TV whiteboard are differentiators #1 and #2 in `docs/POSITIONING.md`; without them a box will
  not agree to test. The trade, accepted knowingly: it runs without the field research it was
  sequenced to receive.
- **The analytics brief moved up** ahead of M15/M16, because its job is to audit whether the data was
  ever recorded — and doing that *after* the dashboards are built finds a missing column too late.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

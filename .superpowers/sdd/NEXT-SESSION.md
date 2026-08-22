# Next session — open **M23, app entry & shells**. First screen milestone of Phase 2.

**M13f is merged and Phase 2 is open.** M23 has **no spec and no plan yet**, so this session starts
with `superpowers:brainstorming`, then `superpowers:writing-plans`, then execution. Do not jump to
code.

M23 is the milestone that ships **sketches you can look at before anything is built** — that is in
the roadmap line, and it is the point. Six screen milestones follow it and inherit whatever shape it
sets.

```bash
cd ~/dev/boxhub && git checkout main && git pull && git checkout -b m23-app-entry-shells
```

> **Start from `~/dev/boxhub`.** Do NOT create a git worktree and do NOT run `EnterWorktree`, even if
> a superpowers skill asks for an "isolated workspace". `git worktree list` must show exactly one
> entry. Milestone work is a feature branch in this directory, merged to `main` at the end.
>
> If the harness blocks edits demanding isolation, the escape hatch is already set:
> `.claude/settings.local.json` carries `"worktree": {"bgIsolation": "none"}`. That file is
> gitignored globally, so it does not travel — a fresh clone may need it again.

## Read first, in this order

1. **`CLAUDE.md`** — binding, overrides anything here.
2. **`docs/HANDOFF.md`** — the M13f section, especially the decayed-scope finding.
3. **`docs/ROADMAP-AT-A-GLANCE.md`** — execution order. **Milestone numbers are allocation labels,
   not a sequence.** After M23: `M14b → M14c → M17 → M24 → M25 → M26`.
4. **`docs/superpowers/specs/2026-08-06-m13c-component-library-design.md`** §8.1 — the eight gates.
5. **`docs/PREFLIGHT.md`** at its four moments.

## What M23 is

The container: **what a person sees with no gym, with one gym, and with three, and how they move
between them.** M22 built the schema for multi-box; M21 built the tenancy rules that make a boxless
session safe. M23 is the first surface that has to express both.

Brainstorm the scope before assuming anything. **And measure before planning against any recorded
claim — see below.**

## The rule M13f produced, and it is binding on this session

**A deferred defect list is a hypothesis about the current state of the code, not a standing
inventory.** M13f inherited four recorded defects. Two no longer existed:

- the "54 dirty baselines" coupling had been fixed milestones earlier
- the quarantined TV timer test had been **passing since M21**, fixed by accident as a side effect of
  the tenancy work, thirteen days after it was disabled

And the one real `bh-button` defect was **not the one on the list**. Verify every inherited claim
against current code before writing a plan against it. It cost ~30 minutes and removed roughly half
the milestone.

The same applies to plans: **seven plan-vs-reality conflicts were caught by executors inside M13f**,
in a plan written hours earlier. Weight executor pushback heavily; it was right every time.

## What M13f leaves you

**The dev gallery's seven-states contract is now ENFORCED, not documented.**
`frontend/src/app/features/dev/dev-gallery.page.spec.ts` asserts that every `[data-gallery]` section
declares all seven states as `rendered`, `hand`, or `na` **with a written reason**. A section added
without a ledger fails Karma, naming the section and all seven of its missing states.

**This is a real obligation on every new component M23 ships.** Add a component to the gallery and
you must add its ledger entry to the `ledgers` map in `dev-gallery.page.ts`. The gate will tell you
if you forget — that is the whole point of it.

**`bh-button` changed shape.** `dangerBorder` is **gone**, folded into the variant union:
`variant="ghost-danger"` is the control that OPENS a destructive flow; filled `variant="danger"`
EXECUTES it. `size="sm"`, the anchor form (`href`) and `href` × `loading` are all in the gallery now.

**Two testing facts, learned the expensive way:**
1. **A spec asserting only an emitted CSS class does not prove a rule exists behind it.** Renaming
   `.btn.ghost-danger` left the class-name spec green; only `getComputedStyle` caught it. Assert the
   computed value when the rule is the thing under test.
2. **Karma does NOT reject a variant string outside its union, despite `strictTemplates`.** Only
   `ng build --configuration production` does. The production build really is the only gate that
   type-checks templates.

**The a11y suite now emulates `prefers-reduced-motion`.** `bh-sheet`'s 200ms rise animation put a
label at 3.76:1 mid-fade against a 5.07:1 steady state, and axe sampled it. If you add an animated
surface, the scan measures its settled state — which is correct, since WCAG contrast is a
steady-state criterion.

## State

Backend **510/0/0**, migration head **V27**. Karma **419**. e2e **67 passed, 0 failed, 0 skipped** —
the long-standing `+1 skipped` is gone. `visual.sh` **31 specs, zero dirty baselines** across 60
regenerated gallery baselines. All eight §8.1 gates return zero bytes on clean code, which was **not
true before M13f**.

**Baseline to hold.** M23 is a frontend milestone, so frontend numbers will move. Backend must not:
**510/0/0**, migration head **V27**, no new migration unless M23 genuinely needs one.

## Traps that have already cost time

- **`docker compose` lives at `docker/docker-compose.yml`, NOT the repo root.** Every invocation
  needs `-f docker/docker-compose.yml`. This cost time in M13f.
- **cwd does not persist between commands.** Absolute paths in every gate command.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** for every backend command; the system JDK is 26.
- **Use `mvn clean test`, not bare `mvn test`,** after reverting anything.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing. Merge to
  `main`, then read the run there.
- **Run `e2e/visual.sh`, not Playwright locally.** Rebuild the frontend image before any e2e run that
  should see frontend changes, or you test the old bundle.
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's. Redirect to a
  file, check `$?` on the next line.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

## Working agreement (unchanged, binding)

**ALWAYS subagent.** The orchestrator dispatches, reviews every diff, runs the gates, commits and
merges. It implements only genuinely delicate work or trivial glue. Executors and reviewers are
**Sonnet**. Executors never guess — blocked, ambiguous, or plan-conflicts-with-reality comes back to
the orchestrator.

**Never edit `AuthzConformanceTest` as an executor** — orchestrator only.

**One screen at a time,** with an impeccable shape pass before and a critique after, scoped to that
screen. Expect 3–5 look-and-adjust rounds each.

**Review every regenerated visual baseline by eye.** In M13f this caught two errors no gate could:
a stale cross-milestone task reference sitting in user-facing copy, and a note describing a sizing
mechanism the component deliberately rejects.

## STILL UNOWNED — raise it again if it is not resolved

**`docs/BACKLOG.md`'s `Launch → Production` block belongs to no milestone.** It was raised at M13f's
close as agreed. Several items are hard launch blockers rather than polish: real SMTP plus
SPF/DKIM/DMARC (**the entire auth flow depends on mail arriving**), Postgres backups and a restore
drill, TLS/HSTS, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU PII, real money, rxed is the
processor and the gym the controller), error monitoring and uptime (there is none — today a 6am 500
is discovered by a box owner sending an email), and rate limits never measured against a
class-opening rush.

**It must become a real scoped milestone before any box touches the product.**

## After M23

`M14b → M14c → M17 → M24 → M25 → M26`. Read the order from `docs/ROADMAP-AT-A-GLANCE.md`, never from
the number.

**Rewrite this file at milestone close.** It is the ONLY session prompt; do not create a second one.

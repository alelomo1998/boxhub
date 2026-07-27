# BoxHub — project instructions

CrossFit box platform. Angular 19 + Spring Boot 3.5 / Java 21 + Postgres 16. Multi-tenant.

## Authoritative docs (read before working)
- **Master spec / roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` — milestones M0–M7, the operating rules.
- **Design law:** `docs/superpowers/specs/2026-07-08-design-system-design.md` — binding for ALL frontend work.
- **Milestone plans:** `docs/superpowers/plans/` — the active plan governs current work.
- **Backlog:** `docs/BACKLOG.md` — deferred items; out-of-scope ideas go here, one line.

## Workflow rules
- **Milestone lock:** work only the active milestone. Out-of-scope ideas → `docs/BACKLOG.md`, don't build them.
- **Schema changes only via Flyway.** Never edit an applied migration.
- **Every box-scoped endpoint** gets happy + auth-denied + cross-tenant-denied tests.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`, never from request params. `@TenantId` entities (Plan, Invite): any query that must be tenant-agnostic needs NATIVE SQL — JPQL/derived queries (incl. bulk updates) are silently filtered to the caller's box. Full rule, both failure modes, the `runAsBox` pattern, and the native-method table: `docs/TENANCY.md`.
- **The authz conformance sweep is a standing guarantee (M11, binding).** `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` sweeps Spring's live route table and defaults to DENY: a new route fails the build until someone declares its intent in `MIN_ROLE`, or allowlists it by METHOD+pattern with a written justification. **That failure is the design, not a broken test.** The only permitted edit is registering a route (plus seeding a real id in `pathIds` if it takes a path variable). Never weaken an assertion, allowlist around one, or restructure it — and the orchestrator, not an executor, audits every edit to it.
- **No secret gets a working default.** A missing secret must fail startup, never fall back; `SecretDefaultsTest` enforces this over `application.yml` and `@Value` annotations both. A blank-but-set env var counts as missing — validate for it at the consumer.
- **Mail fires strictly AFTER commit; an audit row is written strictly INSIDE the transaction.** Both exist so the record matches reality: a mail sent in a tx that rolls back is a lie, and an audit row surviving a rolled-back transition is also a lie.
- Conventional commits. `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for backend builds (system JDK is 26, too new).

## Design rules (binding — see design law doc for detail)
- **Tokens only.** No component or screen hardcodes a color / font / radius / spacing. Everything reads a CSS custom property. A raw hex outside `frontend/src/styles/_tokens.scss` is a bug.
- **Warm dark is the home theme** (`--ground: #17120D`, never cold blue-black). Light theme is first-class but dark is default.
- **Race red (`--red`) is the only accent** — marks live / primary / winning only. Never decorative, never a status fill.
- **Glow is rationed** — primary-button hover, live indicator, focus ring. Nowhere else. No gradients, no fake textures, no skeuomorphism.
- **Identity lives in hero screens** (WOD board, leaderboard, PR page, live class runner, TV) — plumbing (buttons, tables, forms) stays conventional-and-excellent.
- **Numbers are tabular.** Screens are built from shared `bh-*` components; re-implementing a component's markup in a screen is a bug.
- Type: display = Saira Condensed, body/UI = Archivo, eyebrows = system mono. Embedded as data-URI (CSP blocks font CDNs).
- **Design law v2 (M5, binding):** type scale/`--tap`/`--scrim` tokens only; every fetch has loading/error/empty and every save pending+inline-error with input preserved; WCAG AA (4.5:1, focus rings, labels, reduced-motion); bottom-tab app shells for athlete/coach + SaaS shell for admin; overlays via `bh-sheet`, avatars via `bh-avatar`; **every FE feature ships through impeccable (shape → build → critique ≥28/40, no open P0/P1)**.

## Communication (binding)
- **Caveman mode, level `full` (not ultra):** terse prose, drop articles/filler/pleasantries, fragments OK. All technical substance stays. Code, commits, PRs, security warnings written normally. Goal: cut token burn, not clarity.

## Process pace — orchestrator/executor (binding from M6)
Keep the superpowers arc (brainstorm → writing-plans → execute → finish). Execution model:
- **Orchestrator = main session (Fable/Opus).** Owns the plan, dispatches tasks, reviews diffs, runs the gates (tests, build, tenancy greps, impeccable), commits, merges. Executors never self-merge.
- **Executor = Sonnet subagents** (`Agent` tool with `model: "sonnet"`), one per plan task, each given a self-contained brief: files to touch, exact code from the plan, verification commands.
- **Escalation:** executors never guess. Blocked / ambiguous / plan-conflicts-with-reality → return the question to the orchestrator instead of improvising; the orchestrator answers (or asks the user) and re-dispatches.
- **ALWAYS subagent (binding, user-stated 2026-07-27).** The orchestrator does NOT implement plan tasks. It dispatches, reviews every diff, runs the gates, commits, merges. The orchestrator implements only two things itself: **genuinely difficult or delicate work** (crypto, tenancy, concurrency, money, anything where a wrong diff is expensive) and **trivial glue** (one-line fixes, doc edits, commit mechanics). Everything in between goes to an executor — don't do an executor's job because it feels faster.
- Commit in batches (several plan tasks per commit is fine). Track progress in `.superpowers/sdd/progress.md`.
- History: M0/M1 used heavy per-task implement+review+fix loops (too slow); M2–M5.5 ran fully inline (fast but burns the big model on mechanical work). This model is the middle: big model judges, fast model types.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

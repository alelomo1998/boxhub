# BoxHub — project instructions

CrossFit box platform. Angular 19 + Spring Boot 3.4 / Java 21 + Postgres 16. Multi-tenant.

## Authoritative docs (read before working)
- **Master spec / roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` — milestones M0–M7, the operating rules.
- **Design law:** `docs/superpowers/specs/2026-07-08-design-system-design.md` — binding for ALL frontend work.
- **Milestone plans:** `docs/superpowers/plans/` — the active plan governs current work.
- **Backlog:** `docs/BACKLOG.md` — deferred items; out-of-scope ideas go here, one line.

## Workflow rules
- **Milestone lock:** work only the active milestone. Out-of-scope ideas → `docs/BACKLOG.md`, don't build them.
- **Schema changes only via Flyway.** Never edit an applied migration.
- **Every box-scoped endpoint** gets happy + auth-denied + cross-tenant-denied tests.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`, never from request params. `@TenantId` entities (Plan, Invite): any query that must be tenant-agnostic needs NATIVE SQL — JPQL/derived queries (incl. bulk updates) are silently filtered to the caller's box.
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

## Process pace (DEFAULT — lightweight)
Keep the superpowers arc (brainstorm → writing-plans → execute → finish) but execute LIGHT:
- **Default = inline execution by the main thread.** Write/Edit the files directly, run tests+build, commit. NO implementer subagent, NO reviewer subagent, NO per-task brief/report files for mechanical, well-specified work (restyles, CRUD from a detailed plan, transcription). Tests + build + targeted greps are the gate.
- **Spawn a subagent ONLY when:** the work is genuinely parallelizable, high-uncertainty/high-risk (security, tenancy, money, tricky concurrency), or too big to hold in one context. Then one implementer + one review, not a loop.
- Commit in batches (several plan tasks per commit is fine). Track progress in `.superpowers/sdd/progress.md`.
- This is a correction from M0/M1, which used per-task implement+review+fix subagents — too heavy/slow/expensive for this stage.

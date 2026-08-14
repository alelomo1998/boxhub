# M13d — continuation prompt (written 2026-08-14)

Paste the block below into a fresh session. Everything it references is committed and pushed.

---

Continue rxed (formerly BoxHub) at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**You are mid-milestone M13d — auth & account screens.** Branch `m13d-auth-account-screens`, pushed, tree clean, all gates green. Do NOT start a new milestone.

## Read first, in this order

1. `.superpowers/sdd/progress.md` — **the M13d section at the bottom is the live state.** Task→SHA ledger plus every trap hit. This is the most important file; read all of the M13d entries.
2. `docs/superpowers/plans/2026-08-10-m13d-auth-account-screens.md` — the 21-task plan you are executing. **Task 11 (join) is next.**
3. `docs/superpowers/specs/2026-08-10-m13d-auth-account-screens-design.md` — the milestone spec. **§4.2 is the form contract and is binding.**
4. `CLAUDE.md` — loaded automatically; the form contract and the per-screen e2e rule were added there on 2026-08-14 because they were bought expensively.
5. `docs/BACKLOG.md` — note two new items filed this session: signup profile fields (M15) and **box discovery as a proposed Project 3**.

## Where things stand

**Phase 1 complete** (Tasks 1–7): `bh-field`/`bh-select` gained `name`/`autocomplete`/`required` and a remounting error node; `bh-button` gained `href` (anchor mode) and `testId`; `bh-auth-layout` is new; the global link colour is fixed; two backend one-liners landed.

**Phase 2, 3 of 11 screens done**, each shaped with the user, built, reviewed and critiqued:

| Screen | Critique | Blockers |
|---|---|---|
| login | 36/40 | none |
| start-box | 35/40 | none |
| signup | 34/40 | none |

**Gates right now:** Karma **305** · backend **435** · e2e **35 passed + 1 skipped** on a `down -v` stack · production build clean, zero budget warnings.

The 1 e2e skip is the quarantined TV/SSE defect. Project 2 owns it. Do not investigate it.

## Next task: Task 11 — join

The last split screen. It carries three behaviour fixes the user already approved:
1. `minlength="8"` while the backend rejects under 10.
2. Raw backend codes rendered at the user (`e.error?.detail`).
3. **No pending state on either submit path** — both are multi-step `switchMap` chains.

It is also the only one of the eleven with **no spec file at all**.

Its panel gets `<bh-benchmark-board panel testId="join-benchmark" />` (split screens carry boards; the six narrow screens deliberately do not), and its own eyebrow + headline naming the box.

## The per-screen cycle — binding, in memory, do not skip a step

1. `/impeccable shape <screen>` — **dispatch on Sonnet, always pass `model: "sonnet"` explicitly.**
2. Bring the user **only** the choices shape could not settle. They decide. Use the brainstorm visual companion when the question is visual.
3. One executor builds; you review the diff and run the gates.
4. **Run e2e yourself** on a rebuilt image — Karma cannot see a dead submit binding.
5. `/impeccable critique <screen>` on Sonnet, fix P0/P1, **re-run the critique to confirm the score moved** — the user asks for the number and does not accept "fixed" without it.

Expect **3–5 review rounds per screen** from the user. Every round so far has found a real defect. Budget for it.

## Things that will bite you, all hit this session

- **Bash cwd PERSISTS between tool calls.** It produced a whole gate block reporting zero matches from one bad path, a `docker compose` failure that would have measured a stale image, and two bogus "file not found" reads. **Use absolute paths.**
- **`tsc` does NOT type-check Angular templates.** It passed on a template calling three signals that did not exist. Only `npx ng build --configuration production` catches it. `ng` is not on PATH.
- **Never put a backtick inside an HTML comment in an Angular template** — it terminates the TypeScript template literal, `TS1005`. Cost two build failures.
- **Never run bare `npm test`** — it hangs in watch mode. Always `npm test -- --watch=false --browsers=ChromeHeadless`.
- **Re-run e2e on a `down -v` stack before blaming a diff.** `runner`/`tracking`/`tv` are non-idempotent and fail on a dirty stack for unrelated reasons. This misled twice.
- **Commit your own work before dispatching a subagent.** Five files were left uncommitted while one ran; it staged only its own, but that is how M13b's "docs" commit ate 89 lines of TypeScript.
- **`cp docker/.env.example docker/.env`** before any stack command.
- Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Never alongside Karma. A wall of `Could not initialize class AbstractIntegrationTest` means **Docker is down**, not your diff.

## The pattern that has held all milestone

**Eleven executor briefs, and roughly half contained a factual error — every one mine, every one caught because executors were told to stop rather than improvise.** The recurring shape: *listing the files a change IS, not the files that DEPEND on it.* A 19th `ui/` component cannot avoid the gallery's exhaustive-list spec; a signature change moves its Mockito callers; changing a response value moved six test files. **Grep for dependents before writing the brief.**

Three tests that could not fail were also found and fixed. When one turns up, the fix is usually **the claim, not the assertion**.

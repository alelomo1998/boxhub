# M6 — TV Display (design)

**Date:** 2026-07-12 · **Status:** approved design, pre-implementation
**One-liner:** A paired, self-driving gym TV: giant pairing code → admin claims it → the TV shows today's class board (80%) with a live people/results rail (20%), pushed over SSE, reconnect-safe on hostile gym wifi.

Deviations from the 2026-07-07 master spec, agreed 2026-07-12:
- **SSE instead of STOMP/WebSocket.** M6 traffic is strictly server→TV; SSE is plain HTTP (works on Fire Stick / smart-TV browsers), has native auto-reconnect, and needs no broker. M7 runner commands go REST→server→SSE; if bidirectional ever becomes real, revisit.
- **Leaderboard hangs off `session_item`** (M5 model), not `programming_entry` (dropped in M5).
- **M6 scope is auto-drive only.** No coach control UI, no timers on screen (timer engine + runner = M7). One TV = whole box; multiple TVs show the same content (per-device views = M7).

## 1. Scope

**In:** device pairing (6-digit code), admin device management (claim/rename/remove/list w/ last-seen), SSE state push, TV screens (idle + live class 80/20), reconnect + last-state, Flyway V8, full test tiers.
**Out (M7+):** timers, coach remote/class runner, per-device view assignment, PR-celebration takeover, heats/teams.

## 2. UX

### TV (`/tv`, no login, no typing on the TV)
1. **Pair screen:** TV opens `/tv` → giant 6-digit code (display type, ~20vh) + "Enter this code in BoxHub admin → TVs". Polls until claimed. Code expires after 10 min → self-refreshes with a new code.
2. **Board screen (claimed):**
   - **Live class (a session is running, or next one today):** 80/20 split.
     - Left 80%: WOD board — class name + time eyebrow, pieces in display type (block label, title, body lines). Scales with `vh`; no scrolling — the board is designed to fit (pieces beyond 4 truncate with "+N more").
     - Right 20% rail: coach (avatar + name), then the people — checked-in/booked athletes as avatar+name rows. When scores land (typically end of class), scored athletes float up as ranked results (rank number, name, score, RX tag); unscored stay below as plain roster. Red only on rank 1 and the LIVE dot.
   - **Idle (nothing today / day over):** big clock (client-rendered, ticks locally), box name, "Next class: <name> <weekday HH:mm>".
   - **Reconnecting badge:** small "reconnecting" pill when the stream drops; last state stays on screen. EventSource auto-reconnects.
3. High-contrast: forced dark theme, `--ground` base, oversized type, zero interactive elements.

### Admin (`/admin/tv`, new nav item "TVs")
- Claim form: code + name ("Rig wall left") → device appears in list.
- List: name, online/offline (last_seen < 90s = online), claimed date. Rename inline, Remove (revokes — TV falls back to pair screen).
- COACH may also claim/list (RoleGuard COACH|BOX_ADMIN) — admins are often coaching.

## 3. Architecture

New backend package `com.boxhub.display` (module boundary per master spec).

### Data — Flyway V8
```sql
create table tv_devices (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references boxes(id),          -- null until claimed
  name text,
  pairing_code text,                          -- 6 digits; null after claim
  secret_hash text not null,                  -- TV's own credential, sha-256 (invite-token pattern)
  status text not null check (status in ('PENDING','ACTIVE','REVOKED')) default 'PENDING',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tv_devices_pairing_code_key on tv_devices (pairing_code) where pairing_code is not null;
```
**`TvDevice` is deliberately NOT `@TenantId`** (movement pattern): pairing happens before any tenant exists. Box-scoped queries filter `box_id = TenantContext.requireBoxId()` explicitly. This sidesteps gotcha #1 entirely — no tenant-agnostic query against a tenant-filtered entity.

### Pairing flow
1. `POST /api/tv/pair` (permitAll, rate-limited like auth) → creates PENDING device: unique-among-pending 6-digit code + random 32-byte secret (returned raw once, stored hashed). Response `{code, secret}`. PENDING devices older than 10 min are purged/reissued on next poll.
2. `POST /api/tv/pair/poll` `{code, secret}` (permitAll) — TV polls every 3s. `202` while PENDING; `200 {token}` once ACTIVE. Token = HS256 JWT, `scope: "tv"`, `box_id`, `device_id`, TTL 400 days (pilot tradeoff — revocation is device REVOKED/deleted, checked on every stream connect and heartbeat).
3. `POST /api/box/tv/claim` `{code, name}` (box token, COACH|BOX_ADMIN) → PENDING device by code → sets `box_id`, `name`, ACTIVE, clears code.

### Device management (box-scoped, COACH|BOX_ADMIN)
- `GET /api/box/tv` → `[{id, name, online, lastSeenAt, createdAt}]`
- `PATCH /api/box/tv/{id}` `{name}` · `DELETE /api/box/tv/{id}` (sets REVOKED, closes its emitter)
- All three get happy + auth-denied + cross-tenant-denied tests (device claimed by box A invisible/immutable from box B).

### SSE stream
- `GET /api/tv/stream?token=…` (permitAll route; token validated in-controller via `JwtDecoder` — EventSource cannot set headers; token-in-query is accepted pilot risk, noted in BACKLOG). Checks scope=tv + device ACTIVE, registers `SseEmitter` (timeout 0) in an in-memory `Map<deviceId, SseEmitter>`, pushes the current snapshot immediately, updates `last_seen_at`.
- **Push triggers:** (a) on connect; (b) `TvStateChanged(boxId)` Spring `ApplicationEvent` published after score save (`ScoreController.putScore`) and coach check-in/uncheck/no-show; (c) `@Scheduled` 30s sweep re-pushes to every connected emitter (catches bookings, publishes, session rollover) and refreshes `last_seen_at`. Snapshots are idempotent — the TV just re-renders.
- Response header `X-Accel-Buffering: no` + nginx `location /api/tv/stream { proxy_buffering off; proxy_read_timeout 1h; }`.
- Single-node in-memory registry: consistent with the no-Redis rule; noted in BACKLOG next to the rate-limiter.

### State composition — `TvStateService.compose(boxId)`
```json
{
  "view": "CLASS" | "IDLE",
  "boxName": "Demo Box",
  "next": { "name": "...", "startAt": "..." } | null,
  "session": { "id","name","startAt","durationMin","coachName","coachAvatarPath" } | null,
  "items": [ { "type","title","bodyText","blocks":[...] } ],
  "rail": [ { "name","avatarPath","status","rank":n|null,"score":"3:21"|null,"rx":true|null } ]
}
```
- Session pick: today's sessions ordered by start; **current** = `startAt ≤ now < startAt + duration + 30min grace`; else next upcoming today; else IDLE with next session ≤7 days out.
- `rail` = roster (BOOKED/CHECKED_IN, waitlist excluded) merged with `Leaderboard.rank(...)` output by membership: ranked entries first (with formatted score), rest as plain roster rows. Private scores never appear (existing `Leaderboard` guarantee).
- Reuses `SessionDetailController`-style repository reads + the pure `Leaderboard.rank` fn; no new query semantics.

## 4. Frontend

- `features/tv/tv-shell.page.ts` replaced by a state machine: `pairing` (POST pair → giant code → 3s poll → store token in `localStorage['boxhub_tv_token']`) → `live` (EventSource on `/api/tv/stream?token=…`, render snapshots) → on 401/REVOKED: clear token, back to `pairing`.
- Idle clock ticks client-side (1s interval, reduced-motion irrelevant — no animation, text swap).
- TV screens are a **hero surface** (design law): Saira Condensed at vh scale, tabular numbers, ruled rows, red rationed to rank-1 + live dot. Forced dark (`data-theme="dark"` on the tv root; ThemeService untouched).
- Admin: `features/admin/tv.page.ts` (claim form + device list, standard plumbing register), nav + More-sheet entries in the admin shell.

## 5. Testing

- **Backend:** pairing lifecycle (pair→claim→poll returns token; expired code refused; wrong secret refused), claim role guard (athlete 403), cross-tenant device list/rename/delete denied, stream rejects bad/revoked token, `TvStateService` composition (current vs next vs idle; ranked rail merge; private score excluded). Testcontainers as usual.
- **Frontend Karma:** tv page state machine (pair→live on poll success; reconnect badge on error), rail ordering.
- **e2e (serial):** admin claims a fake TV (two tabs: /tv shows code, admin enters it), TV shows today's board; score logged by athlete appears in the rail after the SSE push.

## 6. Milestone process — orchestrator/executor (NEW, binding from M6)

- **Orchestrator:** the main session (Fable / Opus). Owns the plan, dispatches each plan task, reviews diffs, runs gates (tests, build, tenancy greps, impeccable), commits, merges.
- **Executor:** Sonnet 4.5/5 subagents (`Agent` tool, `model: "sonnet"`), one per plan task. Each gets a self-contained brief (files, exact code from the plan, verification commands).
- **Escalation:** executors do not guess. Blocked / ambiguous / plan-conflicts-with-reality → return the question to the orchestrator instead of improvising; orchestrator answers (or asks the user) and re-dispatches.
- Gates stay with the orchestrator: no executor self-merges; every task's tests must pass before the next batch.

## 7. M7 seams (build nothing, break nothing)

- `TvState` grows a `timer` field (`{spec, startAtEpoch}`) — clients render clocks locally.
- `TvStateChanged` event + emitter registry are the runner's push path.
- Per-device views: `tv_devices` gains a `view` column later; registry is already keyed by device.

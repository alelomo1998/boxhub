# M0 progress ledger
Task 1: complete (commits 05fe7ff..99d9d3e, review clean, spec ✅)
  Minor (final review triage): JWT secret min-length never validated in code; verify Task 2 closes empty-migration-dir gap
Task 2: complete (commits 99d9d3e..2c7e197 + hygiene commit, review approved)
  Env fix: TC <=1.21.3 pins Docker API 1.32, Docker29 min 1.40 -> pinned TC 1.21.4 (pom comment explains)
  Minor (final review triage): memberships FKs lack on-delete action (plan-mandated); expires_at is date by design
Task 3: complete (commits b20cc18..2c782ae, review approved, spec ✅)
  Minor (final review triage): RepositoryTest can't detect join-fetch regression; role/status plain String (enum later if needed)
Task 4: complete (commits 2c782ae..887bb81, review approved after 2 fix rounds)
  Fixes: singleton test container (JUnit lifecycle vs context cache); email normalize-before-check + scoped register race handling (saveAndFlush try/catch)
  Minor (final review triage): concurrent-race handler has no direct test (MockMvc can't force race)
Task 5: complete (commits 887bb81..050489a, approved after fix: login timing equalizer + unknown-email test + consume reorder)
  Minor (final review triage): refresh-token concurrent double-use race accepted (no locking; random single-use tokens); consume()/boxToken() get direct coverage in Tasks 6-7
Task 6: complete (commits 050489a..739e384, review approved clean)
  Minor (final review triage): login/refresh membership-mapping duplication — extract helper when third caller appears
Task 7: complete (commits 739e384..9943afb, approved after fix: suspended-membership denial test added)
  Minor (final review triage): bare orElseThrow in Me/BoxController -> 500 if user/box deleted mid-token (Task 8 handler covers); boxToken does redundant userRepo lookup (mem.getUser() available)
Task 8: complete (commits 9943afb..73bf05f, review approved clean, no findings)
Task 9: complete (commits 73bf05f..b2f93e0, review approved; runtime seed verify deferred to Task 12 compose)
Task 10: complete (commits b2f93e0..443eab6, review approved clean)
Task 11: complete (commits 443eab6..abba17b, approved + safeParse robustness fix)
  Minor (final review triage): concurrent refresh not de-duped (M0 scale ok); login page nested subscribe silent on selectBox error
Task 12: complete (commits abba17b..73988d1, approved; verified live: health UP, seeded login via nginx, SPA 200)
  Env note: local Docker Hub was down/glacial ~90min (buildkit DeadlineExceeded); base images now cached
Task 13: complete (commits 73988d1..52b7d30, approved; e2e 3/3 against live stack)
  Minor (final review triage): e2e/package.json test script is npm-init placeholder
Task 14: complete (commits 52b7d30..HEAD, approved; controller fixed health-wait timeout swallow + all-service failure logs)
  Note: workflow validates for real on first GitHub push (no remote yet)
Task 15: complete (commits 8d6ff34..c27522f, approved clean)
ALL 15 TASKS COMPLETE — final whole-branch review next
FINAL REVIEW: With fixes -> fixes applied in 1d3dd47 (deploy .env guard, JWT secret length, dev db port loopback, e2e test script, title, BACKLOG populated). All suites green: backend 18, frontend 7 + build, e2e 3.
M0 BRANCH COMPLETE.
MERGED: m0-foundations -> main (7238c22), tests re-verified on main (backend 18/18, frontend 7/7), branch deleted. M0 CLOSED.

=== M1 box-core (branch m1-box-core, plan docs/superpowers/plans/2026-07-08-m1-box-core.md) ===
M1-T1: complete (3ea8882..4737a71, review approved clean)
M1-T2: complete (4737a71..57b7df7, approved after fix: fail-open root pinning test + ADR-001 amendment)
  KEY DEVIATION: Hibernate rejects null tenant -> NO_TENANT sentinel + isRoot(); null-tenant = fail-open at ORM, enforced at controller boundary; sentinel INSERT blocked by FK
M1-T3: complete (57b7df7..e69c9ba, approved after fix: @Min validation, 400 not 409 for range violations)
M1-T4: complete (e69c9ba..da01b9a, approved clean)
  Minor (triage): pending() in-memory filter (derived query when it matters); planId unvalidated at create -> T5 adds tenant-filtered validation
M1-T5: complete (da01b9a..HEAD, approved after 2 fixes: atomic single-use burn (conditional UPDATE serializes concurrent accepts) + clearAutomatically; session-limit interrupted fixer, controller finished)
  Note: burnIsAtomicSingleUse test proves WHERE-predicate single-use (Postgres row-lock serialization is engine-guaranteed, not thread-raced in test)
M1-T6: complete (61d6691..492def7, approved + 3 security-pin tests: mixed-case superadmin, box-token rejected from /api/admin, slug 400). Suite 42.
M1-T7: complete (492def7..0c6f0c2, approved clean; deviations sound: JPQL cast(:search as string), @Transactional patch)
  Minor (triage->BACKLOG): planName N+1 in toDto (bounded by size cap 100); PageRequest size=0/negative -> 500 not 400 (clamp)
M1-T8: complete (0c6f0c2..8e73811, approved clean)
  Minor (triage): partial-patch branches not individually tested (mirrors brief scope)
M1-T9: complete (8e73811..e002e2f, approved after CRITICAL fix: XFF-first was attacker-spoofable (nginx appends), switched to nginx-authoritative X-Real-IP). Suite 52. BACKEND M1 DONE.
  Deviation-from-plan: plan said XFF-first; corrected to X-Real-IP (plan text was the security bug). Also deviation sound: inherited @TestPropertySource not @DynamicPropertySource for shared-context limit relax.
M1-T10: complete (e002e2f..59c6abe, approved clean; loop-safe: /api/auth/box-token also excluded from retry guard). Closes BACKLOG box-token-refresh top item.
  Minor (triage): reselect catchError rethrows outer err not reselect err (harmless); no interceptor-level integration test (brief scope)
M1-T11: complete (59c6abe..a035bba, approved clean; models verified vs backend DTOs). Suite 11 FE specs.
  Minor (triage): search input no debounce (1 req/keystroke)
M1-T12: complete (a035bba..588e9ea, approved clean)
M1-T13: complete (588e9ea..25a7a16, approved clean)
  Minor (triage): pages use ngOnInit without implements OnInit (cosmetic)
M1-T14: complete (25a7a16..HEAD, approved after fix: redirect by accept-response m.role not preview role). Closes refresh-discards-memberships BACKLOG item. 12/12 FE specs.
  Minor (triage): join accept/register tail duplication; login link plain href not routerLink; ngOnInit without implements
M1-T15: complete (b73ebc4..fdf2b1f, approved clean; e2e 5/5 incl full invite flow acceptance proof). ALL 15 M1 TASKS DONE.
FINAL M1 REVIEW: With fixes -> fixed be358a8 (tenant-agnostic invite lookup + burn native SQL, closes cross-box join; page-size clamp). Re-review: finding closed, no over-exposure, no new issues. BACKLOG pruned. Suite: backend 53, frontend 12, e2e 5.
M1 BRANCH COMPLETE — ready to merge.
M1 MERGED to main (cce5c49), pushed, branch deleted. CI running.

=== DESIGN SYSTEM build (branch design-system, plan 2026-07-08-design-system-build.md) ===
WORKFLOW CHANGE (user): design build executed INLINE by main thread — no implementer/reviewer subagents, no brief files. Tests+build+no-hex grep are the gate. Far faster/cheaper.
DS-T1: tokens/fonts/theme (f4ccc21, 15 specs). DS-T2-4: bh-* components in one pass (21 specs, build green).
DS-T5-7: restyled login/box-picker/admin(shell+members+invites+plans+settings)/join + branded shells. 21 specs green, build clean, ZERO raw hex outside _tokens.scss. Theme e2e added. Rebuilding compose for visual check.
DS-T7: theme e2e + login assertions updated for restyled shells. Full suite 6 passed (configured retries). Verified live: login + members board screenshotted, warm-dark on-brand. Stack down. DESIGN BUILD COMPLETE on branch design-system.
Workflow codified: DEFAULT inline execution (no per-task subagents) in CLAUDE.md + memory.

=== M2 booking (branch m2-booking, plan 2026-07-09-m2-scheduling-booking.md) — inline except Task5 engine (agent) ===
M2-T1 done (V3 migration + box settings, MigrationTest 3/3)
M2-T2 done (entities+repos, 55 backend tests)
M2-T3 done (template CRUD + settings, 7 tests)
M2-T4 done (SessionGenerator, @EnableScheduling, create-path wiring, 61 tests). Key: tenant set BEFORE tx (TransactionTemplate inside runAsBox) or @TenantId sentinel.
M2-T7 done (frontend booking service, 24 specs) — done in parallel while engine agent runs
M2-T5: booking engine (AGENT, commit b31aa6a) — 9 engine + 1 concurrency test, no-oversell proven 3x. Agent caught plan bug: cutoff gates cancel not book (fixed per spec §3). Reviewed clean.
M2-T6: coach session/roster/checkin + nightly sweep (76 backend tests). BACKEND M2 DONE.
M2-T8-10: athlete book/my-bookings, coach sessions/roster, admin schedule — all on design system, 24 specs, build clean, no raw hex. FRONTEND M2 DONE (except e2e).
M2-T11: booking e2e (admin schedule -> athlete book -> coach checkin) + login.spec athlete assertion fix + playwright workers:1 (fixes parallel/shared-state flake). Full e2e 7/7 serial. README updated. M2 COMPLETE.

=== M3 programming (branch m3-programming, plan 2026-07-09-m3-programming.md) — inline main-thread ===
Hybrid WOD model, box-configurable tracks, global copy-on-use benchmarks, one-WOD/track/day slots w/ per-slot draft/publish, athlete read-only WOD board hero.
T1 done (V4 schema: movement+benchmark_template non-@TenantId globals, track/wod/program_slot @TenantId; MigrationTest 4).
T2 done (entities+repos; MovementRepository.findVisible explicit box filter; ProgrammingRepositoryTest — global/custom visibility + slot uniqueness).
T3 done (tracks API + seedDefaults RX/Fitness via runAsBox+tx on box-create + DevDataSeeder; TrackControllerTest 3).
T4 done (movement catalog API, no cross-box leak proven; custom-only mutation guard; MovementControllerTest 3).
T5 done (WOD CRUD + duplicate, hybrid WodJson blocks; WodControllerTest 5).
T6 done (benchmark library + clone-into-box w/ provenance; toDto moved to WodService; BenchmarkControllerTest 3).
T7 done (program slots upsert/publish/bulk + published-only WOD board; athlete never sees drafts; Program+WodBoard tests 9). VISIBILITY PROVEN.
T8 done (V5 migration seeds ~122 movements + 18 benchmarks; DevDataSeeder publishes demo week). Full backend 103 green.
T9 done (frontend ProgrammingService + models; 7 specs).
T10-T14 done (WOD builder+library, program calendar week-grid draft/publish, benchmark browse+clone, admin tracks+movements, athlete WOD board HERO). Build clean, no raw hex, FE 31 specs.
T15 done (e2e: coach build->program today->publish->athlete board; login.spec fixed for WOD-board default). Full e2e 8/8 serial.
  KEY FIX: dev/e2e compose auth-rate-limit raised to 200 (serial suite >10 logins/min/IP tripped strict prod default of 10 — this was the "cold-start flake" root cause).
BACKEND 103, FRONTEND 31, E2E 8 — all green. M3 tasks complete, ready to merge.
M3 MERGED to main (3d4c63e), pushed, branch deleted.

=== M4 tracking (branch m4-tracking, plan 2026-07-09-m4-tracking.md) — inline main-thread ===
Scores attach to program_slot; separate lift log + derived benchmark PRs; per-score private flag; athlete self-log only; typed score columns; inline-SVG chart.
T1 done (V6 schema wod_score + lift_entry, both @TenantId; MigrationTest 6).
T2 done (entities+repos; WodScore private-> @Column(name="private"); lift maxLoad query; PerformanceRepositoryTest).
T3 done (WOD score self-log upsert/get; membership from JWT never a param; publish-only; ScoreControllerTest 4). SELF-LOG PROVEN.
T4 done (Leaderboard.rank pure fn: private-omit, RX-before-scaled, per-scoreType order; LeaderboardTest 4 + LeaderboardApiTest 2).
T5 done (lift log + auto-PR (strictly-greater load) + PR list; movement visibility validated; LiftControllerTest 4).
T6 done (my-scores + derived benchmark-history via slot->wod.benchmarkTemplateId; Leaderboard.best privacy-agnostic; HistoryControllerTest 1).
T7 done (seed 3 athletes' scores incl RX/scaled/private + demo Back Squat progression w/ PR). Full backend 120 green.
T8 done (frontend PerformanceService + models; 6 specs).
T9 done (board DTO +slotId; per-track score form typed by score_type + leaderboard peek; #1 accent). FE 37 specs.
T10-T11 done (progress page: benchmark PRs + lift PRs + inline-SVG progression chart; lift-log entry w/ per-movement history). Build clean, no hex.
T12 done (e2e: coach ensures today slot -> athlete logs time -> leaderboard shows -> logs lift -> history). Full e2e 9/9 serial.
  Fix: lift-log "Recent" was best-per-movement (prs) -> a new non-max lift never showed; now shows the saved movement's full history.
BACKEND 120, FRONTEND 37, E2E 9 — all green. M4 tasks complete, ready to merge.

=== M5 ux-overhaul (branch m5-ux-overhaul, plan 2026-07-10-m5-ux-overhaul.md) — inline main-thread ===
Class-centric model per spec 2026-07-10: class types + skeletons -> instances -> session_item pieces; tracks/program_slot dropped (V7); media volume; profiles+privacy; photo check-in; info-hub home; SaaS admin.
T1-T3 done in one sweep (V7 + entities + items/skeleton/my-class APIs + per-item scores + tests reworked; ClassTemplateController -> requireStaff).
T4-T6 done (media upload+nginx+volume, profile+session-detail, announcement+home+admin-stats; /me/profile added; uncheck endpoint; roster avatars; template imagePath).
T7 done (seeder: types+skeletons+published today instances+scores+announcement+generated placeholder images). Backend 130 green.
T8-T13 done (FE services rework; athlete Home/Book/WOD/class-detail/profile + profile-sheet + bh-avatar; coach Classes/Checkin/InstanceBuilder/Types + shell; admin SaaS shell + dashboard). Karma 41, no raw hex.
T14 done (design law v2 in design-system spec + CLAUDE.md).
T15 done (e2e rework: 10/10 serial on fresh volume; booking-flow re-render race fixed via dispatchEvent; tracking targets Fran piece).
Impeccable critique (dual-agent) run at finish: detector 5 findings all Angular-binding FPs (effective 0).
BACKEND 130, FRONTEND 41, E2E 10 — all green.
## M6 TV display — 2026-07-12 — branch m6-tv-display, base ab16689
M6 Task 1: complete (ab16689..166e753, review clean)
M6 Task 2: complete (166e753..a910322, review clean after cross-tenant test fix)
M6 Task 3: complete (a910322..0dd1e78, review clean; Minor logged: no per-endpoint role-denied test for PATCH/DELETE tv routes)
M6 Task 4: complete (0dd1e78..62bd5c8, review clean after no-show allowlist + draft gate fixes; Minors logged: N+1 membership lookups pilot-ok, format branches untested, 3h lookback bound)
M6 Task 5: complete (62bd5c8..80ffaf7, review approved; orchestrator inline-fixed emitter completion race; Minor logged: no scope=box-token-rejected stream test)
M6 Task 6: complete (80ffaf7..2b599eb, review clean; Minors logged: theme attr not reset on destroy, reconnect badge hidden pre-first-snapshot, eyebrow times not .num)
M6 Task 7: complete (2b599eb..8aa1602, review clean after bh-button reuse + remove pending/error fixes)
M6 Task 8: complete (e2e 12/12, docs, impeccable 32/40 no P0/P1 after 2 P0+1 P1 TV fixes 4c52079). ALL M6 TASKS DONE.
## M7 class runner — 2026-07-13 — branch m7-class-runner, base d16621c
M7 Task 1: complete (d16621c..9d8820d, review clean; wod_scores→wod_score corrected; jsonb-write risk deferred to T3)
M7 Task 2: complete (9d8820d..319abc9, review clean; Minor logged: upsertFor could use MembershipRepository.findByIdAndBoxId single-query instead of findById+lazy box filter — plan nit)
M7 Task 3: complete (319abc9..9aa9809, code review-clean; jsonb→text V10 as planned; report regenerated by orchestrator after scratch-file collision; Minors logged: concurrent-ARM 500, PAUSE-from-PENDING). Orchestrator ran full suite 155/155.
M7 Task 4: complete (9aa9809..57c994e, review clean; TvState.timer w/ pausedElapsedMs, roster membershipId; full suite 156)
M7 Task 5: complete (57c994e..8237fa5, review clean; renderTimer all 4 types, 61 specs; Minor logged: exact cap/transition/negative boundaries correct-by-inspection but not test-pinned)
M7 Task 6: complete (8237fa5..97056ef, review clean; runner page + score grid + service, 63 specs; Minors logged: roster chip aria-pressed, timer-fetch loading vs empty state collapse)
M7 Task 7: complete (97056ef..d5b3686, review clean; TV giant-timer branch, 64 specs)
M7 Task 8: e2e runner spec (13/13 green), coach-classes 14-day reach fix + flaky guards. docs updated. Next: impeccable gate + merge.
M7 Task 8: complete (impeccable 28/40 no P0/P1 after 2 P0+2 P1 runner fixes; final whole-branch review Opus — 1 Important privacy defect FIXED e3730f5, else clean; 159 backend/64 fe/13 e2e). M7 DONE.
## M8 auth & accounts — 2026-07-16 — branch m8-auth-accounts, base 338dec5
M8 Task 1: complete (338dec5..8ae6c87, review approved; executor bridged V11 NOT NULL family_id via issue() one-liner — verified correct; Minors logged: users.updated_at unmapped in entity, EmailTokenRepository purge/delete methods dead until T5+, process note re unilateral one-liner)
M8 Task 2: complete (8ae6c87..7213adb, review approved; executor found real plan bug — noRollbackFor needed on rotate() or reuse-detection revocation rolls back with the throw; mechanical bridges in AuthController+RefreshTest pending T3; RefreshTest.refreshRotatesToken red by design until T3)
M8 Task 3: complete (7213adb..6d499fa, approved after fix round; review found 2 REAL Criticals masked by MockMvc csrf() bypass — stale expired bh_at cookie 401'd all public auth endpoints incl login [PUBLIC_AUTH_PATHS resolver skip], and /api/auth/csrf never issued the XSRF cookie [deferred-token getToken()]; also: SS 6.4.2 version-pinned withObjectPostProcessor CSRF re-assert, TV pair CSRF-exempt, bearer-POST-no-csrf test; GOTCHA for T9: .with(csrf()) reflectively poisons singleton CsrfFilter tokenRepository — @BeforeEach reset pattern in CookieAuthTest; BACKLOG for T15: re-verify CSRF matcher on Spring Security upgrades; 177/177)
M8 Task 4: complete (6d499fa..1799be6, review approved; deviations verified: mail health contributor off [would restart-loop compose on SMTP outage], Mockito.timeout for @Async race; Minors logged: #D7263D duplicated across 4 mail templates, @Async default unbounded executor fine at pilot scale)
M8 Task 5: complete (1799be6..098b928, approved after fix round; review found CRITICAL — register 201 echoed the persisted OWNER entity on collision [name+UUID = one-request enumeration oracle worse than the removed 409]; fixed: body built from request only on every path; IMPORTANT bcrypt-timing oracle fixed via unconditional encode; 188/188; Minors logged: DuplicateEmailException now dead code [delete by M8 end], resend timing micro-gap noted for T7)
M8 Task 6: complete (098b928..182dea7, review approved; brief test bug adjudicated — post-reset sessions hasSize(1) not isEmpty [reset mints fresh session by design]; check-before-consume order confirmed [rejected password does not burn the link]; Minor logged: unused Cookie import in PasswordResetTest; 192/192)
M8 Task 7: complete (182dea7..a261319, approved after fix round; review found per-email mail-bomb bucket was case-sensitive [Foo@x.com bypassed 3/h cap] + zero limiter tests; fixed: normalized key + EmailRateLimitTest 4 tests incl body-replay proof; REQUIRES_NEW + re-fetch-by-id verified correct; real HIBP call proven; demo password boxhub-demo-2026 everywhere incl README; 203/203)
M8 Task 8: complete (a261319..a5e1e72, approved after TWO fix rounds; round 1 fixed 3 Importants: googleSuccessHandler never cleared bh_bt [shared-device cross-user hazard], filter-chain exceptions bypass @RestControllerAdvice and ErrorPageFilter flattens 403 to whitelabel 500, @ConditionalOnProperty treats "" as present so a blank BOXHUB_GOOGLE_CLIENT_ID placeholder turned the chain ON then crashed boot [now @ConditionalOnExpression+hasText, pinned by OAuth2ChainConditionTest]. Round 2: reviewer EMPIRICALLY disproved round 1's race recovery — catching DataIntegrityViolationException inside the @Transactional that caused it cannot work on Postgres [statement error aborts the tx; recovery query throws JpaSystemException, escaping the catch], and the sequential idempotency test proved nothing [hit the known-identity fast path]. Fixed by splitting transactional units into a proxied GoogleLinkTx bean with resolve() non-transactional; real 2-thread CyclicBarrier test looped 5x, verified against the OLD code first. 209/209. Minors logged: concurrency test can't self-verify the race fired, recoverFromLinkRace's link() unguarded under triple-concurrency. YAML deviation: chain builds its own ClientRegistration from CommonOAuth2Provider.GOOGLE gated on the raw env var — Boot eagerly validates a blank ${VAR:} property and crashes.)
M8 Task 9: complete (a5e1e72..d732b93, approved after TWO fix rounds; round 1 added SessionDto.current + auth-denied + NO_PASSWORD_SET tests + EMAIL_TAKEN TOCTOU catch [saveAndFlush is load-bearing — plain save() defers the violation past the catch to commit; verified negatively with a 2-thread race test]. Round 2 fixed a CRITICAL the review caught: bh_rt is Path=/api/auth so a real browser NEVER sent it to /api/me/sessions — `current` would have been permanently false in prod, and MockMvc hid it by not enforcing RFC 6265 path matching. Moved GET /api/me/sessions -> GET /api/auth/sessions next to logout-all: no cookie widening, no token-model surgery. Regression test parses the live Set-Cookie Path. 223/223. Minor logged: that test's endpoint path is a hardcoded literal so it alone doesn't guard a move-back (the retargeted 200-asserting tests do). NOTE for T14: sessions endpoint is /api/auth/sessions, NOT /api/me/sessions — the plan text is stale.)
M8 Task 10: complete (d732b93..89a2c34, approved after 2 fix rounds; review found IMPORTANT idempotency guard inferred erasure from the email VALUE — a legitimately-registered @boxhub.invalid address made the FIRST anonymize a silent 204 no-op [GDPR erasure that reports success and does nothing]; fixed with V12 users.anonymized_at explicit state, spoof test proven red against the old guard. IMPORTANT: DELETE /api/me had NO re-auth while reversible ops required a password — now optional password, required when passwordHash != null, Google-only exempt so they can still erase themselves [accepted residual risk: no cheap OAuth step-up]. Round 2: all DELETE tests called the service directly, so the 401 claim was unproven at HTTP — added 4 MockMvc tests; bodyless DELETE confirmed 401 not 400. Also: RoleGuard.assertNotLastAdmin extracted from inline MemberController (2 callers, no dupe); PerformanceQueries takes List<UUID> not List<Membership> (would leak identity into performance's public API); history-survives test seeds real Booking+WodScore+LiftEntry via actAsBox. 236/236. NOTE: V12 exists — next Flyway is V13, not V12.)
M8 Task 11: complete (89a2c34..8e36f51, review approved first pass; brief named the wrong class [InviteAdminController] and wrongly assumed a box lookup existed — executor added the single tenancy-correct boxes.findById(TenantContext.requireBoxId()); Box is the tenant ROOT, not @TenantId, so gotcha #1 doesn't apply; InviteService.create's own @Transactional commits before the async send, so a broken SMTP can't leave a dead link; Minor logged: role passed to invite.html but unused. 237/237. BACKEND COMPLETE — T12-T14 are frontend.)
M8 Task 12: complete (8e36f51..b0ef4ee, approved after fix round; review caught a CRITICAL silent regression — the rewrite dropped M1-T10's box-token re-mint after refresh. Backend refresh reissues only bh_at/bh_rt; bh_bt shares the 15m TTL while bh_rt lives 30d, so after 15min EVERY /api/box/** call 401'd forever while the UI still showed the box selected. Restored with proper switchMap sequencing + give-up path; 4 new interceptor specs, spec 1 proven non-theatrical. Also: clear() made public (interceptor was poking session.set(null), leaving activeBox+localStorage stale). Executor fixed the brief's own login() race (async tap doesn't wait) with switchMap+from. 68/68 specs, build green, token grep ZERO hits. FYI quirk preserved from pre-M8: interceptor catchError also swallows a genuine non-token failure of the retried request into the logout path.)
M8 Task 13: complete (b0ef4ee..f4ed244, approved after fix round; review caught a CRITICAL — EVERY link BoxHub emails was dead. The FE routes are namespaced /auth/* (app convention: /auth/login, /auth/boxes) but the backend built bare paths: /verify?token= and /reset?token= hit the catch-all and silently swallowed the token; /join?token= was a query param against a join/:token PATH-param route (a T11 bug the T11 review missed). Fixed backend-side (routes are right): /auth/verify, /auth/reset, /join/<token>. Test assertions now pin the exact path segment. Also fixed: resend errors swallowed silently in login+verify pages, 60s cooldown setTimeout never cleared (OnDestroy in both). Deviations accepted: routes namespaced /auth/* per convention; bh-field/FieldComponent NOT used because it is dead code app-wide (verified) — the live pattern is the .bh-input global class + bh-button. Zero raw hex added. 237 backend / 91 frontend green.
NOTE FOR T14: AccountService.java:83 mails link "/account/email?token=" — T14 MUST create route `account/email` reading ?token= (query param), or that link joins the dead list. Sessions endpoint is GET /api/auth/sessions (NOT /api/me/sessions).
M8 Task 14: complete (f4ed244..95ef4f5, approved after fix round; the page itself was clean first pass — bh-sheet reuse, zero raw hex, states, 5 specs — but the executor also "fixed" the interceptor by excluding /api/me from refresh-retry. Review traced it: the exclusion had NO trailing slash so it caught GET /api/me, the BOOTSTRAP call — silently logging out anyone reloading after the 15m access TTL despite a valid 30d refresh token, i.e. undoing b0ef4ee. Root cause was backend semantics: a wrong body-supplied password returned 401, indistinguishable from a dead session, forcing the client to guess by URL. Fixed properly: AccountService.requirePassword/anonymize now throw 422 WRONG_PASSWORD (symmetric with the 409 NO_PASSWORD_SET already there); BadCredentialsException->401 stays for real auth failures; interceptor reverted to /api/auth/ only; regression spec proves GET /api/me refreshes+retries and would fail if the exclusion returned. Per-assertion classification verified: NO auth-denied (no-cookie) test was weakened to 422. Route account/email reads ?token= — the 4th and last emailed link is NOT dead. 237 backend / 108 frontend green.)
M8 Task 15: complete. e2e journey through real Mailpit inbox (0072248) — driving the real browser found 3 bugs no unit test saw: P0 CSRF (Spring's own STATELESS config adds SessionManagementFilter w/ NullSecurityContextRepository -> CsrfAuthenticationStrategy deleted the XSRF cookie every request -> login worked then box-token 401'd, nobody past the box picker; fixed w/ .securityContext(RequestAttributeSecurityContextRepository), regression test proven red on revert), anonymous visitors bounced off public auth routes, flash of unthemed content. Invite P0 (9e2c7ba) — M8 verification gate broke the M1 invite chain (register->login->accept, login 403s unverified); ruling: an invite proves the inbox (same precedent as T6 reset), registering through a valid invite for that email lands verified; layering via InviteOwnershipProof port (identity owns, box implements), native-SQL findByTokenHash (@TenantId trap). Docs + theme regression test (e8198b8) — proper red/green proven (Expected undefined to be 'dark' without the initializer). Final whole-branch review (Opus): SHIP, found ONE cross-cutting bug two correct commits created — T9 moved sessions under /api/auth, T14 blanket-excluded /api/auth from refresh, so after 15m sign-out-everywhere silently no-oped; fixed ded53ea (carve sessions+logout-all back into refresh, keep refresh/box-token/login excluded) + register @Size 8->10. Minors #2 (resolver skip for invites/tv) evaluated and REJECTED — would break authenticated invite-accept, TV carries no bh_at, self-heals; #4 users.updated_at dead column already logged. Backend 243 / frontend 112 / e2e 19. M8 COMPLETE — ready to merge.
## M9 onboarding — 2026-07-19 — branch m9-onboarding, base d54d309
M9 Task 1: complete (d54d309..8371d71, review approved first pass; plan bug caught by executor — boxes.created_at exists since V1, duplicate ALTER dropped and entity maps the V1 column; @Column name=key needs no quoting in Postgres [verified]; Minor logged: created_at mappings omit nullable=false [cosmetic]; 247/247)
M9 Task 2: complete (8371d71..eb5aff6, approved after 2 fix rounds; review empirically reproduced the Postgres aborted-tx trap TWICE more — joinWaitlist's DIVE catch inside its own @Transactional 500'd via UnexpectedRollbackException [5/5 repro], and AuthService.register's recovery ran findByEmail in the aborted tx [4/5 repro, pre-existing M8 bug now load-bearing on the public form]. Fixed with the GoogleLinkTx pattern: RegisterTx + BoxSignupTx proxied units, signup() non-transactional orchestrator, user+box+membership in ONE atomic unit [also closed the latent both-see-fresh precheck race], taken-vs-slug DIVE disambiguated by re-read. Re-review verified all register invariants (a-e table) + verify-mail strictly after commit, found the retry unguarded under triple concurrency — orchestrator fixed inline: bounded 3-attempt classify-and-retry, terminal 503 SIGNUP_RETRY, BoxSignupRetryTest pins the bound. 259/259.)
M9 Task 3: complete (eb5aff6..7774cd8, review approved first pass — adversarial bypass hunt clean: cookies.box() has exactly ONE call site behind requireReachable; refresh never re-mints bh_bt server-side [FE re-mint goes through the gated endpoint]; stream 403 leaves no emitter registry entry; invite gate precedes row+mail; PENDING claim leaves device reclaimable; stale TV token for a suspended box is inert [connect is its only consumer]. 266/266.)
M9 Task 4: complete (7774cd8..f6cdd9c, approved after fix round; review found IMPORTANT settings PATCH half-apply [signupMode written before maxBoxes validated — 400 with a silently flipped live mode] and IMPORTANT lifecycle mail firing inside the tx before commit [house rule: mail strictly after commit]. Fixed: validate-all-then-write + new BoxLifecycleTx @Component (flip+cap-check+ownerEmail inside @Transactional returning TransitionResult; mail/disconnectBox strictly after the proxy returns; suspend's disconnect also moved post-commit). CAP_REACHED rollback pinned by a DB-state assertion. Executor deviations verified: findFirstByBoxIdAndRole unordered [one admin at signup, commented], emitter-completed proof via send()-throws [deterministic], InvitePublicController MembershipDto boxStatus fix [all 3 construction sites consistent]. 281/281. BACKEND COMPLETE — T5/T6 are frontend.)
M9 Task 5: complete (f6cdd9c..2a707a5, review approved first pass; guard/bootstrap ordering verified NOT a race [initializers complete before initial navigation]; full-after-submit waitlist carryover spec-proven; CAP_REACHED leaves the row queued with per-row inline error matching backend rollback truth; settings PATCH pins always-both-fields; zero raw hex; Minors logged: single-scalar action-pending signal permits duplicate submit under concurrent per-row clicks [internal tool, backlog], plain <a> links match file convention vs brief's routerLink. 127/127 FE.)
M9 Task 6: complete (2a707a5..b7f2959, executor died on session limit near the end — orchestrator verified gate + committed 17b8e8e [134/134], then review found 2 IMPORTANTs from the cutoff: showSetupGuide swallowed fetch errors for a fresh ACTIVE box [binding loading/error/empty rule], and the invite/TV pending branches + 403 BOX_PENDING mapping had zero specs [brief Step 3]. Fixed b7f2959: one-line guard so the inner @switch surfaces loading/error/retry, new invites.page.spec + extended tvs.page.spec covering pending-card vs form + 403 mapping. step2 honestly = step1 [no separate slots field on class-templates, documented]. 140/140 FE.)
M9 Task 7: e2e onboarding journey 24/24 (19 M8 + 5 new, fresh stack), backend 281, frontend 140 (9c765a1). Final whole-branch review (Opus): FIX FIRST on ONE cross-cutting P1 — M9's new 403 BOX_SUSPENDED at box-token mint met two pre-M9 selectBox() call sites (login, box-picker) with no error arm → a suspended box's member typed correct credentials and got a dead blank form. Fixed 16ed637 (error arms both sites + specs; login test fakeAsync through the bootstrap chain; box-picker got its first spec), 142/142 FE. Review confirmed coherent: interceptor only refreshes on 401 [new 403/409/400/503 pass through], cap hard in APPROVAL / soft in OPEN [backlog], cache bust sole-writer fresh, console optimistic removal only on 200. Minors → backlog: OPEN soft cap, verify no auto-select, console per-row pending scalar. Impeccable gate NOT run on M9 FE surfaces — same call as M8 (P0/P1 substance hunted in per-surface reviews; plain-by-design, M12 restyles).
## M10 memberships & payments — 2026-07-20 — branch m10-memberships-payments, base 3f04a0a
M10 Task 1: complete (3f04a0a..956aa3e, review approved first pass). V14 + Subscription/Payment/BoxStripe entities + grandfather migration. 286 tests, 1 skipped (BookingEngineTest.weeklyLimitBlocksAtBoundaryAndIgnoresWaitlist, @Disabled "M10 T4 restores the entitlement check" — T4 MUST re-enable). Executor escalated 3 items, orchestrator ruled: (1) the brief's MigrationGrandfatherTest was DEFECTIVE — shared container runs V14 on an empty schema so its global count assertion was 0==0, and went order-dependent once other classes made bare memberships; rewritten standalone (@Testcontainers, own Postgres, no Spring, programmatic Flyway target 13 -> seed 2 boxes/plans/3 memberships -> target 14) and it now really pins per-box synthetic-plan isolation + plan-holder retention + plan_id dropped. (2) THIRD unlisted bridge site MemberController (brief named only BookingService:141 + InvitePublicController) at MemberController.java:72 (patch) and :78 (toDto) — planId/planName now always null; PatchMemberRequest.planId at :39 is a LIVE but silently-ignored request field. T6 OWNS: drop planId from the request record AND restore planName on the response from the ACTIVE subscription's plan; T7 owns repointing the admin members UI (plan assignment moves to the record-payment flow). (3) MigrationTest.v2AddedColumns un-pinned memberships.plan_id — correct, V14 drops it by design. Orchestrator closed the review's one Minor inline (956aa3e: entitlement backfill assertions). Minors logged: findByStatusAndCurrentPeriodEndBefore unexercised until T6's sweep; BookingService memberships/plans fields idle until T4.
M10 Task 2: complete (956aa3e..0f319ef, approved after 1 fix round). CryptoService (AES-GCM, 96-bit random IV per call, 128-bit tag, key from boxhub.stripe.enc-key) + GET/PUT/DELETE /api/box/stripe (all three BOX_ADMIN, all scoped by TenantContext.requireBoxId() since BoxStripe is NOT @TenantId). 298 tests, 1 skipped (the T4-pending disable). Review found a CRITICAL: application.yml shipped a REAL valid 32-byte base64 key as the BOXHUB_STRIPE_ENC_KEY fallback, so a prod deploy with the env var unset would boot happily and encrypt every box's live Stripe credentials with a key committed to the repo — and the executor's report wrongly claimed that path failed fast. Fixed 0f319ef: `enc-key: ${BOXHUB_STRIPE_ENC_KEY}` with NO default (unresolved placeholder = BeanCreationException at startup; verified BoxhubApplication has no try/catch to swallow it), 32-byte check untouched, docker-compose + AbstractIntegrationTest @TestPropertySource supply their own. Verified AbstractIntegrationTest is the ONLY @SpringBootTest in the suite (62 classes extend it) so no orphan context broke. Also added 3 tests: blank restrictedKey/webhookSecret -> 400, reconnect overwrites (one row, second key wins). Other-defaults audit clean (JWT default is an obvious placeholder).
  OPEN ITEM FOR T8/MERGE: the old fallback key string still exists in git history at commit 1f6ac58 (branch is local + unpushed). It never protected real data. Decide before push: rewrite branch history vs accept.
  NOTE FOR T6/T7: GET /api/box/stripe is BOX_ADMIN-only by design, so an ATHLETE cannot probe whether the box has Stripe. T6's GET /api/box/me/subscription MUST carry a `stripeAvailable` boolean for T7's Subscribe button to gate on.
M10 Task 3: complete (0f319ef..9d9a087, review approved first pass). SubscriptionService.recordPeriod/cancel/activeFor. The whole create-or-extend rule collapses to `base = (currentEnd != null && currentEnd.isAfter(now)) ? currentEnd : now` — one line covering all four cases (stack-when-early, restart-when-lapsed, end-the-grandfather, brand-new). activeFor predicate = ACTIVE && (end == null || end.isAfter(now)), boundary-exclusive; T4's booking gate reuses it verbatim. Different-plan-while-active -> conflict("SWITCH_REQUIRES_CANCEL") 409. priceCents stored verbatim with no floor against list price (the negotiated-discount case is not an error). Reviewer verified conflict(...) is a PRIVATE per-class helper in BookingService, so duplicating its shape is the codebase convention, not a deviation. 307 tests, 1 skipped (T4-pending disable).
  Minor logged for final review: a same-membership concurrent recordPeriod hits the partial unique index and surfaces as an uncaught DataIntegrityViolationException (500, not 409) — deliberate per brief, upgrade path in the method javadoc. Unchecked: whether a global @ControllerAdvice already translates DIVE to something cleaner. Worth one line at T8.
M10 Task 4: complete (9d9a087..18e3274, review approved first pass). BookingService.weeklyLimitReached -> entitlementBlocked: activeFor empty -> NO_ACTIVE_SUBSCRIPTION, UNLIMITED -> allow, WEEKLY_LIMIT -> existing Mon-Sun box-tz count vs plan limit. 312 tests, ZERO skips (T1's @Disabled gone). PROCESS NOTE: executor died in a wait-loop on its own background mvn run without committing or reporting; orchestrator ran the gate foreground, committed 18e3274, and reconstructed .superpowers/sdd/task-4-report.md (which also overwrote a STALE M9 report — the task-brief/report scripts REUSE filenames across milestones, so always overwrite, never trust an existing report file).
  Orchestrator closed the review's one open ⚠️ directly: diffed weeklyLimitReached@3f04a0a against entitlementBlocked@HEAD — the 5 timezone lines (ZoneId/previousOrSame(MONDAY)/atStartOfDay both boundaries) are BYTE-IDENTICAL, so the box-local Mon-Sun window is genuinely verbatim (this is the bug class M5.5 shipped once). Also confirmed `if (limit == null) return false` is PRE-EXISTING behavior, not new defensive code, so the reviewer's Minor about it is moot.
  Reviewer verified the risky part line-by-line: fixture helpers in BookingEngineTest/BookingConcurrencyTest/HomeSurfaceApiTest gained a subscription, but NO assertion, thread count, barrier or capacity number was touched — no-oversell intact. Real latent bug found + fixed by the executor: BookingEngineTest.newPlan never set entitlement, so the restored weekly-limit test would have passed via the UNLIMITED short-circuit without exercising the limit at all. Lapse semantics verified: only book() calls the gate; cancel/checkIn/uncheck/markNoShow untouched, so already-booked classes survive a lapse.
M10 Task 5: complete (18e3274..655ea80, approved after 3 fix rounds — hardest task in the milestone). StripeCheckoutService.createSession + POST /api/stripe/webhook (permitAll, CSRF-exempt via csrfRequired set alongside /api/tv/pair). Webhook: raw bytes via getInputStream().readAllBytes(); box resolved from the Payment row's OWN box_id BEFORE verification (executor's deviation A — more trustworthy than metadata.boxId, avoids stripe-java's typed deserializer); signature verified against that box's decrypted webhook secret; all @TenantId work inside runAsBox(boxId,...) mirroring TvStreamService; PaymentRepository.findByStripeSessionId converted to nativeQuery for the tenant-less lookup. Idempotent on already-SUCCEEDED. StripeWebhookTest signs events by hand (HMAC-SHA256, no network) and asserts real DB state.
  FIX ROUND 1 (76bdcdb): review found a CRITICAL — createSession required an ACTIVE subscription, so the moment T6's nightly sweep flips a lapsed sub to EXPIRED the member the lapse email TARGETS got 409 NO_ACTIVE_SUBSCRIPTION and could never renew. Fixed: no-ACTIVE branch now allowed, PENDING payment pointed at most-recent sub row (new findFirstByMembershipIdOrderByCreatedAtDesc) to satisfy the NOT-NULL FK; ACTIVE-different-plan still 409 SWITCH_REQUIRES_CANCEL. Also IMPORTANT: recordPeriod re-resolves the active sub independently so the payment could point at the wrong row — webhook now sets payment.subscriptionId = recordPeriod's RETURNED sub (T6 receipts read this). Applied INLINE (fix subagent died on session limit). New StripeCheckoutServiceTest (Session.create stubbed via mockStatic — Mockito 5 inline maker, no network).
  FIX ROUND 2 (dc4ab5f): re-review found the round-1 fix opened a NEW deterministic bug — webhook still read planId from the STALE placeholder sub, so a lapsed member renewing onto a DIFFERENT plan was charged the new price but activated on the OLD plan (wrong duration/entitlement). Fixed: webhook reads purchased planId from the VERIFIED event's data.object.metadata.planId (trustworthy post-signature), falls back to placeholder plan only if absent; membershipId still from placeholder (same member, correct). New test: placeholder plan A 30d / metadata plan B 90d -> asserts activation on B. Tenant filter independently blocks cross-box plan substitution (Plan is @TenantId, runAsBox scopes findById).
  FIX ROUND 3 (655ea80): re-review Approved; closed its one Important inline — UUID.fromString(metaPlanId) on a malformed-but-signed value threw -> 500; now parsePlanId() falls back to the placeholder plan. Added a cross-ref comment at checkout putMetadata so the dependency can't be silently dropped. 320 backend tests, 0 skips.
  Deviation A (box from Payment row, not metadata.boxId) verified sound across all 3 passes. NOTE FOR T6: webhook leaves `// T6 wires the receipt mail` seam at StripeWebhookController after payments.save(p); T6 wires PaymentReceipts there (after commit).
M10 Task 6: complete (655ea80..cf5b55f, review approved first pass; 2 Minors closed inline). BIGGEST backend task (77KB diff). SubscriptionController (POST /api/box/subscriptions admin-record rejecting STRIPE 400, POST /checkout athlete, GET /api/box/me/subscription with stripeAvailable bool for T7's Subscribe gate), ReceiptController (GET /api/box/receipts/{id}, per-row auth isAdmin||isPayer else 403, cross-tenant 404 via @TenantId filter), PaymentReceipts, SubscriptionLapseJob, invite-accept subscription. Split into SubscriptionTx + InviteAcceptTx proxied @Components (BoxLifecycleTx pattern) so mail fires strictly AFTER commit in ALL THREE rails (admin receipt, webhook receipt via ReceiptData returned out of tx.execute, lapse notice). Webhook idempotent-replay returns null -> no duplicate receipt. 330 tests.
  LAPSE-JOB TENANCY (the trap): findByStatusAndCurrentPeriodEndBefore is @TenantId-derived so tenant-less returns NOTHING. Chosen fix = iterate boxes.findAll() (Box not @TenantId) and runAsBox(boxId) per box BEFORE opening tx (SessionGenerator ordering), reusing the T3 query under each real tenant. Reviewer verified architecturally correct against TenantIdentifierResolver->TenantContext->SecurityContextHolder chain. Grandfathered null-end excluded for free (SQL NULL comparison is UNKNOWN); already-EXPIRED excluded by status='ACTIVE'.
  T1 DEBT DISCHARGED: MemberController.toDto now resolves planName/planId from activeFor's plan; planId REMOVED from PatchMemberRequest (not just ignored). T5 SEAM wired. Invite-accept creates ACTIVE sub, NO Payment row, concrete end.
  Review's 1 Important (sweepAll() cross-box entry untested — only sweepBox) + 2 Minors closed inline (cf5b55f): added two-box sweepAll() test proving both flip; tightened same-box receipt-auth to deterministic 403. Minor NOT actioned (accepted): payment-receipt.html divides cents/100.0 in the Thymeleaf mail template — email can't route through the Angular FE so backend formatting there is unavoidable; no DTO/stored value uses a float. Logged for final review visibility.
  CARRY TO T7: FE members.page.ts / admin.service.ts STILL send planId on member PATCH (now a removed field) — T7 MUST stop and move plan assignment to POST /api/box/subscriptions. GET /api/box/me/subscription carries stripeAvailable. Receipt route is GET /api/box/receipts/{paymentId}. 331 tests after inline test adds.
M10 Task 7 (backend contract prep, orchestrator inline, c474694): GAP FOUND — PlanController never exposed the price/currency/entitlement columns T1 added, so the T7 plans UI had no contract. Extended PlanDto + Create/PatchPlanRequest (all new inputs optional for back-compat; entitlement defaults from weeklyClassLimit presence; WEEKLY_LIMIT without a limit -> 400). Also fixed a LATENT suite-accumulation break my M10 tests triggered: Box.status defaults "ACTIVE" and superadmin approve enforces platform-wide countByStatus("ACTIVE") > maxBoxes(100); the shared Testcontainer never rolls back boxes, and M10's ~7 new box-creating tests pushed the total past 100, so SuperadminBoxApiTest.approvePendingBoxActivatesAndMailsOwner started getting CAP_REACHED. Decoupled that one happy-path test by raising the cap before approving (can't touch @BeforeEach — settingsGetReturnsSeededValues asserts the seeded 100; reactivate has no cap check; OPEN-mode signup is soft-cap; cap-reached test sets its own 0). 334 backend tests green, 0 skips.
  FE CONTRACTS for the T7 executor: plans GET/POST/PATCH /api/box/plans PlanDto{id,name,durationDays,weeklyClassLimit,archived,priceCents,currency,entitlement}. Stripe GET /api/box/stripe->{connected}, PUT{restrictedKey,webhookSecret}->204, DELETE->204 (BOX_ADMIN). Admin record POST /api/box/subscriptions{membershipId,planId,method CASH|TRANSFER|CARD|OTHER,priceCents,priceNote?,reference?}->SubscriptionDto (STRIPE->400 INVALID_METHOD, priceCents<0->400 INVALID_PRICE, foreign membership->404). Checkout POST /api/box/subscriptions/checkout{planId}->{url} (403 STRIPE_NOT_CONNECTED). GET /api/box/me/subscription->MySubscriptionDto{stripeAvailable,subscription:SubscriptionDto|null,plan:PlanSummaryDto|null}. Receipt GET /api/box/receipts/{paymentId}->ReceiptDto{paymentId,amountCents,currency,method,planName,periodStart,periodEnd,listPriceCents,discountCents,boxName,createdAt} (403 NOT_YOUR_RECEIPT unless payer or admin). Error codes to map friendly: NO_ACTIVE_SUBSCRIPTION, SWITCH_REQUIRES_CANCEL, INVALID_METHOD, STRIPE_NOT_CONNECTED.
M10 Task 7: complete (c474694..80df386, approved after 1 fix round). FE: admin plans page gains price/currency/entitlement, admin subscriptions (record-payment) page, box-stripe connect page, athlete membership page (Subscribe gated on stripeAvailable), receipt page (route receipts/:paymentId) + routes/nav. T6 debt discharged: members.page/admin.service no longer send planId on member PATCH. 171 FE specs, ng build green, backend 334 green. Money stays integer cents to the wire (specs assert priceCents:2550 from "25.50").
  Review found 3 Importants + escalated a real cross-cutting gap; all fixed in 80df386:
  (1) CRITICAL-in-effect: AGREED PRICE input was not required and record() coerced null -> `?? 0`, so an admin leaving it blank silently recorded a REAL payment as EUR 0.00, indistinguishable from a comp. Fixed with a `== null` guard (NOT falsy — explicit 0 must still submit as a legit comp) in record() itself, so an Enter-to-submit bypass of the disabled button is also caught. Two discriminating specs.
  (2) One <label> wrapped BOTH the search input and the member <select> that actually carries selectedMembershipId — split into two.
  (3) plans.page.ts load() had no error/loading state (silently blank forever on a failed fetch) — the one screen left as an outlier while its 4 siblings had loading|error|ready+retry. Matched to the sibling shape.
  (4) RECEIPT WAS UNREACHABLE: no API anywhere returned a paymentId, AND PaymentReceipts emailed a link to /membership instead of the receipt — the same dead-emailed-link class that shipped 3 times in M8 (gotcha #9), and it would have BLOCKED T8's e2e receipt assertion outright. Fixed: paymentId added as an additive FLAT field on SubscriptionDto (a wrapper would have nested and broken existing $.status/$.id root assertions); mySubscription() keeps a null-paymentId overload (not payment-scoped); PaymentReceipts emails /receipts/<id> matching the Angular route receipts/:paymentId EXACTLY (plural verified both sides); backend test pins the link with exact-equality via ArgumentCaptor (not a substring that would pass on a wrong path); admin UI renders a View receipt link from the returned id.
  Executor also fixed one line outside scope, verified correct: book.page.ts error switch was missing NO_ACTIVE_SUBSCRIPTION (a real BookingService code) and fell through to a generic error.
  Minor logged: View-receipt is a bare styled <a> rather than a ghost bh-button (tokens respected); admin member picker reuses listMembers default page size 20 (pre-existing).
M10 Task 8 step 1 (e2e): complete (80df386..e902bd9). e2e 25/25 (24 pre-existing + new memberships.spec.ts), backend 334/334 zero skips.
  REAL PRODUCT BUG FOUND BY E2E (exactly what it is for — 4th milestone running that driving a real browser caught what no unit test saw): M10's entitlement gate blocks any booking without an active Subscription, but DevDataSeeder was never updated for M10 — it seeded 8 demo athletes with NO priced plans and NO subscriptions. The V14 grandfather migration does NOT save this because on a fresh volume Flyway runs V14 against an EMPTY database (grandfathering zero rows) and the seeder creates memberships only afterwards. So every demo athlete was permanently unable to book on a fresh M10 stack and the pre-existing booking-flow.spec.ts failed deterministically ("You need an active plan to book classes"). Reproduced 3x, including on a baseline run taken BEFORE the new spec existed. The seeder's seedBookings writes Booking rows directly via the repository, bypassing BookingService — which is why seeding still succeeded while interactive booking was blocked.
  Fixed in e902bd9 (this was already in the plan's scope, spec §8 "DevDataSeeder reseeds priced plans and a mix of subscriptions" — it had simply never been done): two priced plans (Unlimited Monthly 8900c/UNLIMITED, 3x Weekly 5900c/WEEKLY_LIMIT+limit 3) and an ACTIVE subscription for ALL 8 athletes via SubscriptionService.recordPeriod — 4 unlimited + 2 weekly at list, one negotiated discount (7000 vs 8900 list, with priceNote), one hand-rolled grandfathered (null currentPeriodEnd, since recordPeriod always sets one). Verified by direct psql query against the fresh container.
  e2e authoring gotchas recorded by the executor: a first draft used the static seeded athlete6@demo.io and broke on retry against the shared backend (hit a REAL SWITCH_REQUIRES_CANCEL from the residual subscription) — fixed by inviting a fresh throwaway athlete per run, which is retry-safe; and bh-button needs the inner button clicked, not the host.
M10 Task 8 step 2 (final whole-branch review fixes): complete. Backend 343/343 zero skips (was 334), frontend 181/181 specs (was 171) + ng build green, e2e 25/25 on a fresh volume.
  CRITICAL fixed: StripeWebhookController granted the subscription/receipt on checkout.session.completed by event TYPE alone, ignoring payment_status — a delayed-notification method (SEPA debit, bank transfer) fires that event immediately with payment_status "unpaid" and only truly settles via checkout.session.async_payment_succeeded (or fails via async_payment_failed) days later. Fixed: gate on payment_status=="paid" for BOTH accepted event types before entering runAsBox; anything else is a 200 no-op (payment stays PENDING, no mail). New StripeWebhookTest covers unpaid-completed -> no-op -> async_payment_succeeded settles exactly once -> replay of either changes nothing further; asserts scoped to the "payment-receipt" mail template since newFixture's own register() sends an unrelated verify email through the same now-mocked Mailer bean (adding @MockitoBean Mailer broke all 6 pre-existing tests in the class via AuthService.sendVerification's Map.of("link", null) NPE on an unstubbed mailer.link() — fixed with a class-level @BeforeEach stub, same convention as SubscriptionApiTest/SubscriptionLapseTest).
  IMPORTANT fixed: (1) DELETE /api/box/subscriptions/{id} (BOX_ADMIN, tenant-scoped via Subscription's @TenantId findById -> 404 not 403 for a foreign id) now exposes SubscriptionService.cancel, which had zero callers — the "cancel your plan first" error was previously unactionable. Cancel control added to admin/subscriptions.page.ts (shown when the selected member has an active subscriptionId, which required adding that field to MemberController.MemberDto/Member — additive, same convention as T7's paymentId). (2) subscriptions.page.ts's mapRecordError now names SWITCH_REQUIRES_CANCEL and points at the new control. (3) HomeController.planDaysLeft/planExpiringSoon, AdminStatsController.expiringPlans and MemberController.expiringSoon/expiresAt now all source from the membership's active Subscription (via SubscriptionService.activeFor) instead of the dead Membership.expiresAt column that nothing writes post-M10 — grandfathered (null end) never expiring, same thresholds as before. expiresAt column NOT dropped (needs a migration; backlogged). (4) BookingEntitlementTest gained two tests pinning the milestone's other half: a lapse (via the real SubscriptionLapseJob.sweepBox) never disturbs an existing booking (checkIn/cancel still work, only a fresh book() 409s), and waitlist promotion still promotes a member who lapsed while waitlisted. (5) invites.page.ts's plan select now requires an explicit choice (a real plan, or an explicit "No plan (bill manually)") whenever the box has priced plans — no more silent "No plan" default producing an unbookable member; skipped for a box with zero plans yet (nothing to choose, same as before). members.page.ts replaced the bare "—" with a "No active plan" link to /admin/subscriptions. Updated e2e memberships.spec.ts/invite-flow.spec.ts to explicitly select "No plan (bill manually)" (onboarding.spec.ts's box has zero plans, so it was unaffected). (6) SubscriptionService.recordPeriod now sets currentPeriodStart = base (the same instant the new end is computed from), not just currentPeriodEnd — a renewal's receipt no longer claims a multi-period term for a single period's payment.
  CHEAP MINORS fixed: SubscriptionController.record() null-checks membershipId/planId -> 400 (was a 500 via plans.findById(null)). DevDataSeeder now gives admin+both coaches subscriptions too (not just the 8 athletes), and seedPlansAndSubscriptions cycles by roster index instead of hard-indexing athletes.get(7), so a trimmed demo roster can't throw at startup. receipt.page.ts's stale "record() doesn't return a paymentId" comment corrected.
  DEFERRED per orchestrator instruction (not touched): MemberController.toDto N+1, Payment.listPriceCents snapshotting, webhook's 200-vs-400 existence oracle, dropping Membership.expiresAt, self-serve box owner's missing subscription.
M10 Task 8 steps 2-3 (docs + final whole-branch review): docs e11fec0 (HANDOFF M10 entry + BOXHUB_STRIPE_ENC_KEY dev note + next Flyway V15 + next step M11 + execution lessons; BACKLOG gets the review's deferred items; fixed the stale M2 line claiming booking reads a membership plan).
  FINAL WHOLE-BRANCH REVIEW (Opus, 16 commits / 327KB): verdict FIX FIRST, 1 Critical + 6 Importants — all real, all cross-cutting things the per-task reviews structurally could NOT see. Fixed in 4586598 (backend) + de92f9d (frontend) + c10c0e9 (e2e):
  CRITICAL: the webhook branched on event TYPE only, so `checkout.session.completed` with payment_status "unpaid" (SEPA direct debit / bank transfer — one dashboard toggle on a EUR account, and Plan.currency defaults to eur) granted an ACTIVE subscription + SUCCEEDED payment + receipt BEFORE the money settled; if the debit bounced the member trained free. Now gated on payment_status=="paid" and accepts checkout.session.async_payment_succeeded; idempotency is a property of the ROW (the SUCCEEDED guard), so completed-unpaid -> no-op -> async-succeeded -> process -> replay -> no-op extends exactly once. async_payment_failed deliberately falls through leaving the payment PENDING (nothing was granted).
  IMPORTANT: (1) SubscriptionService.cancel had ZERO callers — both rails 409 SWITCH_REQUIRES_CANCEL and the athlete UI said "cancel first", but no endpoint/control existed anywhere, so a member was stuck until lapse. Added DELETE /api/box/subscriptions/{id} (BOX_ADMIN, tenant-scoped 404) + admin control. (2) FE admin form never mapped SWITCH_REQUIRES_CANCEL. (3) Membership.expiresAt survived M10 with NO writer, so athlete-home expiry warning, admin "expiring plans" tile and member expiringSoon were all permanently dead — repointed at the active subscription's currentPeriodEnd (column kept; dropping needs a migration -> backlog). (4) Coverage gap: the NON-block half of the lapse rule was asserted nowhere — new test lapses via the real sweepBox then proves booking survives + checkIn/cancel work + fresh book 409s, plus waitlist promotion for someone who lapsed while waitlisted. (5) Invite form defaulted to "No plan" -> invitee joins unbookable; plan now required + members row shows "No active plan" instead of a dash. (6) recordPeriod never advanced currentPeriodStart, so a 6th-month receipt read "Period 12 Feb - 21 Aug" — a financial document claiming a 6-month term for a 1-month payment.
  RE-REVIEW: SHIP, zero Critical/Important, each item verified at root. Its 2 cheap Minors closed inline (bac176b): PatchMemberRequest.expiresAt removed (same dead-field defect planId had in T6 — an admin PATCHing it got 200 back with the SUBSCRIPTION's date, silently ignoring the input) + FE patchMember type; athlete SWITCH_REQUIRES_CANCEL copy now "Ask your box to cancel" since cancel is admin-only. Remaining Minors -> BACKLOG (AdminStats/MemberController N+1, StripeWebhookTest @MockitoBean forking a 2nd Spring context, zero-plan-box invite hole, INVALID_PLAN/INVALID_MEMBERSHIP FE copy).
  Gates after the inline Minors: backend 343/0/0, frontend 181/181 + build green (only the 3 pre-existing bundle-budget warnings).
M10 Task 8 step 4 (merge): e2e re-run on a fresh stack after the final inline Minors — 25/25 passed (50.4s). Backend 343/0/0, frontend 181/181 + build green.
  MERGE: user chose SQUASH (asked, not assumed) so the dev Stripe enc-key that briefly shipped as an application.yml default at 1f6ac58 never enters main's history. Merged as a single commit 59d9349 onto main (base 3f04a0a). VERIFIED: `git grep` finds the key absent from main's tree AND `git merge-base --is-ancestor 1f6ac58 HEAD` confirms the offending commit is NOT an ancestor of main. The 21-commit task-by-task history stays on the m10-memberships-payments branch (kept locally) and in this ledger.
  PROCESS INCIDENT worth remembering: chaining `git log | wc -l && git checkout main && git merge --squash` in ONE Bash call hit the 2-minute tool timeout mid-checkout (exit 143), leaving HEAD on the m10 branch with a worktree reverted to main's content — looked alarming (M10 files showing as deleted) but nothing was lost since every commit was already in git objects; `git reset --hard HEAD` restored it. On this repo git checkout/merge across the full tree takes >2min, so run git steps ONE PER CALL with a generous timeout, never chained.
M10 COMPLETE. Merged main re-verified 343/0/0 then PUSHED (3f04a0a..59d9349). M0-M10 all on main + pushed. No milestone in progress. Next: M11 security hardening (brainstorm first — not yet specced). Next Flyway V15.
## M11 security hardening — 2026-07-21 — branch m11-security-hardening, base 01fc409
Execution model (decided with user): per-task model tiering. Orchestrator = session model. OPUS for T1 (sweep), T2 (authz fixes), T6 (secrets/crypto), T12 final review. SONNET for T3,T4,T5,T7,T8,T9,T10,T11. NO haiku — every M11 task carries security judgment (M10 evidence: the "mechanical" Stripe task needed 3 fix rounds for real money bugs). Reviewer model scales to diff risk (opus reviews T1/T2/T6). ESCALATION LADDER: a BLOCKED or a review Critical re-dispatches the FIX one tier UP.
M11 Task 1: sweep built (01fc409..a74fe80) — review NEEDS FIXES (opus reviewer, 3 Criticals). 344 tests green, 111 routes mapped, 19 allowlisted.
  The sweep found 7 routes returning 400 instead of 403 on the foreign probe (@Valid @RequestBody validates during argument resolution, BEFORE the method body, so imperative RoleGuard never runs).
  CRITICAL REVIEW FINDINGS — the sweep as built does NOT prove what it claims:
  (1) LOAD-BEARING DEFECT, INHERITED FROM MY PLAN: the foreign-box probe substitutes a RANDOM UUID, so it only asserts "unknown id -> not 2xx" — true of any CRUD app. A handler doing repo.findById(id) with NO tenant filter returns 404 for a random UUID and PASSES. To assert tenancy the probe must seed a REAL resource in box A and hit it with box B's token. Until fixed, "tenancy cannot regress" is supported by no assertion in the sweep.
  (2) Default-deny only applies inside /api/box/ — the test `continue`s for every other route, so /api/admin/** (9 superadmin routes), /api/me/**, /api/invites/*/accept get the 401 probe and NOTHING else. A new /api/admin route cannot fail the sweep. Box-admin -> superadmin escalation is precisely what a standing guarantee should own. Also PUBLIC_ALLOWLIST is matched on PATTERN not METHOD+pattern, while MIN_ROLE/KNOWN_GAPS are keyed "METHOD pattern" — SecurityConfig permits /api/invites/* for GET only, so a later DELETE on that pattern is silently exempt.
  (3) THE 7 KNOWN_GAPS ARE NOT PRODUCTION HOLES — they are a sweep instrumentation limitation. The probe sends `{}`; a WELL-FORMED body sails past @Valid into RoleGuard on line 1 and correctly 403s. No unauthorized caller can reach any effect, and the 400 leaks nothing tenant-dependent. The executor's report recommended replacing in-body RoleGuard with declarative/interceptor authz across the codebase — a large risky refactor for ZERO exploitability. ORCHESTRATOR RULING: do NOT re-architect authz. Fix the sweep's probe body instead, then delete the entries.
  Deviation APPROVED: foreign probe fires only on routes with a path variable (a collection route legitimately returns box B's OWN data, so "deny" is the wrong assertion; firing everywhere gave ~30 false positives and crashed multipart handlers). BUT the blind spot must be closed by seeded fixtures: the right collection assertion is "box B sees ZERO of box A's seeded rows", not "denied".
  Also: COACH declared in MIN_ROLE but never probed (~25 routes incl. programming writes + all /api/box/tv — one-line fix); KNOWN_GAPS suppresses ALL three probes not just the failing one.
  ENVIRONMENT: backend/target/ held 2620 iCloud conflict-copy .class files making classpath scanning take >15min and look like a hang; `rm -rf target` fixes it. Repo wants an iCloud exclusion.
  T2 REDEFINED: not "fix 7 authz holes" but "make the sweep actually prove tenancy (seeded cross-tenant fixtures, superadmin coverage, method-keyed allowlist, COACH probes, valid bodies), then fix whatever REAL holes it then finds".
M11 Task 2: NOT STARTED — dispatched on opus, killed immediately by a MONTHLY SPEND LIMIT (not a code problem). Zero files written, worktree clean at a74fe80. Re-dispatch when budget resets.
  T2's full redefined brief is in the message history AND summarized in the T1 entry above. The six fixes it must make, in priority order:
  (1) CRITICAL: probe uses a random UUID -> asserts nothing about tenancy. Must seed REAL resources in box A (plan, subscription, payment, membership, invite, class session, session item, class template, movement, wod, TV device, profile...) and a registry mapping path-variable name -> real box-A id, then probe with box B's token. A route whose path variable has no seeded counterpart must FAIL LOUDLY, never silently fall back to a random UUID.
  (2) CRITICAL: extend default-deny beyond /api/box/ — /api/admin/** (9 superadmin routes) currently gets only the 401 probe, so box-admin -> superadmin escalation is unguarded; also key PUBLIC_ALLOWLIST by METHOD+pattern (SecurityConfig permits /api/invites/* for GET only).
  (3) CRITICAL: do NOT re-architect authz (orchestrator ruling). Give the sweep a valid body per route so the probe reaches RoleGuard, then delete those KNOWN_GAPS entries. Only a route that still fails WITH a valid body is a real hole.
  (4) Collection GETs: assert "box B sees ZERO of box A's seeded rows" rather than "denied".
  (5) Probe COACH too (currently only BOX_ADMIN — ~25 routes assert nothing, incl. programming writes + all /api/box/tv).
  (6) KNOWN_GAPS suppression must be per-assertion, not total. Plus minors: assert failures before unlisted, drop the dead /actuator/health entry, correct the /api/tv/stream justification, comment the method-less-@RequestMapping GET-only branch.
  MANDATORY EVIDENCE for T2: a negative control — temporarily break one tenant-scoped handler (findByIdAndBoxId -> findById), show the sweep FAILS, revert. A sweep never seen to fail proves nothing.
M11 Task 2: complete (a74fe80..1c21dd6, approved after 1 fix round; opus executor + opus reviewer). Sweep now genuinely proves tenancy. 344 tests / 0 skips; census 237 assertions over 111 routes (anonymous 92, foreign-box 33, positive-control 33, insufficient-role 41, collection-leak 22, superadmin 9, self 7). ZERO production files changed. KNOWN_GAPS DELETED, not emptied — the 7 T1 "gaps" all cleared once the probe sent a well-formed body, confirming the orchestrator ruling that they were instrumentation artifacts, NOT authz holes. No authz re-architecture.
  What the sweep now asserts: real box-A seeded ids per path variable (a route whose variable has no seeded row FAILS LOUDLY via AssertionError — the random-UUID fallback is structurally gone); default-deny extended to /api/admin/** (box-admin token must 403 on all 9 superadmin routes), /api/me/**, authenticated /api/auth/*; PUBLIC_ALLOWLIST keyed METHOD+pattern; COACH probed (not just BOX_ADMIN); per-assertion suppression; collection GETs assert box B sees ZERO box-A rows AND must REACH 2xx first (a non-2xx makes the leak assertion vacuous).
  NEGATIVE CONTROLS (the whole point — a sweep never seen failing proves nothing): 4 holes injected, each observed failing, each reverted. (a) MemberController findByIdAndBoxId->findById caught at 200 — and the OLD random-UUID probe PASSES that same broken handler, which is the proof T1's sweep was hollow; (b) MovementRepository box filter neutralised -> collection leak caught; (c) /api/admin/** downgraded to .authenticated() -> all 9 routes flagged; (d) AuthController.boxToken cross-tenant fallback caught at 204.
  FIX ROUND (1c21dd6) closed a VACUOUS-GREEN CRITICAL the review found: GET /api/box/lifts requires a movementId param, probe sent none -> 400 -> no marker in body -> assertion PASSED while counting as coverage. Root cause was general (probe never asserted 2xx), now fixed for all collection GETs + query params supplied from seeded ids. Also: positive control per foreign-probed route (box A's own admin must not 404 — else the denial re-proves only "unknown id -> not 2xx"); census floors ASSERTED via MIN_PROBES, not printed; near-vacuous status-only `self` routes documented honestly.
  EXECUTOR HONESTY WORTH KEEPING: (1) my requested negative control COULDN'T FAIL — removing LiftController caller-scoping leaves the sweep green because LiftEntry is @TenantId so Hibernate box-filters anyway; that change leaks INTRA-box, which probe (d) does not assert. Executor ran it, recorded the green, and substituted a nativeQuery-bypass control that matches the assertion. Probe (d) now documented as CROSS-BOX ONLY; intra-box visibility is a different guarantee living in per-feature tests. (2) The positive control caught a LIVE vacuity on its first run: DELETE /api/box/sessions/{id}/booking 404'd for box A's OWN admin (no booking seeded), so the foreign probe there was denying for the wrong reason — fixed by seeding.
  KNOWN REMAINING BLIND SPOTS (documented in the test's Javadoc, orchestrator accepts): foreign ids carried in a request BODY (POST /api/box/subscriptions membershipId/planId, /checkout planId, /checkin bookingId — all verified tenant-guarded + separately tested); mixed-ownership id pairs (box B session + box A item never attempted); intra-box leaks; page-2 leaks; only one foreign role probed; non-/api/ and actuator mappings out of scope.
  4 justified per-assertion suppressions: SKIP_FOREIGN on both /api/box/benchmarks/{id} (BenchmarkTemplate is a global read-only catalog — separate table, no @TenantId, no setters), SKIP_SELF on POST /api/invites/{token}/accept (the token IS the authorization) and DELETE /api/me (would anonymize the fixture user mid-run). All 4 still get the anonymous probe.
  BACKLOGGED (not a hole, milestone lock respected): checkin/uncheck/no-show return 500 not 400 on a body missing bookingId (no @NotNull, param not @Valid); authz runs first so it is malformed-input handling.
  ENVIRONMENT: iCloud conflict-copy .class files REGENERATE (777 more since T1 cleared 2620) and turned a green sweep run into a 605s timeout. `rm -rf backend/target` before backend runs. Repo needs an iCloud exclusion on backend/target/.
M11 Task 3: complete (1c21dd6..fee14ce). 345 backend tests (344 + 1 new regression), 0 skips. Executor died on a session limit at the finish line — work was intact on disk, orchestrator ran the gate and committed inline.
  REAL BUG FOUND (4th instance of the @TenantId trap in this codebase): GET /api/invites/{token} is permitAll but reads Plan, which is @TenantId. A box admin already signed into their OWN dashboard who opens someone else's invite link carries their own JWT, so plans.findById silently filtered to THAT box and planName came back null for every cross-box preview. Fixed with runAsBox (needed a new value-returning Supplier variant alongside the existing void Runnable one). Regression test seeds TWO boxes and previews with the OTHER box's token, so it fails against the unwrapped version instead of passing vacuously.
  This is exactly the class the sweep is BLIND to: the sweep tests endpoints and the preview returned 200 either way — only the DATA was wrong (planName null). Confirms the spec's claim that T3 needed to be a separate hand audit.
  docs/TENANCY.md written: the rule, both failure modes (silent-empty read via wrong ambient tenant; FK-violating write when no tenant is set before the insert), the runAsBox pattern incl. the load-bearing before-the-transaction ordering, a table of every deliberately-native method with justification (InviteRepository#findByTokenHash, #burnIfUnaccepted, PaymentRepository#findByStripeSessionId), and regression coverage notes. CLAUDE.md's tenancy line now links it so future milestones inherit the rule.
  NOTE: the executor's full classification table (every @TenantId entity x every repository method x call sites) was NOT captured before it died — task-3-report.md may be partial. The production fix, the test, and TENANCY.md's native-method table are the durable artifacts. If a future audit wants the full inventory it must be re-derived.
M11 Task 4: complete (fee14ce..3c33c4a). 354 backend tests (345 + 9 new: 7 MediaSignerTest, 1 MediaApiTest, 1 TvStateServiceTest), 0 skips. AuthzConformanceTest untouched and still green.
  MediaSigner mints ?md5=&expires= matching nginx secure_link_md5 exactly (keyed MD5 over "<expires><uri> <secret>"); boxhub.media.link-secret has NO default (fail-closed, same shape as stripe.enc-key). nginx.conf now ships as a TEMPLATE to /etc/nginx/templates/ so the base image's envsubst entrypoint fills the secret at container start; docker-compose passes BOXHUB_MEDIA_LINK_SECRET to BOTH backend and frontend.
  8 emission points signed (ProfileController, SessionDetailController x3 fields, SessionController roster, HomeController x2, LeaderboardController, ClassTemplateController, MyClassController, TvStateService x3). Box logo DELIBERATELY unsigned (renders on the pre-login invite preview where there is no JWT) with a comment so it doesn't read as a miss. TV re-signs fresh per SSE push — pinned by a test that composes twice across a real 1.1s boundary and asserts the signed paths DIFFER (fails if compose() ever caches).
  ORCHESTRATOR VERIFIED THE ONE THING UNIT TESTS CANNOT (executor flagged it unverified): stood the real stack up and probed live nginx. envsubst confirmed substituting the real secret into /etc/nginx/conf.d/default.conf. Against a real seeded file: unsigned -> 403, forged sig -> 403, expired (correct digest, past expires) -> 410, valid sig -> 200. The Java digest and nginx's secure_link_md5 agree byte-for-byte across the container boundary. If these had disagreed EVERY image would 403 in production and no unit test would have caught it.
  (Note: my first probe was invalid — an empty glob made me curl the SPA root and read 200 as a pass. Redone with a real file. Also briefly suspected an alias regression to /srv/media; the shipped config correctly aliases /media/, matching the compose mount `media:/media:ro` — the /srv path was only in the brief's example text.)
  KNOWN GAP carried to T12 final review: EXIF stripping covers JPEG/PNG only — the JDK ships no WebP ImageIO codec so WebP bytes pass through with metadata intact. Flagged with a ponytail: comment naming the ceiling and upgrade path (TwelveMonkeys). Low risk (GPS EXIF is a camera-JPEG artifact) but a real gap, not a solved one.
M11 Task 5: complete (3c33c4a..63d07f0). Backend 356 tests, 0 failures, 0 skips. TV device token moved from ?token= on /api/tv/stream into a bh_tv httpOnly cookie (Path=/api/tv, SameSite=Lax, TTL matched to the token's own 400-day expiry), set on the pair-claim poll. Query param DELETED, not deprecated — stream reads the cookie only and 401s without it; REVOKED-device rejection preserved. Poll body now {paired:true}, no token; FE keeps a boxhub_tv_paired marker only to know it paired before. nginx logs that location with a combined_noquery format ($uri instead of $request). Cookie test parses the REAL Set-Cookie header for HttpOnly/SameSite/exact Path rather than MockMvc's cookie jar (MockMvc ignores RFC 6265 paths — that shipped a broken cookie path in M8).
  Orchestrator also updated AuthzConformanceTest's now-stale allowlist justification for /api/tv/stream (route stays permitAll — the device token is still its credential, only the reason text changed).
  FRONTEND GATE NOT RUN — verified by `npx tsc --noEmit -p tsconfig.spec.json` instead (rc=0, zero errors, covers all app source + all specs, which is the realistic failure mode for a rename refactor: a missed call site or type drift). Karma could not complete locally, see ENVIRONMENT below. CI (ubuntu, ci.yml) runs the real Karma gate.

## ENVIRONMENT TRAPS — cost hours this session, read before running any gate
1. **`ng test` cold-bundles for MANY minutes emitting ONE line** ("Generating browser application bundles (phase: setup)"). `frontend/.angular/cache` does NOT exist in this repo (iCloud appears to evict it), so there is no incremental cache and every run is cold.
2. **NEVER pipe a gate through `grep`/`tail`** — the pipeline buffers, so a WORKING run produces zero output until it finishes and is indistinguishable from a hang. Write raw output to a FILE and poll the file.
3. **NEVER kill a gate that looks stuck.** Killing `ng test` mid-write caused `EPERM` on node_modules/karma/lib/reporters/progress.js on the next run, and left orphaned `ng test` processes that then competed with each other. Each "fix" manufactured the next symptom. Three separate stalls this session traced to this.
4. **NEVER run the backend suite and Karma concurrently.** It starves MailerTest's `verify(sender, timeout(2000))` on an @Async send — it failed at exactly 2.021s, then passed alone. Pure self-inflicted flake.
5. `rm -rf backend/target` BEFORE every backend mvn run — iCloud conflict-copy `.class` files REGENERATE (2620, then 777) and turn a ~40s run into 10 minutes. Forgetting it cost a 09:59 min run.
6. macOS has no `timeout` binary (`command not found`), so `timeout N cmd | tail` silently runs NOTHING and reports rc=0 from `tail`. Do not use it.
7. The 13-14 "Chrome" processes are the USER'S browser, not Karma's. Not evidence of anything.
8. Repo lives on iCloud-synced Desktop; `fileproviderd`/`cloudd` are always active. That is the root of traps 1 and 5. A real fix is excluding backend/target and frontend/node_modules from iCloud — user's call, not done.
M11 Task 6: complete (63d07f0..ff8b5a8 + fixes e1cadec, opus executor + opus review). 367 backend tests, 0 skips.
  SHIPPED: SecretDefaultsTest (fails any secret-shaped application.yml property with a usable default; ONE allowlist entry, spring.datasource.password; boxhub.jwt.secret LOST its committed default). CryptoService versioned keys (BOXHUB_STRIPE_ENC_KEYS = "version:base64key" list, ciphertext prefixed v{n}:, legacy UNPREFIXED rows still decrypt under v1 so no re-encryption on deploy; migration is just 1:$OLD_KEY). LogHygieneTest (root-logger ListAppender). Webhook no-credentials path 400 -> 200, closing the existence oracle.
  THE LOG TEST PAID FOR ITSELF IMMEDIATELY — it found TWO REAL LEAKS: Spring MVC logs the deserialized request body AND the response body, so default record toString() was printing live Stripe credentials and EVERY USER'S PLAINTEXT PASSWORD (LoginRequest[email=..., password=...]). Fixed at the DTO across 5 files / 13 records. Two more found on the RESPONSE side, which the brief's four surfaces would never have reached: /api/tv/pair returned a Map (unredactable) leaking the pairing secret — now a PairResponse record; and InviteAdminController.CreatedInviteResponse leaked the raw invite token.
  REVIEW (opus) confirmed crypto versioning + legacy decryption CORRECT and well-tested (base64 alphabet contains no ':' so the version parse is unambiguous; encrypt uses Collections.max not first-listed, pinned by a test built oldest-first; relabelling v2->v1 fails the AEAD tag rather than accepting wrong plaintext). All 13 redactions verified individually, no credential-bearing DTO missed. Found 2 Importants, both fixed inline by the orchestrator (the opus fix agent died on a session limit having written nothing):
  (1) REAL HOLE — MediaSigner accepted a BLANK secret. Property has no default, but Spring resolves a set-but-empty env var, and `BOXHUB_MEDIA_LINK_SECRET=` is the normal shape of an unset k8s/CI secret ref: that deploy boots and every media URL is forgeable under the empty string. Exactly M10's failure shape one layer below where SecretDefaultsTest looks. Now fails fast on blank + <32 chars (JwtConfig's floor). AbstractIntegrationTest's value was 26 chars and had to be padded.
  (2) LogHygieneTest was PARTLY VACUOUS at DEBUG — Spring's LogFormatUtils truncates a logged body at 100 chars, so webhookSecret (~char 90 of ConnectRequest) and the invite link (past ~100 of CreatedInviteResponse) could not be detected even with redaction removed. The report had WRONGLY claimed the invite fix was test-guarded. Raised to TRACE and PROVEN by negative control: un-redacting CreatedInviteResponse now FAILS with the full /join/<token> visible in the captured log; at DEBUG it passed silently.
  Also fixed: CryptoService rejects duplicate key versions at boot (silent last-win would surface as "decrypt failed" on every shadowed row); SecretDefaultsTest now ALSO scans @Value annotations (a secret with a committed default in Java bypassed the yml scan entirely — pattern already in use in OAuth2SecurityConfig/AuthController, clean today); stale enc-key comment in application.yml.
  BACKLOGGED (was living only in a task report, would have died with it): docker-compose's shell-level `:-` fallbacks for all three secrets mean compose interpolation resolves BEFORE Spring, so a deploy from that file silently runs on committed dev secrets, defeating SecretDefaultsTest for exactly the path someone would take — and SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev} invites SPRING_PROFILE=prod on it. Naive fix is WRONG (deleting `:-` makes compose pass empty strings); real fix is env_file + .env.example so compose omits unset vars and Spring's bare ${VAR} fails closed. For T12/Production. Also recorded: the unknown-vs-no-credentials oracle is CLOSED, while the forged-signature-on-known-session 400 is a DELIBERATE residual (Stripe convention, only misconfiguration signal, needs an unguessable session id already).
  Review minors NOT actioned (recorded for T12): report's "byte-identical JSON" for PairResponse is an overclaim (Map.of order was never stable) though the contract is intact (field names match tv.service.ts); email addresses still logged in DTO lines (PII, not a secret); the restricted-key escape audit reads exhaustive but omits mediaSigner.sign outputs and CheckoutResponse.url (both TTL-bounded/user-facing, not box credentials).
M11 Task 7: complete (e1cadec..c3c2a4a). 376 backend tests (367 + 9 new), 0 skips. Flyway V15 superadmin_audit (deliberately NOT @TenantId — platform-wide by nature, the opposite of nearly every other table). Entity + repo + GET /api/admin/audit (superadmin only, newest-first) + plain console list with loading/error/empty states.
  LOAD-BEARING DETAIL VERIFIED BY ORCHESTRATOR: the audit write sits INSIDE BoxLifecycleTx's @Transactional method, the INVERSE of this codebase's mail rule (mail strictly AFTER commit). Both exist so the record matches reality, but they point opposite ways: a mail sent inside a tx that rolls back is a lie; an audit row that SURVIVES a rolled-back transition is also a lie. Proven by capReachedApproveWritesNoAuditRow — sets MAX_BOXES=0, approves, expects 409 CAP_REACHED, then asserts BOTH that the box is still PENDING (tx rolled back) AND that no audit row exists for it. Real rollback assertion, not a status-code check.
  SWEEP EDIT AUDITED BY ORCHESTRATOR (I keep executors out of AuthzConformanceTest): the diff is EXACTLY ONE LINE — Map.entry("GET /api/admin/audit", "SUPERADMIN") added to MIN_ROLE. No assertion weakened, nothing allowlisted, nothing restructured. The new route is now covered by probe (e) (BOX_ADMIN box token must get 403) and by the anonymous probe. This is the sweep working as designed: a new route FAILS until someone declares its intent.
  Append-only confirmed: repository declares only findAllByOrderByCreatedAtDesc, no delete/update method, and none used anywhere in main/.
  Frontend verified by `tsc --noEmit -p tsconfig.spec.json` rc=0. KARMA NOT RUN (environment — see ENVIRONMENT TRAPS above). Executor said so plainly rather than implying it passed.
  MINORS for T12: SuperadminAuditRepository extends JpaRepository, which INHERITS delete()/deleteAll()/save() — so append-only is convention-enforced (comment says "none should be added"), not structurally sealed; extending Repository<> and declaring only save+find would make it enforceable. Settings-change `detail` is an unstructured string (minimal by design). No search/filter/export (explicitly backlogged as the rich audit log).
M11 Task 8: complete (c3c2a4a..b9f67d0). 380 backend tests (376 + 4), 0 skips; frontend tsc rc=0 (Karma not run — environment). DELETE /api/auth/sessions/{familyId} revokes ONE refresh-token family, scoped to the caller. 404 (never 403) for another user's family id — a 403 confirms the id exists, an existence oracle over other users' sessions. Endpoint under /api/auth NOT /api/me because bh_rt is Path=/api/auth (M8 shipped GET /api/me/sessions green-in-tests and broken in prod; MockMvc ignores RFC 6265 cookie paths, gotcha #8).
  THE DISTINGUISHING TEST: deletingASessionRevokesThatFamilyOnlyTheOtherSessionStillRefreshes — asserts the caller's OTHER session still refreshes after the delete, so it FAILS against a logout-all implementation. Without that assertion the suite would pass on a wrong implementation. The 404 test also asserts the other user's session is untouched (hasSize(1)).
  EXECUTOR DIED on a 529 Overloaded after finishing the backend + focused tests, having NOT done the frontend at all. Orchestrator ran the gate and wrote the frontend piece inline: AuthService.revokeSession(familyId) (AccountSession.id IS the familyId — verified against AccountService.SessionDto, which maps t.getFamilyId() into id, so the row id feeds the endpoint directly), per-row Sign out control with pending keyed by the row being revoked (a single boolean would disable every button), inline error that clears pending on failure, and current-session revoke landing on /auth/login since the held cookie is now dead. Two specs: one proves the DELETE hits /api/auth/sessions/s2 and NOT logout-all then reloads; one proves a failed revoke shows the inline error AND clears pending (a stuck pending leaves the row disabled forever).
  SWEEP EDIT AUDITED BY ORCHESTRATOR: bounded and well-judged — registers DELETE /api/auth/sessions/{familyId} as SELF and seeds a REAL family id owned by box A's athlete into pathIds, so the self probe (a DIFFERENT user) hits an id that exists but is not theirs, exercising exactly the 404-not-403 case rather than an unknown-id 404. No assertion weakened, nothing allowlisted, nothing restructured.
M11 Task 9: complete (0cb9ebd..f3b51f4, sonnet executor + sonnet review, approved after 1 fix round applied inline by the orchestrator). 384 backend tests, 0 skips.
  AuthRateLimitFilter gains AntPathMatcher rule groups: `write` (POST /api/box/invites, /api/box/media, /api/box/subscriptions/checkout, /api/box/sessions/*/book) at 60/min/IP, `lookup` (GET /api/invites/*, /api/box/receipts/*) at 120/min/IP, plus a `global` per-IP ceiling of 600/min over EVERY /api/ request. The pre-existing exact-match auth set and the per-email bucket keep their behaviour and their boxhub.auth-rate-limit property untouched.
  THE PLAN'S NAMED TRAP, CLOSED: shouldNotFilter was `!(POST && LIMITED.contains(getRequestURI()))` — an exact string compare, so no path with a variable segment could ever be matched and only POST was ever seen. Now every /api/ request passes through (so the global counter can count it) and matching is Ant-pattern. /actuator/** falls outside the /api/ prefix, so it needs no separate exclusion.
  DEV/E2E OVERRIDES SHIPPED (the thing that makes the e2e suite look flaky if skipped): BOXHUB_WRITE_RATE_LIMIT=500, BOXHUB_LOOKUP_RATE_LIMIT=500, BOXHUB_GLOBAL_RATE_LIMIT=5000 in docker/docker-compose.yml alongside the existing BOXHUB_AUTH_RATE_LIMIT=200.
  Test fixture insight worth keeping: the filter is @Order(HIGHEST_PRECEDENCE) so it runs BEFORE Spring Security — an UNAUTHENTICATED request to a limited box route reaches the limiter and only then 401s. That is the entire fixture the new tests need: no tokens, no seeded boxes. Each test uses its own dedicated remoteAddr because the Caffeine counters are a singleton shared across the class.
  REVIEW'S ONE CRITICAL (real, fixed in f3b51f4): widening shouldNotFilter to all of /api/ means the global bucket now counts every request from every test in the suite, and all 80 test classes share ONE Spring context at MockMvc's default remoteAddr 127.0.0.1 — grep confirmed RateLimitTest is the only class that ever sets remoteAddr. AbstractIntegrationTest already carries boxhub.auth-rate-limit=1000 for exactly this reason but nothing set the three new properties, so the shared context ran at the production default of 600/min. It passed today by luck of suite size and speed, not by construction. Fixed by adding write/lookup/global=100000 to the same @TestPropertySource (which subclasses like RateLimitTest still override — that ordering is why it is @TestPropertySource and not @DynamicPropertySource). Minor also fixed: the under-limit burst sent 2 of 3 allowed requests, never asserting the boundary request where the counter equals the limit passes.
  NO sweep edit — this task adds no routes, and AuthzConformanceTest is untouched (verified).
  ORCHESTRATOR RULING on gates: e2e is NOT run per-task for T9/T10. T10 touches no e2e-visible behaviour and T11 rebuilds nginx anyway, so ONE fresh-stack e2e run covers T9+T10+T11. If it fails, a 429 in the trace makes the rate-limit override the first and cleanly separable suspect.
M11 Task 10: complete (f3b51f4..262abc0 — impl 22f338d, tenancy fix round ca3b592, review fix inline 262abc0). 389 backend tests, 0 skips. RefreshTokenPurgeJob renamed PurgeJob; the nightly sweep now also purges invites and stale PENDING TV pairing codes, and the whole job gets its FIRST test coverage (refresh + email token purges were shipped untested since M8).
  Invite sweep is native SQL on a @TenantId entity; TV sweep is a plain derived delete because TvDevice is deliberately NOT @TenantId (its javadoc says so — pairing precedes any tenant). Do not add native SQL where it isn't needed.
  TV cutoff is TvPairingService.CODE_TTL (10 min, widened to public rather than duplicating the value), NOT the 30-day GRACE. Correct because poll and claim both already 410 a PENDING row past CODE_TTL, so it is dead at that instant. Not merely hygiene: TvPairingService.create() picks its 6-digit code in a `do/while (findByPairingCode(code).isPresent())` loop, so dead PENDING rows permanently shrink the code space.
  MY BRIEF WAS WRONG AND THE EXECUTOR CAUGHT IT — worth keeping, because the wrong version is repeated in this ledger's own M10 T6 entry. I wrote that a tenant-less JPQL sweep "resolves to the all-zeros root tenant and deletes 0 rows". It does not. TenantIdentifierResolver returns the NO_TENANT sentinel and reports it ROOT via isRoot(), which DISABLES the filter — a genuinely tenant-less read fails OPEN, pinned by TenantIdIsolationTest#nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior. docs/TENANCY.md "failure mode 1" already had this right. The executor ran the negative control I specified, watched it PASS, reported the green instead of writing the expected answer, and then found the scenario that actually discriminates. That is the behaviour I want.
  CONSEQUENCE: the real failure mode is a WRONG ambient tenant, not an absent one. Native SQL is still correct here (purge() is directly invocable from a context carrying a real box's tenant, and fail-open is itself documented as a hazard), but the reason had to be rewritten in the code comment — a load-bearing tenancy comment stating a false mechanism will mislead the next milestone.
  PERMANENT REGRESSION GUARD (fix round ca3b592): PurgeJobTest#invitePurgeSweepsBothBoxesEvenUnderOneBoxsAmbientTenant seeds purgeable invites in two boxes, sets ONE box's ambient tenant, purges, asserts BOTH are gone. Verified FAILS against a JPQL/derived version and passes with native. The cleared-context version does NOT discriminate and would have been decoration.
  REVIEW'S ONE IMPORTANT (real, fixed inline 8f0ac00): every seeded survivor was a never-accepted invite, so nothing pinned the age check on the ACCEPTED branch — dropping `and accepted_at < :cutoff` would purge every accepted invite immediately and the whole suite would stay green. Added a within-grace accepted invite that must survive.
  NO sweep edit — no routes change. AuthzConformanceTest untouched (verified).
  BACKLOG (found in passing, out of scope): an ACTIVE TvDevice keeps its pairing_code forever (TvPairingService.claim deliberately retains it so the TV's in-flight poll still resolves), so the 6-digit code space fills monotonically as boxes pair devices. The PENDING sweep does not touch it.
M11 Task 11: complete (262abc0..ac54221, sonnet executor + sonnet review, approved first pass after ONE orchestrator ruling on a mid-task BLOCKED escalation). Five security headers + a strict CSP at nginx, an Angular nonce, and e2e/tests/security.spec.ts. FULL e2e 26/26 green on a fresh stack (25 pre-existing + the new security spec) — this run covers T9+T10+T11 together, so the new rate limits are proven not to trip the serial suite.
  THE TRAP I PRE-EMPTED IN THE BRIEF, AND IT WAS REAL: nginx `add_header` does NOT inherit into a location that declares its own `add_header` — it replaces, one level at a time. docker/nginx.conf already had `add_header Cache-Control` inside BOTH `location /media/` and `location = /index.html`, so headers declared only at server level would have been silently absent from index.html — the ONE document that most needs the CSP — and the config would have reviewed as completely correct while being inert. Handled with a single docker/security-headers.conf snippet `include`d at server level AND in both of those locations, so the list lives in exactly one file.
  Nonce is injected at nginx by sub_filter rewriting `<app-root></app-root>` to carry `ngCspNonce="$request_id"`, in BOTH HTML-serving locations (`location /` for SPA deep links, `location = /index.html` for a direct hit) — half-doing this is easy and would break only some entry paths. No Angular source changed. Reviewer independently confirmed gzip is off in this image, so sub_filter genuinely sees uncompressed HTML and cannot silently no-op.
  EXECUTOR ESCALATED CORRECTLY MID-TASK (BLOCKED, nothing committed, working tree left for me): Angular's production build runs the beasties critical-CSS inliner (on by default — frontend/angular.json had no `optimization` key at all), which bakes an un-nonced `<style>` tag AND a `<link ... onload="this.media='all'">` inline EVENT HANDLER into dist/index.html before nginx ever sees it. A nonce cannot admit an inline event handler — nonces do not apply to attributes — so keeping the inliner would have forced `script-src 'unsafe-inline'` and gutted the whole task. It refused to loosen the CSP or paper over it with sub_filter rewrites and asked instead. That is the behaviour the escalation rule exists for.
  MY RULING: disable it — `"optimization": {"styles": {"inlineCritical": false}}` in the PRODUCTION configuration only. The object form leaves every unspecified sub-key at its default, so script/style minification and font optimization all stay on. inlineCritical is an LCP optimization, not a correctness feature: with it off Angular emits a plain render-blocking <link>, so the failure mode is LESS flash of unstyled content, not more (and theme.spec.ts guards that separately). My "don't touch Angular source" fence was wrong about build config — I widened it explicitly rather than letting the executor guess. Commit body warns against re-enabling it for a perf win without re-checking the CSP consequence.
  NEGATIVE CONTROL (proves the e2e listener is not decoration): dropping the nonce from style-src makes security.spec.ts FAIL with 23 real per-component style violations; with the nonce, baseline is ZERO. Built index.html verified to contain no inline `<style>` and no `onload=`.
  M11 T4's media secure_link behaviour re-proven UNCHANGED after editing that location block: unsigned 403 / expired 410 / valid 200, now also carrying the headers.
  BACKLOG (pre-existing, found by the T11 reviewer, NOT introduced here, milestone lock respected): docker/nginx.conf has NO `/oauth2` location and never did, so `<a href="/oauth2/authorization/google">` on the login page falls through to the SPA catch-all instead of reaching Spring Security's OAuth2 authorization endpoint. Invisible in dev because the OAuth2 chain is conditional on BOXHUB_GOOGLE_CLIENT_ID, which the dev compose does not set — but a production deploy that DOES set it gets a dead Google SSO button. Not a CSP issue (top-level <a> navigation is not restricted by default-src/form-action). Flag to the T12 final review.
M11 Task 12: complete (ac54221..69f15d2). Dependency scanning + docs + final whole-branch review.
  DEP SCANNING (executor escalated, user decided): the plan said "OWASP dependency-check failing on CVSS>=7 in CI", but the plugin needs an NVD API key — without one a cold CVE sync takes hours and would wedge every push. Asked the user; they chose nightly-scan + Dependabot + npm audit. Shipped: dependency-check in backend/pom.xml with NO <executions> binding (so `mvn verify` never triggers it — verified), invoked explicitly by a nightly .github/workflows/dependency-scan.yml (+ workflow_dispatch, actions/cache on the data dir, NVD_API_KEY from secrets); .github/dependabot.yml for maven/npm(frontend)/npm(e2e)/github-actions/docker; empty-but-headered backend/owasp-suppressions.xml; backend/.gitignore gains dependency-check-data/.
  SECOND ESCALATION, ALSO CORRECT: `npm audit --audit-level=high` fails TODAY — 18 high + 1 critical. Executor stopped rather than weaken the threshold or bump a dependency. I investigated: prod-only (`--omit=dev`) is 6 high / 0 critical, ALL cascades of one Angular core advisory ("Client Hydration DOM Clobbering"), and the app uses NO hydration and NO SSR (grepped: no provideClientHydration, no @angular/ssr). npm's only offered fix is 22.0.8, isSemVerMajor — Angular 19 is EOL, there is no patched 19.x. RULING: do not upgrade Angular in the last task of a security branch (three majors, would invalidate every M11 gate; M12 IS the frontend rework), and do not ship a gate that is red on day one (it gets disabled by the first person it annoys — the spec's own argument about unsuppressed scans). Per-push gate is `--audit-level=critical --omit=dev` (green today, catches a genuinely new critical in shipping code); nightly carries an informational `--audit-level=high` with continue-on-error. Both steps commented with the exact M12 flip.
  HONEST DONE-CRITERION: spec §5 says "dependency scan gating CI". Half met. Recorded as such in HANDOFF rather than claimed — the Maven gate does nothing until an NVD_API_KEY secret exists.
  FINAL WHOLE-BRANCH REVIEW (opus, 19 commits / 385KB): FIX FIRST, 0 Critical, 4 Important. All real, all cross-cutting — exactly what per-task reviews structurally cannot see.
  (1) ClassTemplate.imagePath was UNVALIDATED, and T4 turned it into a signed capability: a hostile box admin could store another box's media path and have us mint a valid secure_link over it. ProfileController had this guard for avatars; the class-type write site never got one. The reviewer's own summary of the invariant is the keeper: after the fix, the three stored strings that can reach MediaSigner.sign() are Membership.avatarPath (guarded), ClassTemplate.imagePath (guarded), Box.logoUrl (never signed). Fixed + ClassTemplateApiTest#templateImageMustBeThisBoxsOwnMediaPath, whose second half fails against the unguarded version.
  (2) /api/tv/stream had no X-Real-IP (only `location /api/` set it), and T9 made the global ceiling count EVERY /api/ request with a getRemoteAddr() fallback — which there is nginx's own container IP. Every paired TV on the platform shared ONE bucket: a backend restart reconnects them all, they 429, EventSource retries keep the bucket saturated, TVs stay dark platform-wide. One proxy_set_header line. This is the T5-touched-nginx / T9-changed-the-filter interaction that no single task's review could have seen.
  (3) Global ceiling 600 vs a whole gym behind one NAT IP, fixed 1-min window. Raised to 1200 and wrote the honest reasoning in application.yml: unmeasured, and if tight the fix is a separate authenticated bucket, not another bump. Did NOT build the bucket — no measurement justifies the code yet.
  (4) Done-criterion gap (above), documented.
  Minors closed: Stripe webhook no-credentials path now log.warn's (Stripe treats 200 as delivered and never retries, so the payment sat PENDING with zero operator signal; response unchanged so the oracle stays closed) · /api/me/email/confirm joined LIMITED (the only single-use-email-token endpoint without a per-IP guess limit) · LogHygieneTest asserts the media link secret never reaches logs · BoxController's logoUrl comment corrected — it is an operator-typed absolute URL, never an upload, so "unsigned" is a no-op not a carve-out.
  RE-REVIEW: SHIP, and it caught my own fix's vacuous justification — LogHygieneTest step 7 claimed to exercise the signing path, but ClassTemplate is @TenantId and the fixture seeded none, so the listing was empty and sign() never ran. Assertion true, justification false: exactly the shape that suite exists to kill. Fixed by seeding a template with an imagePath. Also caught the stale logo sentence surviving in HANDOFF (the more-read location) after I corrected only the code comment.
  Minors deliberately NOT actioned (reviewer agreed with all four): ProfileController query-free path check (unreachable from the UI, prefix guard already blocks the cross-tenant case) · duplicate X-Content-Type-Options / Cache-Control headers (same values) · docker-compose `:-` secret defaults (already backlogged with the correct env_file fix, Production phase) · a bh_tv assertion in LogHygieneTest (the test never drives a pair-claim; asserting a value it does not produce is decoration).
  GATES: backend 390/0/0 (twice — after the fixes and again on merged main), frontend 181 specs, e2e 26/26 on a fresh rebuilt stack (run twice: once covering T9+T10+T11, once after the nginx/rate-limit fixes).
M11 MERGED to main as 5fdc2c4 (--no-ff, task history preserved — unlike M10 there is no secret in this branch's history to squash away; verified the merge-base 01fc409 was already on main). Re-verified on merged main: 390/0/0.
  PUSH BLOCKED, not a code problem: `remote rejected ... refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml without workflow scope`. The gh token has 'gist, read:org, repo' — no 'workflow' — and M11 adds/edits GitHub Actions workflow files. SSH is not configured on this machine (publickey denied), so there is no bypass. USER MUST RUN: `gh auth refresh -h github.com -s workflow`, then `git push origin main`. 26 commits sit unpushed on local main (M11's 22 + the 4 M11 spec/plan doc commits that predate the branch).
M11 PUSHED. SSH set up first: the OAuth token had no `workflow` scope, so GitHub refused a push touching .github/workflows/ (a token that can rewrite CI can run arbitrary code on the runners — `repo` deliberately isn't enough). The existing id_ed25519 was passphrase-protected with the passphrase lost and not in Keychain, so a new passphrase-less id_ed25519_github was generated, ~/.ssh/config written (IdentitiesOnly, AddKeysToAgent, UseKeychain), the user added the public key on github.com, and the remote moved to git@github.com. Old key left in place untouched.
CI WAS RED ON PUSH — and my "all green" had meant LOCAL gates only. Three failures, NONE reproducible on macOS. This is the most important lesson of the milestone, above any of its 12 tasks:
  (1) FRONTEND: two superadmin-console specs left an unflushed `GET /api/admin/audit`, failing HttpTestingController.verify(). T7's console list added that fetch and T7/T8 were verified with `tsc --noEmit` only, because KARMA DOES NOT COMPLETE ON THIS MACHINE (this session it emitted ZERO lines in 10+ minutes and had to be abandoned in the background). tsc cannot see an unflushed HTTP expectation. The ledger recorded "Karma not run" honestly at the time, and CI is exactly what that honesty was for. Fixed in two rounds — the first only flushed the INITIAL load, missing that approve() and saveSettings() each call loadAudit() again on success.
  (2) BACKEND, BoxSignupTest, 5 failures: `Status expected:<201> but was:<200>` — signup returns 200 {"full":true} once ACTIVE boxes reach MAX_BOXES, the shared Testcontainer never rolls back boxes, and M11's new box-creating tests pushed the suite past the seeded cap of 100. Only CI trips it because surefire class order differs there. THE SAME DEFECT HIT SuperadminBoxApiTest IN M10 and was patched locally rather than at the root, so it came back. Fixed the same narrow way (unconditional cap headroom in @BeforeEach for the tests that are not about the cap) with a ponytail: comment naming the real fix — per-class box cleanup, or a cap that isn't global suite state.
  (3) BACKEND, SubscriptionServiceTest: `expected 2026-09-25T03:17:38.863829496Z but was ...863829Z`. Postgres timestamptz stores MICROseconds; Instant.now() carries NANOseconds on Linux while macOS ticks at microsecond resolution. So an in-memory period boundary never equals its re-read value on CI. THIS HAD BEEN FAILING CI SINCE M10'S OWN PUSH and nobody looked at the run. Fixed at the root: SubscriptionService.now() truncates to MICROS at creation, so in-memory and persisted agree everywhere, not just in that one assertion.
  META: the M10 merge push failed CI on 2026-07-21 and main stayed red for six days while HANDOFF claimed "CI green on push". Local green is NOT the gate. Check the run after every push.
FINAL: main green on backend + frontend + e2e (run for 502513c). Backend 390/0/0, frontend 184 specs, e2e 26/26.
NOTE: Dependabot fired on first push and opened ~12 PRs at once (Angular 22, Spring Boot 4.1, Node 26 image, TypeScript 7, Playwright, etc.), nearly all failing majors. Weekly interval with no grouping or major-version guard. Worth adding `groups:` and ignoring majors for framework deps, or it is permanent noise. Not touched — out of M11.
POST-MERGE (2026-07-27, all on main, CI green): dependency scanning rebuilt, and it immediately found the milestone's biggest miss.
  User declined creating an NVD API key. Replaced OWASP dependency-check with OSV-Scanner: no credentials, seconds not hours, so it gates every push instead of sitting nightly behind a secret nobody added. Plugin + suppression file deleted. Dependabot retuned (monthly, grouped, capped, MAJORS EXCLUDED) after its first run opened ~12 PRs of failing majors — an ignored bot is worse than no bot; security ALERTS are a repo setting and unaffected.
  TWO VACUOUS-GREEN FAILURES IN MY OWN WORK, caught only because I checked what the "passing" job actually did:
    (a) `--skip-git` was removed upstream; osv-scanner printed usage and the ACTION EXITED 0. Job green, nothing scanned.
    (b) After fixing the args, it scanned 954 npm packages and SILENTLY SKIPPED backend/pom.xml — osv-scanner's Maven resolver dies on any dependency whose version comes from the Boot parent BOM ("failed parsing version constraint ... invalid > in >=0.0.0") and moves on. Exit 0 again for the Maven half.
  Fix for both: scan a CycloneDX SBOM (the classpath Maven actually resolved) and NEVER trust the exit code — a guard step asserts the results JSON really contains Maven packages. That guard caught (b) on its first run. Keep it.
  WHAT THE WORKING SCAN FOUND — the real miss of M11: pom.xml still pinned Spring Boot 3.4.1 (Dec 2024), carrying ~25 CVEs in tomcat-embed-core 10.1.34 (several 9.8) in the server handling EVERY request, three 9.0s in Thymeleaf, an Actuator auth bypass (8.2 x2, and /actuator/health is exposed through nginx) and a 9.1 in spring-security-web. A security-hardening milestone shipped on an 18-month-old Tomcat because its dependency-scanning task was last and mis-wired.
  Fixed in two user-approved steps: 3.4.1 -> 3.4.13 (closed Tomcat/Thymeleaf, needed tomcat 10.1.55 + thymeleaf 3.1.5 overrides on top), then -> 3.5.16 (the Actuator bypass and spring-security-web 9.1 have NO fix inside 3.4.x). The two overrides were then DELETED, not carried: 3.5.16 manages exactly those versions, and an override left behind is worse than none. postgresql 42.7.12 + jackson-databind 2.21.5 remain pinned one patch ahead, each with its advisory id and a drop-when-Boot-catches-up note. Backend SBOM now scans "No issues found" across 107 packages.
  The 3.4->3.5 bump moves Spring Security 6.4->6.5, exactly where M8/M11's cookie+CSRF work is coupled (gotcha #7). Verified with 390 backend tests AND full e2e 26/26 on a stack rebuilt from scratch — the unit suite alone would not have proven the real cookie paths.
  Gate scoped to the BACKEND deliberately: osv-scanner has no severity threshold, and npm knowingly carries Angular 19's advisories until M12, so an npm-inclusive gate is red forever and stops being read. npm keeps critical+prod gating in ci.yml plus an informational high listing. Fold npm in when M12 upgrades Angular.
  STILL OPEN: ~12 Dependabot PRs opened before the config was tightened are still sitting there (majors, failing CI). New config ignores majors going forward but does not close existing PRs.
## M12a test & CI reliability — 2026-07-27 — branch m12a-test-ci-reliability, base 080fac7
Process rule set by user this session and written into CLAUDE.md: ALWAYS subagent. Orchestrator dispatches, reviews every diff, runs gates, commits, merges — and implements ONLY genuinely difficult/delicate work or trivial glue. Never an executor's job because it feels faster.
M12a Task 1: complete (080fac7..cd63cd7, sonnet executor, orchestrator-reviewed inline). e2e/tests/_support.ts (runId + login), TV device names stamped in runner.spec + tv.spec, login() deduped out of 8 spec files. Net -27 lines.
  DISCRIMINATING CHECK PASSED: full suite run TWICE against the SAME stack with no reset — 26 passed (21.5s) then 26 passed (20.2s). That second run fails before this change (duplicate fixed-name TV devices), which is the only thing that proves the task worked.
  MY BRIEF WAS WRONG AND THE EXECUTOR CAUGHT IT: I grepped `async function login`, which also matches `loginAdmin`, and asserted all six specs shared an identical signature. admin-panel.spec and invite-flow.spec actually declare `loginAdmin(page)` with no email param. The executor stopped rather than improvise a call-site change the brief forbade. Ruled: edit both call sites to `login(page, 'admin@demo.io')`, no loginAdmin wrapper in _support (a second export that only hardcodes an email earns nothing).
  Investigation finding that shrank the task: 6 of 8 data-writing specs ALREADY stamped with Date.now(); only the two TV specs used fixed names. Isolation work was narrow, not a sweep.
M12a Task 2: complete (cd63cd7..f332017, sonnet executor, orchestrator-reviewed inline). TV shell gains a `frames` signal + an sr-only `data-testid="tv-stream"` marker carrying data-frames and data-timer; runner.spec now asserts the SSE frame ARRIVED before asserting the clock rendered. Three consecutive runner-spec runs at --retries=0 on a fresh stack: all passed.
  MEASUREMENT (I required the executor to measure and report, NOT to adjudicate — the judgment stays with the orchestrator): click -> .tvtimer visible = 2375, 2340, 2339, 2345, 2342 ms. A +/-18ms cluster against a 15000ms budget.
  MY ADJUDICATION: latency was never the constraint — 2.34s vs 15s is a 6x margin. So the CI failures were NOT slow SSE delivery. BUT these numbers are LOCAL and the flake only ever manifested on CI, so they rule a cause out without explaining CI. Therefore NO Project 2 backlog item: there is no evidence of a delivery defect and a speculative entry would be noise. The split assertion is now the diagnostic — the next CI failure names which half broke (frame absent vs render broken). Revisit only if CI fails on the data-timer half.
  Executor caught another brief error of mine: I guessed the status string was /RUNNING|STARTED/. TimerService only ever sets PENDING/RUNNING/PAUSED — STARTED does not exist. Used plain 'RUNNING'. (Brief also said line 50; actual was line 44.)
M12a Task 3: complete (f332017..62eb926, sonnet executor). TvStreamApiTest: `boxTokenIsNotATvToken` replaced by `boxScopedTokenCannotOpenATvStream` (mints a REAL box token via TokenService.boxToken and puts it in the bh_tv cookie) plus `unknownDeviceIdIsRejectedEvenWithAValidTvToken` (what the old test actually asserted, under an honest name). 7/7 in class.
  The old test's own comment claimed a wrong-scope token was "impractical" to fake. It was wrong and had been since M6 — TokenService.boxToken mints scope "box" and TvStreamController line 43 rejects any scope != "tv".
  NEGATIVE CONTROL FIRED AS DESIGNED: scope check commented out -> `NullPointerException: Cannot invoke "String.length()" because "name" is null` at UUID.fromString -> TvStreamController.java:45. A 500, not a 401 — because a box token carries no device_id claim. That is exactly the discrimination the test was chosen for. Controller reverted, confirmed by an empty `git diff` on it; commit contains only the test file.
M12a Task 4: complete (62eb926..68cc815, sonnet executor). ClassTemplateApiTest 8/8 (was 6): timezone-only patch must not disturb sibling fields, and the logo clear round-trip.
  BRIEF ERROR #3 OF MINE, CAUGHT: I guessed {"logoUrl":""} round-trips as "". BoxController.patchSettings actually maps blank to NULL (`req.logoUrl().isBlank() ? null : req.logoUrl().trim()`), so the test asserts `jsonPath("$.logoUrl").doesNotExist()` — the existing suite convention for null JSON fields. Executor asserted REAL behaviour instead of bending production to match my guess, which is what I told it to do. Clearing works, just to null, so no M12b finding.
  NEGATIVE CONTROL FIRED: timezone branch disabled -> `JSON path "$.timezone" expected:<America/New_York> but was:<Europe/Rome>`; other 7 stayed green. BoxController revert confirmed by empty `git diff --stat`, suite re-run 8/8 after revert.
PATTERN WORTH NAMING: three of my first four task briefs contained a factual error (login vs loginAdmin signature; the /RUNNING|STARTED/ timer status; empty logoUrl semantics). Every one was an unverified specific I asserted from a grep rather than reading the code. All three were caught because the brief tells executors to stop rather than improvise, and because each test carries a negative control. The escalation rule is doing real work here — keep it, and stop asserting exact strings in briefs without opening the file.
M12a Task 5: complete WITHOUT a commit — the coverage already existed and the executor proved it.
  BRIEF ERROR #4 (the most valuable one): the backlog said "Register concurrent-race catch path has no direct test". FALSE and stale. RegistrationTest.concurrentRegisterForTheSameFreshEmailBothReturnTheSameUserNoExceptionEscapes has raced exactly this scenario since M9 (commit 5d86ecd — the same commit that built the recovery design), unmodified and live. Nobody updated the backlog when M9 closed it.
  PROOF IT IS REAL COVERAGE, not just a test that exists: executor ran MY negative control against the EXISTING test — catch body replaced with `throw e;` -> `DataIntegrityViolationException ... constraint [users_email_key]`, Tests run: 5, Errors: 1, BUILD FAILURE. It also confirmed the race genuinely fires: 3 of 5 loop iterations hit real Postgres 23505 violations on the baseline run. AuthService revert confirmed byte-identical, post-revert rerun clean.
  RULING: no duplicate test. Adding the brief's near-identical one would be pure bloat against coverage already shown to discriminate on this exact fault. Task 7 removes the item from the backlog as ALREADY COVERED (M9), citing this evidence — the fourth stale "open" item this milestone has retired without writing code, after the ~12 the re-triage found.
M12a Task 6: complete (68cc815..1675290..86a02f0, sonnet executor + one orchestrator-reopened round). BOTH bounded attempts ultimately SHIPPED.
  Google race self-verification: AtomicInteger recoveryCount on GoogleLinkTx, read via a METHOD not the bare field — direct field access NPE'd because the bean is CGLIB-proxied and Objenesis skips the constructor on the proxy shell, leaving the field slot uninitialised on that reference. Worth remembering. Negative control: barrier removed so calls serialise -> "Expecting actual: 0 to be greater than: 0" fails correctly.
  Join-fetch detector: first attempt RETIRED, and I REOPENED it — correctly. The executor's diagnosis was right (the test's own boxes.save() leaves Box managed, so the lazy proxy resolves from L1 cache and the statement count is 1 with or without the join fetch) but that meant the test measured the wrong thing, not that the thing was unmeasurable. `entityManager.clear()` before the query removes the confound; it is not "tuning until green", and my blunt "do not tune" instruction had over-blocked. Second attempt: negative control (join fetch stripped) -> `expected: 1L but was: 2L`, the N+1 appearing exactly as it should. SHIPPED.
  LESSON FOR MY OWN BRIEFS: a stop-rule aimed at preventing sunk cost can also stop a legitimate one-line fix. Say what the rule forbids (fiddling with expected values until green) rather than a blanket verb ("do not tune").
M12a Task 7 (orchestrator inline — gates, docs, merge are my job, not an executor's): retries flipped to 0, stale "One worker + retries" comment corrected.
  MILESTONE GATE PASSED, stronger than the plan required: backend 394/0 failures/0 skips (390 + 4 new), and THREE consecutive e2e runs at retries:0 — 26 passed (20.4s), 26 passed (20.1s), 26 passed (20.2s). Only run 1 got a fresh stack; runs 2 and 3 ran against the NON-reset stack, so they prove the isolation work as well as the flake fix.
  M12a section deleted from docs/BACKLOG.md — all seven items resolved, each archived with its evidence. HANDOFF points at M12b next.
M12a MERGED to main as af3a4a8 (--no-ff). Whole-branch review (sonnet, scaled to a test-only diff): SHIP, zero Critical/Important. It independently verified each new test discriminates, confirmed the GoogleLinkTx counter can only bump inside the DataIntegrityViolationException catch (so the assertion proves the race fired rather than that both threads converged), and cross-checked the 390->394 count by counting new @Test methods in the diff. One minor fixed inline: a memberships.spec comment still claimed retries:1.
M12a PAID FOR ITSELF WITHIN ONE PUSH — the point of the milestone, demonstrated:
  CI on merged main went RED at retries:0: auth.spec.ts:94 "no /auth/reset link in mail", 23 passed / 1 failed. M12a never touched auth.spec and it passed 3x locally, so this was a PRE-EXISTING latent flake that retries:1 had been hiding — exactly what removing the safety net was supposed to expose.
  Root cause, two bugs in one helper: (1) latestMailTo() did a SINGLE fetch with no polling, while BoxHub sends mail @Async strictly AFTER commit — so on a slower runner it simply had not arrived; (2) messages[0] assumed the newest mail is the wanted one, but that journey's inbox already held an earlier VERIFY mail, so when the reset mail was late the helper read the verify mail and failed with precisely that message. It found mail, just the wrong one.
  Fixed (4bb53c5) with a bounded poll for a message CONTAINING the wanted link. The executor found the identical bug in onboarding.spec.ts and fixed it there too — root cause, not just the reported symptom. Verified 6/6 auth spec then 26/26 full suite on a fresh stack, retries:0 throughout. retries:1 was NOT restored; making the test honest is the fix.
## M12b correctness & data integrity — 2026-07-27 — branch m12b-correctness, base aebf39a
M12b Task 1: complete (aebf39a..5ce5fd7, sonnet). Flyway V16: drops memberships.expires_at (dead since M10), adds payment.list_price_cents as INTEGER (nullable — null is a meaningful state; `int` would coerce to 0 and assert "no discount given", a false claim on a financial document). 394 tests unchanged.
  Executor checked for surviving expires_at readers in Java, JPQL/native SQL AND mail templates (runtime failures, not compile-time) and correctly distinguished MembershipSchemaTest's `.expiresAt(...)` on the JWT builder from the entity field. None found — M10's repoint really was complete.
M12b Task 2: complete (5ce5fd7..2c2b6dc, sonnet). 397 tests (394 + 3). SubscriptionService.comp() find-or-creates a per-box synthetic "Comped" plan (archived, price 0, UNLIMITED) and an ACTIVE no-expiry subscription on it — following V14's grandfather precedent exactly, because subscription.plan_id is NOT NULL with an FK to plans. Wired at BoxSignupService.signup (owner) and InvitePublicController.accept's new else-branch (plan-less invite), both inside runAsBox so the tenant exists BEFORE the @TenantId transaction opens.
  FAILING-FIRST EVIDENCE: both booking tests returned `Status expected:<201> but was:<409>` with `{"detail":"NO_ACTIVE_SUBSCRIPTION"}` before the fix; the archived-plan test errored with NoSuchElementException. The tests assert BOOKING, not row existence — a row the entitlement gate rejects would pass the weaker assertion.
  AUDITED CAREFULLY (changing an existing test to make a new fix pass is how regressions hide): the executor rewrote InviteSubscriptionTest.acceptingAPlanLessInviteLeavesTheMemberWithoutASubscription, which literally asserted `.isEmpty()` — it PINNED THE BUG. The replacement is strictly stronger: subscription exists, null expiry, plan named "Comped", plan archived, AND a real 201 BOOKED booking. Correct rewrite, not a weakening.
M12b Task 3: complete (2c2b6dc..6133a3b). 399 tests (397 + 2). Both Payment creation sites snapshot the plan price at payment time (StripeCheckoutService for the online rail, SubscriptionTx for admin-recorded — missing either leaves a permanently-null row); both read sites consume the snapshot; null renders as ABSENT, never zero.
  EXECUTOR WAS TERMINATED MID-TASK by a session limit, having finished the code but not the verification or the failing-first evidence. I finished it inline rather than re-dispatching — verification, gates and commit are the orchestrator's job anyway, and a re-dispatch risked the same limit.
  I RAN THE NEGATIVE CONTROL MYSELF rather than accept the work unverified, because "watch it fail" is this milestone's stated bar and I had just written that it is non-negotiable. Pointing ReceiptController's read back at plan.getPriceCents() fails BOTH new tests: `JSON path "$.listPriceCents" expected:<5000> but was:<9000>`. Reverted, confirmed clean.
  Design detail worth keeping: `int` would have been wrong. Null means "unknown", and a zero discount asserts "no discount was given" about a member who may have negotiated one — a false claim on a financial document. Hence Integer end to end, plus the mail template's existing hasDiscount guard and a guarded block on the receipt page.
M12b Task 4: complete (6133a3b..0a083fa, sonnet). 401 tests (399 + 2). checkout.session.async_payment_failed now flips the row PENDING -> FAILED and emails the member; mail strictly after commit via a new PaymentReceipts.sendPaymentFailed; idempotency gated on the row still being PENDING, so both a replayed FAILED and an already-SUCCEEDED row no-op.
  EXECUTOR STOPPED CORRECTLY BEFORE WRITING ANY CODE: V14 constrains payment.status to ('SUCCEEDED','PENDING') at the DB level, so FAILED would have been rejected by Postgres. My plan said "no new migration" without checking. Ruled: add V17 widening the check. Executor then verified the real constraint name against the RUNNING Postgres (pg_constraint/pg_get_constraintdef) rather than trusting my guessed `payment_status_check` — it happened to be right, but the habit is the point.
  FAILING-FIRST EVIDENCE: both tests written and run before touching the controller — `expected "FAILED" but was "PENDING"`, Tests run: 10, Failures: 2.
  Flyway: V16 (task 1) and V17 (this task) both used this milestone. HANDOFF's "next Flyway" line corrected to V18 — it was already stale.
  ACCEPTED SCOPE BOUNDARY (executor flagged rather than silently widening): the async_payment_SUCCEEDED branch was not extended to treat FAILED as terminal. Stripe does not send both outcomes for one session, so this is theoretical; noted rather than built.
M12b Task 5: complete (0a083fa..75cbf52, sonnet). 404 tests (401 + 3). TWO of three fixed; the third was not a bug.
  BUG 1 WAS STALE — "Member patch accepts an unknown/foreign planId unchecked" describes a field that DOES NOT EXIST. `record PatchMemberRequest(String role, String status)` — M10 removed planId entirely (my own M10 ledger entry even records "planId REMOVED from PatchMemberRequest (not just ignored)"). Verified myself. Fifth stale backlog item this session found by ATTEMPTING the work rather than trusting the list.
  MY PLAN'S LITERAL FIX FOR BUG 3 WOULD HAVE BROKEN M11'S STANDING GUARANTEE. I said "add @NotNull to the record component and @Valid to all three params". @Valid on an @RequestBody validates during argument resolution, BEFORE the imperative RoleGuard runs — so unauthorized and cross-tenant callers would have received 400 instead of 403/404, and AuthzConformanceTest treats a 400 on the foreign probe as a FAILURE precisely because it proves validation preceded authz (that is the M11 T1 finding, restated). The executor hit it, recognised it, and fixed it with a manual null-check placed AFTER both guards — leaving the sweep untouched and green. Exactly the right instinct: respect the guarantee, don't edit it.
  Bug 2 needed BOTH BoxAdminController (create) and BoxController (patch); my brief named only the latter.
  FAILING-FIRST EVIDENCE: timezone `expected <400> but was <201>` / `<200>`; bookingId `InvalidDataAccessApiUsageException` (500).
M12b Task 6 (orchestrator inline — interface narrowing is glue, gates/docs/merge are mine): SuperadminAuditRepository extends Repository<> declaring only save + the finder, so append-only is structural rather than a comment. Nothing depended on the inherited methods.
  E2E CAUGHT A REAL REGRESSION MY OWN TASK 2 INTRODUCED — the milestone's most valuable finding, and 405 backend tests were blind to it. Comping a plan-less invitee gives them an ACTIVE subscription, so recording their FIRST real payment hit SWITCH_REQUIRES_CANCEL: the admin was told to cancel a plan the member never chose. The failure snapshot literally reads `Current plan: Comped` / "This member already has an active plan — cancel it below". Fixed in recordPeriod: a comp is a PLACEHOLDER for offline billing, not a chosen plan, so a real payment replaces it silently. saveAndFlush (not save) because the partial unique index uq_subscription_active permits one ACTIVE row per membership, so the cancel must reach the DB before the insert. Regression test added to SubscriptionApiTest; the e2e failure itself is the negative-control evidence, which is stronger than a synthetic one.
  ALSO CAUGHT BY THE PRODUCTION BUILD, NOT BY tsc: `r.listPriceCents / 100` on a `number | null` fails Angular's STRICT TEMPLATE checking (`NG1: Object is possibly 'null'`) and broke the frontend Docker image. `tsc --noEmit -p tsconfig.spec.json` — our documented fallback gate — does not do template type checking at all. Recorded as a new "GATE GAPS" section in HANDOFF, since this is the second time a documented gate turned out blind to a whole class of defect.
  FINAL: backend 405/0/0, e2e 26/26 on a fresh stack with V16+V17 applied.
## M12c production readiness — 2026-07-29 — branch m12c-production-readiness, base 8dc7e73
No Flyway. Next migration is still V18. Four executor tasks + orchestrator gates. Scope was 4 backlog items + 2 traps found while READING their files (not listed anywhere): missing OAuth redirect_uri handling behind TLS, and BOXHUB_COOKIE_SECURE set nowhere in compose.
M12c Task 1: complete (8dc7e73..0be4427, sonnet). docker/.env.example + env_file on backend, every :- removed from secrets, docker/.env gitignored (it was NOT), CI creates it, README updated, deploy.sh sentinel guard moved ahead of rsync.
  EXECUTOR STOPPED ON MY STEP 4 AND WAS RIGHT. I predicted `docker compose config` would warn-and-blank on a missing env_file. Compose v5.3.0 treats a missing env_file PATH as a hard error (exit 1, no config rendered at all), so the two-successful-renders contrast I described is not observable. Ruled: the hard error is STRONGER, not a problem — there is no path where the stack starts on a partial environment. Replaced the check with a three-way contrast.
  DISCRIMINATING EVIDENCE: rendering the OLD compose file in place with no docker/.env on disk exits 0 and prints `dev-only-secret-must-be-at-least-32-bytes!` (1), the Stripe enc key (1) and `dev-only-media-link-secret-change-me` (2). New file: EXIT 1, `env file .../docker/.env not found`. That contrast IS the bug, demonstrated.
  GUARD PROVEN BOTH WAYS: all 5 sentinel patterns MATCH the unedited .env.example (so it is refused), and a regenerated prod-shaped .env passes clean. A guard with a false positive blocks every real deploy; a guard that matches nothing does nothing. Both checked.
  SPRING_PROFILES_ACTIVE=dev is in the guard because DevDataSeeder is the backend's ONLY @Profile bean — a prod deploy left on dev seeds admin/coach/athlete/super@demo.io on a README-published password.
  My step 6 also said "replace lines 1-16" while saying "leave 16-18 alone". It is 1-15. Also caught by the executor.
M12c Task 2: complete (0be4427..0e9ae8a, sonnet). nginx /oauth2/ + /login/oauth2/ locations (no add_header, so they inherit the server-level security headers), explicit OAuth redirectUri, fake dev client id, OAuth2RedirectUriTest + e2e assertion.
  THE EXECUTOR CAUGHT A SECURITY REGRESSION IN MY DESIGN — the most valuable finding of the milestone. My spec said `server.forward-headers-strategy: framework`. That installs Spring's ForwardedHeaderFilter GLOBALLY, which rewrites getRemoteAddr() from X-Forwarded-For. nginx sets that header with $proxy_add_x_forwarded_for, which APPENDS to whatever the client sent, so its leftmost entry is attacker-controlled. AuthRateLimitFilter.clientIp() falls back to getRemoteAddr() precisely because it is the one value a client cannot forge. Net effect: M1-T9's IP-spoofing fix, re-opened, globally.
  IT WAS THE FULL SUITE THAT SAW IT, NOT THE DESIGN AND NOT THE NEW TEST. RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket went 429 -> 401 (the limiter silently not firing). The executor negative-controlled it — stashed only application.yml, RateLimitTest 6/6 green — before escalating.
  RULED: revert entirely, do NOT reconcile. Replacement is smaller and strictly better: an explicit .redirectUri(base + "/login/oauth2/code/google") on the ClientRegistration, base = boxhub.app-url trimmed. BOXHUB_APP_URL is ALREADY this app's single source of truth for every absolute URL it emits (Mailer.link, the Stripe return URLs) — OAuth2 was the one place still deriving one from the request. It trusts no proxy header at all, so AuthRateLimitFilter is untouched.
  GENERALISABLE LESSON, now hardening invariant 7 in the spec and plan: a global Spring filter can undo a local security control in a file the change never touches, and only the full suite sees it. "Run the full suite even for a one-line config change" earned its keep here.
  NEGATIVE CONTROLS BOTH FIRED: redirect_uri -> `expected "https://boxhub.example/..." but was "http://localhost/..."`; nginx stashed -> `Expected: 302 / Received: 200` (the SPA catch-all).
  The dev fake client id makes the Google button render in dev. No existing e2e spec broke. Deferred to Launch -> Production: verify against REAL Google credentials on the real domain — nothing here performs a token exchange.
M12c Task 3: complete (0e9ae8a..dbdf9ea, sonnet). WebP dropped from MediaStorage.TYPES + both FE accept attributes; the RIFF branch and its ponytail comment deleted, store() collapsed to the single re-encode path. 407 tests.
  Plan matched the codebase exactly — the one task this milestone where nothing was wrong.
  FAILING-FIRST: `Status expected:<415> but was:<201>`. That 201 IS the bug: a WebP carrying EXIF/GPS was stored byte for byte.
  WHY DROP RATHER THAN FIX: TwelveMonkeys (the upgrade path the old comment named) is reader-only, so decode+re-encode would silently transcode the user's WebP to JPEG. uploadedJpegLosesExifGpsData stayed green through the collapse — that is what proved the EXIF path survived.
M12c Task 4: complete (dbdf9ea..525c2c4, sonnet). Mailer.mask() on both log lines; LoginRequest, CreateInviteRequest and CreatedInviteResponse redact email; LogHygieneTest gains 2 address assertions + 2 vacuous-pass guards; MailerTest covers the mask edge cases. 408 tests.
  EXECUTOR CAUGHT ANOTHER PLAN BUG, AND ITS EVIDENCE MADE THE TASK SMALLER. My step 1 added a third mailer.send() and polled for "template=verify" to prove it had logged. But AuthService.register() — called in the test's own fixture — already sends a template=verify mail, so the poll was satisfied instantly by the WRONG send and the added one raced the assertion snapshot and lost. It passed vacuously, which is the exact failure mode the guards exist to prevent.
  RULED: delete the added send entirely. The fixture ALREADY drives Mailer twice (registration's verify to `email`, the invite's to `invitee-...`), with addresses the test already tracks. Asserting on those two covers Mailer AND the request/response DTOs at once, with no extra send and no race of its own. Fewer lines, more coverage.
  EVIDENCE-DRIVEN REDACTION, 3 iterations, each address traced to its source before being touched: (1) LoginRequest.toString() via `Read ... to [LoginRequest[email=...]]`; (2) Mailer's own `to=` via `mail FAILED: template=verify to=...`; (3) CreateInviteRequest (had NO toString() at all) and CreatedInviteResponse (M11 redacted its `link`, never its `email`).
  MASK VERIFIED OPERATOR-USEFUL, not just present: `mail FAILED: template=verify to=h***@t.io`. A mask that erased everything would be a different bug and only looking at the output catches that.
  DELIBERATELY NOT REDACTED: AuthController.RegisterRequest still prints its email in full. The test calls authService.register() directly, never POST /api/auth/register, so no evidence implicated it. Filed with 8 other email-carrying DTOs under Launch -> Production as a named limit of the guarantee — redacting blind is untested work.
  Executor used its own model name in the Co-Authored-By trailer; amended to Claude Fable 5.
## Repo moved off iCloud — 2026-08-02 (pre-M13a)
WHY: the iCloud-synced Desktop was the documented root cause of nearly every entry in HANDOFF's ENVIRONMENT TRAPS section. Approved as "the single biggest thing that would let Claude work better".
MY FIRST ATTEMPT WAS WRONG, AND MEASUREMENT CAUGHT IT. I checked `find . -name "*.icloud"`, got 0, and declared the tree local. That check is worthless: modern macOS uses APFS dataless files carrying the REAL filename, no suffix. `mv` then ran for 5+ minutes with the destination still nonexistent while the SOURCE grew 530M -> 536M — iCloud downloading everything before the move could proceed, including the 6.1 GB .angular cache, i.e. materialising gigabytes of regenerable junk in order to relocate it.
  Killed the mv (safe: mv = copy-then-unlink, destination never created, source untouched and clean at 4a02184). Replaced with `git clone` to the new path: 7.4 MB versus a tree materialising toward 6 GB. Everything had been pushed first, specifically so the filesystem operation could not cost anything.
  Gitignored keepers copied by hand: docs/design-md (74 brands), .impeccable, docs/reference, docker/.env.
  COMMITTING THE LEDGER FIRST PAID OFF WITHIN MINUTES: progress.md came across through git instead of needing rescue from the directory being churned.
MEASURED AFTER, NOT ASSUMED:
  backend 2nd run, NO `rm -rf backend/target`: 102s, 408 tests 0/0/0. On iCloud the documented failure was "a 40-second suite became 9:59 from forgetting this". The ritual is dead.
  conflict-copy "* 2.*" files: 0.
  `npm test`: 13 SECONDS, 184/184. HANDOFF documented ~1 hour emitting nothing. That is ~277x, and the slowness was NEVER Karma — it was iCloud materialising dataless files on every read.
THE 13-SECOND NUMBER IS THE FINDING OF THE SESSION. HANDOFF cited the "1 hour" belief as the reason M11 T5/T7/T8 shipped on `tsc --noEmit` alone, and as how two broken console specs reached main. The frontend gate was always usable; the filesystem was lying about it. The tsc-fallback trap entry is DELETED, not softened — there is no hour to wait, so there is no reason to substitute a gate blind to template types and unflushed HttpTestingController expectations.
KNOCK-ON: the M13a spec had justified Karma->Vitest partly as a speed win. Measurement killed that justification, so the spec now says the migration is a PURE COMPATIBILITY COST (Angular 22 removes Karma) rather than keeping a convenient argument that is no longer true.
Old tree left at ~/Desktop/boxhub deliberately, untouched, as the fallback until the user deletes it.
MOVE VERIFIED IN FULL at ~/dev/boxhub: backend 408/0/0 (2nd run 102s, no clean), Karma 184/184 in 13s, e2e 27/27 fresh stack at retries:0.
  ONE FALSE ALARM WORTH REMEMBERING: the first e2e run after the clone reported "17 failed, 9 did not run, 1 passed", which reads as catastrophic. Cause was `npx playwright install chromium` never having run at the new path — npm ci installs Playwright but not its browser. Every browser-driven spec died in ~1ms at browserType.launch.
  THE PASSING TEST WAS THE DIAGNOSTIC: the only spec that passed was M12c's SSO routing assertion, which uses the `request` fixture and opens no browser. "Only the browserless test passes" identifies a browser problem, not an app problem — worth keeping in mind, and a small argument for asserting at the HTTP level where the thing under test is HTTP-level.
CORRECTED BY USER 2026-08-02: the first real VPS deploy happens when PROJECT 1 IS COMPLETE, not after M13a. I had scheduled a staging deploy early; the option text said "deployed early" and read as going live, which is my wording's fault. Replaced with a LOCAL HTTPS check in M13a (self-signed + hosts entry, no external host): proves BOXHUB_COOKIE_SECURE, HSTS and the CSP under TLS. Still cannot prove the Google redirect_uri (needs a real registered domain) or mail deliverability (needs a real provider) — both stay open until the real deploy, both recorded as such rather than quietly dropped.
PRODUCT WILL BE RENAMED: boxhub.com and boxhub.io are unavailable. MEASURED the blast radius rather than guessing: 18 user-facing occurrences (8 frontend/src, 9 across 7 mail templates, 1 BOXHUB_MAIL_FROM default). Frontal only — com.boxhub.*, BOXHUB_*, bh-*, DB and image names all stay, since nobody sees them and churning them is risk for zero gain.
  TIMING CONSTRAINT, and it is real: the name must be settled BEFORE M13b. That milestone re-opens the visual language and a wordmark is part of it — designing a logotype for a name about to be abandoned is waste, and M13b is the one milestone where the brand IS the deliverable. Does not block M13a.
  MITIGATION IS FREE: M13a already extracts every string for i18n, so brand strings ride along into one frontend constant + one boxhub.brand.name backing the templates. Rename then costs two values and a logo.
HOUSEKEEPING FROM THE MOVE: graphify-out/ is gitignored and was not copied, so `graphify update .` needs re-running at the new path.
DESKTOP COPY DELETED 2026-08-02, after a gated check — and the gate caught a regression I had just caused.
  Before deleting I diffed both trees for files unique to the old one: 157, none regenerable. .idea/ (9 files, IntelliJ run configs) and .superpowers/sdd/ (114 review diffs + task briefs from M0-M12c). Copied both rather than delete irreplaceable history to save 1.6 MB.
  THE NEAR-MISS: `rsync -a` of .superpowers/sdd/ overwrote progress.md with the OLDER Desktop copy, silently reverting 21 lines — the entire record of the move, written minutes earlier. The delete was gated on `git status --porcelain` being empty, which failed on exactly that file. Restored with git checkout (454 lines), then the gate passed and the delete ran.
  LESSON: rsync a directory containing git-TRACKED files and you can silently revert them. The pre-delete gate is what made this recoverable instead of invisible — gate destructive operations on real checks (clean tree, HEAD == origin, file counts), never on "I think I copied everything".
## M13a baseline — 2026-08-02 — branch m13a-baseline, base 6112a00
M13a-T1: complete (6112a00..af8e30d, sonnet). Angular 19.2->20. Config + lockfile only, zero source changes, zone.js and Karma untouched. 184 specs / build clean / e2e 27.
M13a-T2: complete (af8e30d..2df79fa, sonnet). Angular 20->21.2.19. Again config + lockfile only. 184 / 27.
M13a-T3 (Karma->Vitest): **CUT BEFORE ANY CODE WAS WRITTEN.** It rested on two claims from one secondary web article and BOTH were false.
  The executor was dispatched to run `ng generate @angular/core:karma-to-vitest` and got `Schematic "karma-to-vitest" not found`. It STOPPED instead of hand-rolling a migration, and researched what actually exists: only `refactor-jasmine-vitest` (EXPERIMENTAL, hidden) and `vitest-browser` (INTERNAL), with `@angular/build:unit-test` as the real builder and vitest/jsdom not installed at all.
  THAT STOP IS WHAT SAVED THE TASK. One demonstrably wrong claim from a source is reason to check its others, so I verified the second claim directly against the published package rather than trusting it: `@angular-devkit/build-angular@22.1.2` ships a `karma` builder with implementation, schema, description "Run Karma unit tests" and a `karma ^6.3.0` peer dependency. ANGULAR 22 DOES NOT REMOVE KARMA.
  The independent speed argument had already died with the iCloud move (4s, not the documented hour). With no compatibility requirement and no performance case, what remained was translating 43 spec files (30 using HttpTestingController, 7 spyOn, 4 fakeAsync) off Jasmine with NO compatibility shim in @angular/build's vitest runner, via an experimental hidden schematic. Cut, and filed on the watch-list against whichever release actually removes Karma.
M13a-T4: complete (2df79fa..cfb5ed1, sonnet, one orchestrator-adjudicated stop). Angular 21->22.1.0, TypeScript 5.9.3->6.0.3 (a major nobody had flagged).
  EXECUTOR STOPPED CORRECTLY: unlike 19->20 and 20->21, this ng update touched 94 SOURCE files. Three changes, and they are NOT one category — that distinction was the whole adjudication:
    (a) ChangeDetectionStrategy.Eager added to all 56 components — compatibility shim pinning the old default. ACCEPTED: M13a's defining constraint is that nothing changes.
    (b) withXhr() added to provideHttpClient (app.config.ts + ~33 specs) — same shape, pins the old HTTP transport. ACCEPTED.
    (c) tsconfig.app.json + tsconfig.spec.json gained extendedDiagnostics suppressing nullishCoalescingNotNullable and optionalChainNotNullable. REJECTED AND REMOVED — this one is not behaviour-preserving, it silences new compiler checks.
  I MEASURED (c) RATHER THAN REASONING ABOUT IT: stripped the block from both files, ran the production build -> exit 0, ZERO violations of either check. The suppression hid nothing at all, so keeping it would have loosened a standard for no benefit and let future violations pass unreported. (a) and (b) filed for M13c to revisit.
  Karma runs fine under 22. Deprecation text is about the WEBPACK builder, not Karma: `"@angular-devkit/build-angular:karma" is deprecated as part of Angular's Webpack support deprecation. Use "@angular/build:karma" instead.` More evidence the "22 removes Karma" claim was a garbled reading of this.
  184 specs / build clean / e2e 27 / zone.js 0.15.1 intact.
M13a npm audit gates (orchestrator inline — trivial glue, but the call was mine): PARTIALLY flipped, against the plan, on measurement.
  ci.yml per-push gate: --audit-level=critical --omit=dev -> --audit-level=high --omit=dev. Measured exit 0.
  dependency-scan.yml nightly: continue-on-error KEPT, though the plan said to drop it. That step runs WITHOUT --omit=dev and exits 1 on three transitive dev-only advisories — brace-expansion, fast-uri, socket.io-parser (via Karma). Dropping it would make the nightly job permanently red over packages that never reach a user, which is how a scan stops being read.
M13a-T5: complete (e595c25..0636edd, sonnet). AppUrls splits origin from app-base. boxhub.app-base added (default /app). Mailer and StripeCheckoutService now delegate their link() bodies to appUrls.appLink(path); neither method's signature changed, so no caller was touched. 412 tests (408 + 4), 0/0/0.
  DISCRIMINATING CHECK: OAuth2SecurityConfig.java has an EMPTY diff across the whole milestone (verified 6112a00..0636edd), still reads boxhub.app-url directly and still builds redirectUri(base + "/login/oauth2/code/google") with no /app. OAuth2RedirectUriTest — which predates this task — passes unchanged. That test is the guard on a bug that shipped from M8 to M12c and is invisible to every local gate.
  EXECUTOR PROPOSED, I DECLINED: routing OAuth2SecurityConfig through AppUrls.origin(). It is a reasonable-looking refactor — same value, one less duplicated trailing-slash trim — and the executor correctly proposed rather than did it, per the brief. Declined because the duplication is ONE LINE and the risk is asymmetric: a mistake on that path is invisible until production. Do not refactor working code on the most dangerous path for cosmetic gain.
  Executor deviation, sound: also dropped the now-unused @Value import from StripeCheckoutService (its last @Value use was the one being replaced), which the plan's file list did not mention but the compiler requires.
M13a-T6: complete (8ab9554..3effef2, sonnet). App moved under /app. SPA locations became /app/, = /app, = /app/index.html; permanent 301s added for /auth/ /join/ /account/ /athlete/ /coach/ /admin/ /superadmin /tv /receipts/ /membership and = /. e2e 28 (27 + the redirect assertion). 184 frontend specs, build clean.
  VERIFIED BY ME ON THE LIVE STACK, not from the report: /auth/verify?token=abc123 -> 301 /app/auth/verify?token=abc123 with all FIVE security headers intact; /join/tok-xyz -> 301 /app/join/tok-xyz (path param preserved); /oauth2/authorization/google -> 302 accounts.google.com STILL AT THE SERVER ROOT. The six untouchable locations (/api/, /api/tv/stream, /actuator/health, /media/, /oauth2/, /login/oauth2/) do not appear in the diff at all — byte-identical.
  EXECUTOR SOLVED A REAL CONFLICT THE RIGHT WAY. The plan's verbatim assertion expected a bare-relative Location header, but nginx's `return 301 <path>` auto-prepends $scheme://$host. The obvious fix — `add_header Location ...` — would have violated invariant 5 and silently dropped every inherited security header. They used `absolute_redirect off;` instead, a core directive built for exactly this, which touches no headers and leaves proxied Location headers alone (Google's OAuth 302 is still absolute, verified). That is understanding WHY an invariant exists rather than just obeying it.
  OUT-OF-SCOPE FINDING, FILED NOT FIXED: InviteAdminController.java:76 returns raw /join/<token> and invites.page.ts:109 builds location.origin + inv.link, so the ADMIN-FACING copied invite link now lands via the 301 hop rather than directly. The EMAILED invite is already correct — it goes through Mailer.link() and therefore AppUrls.appLink(). Filed against M13d.
M13a-T7: complete (93c5677..905cd2d, sonnet). Opt-in local HTTPS via a `frontend-tls` service behind `profiles: ["tls"]`. docker/nginx.conf is UNTOUCHED (verified: empty diff); docker/nginx-tls.conf is a byte-identical copy plus listen 443 ssl + two ssl_* lines. Self-signed cert under docker/dev-tls/, gitignored, no key committed. Whole diff is additive: 194 insertions, 0 deletions.
  THE NEGATIVE CONTROL IS THE POINT, AND IT FIRED. BOXHUB_COOKIE_SECURE was wired in M12c and had NEVER been exercised, because dev is plain HTTP. With it true, over a real https origin: bh_at, bh_rt and bh_bt all carry `Secure`. With it false, same login, same TLS origin: `Secure` gone from all three, every other attribute identical. That is the first evidence the flag does anything at all.
  Also verified under TLS: Strict-Transport-Security: max-age=31536000; includeSubDomains, and zero CSP violations over a real browser journey (login -> athlete shell).
  HONEST BOUNDARY, stated in the commit and README rather than glossed: this proves nothing about the Google OAuth redirect_uri (needs a real registered domain) or email deliverability (Mailpit accepts everything). Both remain Launch -> Production items.
  EXECUTOR JUDGMENT WORTH KEEPING: it declined to edit /etc/hosts itself — a system-settings change — and verified with `curl --resolve` plus a throwaway Playwright script instead. Also found that the sandboxed browser tool refuses to navigate past an untrusted-cert interstitial (no `thisisunsafe` bypass), so real-browser TLS checks need Playwright.
  Plain-HTTP e2e still 28/28 at retries:0 after the change — the regression this task must not cause.
  FILED, NOT FIXED: nginx.conf and nginx-tls.conf are 154 duplicated lines that must be synced by hand, and TLS being opt-in means drift would go unnoticed. Extract a shared include. Not done inside T7 because that refactor edits the default plain-HTTP path T7 was forbidden to touch.
M13a-T8: complete (a3723cd..786da63, sonnet). Flyway V18 adds users.locale + boxes.locale, both `not null default 'en'`. 420 tests (412 + 8), 0/0/0. V1-V17 untouched; AuthzConformanceTest, SecretDefaultsTest and LogHygieneTest all have an EMPTY diff.
  PROVEN, NOT ASSUMED FROM THE DEFAULT CLAUSE: LocaleMigrationTest (standalone Flyway + Testcontainer, following MigrationGrandfatherTest's pattern) migrates to V17, inserts a user and a box by raw JDBC with no locale column at all — a genuine pre-V18 row — then migrates to V18 and reads the column back. Both come out 'en', NOT NULL confirmed.
  NEGATIVE CONTROL FIRED: User.locale marked @Transient -> 4 of 7 LocaleDefaultTest tests failed with `expected: "it" but was: "en"`. Reverted, suite re-verified green.
  Wiring: AuthController#register parses Accept-Language into a bare language tag; when an invite token proves ownership, InviteOwnershipProof.boxLocaleForToken supplies the box's locale instead (native Invite lookup + plain Box lookup — neither entity is @TenantId, so no filtering trap). Box admins set boxes.locale through the EXISTING PATCH /api/box/settings; no new route anywhere, which is why AuthzConformanceTest needed nothing.
  EXECUTOR ESCALATED CORRECTLY AND I RULED DEFER: it did not add PATCH /api/me/locale, because that would need a MIN_ROLE entry in AuthzConformanceTest, which the brief barred it from editing — it declined to land a knowingly-red conformance test. RULING: defer, and it was right not to build it. English is the only locale that exists, so there is nothing to switch TO; a route with no consumer that also costs an entry in a standing guarantee is speculative work. It becomes real when a second locale does.
  Also deferred and filed: BoxSignupTx.createOwnerAndBox does not read Accept-Language (only AuthController#register does — the plan said "the registration path", singular).
M13a-T9: complete (f40d02d..05c2c1a, sonnet). i18n INFRASTRUCTURE ONLY — scope narrowed after I measured the surface at ~390 strings across 60 files and realised M13c-M18 rewrite those screens anyway. The obligation moved onto the rewrite as a binding CLAUDE.md rule.
  Shipped: @angular/localize via `ng add` (polyfill in build+test targets, types in both tsconfigs, NO i18n.locales block — single bundle, no locale in URL as decided); core/i18n/locale.ts wrapping registerLocaleData + loadTranslations behind one initLocale() call; main.ts calls it pre-bootstrap; LOCALE_ID provided in app.config.ts. All no-ops today (English only) — this is the seam a resolved users.locale plugs into.
  STEP-4 PROOF, real output from a temporary spec deleted after capture:
    date  en-US "05 Aug 2026"  -> it-IT "05 ago 2026"
    money en-US "€89.00"       -> it-IT "89,00 €"
    text  "Hello"              -> after loadTranslations "Ciao"
  Both mechanisms proven independently: registerLocaleData+LOCALE_ID drive formatting, loadTranslations drives $localize substitution.
  Brand: BRAND_NAME in core/brand.ts, 7 TS sites + document.title via the Title service. index.html's static <title> stays a literal (raw HTML cannot read a TS constant) with a comment saying so. Correctly NOT touched: boxhub_tv_paired storage key and the boxhub/tv pairing-path text — technical identifiers, not brand renders.
  EXECUTOR CAUGHT A FACTUAL ERROR OF MINE. I wrote — in both the spec and the plan — that money is "formatted €xx.xx by hand at the frontend edge" and that 8 hand-written euro literals were "the ones to kill". FALSE. All 34 `| date` and 10 `| currency` sites already use Angular's locale-aware pipes, and all 8 euro occurrences are in .spec.ts files asserting those pipes' CORRECT output. I had misread M10's HANDOFF line "€xx.xx only at the FE edge" as hand-formatted-at-the-edge when it meant rendered-at-the-edge. What was actually missing was the locale to render against, not the formatting sites. Both documents corrected.
  Gates: 184 specs, production build clean, e2e 28/28 fresh stack retries:0, login and TV screens visually pixel-identical after the brand swap.
M13a-T10: complete (cd5acd5..d9fa028, sonnet). Mail templates externalised to messages.properties; Mailer resolves the recipient's locale; Brand.java is the backend brand constant. 428 tests (420 + 8), 0/0/0.
  EXECUTOR CAUGHT A SECOND ERROR OF MINE. My brief asserted "two callers hold no User — SubscriptionLapseJob and the Stripe webhook". BOTH WRONG: each resolves through member.getUser() and holds a full User. The genuinely User-less callers are InviteAdminController (invitee has not registered — only an Invite row) and SuperadminBoxController's approve/reject (bare email off BoxLifecycleTx.TransitionResult). It checked all six mailer.send call sites before choosing a design; I asserted from memory without opening the files. Plan corrected.
  DESIGN CHOSEN, Mailer-looks-up: resolveLocale(String email) does UserRepository.findByEmail(...).map(User::getLocale) falling back to Locale.ENGLISH. Handles all six call sites uniformly with ZERO signature change and no risk of a caller threading a stale locale. shared already depends on identity elsewhere (RoleGuard, PurgeJob), so it is not a new architectural direction.
  NEGATIVE CONTROL: rendered verify.html, got the real sentence; mutated ONLY the bundle value in-memory via StaticMessageSource (no template or engine change) and re-rendered — output flipped entirely, no trace of the original. That proves the template reads the bundle rather than an inline string, which is the whole claim.
  SOUND DEVIATION: bundle is messages.properties, not messages_en.properties. It is Spring's ResourceBundle ROOT/fallback, so any requested Locale resolves through it; an _en-only file throws NoSuchMessageException for any other locale value. users.locale is free text with no validation yet, so this is the safe default. Good reasoning, better than what I specified.
  INVARIANT 2 HELD: LogHygieneTest has an EMPTY diff and passes; Mailer's mask(to) survives on BOTH the INFO and the ERROR line. M12c's PII protection came through a Mailer rewrite untouched.
  DECLINED WITH REASON, correctly: #D7263D left duplicated across the templates. Centralising it needs a parameterised Thymeleaf fragment for the CTA anchor plus th:replace at 8 call sites — markup surgery, not a byproduct of moving strings. The brief said not to force it.
  SMALL DEBT NOTED IN THE CODE: three places hold the brand name as a literal by necessity — application.yml's boxhub.mail.from default (YAML cannot reference a Java constant), index.html's pre-boot <title>, and the two constants themselves. Kept in sync by hand; the Brand javadoc says so.
M13a-T11 (orchestrator — gates, docs, merge are mine): MILESTONE GATE PASSED.
  backend 428/0/0 · frontend 184 SUCCESS · production build clean · e2e 28/28 fresh stack at retries:0.
  VISUAL CHECK, the milestone's central claim: captured login / athlete home / admin dashboard / coach classes at 1280x800 and LOOKED at them. Warm dark ground, race red on mark+primary only, Saira Condensed display, tabular numerals, correct radii — all intact, nothing shifted. BE PRECISE ABOUT WHAT THIS IS: inspection of four representative screens, NOT a pixel diff against main. A true diff needs baselines built from main, which is the post-M13 visual-regression backlog item.
  Two stale user-visible things found by looking rather than by any gate: dashboard.page.ts:89 tells box owners "Full analytics ... lands with milestone M8" (wrong before AND after the renumbering — M8 was auth), and the HANDOFF header still claimed 2026-07-27, ~/Desktop/boxhub, Angular 19, and a git-ignored ledger. First filed for M16; second fixed.
M13a MERGED to main as f894004, pushed, branch deleted. 23 commits.
  CI WENT RED ON THE MERGE, then green on re-run of the SAME COMMIT. e2e failed at runner.spec.ts:45 — data-timer expected RUNNING, received "none", 27 passed / 1 failed. Re-run: success. Non-deterministic, therefore NOT an M13a regression.
  I CHECKED THE OBVIOUS SUSPECT BEFORE CONCLUDING FLAKE: the /app move changed <base href> from / to /app/, which would break any RELATIVE EventSource URL. TvService.stream() uses `new EventSource('/api/tv/stream')` — absolute, leading slash, unaffected by base href. Ruled out by reading the code, not by assuming.
  THIS IS THE CASE M12a EXPLICITLY PREDICTED. Its ledger: "The split assertion is now the diagnostic — the next CI failure names which half broke (frame absent vs render broken). Revisit only if CI fails on the data-timer half." It failed on the data-timer half. Filed in BACKLOG with everything already known, so the next investigation does not redo M12a's measurements: local delivery is 2.34s +/-18ms against a 15s budget, CI is ~2.6x slower overall, and the next diagnostic step is capturing data-frames alongside data-timer to separate "no frame arrived" from "frame arrived carrying no timer" — different causes entirely.
  A FLAKE AT retries:0 MATTERS. M12a removed retries specifically so a red build would mean something; a test that passes on re-run erodes exactly that. Not fixed here because it is not this milestone's regression, but it is not a shrug either.

## M13b design language — 2026-08-06 — branch m13b-design-language, base 2ea5e41

Spec `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md` (design law v3, supersedes
2026-07-08 in full). Plan `docs/superpowers/plans/2026-08-06-m13b-design-language.md`, 12 tasks.
Product renamed **BoxHub → rxed** (`rxed.app`). No Flyway; next is still V19.

M13b-T1: tokens, faces, globals (0e2a616, sonnet). Chalkboard #0d110e + volt #DFFF4E. Saira out,
  JetBrains Mono in, no net font weight. Token NAMES preserved, so 53 files recoloured untouched.
  --red/--on-red/--red-glow kept as transitional aliases so the app never renders uncoloured between
  T1 and T5. 184 specs, build clean.
M13b-T2: light theme + ThemeService deleted (63726f4, sonnet). 180 specs (-4).
  EXECUTOR STOPPED TWICE, BOTH CORRECT. (1) app.config.spec.ts was NOT a theme test — its only
  assertion was that a sync provideAppInitializer completes before an async one, using data-theme as
  the observable proxy for a flash-of-unthemed-content fix. Ruled: delete. The bug is now
  STRUCTURALLY IMPOSSIBLE, not untested — dark is unconditional on :root in the global stylesheet, so
  the browser paints before any JS runs. Rewriting it around a synthetic proxy would have left a test
  asserting Angular's own initializer ordering, which no production code depends on any more.
  (2) tv-shell.page.ts was MISSING FROM MY FILES LIST. It never used ThemeService — it wrote
  data-theme directly, so the wall screen could opt out of a user's light preference — and fell
  through a search framed around the wrong noun. It was in the grep I ran BEFORE writing the plan and
  I dropped it. Step 5's "this grep returns nothing" gate caught it. THAT IS THE ARGUMENT FOR WRITING
  A GATE AS A COMMAND THAT MUST COME BACK EMPTY rather than as a list of files to change: the first
  knows about what you forgot.
  MY ERROR, MECHANICAL: I ran `git add <docs> && git commit` while the executor had three files
  git rm'd into the index, and git commit takes the whole index. A commit labelled "docs" contained
  89 lines of deleted TypeScript. Rewrote both commits on the unpushed branch, verified the resulting
  tree byte-identical. Every later brief carries a git-hygiene rule.
M13b-T3: --red → --volt (dfbb916, sonnet). 51 files, 94 lines each way, every changed line a token
  name. The sed had to EXCLUDE _tokens.scss: a blind pass rewrites `--red: var(--volt)` into
  `--volt: var(--volt)`, a self-referential property that resolves to nothing, drains every colour in
  the product, and keeps both gates green.
  EXECUTOR CAUGHT A REASONING ERROR IN MY PLAN. I predicted --red would appear twice after the
  rename because "--on-red contains --red as a substring". It does not — --on-red has a single dash
  before red. Real count is one. Fixed the plan text: a bare number that is off by one gets
  re-measured, but A WRONG NUMBER WITH CONFIDENT REASONING ATTACHED GETS BELIEVED.
M13b-T4: focus rings become outlines (a0c9fc2, sonnet). 49 rings converted, 4 decorative glows
  deleted, zero `outline: none` left in frontend/src (main had them across 30 files).
  THE EXECUTOR'S FIRST REGEX PASS MISSED 10 SITES where `border-color: var(--volt)` sat between the
  `outline: none` and the box-shadow. Those rules would have kept a live `outline: none` beside the
  new outline — NO FOCUS INDICATOR AT ALL, green in every gate. Found only by grepping the whole tree
  after the pass instead of trusting it.
  BETTER THAN MY SPEC: for the score-form toggle it split the rule by state, so the ring is volt on
  the dark unchecked knob and dark on the volt checked one. Inverting unconditionally — what I
  specified — would have made that ring invisible half the time.
M13b-T5: errors → --danger (77891aa, sonnet). volt 101 → 48 uses, --danger 0 → 54. Completion grep
  for --red/--on-red/saira across src, angular.json, package.json returns zero bytes.
  Under the old law --red was BOTH the brand accent and the only warm signal, so errors borrowed the
  brand colour: `color: var(--red)` appeared 84 times. Red now means danger and nothing else, which
  is the first time in this codebase it has meant anything at all.
M13b-T5b: --danger may fill a control (4063ea6, orchestrator). USER DECISION. Spec §3 originally
  ended "volt is the only colour permitted to fill", which overreached — a control is not a row or a
  card, and the rule forbade the one thing every product does with red. Amended: --danger may fill a
  button or chip, never a row/card/panel. The control that OPENS a destroy flow is a danger-bordered
  ghost; the one that EXECUTES it is filled. --on-danger is DARK: white on --danger is 3.9:1 and
  fails AA, the same trap --on-volt exists for.
M13b-T6: wordmark + favicon (fba9313, orchestrator inline — the executor died on a session limit
  before writing anything, tree was clean). The logo is TYPE, not an asset: a component rendering in
  the product's own webfont, so there is no export pipeline to keep in sync. favicon.svg is
  hand-drawn because an SVG favicon cannot load a webfont and <text> would fall back to whatever mono
  the browser picks. favicon.ico deleted rather than kept as a fallback — it would have shipped the
  retired brand to any client preferring .ico.
  PLAN CORRECTED BEFORE DISPATCH: I had written the component with signal inputs. Measured, the
  codebase is @Input() in 11 files to 0, all 56 components on ChangeDetectionStrategy.Eager.
  Introducing the repo's first signal input inside a wordmark is a framework migration smuggled in as
  a brand asset.
M13b-T7: rename to rxed (50da546, sonnet) + subject lines (aa75673, orchestrator). 428/0/0.
  THE BEST CATCH OF THE MILESTONE. The roadmap said 18 user-facing occurrences; the spec's own §10.3
  audit said four values. BOTH MISSED SIX EMAIL SUBJECT LINES — Java literals passed straight to
  Mailer.send(to, subject, …) → helper.setSubject(), so unlike the template bodies they never touch
  messages.properties or Brand.NAME. They are the MOST user-facing strings in the whole rename: a
  lapsed membership, a receipt, a failed payment, an invite, a box approval, a box rejection. Every
  one would have arrived in a real inbox announcing a product that no longer exists.
  The executor did NOT fix them — out of its declared scope, and changing production copy
  unilaterally is what the escalation rule exists to stop. Correct call.
  FILED, NOT FIXED: those subjects bypass messages.properties entirely, so a German recipient gets an
  English subject above a German body. M13a debt; Mailer already resolves a per-recipient locale, so
  only the wiring and six bundle keys are missing.
M13b-T8: mail accent (2eb26e2, orchestrator). 8 CTA buttons off #D7263D. NOT a find-and-replace:
  every one set color:#fff on the accent and white on volt is 1.1:1. Swapping only the background
  ships eight blank-looking buttons in the most important mail the product sends, verification
  included. NOT VERIFIED IN MAILPIT — templates render and the suite passes, but nobody looked at a
  message. Contrast here is arithmetic, not judgement.
M13b-T9: WOD board proof (a2f9987, sonnet) + fixes (0a7f31f, orchestrator). 181 specs.
  FONTS CONFIRMED LOADING through the real nginx container from /app/bundle-media/ — the exact path
  class that 404'd for a whole milestone in M5.5. That check alone justifies the proof being a route
  rather than a picture.
  EXECUTOR FOUND A REAL BUG BY LOOKING: a bare `.name` class is scoped to the component, not the
  nesting, so the WOD title's --fs-hero was also hitting leaderboard athlete names. Build green
  throughout.
  IT ALSO FLAGGED A CONTRADICTION THAT WAS MINE. The board rendered "For time · 12:00 cap" as a VOLT
  FILL. That is taxonomy — not live, not now, not primary, not winning — so it breaks the only rule
  volt has, and it came from my own first mockup, survived into the plan, and was built exactly as
  specified. Spec §2.3 rewritten from a COUNT to a rule about QUESTIONS: plumbing gets one volt
  element; a hero screen may mark one thing per distinct question; two answering the same question is
  a bug, and so is one answering none. A RULE PHRASED AS A COUNT INVITES YOU TO CHECK THE COUNT AND
  STOP THINKING.
  i18n CONVENTION SET HERE (spec §12.1), since this is genuinely the codebase's first marked screen
  and M13c inherits it across ~22 components: explicit @@feature.screen.element ids, because
  Angular's generated ids are content hashes and editing the English silently orphans every
  translation. Proper nouns unmarked — three athlete names and "Fran" were being sent to the
  translation catalogue. Movement names marked; a gym in Milan reads "Trazioni".
M13b-T10: admin members proof (60b4141 + 802124d, sonnet). 182 specs. The PLUMBING half, and the
  harder claim: a hero screen cannot demonstrate that a language stays calm, and "editorial treatment
  bled into ordinary screens" was one of the three stated reasons the previous direction was retired.
  Verified live at 1440/768/375, keyboard-tabbed, one volt element asserted in the DOM.
  I INTRODUCED A BUDGET FAILURE AND FIXED IT PROPERLY: replacing `font-size: 11px` with
  `var(--fs-meta)` pushed the component 12 bytes over its 4 kB style budget — THE BUDGET WAS QUIETLY
  ARGUING FOR THE TOKEN VIOLATION. Cut a genuine redundancy (margin and margin-left set separately on
  one rule) rather than raising the limit. Also learned: inline style="" in template markup does not
  count toward anyComponentStyle at all.
M13b-T11: receipt print (fb05962, orchestrator). PRE-EXISTING BUG, OLDER THAN THIS MILESTONE: the
  page's entire print stylesheet hid the buttons, so with backgrounds dropped it printed near-white
  --bone onto white paper. Boxes use this page for bookkeeping. Dark-only does not cause it — it
  removes the "switch themes first" excuse that kept it unexamined. Overrides scoped to :host, never
  :root; a print rule reaching :root is the light theme returning through the back door.
  NOT VERIFIED BY PRINTING TO PDF. Computed, not seen. Recorded in the hand-off.
M13b-T12: docs + full gate (orchestrator; the executor died on a session limit partway through
  DESIGN.md/CLAUDE.md/PRODUCT.md/HANDOFF.md, which I reviewed and completed).
  MILESTONE GATE: backend 428/0/0 · frontend 182 SUCCESS · production build exit 0 with the three
  known pre-existing budget warnings · e2e 28/28 at retries:0 against a `down -v` rebuilt stack.
  THE E2E RUN EARNED ITS KEEP TWICE (c147c58). theme.spec.ts failed CORRECTLY — it pinned the retired
  warm ground rgb(23,18,13) and the deleted data-theme attribute. Rewriting it exposed that its
  SIBLING WAS HOLLOW: the font guard written after M5.5's P0 called
  document.fonts.check('800 20px "Saira Condensed"'), and .check() returns true whenever the string
  is renderable INCLUDING BY A FALLBACK. It passed for the entire milestone while asserting a
  typeface deleted in M13b's first commit, and it could never have detected the bug it existed to
  catch. Replaced with document.fonts.load(), which resolves to an EMPTY ARRAY for an undeclared
  family, plus a permanent negative control asserting Saira Condensed returns zero faces — so the
  test proves its own discrimination on every run instead of relying on someone having broken it once.
  THIS IS THE HANDOFF'S OWN LESSON LANDING ON THE HANDOFF'S OWN EXAMPLE: "a test that has never been
  seen to fail proves nothing", sitting inside the test written to prevent this project's most
  expensive frontend bug.
  PROCESS NOTE: five of six executors returned a real finding, and every one was caught because
  briefs tell them to stop rather than improvise. Three of those findings were errors in MY briefs.

## M13c component library — 2026-08-06 — branch m13c-component-library, base 8eb2819

Spec `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md`.
Plan `docs/superpowers/plans/2026-08-06-m13c-component-library.md`, 14 tasks.
18 components: 6 rebuilt, 12 built, 3 deleted. No Flyway; next is still V19.
Gate baselines measured on main at 70a7565 (must all reach zero):
  79 global-CSS class sites · 20 global defs · 18 raw px in ui/ · 36 on-scale px in features
  · 9 Eager in ui/ · 35 decorators in ui/ · 3 dead components · 0 raw hex (standing, already zero)
M13c-T1: complete (eb3b928..9a71be6, sonnet). bh-icon, 27 lucide icons inlined, no runtime dep.
  ORCHESTRATOR FILENAME FIX BEFORE DISPATCH: every .superpowers/sdd/task-N-brief.md and
  task-N-report.md slot 1-15 was already occupied by STALE files from M8/M12b — task-1-report.md
  was M12b's V16 migration report. A first executor died on an API limit having written nothing,
  and reading that stale report would have scored the task DONE. M13c uses m13c-task-N-*.md.
  Generalise: milestone-scope scratch filenames, or a dead executor looks like a finished one.
  FIX 1 (orchestrator, trivial glue): npm wrote "^1.28.0"; pinned exactly. Geometry is copied at
  authoring time, so a caret breaks nothing at runtime — but whoever adds icon #28 on a fresh clone
  copies from whatever minor npm resolved, and lucide redraws icons between minors. Stroke
  inconsistency arriving slowly across a set whose whole value is consistency.
  FIX 2 (executor, from review — Important, and the finding was against MY brief): my Step 7
  "all 27 wired" check was a one-off shell grep, never committed. Angular does NOT exhaustiveness-
  check @switch against a TS union and there is deliberately no @default, so a dropped @case renders
  an EMPTY <svg> — build green, 184 specs green, icon silently blank. THE PROJECT'S OWN LESSON
  LANDING ON MY OWN PLAN. Fixed better than restoring the grep: ICON_NAMES is now a const array and
  IconName derives from it (typeof ICON_NAMES[number]), so array and union cannot drift, and one
  spec loops all 27 asserting geometry, naming the offending icon via withContext.
  BOTH NEGATIVE CONTROLS FIRED, and the reviewer ran its own rather than trusting the executor's:
  executor emptied `settings` (mid-list), reviewer independently emptied `inbox` (last case). Both
  produced exactly one failure naming the icon. That is the difference between a demonstrated
  mechanism and an anecdote.
  EXECUTOR CAUGHT A COUNT ERROR OF MINE, AGAIN: my fix brief said "keep all three existing tests"
  while describing two. There were two. Fourth brief error of the milestone so far.
  DECLINED, with the reason recorded so it is not re-litigated per task: reviewer asked for an
  --icon-size-* token scale before six tasks start passing [size]="16". Four distinct sizes across
  eighteen components is not proliferation, and design law's tokens-only rule governs colour, font,
  radius and spacing — not SVG geometry attributes. Default stays 20; call sites pass 16 or 28.
  Note for later briefs: `ng` is NOT on PATH in the executor shell. Use `npx ng`.
  185 specs (182 + 3), production build exit 0 with the three known pre-existing budget warnings.
M13c-T2: complete (9a71be6..b5423c7, sonnet). bh-button rebuilt: signal inputs, no Eager, loading
  state, hover rung, icon variant, label input. API source-compatible — all 32 call sites untouched
  and still compiling (npx ng build, no NG8002). 191 specs.
  EXECUTOR CAUGHT MY FIFTH BRIEF ERROR: plan said "187 specs" for this step, written before T1's
  review fix added a third icon spec. It reconciled instead of forcing the number, which is exactly
  why these are written as expectations. Plan's whole running chain rebased (74df0d6).
  REVIEW FOUND A DEFECT THAT WOULD HAVE SURFACED AS A RED e2e TWO TASKS LATER, and this is the best
  catch of the milestone so far. variant="icon" had no way to carry an accessible name: aria-label
  written on <bh-button> lands on the HOST, not the inner <button>. Task 6 replaces the coach and
  admin shells' icon buttons with this component, and onboarding.spec.ts:99 asserts the selector
  `button[aria-label="Log out"]` — which needs the attribute on a real <button>. So the milestone
  would have shipped an unlabelled control AND turned a spec red, and the failure would have looked
  like Task 6's fault. Fixed with a `label` input bound as [attr.aria-label]="label() || null".
  THE `|| null` IS THE POINT: an EMPTY aria-label overrides projected text as the accessible name,
  so `label()` alone would silently un-name every text button in the app. Mutation-tested by the
  re-reviewer — reverting to `label()` fails exactly one spec.
  Also fixed: a loading icon button rendered TWO glyphs (spinner beside the projected icon) — gated
  by @if for the icon variant only, text buttons still render their label while loading or they lose
  their accessible name; the docstring claimed law §11.1's seven states while implementing six.
  ADJUDICATION ON THE SEVENTH STATE: `error` is deliberately NOT added. A button does not own an
  error — the field or alert beside it renders it. Law's rule is that a component which cannot be in
  a state SAYS SO rather than omitting it silently, so the docstring now says which owns it.
  FINDING ACCEPTED, SUGGESTED FIX DECLINED: reviewer wanted the spinner's 700ms to reuse --dur.
  --dur is 200ms with an ease-out bezier — right for a transition, and it would make a continuous
  spin a stutter. Added --dur-spin instead, which satisfies tokens-only properly.
  Re-reviewer mutation-tested BOTH new guards rather than reading them, then restored and re-ran.
M13c-T3: complete (c555afe..8ff4a1c, sonnet x3 — build, escalation ruling, review fixes). 201 specs.
  bh-field rewritten, bh-select new, bh-panel to signal inputs. NO screen migrated — see below.
  EXECUTOR STOPPED AND WAS RIGHT, AND THIS ONE WAS ARCHITECTURAL. My spec §6.1 called the
  .bh-input/.bh-select migration "mechanical". It is not, for two structural reasons it proved
  rather than asserted: (1) 13 of 16 files wrap inputs in a template-driven <form> with
  required/minlength/name/[(ngModel)], and bh-field is not a ControlValueAccessor, so ngModel does
  not misbehave on it — it does not work at all; (2) nearly all 54 sites carry a data-testid the
  e2e suite drives with Playwright .fill(), which requires the node to BE an <input>, and an
  attribute on <bh-field> lands on the HOST. Same host-vs-inner-element failure review caught on
  bh-button's aria-label in T2 — twice in one milestone, so it is a pattern, not an accident.
  USER RULING: defer. The decisive fact was OWNERSHIP, which I had not checked when writing the
  spec — all 16 files are rebuilt by a later milestone, SEVEN by M13d. Migrating now designs a
  ControlValueAccessor contract against template-driven forms M13d is about to delete: the exact
  double work this program exists to prevent, arriving through a lint rule. Spec §3.8 records it;
  the gate became a CAP (must not exceed 54) rather than a zero, so new code must use the component
  while old code has a scheduled death. Whether bh-field becomes a CVA is M13d's call.
  .bh-table and .bh-dock are unaffected — not form controls, no ngModel, no .fill(). Both proceed.
  REVIEW FOUND A CRITICAL BUG AND REPRODUCED IT RATHER THAN REASONING ABOUT IT. bh-select's
  [value] does NOT stick when <option>s arrive asynchronously: the native select keeps the browser's
  first-option default and stays wrong — silently, permanently, no error. The reviewer wrote a
  throwaway spec with options behind a signal that starts empty, got `Expected 'a' to be 'b'`, then
  deleted it and re-ran clean. That is the exact shape M13d/M16/M18 plan and box pickers will use,
  and it would have picked the wrong plan.
  MY SUGGESTED FIX WAS WRONG — SEVENTH BRIEF ERROR. I proposed viewChild + afterRenderEffect. The
  executor tried it, still failed identically, and read Angular 22's source: afterRenderEffect is
  signal-dependency-gated like effect(), so it never reruns when a parent merely repopulates
  projected <option>s — nothing signal-typed changed. It then tried ngDoCheck (fires, but too early
  — still saw an empty option list) and landed on ngAfterContentChecked, which Angular defines as
  running after projected content is checked. Writes only when the element's value differs, so no
  feedback loop against the user's own selection.
  Also: dead `computed` import removed; spacing snapped onto the token scale (13px -> var(--sp-3),
  6px -> var(--sp-1)) in BOTH components, free because nothing renders them yet. The only px left
  are 1px borders and 2px focus outlines, which design law prescribes verbatim.
M13c-T4: complete (21bf7c3..bf99237, sonnet x2). bh-alert + bh-empty. 208 specs. NO screen migrated
  — the 42 class="err" / 13 class="empty" sites are per-component classes defined locally, they
  break nothing by staying, and they belong to each screen's rebuild (spec §3.7). First real
  consumer is M13d.
  bh-alert derives its ARIA role from tone instead of fixing role="alert": role="alert" interrupts
  a screen reader mid-sentence, right for a failed save, wrong for "check your inbox".
  REVIEW MUTATION-TESTED THE SPECS AND BOTH FAILED TO DISCRIMINATE — the project's own standing
  lesson, again, and neither would have been found by reading. (1) Collapsing all four tone icons to
  one left the suite GREEN, so the colour-blind signal had no regression guard at all. (2) Inverting
  half the tone->role mapping (making `good` an alert) also left it green — only 2 of 4 directions
  were asserted, and the untested half is the accessibility contract the component exists for.
  Both fixed and both mutations re-run as negative controls: `Expected 1 to be 4` and
  `Expected 'alert' to be 'status'`.
  Also: --bw-accent: 3px added to _tokens.scss — the alert's left rule was the design system's only
  bare border-width literal, and it becomes the precedent M13d copies across eleven screens.
  TWO DOC GAPS CLOSED THAT ONLY MATTER BECAUSE M13d IS NEXT: bh-empty is deliberately NOT a live
  region, so a screen swapping a list for it after a fetch needs its own aria-live wrapper; and
  role="alert" announces reliably only when the element is freshly INSERTED, so bh-alert must be
  mounted/unmounted with @if rather than kept mounted and mutated. The natural-looking Angular
  pattern is the one that silently fails to announce.
  EXECUTOR CAUGHT MY EIGHTH BRIEF ERROR: the brief's spec-count arithmetic was stale again ("199 =
  193+4+1", which is 198, against a real baseline of 201). Reconciled rather than forced.
  IMPECCABLE HOOK FALSE POSITIVE, correctly classified and NOT suppressed: it flagged the 3px
  border-left as a "side-tab AI tell". Design law §3.1 prescribes exactly a thin left rule for quiet
  semantic colour on a row-sized element. Reviewer independently agreed.
M13c-T5: complete (e70eaed..c981a53, sonnet x2). bh-data-table replaces the global .bh-table.
  7 screens / 9 table instances migrated mechanically. _table.scss DELETED, @use removed. 215 specs.
  ::ng-deep is required, not lazy: thead/tbody are PROJECTED, so they carry the CONSUMER's
  encapsulation attribute and scoped selectors cannot reach them.
  REVIEW PROVED THE SPECS COULD NOT SEE THE ONE FAILURE THAT MATTERS. It stripped every ::ng-deep
  from the component and all three specs STILL PASSED — the component's entire styling contract,
  the whole reason ::ng-deep exists here, was untested, so a refactor breaking those selectors would
  have shipped an unstyled admin table with every gate green. Fixed with a spec that attaches the
  fixture to the document and reads getComputedStyle on a PROJECTED <th> and <td>. Negative control
  fired: `Expected 'none' to be 'uppercase'`, `Expected 'normal' to be '0.66px'`,
  `Expected '1px' to be '13px'`. Structure-only assertions cannot test styling — projection produces
  the structure whether or not the CSS reaches it.
  SECOND CONVENTION CAUGHT BEFORE IT SPREAD: console.page.ts had data-testid on the <table>, and the
  migration moved it to the <bh-data-table> HOST, where it no longer reaches a table. Task 3 had
  already established the library's answer (an explicit testId input forwarded to the inner element),
  so this would have been two contradictory conventions in one library. bh-data-table now has
  testId; the three console sites use it. No e2e reads them — verified twice — so this was purely
  about not shipping the inconsistency.
  MY BRIEF SILENTLY REDESIGNED THREE SCREENS — NINTH ERROR, and the most subtle. The component source
  I wrote dropped `text-transform: uppercase` and moved 17px to var(--fs-body) on .mname, changing
  four cells across members / superadmin console / schedule. KEPT, not reverted: design law v3 says
  names read better in mixed case and uppercase belongs to mono eyebrows only, so the old rule was a
  pre-M13b leftover — but it was bundled inside a task described as PRESERVING those classes, which
  is how a redesign hides. Now carries a comment naming the change, the law, and the three owning
  milestones (M15 / M18 / M14). Visual-regression baselines are built in T13, after this, so they
  capture the corrected state rather than locking in the old one.
  Also: redundant ::ng-deep .num deleted (the global utility already applies to projected cells,
  since global styles are not view-encapsulated).
M13c-GALLERY (pulled forward, 3c7786c, sonnet): user asked when /app/dev/components would show
  anything, and the honest answer was "task 11, five tasks away". Pulled forward and scoped to the
  8 components then built. Purely additive; later tasks extend the same page. 216 specs.
  ORCHESTRATOR ENVIRONMENT FIGHT, recorded because it cost real time: `docker compose up --build`
  failed TWICE with `DeadlineExceeded` on the frontend image. Building the SAME image standalone
  (`docker build -f docker/frontend.Dockerfile`) succeeds in seconds — BUILD_EXIT=0, npm build step
  4.2s. It is a compose/buildkit deadline, not a broken build, and `up -d --build` worked once the
  layers were warm. Anyone hitting this: build the image directly first.
  I ALSO MIS-REPORTED THAT FAILURE AS A SUCCESS. I backgrounded it as `docker compose … ; echo
  "compose exit=$?"`, so the shell exited 0 while compose had exited 1, and the task notification
  said success. Same class as piping a gate through grep — the trailing command's status is not the
  gate's. Write `cmd > log 2>&1; echo "EXIT=$?" >> log` and then GREP THE LOG, never trust the outer
  status.
  Dev-server-only viewing does not work: with no backend, AuthService's boot call to /api/me fails
  and the interceptor's logout path redirects to /auth/login. The gallery renders, then vanishes.
  Publishing the backend's 8080 to the host (compose overlay in scratch) fixes it for dev-server use.
M13c-T6: complete (3c7786c..14e8f5b, sonnet x2). bh-shell-header + bh-dock. 225 specs.
  FULL e2e 28 passed + 1 skipped on a `down -v` rebuilt stack, run TWICE — once after the build and
  again after the review fix, since the fix touched the shells and the first run no longer applied.
  NOT one bh-app-shell: athlete and coach are flex columns, admin is a grid with a side nav and a
  PENDING banner. Each shell keeps its layout; only the bar and the dock moved. Placeholder glyphs
  gone — Home was '▮▮', Plan was '$'.
  EXECUTOR FIXED A REAL GRID TRAP MECHANICALLY RATHER THAN STALLING: wrapping <header> in
  <bh-shell-header> makes the COMPONENT HOST the grid item, so without an explicit grid-area CSS
  Grid auto-placed it into admin's 210px side column. `class="top"` + `.top { grid-area: top }` kept
  in admin's own stylesheet. Right call — mechanical, not a design decision.
  EXECUTOR CAUGHT MY TENTH BRIEF ERROR: I called both security-link testids load-bearing. Neither is
  referenced anywhere in the Playwright suite; only the Log out aria-label is. Preserved anyway.
  REVIEW FOUND AN ACCESSIBILITY REGRESSION MY BRIEF CAUSED, and verified it against Angular's own
  source rather than asserting it. I said "replace the icon buttons with <bh-button variant=icon>"
  without carving out the NAVIGATION case. RouterLink only renders an href when the host tag is
  a/area; bh-button's host is <bh-button>, so the Security link produced NO href. Left-click still
  worked — the click bubbles to the host — which is exactly why no test caught it. Lost: ctrl/cmd
  and middle click, open-in-new-tab, and the correct role (a screen reader announced "Security,
  button" for something that navigates to another page).
  PRINCIPLE APPLIED: buttons do things, links go places. Logout stays a bh-button; Security is a
  real <a>. The duplicated CSS this task existed to delete did NOT come back — the projected action
  links are styled ONCE inside bh-shell-header's .acts slot.
  Negative control fired: `Expected null to be '/account/security'`.
  FILED, NOT BUILT: bh-button cannot render as an anchor, and wod-library.page.ts:15 works around it
  by nesting <bh-button> inside <a> — a <button> inside an <a>, an invalid content model. M13d hits
  this immediately (its auth screens are full of links styled as buttons), so it is filed against
  M13d to decide with real consumers in front of it.
  DECLINED, with the reviewer's own reasoning: adding testId to bh-button. field/select/data-table
  needed it because tests target a semantically different INNER element; bh-button's host already
  carries data-testid at 30+ existing call sites, so adding it would be an unrequested API change.
M13c-T7: complete (9b30292..61cb6d7, sonnet x2). bh-segmented + bh-switch, score-form migrated.
  236 specs. Closes the filed a11y defect: role="radio" with NO roving tabindex and no arrow keys,
  so every option was a tab stop and Tab walked THROUGH the group. A radiogroup is one tab stop.
  I VERIFIED THE DISCARD GUARD IN A REAL BROWSER, because no gate covers it and the failure mode is
  an athlete's score vanishing. score-form lives in a bh-sheet whose [confirmClose] is driven by its
  dirtyChange output. Live against the built stack: clean Escape closes with no bar; Escape after
  changing the segmented control raises "Discard your entry?". Roving tabindex measured live as
  [0, -1] — the defect is fixed in the running app, not merely unit-tested.
  THE REVIEWER DROVE THE LIVE STACK TOO AND COVERED WHAT I MISSED: I only exercised the segmented
  control; it exercised both switches (two DIFFERENT handlers) and confirmed the backdrop-click path.
  Reviewers independently reproducing rather than trusting the report has now caught something in
  four of seven tasks.
  REVIEW FOUND THE REAL GAP, WHICH WAS COVERAGE NOT BEHAVIOUR: the only dirty-tracking spec fires a
  raw `input` event on the <form>, so it would have passed with ALL THREE new handlers deleted.
  Behaviour was right; nothing in CI would have caught it regressing. Three specs added, one per
  handler, each negative-controlled: "Expected spy dirty to have been called ... But it was never
  called." Buttons do not emit native input events, which is exactly why the form-level (input)
  bubble could not cover these three paths.
  REVIEWER ALMOST MIS-FLAGGED translateX(18px) AND CHECKED INSTEAD: with global box-sizing:border-box
  the track's content box is 44 - 2x1px border - 2x2px padding = 38, and 38 - 20 = 18. Exact, not
  sloppy. Derivation is now a comment so nobody "fixes" it.
  Also: switch track 44px -> var(--tap) and knob 20px -> var(--sp-5), which were coincidental
  duplicates of existing tokens. Other raw-px GEOMETRY across ui/ stays — the rule bans raw px TYPE
  SIZES, and geometry is out of scope, consistent with the bh-icon and bh-avatar rulings.
  BACKLOG line split: it bundled the segmented roving-tabindex defect with the bh-sheet discard-bar
  focus defect. Only the first shipped; leaving one line would have read as both done or both open.
M13c-T8: complete (9235478..c661926, sonnet). bh-search-bar, 3 screens migrated. 240 specs.
  e2e 28 passed + 1 skipped on the rebuilt stack.
  FIRST TASK OF THE MILESTONE TO CLEAR REVIEW WITH ZERO FINDINGS.
  Closes the filed defect: members.page fired one request per KEYSTROKE. The bound value still
  updates on every keystroke so the field never lags; only the output is debounced, and an unchanged
  term does not re-emit.
  EXECUTOR APPLIED INSTRUCTION #1 CORRECTLY WITHOUT BEING TOLD THE ANSWER. The brief warned that an
  attribute on a component host does not reach the inner element — the failure that has now cost
  four fixes this milestone (bh-button aria-label, bh-field, bh-data-table, and here). It checked
  e2e/tests itself, found invite-flow.spec.ts:34 drives [data-testid="member-search"] with .fill()
  (which REQUIRES the node to be an <input>), and added a testId input on its own initiative,
  matching bh-field's convention. That is the pattern being learned rather than re-taught.
  SOUND DEVIATIONS, both confirmed by the reviewer: it removed manual 250ms setTimeouts from
  movements and wod-library, which would otherwise have DOUBLE-debounced — verified those timers
  only delayed load(), with no request cancellation or race guard to lose. And it deleted a dead
  `.bh-section-head .bh-input` rule in members.page whose only user was the replaced input.
  DEBOUNCE VALIDATED RATHER THAN ASSUMED: 250ms was already the de-facto interval on two of the
  three screens, so the brief's default was measured, not guessed.
  HONEST BOUNDARY, checked by the reviewer rather than claimed: debouncing REDUCES but does not
  eliminate out-of-order responses — none of the three screens cancels in flight (no switchMap).
  members.page is strictly better than before (many overlapping requests -> at most one per 250ms
  pause); the other two are unchanged. Nothing in the code or docs claims otherwise.
  Reviewer mutation-tested all three guards: removing the re-emit guard fails `Expected 2 to be 1`,
  removing the debounce fails `Expected 3 to be 0`.
M13c-T9: complete (9f32f8b..905538c, sonnet x2). LAST COMPONENT TASK. avatar/pill/day-pager/wordmark
  rebuilt, stat + board-row + tag deleted. 245 specs. e2e 28 passed + 1 skipped.
  ui/ IS NOW CLEAN: Eager 0, raw px font-size 0, dead components 0. The only @Input() grep hit is
  prose in a spec comment describing the historical defect.
  THE AVATAR DEFECT WAS CONFIRMED BY WATCHING IT FAIL FIRST: `Expected 'AL' to be 'GH'`. A plain
  @Input() read inside computed() has ZERO signal dependencies — it evaluated once and cached, so an
  @for member list reusing a DOM node showed the previous athlete's initials beside the right photo.
  MY PRE-FLIGHT DECISION WAS WRONG — ELEVENTH BRIEF ERROR, AND THE MOST EMBARRASSING. I ruled the
  four avatar sizes should become `font-size: 36%`. A PERCENT FONT-SIZE RESOLVES AGAINST THE
  INHERITED FONT-SIZE, NOT THE ELEMENT'S OWN BOX, so all four rendered identically at 5.76px. The
  executor caught it by MEASURING with getComputedStyle rather than trusting me, and switched to
  36cqi with container-type:inline-size on the box and the ratio on a child (a container cannot
  query its own cqi — that is circular).
  THEN I MEASURED THE FIX AND IT WAS STILL WRONG, JUST LESS SO: one ratio gave sm -14.9%, md -5.5%,
  lg +5%, xl +5.8%. The originals were never proportional (39.3/36.4/33.3/33.3% of their boxes), so
  a single ratio CANNOT reproduce them. sm is the most-used size — shell header, member grids, score
  grid — and a 15% shrink there is a visible change to live screens, which this milestone forbids.
  I OVERRULED THE REVIEWER HERE, and the reason matters: it argued one ratio is more elegant and
  that sub-pixel matching is not load-bearing. Elegance was never the constraint; "no screen is
  redesigned" is, and 15% is not sub-pixel. Per-size ratios (42/38/34/34cqi against content boxes of
  26/42/70/94) land all four within 1% AND keep the raw-px gate at zero. Measured live: 10.92 /
  15.96 / 23.8 / 31.96 against 11 / 16 / 24 / 32.
  bh-sheet WAS NOT IN MY FILE LIST and still carried @Input/@Output/Eager. The cleanliness grep found
  it — the same thing that caught tv-shell.page.ts in M13b, and the same argument for writing a gate
  as "this must come back empty" rather than as a list of files.
  ANGULAR 22'S IMPLICIT DEFAULT IS OnPush, NOT Eager. Discovered while cleaning the sheet; it means
  dropping the Eager pin gives OnPush, which is why the sheet's test harness needed a signal rather
  than a plain field to match how every real caller already binds.
  bh-sheet's `open` went from an @Input setter with a private mirror to a read-only input(). Verified
  LIVE that the sheet still closes, REOPENS, and still raises the discard guard — the reopen was the
  actual regression risk. All four callers reset on (closed); the reviewer established the
  requirement is NOT new (the old setter needed the same transition), so it is documented, not
  redesigned.
  ORCHESTRATOR CAUGHT A FALSE GREEN: an e2e run reported 28 passed against a container whose image
  build had FAILED (DeadlineExceeded) — it was serving the previous bundle. Re-verified by grepping
  the served JS for the deleted components before trusting the rerun. Compose's builder fails on this
  machine; `docker build` standalone + `up -d --no-build --force-recreate` works.
M13c-T10: complete (4136525..29a11f0, sonnet). Budget + typography sweep. 245 specs, e2e 28+1.
  SECOND CLEAN REVIEW IN A ROW — no findings.
  anyComponentStyle warning 4kB -> 6kB, error UNTOUCHED at 8kB. The budget counts UNCOMPRESSED bytes
  while the wire cost is brotli, so at 4kB it was actively arguing for a raw value over its token —
  M13b's members proof went over budget purely by tokenising two literals. Honest cost, stated in
  the commit rather than buried: this silences the three standing warnings (instance-builder,
  tv-shell, progress). They stay filed against M14 / Project 2 / M17; the fix is each screen's
  rebuild, not a bigger budget.
  36 on-scale font sizes tokenised across 18 feature files. Reviewer re-derived all 36 mappings from
  the diff against _tokens.scss independently: 11px->--fs-meta x13, 13->--fs-sm x15, 15->--fs-body
  x2, 20->--fs-h2 x5, 40->--fs-hero x1. No mix-ups.
  41 OFF-SCALE VALUES REMAIN, DELIBERATELY, and that is the point of the split: 9, 10, 12, 14, 16,
  17, 18, 19, 21, 22, 24, 34, 44px have NO token, so converting one means CHOOSING a nearby size —
  a visible design decision on a screen nobody is redesigning. Grepping font-size in features now
  returns only off-scale values, which converts "people typed px" into a documented list of sizes
  the scale lacks, handed to M14-M18 as real questions.
  MY BRIEF'S "51 remaining" WAS STALE — measured before Tasks 3-9 migrated screens. Real number is
  41. Executor measured and reconciled rather than forcing my figure.
  Reviewer checked the two traps that would have been invisible: no font-size inside receipt.page's
  @media print block was touched (design law's sanctioned exception), and no on-scale value was
  missed in an alternate form (no-space, uppercase PX, `font:` shorthand, or inline style="").
  rem CAVEAT STATED HONESTLY, not overclaimed: --fs-sm is 0.8125rem and rem resolves against <html>,
  which sets no font-size (body's 16px does NOT affect rem). So these render identically at browser
  default and SCALE for a user who raised theirs — an accessibility improvement, not a
  pixel-identical swap.
M13c-T11: complete (29a11f0..0aadc68, sonnet + orchestrator glue). Gallery consolidated to 18
  sections — bh-sheet added (a modal <dialog> cannot render statically, so it gets triggers for the
  plain and confirmClose variants). 245 specs, build clean, zero budget warnings.
  A DISPUTED CRITICAL FINDING WAS RAISED, INVESTIGATED, AND REFUTED. The executor reported that
  bh-sheet CANNOT BE REOPENED after closing, claimed three reproductions with showModal()
  instrumentation, and said it would block Tasks 12 and 13. It does not reproduce.
  I tested both paths it named against the same running container: Escape (trigger -> 1, Esc -> 0,
  trigger -> 1) and discard (trigger -> 1, backdrop, its own Discard button -> 0, trigger -> 1).
  Both reopen. The reviewer then reproduced my result INDEPENDENTLY with its own showModal counter
  (showCount 2 after reopen) and supplied the mechanism I had only guessed at: @ViewChild with
  static:true resolves during the first change-detection pass, and a constructor effect's first
  flush is scheduled AFTER that pass — so the early `if (!el) return;` never fires on the first run,
  open() is tracked from the start, and el never becomes falsy again.
  THE LIKELY CAUSE OF THE FALSE POSITIVE IS WORTH KEEPING: while a dialog is open it intercepts
  pointer events, so a reopen click aimed at the trigger lands on the dialog and is silently
  swallowed — indistinguishable from "the sheet stays closed". I hit exactly that in one of my own
  scripts (Playwright said `<dialog open …> subtree intercepts pointer events`) before writing a
  clean sequence. AN EXECUTOR ASSERTING "this isn't a testing artifact" IS NOT EVIDENCE THAT IT
  ISN'T; three reproductions of the same flawed script are one reproduction.
  A REAL a11y GAP WAS FOUND IN THE SAME PASS AND FILED FOR M13d: bh-field/bh-select gate their
  <span role="alert"> behind @if (error()), and @if only recreates the node across the falsy/truthy
  boundary — so "Required" -> "Invalid format" mutates the SAME node, and role="alert" announces
  reliably only on fresh insertion (bh-alert's own JSDoc states this). Confirmed independently by
  the reviewer. Not fixed here: the fix belongs with a real consumer, and M13d has eleven form
  screens where a second validation message is the normal case.
  Also settled: field/select/table-row having no :active is NOT a defect — native inputs have no
  pressed state distinct from focus, table rows have no click handler, and all three self-declare it,
  consistent with panel/alert/empty/icon.
  Orchestrator glue: corrected the day-pager gallery note, which claimed its aria-labels' English
  "never changes even once localised" — they ARE i18n-marked; the e2e selectors pass because the
  suite runs against the English source. The executor found this itself and left it dangling while
  fixing three sibling notes in the same pass.
M13c-T12: complete (0aadc68..cbc9545, sonnet x2). axe-core, @axe-core/playwright@4.12.1.
  ZERO WCAG 2.2 AA violations across 7 tests. Full suite now 35 passed + 1 skipped.
  Two targets, and the SCOPING IS THE DESIGN: the gallery whole (it renders all 18 components in
  all their states, so it audits exactly what M13c owns), and the three shells .include()-scoped to
  bh-shell-header and bh-dock ONLY. Those two are the components whose failures are compositional —
  focus order through a nav, landmark structure, ids duplicated across a header rendered three
  times — so they cannot be proven in the gallery. Anything axe would report inside a screen body is
  out of scope BY CONSTRUCTION rather than by triage, which is what keeps M13c a component milestone.
  EXECUTOR CAUGHT A VACUOUS PASS — MY TWELFTH BRIEF ERROR AND THE WORST KIND. bh-dock is
  `display:none` above 719px (mobile-only chrome by design) and Playwright's default viewport is
  1280x720, so `.include('bh-dock')` contributed ZERO NODES to all three shell tests. The dock was
  passing an accessibility gate that never looked at it. It flagged this rather than silently
  widening scope, which was the correct call — the fix was mine to make.
  THIS IS THE FONT-GUARD FAILURE AGAIN, in a different costume: M13b's brand-font test passed for a
  whole milestone while asserting a deleted typeface. A test that cannot fail is worse than no test,
  because it also stops anyone else from writing one.
  Fixed by splitting into 3 shells x 2 targets: header at 1280x720, dock at 375x812 with the
  viewport set BEFORE login/goto. Non-vacuity assertions added before every .analyze() — the dock
  must be visible and have more than zero items — so a future reader can tell a real pass from an
  empty one.
  NEGATIVE CONTROL FIRES ON THE RULE THE COMPONENT EXISTS TO ENFORCE: stripping a dock item's text
  label, leaving only the icon, gives `link-name: 1 node(s)` — "Links must have discernible text".
  That is exactly the rule bh-dock was built for (the placeholder set it replaced used '$' for Plan).
M13c-T13: complete (9387911..383e3e9, sonnet x2). Visual regression. 54 baselines (18 sections x 3
  viewports), dark only, run ONLY inside mcr.microsoft.com/playwright:v1.62.0-noble via e2e/visual.sh.
  Default run is unchanged at 35 passed + 1 skipped with zero visual tests executed.
  THE PLATFORM TRAP, handled rather than discovered: Playwright suffixes snapshot paths by platform,
  so macOS baselines enforced on Linux is not a stricter check, it is NO check — each side silently
  ignores the other's files. snapshotPathTemplate drops {platform}, visual.sh is the only thing that
  writes them, and visual.spec.ts is excluded from the default run so a macOS run can never compare
  against them.
  I CAUGHT MY OWN THIRTEENTH BRIEF ERROR BEFORE DISPATCH: the plan pinned the container to
  Playwright 1.61.1. The installed version is 1.62.0. A mismatched renderer produces baseline churn
  that looks exactly like a real regression.
  THE NEGATIVE CONTROL DID NOT FAIL, AND THAT WAS THE REAL FINDING. --r-card 12px -> 20px changes
  every card corner in the product and the suite PASSED. Playwright's default threshold is 0.2 in
  YIQ colour distance, and on this dark-on-dark palette (--surface #151a16 on --ground #0d110e) an
  antialiased corner barely moves, so those pixels were never counted. A --volt swap DID fail (4%),
  which proved the pipeline worked and only the sensitivity was wrong. THE EXECUTOR REFUSED TO TUNE
  THE THRESHOLD ON ITS OWN AND ESCALATED — exactly right; quietly loosening or tightening a gate to
  get a green is the failure mode this process exists to prevent.
  TUNED BY MEASUREMENT, NOT TASTE, and the numbers are in a comment in the spec so nobody
  "simplifies" them back to the defaults: noise floor over two consecutive clean runs is 0px for 17
  of 18 sections and <=29px for shell-header (a rounded avatar badge); the radius signal is >=298px,
  400px on panel. threshold:0 with maxDiffPixels:100 leaves a ~10x gap and sits >3x clear of both
  sides. threshold:0.1 was tried and REJECTED — it shrinks the signal to 36-55px, only ~1.5x above
  the noise ceiling, which is a flaky gate, and a flaky gate is worse than a blind one because
  people learn to re-run it.
  A STALE STACK WAS FOUND, and it was mine: the running container was serving pre-0aadc68 code while
  I believed it was current — I had not rebuilt after T11's fix commit. Only note text was affected,
  but the lesson generalises: rebuild after EVERY frontend commit before measuring anything.
M13c-T14 (orchestrator): MILESTONE GATE.
  backend 428/0/0 (unchanged — M13c touched no backend) · frontend 245 SUCCESS · production build
  exit 0 with ZERO anyComponentStyle warnings (the three standing ones now sit under the 6kB
  warning) · e2e 35 passed + 1 skipped · axe 7/7 zero WCAG 2.2 AA violations · visual regression
  3/3 over 54 baselines in the Linux container.
  THE EIGHT EMPTY GATES, against their measured baselines on main at 70a7565:
    table/dock class sites 79 -> 0 · global defs 20 -> 0 · raw px in ui/ 18 -> 0 · on-scale px in
    features 36 -> 0 · Eager in ui/ 9 -> 0 · decorators in ui/ 35 -> 0 (the single remaining grep
    hit is PROSE in sheet.component.ts's JSDoc documenting the open contract) · dead components
    3 -> 0 · raw hex 0 -> 0 (standing guarantee, held).
    Form-control CAP: 53, under the 54 ceiling — one fewer because members.page's search input
    became bh-search-bar.
  M13b's TWO COMPUTED-NOT-VERIFIED CLAIMS, now actually verified — and one of them was WRONG:
  1. RECEIPT PRINT: CORRECT. Rendered a real seeded payment under print media and looked at it —
     black ink on white, every row legible (plan, period, method, list price, discount, total, date).
     M13b computed this and never saw it; it holds.
  2. MAIL ACCENT: HALF WRONG, AND THE HALF NOBODY CHECKED IS THE VISIBLE ONE. The CTA swap is right
     (measured live: rgb(223,255,78) on rgb(13,17,14) = volt on --on-volt). But layout.html still
     sets #17120D ground and #221B14 card — THE RETIRED WARM PALETTE — so every verification, reset,
     invite, receipt, lapse and approval email arrives looking like the product that was renamed
     away, with one volt button on a brown card. Three values, one file.
     THIS IS THE ARGUMENT FOR THE WHOLE "computed vs verified" DISTINCTION, in one artifact: M13b
     swapped a hex, reasoned the mail was done, and shipped a brand inconsistency to every recipient
     for a milestone. Opening it took four minutes.
     FILED, NOT FIXED — M13c declared no backend change and its spec §9.1 pre-committed to filing
     findings from this check. Widening scope at the merge gate is the creep the milestone lock
     exists to stop. Filed only for that reason, not because it is small.
M13c-T14 (cont.): THE GATE CAUGHT A DEFECT IN ITSELF, WHICH IS THE POINT OF RUNNING IT.
  Visual regression FAILED on the final `down -v` gate: 1347px on day-pager, all three viewports,
  every other section clean. Cause: bh-day-pager renders TODAY'S date, so the baselines encoded
  Friday 7 August and the gate ran on Sunday 9 August. THE SUITE WOULD HAVE FAILED EVERY SINGLE DAY
  — and a gate that cries wolf daily is a gate people switch off, which is worse than no gate
  because it also stops anyone writing a real one.
  Fixed by freezing page.clock to Wed 12 Aug 2026 noon UTC. ORDERING IS LOAD-BEARING and is
  commented: the freeze must be installed BEFORE goto(), because after it the DOM has already
  rendered and day() never re-runs. PROVEN, not assumed: frozen renders WEDNESDAY 12 AUGUST while
  the real date is SUNDAY 9 AUGUST, and ./visual.sh passes twice consecutively. Only the 3
  day-pager baselines changed, so the tuned sensitivity and its radius negative control still hold.
  bh-day-pager itself was NOT touched — rendering today's date is correct; the TEST was wrong.
  A NEAR-MISS I CAUGHT AT THE TREE, worth repeating: that executor died mid-negative-control and
  left `--r-card: 20px` UNCOMMITTED IN THE WORKING TREE. Merging it would have shipped a design-law
  violation across every card in the product. ALWAYS `git status` + `git diff` a dead executor's
  tree before doing anything else; a killed subagent does not clean up after itself.
  THE DOCKER "DeadlineExceeded" MYSTERY IS SOLVED, and it was never a build problem. The failing
  step is `load metadata for docker.io/library/nginx:1.31-alpine` — a Docker Hub REGISTRY timeout
  for an image that had never been pulled locally. `docker pull nginx:1.31-alpine` once, and every
  build since succeeds, compose included. Earlier in the milestone I wrote that compose's builder
  was broken on this machine and worked around it with standalone builds; that diagnosis was wrong
  and the workaround only ever succeeded when the registry happened to answer.
M13c IMPECCABLE GATE: 31/40 — PASSES (bar is >=28, no open P0/P1). Dual-agent, A design review /
  B detector+browser, isolated.
  Assessment B, deterministic: detector 1 finding, a FALSE POSITIVE (avatar's [src] flagged
  broken-image; it is the correct dynamic-image-with-fallback pattern behind @if). Contrast: zero
  real failures across 12 distinct pairings at 3 widths — the one sub-threshold hit was a
  screen-reader-only label that is never painted. --faint measured 5.07:1, confirming the documented
  claim. Zero horizontal overflow at 375/768/1440. Focus: 36 tab stops, every one visible, and THE
  VOLT INVERSION IS CONFIRMED WORKING — every volt-filled control rings dark (rgb(13,17,14)), never
  volt-on-volt. Fonts: all five faces load real; Saira Condensed negative control returns zero.
  B FOUND WHAT NO GATE COVERED: 31 CSP violations per load on the gallery, and ZERO on every product
  page. Cause: 21 inline style="" attributes (7 mine, 14 M13b's proof). The app's CSP has a nonce and
  no unsafe-inline, so a style attribute is blocked. THIS IS THE THIRD GATE THE SAME SHORTCUT EVADES
  — BACKLOG already recorded that inline style="" does not count toward anyComponentStyle either.
  THE DURABLE FIX WAS THE GATE, NOT THE STYLES: security.spec.ts asserts zero CSP violations but only
  visited /, /app/athlete/book, /app/auth/login and /app/admin/settings. The gallery was never
  checked, which is why 31 violations sat there unseen. Route added; proven to fail before the fix
  (`Received + 33`), 0 after.
  A's HEADLINE FINDING IS REAL AND PRE-EXISTING: `a { color: var(--volt) }` at styles.scss:14 is
  GLOBAL, so every link in the product is volt. Measured on the real login screen: four volt elements
  where law §2.3 says one. NOT fixed here — a global anchor colour repaints ~40 screens and the
  visual baselines cover only the gallery. Filed to M13d, which rebuilds those exact screens.
  FIXED FROM THE CRITIQUE: the flagship admin proof still rendered Unicode glyphs (▦ ◉ ▤ ≡ $ ⚇ ⚙)
  while the icon set M13c built sat unused — the exact "placeholder icon system" §17 assigned to this
  milestone. Migrated to bh-icon. And the dock demo, being position:fixed, floated over the WHOLE
  gallery below 719px, occluding other sections; contained with `contain: paint`, which also retired
  a workaround the visual spec had needed.
  THE VISUAL GATE THEN CAUGHT A CHANGE ITS OWN AUTHOR REPORTED AS ABSENT. The CSP fix said no demo's
  rendered output changed. It did: icon-phone 5520px, icon-tablet 5843px, button-desktop 632px,
  against a ~29px noise floor. I LOOKED at the new rendering before accepting it — 27 icons, clean
  grid, consistent stroke, correct spacing — so the reflow was benign and the baselines merely stale.
  Regenerated. 32 files rather than 3 because --update-snapshots rewrites the set and 29 carried
  sub-threshold drift; kept as one coherent capture rather than mixing two builds.
  Also filed: the members table clips at 375 and 768 with card mode built but unadopted (M15), and
  the search placeholder truncates in English before translation touches it (M15).
M13c MAIL PALETTE (8d3b955, orchestrator — user asked for it before merge). Backend 428/0/0.
  MY FILED COUNT WAS WRONG: I said three values in one file, because I had only counted what the
  browser reported on a single message. The real set is TEN across FIVE templates, and #8a8078
  alone appears five times OUTSIDE layout.html:
    #17120D -> #0d110e ground x2 · #221B14 -> #151a16 surface x1
    #E8E0D6 -> #f2f4ef bone x2   · #8A8078 -> #7c8779 faint x5
  The volt CTA and its dark #0d110e text are untouched — M13b got that half right, and white on
  volt is 1.1:1, which is why the text must stay dark.
  VERIFIED BY LOOKING: triggered a real verification mail through self-serve signup and rendered it
  in Mailpit — rgb(13,17,14) ground, rgb(21,26,22) card, volt CTA with dark text. Identical to the
  product. That is the check M13b recorded as computed and never performed.
  ENVIRONMENT, and it cost a false alarm: `mvn test` returned 79 ERRORS mid-session — every one
  `Could not initialize class AbstractIntegrationTest`. Not the template change: THE DOCKER DAEMON
  HAD STOPPED, so Testcontainers had no environment. `open -a Docker`, wait, re-run: 428/0/0. A wall
  of identical NoClassDefFound on a base class means the environment, not the diff.

## M13d — auth & account screens (branch `m13d-auth-account-screens`, from `0c5117e`)

Spec `docs/superpowers/specs/2026-08-10-m13d-auth-account-screens-design.md`,
plan `docs/superpowers/plans/2026-08-10-m13d-auth-account-screens.md`.

PRE-FLIGHT CAUGHT AN ERROR IN THE ORCHESTRATOR'S OWN PLAN (`e906764`): the running Karma totals
said 245 -> 253 -> 256 -> 261, but Task 1 adds three specs per component, not four. Corrected to
245 -> 251 -> 254 -> 259 before Task 1 was dispatched. Same class as M13c's thirteen brief errors,
found one step earlier this time.

Task 1: complete (commits e906764..6a2d932, review clean — spec PASS, quality Good)
  bh-field/bh-select gain name + required, bh-field alone gains autocomplete; the error <span>
  moves from @if to @for tracked by the message.
  NEGATIVE CONTROL VERIFIED, and it is the reason to believe the fix: pre-fix run produced
  `Expected <span role="alert" id="bh-f16-err"> not to be <span role="alert" id="bh-f16-err">`
  — literally the same node reused — with TOTAL: 2 FAILED, 246 SUCCESS. Post-fix 251/251.
  MINOR 1 (process, not code): executor wrote field.component.ts before running the mandated
  pre-fix check, then used git stash/pop to produce the evidence retroactively. Self-disclosed,
  evidence credible, nothing wrong shipped.
  MINOR 2 (orchestrator's brief was wrong): the brief predicted the attribute test would fail
  `Expected null to be 'email'`. It actually failed NG0303 — with the inputs not yet existing the
  template cannot compile at all, so it never runs far enough to misroute an attribute. The
  executor reasoned the root cause was identical and proceeded instead of escalating. Correct call.
  DEVIATION ACCEPTED: select.component.spec.ts's existing Host had no [error] binding (field's
  did), so the executor added one to drive the mirrored remount test. Inside an authorized file,
  defaults unchanged, no existing assertion touched.

Task 2: complete (commits 4a10f75..5a62baa, review clean — spec PASS, quality PASS)
  bh-button gains `href`: set, it renders <a> with the identical .btn classes; unset, the
  <button> is unchanged. Two consumers coming (Continue-with-Google on login + signup), each
  today a hand-rolled anchor with ~10 duplicated CSS lines. routerLink support deliberately NOT
  added — no consumer for it in M13d.
  THE TRAP, AVOIDED RATHER THAN DEBUGGED: <ng-content /> projects ONCE, statically. Two @if
  branches each holding their own <ng-content /> leaves one silently EMPTY. Template declares it
  once in <ng-template #body> and renders it per branch via ngTemplateOutlet.
  WORTH KEEPING, from the reviewer: projection resolves by TEMPLATE ORDER, not by which branch is
  active. The anchor branch is written first, so a regression to duplicated <ng-content /> would
  starve the SECOND one — the ordinary <button> — and the `PlainHost` half of the "projects its
  content in BOTH modes" spec is exactly what fails. The negative control points the right way.
  No new CSS beyond `a.btn { text-decoration: none; }`: :disabled never matches <a>, so the
  existing :not(:disabled) hover/active rules apply naturally and the disabled/busy rules
  naturally never fire. 254/254. Production build clean — which is what proves all 32 existing
  bh-button call sites still compile.

Task 3: complete (commits 19fa905..6ddc6d4, review clean after one fix — spec PASS, quality PASS)
  bh-auth-layout: one markup tree, layout switched by CSS on [data-variant]. split (panel beside
  the form above 720px) for the four screens a stranger arrives at from outside; narrow for the
  six mid-flow ones. Panel content renders in BOTH variants — base CSS is column with .panel
  before .body in DOM order, so it needs no override to sit above the form; only split's desktop
  reflow is an addition. 259/259, build clean, four ui/ greps empty.

  ESCALATION #2, AND THE ORCHESTRATOR'S BRIEF WAS WRONG AGAIN: the brief named three files. A
  NINETEENTH ui/ component cannot avoid a fourth — dev-gallery.page.spec.ts asserts an EXHAUSTIVE
  sorted list of gallery sections, so it fails until the new section is declared. That is the
  gallery-is-the-contract rule being enforceable rather than aspirational. Executor stopped instead
  of editing an unauthorized file; orchestrator verified the list and authorized it.

  IMPORTANT REVIEW FINDING, FIXED IN 6ddc6d4 — A TEST THAT COULD NOT FAIL, THE THIRD OF ITS KIND
  IN THIS REPO (after M11's conformance sweep and M13b's font guard): the spec named "renders the
  wordmark once, NOT ONCE PER VARIANT BRANCH" cannot detect that. @if/@else are mutually
  exclusive, so a component rewritten with duplicated per-branch markup still renders exactly one
  <main> and one <bh-wordmark> — both counts are invariant across the wanted AND the unwanted
  implementation. Inherited verbatim from the orchestrator's brief.
  The fix was the CLAIM, not the assertion, and that reasoning is worth carrying: single-markup-
  tree is a MAINTAINABILITY property and no behavioural test can see it. Inventing a cleverer
  assertion would have manufactured false confidence. Both tests keep real value — two <main>s is
  a broken landmark structure, two wordmarks duplicate the accessible name, which is the exact bug
  M13b shipped as "rxedrxed". The spec file now states in a comment what the tests do and do not
  protect.
  MINOR, also fixed: the shared .wrap rule's comment said narrow "needs no rules at all" while
  that rule is load-bearing for it; redundant align-items:stretch (the flexbox default) dropped.
  NOT DEFECTS — two errors in the ORCHESTRATOR'S REVIEW BRIEF, caught by the reviewer: (a) it said
  the component may render no volt at all, but <bh-wordmark variant="hero"> fills volt behind
  "ed", and spec §2.3/§3 explicitly decide that the brand highlighter is not an accent and is
  rendered in both variants; (b) its permitted-px inventory omitted max-width 420px, which is this
  codebase's existing form-column width (box-picker, settings, subscriptions, box-stripe).

Task 4: complete (commit c23c6b8, orchestrator-implemented — one CSS rule is trivial glue, and
  the plan makes the verification sweep the orchestrator's job explicitly)
  `a { color: var(--volt) }` -> `color: var(--bone); text-decoration: underline`. The underline is
  load-bearing: dropping colour as the affordance without replacing it trades a design-law bug for
  a WCAG 1.4.1 one.
  PROVEN ON THE SCREEN THE CRITIQUE MEASURED: login went from FOUR volt elements to ONE (the Log
  in button). Measured in a real browser via computed styles, not by eye — note the two volt hits
  the audit reports on login are ONE element counted twice, the bh-button host plus its inner
  <button>.
  THE SWEEP EARNED ITS KEEP, AND FOUND THE INVERSE OF WHAT THE PLAN PREDICTED. The plan said to
  watch for "a link only findable because it was volt". The actual regression was NAVIGATION
  READING AS PROSE: admin side-nav items and half the dock came back underlined, while the half
  carrying a local `text-decoration: none` did not — so the shells were inconsistently underlined,
  across ~40 screens. Fixed with ONE structural rule, `nav a { text-decoration: none; }`: both the
  admin side nav (admin-shell.page.ts:30) and bh-dock (dock.component.ts:22) render a real <nav>,
  so it scopes correctly WITHOUT editing screens M15/M16 own. Re-measured after: zero underlined
  nav items on admin, athlete and coach.
  A CLAIM I MADE AND WITHDREW, recorded so it is not re-derived: I first read
  shell-header.component.ts:47 (`.acts a:hover { color: var(--bone) }`) as a hover affordance
  killed by the new base colour. Reading four lines up, :44-46 already sets `.acts a { color:
  var(--faint); text-decoration: none }` locally, so that faint->bone hover is untouched. Grepping
  one line and reasoning from it nearly produced a fix for a non-bug.
  BLAST RADIUS MEASURED, smaller than filed: 33 files contain an anchor, not the "~40 screens"
  the backlog estimated.
  FILED, NOT FIXED: dashboard.page.ts:140 `.s-body a { color: var(--bone) }` is now redundant —
  a screen that had already compensated locally. Harmless (same value), M16 owns it.
  DATA FOR TASK 18's OPEN QUESTION: account/security currently renders TWO volt-filled buttons
  ("Change password", "Change email"). The plan flags the volt budget there as a Step B question
  for the user; this is the measurement behind it.
  ALSO: `docker compose -f docker/docker-compose.yml` from inside frontend/ exits 1 on a relative
  path. Bash cwd persists between calls in this harness. Caught only because the exit code was
  checked — otherwise the next measurement would have run against a STALE IMAGE, which is exactly
  how M13c's e2e once reported 28 passed.

Task 5: complete (commits 561f065..49468ea, review clean after one fix — spec PASS, quality PASS)
  Accept-Language now reaches the self-serve box owner: AuthController.signupBox ->
  BoxSignupService.signup -> BoxSignupTx.createOwnerAndBox -> RegisterTx.insertUser. Reuses the
  existing primaryLanguageTag() rather than writing a second parser. 430/0/0.
  ESCALATION #3, AND THE ORCHESTRATOR'S BRIEF WAS WRONG A THIRD TIME: the brief named three
  production files and forgot that CHANGING A SIGNATURE MOVES ITS CALLERS. BoxSignupRetryTest is a
  Mockito unit test calling both changed signatures — two service.signup(...) and four
  tx.createOwnerAndBox(...) stubs/verifies — so test-compile failed with 6 errors. Authorized as
  ARITY ONLY: a 7th any(), and null as the 5th signup argument. That test pins the retry BOUND
  (3-attempt dive, SIGNUP_RETRY 503) and not one times()/never()/assertion moved.
  null rather than "en" on purpose: null is what a header-less request actually produces, and
  hardcoding "en" would assert a value that test has no opinion about.
  IMPORTANT REVIEW FINDING, FIXED IN 49468ea — THE SECOND TEST-THAT-CANNOT-FAIL THIS MILESTONE:
  selfServeOwnerFallsBackToEnglishWithNoHeader passed against the OLD code too. Old path:
  insertUser(..., "en") hardcoded -> "en". New path: no header -> null -> RegisterTx:42 maps to
  "en". Both produce "en", so it cannot discriminate the defect at all; only
  selfServeOwnerGetsTheBrowsersLanguage does. The test body was the orchestrator's brief verbatim.
  KEPT rather than deleted — it genuinely pins that threading a parameter through three files did
  not break the header-less default — but RENAMED to
  headerlessSignupStillDefaultsToEnglishAfterTheLocaleRefactor with a comment stating what it does
  not prove. Same resolution as Task 3's wordmark count: FIX THE CLAIM, NOT THE ASSERTION.
  Reviewer also noted the null 5th arg in BoxSignupRetryTest is inert plumbing — tx is a mock, so
  RegisterTx's fallback is never actually reached there. True; it satisfies arity and nothing more.
  Clean on the high-risk axes: no tenancy change, no transaction-boundary move, no mail/audit
  ordering change, AuthzConformanceTest untouched, no Flyway. Next migration stays V19.

Task 6: complete (commits b5790b1..4c5d326, review clean — spec PASS, quality PASS)
  AppUrls gains appPath() = base + path (a PATH, not an absolute URL: the frontend prepends
  location.origin, so appLink() there would render origin+origin). InviteAdminController returns
  appPath("/join/"+token) so the copied admin link lands directly instead of via a 301. Line 75's
  mailer.link() was already correct and is untouched. 432/0/0.
  TEN FILES, FROM A BRIEF THAT NAMED TWO. This was the worst brief of the milestone and the gap
  was found in three stages:
   - PRE-DISPATCH (orchestrator grepped for dependents first, having learned from Tasks 3 and 5):
     SIX test files parse this field as link.substring("/join/".length()), which silently yields a
     CORRUPTED token the moment the prefix changes — "/app/join/T".substring(6) is "oin/T", not a
     token. Corrected to 8 files before dispatch.
   - THE SUITE FOUND TWO MORE, which no grep of mine would have: LogHygieneTest:225's extraction
     regex hardcoded "link":"/join/, and InviteAdminApiTest:44's Mailer stub.
  Token extraction became link.substring(link.lastIndexOf('/') + 1) rather than hardcoding
  "/app/join/": the app base is CONFIGURABLE and AppUrlsTest proves an empty base is supported, so
  six tests pinned to one config value would be wrong. Reviewer verified this is unambiguous —
  invite tokens are Base64.getUrlEncoder().withoutPadding(), which never emits '/'.
  A MOCK THAT HAD BEEN LYING SINCE THE /app MOVE: InviteAdminApiTest:44 stubbed mailer.link(path)
  as origin + path, while real Mailer.link -> AppUrls.appLink is origin + BASE + path. It never
  mattered because both strings happened to share the /join/ substring. FIXED THE MOCK, NOT THE
  ASSERTION IT BROKE: :113 asserts the mailed link contains the response link, and it guards the
  M8 incident where three emailed links shipped pointing at routes that did not exist. In
  production the assertion still holds — appLink (origin+base+path) always contains appPath
  (base+path) as a suffix. A test that passes only because a mock is unfaithful is the same family
  as the two tests-that-cannot-fail already found this milestone.
  LogHygieneTest's regex is prefix-tolerant now ([^"]*?/join/) rather than weakened to match any
  link: reviewer traced the backtracking by hand and confirmed the /join/ anchor still forces a
  real match, so its doesNotContain("{") vacuous-pass guard still fires.
  MINOR, no action: the executor widened an existing assertion (startsWith("/join/") ->
  startsWith("/app/join/")) instead of adding the new test the brief asked for. Coverage-identical
  and leaner than a near-duplicate test; recorded because the report did not flag it as a
  deviation.

ORCHESTRATOR PATTERN, WORTH CARRYING INTO M14+: four of six briefs were incomplete, always the
same way — LISTING THE FILES A CHANGE *IS*, NOT THE FILES THAT *DEPEND ON IT*. Task 3 (a 19th ui/
component cannot avoid the gallery's exhaustive-list test), Task 5 (a signature change moves its
Mockito callers), Task 6 twice. Every one was caught by an executor stopping. Grepping for
dependents BEFORE writing the brief turned Task 6's first gap from an escalation into a correction
shipped with the brief; do that by default.

Task 7: complete (Phase 1 checkpoint, orchestrator-run — a gate task, no implementation)
  frontend 259/259 · production build exit 0 with ZERO budget warnings · backend 432/0/0 ·
  e2e 35 passed + 1 skipped at retries:0 on a `down -v` REBUILT stack · all four ui/ standing
  greps empty · legacy form-class count still 53 (correct — Phase 2 does that work) · Phase 2's
  own targets still 21 legacy classes and 11 Eager pins across the eleven screens, untouched.
  The 1 skip is the quarantined TV/SSE defect (Project 2). Not investigated, per scope.
  PLAN CORRECTED, MEASURED NOT ASSUMED: backend is 432, not the 431 the plan predicted — Task 6
  added TWO AppUrls cases (base-prefixed and empty-base).
  PLAN CORRECTED AGAIN — CI: step 5 said "push and check CI". `.github/workflows/ci.yml` triggers
  on `push: branches: [main]` and on `pull_request`, so pushing a FEATURE BRANCH queues NOTHING.
  Zero runs here is correct and is NOT the silent-drop failure the hand-off documents — that one
  was a push TO MAIN producing no run. This branch gets Linux CI only at PR or merge (Task 21).
  ENVIRONMENT TRAP, HIT THREE TIMES IN ONE SESSION, WORTH PROMOTING: **Bash cwd PERSISTS between
  tool calls in this harness.** It produced (1) a whole gate block reporting zero matches because
  `grep -rn pat $D` got one nonexistent path, (2) `docker compose -f docker/docker-compose.yml`
  exiting 1 on a relative path from inside frontend/ — which would have left the next browser
  measurement running against a STALE IMAGE, exactly M13c's e2e mistake — and (3) `ls graphify-out`
  reporting "No such file" from inside backend/ when it exists at the root and is gitignored.
  Every one looked like a real finding. Prefix gate commands with an absolute `cd`.

Task 8 — login: BUILT AND REVIEWED, **NOT CLOSED** (commits d6b65f9..ad954e5)
  655026e build · 30a07ad review fixes · ad954e5 card layout + a real bug fix. 271/271, prod build
  clean, hex gate empty.
  SHAPED WITH THE USER FIRST, which is the half of design law §16 no milestone had ever run: three
  question rounds via /impeccable shape, brief at .superpowers/sdd/task-8-shape.md. Panel copy
  "Rx · as prescribed / Today's board is already up.", Google icon-only, "Create a box account"
  DROPPED because it routes to a signup that dead-ends (verified: that account lands on the box
  picker reading "No memberships yet").
  THE LIBRARY COULD NOT ANSWER THE QUESTION IT WAS ASKED. User asked for evidence from
  docs/design-md/ on login-form conventions. Measured across all 74 systems: ZERO mention "forgot
  password", exactly ONE mentions login forms (wired, only that its corners are square). They are
  marketing-site extractions — input STYLING, not auth-form COMPOSITION. Decided instead from
  convention among the tools product.md names as the bar. Worth knowing before anyone else plans to
  mine that library for product-UI rules.
  TWO IMPORTANT REVIEW FINDINGS, BOTH MEASURED IN A BROWSER, BOTH FIXED IN 30a07ad:
   - `Forgot?` was positioned absolutely over bh-field (no label-row slot existed). At 320px with
     Spanish strings at 200% TEXT RESIZE: 139px OVERLAP, both strings unreadable — a WCAG 1.4.4 AA
     failure, which design law §11 makes binding. Fixed properly: bh-field gained an optional
     projected label-row action slot laid out with FLEXBOX, so overlap is impossible BY
     CONSTRUCTION rather than by tuning. Overlap now 0.
   - data-testid="login-google" landed on the bh-button HOST, not the inner <a>. bh-field,
     bh-select and bh-data-table all got a testId input in M13c; bh-button never did. It only
     worked by accident of href being a static attribute. bh-button now has testId, bound on BOTH
     the button and anchor branches.
  A REAL LAYOUT BUG THE USER CAUGHT BY EYE, ORCHESTRATOR'S OWN, FROM TASK 3: at 1440 the split
  panel started at x=208 with 208px of dead ground each side. Cause — `.wrap` set
  `justify-content: center` for the COLUMN axis; the >=720px block flipped flex-direction to row
  and re-declared everything EXCEPT justify-content, which then centred on the HORIZONTAL axis.
  THE STRUCTURAL LESSON: the centring and the axis-flip were on the same element. Fixed by moving
  the direction onto a new inner `.card`, so `.wrap` no longer owns a direction to flip and the
  bug cannot recur. Regression spec added that fails against the pre-fix markup.
  DESIGN CHANGE, user-chosen from two live-rendered options: the split is now a BOUNDED CARD
  (760px, min-height 480, hairline + --r-card, panel 46% in --surface, no dividing rule) rather
  than a full-height slab. min-height NOT height, so login's tallest state (alert + resend + resend
  error) grows instead of clipping.
  CSP CONFIRMED WORKING, incidentally: injecting a <style> element to probe layout was REFUSED —
  style-src is 'self' + nonce. Had to drive the CSSOM instead.
  ** STILL OWED: /impeccable critique. All three critique agents died on "You've hit your session
  limit · resets 8pm (Europe/Rome)". The screen has had a CODE review, not a DESIGN critique, so
  per the per-screen cycle Task 8 is NOT done. Re-run before Task 9. **

Task 8 — login panel, four user-driven iterations after the first build (19d3c79, 564f84f, 8c3c87c):
  The user reviewed the rendered screen four times and each round found something real. Recorded
  because it is the argument FOR the shape-then-look cycle, not against it.
  1. "at full screen the vertical separation is ugly" -> exposed a REAL BUG, orchestrator's own from
     Task 3: `.wrap` set justify-content:center for the COLUMN axis; the >=720px block flipped
     flex-direction to row and re-declared everything EXCEPT justify-content, which then centred
     HORIZONTALLY — 208px of dead ground each side. Structural fix: centring and axis-flip were on
     the SAME element; the direction moved to a new inner `.card`, so `.wrap` owns no direction to
     flip. Regression spec added that fails against the pre-fix markup.
  2. Split became a BOUNDED CARD (760 wide, min-height 480 — min-height NOT height, so login's
     tallest state grows instead of clipping).
  3. "on the left is a little empty" -> a random seeded benchmark, typed like a board. Chosen over a
     fabricated sample because Fran et al are REAL public benchmarks this product already ships
     (V5 seeds 15). Hardcoded, NOT fetched: login is unauthenticated, so an endpoint would be a new
     public route needing an AuthzConformanceTest entry, and a decorative fetch would owe
     loading/error/empty states under design law §11.6.
     EXECUTOR'S REPORT WAS WRONG AND MEASURING CAUGHT IT: it claimed "the void reads as gone". It
     had MOVED — 181px gap under the wordmark, measured. Cause was two things stacking: login
     projected ONE <div panel> holding both blocks, and the layout wrapped the slot in .panel-copy.
     Either alone collapses the panel to two flex children so space-between has nothing to
     distribute. Fixed both; gaps became 107 and 146.
  4. "still pretty empty, maybe 2 wod" -> TWO distinct benchmarks with a hairline rule, DESKTOP
     ONLY. Hidden below 720px because the panel stacks ABOVE the form on phone and boards would
     push Log in down, against "thirty seconds, one thumb". Verified at 375x812: board display:none,
     Log in at y=489-533, page scrollHeight == viewport, no scrolling to reach the primary action.
     Offered a third option (a realistic strength+metcon board) and argued against it in the same
     breath: it is the only one that would have INVENTED programming, giving up the
     nothing-is-fabricated property that made a board defensible on a login screen at all.
  SELF-INFLICTED, worth remembering: an HTML comment I wrote inside the Angular template contained
  a BACKTICK, which terminated the TypeScript template literal — build failed with TS1005. Caught by
  the build in seconds. Never put a backtick in a component template comment.
  272/272, prod build clean, hex gate empty, gallery's auth-layout section verified unaffected.
  ** STILL OWED, UNCHANGED: /impeccable critique on login. Every critique agent died on the session
  limit. The panel has changed substantially four times since, so re-running earlier would have been
  wasted — but Task 8 does NOT close until it runs. **

Task 8 — CRITIQUE RUN AT LAST, AND IT FOUND A P0 (fix 80e84f7). Score 22/40.
  ** THE MILESTONE'S MOST EXPENSIVE ERROR, AND IT WAS THE ORCHESTRATOR'S SPEC. **
  `(ngSubmit)` is an OUTPUT OF THE NgForm DIRECTIVE, which ships with FormsModule. Spec §4 told every
  screen to drop FormsModule AND keep `<form (ngSubmit)>`. Incompatible: with no NgForm the binding
  listens for an event the browser never fires, Angular never intercepts, and the form does a NATIVE
  GET. On login the button did not authenticate and THE PASSWORD WENT INTO THE URL — browser
  history, access logs, Referer headers.
  Reproduced by the orchestrator before acting: attach a submit listener, click the button,
  `event.defaultPrevented === false`. Confirmed, not suspected.
  §4.1 had spotted that NgForm supplies `novalidate` and MISSED that it also supplies `(ngSubmit)`.
  Half the trap found, half shipped.
  FOUR LAYERS OF DEFENCE FAILED IN ORDER, and each is worth keeping:
   1. The spec was wrong; every remaining screen would have inherited it.
   2. 272 GREEN KARMA SPECS DID NOT SEE IT. login.page.spec.ts called cmp.submit() DIRECTLY six
      times and never dispatched a real DOM submit — it tested the handler, never the wiring. This
      is the third test-that-could-not-fail this milestone, and the worst.
   3. e2e WOULD have caught it in seconds (login.spec fills, clicks submit, waits for the URL to
      leave /auth/login) — but Task 8's brief said "I will run e2e myself" and then nobody did.
   4. The design critique found it in one click, on the live screen. THIS IS THE ARGUMENT FOR THE
      PER-SCREEN CYCLE. Had login been the first of eleven screens built and critiqued only at the
      end, all eleven would have shipped dead forms with credentials in the URL.
  CONTAINMENT VERIFIED, not assumed: the other six auth screens still pair FormsModule WITH
  (ngSubmit), so they work. Only login was rebuilt under the new contract, so only login broke.
  ALSO FIXED (P1, WCAG 2.4.11 AA): the primary button's focus ring was INVISIBLE. --focus-inv is
  #0d110e === --ground, and a POSITIVE outline-offset drew the ring OUTSIDE the volt button onto
  that same ground. 1:1 contrast. The token exists for "a ring on a volt surface" but the offset
  put it off the volt surface — the inversion was applied against the wrong thing. Fixed with a
  negative offset on the primary variant so the ring sits ON the volt. Affected all 32 bh-button
  call sites since M13c.
  SPEC AND PLAN CORRECTED so Tasks 9-18 cannot repeat it: new §4.2 gives the corrected contract
  (`<form (submit)="submit($event)" novalidate>` + `event.preventDefault()`), a new per-screen gate
  5b greps for `ngSubmit`, and Step D of the cycle now REQUIRES an e2e run per screen.
  e2e: first run showed 2 failures (runner, tracking) on a dirty stack; on a `down -v` rebuild,
  35 passed + 1 skipped. Verified rather than assumed in either direction — the documented
  non-idempotency, not the diff.
  274/274 Karma, prod build clean, hex gate empty.
  P2s left open and NOT blocking: google_email_unverified gives no next step; --faint on --surface
  measures 4.70:1 (clears AA by 0.2 — the token doc's 5.1:1 is against --ground, not --surface).
  UNVERIFIED, honestly flagged by the critique: half the ten states could not be driven because the
  P0 blocked the only path to them. Re-check them first, next session.

Task 8 — CRITIQUE RE-RUN AFTER THE FIXES: **36/40, no open P0/P1 — §16 gate CLEARED.**
  Trend for this screen: 22 -> 36. The +14 is not a "looks better" bump: the reviewer reproduced
  the OLD P0 failure path and confirmed it is gone (POST /api/auth/login fires, URL stays clean,
  full login reaches the dashboard), and confirmed the focus ring now sits inset on the volt under
  a real keyboard Tab. Heuristics 1 and 9 had been floored at 0 and 1 purely because the task was
  uncompletable; they are 3-4 now because it completes AND recovers.
  Also drove the states the first pass could not reach at all (wrong password, EMAIL_NOT_VERIFIED
  + resend + its error) — the first pass refused to score them from source, which was the right
  call and is why the second pass is worth more than a re-read.
  NEW P2, AND IT IS A REAL WCAG AA FAILURE, SYSTEMIC: `--faint` placeholder text on `--surface-2`
  measures 4.27:1, UNDER the 4.5:1 floor. field.component.ts sets `.input { background:
  var(--surface-2) }` and `.input::placeholder { color: var(--faint) }`. Affects EVERY bh-field
  placeholder in the product, not just login. It hid because the token's documented 5.1:1 is
  measured against --ground and NOTHING renders a placeholder on --ground.
  P2 carried over, unchanged: --faint on --surface (the benchmark board) re-measured 4.699:1 —
  passes AA with no headroom; google_email_unverified still offers no next step, now more glaring
  because the sibling EMAIL_NOT_VERIFIED branch on the same screen demonstrates a good one.
  STILL UNVERIFIED, flagged rather than assumed: the pending spinner (local backend answers in
  <20ms, faster than the poll), 429 copy (25 rapid POSTs never tripped the dev limit), the
  box-unavailable 403 arm (no seeded suspended box), and the Google-absent state (providers always
  returns true in this env).

  AA PLACEHOLDER FIX (4c3f6e5), taken rather than filed because it was systemic and cheap:
  bh-field and bh-search-bar placeholders moved --faint -> --bone-dim (an existing token; the
  --faint token itself was NOT touched, since it is used widely on --ground/--surface where it is
  fine, and changing it would repaint the product). Measured by the orchestrator, not just the
  executor: 4.27:1 -> 7.17:1 against --surface-2, with entered text at 14.46:1 — so the placeholder
  still reads as clearly secondary rather than as content, which is the failure mode a naive
  "make it brighter" fix would have introduced. bh-select has no ::placeholder and was correctly
  left alone.
  THE GENERAL LESSON, worth more than the fix: the token file documents --faint at 5.1:1, measured
  against --ground. Placeholders sit on the INSET --surface-2, which is lighter, so the real ratio
  was lower and nothing in the docs would ever have shown it. MEASURE CONTRAST AGAINST THE SURFACE
  THE TEXT ACTUALLY SITS ON, never against --ground by default. --faint on --surface is already at
  4.699:1 with no headroom, so this token is being used near its limit in more than one place.
  274/274, build clean, hex gate empty.

TASK 8 (login) IS CLOSED: shaped with the user, built, code-reviewed, four user-driven design
iterations, critiqued 22 -> 36/40 with no open P0/P1, e2e 35 passed + 1 skipped on a down -v stack.

Tasks 9 + 10 (signup, start-box) COMPLETE — critiqued twice each, gate cleared.
  signup 29 -> 34/40 · start-box 30 -> 35/40 · zero P0/P1 on either (login reference: 36/40).
  Karma 291 · backend 435 · e2e 35 passed + 1 skipped on a down -v stack · build clean.
  BATCHING TWO SCREENS PAID OFF EXACTLY WHERE PREDICTED: the short-password defect scored as a
  separate P1 on each screen but was ONE backend cause, and the reviewer named it systemic rather
  than reporting it twice.
  SIX P1s FIXED:
   1. SIGNUP'S PANEL COPY WAS FALSE, AND IT WAS THE ORCHESTRATOR'S. "Your box invited you" on a page
      that reads no invite token — the real invite flow is /join/:token, a different page with its
      own correct copy — and it contradicted the invite note four lines below. The premise ("most
      people reach signup from an invite email") was asserted during shaping and never checked.
      Now "Create your account" / "Join your gym on rxed."
   2. Start-box's mid-submit flip was SILENT: four filled fields became a two-field waitlist form
      with no explanation, no aria-live, focus reset to <body>, and copy identical to a cold load.
      Now a warn bh-alert that explains it, preserves box name + email, and moves focus — AND a cold
      load into waitlist mode shows NO notice. Both directions verified; the distinction is the
      point, since an "alert exists" test would pass with the bug reintroduced.
   3. Waitlist success was a dead end — zero focusable elements. Now offers Back to login.
   4-6. Short password showed "Something went wrong" on both screens. FOUR DTOs duplicated
      @Size(min=10) on password (register, signup-box, reset, change-password), firing before
      PasswordPolicy and making PASSWORD_TOO_SHORT unreachable everywhere. Removed; the policy now
      owns the minimum. THE EXECUTOR PROVED PasswordPolicy ACTUALLY RUNS ON ALL FOUR PATHS BEFORE
      REMOVING ANYTHING — without that check this would have deleted the only length enforcement.
      Backend 432 -> 435.
  ALSO FIXED EN ROUTE: bh-field derives the error node's hook as <testId>-error (signup had been
  forced to hang it on the HOST, which spans label+input+error — the trap CLAUDE.md records as
  costing M13c four fixes); bh-benchmark-board extracted to ui/ with four consumers.
  AN E2E-ONLY REGRESSION, INVISIBLE TO KARMA: Task 8 moved bh-button's testid onto the inner
  <button>, and three spec files defined btn() as `[data-testid=X] button` — which then matched
  nothing and hung the signup journey. Karma was green throughout. Helper now matches both
  placements. TWO intermediate attempts failed before this one, and each verdict was only trusted
  after a `down -v` rebuild.
  ORCHESTRATOR ERROR WORTH RECORDING: five files were left UNCOMMITTED while a subagent was
  dispatched. The executor spotted them and had staged only its own, so nothing was swallowed — but
  that is precisely how M13b's "docs" commit ate 89 lines of TypeScript.
  NEW P2, not blocking, not a regression: start-box's error mode has no exit but Retry.
  STILL UNVERIFIED on both, flagged rather than assumed: the pending spinners (local backend
  answers in <20ms, faster than any poll) and SIGNUP_RETRY.
  Signup's User Control heuristic is held at 2 by the BOX-PICKER dead end (zero focusable elements
  for a 0-membership account) — a different file, already scoped as Task 12. Expect signup to rise
  when that lands.

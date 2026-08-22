# rxed v1.0 — the pilot program

**Date:** 2026-08-22 · **Status:** approved in conversation, decisions user-stated
**Supersedes the ordering in:** `2026-08-18-v3-roadmap-platform-expansion.md` (its *reasoning* still
stands; its phase order and its placement of the beta do not).

---

## 1. The decision that reframes everything

**The pilot IS v1.0.** Not a minimum viable slice, not a subset — a complete, finished product that a
CrossFit box runs its entire operation on.

The release shape that follows from it:

| Release | What it is |
|---|---|
| **v1.0** | Everything built and present. The pilot box tests **everything**. |
| **v1.0.1** | Bug fixes found by the pilot. |
| **v1.1.0** | Features the pilot box asks for, plus what v1.0 deliberately deferred. |

**Built ≠ exercised.** Stripe is wired, tested and working in v1.0, but no money flows during the
pilot because the pilot is free. The box keeps its existing payment method. The same holds for
anything else the pilot happens not to use: **it must still be there and still work.** A feature the
box cannot try is a feature the pilot cannot evaluate.

This overturns the instinct to scope a pilot down to essentials. **The scope-down was rejected
deliberately** — a partial product tests a partial thesis, and the box cannot tell you whether it
would switch based on software it was not shown.

## 2. What the pilot is

**One friendly box, free, real usage.** Real classes, real members, real coaches, real data. Not
billing through rxed during the pilot, and not running alongside their old tool as a shadow — rxed is
what they use.

Consequences:

- **Commerce is built but idle.** Stripe, receipts, POS, family payments all ship and all work.
- **Real PII, real people.** So deployment hardening, backups, TLS and working auth mail are hard
  blockers regardless of no money moving.
- **Waivers still ship.** The pilot box already holds signed waivers elsewhere, so it is not a *pilot*
  blocker — but it is a blocker for the second box, who onboards from nothing, and v1.0 means built.

## 3. The Room is in the pilot, rebuilt

**User-stated, and it reverses two decisions in the v3 roadmap.**

The v3 roadmap walled The Room (class runner, check-in, TV whiteboard) behind an "in development"
gate during the beta, and placed Project 2 *after* the beta on the reasoning that the beta supplies
its field research.

**Both are overturned.** The Room ships in the pilot, fully rebuilt, before it.

**Why the reversal is right:** the class runner and the TV whiteboard are differentiators **#1 and
#2** in `docs/POSITIONING.md`. A pilot that hides them tests a scheduling app, not rxed — and per the
user, *"without it we can't convince some boxes to test it."* The Room is what gets a box in the door.

**What it costs, stated plainly:** Project 2 is the largest single item on the roadmap, and it now
runs without the field research it was sequenced to receive. That is a real trade, accepted
knowingly, not an oversight.

## 4. Pricing — one tier, everything, €99/month

**User-stated 2026-08-22.** One tier at launch. No Essentials/Accelerate/Ultimate. No add-ons. No
metering. Maximum **€99/month**, and it includes all of rxed.

**Why this is a strong position and not just a cheap one:** Wodify gates **Performance Tracking to
Ultimate**, its top tier. A box paying Wodify $99 gets billing, scheduling, waivers and messaging —
**no WOD tracking, no leaderboards, no benchmarks.** The thing Wodify is named for is an upsell.

So at the same price we are not competing with Wodify Essentials; we are competing with Wodify
Ultimate on the only axis a CrossFit box cares about.

**Never discount below €99 to win a deal.** Wodify's $199→$99 "for life" offer means their real
number is $199 and they are buying share. Matching a discount funds their product with our margin.

**Metering is their weakness, not their strength** — "2 automations / 15 automations / unlimited", AI
credits, add-ons for the headline feature. One tier, everything, is a categorically different promise,
and it is cheap for us to keep because we do not carry POS-heavy retail, a CRM suite, a website
builder or AI.

## 5. Feature gap against Wodify — the full inventory and its resolution

Checked against Wodify's published tiers on 2026-08-22. **Excluded by decision: anything AI
(Ask Wodify AI, MCP access) and the per-gym custom website builder.**

| Gap | Wodify tier | Resolution |
|---|---|---|
| In-app messaging + inbox | Essentials | **M29** |
| Digital waivers & contracts | Essentials | **M30** |
| POS / mobile retail / add-to-invoice | Essentials | **M16** |
| Weekly streaks | Essentials | **M17** |
| Task & process automation | Essentials | **M32** |
| Staff payroll calculator | Essentials | **M16** |
| Pre-built reports | Essentials | **Analytics brief** → M15 / M16 / M18 |
| Connected domains & sending email | Essentials | **M28** |
| Lead management + conversion board | Accelerate | **M32** |
| Family groups & shared payments | Accelerate | **M16** |
| Insights dashboards + at-risk | Accelerate | **Analytics brief** → M15 / M16 |
| Email/SMS campaigns + templates | Accelerate | **M32** |
| Texting (SMS) | Accelerate | **M29** |
| On-demand media library | Accelerate | **Deferred — see §7** |
| Custom branding | Accelerate | **M15** — logo + name only, see §6 |
| Custom report builder | Ultimate | **v1.1 — see §7** |
| API access | Ultimate | **Cut** |
| Heart rate tracking | Add-on | **Cut** |
| 24/7 door access control | Add-on | **Cut** |
| **Performance tracking** | **Ultimate** | ✅ **Already ours, and better** |

## 6. Custom branding is logo and name only — the design law holds

**User-stated.** A gym gets its logo and its name. **Colours and style stay rxed.**

This was a genuine conflict: per-gym accent colours would break two binding rules in `CLAUDE.md` —
dark-only, and `--volt` as the single accent meaning live/now/primary/winning. **The design law was
not re-opened.** Most of what this needs already exists (`boxes.logo_url`, box name), so M15's gym
settings finishes it rather than starting it.

## 7. Deliberately deferred, each with a trigger

Not "cut" — deferred, with the condition that reopens them written down.

| Item | Trigger |
|---|---|
| **On-demand media library** | Video hosting is real storage cost, and `docs/VPS-DEPLOYMENT.md` already flags storage limits. **Reopens when rxed earns enough to upgrade the server.** |
| **Custom report builder** | v1.1. v1.0 ships pre-built reports covering LEG, ARM, attendance and revenue; a query-builder UI is a large, low-payoff surface for a pilot. |
| **API access, heart rate tracking, 24/7 door access** | Cut from v1.0. Door access needs hardware partnerships (Kisi, Brivo, Openpath), which is commercial work, not code. |

## 8. The five new milestones

Seven were proposed; **two folded into existing milestones and two were deleted outright** — then
**M33 was added on 2026-08-22** when member import was found missing. What remains is genuinely new
subsystems, not screens that belong to an existing surface.

*(Label note: M31 and M34 are dead — the commerce-completeness and integrations milestones that
briefly held them folded into M16 and were cut. **M33's label was reassigned** from the dissolved
insights milestone to data import. Nothing shipped under any of those labels, so nothing is
ambiguous in git.)*

### M28 — Launch → Production

**Its scope was written in July and deferred on purpose.** `2026-07-28-m12c-production-readiness-design.md`
explicitly names the bullet it left behind: *TLS/HSTS, domain, firewall, SSH hardening, Postgres
backups + restore drill, secrets delivery, log retention, CI deploy on green.* Add to it: **real SMTP
with SPF/DKIM/DMARC**, error monitoring and uptime, `BOXHUB_COOKIE_SECURE=true`, ToS/privacy/DPA (EU
PII), rate limits measured against a class-opening rush, and deleting `/app/dev/components`.

**No overlap with M12c** — compose env files, OAuth nginx locations and log PII masking are already
done.

**It goes FIRST.** It has been raised unowned at three consecutive milestone closes; last means a
fourth. And once it lands, every milestone after it is deployable and viewable on a real device on a
real domain, which is worth a great deal for design work. The "hardening a moving target" objection
does not apply — mail, TLS, backups and monitoring do not change as screens change.

### M29 — messaging & notifications

One subsystem, because they share a delivery surface.

- **Staff ↔ member 1:1 threads, both directions.** Gym-to-specific-member, and coaches full chat with
  members. **No member↔member** — that is moderation, blocking and abuse reporting for a community
  that already lives in WhatsApp.
- **Announcements grown up** — segments (everyone, one class's roster, expiring members). The
  existing `Announcement` entity is the seed.
- **In-app notification inbox** with unread badges.
- **The events that feed it:** waitlist promotion, class cancelled, subscription expiring.
- **SMS channel** — build it; note it carries real per-message cost.

**Notifications are IN-APP ONLY. No email notifications** (user-stated). Auth mail (verification,
reset, invites) is unaffected and still requires M28's SMTP.

**Stated limitation, with its trigger:** an athlete who does not open the app misses a spot that opens
90 minutes before class. **Real push arrives with M27 (Capacitor)**, which is in v1.0 — so the gap
closes inside this release, but M29 ships before it.

**Ordered before M17**, so M17 consumes a notification system rather than designing one. The v3
roadmap's "M17 decides the notification strategy" is superseded: M29 decides it.

### M30 — waivers & agreements

Templates, e-signature at join, **versioning, and re-signature when terms change**. Admin sees signed
state per member; retention rules are explicit.

**Kept as its own milestone rather than split** across M23 (sign at join) and M15 (manage templates).
It is the one item on this list with legal consequence, and as a sub-item of a screen milestone it is
the thing that gets under-built.

### M32 — growth & automation

Lead management and a conversion board (trial → member), campaign builder with email/SMS templates,
the **automation rules engine** (trigger → condition → action), and at-risk client identification.

**Depends on M28** (mail that arrives) and **M29** (the channels to send through). **Not metered** —
Wodify sells 2 / 15 / unlimited automations by tier; we include them.

### M33 — data import & migration

**Added 2026-08-22 on the user's direction, and it is not a utility — it is a competitive weapon.**

**Performance history is the real switching cost for a CrossFit box.** An athlete with four years of
Fran times and lift PRs in Wodify resists a move harder than the owner does. Import that history and
the switching cost collapses — and rxed's benchmark-provenance model (§3 of POSITIONING.md) is one of
the few that can hold it faithfully rather than flattening it into notes.

**CSV-first with per-platform presets** (user-stated). The box exports from its old tool; we ship a
column-mapping importer with presets for **Wodify, PushPress, Zen Planner, TeamUp and Mindbody**,
plus a generic mapping for anything else.

**Why not APIs:** Wodify gates API access to its top tier and PushPress's is partner-gated, so a box
often *cannot* grant it even if willing. Each integration is also a separate build that breaks when a
vendor ships a change. CSV works with every platform including ones we have never seen. API
connectors are a v1.1 question, decided by demand, not assumed now.

**What must come across:**

| Data | Why it matters |
|---|---|
| People — name, email, phone, DOB, emergency contact, join date, status | The base. `join date` also seeds LEG. |
| Memberships / subscriptions + the plan catalogue | Continuity of billing state, even though the pilot does not bill. |
| **Attendance history** | LEG is computed from it. Without it every member looks new. |
| **Performance — WOD scores, benchmark results, lift PRs** | The switching cost. The strategic half of this milestone. |
| Waiver signed-state | Depends on **M30**; a box that cannot show a signed waiver has to re-collect them all. |
| Class types and recurring schedule | So the box does not rebuild its week by hand. |
| Payment history | Reporting continuity for ARM. |

**Non-negotiables:**

1. **Dry run → review → commit.** An import that half-applies and cannot be explained is worse than
   no import. Report per row: created, matched, skipped, rejected — with the reason.
2. **Idempotent and re-runnable.** A box will import twice. The second run must not duplicate anyone.
3. **Matching is explicit, never guessed.** Email is the natural key; collisions and blanks are
   surfaced for a human, not resolved silently.
4. **Tenancy.** Every write runs under the box's tenant. Bulk writes over `@TenantId` entities is
   exactly where `docs/TENANCY.md` failure modes appear — **native SQL needs a registered
   justification, and `runAsRoot` is never the answer on a request thread.**
5. **GDPR.** We import PII of people who never signed up with us. The **box is the controller, rxed
   is the processor** — the DPA from M28 must cover it, and this milestone must not be the first time
   anyone reads that sentence.

**Ordered after M30**, so waivers exist as an import target and every destination schema is final.

**This closes the gap §11 flagged as "flagged, not scoped".**

## 9. v1.0 — twenty milestones in order

| # | Milestone | Note |
|---|---|---|
| 1 | **M28** Launch → Production | Everything after is deployable |
| 2 | **M23** app entry & shells | |
| 3 | **M29** messaging & notifications | Before M17 by design |
| 4 | **M14b** schedule & classes surfaces | |
| 5 | **M14c** the builder | |
| 6 | **M17** athlete | + weekly streaks |
| 7 | **Analytics brief** | **Moved up** — see below |
| 8 | **M15** admin: people | + at-risk, LEG, branding (logo/name) |
| 9 | **M16** admin: commerce | + POS, family/shared payments, payroll, ARM, **the eight-limit plan UI** |
| 10 | **M30** waivers & agreements | |
| 11 | **M33** data import & migration | CSV-first; after M30 so every target schema is final |
| 12 | **M32** growth & automation | |
| 13 | **M24** discovery | |
| 14 | **M25** social | |
| 15 | **M26** coach reservation | |
| 16 | **Project 2 — The Room** | Runner, check-in, TV — rebuilt |
| 17 | **M18** superadmin | |
| 18 | **M27** Capacitor: iOS & Android | Brings real push |
| 19 | **M19** landing site | |
| 20 | **M20** 2FA | |
| → | **v1.0 → pilot** | |

**The analytics brief moves up, from Phase 3 to position 7.** Its job is to ask what each stats screen
must answer *and audit whether the data was ever recorded*. Running it after M15/M16 build dashboards
means discovering a missing column with the screen already built on top of it.

**M16 carries a debt M16a created:** eight plan limits shipped with **no UI to set them**. The legacy
plans screen exposes only the old weekly-limit select through the compatibility shim. M16 is where the
shim dies and the eight limits get a real editor. See `docs/BACKLOG.md`.

## 10. What this costs, stated once

**This roughly doubles the remaining roadmap** — twenty milestones instead of the nine a scoped-down
pilot would have needed. **The user chose it explicitly**, preferring to *"double the roadmap and
arrive ready."* Recorded here so the number is never a surprise later, and so nobody re-litigates it
mid-programme.

## 11. Open — decide at the milestone, not now

- **Wodify's "connected domains and emails"** — sending gym mail from the gym's own domain. Folded
  into M28 as a line item; how far it goes (full domain verification vs a reply-to) is M28's call.
- **SMS provider and cost model** — M29. Real per-message cost, and it is the one channel with a
  variable bill.
- ~~**Whether the pilot box's existing member data is imported**~~ — **RESOLVED 2026-08-22: it is
  M33**, CSV-first with per-platform presets. See §8.
- **Which platform presets ship in v1.0** — Wodify, PushPress, Zen Planner, TeamUp and Mindbody are
  named; whether all five ship or the pilot box's own platform ships first is M33's call.
- **API connectors** — v1.1 at the earliest, decided by demand rather than assumed.

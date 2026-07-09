# Product

## Register

product

## Platform

web

## Users

- **Athletes** (primary, phone-first): CrossFit box members. Context: in the gym, sweaty, one-handed, between sets, often on flaky gym wifi. Job: see today's WOD, log a score in under 30 seconds, book a class, check their PRs and the leaderboard. Mobile web is their app.
- **Coaches** (tablet/desktop + phone on the floor): program WODs onto a calendar, run classes, check rosters.
- **Box admins** (desktop): members, plans, invites, schedule, settings. Plumbing, not identity.

## Product Purpose

BoxHub is a multi-tenant CrossFit box platform: one product replacing the 3–5 tools a box stitches together (booking, programming, score tracking, whiteboard TV). Success for the athlete surface = the athlete reaches for it like a training app, not a website: today's WOD instantly, score logged in <30s, PRs feel earned and visible.

## Brand Personality

**Broadcast · heritage · earned.** The feel of race-day timing screens and a chalk-dusted gym wall, executed with modern product craft. Confident, physical, a little loud in the right moments (a PR), dead quiet everywhere else. Three words: **athletic, honest, sharp**.

Reference feel: **Whoop / Strava** (data-rich athletic dark UI — big numbers, charts as heroes, performance-tracker energy) and **Nike Training Club** (bold editorial sport — huge condensed type, campaign energy). Not their palettes; their conviction.

## Anti-references

- **Generic SaaS dashboard**: card grids, KPI tiles, cream/gray admin blandness. If a screen could be a CRM, it's wrong.
- **Web page that scrolls**: long document-like pages on mobile. Athlete screens are app screens — bottom tab bar, thumb-zone actions, viewport-sized layouts.
- (Secondary) Gamified fitness toy energy — PRs are celebrated with weight, not confetti; no badges/streak cartoons.

## Design Principles

1. **The board is sacred.** The WOD board and leaderboard read like something posted in the gym: ruled rows, tabular numbers, condensed caps names. Identity lives in hero screens; forms and tables stay conventional-and-excellent.
2. **Thirty seconds, one thumb.** Every athlete action is designed for one-handed phone use mid-workout: bottom tab bar, ≥44px targets, primary action visually primary, minimal typing.
3. **Red means it matters.** Race red marks live / primary / winning only. If red appears, something is at stake. Never decorative, never a status fill.
4. **State is never silent.** Loading, saving, saved, failed — the athlete always knows where their score is. Gym wifi is a design constraint, not an edge case.
5. **Celebrate what's earned.** A PR is the emotional peak of the product — give it scale and weight (motion, display type). Everything that isn't a peak stays quiet.

## Accessibility & Inclusion

WCAG AA: text contrast ≥4.5:1 on both themes (current `--faint` fails — must be fixed), touch targets ≥44px, full keyboard paths with visible focus rings, labeled form controls, `prefers-reduced-motion` alternatives for all motion. Dark-first (gyms are dark), light theme first-class.

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

rxed (formerly BoxHub) is a multi-tenant CrossFit box platform: one product replacing the 3–5 tools a box stitches together (booking, programming, score tracking, whiteboard TV). Success for the athlete surface = the athlete reaches for it like a training app, not a website: today's WOD instantly, score logged in <30s, PRs feel earned and visible.

## Brand Personality

**A workout is a prescription. rxed types it, posts it, and marks where you are.** The reference world
is the CrossFit Open broadcast and `games.crossfit.com`: a black board, hard-ruled panels, a
highlighter marking the live line, and the workout itself typed in monospace like something handed to
you rather than rendered for you. Boldness comes from **contrast and inversion**, not glow, gradients
or texture. Three words: **athletic, honest, sharp**.

This replaces the earlier "broadcast · heritage · earned" direction (warm ink, bone type, race red),
retired in M13b (design law v3, `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`):
it read as dated and its editorial treatment bled into plumbing screens that should have stayed calm.
What carries forward unchanged is the product thinking, which was never a palette — gyms are dark, the
room is the product, identity lives in hero screens, plumbing stays conventional-and-excellent.

## Anti-references

- **Generic SaaS dashboard**: card grids, KPI tiles, cream/gray admin blandness. If a screen could be a CRM, it's wrong.
- **Web page that scrolls**: long document-like pages on mobile. Athlete screens are app screens — bottom tab bar, thumb-zone actions, viewport-sized layouts.
- (Secondary) Gamified fitness toy energy — PRs are celebrated with weight, not confetti; no badges/streak cartoons.

## Design Principles

1. **The board is sacred.** The WOD board and leaderboard read like something posted in the gym: ruled rows, tabular numbers, monospaced prescriptions. Identity lives in hero screens; forms and tables stay conventional-and-excellent.
2. **Thirty seconds, one thumb.** Every athlete action is designed for one-handed phone use mid-workout: bottom tab bar, ≥44px targets, primary action visually primary, minimal typing.
3. **Volt means it matters.** Volt marks live / now / primary / winning only — never decorative, never a status fill, never a label. If volt appears, something is live, primary, or being won.
4. **State is never silent.** Loading, saving, saved, failed — the athlete always knows where their score is. Gym wifi is a design constraint, not an edge case.
5. **Celebrate what's earned.** A PR is the emotional peak of the product — give it scale and weight (motion, display type). Everything that isn't a peak stays quiet.

## Accessibility & Inclusion

WCAG AA: text contrast ≥4.5:1 (verified in the browser), touch targets ≥44px, full keyboard paths with visible focus rings, labeled form controls, `prefers-reduced-motion` alternatives for all motion. **Dark only** — the light theme was deleted in M13b; a light rendering of a dark-native identity is a different, weaker design, and the gym, the TV and the phone in a gym are all dark. Re-open trigger: a pilot box asks for it, or an accessibility need surfaces.

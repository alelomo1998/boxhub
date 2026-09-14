# Library critique — in-progress notes (paused on usage limit, 2026-09-15)

Not a scored result. Resume the walkthrough in Claude in Chrome, then score.

Method: inline, single context (user rule: critiques run in Chrome, inline). impeccable's in-page
detector cannot load: the app CSP is `script-src 'self'`, so injecting detect.js from the live-server
port is blocked — browser evidence = the audit's in-page measurements.

## Observed so far (Chrome, 500px and 1024/1426px)

- Composition at 500px holds; volt + is the single emphasis; cards scan by prescription.
- [candidate P2] Search under 3 characters gives no feedback — typing "Fr" changes nothing and says
  nothing, so a coach can't tell whether search works (recognition / system status).
- [candidate P2] Every search replaces the whole list with "Loading the library…" — the grid blanks
  on each debounced query instead of keeping results while refreshing (status feedback, flicker).
- Benchmarks chip on: benchmark cards read "BENCHMARK · GIRL · WORKOUT · FOR TIME" — "Workout" is
  redundant on every benchmark (user noticed earlier; not yet ruled).
- Active filters are visible only as a count badge; clearing needs open sheet → Clear → Show.
- History: no hint which days have pieces — a coach taps day by day (the strip has tones for
  classes elsewhere; History passes none).

## Still to walk

no-match search result state; filter badge with values; benchmark add sheet copy; History empty day
+ a day with pieces; error states (retry) if they can be provoked; score the 10 heuristics.

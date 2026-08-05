/**
 * The product's display name, in one place. `boxhub.com` and `boxhub.io` are both unavailable, so
 * a rename is coming before M13b (docs/superpowers/specs/2026-08-02-m13a-baseline-design.md §3) —
 * this makes that a one-value change here instead of a grep-and-replace across every screen.
 *
 * Internal namespaces are NOT this constant and do not change with a rename: `bh-*` CSS classes,
 * `BOXHUB_*` env vars, `com.boxhub.*` packages, and identifiers like the `boxhub_tv_paired`
 * storage key or the `boxhub/tv` pairing-path text all stay as-is.
 */
export const BRAND_NAME = 'BoxHub';

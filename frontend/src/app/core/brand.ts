/**
 * The product's display name, in one place. `boxhub.com` and `boxhub.io` were both unavailable, so
 * the product is `rxed` (domain `rxed.app`) — this constant was the one value that had to change
 * instead of a grep-and-replace across every screen.
 *
 * Internal namespaces are NOT this constant and did not change with the rename: `bh-*` CSS classes,
 * `BOXHUB_*` env vars, `com.boxhub.*` packages, and identifiers like the `boxhub_tv_paired`
 * storage key or the `boxhub/tv` pairing-path text all stay as-is.
 */
export const BRAND_NAME = 'rxed';

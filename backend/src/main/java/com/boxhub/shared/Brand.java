package com.boxhub.shared;

/**
 * The product's display name, in one place — the backend counterpart to
 * {@code frontend/src/app/core/brand.ts}. {@code boxhub.com} and {@code boxhub.io} are both
 * unavailable, so a rename is coming before M13b; this makes that a one-value change here
 * instead of a grep-and-replace across every mail template.
 * <p>
 * Internal namespaces are NOT this constant and do not change with a rename: {@code BOXHUB_*}
 * env vars, {@code com.boxhub.*} packages, and database/image names all stay as-is. The
 * {@code boxhub.mail.from} default in {@code application.yml} also stays a literal (a YAML
 * default cannot reference a Java constant) — kept in sync by hand, same as this constant's
 * frontend counterpart and {@code index.html}'s pre-boot {@code <title>}.
 */
public final class Brand {

    public static final String NAME = "BoxHub";

    private Brand() {}
}

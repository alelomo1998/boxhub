package com.boxhub.identity;

/**
 * Port owned by identity, implemented by box (InviteService). identity and box are already
 * mutually coupled at the entity level (Membership references Box), but the module rule is that
 * identity's SERVICES must not reach into box's — the tenant-agnostic invite lookup lives in box,
 * so it comes back through this interface rather than an identity → box.InviteService import.
 *
 * An invite mailed to an address, holding an unguessable 32-byte token, is proof the holder
 * reads that inbox — the same proof clicking the verification email buys.
 */
public interface InviteOwnershipProof {
    boolean provesOwnershipOf(String rawToken, String email);

    /**
     * The locale of the invite's box, when the token still names a live invite — empty otherwise.
     * Callers gate on {@link #provesOwnershipOf} first; this doesn't re-check the email, only the
     * token, since by the time it's called ownership is already proven (M13a T8: an invited member
     * inherits {@code boxes.locale} instead of the registrant's {@code Accept-Language}).
     */
    java.util.Optional<String> boxLocaleForToken(String rawToken);
}

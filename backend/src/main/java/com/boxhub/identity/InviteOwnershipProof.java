package com.boxhub.identity;

/**
 * Port owned by identity, implemented by box (InviteService) — identity must not depend on
 * box, box already depends on identity, so a reverse import would create a cycle.
 *
 * An invite mailed to an address, holding an unguessable 32-byte token, is proof the holder
 * reads that inbox — the same proof clicking the verification email buys.
 */
public interface InviteOwnershipProof {
    boolean provesOwnershipOf(String rawToken, String email);
}

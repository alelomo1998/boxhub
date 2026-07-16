package com.boxhub.identity;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * The four-branch linking policy. Every security decision in Google SSO lives here.
 *
 * <p>Deliberately NOT {@code @Transactional}. The unique-constraint race between two
 * concurrent resolve() calls for the same new user has to be caught and recovered from in
 * two separate transactions: on Postgres, a statement error aborts the whole transaction, so
 * if the recovery query ran in the SAME transaction as the failed insert, its first statement
 * would itself throw ("current transaction is aborted, commands ignored until end of
 * transaction block") instead of returning the winner's row. Calling {@code tx.createOrLink}
 * and {@code tx.recoverFromLinkRace} — both {@code @Transactional} on the separate
 * {@link GoogleLinkTx} bean — through this class's Spring proxy gives each its own
 * transaction. A private method call or a same-bean {@code REQUIRES_NEW} would bypass the
 * proxy and reproduce the exact bug this class exists to avoid.
 */
@Service
public class GoogleLinkService {

    private final GoogleLinkTx tx;

    public GoogleLinkService(GoogleLinkTx tx) {
        this.tx = tx;
    }

    public User resolve(String subject, String email, boolean emailVerified, String name) {
        if (!emailVerified)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_UNVERIFIED");

        String normalized = email.toLowerCase().trim();

        // 1. Known identity → straight in.
        var known = tx.findByIdentity(subject);
        if (known.isPresent()) return known.get();

        try {
            return tx.createOrLink(subject, normalized, name);
        } catch (DataIntegrityViolationException e) {
            // Same precedent as AuthService.register: a double-click fires two concurrent
            // resolve() calls for the same new user. Both pass the "not known yet" check above,
            // then race users.email or auth_identity(provider, provider_subject) — one wins the
            // unique constraint, the other lands here. Recover by re-fetching what the winner
            // created instead of failing the loser's request. This runs in a FRESH transaction
            // (see class javadoc) — createOrLink's transaction already rolled back cleanly.
            return tx.recoverFromLinkRace(subject, normalized);
        }
    }
}

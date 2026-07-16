package com.boxhub.identity;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * The transactional units behind {@link GoogleLinkService#resolve}, split into their own
 * bean so each one goes through the Spring proxy as a separate transaction.
 *
 * <p>On Postgres, any statement error aborts the whole transaction — every later statement
 * on that connection throws "current transaction is aborted" until the transaction ends. So
 * {@code createOrLink}'s unique-constraint violation and {@code recoverFromLinkRace}'s re-fetch
 * CANNOT share a transaction: the recovery's first query would itself blow up. Package-private
 * on purpose — this is plumbing for GoogleLinkService, not a public API.
 */
@Component
class GoogleLinkTx {

    private static final String PROVIDER = "google";

    private final UserRepository users;
    private final AuthIdentityRepository identities;

    GoogleLinkTx(UserRepository users, AuthIdentityRepository identities) {
        this.users = users;
        this.identities = identities;
    }

    @Transactional(readOnly = true)
    Optional<User> findByIdentity(String subject) {
        return identities.findByProviderAndProviderSubject(PROVIDER, subject).map(AuthIdentity::getUser);
    }

    @Transactional
    User createOrLink(String subject, String normalized, String name) {
        Optional<User> local = users.findByEmail(normalized);

        // 2. No local account → create one: verified, passwordless.
        if (local.isEmpty()) {
            User u = new User();
            u.setEmail(normalized);
            u.setName(name);
            u.setPasswordHash(null);
            u.setEmailVerified(true);
            u = users.saveAndFlush(u);
            link(u, subject, normalized);
            return u;
        }

        User u = local.get();

        // 3/4. A local account exists but is not linked yet.
        if (!u.isEmailVerified()) {
            // It was never proven. Google just proved it — so Google wins, and the
            // unverified password dies with it. This is what stops an attacker who
            // pre-registered the victim's address from keeping a password on it.
            u.setPasswordHash(null);
            u.setEmailVerified(true);
            u = users.save(u);
        }
        // If it WAS verified, the same human has now proven the address twice. Link, keep
        // the password, change nothing else.

        link(u, subject, normalized);
        return u;
    }

    @Transactional
    User recoverFromLinkRace(String subject, String normalized) {
        return identities.findByProviderAndProviderSubject(PROVIDER, subject)
                .map(AuthIdentity::getUser)
                .orElseGet(() -> {
                    User winner = users.findByEmail(normalized).orElseThrow();
                    if (identities.findByProviderAndProviderSubject(PROVIDER, subject).isEmpty())
                        link(winner, subject, normalized);
                    return winner;
                });
    }

    private void link(User user, String subject, String email) {
        AuthIdentity id = new AuthIdentity();
        id.setUser(user);
        id.setProvider(PROVIDER);
        id.setProviderSubject(subject);
        id.setEmail(email);
        // Flushed so a unique(provider, provider_subject) or unique(users.email) collision
        // surfaces here, inside createOrLink's own transaction, rather than silently at
        // commit time after this method has already returned.
        identities.saveAndFlush(id);
    }
}

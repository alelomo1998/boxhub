package com.boxhub.identity;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The insert behind {@link AuthService#register}, split into its own bean so it goes through
 * the Spring proxy as its own transaction — same precedent as {@link GoogleLinkTx}.
 *
 * <p>On Postgres, any statement error aborts the whole transaction — every later statement on
 * that connection throws "current transaction is aborted" until the transaction ends. So
 * {@code AuthService.register}'s recovery from a concurrent-duplicate insert (re-fetching the
 * winner's row) CANNOT share a transaction with the failed insert: {@code insertUser} and
 * {@code recoverExistingOwner} go through this bean's proxy as separate transactions, exactly
 * like {@link GoogleLinkTx#createOrLink} / {@link GoogleLinkTx#recoverFromLinkRace}. A private
 * method call or a same-bean {@code REQUIRES_NEW} would bypass the proxy and reproduce the bug.
 *
 * <p>Public — unlike the package-private {@link GoogleLinkTx} — because
 * {@code com.boxhub.box.BoxSignupTx} composes {@code insertUser} into its OWN atomic
 * user+box+membership transaction for the self-serve box-signup path. That caller is already
 * {@code @Transactional} when it calls in, so {@code insertUser}'s default REQUIRED propagation
 * joins its ambient transaction there instead of starting a fresh one — same method, two
 * different atomicity shapes depending on whether the caller already has a transaction open.
 */
@Component
public class RegisterTx {

    private final UserRepository users;

    RegisterTx(UserRepository users) {
        this.users = users;
    }

    @Transactional
    public User insertUser(String normalizedEmail, String passwordHash, String name, boolean emailVerified) {
        User u = new User();
        u.setEmail(normalizedEmail);
        u.setPasswordHash(passwordHash);
        u.setName(name);
        u.setEmailVerified(emailVerified);
        return users.saveAndFlush(u);
    }

    @Transactional
    public User recoverExistingOwner(String normalizedEmail) {
        return users.findByEmail(normalizedEmail).orElseThrow();
    }
}

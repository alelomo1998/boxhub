package com.boxhub.identity;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * The four-branch linking policy. Every security decision in Google SSO lives here.
 */
@Service
public class GoogleLinkService {

    private static final String PROVIDER = "google";

    private final UserRepository users;
    private final AuthIdentityRepository identities;

    public GoogleLinkService(UserRepository users, AuthIdentityRepository identities) {
        this.users = users;
        this.identities = identities;
    }

    @Transactional
    public User resolve(String subject, String email, boolean emailVerified, String name) {
        if (!emailVerified)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_UNVERIFIED");

        String normalized = email.toLowerCase().trim();

        // 1. Known identity → straight in.
        Optional<AuthIdentity> known = identities.findByProviderAndProviderSubject(PROVIDER, subject);
        if (known.isPresent()) return known.get().getUser();

        try {
            return createOrLink(subject, normalized, name);
        } catch (DataIntegrityViolationException e) {
            // Same precedent as AuthService.register: a double-click fires two concurrent
            // resolve() calls for the same new user. Both pass the "not known yet" check above,
            // then race users.email or auth_identity(provider, provider_subject) — one wins the
            // unique constraint, the other lands here. Recover by re-fetching what the winner
            // created instead of failing the loser's request.
            return recoverFromLinkRace(subject, normalized);
        }
    }

    private User createOrLink(String subject, String normalized, String name) {
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

    private User recoverFromLinkRace(String subject, String normalized) {
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
        // Flushed (not just saved) so a unique(provider, provider_subject) collision surfaces
        // here, inside the try/catch above, rather than at transaction-commit time — by then
        // control has already left resolve() and the exception can no longer be recovered from.
        identities.saveAndFlush(id);
    }
}

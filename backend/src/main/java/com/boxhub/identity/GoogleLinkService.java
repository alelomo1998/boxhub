package com.boxhub.identity;

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

    private void link(User user, String subject, String email) {
        AuthIdentity id = new AuthIdentity();
        id.setUser(user);
        id.setProvider(PROVIDER);
        id.setProviderSubject(subject);
        id.setEmail(email);
        identities.save(id);
    }
}

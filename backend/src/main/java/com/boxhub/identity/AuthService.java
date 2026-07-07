package com.boxhub.identity;

import com.boxhub.shared.DuplicateEmailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final MembershipRepository memberships;
    private final String timingEqualizerHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder,
                       MembershipRepository memberships) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
        this.timingEqualizerHash = passwordEncoder.encode("timing-equalizer-not-a-real-password");
    }

    @Transactional
    public User register(String email, String rawPassword, String name) {
        String normalizedEmail = email.toLowerCase().trim();
        if (users.findByEmail(normalizedEmail).isPresent()) throw new DuplicateEmailException();
        User u = new User();
        u.setEmail(normalizedEmail);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setName(name);
        try {
            return users.saveAndFlush(u);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // concurrent register with same email lost the race to the unique index
            throw new DuplicateEmailException();
        }
    }

    @Transactional(readOnly = true)
    public User login(String email, String rawPassword) {
        var maybeUser = users.findByEmail(email.toLowerCase().trim());
        // Always run one bcrypt comparison so unknown-email and wrong-password take equal time
        String hash = maybeUser.map(User::getPasswordHash).orElse(timingEqualizerHash);
        boolean matches = passwordEncoder.matches(rawPassword, hash);
        if (maybeUser.isEmpty() || !matches)
            throw new org.springframework.security.authentication.BadCredentialsException("Bad credentials");
        return maybeUser.get();
    }

    @Transactional(readOnly = true)
    public java.util.List<Membership> membershipsOf(User user) {
        return memberships.findByUserIdWithBox(user.getId());
    }
}

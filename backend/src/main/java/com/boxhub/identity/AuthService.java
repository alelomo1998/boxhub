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

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder,
                       MembershipRepository memberships) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
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
        User u = users.findByEmail(email.toLowerCase().trim())
                .orElseThrow(() -> new org.springframework.security.authentication.BadCredentialsException("Bad credentials"));
        if (!passwordEncoder.matches(rawPassword, u.getPasswordHash()))
            throw new org.springframework.security.authentication.BadCredentialsException("Bad credentials");
        return u;
    }

    @Transactional(readOnly = true)
    public java.util.List<Membership> membershipsOf(User user) {
        return memberships.findByUserIdWithBox(user.getId());
    }
}

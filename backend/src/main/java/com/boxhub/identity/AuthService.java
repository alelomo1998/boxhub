package com.boxhub.identity;

import com.boxhub.shared.DuplicateEmailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
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
}

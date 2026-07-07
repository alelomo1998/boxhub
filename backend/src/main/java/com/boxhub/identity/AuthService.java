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
        if (users.findByEmail(email).isPresent()) throw new DuplicateEmailException();
        User u = new User();
        u.setEmail(email.toLowerCase().trim());
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setName(name);
        return users.save(u);
    }
}

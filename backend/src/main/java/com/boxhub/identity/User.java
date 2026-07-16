package com.boxhub.identity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false, unique = true) private String email;
    @Column(name = "password_hash") private String passwordHash;
    @Column(nullable = false) private String name;
    @Column(name = "email_verified", nullable = false) private boolean emailVerified = false;
    @Column(name = "failed_attempts", nullable = false) private int failedAttempts = 0;
    @Column(name = "throttled_until") private java.time.Instant throttledUntil;

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public int getFailedAttempts() { return failedAttempts; }
    public void setFailedAttempts(int failedAttempts) { this.failedAttempts = failedAttempts; }
    public java.time.Instant getThrottledUntil() { return throttledUntil; }
    public void setThrottledUntil(java.time.Instant throttledUntil) { this.throttledUntil = throttledUntil; }
}

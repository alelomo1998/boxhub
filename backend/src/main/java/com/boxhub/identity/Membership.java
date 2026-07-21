package com.boxhub.identity;

import com.boxhub.box.Box;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "memberships")
public class Membership {
    @Id @GeneratedValue private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "box_id")
    private Box box;
    @Column(nullable = false) private String role;
    @Column(nullable = false) private String status = "ACTIVE";
    @Column(name = "expires_at") private LocalDate expiresAt;
    @Column(name = "avatar_path") private String avatarPath;
    @Column(name = "private", nullable = false) private boolean privateProfile = false;

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Box getBox() { return box; }
    public void setBox(Box box) { this.box = box; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDate expiresAt) { this.expiresAt = expiresAt; }
    public String getAvatarPath() { return avatarPath; }
    public void setAvatarPath(String avatarPath) { this.avatarPath = avatarPath; }
    public boolean isPrivateProfile() { return privateProfile; }
    public void setPrivateProfile(boolean privateProfile) { this.privateProfile = privateProfile; }
}

package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, UUID> {
    Optional<AuthIdentity> findByProviderAndProviderSubject(String provider, String providerSubject);
    List<AuthIdentity> findByUserId(UUID userId);
    void deleteByUserId(UUID userId);
}

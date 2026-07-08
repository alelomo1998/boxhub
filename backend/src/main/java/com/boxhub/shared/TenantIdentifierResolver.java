package com.boxhub.shared;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Discriminator multitenancy (ADR-001): @TenantId entities are filtered and
 * populated from the JWT's box_id claim. Null tenant (login, user-scoped
 * requests) disables filtering — such requests must not touch tenant tables.
 */
@Component
public class TenantIdentifierResolver
        implements CurrentTenantIdentifierResolver<UUID>, HibernatePropertiesCustomizer {

    // Hibernate throws if resolveCurrentTenantIdentifier() ever returns null (every
    // session, not just ones touching @TenantId entities, calls this) — a real null
    // is not an option. NO_TENANT is a sentinel marked "root" via isRoot() below, which
    // tells Hibernate to skip enabling the tenant filter for unauthenticated/user-scoped
    // sessions instead of throwing.
    private static final UUID NO_TENANT = new UUID(0L, 0L);

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        UUID boxId = TenantContext.boxIdOrNull();
        return boxId == null ? NO_TENANT : boxId;
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return NO_TENANT.equals(tenantId);
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }

    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, this);
    }
}

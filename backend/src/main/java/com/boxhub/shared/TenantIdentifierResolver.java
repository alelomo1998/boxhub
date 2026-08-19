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
 * requests) filters to a sentinel that matches nothing, so such a request reads
 * no tenant data at all. Explicit cross-box access goes through
 * TenantContext.runAsRoot (M21).
 */
@Component
public class TenantIdentifierResolver
        implements CurrentTenantIdentifierResolver<UUID>, HibernatePropertiesCustomizer {

    // Two sentinels, and the difference between them is the entire M21 guarantee.
    //
    // Hibernate throws if resolveCurrentTenantIdentifier() ever returns null (every session, not
    // just ones touching @TenantId entities, calls this) — a real null is not an option.
    //
    // NO_TENANT: no ambient tenant. isRoot() is FALSE, so Hibernate enables the filter with a value
    // no boxes row can ever carry -> a @TenantId read returns EMPTY. Before M21 this was reported as
    // root, which DISABLED the filter and let a tenant-less read see every box. That fail-open is why
    // any route outside /api/box/** (where CookieBearerTokenResolver hands over the user token, which
    // carries no box_id claim) sat one accidental repository call away from a cross-box leak.
    //
    // ROOT: reached only from TenantContext.runAsRoot. isRoot() is true, the filter is off, the read
    // sees every box — because someone wrote that down. It is not a real box, so an INSERT under it
    // dies on the foreign key instead of landing somewhere.
    private static final UUID NO_TENANT = new UUID(0L, 0L);
    static final UUID ROOT = new UUID(-1L, -1L);

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        UUID boxId = TenantContext.boxIdOrNull();
        if (boxId != null) return boxId;                       // a real box always wins
        return TenantContext.isRootScope() ? ROOT : NO_TENANT;
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return ROOT.equals(tenantId);
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

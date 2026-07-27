package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class RepositoryTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @PersistenceContext EntityManager entityManager;

    @Test
    void persistsAndQueriesUserBoxMembership() {
        User u = new User();
        u.setEmail("a@b.io");
        u.setPasswordHash("x");
        u.setName("Alice");
        users.save(u);

        Box b = new Box();
        b.setName("Demo Box");
        b.setSlug("demo");
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        memberships.save(m);

        assertThat(users.findByEmail("a@b.io")).isPresent();
        var list = memberships.findByUserIdWithBox(u.getId());
        assertThat(list).hasSize(1);
        assertThat(list.get(0).getBox().getName()).isEqualTo("Demo Box");
        assertThat(memberships.findByUserIdAndBoxId(u.getId(), b.getId())).isPresent();
    }

    @Test
    void findByUserIdWithBoxFetchesTheBoxInOneQuery() {
        User u = new User();
        u.setEmail("join-fetch@b.io");
        u.setPasswordHash("x");
        u.setName("Bob");
        users.save(u);

        Box b = new Box();
        b.setName("Join Fetch Box");
        b.setSlug("join-fetch");
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        memberships.save(m);
        entityManager.flush();
        // Evict everything from the persistence context so the query below has to hit the
        // DB fresh — without this, the just-saved Box stays managed in the L1 cache and the
        // lazy proxy resolves from there regardless of the query's fetch strategy, masking
        // the thing this test exists to catch.
        entityManager.clear();

        var stats = entityManager.getEntityManagerFactory()
                .unwrap(org.hibernate.SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        var loaded = memberships.findByUserIdWithBox(u.getId());
        // Touch the lazy side. Without the join fetch this triggers a second SELECT (OSIV is off,
        // so outside a session it would throw instead — either way the assertion below fails).
        loaded.forEach(mm -> mm.getBox().getName());

        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }
}

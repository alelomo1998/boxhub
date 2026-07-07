package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class RepositoryTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;

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
}

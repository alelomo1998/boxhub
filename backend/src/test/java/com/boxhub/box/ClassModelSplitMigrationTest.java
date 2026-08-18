package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ClassModelSplitMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void classTemplatesIsGoneAndItsDataLivesInTypeAndSlot() {
        Integer templatesLeft = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'class_templates'",
                Integer.class);
        assertThat(templatesLeft).isZero();

        Integer slots = jdbc.queryForObject("select count(*) from schedule_slot", Integer.class);
        assertThat(slots).isPositive();

        // every slot resolves to a class type in the same box
        Integer orphans = jdbc.queryForObject("""
                select count(*) from schedule_slot ss
                left join class_type ct on ct.id = ss.class_type_id and ct.box_id = ss.box_id
                where ct.id is null
                """, Integer.class);
        assertThat(orphans).isZero();
    }

    @Test
    void sessionsStillPointAtTheSlotTheyCameFrom() {
        Integer dangling = jdbc.queryForObject("""
                select count(*) from class_sessions cs
                where cs.schedule_slot_id is not null
                  and not exists (select 1 from schedule_slot ss where ss.id = cs.schedule_slot_id)
                """, Integer.class);
        assertThat(dangling).isZero();
    }

    @Test
    void skeletonPiecesHangOffTheClassType() {
        Integer dangling = jdbc.queryForObject("""
                select count(*) from template_piece tp
                where not exists (select 1 from class_type ct where ct.id = tp.class_type_id)
                """, Integer.class);
        assertThat(dangling).isZero();
    }
}

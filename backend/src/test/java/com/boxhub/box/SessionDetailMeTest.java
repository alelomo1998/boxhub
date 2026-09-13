package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The session-detail grid flags the caller's own row (M14c-a Task 12). A team result names its
 * members by membership id and the server rejects a team the caller is not in, so the partner
 * picker has to know which grid row is the person using it -- and an athlete cannot read /roster,
 * which is COACH-only, so this athlete-visible endpoint is where the flag has to live.
 */
class SessionDetailMeTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;

    UUID boxId;
    UUID sessionId;
    UUID adaMembershipId;
    UUID boMembershipId;
    String adaToken;
    String boToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Detail Box " + n);
        box.setSlug("detail-" + n);
        box.setTimezone("Europe/Rome");
        boxId = boxes.save(box).getId();

        Object[] ada = member("ada-" + n + "@t.io", box);
        adaMembershipId = (UUID) ada[0];
        adaToken = (String) ada[1];

        Object[] bo = member("bo-" + n + "@t.io", box);
        boMembershipId = (UUID) bo[0];
        boToken = (String) bo[1];

        sessionId = UUID.randomUUID();
        jdbc.update("insert into class_sessions (id, box_id, name, start_at, duration_min, capacity)"
                + " values (?, ?, ?, ?, ?, ?)", sessionId, boxId, "Team WOD", OffsetDateTime.now(), 60, 12);

        book(adaMembershipId);
        book(boMembershipId);
    }

    private Object[] member(String email, Box box) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        memberships.save(m);
        return new Object[] { m.getId(), tokenService.boxToken(u, m) };
    }

    private void book(UUID membershipId) {
        jdbc.update("insert into bookings (id, box_id, session_id, membership_id, status)"
                + " values (?, ?, ?, ?, 'BOOKED')", UUID.randomUUID(), boxId, sessionId, membershipId);
    }

    private JsonNode detailAs(String token) throws Exception {
        String json = mvc.perform(get("/api/box/sessions/" + sessionId + "/detail")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readTree(json);
    }

    /** The membershipId whose row carries me=true, or null if no row does. */
    private String flaggedMe(JsonNode detail) {
        String found = null;
        for (JsonNode row : detail.get("active")) {
            if (row.get("me").asBoolean()) {
                // Two rows flagged as the caller would make the picker seed the wrong person.
                assertThat(found).as("exactly one row is the caller").isNull();
                found = row.get("membershipId").asText();
            }
        }
        return found;
    }

    @Test
    void flagsTheCallersOwnRowAndOnlyTheirs() throws Exception {
        JsonNode asAda = detailAs(adaToken);
        assertThat(asAda.get("active")).hasSize(2);
        assertThat(flaggedMe(asAda)).isEqualTo(adaMembershipId.toString());
    }

    @Test
    void theSameGridFlagsADifferentRowForADifferentCaller() throws Exception {
        // The flag is per-caller, not a property of the row: if it were computed once and cached,
        // or derived from the booking rather than the reader, both callers would see Ada's row.
        assertThat(flaggedMe(detailAs(boToken))).isEqualTo(boMembershipId.toString());
    }
}

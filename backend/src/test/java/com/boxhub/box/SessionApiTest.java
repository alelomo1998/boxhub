package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired ScheduleSlotRepository slots;
    @Autowired ClassTypeRepository types;

    Box boxA;
    String coachToken, athleteToken, otherCoachToken;
    UUID athleteMembershipId;
    UUID sessionId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxA = newBox("Sess A " + n, "sess-a-" + n);
        Box boxB = newBox("Sess B " + n, "sess-b-" + n);
        coachToken = token("scoach-" + n + "@t.io", boxA, "COACH").token;
        var ath = token("sath-" + n + "@t.io", boxA, "ATHLETE");
        athleteToken = ath.token;
        athleteMembershipId = ath.membershipId;
        otherCoachToken = token("sbcoach-" + n + "@t.io", boxB, "COACH").token;

        actAsBox(boxA.getId());
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3 * 24 * 3600));
        s.setDurationMin(60);
        s.setCapacity(10);
        sessionId = sessions.save(s).getId();
        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(athleteMembershipId);
        b.setStatus("BOOKED");
        bookings.save(b);
        SecurityContextHolder.clearContext();
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    record TokMem(String token, UUID membershipId) {}
    private TokMem token(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u); m.setBox(box); m.setRole(role);
        UUID mid = memberships.save(m).getId();
        return new TokMem(tokenService.boxToken(u, m), mid);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
    }

    private String range() {
        return "?from=" + Instant.now().minusSeconds(3600) + "&to=" + Instant.now().plusSeconds(30L * 24 * 3600);
    }

    @Test
    void coachListsSessionsWithCounts() throws Exception {
        mvc.perform(get("/api/box/sessions" + range()).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].bookedCount").value(1))
                .andExpect(jsonPath("$[0].capacity").value(10));
    }

    @Test
    void rosterShowsBookedAthleteAndCheckInFlips() throws Exception {
        String roster = mvc.perform(get("/api/box/sessions/" + sessionId + "/roster")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("BOOKED"))
                .andReturn().getResponse().getContentAsString();
        UUID bookingId = UUID.fromString(roster.replaceAll(".*\"bookingId\":\"([0-9a-f-]+)\".*", "$1"));

        mvc.perform(post("/api/box/sessions/" + sessionId + "/checkin").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"bookingId\":\"" + bookingId + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/sessions/" + sessionId + "/roster").header("Authorization", "Bearer " + coachToken))
                .andExpect(jsonPath("$[0].status").value("CHECKED_IN"));
        // A checked-in athlete is still in the class: the list keeps counting and naming them.
        mvc.perform(get("/api/box/sessions" + range()).header("Authorization", "Bearer " + coachToken))
                .andExpect(jsonPath("$[0].bookedCount").value(1))
                .andExpect(jsonPath("$[0].booked.length()").value(1));
    }

    @Test
    void missingBookingIdIs400NotA500() throws Exception {
        mvc.perform(post("/api/box/sessions/" + sessionId + "/checkin").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/box/sessions/" + sessionId + "/uncheck").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/box/sessions/" + sessionId + "/no-show").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void athleteCannotAccessRosterOrCheckin() throws Exception {
        mvc.perform(get("/api/box/sessions/" + sessionId + "/roster").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantRosterIs404() throws Exception {
        mvc.perform(get("/api/box/sessions/" + sessionId + "/roster").header("Authorization", "Bearer " + otherCoachToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void listCarriesTheClassTypeImageThroughTheSlot() throws Exception {
        actAsBox(boxA.getId());
        ClassType t = new ClassType();
        t.setName("Type " + System.nanoTime());
        t.setImagePath("cl-test.png");
        UUID typeId = types.save(t).getId();

        ScheduleSlot sl = new ScheduleSlot();
        sl.setClassTypeId(typeId);
        sl.setWeekday(0);
        sl.setStartTime(LocalTime.of(9, 0));
        sl.setDurationMin(60);
        sl.setCapacity(10);
        UUID slotId = slots.save(sl).getId();

        ClassSession slotted = new ClassSession();
        slotted.setName("Slotted WOD");
        slotted.setStartAt(Instant.now().plusSeconds(4 * 24 * 3600));
        slotted.setDurationMin(60);
        slotted.setCapacity(10);
        slotted.setScheduleSlotId(slotId);
        UUID slottedId = sessions.save(slotted).getId();
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/sessions" + range()).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + slottedId + "')].imagePath",
                        org.hamcrest.Matchers.contains(org.hamcrest.Matchers.containsString("cl-test"))))
                .andExpect(jsonPath("$[?(@.id=='" + sessionId + "')].imagePath",
                        org.hamcrest.Matchers.contains(org.hamcrest.Matchers.nullValue())));
    }

    @Test
    void listCarriesTheCoachAvatarAndTheFirstFiveAthletes() throws Exception {
        actAsBox(boxA.getId());
        long n = System.nanoTime();

        User coachUser = authService.register("cav-" + n + "@t.io", "correct-horse-battery", "Coach Av");
        Membership coachMembership = new Membership();
        coachMembership.setUser(coachUser); coachMembership.setBox(boxA); coachMembership.setRole("COACH");
        coachMembership.setAvatarPath("av-coach.png");
        memberships.save(coachMembership);

        ClassSession s = new ClassSession();
        s.setName("Avatars WOD");
        s.setStartAt(Instant.now().plusSeconds(5 * 24 * 3600));
        s.setDurationMin(60);
        s.setCapacity(10);
        s.setCoachId(coachUser.getId());
        UUID avSessionId = sessions.save(s).getId();

        for (int i = 1; i <= 6; i++) {
            User u = authService.register("a" + i + "-" + n + "@t.io", "correct-horse-battery", "A" + i);
            Membership m = new Membership();
            m.setUser(u); m.setBox(boxA); m.setRole("ATHLETE");
            if (i == 1) m.setAvatarPath("av-a1.png");
            UUID mid = memberships.save(m).getId();
            Booking b = new Booking();
            b.setSessionId(avSessionId);
            b.setMembershipId(mid);
            b.setStatus("BOOKED");
            b.setPosition(i);
            bookings.save(b);
        }
        SecurityContextHolder.clearContext();

        String body = mvc.perform(get("/api/box/sessions" + range()).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode list = om.readTree(body);
        JsonNode avSession = null;
        for (JsonNode node : list) {
            if (avSessionId.toString().equals(node.get("id").asText())) { avSession = node; break; }
        }
        assertThat(avSession).isNotNull();
        assertThat(avSession.get("coachAvatarPath").asText()).contains("av-coach");
        JsonNode people = avSession.get("people");
        assertThat(people.size()).isEqualTo(5);
        assertThat(people.get(0).get("name").asText()).isEqualTo("A1");
        assertThat(people.get(0).get("avatarPath").asText()).contains("av-a1");
        assertThat(people.get(1).get("avatarPath").isNull()).isTrue();
        assertThat(avSession.get("bookedCount").asLong()).isEqualTo(6);
    }

}

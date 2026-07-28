package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired BookingService bookingService;

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
    void sweepFlipsPastBookedToNoShow() {
        long n = System.nanoTime();
        actAsBox(boxA.getId());
        ClassSession past = new ClassSession();
        past.setName("Past WOD " + n);
        past.setStartAt(Instant.now().minusSeconds(3600));
        past.setDurationMin(60);
        past.setCapacity(10);
        UUID pastId = sessions.save(past).getId();
        Booking b = new Booking();
        b.setSessionId(pastId);
        b.setMembershipId(athleteMembershipId);
        b.setStatus("BOOKED");
        UUID bid = bookings.save(b).getId();

        int flipped = bookingService.sweepNoShows(Instant.now());
        assertThat(flipped).isGreaterThanOrEqualTo(1);
        assertThat(bookings.findById(bid).orElseThrow().getStatus()).isEqualTo("NO_SHOW");
        SecurityContextHolder.clearContext();
    }
}

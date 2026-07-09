package com.boxhub.shared;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassTemplate;
import com.boxhub.box.ClassTemplateRepository;
import com.boxhub.box.SessionGenerator;
import com.boxhub.identity.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final AuthService authService;
    private final ClassTemplateRepository templates;
    private final SessionGenerator sessionGenerator;
    private final com.boxhub.programming.TrackService trackService;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService,
                         ClassTemplateRepository templates, SessionGenerator sessionGenerator,
                         com.boxhub.programming.TrackService trackService) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
        this.templates = templates;
        this.sessionGenerator = sessionGenerator;
        this.trackService = trackService;
    }

    @Override
    public void run(String... args) {
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        trackService.seedDefaults(demo.getId()); // RX + Fitness
        seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
        User coach = seed(demo, "coach@demo.io", "Demo Coach", "COACH");
        seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
        seedSchedule(demo, coach.getId());
    }

    private User seed(Box box, String email, String name, String role) {
        User u = authService.register(email, "password123", name);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return u;
    }

    /** A small realistic weekly schedule so a fresh demo box isn't empty. */
    private void seedSchedule(Box box, UUID coachId) {
        runAsBox(box.getId(), () -> {
            template("Morning WOD", 0, LocalTime.of(6, 30), 12, coachId);   // Mon
            template("Evening WOD", 2, LocalTime.of(18, 30), 14, coachId);  // Wed
            template("Evening WOD", 4, LocalTime.of(18, 30), 14, coachId);  // Fri
            template("Weekend Team WOD", 5, LocalTime.of(10, 0), 20, coachId); // Sat
        });
        sessionGenerator.generateForBox(box.getId());
    }

    private void template(String name, int weekday, LocalTime start, int capacity, UUID coachId) {
        ClassTemplate t = new ClassTemplate();
        t.setName(name);
        t.setWeekday(weekday);
        t.setStartTime(start);
        t.setDurationMin(60);
        t.setCapacity(capacity);
        t.setCoachId(coachId);
        templates.save(t);
    }

    private void runAsBox(UUID boxId, Runnable r) {
        Jwt jwt = Jwt.withTokenValue("seed").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
        try { r.run(); } finally { SecurityContextHolder.clearContext(); }
    }
}

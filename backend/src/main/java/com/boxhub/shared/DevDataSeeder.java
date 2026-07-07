package com.boxhub.shared;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final AuthService authService;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
    }

    @Override
    public void run(String... args) {
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
        seed(demo, "coach@demo.io", "Demo Coach", "COACH");
        seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
    }

    private void seed(Box box, String email, String name, String role) {
        User u = authService.register(email, "password123", name);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
    }
}

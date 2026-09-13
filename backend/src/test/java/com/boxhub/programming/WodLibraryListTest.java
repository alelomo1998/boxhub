package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.TokenService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The LIBRARY list, which is not "every wod row". Same MockMvc + coach-JWT harness as
 * WodAxesWireTest.
 *
 * <p>This is the half of the unbounded-growth bug that docs/BACKLOG.md never names. Its entry
 * describes only the copy side — "quick-created pieces become library wods each time" — but
 * GET /api/box/wods returned every row, so the moment M14c-a starts attaching pieces BY COPY the
 * picker fills with one entry per class instead. Latent until now, which is exactly why it needs a
 * test rather than a reading.
 */
class WodLibraryListTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String coachToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Lib List " + n);
        b.setSlug("lib-list-" + n);
        b.setTimezone("Europe/Rome");
        Box box = boxes.save(b);

        String email = "lib-list-" + n + "@t.io";
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("COACH");
        memberships.save(m);
        coachToken = tokenService.boxToken(u, m);
    }

    /** library defaults to true when the field is omitted, which is how every pre-M14c-a caller behaves. */
    private UUID createWod(String title, Boolean library) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("macro", "WORKOUT");
        body.put("scoreType", "NONE");
        if (library != null) body.put("library", library);

        String json = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return om.readValue(json, WodController.WodDto.class).id();
    }

    private List<UUID> listedIds(String search) throws Exception {
        String url = search == null ? "/api/box/wods" : "/api/box/wods?search=" + search;
        String json = mvc.perform(get(url).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<WodController.WodDto>>() {})
                .stream().map(WodController.WodDto::id).toList();
    }

    @Test
    void listExcludesClassOwnedCopies() throws Exception {
        UUID libraryWod = createWod("Fran", true);
        UUID copy = createWod("Fran (this class)", false);

        List<UUID> listed = listedIds(null);

        assertThat(listed).contains(libraryWod);
        assertThat(listed).doesNotContain(copy);
    }

    @Test
    void searchAlsoExcludesCopies() throws Exception {
        UUID libraryWod = createWod("Cindy", true);
        UUID copy = createWod("Cindy", false);

        List<UUID> listed = listedIds("Cind");

        assertThat(listed).contains(libraryWod);
        assertThat(listed).doesNotContain(copy);
    }

    /** Omitting the field must still mean "library", or every existing caller silently disappears. */
    @Test
    void aWodCreatedWithoutTheFlagIsStillListed() throws Exception {
        UUID implicit = createWod("Helen", null);
        assertThat(listedIds(null)).contains(implicit);
    }
}

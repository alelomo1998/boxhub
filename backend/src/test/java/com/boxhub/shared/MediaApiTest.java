package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "boxhub.media-dir=${java.io.tmpdir}/boxhub-media-test")
class MediaApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String athlete;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = new Box();
        a.setName("Media " + n); a.setSlug("md-" + n); a.setTimezone("Europe/Rome");
        boxes.save(a);
        User u = authService.register("md-" + n + "@t.io", "password123", "Ath");
        Membership m = new Membership(); m.setUser(u); m.setBox(a); m.setRole("ATHLETE");
        memberships.save(m);
        athlete = tokenService.boxToken(u, m);
    }

    private byte[] png() throws Exception {
        BufferedImage img = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    @Test
    void memberUploadsPng() throws Exception {
        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", png()))
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.path", org.hamcrest.Matchers.startsWith("/media/")));
    }

    @Test
    void rejectsWrongType() throws Exception {
        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.gif", "image/gif", png()))
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void rejectsNonImagePayload() throws Exception {
        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", "not an image".getBytes()))
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unauthenticatedIsDenied() throws Exception {
        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", png())))
                .andExpect(status().isUnauthorized());
    }
}

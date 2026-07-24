package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "boxhub.media-dir=${java.io.tmpdir}/boxhub-media-test")
class MediaApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Value("${boxhub.media-dir}") String mediaDir;

    String athlete;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = new Box();
        a.setName("Media " + n); a.setSlug("md-" + n); a.setTimezone("Europe/Rome");
        boxes.save(a);
        User u = authService.register("md-" + n + "@t.io", "correct-horse-battery", "Ath");
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

    private byte[] jpeg() throws Exception {
        BufferedImage img = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }

    private static void u16(ByteArrayOutputStream out, int v) {
        out.write(v & 0xFF);
        out.write((v >> 8) & 0xFF);
    }

    private static void u32(ByteArrayOutputStream out, long v) {
        out.write((int) (v & 0xFF));
        out.write((int) ((v >> 8) & 0xFF));
        out.write((int) ((v >> 16) & 0xFF));
        out.write((int) ((v >> 24) & 0xFF));
    }

    /**
     * Hand-built APP1 marker segment: "Exif\0\0" + a real little-endian TIFF structure with
     * IFD0 -> GPSInfo -> a GPS IFD carrying GPSVersionID/GPSLatitudeRef=N/GPSLongitudeRef=E, all
     * inline (no external data offsets needed since every value fits the 4-byte field). Proves
     * actual GPS-bearing EXIF, not just a marker byte.
     */
    private byte[] gpsExifApp1() {
        ByteArrayOutputStream tiff = new ByteArrayOutputStream();
        tiff.writeBytes(new byte[]{'I', 'I'});
        u16(tiff, 0x002A);
        u32(tiff, 8); // IFD0 offset

        u16(tiff, 1);           // IFD0: one entry
        u16(tiff, 0x8825);      // tag GPSInfo
        u16(tiff, 4);           // type LONG
        u32(tiff, 1);           // count
        u32(tiff, 26);          // value: GPS IFD offset (8 + 2 + 12 + 4)
        u32(tiff, 0);           // next IFD

        u16(tiff, 3);           // GPS IFD: three entries
        u16(tiff, 0x0000); u16(tiff, 1); u32(tiff, 4); tiff.writeBytes(new byte[]{2, 2, 0, 0}); // GPSVersionID
        u16(tiff, 0x0001); u16(tiff, 2); u32(tiff, 2); tiff.writeBytes(new byte[]{'N', 0, 0, 0}); // GPSLatitudeRef
        u16(tiff, 0x0003); u16(tiff, 2); u32(tiff, 2); tiff.writeBytes(new byte[]{'E', 0, 0, 0}); // GPSLongitudeRef
        u32(tiff, 0);           // next IFD

        byte[] payload = ("Exif\0\0").getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream app1Payload = new ByteArrayOutputStream();
        app1Payload.writeBytes(payload);
        app1Payload.writeBytes(tiff.toByteArray());
        byte[] full = app1Payload.toByteArray();

        ByteArrayOutputStream seg = new ByteArrayOutputStream();
        seg.write(0xFF); seg.write(0xE1);
        int len = full.length + 2; // length field includes itself
        seg.write((len >> 8) & 0xFF); seg.write(len & 0xFF);
        seg.writeBytes(full);
        return seg.toByteArray();
    }

    /** A real JPEG (SOI + valid ImageIO-encoded body) with a GPS-bearing EXIF APP1 spliced in right after SOI. */
    private byte[] jpegWithGpsExif() throws Exception {
        byte[] plain = jpeg();
        byte[] app1 = gpsExifApp1();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(plain, 0, 2);                       // SOI
        out.writeBytes(app1);                          // our EXIF/GPS segment
        out.write(plain, 2, plain.length - 2);          // rest of the real JPEG
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
    void uploadedJpegLosesExifGpsData() throws Exception {
        byte[] withGps = jpegWithGpsExif();
        // sanity: the crafted upload really does carry the EXIF/GPS block we think it does
        assertThat(new String(withGps, StandardCharsets.ISO_8859_1)).contains("Exif");

        var result = mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "gps.jpg", "image/jpeg", withGps))
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isCreated())
                .andReturn();

        String path = new ObjectMapper().readTree(result.getResponse().getContentAsString()).get("path").asText();
        assertThat(path).startsWith("/media/");
        byte[] stored = Files.readAllBytes(Path.of(mediaDir).resolve(path.substring("/media/".length())));

        // real behaviour, not shape: the stored bytes carry no EXIF segment at all (re-encoding
        // through ImageIO drops every marker, GPS included) — not merely "GPS tag not found"
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("Exif");
    }

    @Test
    void unauthenticatedIsDenied() throws Exception {
        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", png()))
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isUnauthorized());
    }
}

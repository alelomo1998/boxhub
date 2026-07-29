package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

/**
 * Image uploads on a local volume, served by nginx at /media/**. Paths are unguessable UUIDs
 * (read side is unauthenticated by design — pilot tradeoff, see spec/BACKLOG).
 */
@Service
public class MediaStorage {

    // JPEG and PNG only. WebP was dropped in M12c: the JDK ships no WebP ImageIO codec, so the
    // decode/re-encode below — which is the entire EXIF-strip mechanism — cannot run on it, and
    // an uploaded WebP kept its GPS metadata. Adding a format here without a working ImageIO
    // round-trip re-opens that hole.
    private static final Map<String, String> TYPES = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png");
    static final long MAX_BYTES = 5 * 1024 * 1024;

    private final Path root;

    public MediaStorage(@Value("${boxhub.media-dir}") String mediaDir) {
        this.root = Path.of(mediaDir);
    }

    /** Removes the stored file; silent no-op if the path is null or already gone (idempotent). */
    public void delete(String path) {
        if (path == null) return;
        String relative = path.startsWith("/media/") ? path.substring("/media/".length()) : path;
        try {
            Files.deleteIfExists(root.resolve(relative));
        } catch (IOException e) {
            // best-effort cleanup — the DB row losing its avatarPath is what actually matters
        }
    }

    /** Validates and stores the file; returns the public path ("/media/{box}/{uuid}.{ext}"). */
    public String store(UUID boxId, MultipartFile file) {
        if (file == null || file.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file");
        if (file.getSize() > MAX_BYTES)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Max 5 MB");
        String ext = TYPES.get(file.getContentType());
        if (ext == null)
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG or PNG");
        try {
            byte[] bytes = file.getBytes();
            BufferedImage img = ImageIO.read(new java.io.ByteArrayInputStream(bytes));
            if (img == null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            // Re-encoding through a fresh BufferedImage strips all metadata (EXIF/GPS
            // included) — decode keeps pixels only, nothing carries the source's markers
            // forward into the write.
            ByteArrayOutputStream reencoded = new ByteArrayOutputStream();
            if (!ImageIO.write(img, ext, reencoded))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            byte[] toStore = reencoded.toByteArray();
            Path dir = root.resolve(boxId.toString());
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            Files.write(dir.resolve(name), toStore);
            return "/media/" + boxId + "/" + name;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store file");
        }
    }
}

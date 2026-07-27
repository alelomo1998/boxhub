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

    private static final Map<String, String> TYPES = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp");
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
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG, PNG or WebP");
        try {
            byte[] bytes = file.getBytes();
            byte[] toStore;
            if ("webp".equals(ext)) {
                if (!(bytes.length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[8] == 'W'))
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
                // ponytail: the JDK's ImageIO ships no WebP reader/writer, so decode+re-encode
                // (our EXIF-strip mechanism below) can't run on webp — it passes through as-is.
                // Ceiling: webp EXIF/GPS survives. Upgrade path: add a WebP ImageIO plugin
                // (e.g. TwelveMonkeys) if webp uploads with location metadata prove to matter.
                toStore = bytes;
            } else {
                BufferedImage img = ImageIO.read(new java.io.ByteArrayInputStream(bytes));
                if (img == null)
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
                // Re-encoding through a fresh BufferedImage strips all metadata (EXIF/GPS
                // included) — decode keeps pixels only, nothing carries the source's markers
                // forward into the write.
                ByteArrayOutputStream reencoded = new ByteArrayOutputStream();
                if (!ImageIO.write(img, ext, reencoded))
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
                toStore = reencoded.toByteArray();
            }
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

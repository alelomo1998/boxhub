package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
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
            // decode sanity: reject files that merely claim an image content type (webp may lack a reader; sniff header instead)
            if (!"webp".equals(ext) && ImageIO.read(new java.io.ByteArrayInputStream(bytes)) == null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            if ("webp".equals(ext) && !(bytes.length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[8] == 'W'))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            Path dir = root.resolve(boxId.toString());
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            Files.write(dir.resolve(name), bytes);
            return "/media/" + boxId + "/" + name;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store file");
        }
    }
}

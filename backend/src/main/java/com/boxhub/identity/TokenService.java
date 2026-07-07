package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final Duration accessTtl;

    public TokenService(JwtEncoder encoder, @Value("${boxhub.jwt.access-ttl}") Duration accessTtl) {
        this.encoder = encoder;
        this.accessTtl = accessTtl;
    }

    public String userToken(User user) {
        return encode(baseClaims(user).claim("scope", "user").build());
    }

    public String boxToken(User user, Membership membership) {
        return encode(baseClaims(user)
                .claim("scope", "box")
                .claim("box_id", membership.getBox().getId().toString())
                .claim("role", membership.getRole())
                .build());
    }

    private JwtClaimsSet.Builder baseClaims(User user) {
        Instant now = Instant.now();
        return JwtClaimsSet.builder()
                .issuer("boxhub")
                .subject(user.getId().toString())
                .claim("name", user.getName())
                .issuedAt(now)
                .expiresAt(now.plus(accessTtl));
    }

    private String encode(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}

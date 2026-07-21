package com.boxhub.box;

import com.boxhub.shared.CryptoService;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Connect/disconnect a box's own Stripe restricted key + webhook secret. BoxStripe is
 * deliberately NOT @TenantId (it's keyed by boxId, not filtered by Hibernate's tenant
 * discriminator), so every read/write here scopes explicitly by TenantContext.requireBoxId() —
 * nothing else protects it. The key material never leaves encrypt()/decrypt(); this
 * controller only ever sees ciphertext from the repository and plaintext from the request body.
 */
@RestController
@RequestMapping("/api/box/stripe")
public class BoxStripeController {

    private final BoxStripeRepository stripeRepo;
    private final CryptoService crypto;

    public BoxStripeController(BoxStripeRepository stripeRepo, CryptoService crypto) {
        this.stripeRepo = stripeRepo;
        this.crypto = crypto;
    }

    record ConnectRequest(@NotBlank String restrictedKey, @NotBlank String webhookSecret) {}
    record StatusDto(boolean connected) {}

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void connect(@Valid @RequestBody ConnectRequest req) {
        RoleGuard.requireBoxAdmin();
        UUID boxId = TenantContext.requireBoxId();
        BoxStripe bs = stripeRepo.findByBoxId(boxId).orElseGet(BoxStripe::new);
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt(req.restrictedKey()));
        bs.setWebhookSecretEnc(crypto.encrypt(req.webhookSecret()));
        bs.setEnabled(true);
        stripeRepo.save(bs);
    }

    @GetMapping
    public StatusDto status() {
        RoleGuard.requireBoxAdmin();
        UUID boxId = TenantContext.requireBoxId();
        boolean connected = stripeRepo.findByBoxId(boxId).map(BoxStripe::isEnabled).orElse(false);
        return new StatusDto(connected);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disconnect() {
        RoleGuard.requireBoxAdmin();
        UUID boxId = TenantContext.requireBoxId();
        stripeRepo.findByBoxId(boxId).ifPresent(stripeRepo::delete);
    }
}

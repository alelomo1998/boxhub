package com.boxhub.identity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 8, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}

    record UserResponse(UUID id, String email, String name) {}

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        User u = authService.register(req.email(), req.password(), req.name());
        return new UserResponse(u.getId(), u.getEmail(), u.getName());
    }
}

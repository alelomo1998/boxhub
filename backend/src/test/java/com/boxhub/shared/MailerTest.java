package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class MailerTest extends AbstractIntegrationTest {

    @Autowired Mailer mailer;
    @MockitoBean JavaMailSender sender;

    @Test
    void rendersTheTemplateAndSendsIt() throws Exception {
        when(sender.createMimeMessage()).thenReturn(new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null));

        mailer.send("athlete@t.io", "Verify your email", "verify",
                Map.of("name", "Alessandro", "link", "https://boxhub.test/verify?token=abc"));

        ArgumentCaptor<MimeMessage> captured = ArgumentCaptor.forClass(MimeMessage.class);
        // send() is @Async — it returns before the background thread calls sender.send(),
        // so a plain verify() races the async thread. timeout() polls instead of asserting
        // immediately. (Deviation from the brief's literal test: see task-4-report.md.)
        verify(sender, timeout(2000)).send(captured.capture());

        String body = bodyOf(captured.getValue());
        assertThat(body).contains("Alessandro");
        assertThat(body).contains("https://boxhub.test/verify?token=abc");
    }

    @Test
    void aSendFailureIsSwallowedNotThrown() {
        when(sender.createMimeMessage()).thenReturn(new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null));
        doThrow(new org.springframework.mail.MailSendException("smtp down")).when(sender).send(any(MimeMessage.class));

        // Signup must not 500 because the mail server hiccuped — the user can always resend.
        mailer.send("athlete@t.io", "Verify your email", "verify", Map.of("name", "A", "link", "https://x/y"));
    }

    private String bodyOf(MimeMessage msg) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        msg.writeTo(out);
        return out.toString();
    }
}

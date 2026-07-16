package com.boxhub.identity;

import org.springframework.stereotype.Service;

// M8 T7 fills this in
@Service
public class LoginThrottleService {
    public void assertNotThrottled(User user) {}
    public void recordFailure(User user) {}
    public void recordSuccess(User user) {}
}

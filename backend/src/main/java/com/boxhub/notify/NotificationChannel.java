package com.boxhub.notify;

/** IN_APP is the only channel M29b delivers. PUSH is M27c's, SMS is M32b's (registry §2). */
public enum NotificationChannel {
    IN_APP, PUSH, SMS
}

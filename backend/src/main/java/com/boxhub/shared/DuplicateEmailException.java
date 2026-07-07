package com.boxhub.shared;

public class DuplicateEmailException extends RuntimeException {
    public DuplicateEmailException() { super("Email already registered"); }
}

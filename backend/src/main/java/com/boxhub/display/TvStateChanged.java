package com.boxhub.display;

import java.util.UUID;

/** Fired after any write that changes what a TV should show (scores, check-ins). */
public record TvStateChanged(UUID boxId) {}

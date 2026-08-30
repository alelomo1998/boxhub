import { Injectable, signal } from '@angular/core';

/** Root-provided so a screen (the conversation composer) and the three shells share one flag
 *  without a parent/child input chain. */
@Injectable({ providedIn: 'root' })
export class ShellChromeService {
  /** Set by a screen that needs the whole viewport bottom (the conversation composer).
      The shells hide the dock and drop its reserved padding while this is true. */
  readonly dockHidden = signal(false);
}

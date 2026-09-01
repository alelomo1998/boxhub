import { Component, OnInit, OnDestroy, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../ui/icon.component';
import { MessagingService } from './messaging.service';

/**
 * The header envelope shared by all three shells (athlete, coach, admin) — the user's ruling was
 * "only on the header, not the dock", so this is the ONE place any shell signals unread messages.
 * Owns the unread badge, its aria-label and the 60s poll/pause-on-hidden lifecycle, so the three
 * shells render it rather than each hand-copying that logic (which would drift). Projected into
 * bh-shell-header's [actions] slot — the host tag itself carries the `actions` attribute where
 * this is used, since ng-content selects on the host, not on anything inside this component.
 */
@Component({
  selector: 'bh-messages-envelope',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <a class="envelope" [routerLink]="route()" [attr.data-testid]="testId()"
       [attr.aria-label]="linkAriaLabel()">
      <bh-icon name="mail" [size]="20" />
      @if (unread() > 0) {
        <span class="badge" aria-hidden="true">{{ badgeLabel() }}</span>
      }
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* .envelope inherits its base look (tap size, colour, hover, focus ring) from shell-header's
       ::ng-deep .acts a — it only needs the badge's own positioning here. --bone on --surface-2,
       never --volt: the switcher's mark already spent this shell's volt budget (design law). */
    .envelope { position: relative; }
    .badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px;
      padding: 0 4px; display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--r-full); background: var(--surface-2); border: 1px solid var(--hairline);
      color: var(--bone); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-variant-numeric: tabular-nums; line-height: 1; }
  `],
})
export class MessagesEnvelopeComponent implements OnInit, OnDestroy {
  protected messaging = inject(MessagingService);

  /** Per-shell target: /athlete/messages, /coach/inbox, /admin/messages. */
  route = input.required<string>();
  /** Per-shell data-testid, e.g. "athlete-messages-link", "coach-messages-link". */
  testId = input.required<string>();

  unread = this.messaging.unread;

  // Ambient chrome, not the messages screen itself — 60s here, the screen polls its own thread
  // at 20s while open (M29a Task 8).
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  // Three messages, not an interpolated one. The placeholder name must follow its expression
  // IMMEDIATELY (`${n}:count:`) — written at the end of the string it is not parsed as a
  // placeholder at all and ships as literal text: `$localize` rendered the first draft of this
  // as "5 unread messages:count:", read out verbatim by a screen reader, past both Karma and
  // the production build. Splitting one/other also gives translators a real plural.
  protected linkAriaLabel = computed(() => {
    const n = this.unread();
    if (n === 0) return $localize`:@@messages.link.aria:Messages`;
    if (n === 1) return $localize`:@@messages.link.aria.one:1 unread message`;
    return $localize`:@@messages.link.aria.many:${n}:count: unread messages`;
  });

  protected badgeLabel = computed(() => {
    const n = this.unread();
    return n > 99 ? '99+' : String(n);
  });

  ngOnInit() {
    this.messaging.refreshUnread();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  private startPoll() {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.messaging.refreshUnread(), 60000);
  }

  private stopPoll() {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }
}

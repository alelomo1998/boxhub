import { Component, OnInit, OnDestroy, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../ui/icon.component';
import { NotificationService } from './notification.service';

/**
 * The header bell, shared by all three shells — the sibling of bh-messages-envelope, which owns
 * messages and their own read marker. Two badges, two things: the feed never shows messages, so
 * neither badge can count what the other counts (M29b D-2).
 *
 * Projected into bh-shell-header's [actions] slot; the HOST tag carries the `actions` attribute,
 * because ng-content selects on the host and not on anything inside this component.
 */
@Component({
  selector: 'bh-notification-bell',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <a class="bell" [routerLink]="route()" [attr.data-testid]="testId()"
       [attr.aria-label]="linkAriaLabel()">
      <bh-icon name="bell" [size]="20" />
      @if (unread() > 0) {
        <span class="badge" aria-hidden="true">{{ badgeLabel() }}</span>
      }
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* .bell inherits its base look from shell-header's ::ng-deep .acts a — tap size, colour,
       hover, focus ring. Only the badge's positioning lives here. --bone on --surface-2, never
       --volt: the switcher's mark already spent this shell's volt budget (design law), and the
       envelope beside it is styled the same way for the same reason. */
    .bell { position: relative; }
    .badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px;
      padding: 0 4px; display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--r-full); background: var(--surface-2); border: 1px solid var(--hairline);
      color: var(--bone); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-variant-numeric: tabular-nums; line-height: 1; }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  protected notifications = inject(NotificationService);

  /** Per-shell target: /athlete/notifications, /coach/notifications, /admin/notifications. */
  route = input.required<string>();
  testId = input.required<string>();

  unread = this.notifications.unread;

  // Ambient chrome, so 60s — the same cadence as the envelope beside it. The feed page polls
  // nothing; it refetches on open.
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  // Three messages, not one interpolated string. The placeholder name MUST follow its expression
  // immediately (`${n}:count:`) — written at the end it is not parsed as a placeholder at all and
  // ships as literal text, read out verbatim by a screen reader, past both Karma and the build.
  protected linkAriaLabel = computed(() => {
    const n = this.unread();
    if (n === 0) return $localize`:@@notifications.link.aria:Notifications`;
    if (n === 1) return $localize`:@@notifications.link.aria.one:1 unread notification`;
    return $localize`:@@notifications.link.aria.many:${n}:count: unread notifications`;
  });

  protected badgeLabel = computed(() => {
    const n = this.unread();
    return n > 99 ? '99+' : String(n);
  });

  ngOnInit() {
    this.notifications.refreshUnread();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  private startPoll() {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.notifications.refreshUnread(), 60000);
  }

  private stopPoll() {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }
}

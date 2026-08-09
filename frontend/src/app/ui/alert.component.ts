import { Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/**
 * A standing message. Semantic colours stay quiet (law §3.1): a thin left rule and an icon, never
 * a filled row or card — a --danger fill is permitted on a button or a chip and nothing larger.
 *
 * role is derived from tone rather than fixed. role="alert" interrupts a screen reader mid-sentence,
 * which is right for a failed save and wrong for "check your inbox".
 *
 * role="alert" / role="status" reliably announce only when the element carrying the role is
 * freshly inserted into the DOM — not when an already-mounted element's tone/content changes in
 * place. Mount and unmount `<bh-alert>` with `@if`, don't keep one instance permanently mounted
 * and flip its tone/message via signals, or the announcement can silently not fire.
 */
@Component({
  selector: 'bh-alert',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="alert {{ tone() }}" [attr.role]="role()">
      <bh-icon [name]="icon()" [size]="16" />
      <span class="msg"><ng-content /></span>
    </div>`,
  styles: [`
    .alert { display: flex; align-items: flex-start; gap: var(--sp-2);
      padding: var(--sp-3); border: 1px solid var(--hairline);
      border-left-width: var(--bw-accent); border-radius: var(--r-ctl);
      background: var(--surface); font-size: var(--fs-sm); color: var(--bone); }
    .msg { flex: 1; }
    .danger { border-left-color: var(--danger); } .danger bh-icon { color: var(--danger); }
    .warn   { border-left-color: var(--warn); }   .warn   bh-icon { color: var(--warn); }
    .good   { border-left-color: var(--good); }   .good   bh-icon { color: var(--good); }
    .info   { border-left-color: var(--faint); }  .info   bh-icon { color: var(--faint); }
  `],
})
export class AlertComponent {
  tone = input<'danger' | 'warn' | 'good' | 'info'>('danger');

  role = computed(() => (this.tone() === 'danger' || this.tone() === 'warn' ? 'alert' : 'status'));

  icon = computed<IconName>(() => {
    switch (this.tone()) {
      case 'danger': return 'circle-alert';
      case 'warn': return 'triangle-alert';
      case 'good': return 'check';
      default: return 'info';
    }
  });
}

import { Component, Input, computed, signal } from '@angular/core';

/** Athlete/coach avatar: photo when present, initials fallback. Sizes: sm 28, md 44, lg 72, xl 96. */
@Component({
  selector: 'bh-avatar',
  standalone: true,
  template: `
    @if (path && !broken()) {
      <img class="av {{ size }}" [src]="path" [alt]="name" (error)="broken.set(true)" loading="lazy" />
    } @else {
      <span class="av init {{ size }}" [attr.aria-label]="name">{{ initials() }}</span>
    }
  `,
  styles: [`
    .av { border-radius: 50%; object-fit: cover; display: inline-grid; place-items: center;
      background: var(--surface-2); border: 1px solid var(--hairline); box-sizing: border-box;
      flex-shrink: 0; }
    .init { font-family: var(--font-display); font-weight: 700; color: var(--bone-dim);
      text-transform: uppercase; user-select: none; }
    .sm { width: 28px; height: 28px; font-size: 11px; }
    .md { width: 44px; height: 44px; font-size: 16px; }
    .lg { width: 72px; height: 72px; font-size: 24px; }
    .xl { width: 96px; height: 96px; font-size: 32px; }
  `],
})
export class AvatarComponent {
  @Input() path: string | null = null;
  @Input() name = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  broken = signal(false);

  initials = computed(() => this.name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('') || '?');
}

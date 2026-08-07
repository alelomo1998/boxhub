import { Component, computed, input, signal } from '@angular/core';

/** Athlete/coach avatar: photo when present, initials fallback. Sizes: sm 28, md 44, lg 72, xl 96. */
@Component({
  selector: 'bh-avatar',
  standalone: true,
  template: `
    @if (path() && !broken()) {
      <img class="av {{ size() }}" [src]="path()" [alt]="name()" (error)="broken.set(true)" loading="lazy" />
    } @else {
      <span class="av {{ size() }}">
        <span class="init" [attr.aria-label]="name()">{{ initials() }}</span>
      </span>
    }
  `,
  styles: [`
    .av { border-radius: 50%; object-fit: cover; display: inline-grid; place-items: center;
      background: var(--surface-2); border: 1px solid var(--hairline); box-sizing: border-box;
      flex-shrink: 0; container-type: inline-size; }
    /* An initials badge is a glyph filling a circle, not type on the type scale — it scales with
       the circle rather than reading a fixed px or a token. See M13c Task 9.
       A plain percent font-size is relative to the INHERITED font-size, not this element's own
       box — it would render identically tiny at every size. cqi (container query inline-size) is
       the CSS primitive that actually ties font-size to a box's own width — but a container query
       container can't size itself off its own cqi units (that's circular, and resolves to 0), so
       .av (the sized box) carries container-type and .init (its child) reads 36cqi off it. */
    .init { font-family: var(--font-display); font-weight: 700; color: var(--bone-dim);
      text-transform: uppercase; user-select: none; font-size: 36cqi; }
    .sm { width: 28px; height: 28px; }
    .md { width: 44px; height: 44px; }
    .lg { width: 72px; height: 72px; }
    .xl { width: 96px; height: 96px; }
  `],
})
export class AvatarComponent {
  path = input<string | null>(null);
  name = input('');
  size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  broken = signal(false);

  initials = computed(() => this.name().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('') || '?');
}

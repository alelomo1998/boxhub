import { Injectable, signal } from '@angular/core';

type Theme = 'dark' | 'light';
const KEY = 'bh_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  constructor() {
    const saved = localStorage.getItem(KEY) as Theme | null;
    this.apply(saved === 'light' ? 'light' : 'dark');
  }

  toggle(): void { this.apply(this.theme() === 'dark' ? 'light' : 'dark'); }
  set(t: Theme): void { this.apply(t); }

  private apply(t: Theme): void {
    this.theme.set(t);
    document.documentElement.dataset['theme'] = t;
    localStorage.setItem(KEY, t);
  }
}

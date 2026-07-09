import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  it('defaults to dark and sets data-theme', () => {
    const s = TestBed.inject(ThemeService);
    expect(s.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('toggle flips theme, persists, updates attribute', () => {
    const s = TestBed.inject(ThemeService);
    s.toggle();
    expect(s.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('bh_theme')).toBe('light');
  });

  it('restores persisted theme on construction', () => {
    localStorage.setItem('bh_theme', 'light');
    const s = TestBed.inject(ThemeService);
    expect(s.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});

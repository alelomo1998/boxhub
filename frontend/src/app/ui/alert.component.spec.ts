import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AlertComponent } from './alert.component';

@Component({
  standalone: true,
  imports: [AlertComponent],
  template: `<bh-alert [tone]="t()">Something went wrong</bh-alert>`,
})
class Host { t = signal<'danger' | 'warn' | 'good' | 'info'>('danger'); }

describe('AlertComponent', () => {
  let f: any;
  const box = (): HTMLElement => f.nativeElement.querySelector('.alert');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('announces a danger alert assertively', () => {
    expect(box().getAttribute('role')).toBe('alert');
    expect(box().textContent).toContain('Something went wrong');
  });

  it('carries an icon as well as colour', () => {
    // Law §11: --good / --warn / --danger always accompany text or an icon, never stand alone.
    expect(box().querySelector('svg')).toBeTruthy();
  });

  it('a non-urgent tone is a status, not an alert', () => {
    f.componentInstance.t.set('info');
    f.detectChanges();
    // role="alert" interrupts a screen reader. "Check your inbox" must not.
    expect(box().getAttribute('role')).toBe('status');
  });

  it('changes tone class reactively', () => {
    expect(box().className).toContain('danger');
    f.componentInstance.t.set('good');
    f.detectChanges();
    expect(box().className).toContain('good');
    expect(box().className).not.toContain('danger');
  });

  it('gives each tone a visibly distinct icon', () => {
    // Colour-blind users rely on the icon, not the tone colour, to tell alerts apart —
    // this must fail if any two tones ever collapse onto the same glyph.
    const tones: Array<'danger' | 'warn' | 'good' | 'info'> = ['danger', 'warn', 'good', 'info'];
    const svgs = tones.map((tone) => {
      f.componentInstance.t.set(tone);
      f.detectChanges();
      return box().querySelector('svg')!.outerHTML;
    });
    expect(new Set(svgs).size).toBe(tones.length);
  });

  it('maps every tone to its correct role', () => {
    const expected: Record<'danger' | 'warn' | 'good' | 'info', 'alert' | 'status'> = {
      danger: 'alert', warn: 'alert', good: 'status', info: 'status',
    };
    for (const tone of Object.keys(expected) as Array<keyof typeof expected>) {
      f.componentInstance.t.set(tone);
      f.detectChanges();
      expect(box().getAttribute('role')).toBe(expected[tone]);
    }
  });
});

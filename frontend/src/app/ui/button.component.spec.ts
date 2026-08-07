import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()" [label]="lbl()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  d = signal(false);
  l = signal(false);
  lbl = signal('');
}

describe('ButtonComponent', () => {
  let f: any;
  const btn = (): HTMLButtonElement => f.nativeElement.querySelector('button');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects content and defaults to a primary button', () => {
    expect(btn().textContent).toContain('Save');
    expect(btn().className).toContain('primary');
    expect(btn().type).toBe('button');
    expect(btn().disabled).toBe(false);
  });

  it('reacts to a changed input — signal inputs, not a cached decorator field', () => {
    f.componentInstance.v.set('danger');
    f.detectChanges();
    expect(btn().className).toContain('danger');
    expect(btn().className).not.toContain('primary');
  });

  it('loading disables the button and announces itself', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(btn().getAttribute('aria-busy')).toBe('true');
    // A pending save must not be submittable twice.
    expect(btn().disabled).toBe(true);
    // The label survives — a button that swaps its text for a spinner loses its accessible name.
    expect(btn().textContent).toContain('Save');
  });

  it('is not aria-busy when idle', () => {
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });

  it('disabled and loading are independent', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });

  it('label puts aria-label on the inner button, and no label means no attribute at all', () => {
    // No label set: must be absent, not an empty string — an empty aria-label can override
    // the projected text as the accessible name.
    expect(btn().getAttribute('aria-label')).toBeNull();

    f.componentInstance.lbl.set('Log out');
    f.detectChanges();
    expect(btn().getAttribute('aria-label')).toBe('Log out');
    // The literal selector shape e2e/tests/onboarding.spec.ts uses.
    expect(f.nativeElement.querySelector('button[aria-label="Log out"]')).not.toBeNull();
  });

  it('a loading icon button shows only the spinner; a loading text button keeps its content', () => {
    f.componentInstance.v.set('icon');
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(btn().textContent).not.toContain('Save');
    expect(btn().querySelector('.spin')).not.toBeNull();

    f.componentInstance.v.set('primary');
    f.detectChanges();
    expect(btn().textContent).toContain('Save');
    expect(btn().querySelector('.spin')).not.toBeNull();
  });

  it('toggling loading back off restores the button', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    f.componentInstance.l.set(false);
    f.detectChanges();
    expect(btn().disabled).toBe(false);
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });
});

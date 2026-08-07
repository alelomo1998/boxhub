import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  d = signal(false);
  l = signal(false);
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
});

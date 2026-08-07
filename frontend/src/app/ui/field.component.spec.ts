import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { FieldComponent } from './field.component';

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" [(value)]="v" [error]="e()" [disabled]="d()" />`,
})
class Host {
  v = signal('');
  e = signal<string | undefined>(undefined);
  d = signal(false);
}

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" testId="email-field" />`,
})
class TestIdHost {}

describe('FieldComponent', () => {
  let f: any;
  const input = (): HTMLInputElement => f.nativeElement.querySelector('input');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host, TestIdHost] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('wires the label to the input programmatically', () => {
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBeTruthy();
    expect(label.htmlFor).toBe(input().id);
  });

  it('two-way binds the value', () => {
    input().value = 'a@b.io';
    input().dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('a@b.io');
  });

  it('an error is announced, not merely coloured', () => {
    f.componentInstance.e.set('Required');
    f.detectChanges();
    // Law §11: colour is never the only signal.
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const describedBy = input().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const msg = f.nativeElement.querySelector('#' + describedBy);
    expect(msg.textContent).toContain('Required');
  });

  it('has no aria-invalid and no describedby when valid', () => {
    expect(input().getAttribute('aria-invalid')).toBe('false');
    expect(input().getAttribute('aria-describedby')).toBeNull();
  });

  it('disables the input', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(input().disabled).toBe(true);
  });

  it('generates a unique id per instance', async () => {
    const g = TestBed.createComponent(Host);
    g.detectChanges();
    expect(g.nativeElement.querySelector('input').id).not.toBe(input().id);
  });

  it('forwards testId to the inner input, not the host, and omits it when unset', () => {
    expect(input().getAttribute('data-testid')).toBeNull();
    expect(f.nativeElement.getAttribute('data-testid')).toBeNull();

    const g = TestBed.createComponent(TestIdHost);
    g.detectChanges();
    const gInput: HTMLInputElement = g.nativeElement.querySelector('input');
    expect(gInput.getAttribute('data-testid')).toBe('email-field');
    expect(g.nativeElement.getAttribute('data-testid')).toBeNull();
  });
});

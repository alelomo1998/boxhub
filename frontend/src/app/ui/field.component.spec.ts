import { TestBed } from '@angular/core/testing';
import { FieldComponent } from './field.component';

describe('FieldComponent', () => {
  it('renders label and emits valueChange on input', () => {
    const f = TestBed.createComponent(FieldComponent);
    f.componentRef.setInput('label', 'Email');
    let emitted = '';
    f.componentInstance.valueChange.subscribe((v: string) => (emitted = v));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Email');
    const input = f.nativeElement.querySelector('input');
    input.value = 'a@b.io'; input.dispatchEvent(new Event('input'));
    expect(emitted).toBe('a@b.io');
  });
  it('shows error text when set', () => {
    const f = TestBed.createComponent(FieldComponent);
    f.componentRef.setInput('label', 'Email');
    f.componentRef.setInput('error', 'Required');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Required');
  });
});

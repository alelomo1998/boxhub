import { TestBed } from '@angular/core/testing';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({ standalone: true, imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<bh-button [variant]="v">Go</bh-button>` })
class Host { v: 'primary' | 'ghost' = 'primary'; }

describe('ButtonComponent', () => {
  it('renders projected content and a native button', () => {
    const f = TestBed.createComponent(Host); f.detectChanges();
    expect(f.nativeElement.querySelector('button').textContent.trim()).toBe('Go');
  });
  it('applies variant class', () => {
    const f = TestBed.createComponent(Host); f.detectChanges();
    expect(f.nativeElement.querySelector('button').className).toContain('primary');
    f.componentInstance.v = 'ghost'; f.detectChanges();
    expect(f.nativeElement.querySelector('button').className).toContain('ghost');
  });
});

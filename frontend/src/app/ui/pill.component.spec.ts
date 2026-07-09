import { TestBed } from '@angular/core/testing';
import { PillComponent } from './pill.component';

describe('PillComponent', () => {
  it('renders label and tone class', () => {
    const f = TestBed.createComponent(PillComponent);
    f.componentRef.setInput('tone', 'live');
    f.componentRef.setInput('label', 'Live now');
    f.detectChanges();
    const el = f.nativeElement.querySelector('.pill');
    expect(el.className).toContain('live');
    expect(el.textContent).toContain('Live now');
  });
});

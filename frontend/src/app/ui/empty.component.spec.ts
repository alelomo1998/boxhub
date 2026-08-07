import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { EmptyComponent } from './empty.component';

@Component({
  standalone: true,
  imports: [EmptyComponent],
  template: `<bh-empty title="No classes" message="Nothing booked yet.">
    <button>Book one</button>
  </bh-empty>`,
})
class Host {}

describe('EmptyComponent', () => {
  it('renders title, message, icon and a projected action', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;

    expect(el.textContent).toContain('No classes');
    expect(el.textContent).toContain('Nothing booked yet.');
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.querySelector('button')?.textContent).toContain('Book one');
    // Empty is a state, not an error — it must not interrupt.
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

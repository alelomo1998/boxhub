import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SwitchComponent } from './switch.component';

@Component({
  standalone: true,
  imports: [SwitchComponent],
  template: `<bh-switch [(checked)]="c" label="Private" hint="off the leaderboard" />`,
})
class Host { c = signal(false); }

describe('SwitchComponent', () => {
  let f: any;
  const sw = (): HTMLElement => f.nativeElement.querySelector('[role="switch"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('exposes its state and its accessible name', () => {
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(sw().textContent).toContain('Private');
    expect(sw().textContent).toContain('off the leaderboard');
  });

  it('toggles on click and reflects it in aria-checked', () => {
    sw().click();
    f.detectChanges();
    expect(f.componentInstance.c()).toBe(true);
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });

  it('meets the 44px target', () => {
    // Law §11.5. A 20px-tall toggle is the classic miss.
    expect(getComputedStyle(sw()).minHeight).toBe('44px');
  });
});

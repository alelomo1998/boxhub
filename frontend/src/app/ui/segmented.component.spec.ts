import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SegmentedComponent, SegOption } from './segmented.component';

@Component({
  standalone: true,
  imports: [SegmentedComponent],
  template: `<bh-segmented [options]="opts" [(value)]="v" label="Effort" />`,
})
class Host {
  opts: SegOption[] = [{ value: 'rx', label: 'RX' }, { value: 'sc', label: 'Scaled' }];
  v = signal('rx');
}

describe('SegmentedComponent', () => {
  let f: any;
  const radios = (): HTMLButtonElement[] =>
    Array.from(f.nativeElement.querySelectorAll('[role="radio"]'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('is a named radiogroup', () => {
    const g = f.nativeElement.querySelector('[role="radiogroup"]');
    expect(g).toBeTruthy();
    expect(g.getAttribute('aria-label')).toBe('Effort');
    expect(radios().length).toBe(2);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('uses a ROVING tabindex — the filed defect', () => {
    // Before M13c both buttons were tabbable, so Tab walked through the group instead of past it.
    // A radiogroup is ONE tab stop; arrows move within it.
    expect(radios()[0].tabIndex).toBe(0);
    expect(radios()[1].tabIndex).toBe(-1);
  });

  it('ArrowRight selects and focuses the next option', () => {
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
    expect(radios()[1].tabIndex).toBe(0);
    expect(radios()[0].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(radios()[1]);
  });

  it('ArrowLeft wraps from the first option to the last', () => {
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
  });

  it('clicking selects', () => {
    radios()[1].click();
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('sc');
  });
});

import { TestBed } from '@angular/core/testing';
import { DayPagerComponent } from './day-pager.component';

describe('DayPagerComponent', () => {
  it('clamps shift to [0, max] and updates the offset model only on real changes', () => {
    const fixture = TestBed.createComponent(DayPagerComponent);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('max', 13);
    fixture.detectChanges();
    const seen: number[] = [];
    cmp.shift(-1); // clamped at 0, no change
    seen.push(cmp.offset());
    cmp.shift(1);
    seen.push(cmp.offset());
    cmp.shift(1);
    seen.push(cmp.offset());
    expect(seen).toEqual([0, 1, 2]);
  });

  it('disables arrows at the bounds', () => {
    const fixture = TestBed.createComponent(DayPagerComponent);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('max', 1);
    fixture.detectChanges();
    const [prev, next] = fixture.nativeElement.querySelectorAll('button');
    expect(prev.disabled).toBeTrue();
    expect(next.disabled).toBeFalse();
    cmp.offset.set(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button')[1].disabled).toBeTrue();
  });

  it('keeps the Previous day / Next day aria-labels e2e depends on', () => {
    const fixture = TestBed.createComponent(DayPagerComponent);
    fixture.detectChanges();
    const [prev, next] = fixture.nativeElement.querySelectorAll('button');
    expect(prev.getAttribute('aria-label')).toBe('Previous day');
    expect(next.getAttribute('aria-label')).toBe('Next day');
  });
});

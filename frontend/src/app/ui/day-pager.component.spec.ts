import { TestBed } from '@angular/core/testing';
import { DayPagerComponent } from './day-pager.component';

describe('DayPagerComponent', () => {
  it('clamps shift to [0, max] and emits only real changes', () => {
    const fixture = TestBed.createComponent(DayPagerComponent);
    const cmp = fixture.componentInstance;
    cmp.offset = 0; cmp.max = 13;
    const emitted: number[] = [];
    cmp.offsetChange.subscribe((v: number) => emitted.push(v));
    cmp.shift(-1); // clamped at 0, no emit
    cmp.shift(1);
    cmp.shift(1);
    expect(emitted).toEqual([1, 2]);
  });

  it('disables arrows at the bounds', () => {
    const fixture = TestBed.createComponent(DayPagerComponent);
    const cmp = fixture.componentInstance;
    cmp.offset = 0; cmp.max = 1;
    fixture.detectChanges();
    const [prev, next] = fixture.nativeElement.querySelectorAll('button');
    expect(prev.disabled).toBeTrue();
    expect(next.disabled).toBeFalse();
    cmp.offset = 1;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button')[1].disabled).toBeTrue();
  });
});

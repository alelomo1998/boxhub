import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SelectComponent } from './select.component';

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" [(value)]="v">
    <option value="a">A</option><option value="b">B</option>
  </bh-select>`,
})
class Host { v = signal('a'); }

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" testId="plan-select"><option value="a">A</option></bh-select>`,
})
class TestIdHost {}

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" [(value)]="v">
    @for (o of opts(); track o) { <option [value]="o">{{ o }}</option> }
  </bh-select>`,
})
class DynHost {
  v = signal('b');
  opts = signal<string[]>([]);
}

describe('SelectComponent', () => {
  let f: any;
  const sel = (): HTMLSelectElement => f.nativeElement.querySelector('select');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host, TestIdHost, DynHost] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects options and wires its label', () => {
    expect(sel().querySelectorAll('option').length).toBe(2);
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(sel().id);
  });

  it('two-way binds on change', () => {
    sel().value = 'b';
    sel().dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('b');
  });

  it('forwards testId to the inner select, not the host, and omits it when unset', () => {
    expect(sel().getAttribute('data-testid')).toBeNull();
    expect(f.nativeElement.getAttribute('data-testid')).toBeNull();

    const g = TestBed.createComponent(TestIdHost);
    g.detectChanges();
    const gSel: HTMLSelectElement = g.nativeElement.querySelector('select');
    expect(gSel.getAttribute('data-testid')).toBe('plan-select');
    expect(g.nativeElement.getAttribute('data-testid')).toBeNull();
  });

  it('applies the bound value once async options land', () => {
    const d = TestBed.createComponent(DynHost);
    d.detectChanges();
    d.componentInstance.opts.set(['a', 'b', 'c']);
    d.detectChanges();
    const dSel: HTMLSelectElement = d.nativeElement.querySelector('select');
    expect(dSel.value).toBe('b');
  });

  it('still propagates a user selection back through value after options land', () => {
    const d = TestBed.createComponent(DynHost);
    d.detectChanges();
    d.componentInstance.opts.set(['a', 'b', 'c']);
    d.detectChanges();
    const dSel: HTMLSelectElement = d.nativeElement.querySelector('select');
    dSel.value = 'c';
    dSel.dispatchEvent(new Event('change'));
    d.detectChanges();
    expect(d.componentInstance.v()).toBe('c');
  });
});

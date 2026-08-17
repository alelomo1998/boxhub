import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SelectComponent } from './select.component';

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" [(value)]="v" [error]="e()">
    <option value="a">A</option><option value="b">B</option>
  </bh-select>`,
})
class Host {
  v = signal('a');
  e = signal<string | undefined>(undefined);
}

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

@Component({
  standalone: true,
  imports: [SelectComponent],
  template: `<bh-select label="Plan" name="plan" [required]="true"><option value=""></option></bh-select>`,
})
class AttrHost {}

describe('SelectComponent', () => {
  let f: any;
  const sel = (): HTMLSelectElement => f.nativeElement.querySelector('select');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host, TestIdHost, DynHost, AttrHost] }).compileComponents();
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

  it('re-announces a SECOND, different error by remounting the alert node', () => {
    f.componentInstance.e.set('Required');
    f.detectChanges();
    const first = f.nativeElement.querySelector('[role="alert"]');
    expect(first.textContent).toContain('Required');

    f.componentInstance.e.set('Invalid format');
    f.detectChanges();
    const second = f.nativeElement.querySelector('[role="alert"]');
    expect(second.textContent).toContain('Invalid format');

    // role="alert" announces reliably only on FRESH INSERTION, not when an already-mounted
    // node's text changes (bh-alert's own JSDoc states this mechanism). @if only tears the node
    // down across the falsy<->truthy boundary, so "Required" -> "Invalid format" mutated the SAME
    // node and the second message was silent. Re-validation producing a second message is the
    // normal case on eleven form screens, not an edge case.
    expect(second).not.toBe(first);
  });

  it('puts name and required on the INNER select, never the host', () => {
    const g = TestBed.createComponent(AttrHost);
    g.detectChanges();
    const gSel: HTMLSelectElement = g.nativeElement.querySelector('select');
    expect(gSel.getAttribute('name')).toBe('plan');
    expect(gSel.required).toBe(true);
    // An attribute written on a component's host does not reach the element inside it — the
    // failure that cost M13c four separate fixes.
    expect(g.nativeElement.getAttribute('name')).toBeNull();
  });

  it('omits name entirely when unset', () => {
    expect(sel().getAttribute('name')).toBeNull();
    expect(sel().required).toBe(false);
  });

  it('renders the required asterisk, aria-hidden, when required is true', () => {
    const g = TestBed.createComponent(AttrHost); // sets [required]="true"
    g.detectChanges();
    const marker = g.nativeElement.querySelector('label .req');
    expect(marker).withContext('AttrHost sets required=true').not.toBeNull();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  it('omits the required asterisk when required is false (the default)', () => {
    // Host's <bh-select> does not bind [required], so it defaults to false.
    expect(f.nativeElement.querySelector('label .req')).toBeNull();
  });
});

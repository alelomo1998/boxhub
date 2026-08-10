import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { FieldComponent } from './field.component';

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" [(value)]="v" [error]="e()" [disabled]="d()" />`,
})
class Host {
  v = signal('');
  e = signal<string | undefined>(undefined);
  d = signal(false);
}

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" testId="email-field" />`,
})
class TestIdHost {}

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email" name="email" autocomplete="username" [required]="true" />`,
})
class AttrHost {}

@Component({
  standalone: true,
  imports: [FieldComponent],
  template: `<bh-field label="Email"><a labelAction data-testid="action">Forgot?</a></bh-field>`,
})
class ActionHost {}

@Component({
  standalone: true,
  imports: [FieldComponent],
  // Long, narrow-width, locale-length strings — reproduces the 320px/200%-zoom/Spanish
  // conditions that caught the original absolute-positioning overlap.
  template: `<div style="width: 320px">
    <bh-field label="CONTRASEÑA">
      <a labelAction data-testid="action" style="font-size: 12px">¿Olvidaste tu contraseña?</a>
    </bh-field>
  </div>`,
})
class OverlapHost {}

describe('FieldComponent', () => {
  let f: any;
  const input = (): HTMLInputElement => f.nativeElement.querySelector('input');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host, TestIdHost, AttrHost, ActionHost, OverlapHost],
    }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('wires the label to the input programmatically', () => {
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBeTruthy();
    expect(label.htmlFor).toBe(input().id);
  });

  it('two-way binds the value', () => {
    input().value = 'a@b.io';
    input().dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('a@b.io');
  });

  it('an error is announced, not merely coloured', () => {
    f.componentInstance.e.set('Required');
    f.detectChanges();
    // Law §11: colour is never the only signal.
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const describedBy = input().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const msg = f.nativeElement.querySelector('#' + describedBy);
    expect(msg.textContent).toContain('Required');
  });

  it('has no aria-invalid and no describedby when valid', () => {
    expect(input().getAttribute('aria-invalid')).toBe('false');
    expect(input().getAttribute('aria-describedby')).toBeNull();
  });

  it('disables the input', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(input().disabled).toBe(true);
  });

  it('generates a unique id per instance', async () => {
    const g = TestBed.createComponent(Host);
    g.detectChanges();
    expect(g.nativeElement.querySelector('input').id).not.toBe(input().id);
  });

  it('forwards testId to the inner input, not the host, and omits it when unset', () => {
    expect(input().getAttribute('data-testid')).toBeNull();
    expect(f.nativeElement.getAttribute('data-testid')).toBeNull();

    const g = TestBed.createComponent(TestIdHost);
    g.detectChanges();
    const gInput: HTMLInputElement = g.nativeElement.querySelector('input');
    expect(gInput.getAttribute('data-testid')).toBe('email-field');
    expect(g.nativeElement.getAttribute('data-testid')).toBeNull();
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

  it('puts name, autocomplete and required on the INNER input, never the host', () => {
    const g = TestBed.createComponent(AttrHost);
    g.detectChanges();
    const gInput: HTMLInputElement = g.nativeElement.querySelector('input');
    expect(gInput.getAttribute('name')).toBe('email');
    expect(gInput.getAttribute('autocomplete')).toBe('username');
    expect(gInput.required).toBe(true);
    // An attribute written on a component's host does not reach the element inside it — the
    // failure that cost M13c four separate fixes.
    expect(g.nativeElement.getAttribute('name')).toBeNull();
    expect(g.nativeElement.getAttribute('autocomplete')).toBeNull();
  });

  it('omits name and autocomplete entirely when unset', () => {
    expect(input().getAttribute('name')).toBeNull();
    expect(input().getAttribute('autocomplete')).toBeNull();
    expect(input().required).toBe(false);
  });

  it('projects a labelAction element into the label row, beside the label', () => {
    const g = TestBed.createComponent(ActionHost);
    g.detectChanges();
    const row: HTMLElement = g.nativeElement.querySelector('.lab-row');
    expect(row).toBeTruthy();
    const label = row.querySelector('label');
    const action = row.querySelector('[data-testid="action"]');
    expect(label).toBeTruthy();
    expect(action).toBeTruthy();
    expect(action!.textContent).toContain('Forgot?');
    // Both land as children of the same flex row, not one absolutely positioned over the field.
    expect(label!.parentElement).toBe(row);
    expect(action!.parentElement).toBe(row);
  });

  it('renders the label row with only the label when nothing is projected into labelAction', () => {
    // Nothing is projected in the default Host fixture — an empty <ng-content> must not leave a
    // stray node (and therefore no stray flex gap) behind.
    const row: HTMLElement = f.nativeElement.querySelector('.lab-row');
    expect(row).toBeTruthy();
    expect(row.children.length).toBe(1);
    expect(row.children[0].tagName).toBe('LABEL');
  });

  it('never overlaps the label and a projected action, even at long locale-length strings in a ' +
     'narrow container — the flex row guarantees disjoint boxes, it is not a tuned pixel value', () => {
    const g = TestBed.createComponent(OverlapHost);
    // Real layout requires the element to be in the document — Angular does not attach fixtures
    // to the DOM by default, and getBoundingClientRect on a detached node is meaningless.
    document.body.appendChild(g.nativeElement);
    g.detectChanges();

    const label = g.nativeElement.querySelector('label') as HTMLElement;
    const action = g.nativeElement.querySelector('[data-testid="action"]') as HTMLElement;
    const l = label.getBoundingClientRect();
    const a = action.getBoundingClientRect();

    // Disjoint on at least one axis — the only way two boxes in a flex row (or a row that has
    // wrapped) can legitimately relate. Overlap on both axes is exactly what Finding 1 measured
    // (139px of horizontal overlap from `position: absolute`).
    const disjoint = l.right <= a.left || a.right <= l.left || l.bottom <= a.top || a.bottom <= l.top;
    expect(disjoint).toBeTrue();

    document.body.removeChild(g.nativeElement);
  });
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NumberStepperComponent } from './number-stepper.component';

// Signal fields, not plain ones: every real caller binds through signals, and a plain field
// would never mark this OnPush component dirty. The harness matches the app.
@Component({
  standalone: true,
  imports: [NumberStepperComponent],
  template: `<bh-number-stepper [(value)]="value" [min]="min()" [max]="max()" [step]="step()"
                                 [allowDecimal]="allowDecimal()" [suffix]="suffix()"
                                 [label]="label()" [labelInteractive]="labelInteractive()"
                                 (labelAction)="onLabelAction()"
                                 ariaLabel="Reps" testId="reps" />`,
})
class Host {
  value = signal('');
  min = signal<number | null>(null);
  max = signal<number | null>(null);
  step = signal(1);
  allowDecimal = signal(false);
  suffix = signal('');
  label = signal('');
  labelInteractive = signal(false);
  labelActionCount = 0;
  onLabelAction() { this.labelActionCount++; }
}

describe('NumberStepperComponent', () => {
  let f: any, host: Host, el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    host = f.componentInstance;
    el = f.nativeElement;
    f.detectChanges();
  });

  const input = () => el.querySelector('[data-testid="reps"]') as HTMLInputElement;
  const dec = () => el.querySelector('[data-testid="reps-dec"]') as HTMLButtonElement;
  const inc = () => el.querySelector('[data-testid="reps-inc"]') as HTMLButtonElement;

  // Press the real control, not the component's step() method — a spec that calls a handler
  // cannot see a dead binding.
  const press = (btn: HTMLButtonElement) => {
    btn.dispatchEvent(new PointerEvent('pointerdown'));
    f.detectChanges();
    btn.dispatchEvent(new PointerEvent('pointerup'));
    f.detectChanges();
  };

  const type = (v: string) => {
    const i = input();
    i.value = v;
    i.dispatchEvent(new Event('input'));
    f.detectChanges();
  };

  it('increments an empty field to the step value', () => {
    press(inc());
    expect(input().value).toBe('1');
  });

  it('respects a custom step', () => {
    host.step.set(5);
    host.value.set('10');
    f.detectChanges();
    press(inc());
    expect(input().value).toBe('15');
  });

  it('clamps at min and disables the decrease button there', () => {
    host.min.set(0);
    host.value.set('1');
    f.detectChanges();
    press(dec());
    expect(input().value).toBe('0');
    expect(dec().disabled).toBeTrue();
  });

  it('clamps at max and disables the increase button there', () => {
    host.max.set(10);
    host.value.set('9');
    f.detectChanges();
    press(inc());
    expect(input().value).toBe('10');
    expect(inc().disabled).toBeTrue();
  });

  it('filters non-digit characters as typed, in the signal and the input', () => {
    type('12a3');
    expect(input().value).toBe('123');
    expect(host.value()).toBe('123');
  });

  it('drops the decimal point when allowDecimal is false', () => {
    type('4.5');
    expect(input().value).toBe('45');
  });

  it('keeps one decimal point and drops any additional one', () => {
    host.allowDecimal.set(true);
    f.detectChanges();
    type('4.5');
    expect(input().value).toBe('4.5');
    type('4.5.6');
    expect(input().value).toBe('4.56');
  });

  it('renders a non-numeric legacy value verbatim and disables both buttons', () => {
    host.value.set('21-15-9');
    f.detectChanges();
    expect(input().value).toBe('21-15-9');
    expect(dec().disabled).toBeTrue();
    expect(inc().disabled).toBeTrue();
  });

  it('puts ariaLabel and testId on the inner elements, not the host', () => {
    expect(input().getAttribute('aria-label')).toContain('Reps');
    expect(input().getAttribute('data-testid')).toBe('reps');
    expect(dec().getAttribute('data-testid')).toBe('reps-dec');
    expect(inc().getAttribute('data-testid')).toBe('reps-inc');
  });

  it('gives both buttons type="button" so they never submit a form', () => {
    expect(dec().getAttribute('type')).toBe('button');
    expect(inc().getAttribute('type')).toBe('button');
  });

  it('puts the suffix before the increment button, so a suffixed and unsuffixed stepper both end flush right on +', () => {
    host.suffix.set('kg');
    f.detectChanges();
    const suffixEl = el.querySelector('.suffix')!;
    // DOCUMENT_POSITION_FOLLOWING on inc() relative to suffixEl means suffixEl comes first.
    expect(suffixEl.compareDocumentPosition(inc()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ---- interactive label (movement units) --------------------------------------------------

  it('renders a plain, non-interactive span for the label by default', () => {
    host.label.set('REPS');
    f.detectChanges();
    const span = el.querySelector('.label')!;
    expect(span.textContent).toBe('REPS');
    expect(el.querySelector('.label-btn')).toBeNull();
  });

  it('renders the label as a button and emits labelAction when pressed, when interactive', () => {
    host.label.set('CAL');
    host.labelInteractive.set(true);
    f.detectChanges();
    const btn = el.querySelector('.label-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('CAL');
    btn.click();
    expect(host.labelActionCount).toBe(1);
  });

  it('gives the interactive label button type="button" so it never submits the form it lives in', () => {
    host.label.set('CAL');
    host.labelInteractive.set(true);
    f.detectChanges();
    const btn = el.querySelector('.label-btn') as HTMLButtonElement;
    expect(btn.getAttribute('type')).toBe('button');
  });
});

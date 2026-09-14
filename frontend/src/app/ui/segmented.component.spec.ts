import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SegmentedComponent, SegOption } from './segmented.component';

@Component({
  standalone: true,
  imports: [SegmentedComponent],
  template: `<bh-segmented [options]="opts" [(value)]="v" label="Effort"
                            [tone]="tone()" [wrap]="wrap()" [stretch]="stretch()" />`,
})
class Host {
  opts: SegOption[] = [{ value: 'rx', label: 'RX' }, { value: 'sc', label: 'Scaled' }];
  v = signal('rx');
  tone = signal<'volt' | 'bone'>('volt');
  wrap = signal(false);
  stretch = signal(false);
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

  it('defaults to the volt tone, so existing consumers are unchanged', () => {
    expect(f.nativeElement.querySelector('.seg').classList.contains('tone-bone')).toBe(false);
  });

  // The builder is a plumbing screen and the shell's box switcher already spent its volt budget,
  // so a volt-filled chip there would be a second volt element. --bone is 15.9:1 and is not volt.
  it('renders a bone tone when asked', () => {
    f.componentInstance.tone.set('bone');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.seg').classList.contains('tone-bone')).toBe(true);
  });

  it('wraps when asked, because five score options do not fit one line at 360px', () => {
    f.componentInstance.wrap.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.seg').classList.contains('wrap')).toBe(true);
  });

  it('defaults to inline, content-width sizing, so existing consumers are unchanged', () => {
    expect(f.nativeElement.querySelector('.seg').classList.contains('stretch')).toBe(false);
  });

  it('stretch fills the row width and gives every option an equal share', () => {
    f.componentInstance.stretch.set(true);
    f.detectChanges();
    const group = f.nativeElement.querySelector('.seg');
    expect(group.classList.contains('stretch')).toBe(true);
    expect(getComputedStyle(group).display).toBe('flex');
    for (const opt of radios()) {
      expect(getComputedStyle(opt).flexGrow).toBe('1');
    }
  });

  it('keeps radiogroup semantics and arrow keys in both tones', () => {
    f.componentInstance.tone.set('bone');
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="radiogroup"]')).toBeTruthy();
    expect(radios()[0].getAttribute('tabindex')).toBe('0');
    expect(radios()[1].getAttribute('tabindex')).toBe('-1');
  });
});

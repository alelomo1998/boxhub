import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  standalone: true,
  imports: [AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="split">
      <div panel><p class="eyebrow">Welcome back</p><h1>Log in to your box.</h1></div>
      <form><input /></form>
    </bh-auth-layout>`,
})
class SplitHost {}

@Component({
  standalone: true,
  imports: [AuthLayoutComponent],
  template: `
    <bh-auth-layout variant="narrow">
      <div panel><h1>All set.</h1></div>
      <p>Your email address has been updated.</p>
    </bh-auth-layout>`,
})
class NarrowHost {}

describe('AuthLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SplitHost, NarrowHost] }).compileComponents();
  });

  it('renders both slots in the split variant', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Welcome back');
    expect(f.nativeElement.textContent).toContain('Log in to your box.');
    expect(f.nativeElement.querySelector('form')).toBeTruthy();
  });

  it('renders the panel slot in the narrow variant too — it is never dropped', () => {
    // On phone the split collapses to stacked and the panel content moves ABOVE the form. It is
    // not hidden: dropping it would cost `join` its "You're invited / <box name>" on the primary
    // device, which is the one piece of context that screen exists to deliver.
    const f = TestBed.createComponent(NarrowHost);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('All set.');
  });

  it('marks the variant on the root so CSS, not TypeScript, does the layout', () => {
    const split = TestBed.createComponent(SplitHost);
    split.detectChanges();
    expect(split.nativeElement.querySelector('[data-variant="split"]')).toBeTruthy();

    const narrow = TestBed.createComponent(NarrowHost);
    narrow.detectChanges();
    expect(narrow.nativeElement.querySelector('[data-variant="narrow"]')).toBeTruthy();
  });

  // WHAT THE NEXT TWO TESTS DO AND DO NOT PROVE — read before trusting them.
  //
  // They assert that ONE <main> and ONE <bh-wordmark> exist in the rendered DOM. Both are real
  // accessibility properties: two <main>s is a broken landmark structure, and two wordmarks
  // duplicates the accessible name — M13b shipped exactly that bug, where the wordmark's split
  // glyphs computed as "rxedrxed".
  //
  // They do NOT protect against this component being rewritten as
  //     @if (variant() === 'split') { <main>…<bh-wordmark/>…</main> }
  //     @else                       { <main>…<bh-wordmark/>…</main> }
  // which is the duplication the class comment argues against. @if/@else are mutually exclusive,
  // so only one branch ever renders and BOTH counts are still 1 — these tests pass just as
  // happily against the duplicated version. Caught in review, recorded rather than papered over.
  //
  // That is not a gap to close with a cleverer assertion: single-markup-tree is a maintainability
  // property, and a behavioural test cannot see it. Code review is the guard. What is fixable is
  // the claim, so it is fixed here.

  it('renders exactly one main landmark', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('main').length).toBe(1);
  });

  it('renders exactly one wordmark, so the accessible name is not duplicated', () => {
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('bh-wordmark').length).toBe(1);
  });

  // Regression for the Task 3 bug: `.wrap` centred for the column direction, the >=720px block
  // flipped it to row but never re-declared `justify-content`, and the row then silently centred
  // instead of filling — 208px of dead background on each side at 1440x900. This runs in a real
  // ChromeHeadless (see gate command), so getBoundingClientRect reflects actual layout, not a
  // JSDOM stub — the assertions below only pass if the >=720px column actually renders wide.
  //
  // What this proves: `.wrap` is never the flexed-and-centred element at any width — it is
  // structurally impossible for a future direction change on it to reintroduce this bug, because
  // `.wrap` no longer owns a direction to flip. What it does NOT prove: it does not pin the exact
  // 46/54 split or the 760px card cap — those are covered by the manual/visual verification in
  // the task report, since a Karma spec has no baseline image to diff against.
  it('fills the split card edge-to-edge instead of leaving dead gutters (>=720px)', () => {
    if (window.innerWidth < 720) {
      pending(`karma window is ${window.innerWidth}px wide, below the 720px breakpoint this test needs`);
      return;
    }
    const f = TestBed.createComponent(SplitHost);
    f.detectChanges();
    const wrap = f.nativeElement.querySelector('.wrap') as HTMLElement;
    const card = f.nativeElement.querySelector('.card') as HTMLElement;
    const panel = f.nativeElement.querySelector('.panel') as HTMLElement;
    const body = f.nativeElement.querySelector('.body') as HTMLElement;

    // The bug: `.wrap` picked up flex-direction:row from the media query. It must not, ever.
    expect(getComputedStyle(wrap).flexDirection).toBe('column');
    // The fix's own axis-flip lives one level down.
    expect(getComputedStyle(card).flexDirection).toBe('row');

    const cardRect = card.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    // Panel starts at the card's own left edge — no leading gutter.
    expect(Math.abs(panelRect.left - cardRect.left)).toBeLessThanOrEqual(1);
    // Body reaches the card's own right edge — no trailing gutter. This is the exact defect: the
    // bug left ~208px of dead background between the form and the card's/viewport's right edge.
    expect(Math.abs(bodyRect.right - cardRect.right)).toBeLessThanOrEqual(1);
  });
});

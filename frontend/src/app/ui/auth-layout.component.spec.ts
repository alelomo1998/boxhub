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
});

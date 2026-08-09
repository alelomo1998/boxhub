import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AvatarComponent } from './avatar.component';

@Component({
  standalone: true,
  imports: [AvatarComponent],
  template: `<bh-avatar [name]="n()" [path]="null" size="md" />`,
})
class Host { n = signal('Ada Lovelace'); }

describe('AvatarComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('falls back to initials', () => {
    expect(f.nativeElement.querySelector('.init').textContent.trim()).toBe('AL');
  });

  it('RECOMPUTES initials when the name changes', () => {
    // THE DEFECT THIS TEST EXISTS FOR. Before M13c, `name` was a plain @Input() field read inside
    // computed(), so the computed had ZERO signal dependencies: it evaluated once and cached
    // forever. An @for member list reusing a DOM node showed the previous athlete's initials.
    // It type-checked, it rendered, and a spec that built the component once passed.
    f.componentInstance.n.set('Grace Hopper');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.init').textContent.trim()).toBe('GH');
  });

  it('keeps an accessible name on the initials fallback', () => {
    expect(f.nativeElement.querySelector('.init').getAttribute('aria-label')).toBe('Ada Lovelace');
  });
});

import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ShellHeaderComponent } from './shell-header.component';

@Component({
  standalone: true,
  imports: [ShellHeaderComponent],
  template: `<bh-shell-header boxName="Demo Box" area="Coach">
    <nav nav aria-label="Coach"><a href="#">Classes</a></nav>
    <button actions aria-label="Log out">x</button>
  </bh-shell-header>`,
})
class Host {}

describe('ShellHeaderComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('derives the mark from the box name, not from the brand', () => {
    // It was a hardcoded "B" for BoxHub until M13b, and survived the rename because one letter
    // does not look like a brand string.
    expect(f.nativeElement.querySelector('.mark').textContent.trim()).toBe('D');
    expect(f.nativeElement.querySelector('.bn').textContent).toContain('Demo Box');
  });

  it('renders the area as a separate label, not glued to the box name', () => {
    expect(f.nativeElement.querySelector('.bn').textContent).not.toContain('Coach');
    expect(f.nativeElement.querySelector('.area').textContent).toContain('Coach');
  });

  it('projects nav and actions into their slots', () => {
    expect(f.nativeElement.querySelector('[nav]')).toBeTruthy();
    expect(f.nativeElement.querySelector('[actions]')).toBeTruthy();
  });

  it('is a banner landmark exactly once', () => {
    expect(f.nativeElement.querySelectorAll('header').length).toBe(1);
  });
});

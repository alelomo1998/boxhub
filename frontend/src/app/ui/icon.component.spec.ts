import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { IconComponent, ICON_NAMES, IconName } from './icon.component';

@Component({
  standalone: true,
  imports: [IconComponent],
  template: `<bh-icon name="house" [size]="24" /><bh-icon name="users" />`,
})
class Host {}

@Component({
  standalone: true,
  imports: [IconComponent],
  template: `<bh-icon [name]="name()" />`,
})
class SingleIconHost {
  name = signal<IconName>(ICON_NAMES[0]);
}

describe('IconComponent', () => {
  it('renders inline SVG geometry, sized and decorative', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const svgs = f.nativeElement.querySelectorAll('svg');

    expect(svgs.length).toBe(2);
    // Geometry is real, not an empty shell.
    expect(svgs[0].querySelectorAll('path, circle, line, polyline, rect').length).toBeGreaterThan(0);
    expect(svgs[1].querySelectorAll('path, circle, line, polyline, rect').length).toBeGreaterThan(0);
    // Icons never carry meaning on their own (law §11).
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    // Colour follows text, so one component works on every surface including a volt fill.
    expect(svgs[0].getAttribute('stroke')).toBe('currentColor');
    expect(svgs[0].getAttribute('width')).toBe('24');
    expect(svgs[1].getAttribute('width')).toBe('20'); // default
  });

  it('renders DIFFERENT geometry for different names', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const svgs = f.nativeElement.querySelectorAll('svg');
    // Negative control: without this, a @switch with a broken default renders one icon for
    // every name and every other assertion above still passes.
    expect(svgs[0].innerHTML).not.toBe(svgs[1].innerHTML);
  });

  it('renders real geometry for every name in ICON_NAMES', async () => {
    await TestBed.configureTestingModule({ imports: [SingleIconHost] }).compileComponents();
    const f = TestBed.createComponent(SingleIconHost);

    for (const name of ICON_NAMES) {
      f.componentInstance.name.set(name);
      f.detectChanges();
      const svg = f.nativeElement.querySelector('svg');
      const geometryCount = svg.querySelectorAll('path, circle, line, polyline, polygon, rect').length;
      expect(geometryCount).withContext(`icon "${name}" rendered no geometry`).toBeGreaterThan(0);
    }
  });
});

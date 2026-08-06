import { TestBed } from '@angular/core/testing';
import { DevGalleryPage } from './dev-gallery.page';

describe('DevGalleryPage', () => {
  it('renders the WOD board proof with a single volt-marked live line', async () => {
    await TestBed.configureTestingModule({ imports: [DevGalleryPage] }).compileComponents();
    const fixture = TestBed.createComponent(DevGalleryPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('[data-proof="wod-board"]').length).toBe(1);
    // The accent budget, asserted rather than trusted: exactly one line is live.
    expect(el.querySelectorAll('[data-live="true"]').length).toBe(1);
  });
});

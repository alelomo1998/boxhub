import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DevGalleryPage } from './dev-gallery.page';

describe('DevGalleryPage', () => {
  it('renders the WOD board proof with a single volt-marked live line', async () => {
    await TestBed.configureTestingModule({
      imports: [DevGalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DevGalleryPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('[data-proof="wod-board"]').length).toBe(1);
    // The accent budget, asserted rather than trusted: exactly one line is live.
    expect(el.querySelectorAll('[data-live="true"]').length).toBe(1);
  });

  it('keeps the members proof calm — at most one volt element on the whole screen', async () => {
    await TestBed.configureTestingModule({
      imports: [DevGalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DevGalleryPage);
    fixture.detectChanges();
    const proof: HTMLElement = fixture.nativeElement.querySelector('[data-proof="admin-members"]');

    expect(proof).toBeTruthy();
    expect(proof.querySelectorAll('[data-accent="volt"]').length).toBeLessThanOrEqual(1);
  });

  it('has exactly one gallery section per shipped component, so a future addition without a section is caught', async () => {
    await TestBed.configureTestingModule({
      imports: [DevGalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DevGalleryPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const sections = Array.from(el.querySelectorAll('[data-gallery]'))
      .map((s) => s.getAttribute('data-gallery'))
      .sort();

    expect(sections).toEqual(
      ['alert', 'auth-layout', 'avatar', 'button', 'data-table', 'day-pager', 'dock', 'empty', 'field', 'icon', 'panel',
        'pill', 'search-bar', 'segmented', 'select', 'sheet', 'shell-header', 'switch', 'wordmark'].sort(),
    );
  });
});

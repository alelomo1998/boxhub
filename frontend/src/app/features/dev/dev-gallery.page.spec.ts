import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DevGalleryPage, STATE_NAMES } from './dev-gallery.page';

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
      ['alert', 'auth-layout', 'avatar', 'banner', 'benchmark-board', 'button', 'class-card', 'data-table', 'dock',
        'empty', 'field', 'filter-sheet', 'icon', 'notification-bell', 'panel', 'pill', 'search-bar', 'segmented',
        'select', 'sheet', 'shell-header', 'sortable-list', 'switch', 'week-calendar',
        'wordmark'].sort(),
    );
  });
});

/**
 * THE GATE THIS FILE EXISTS FOR. Design law: every component owes seven states, and this gallery
 * IS that contract — an omitted state is indistinguishable from a forgotten one. Prose notes
 * cannot enforce that, because nothing fails when one is missing. A ledger can: every section
 * must account for all seven states, as rendered, hand-checked, or explicitly not applicable.
 */
describe('DevGalleryPage state ledgers', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevGalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
    f = TestBed.createComponent(DevGalleryPage);
    f.detectChanges();
  });

  const sectionKeys = (): string[] =>
    Array.from(f.nativeElement.querySelectorAll('[data-gallery]'))
      .map((el: any) => el.getAttribute('data-gallery'));

  it('renders a ledger for every component section', () => {
    const missing = sectionKeys().filter(
      k => !f.nativeElement.querySelector(`[data-ledger="${k}"]`),
    );
    expect(missing).toEqual([]);
  });

  it('accounts for all seven states in every ledger', () => {
    const gaps: string[] = [];
    for (const key of sectionKeys()) {
      const ledger = f.nativeElement.querySelector(`[data-ledger="${key}"]`);
      const declared = ledger
        ? Array.from(ledger.querySelectorAll('[data-state]')).map((el: any) => el.getAttribute('data-state'))
        : [];
      for (const state of STATE_NAMES) {
        if (!declared.includes(state)) gaps.push(`${key}: ${state}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  // A state declared 'na' without a reason is an omission wearing a label. The reason is the
  // whole point: it is what distinguishes "this component cannot have an error state" from
  // "nobody got round to the error state".
  it('gives every not-applicable state a written reason', () => {
    const bare = Array.from(f.nativeElement.querySelectorAll('[data-how="na"]'))
      .filter((el: any) => !el.textContent.trim().includes('—'))
      .map((el: any) => el.getAttribute('data-state'));
    expect(bare).toEqual([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { PieceCardComponent } from './piece-card.component';
import { Wod } from './programming.service';

const base: Wod = {
  id: 'w', title: 'Fran', wodType: 'CUSTOM', macro: 'WORKOUT', timingPreset: null,
  timing: { rounds: 1, segments: [] }, library: true, teamSize: 1, teamShare: null,
  scoreType: 'TIME', timeCapSeconds: null, bodyText: '', blocks: { blocks: [] },
  scalingNotes: null, benchmarkTemplateId: null,
};

function render(wod: Wod, eyebrow = '', benchmarkKind: string | null = null) {
  const fixture = TestBed.createComponent(PieceCardComponent);
  fixture.componentRef.setInput('wod', wod);
  fixture.componentRef.setInput('eyebrow', eyebrow);
  fixture.componentRef.setInput('benchmarkKind', benchmarkKind);
  fixture.detectChanges();
  return fixture;
}

function linesWod(...texts: string[]): Wod {
  return { ...base, blocks: { blocks: [{ lines: texts.map(text => ({ text })) }] } };
}

describe('PieceCardComponent', () => {
  it('shows at most 3 lines and a +N more for a piece with 5', () => {
    const fixture = render(linesWod('a', 'b', 'c', 'd', 'e'));
    const items = fixture.nativeElement.querySelectorAll('.rx li');
    expect(items.length).toBe(3);
    expect(fixture.nativeElement.querySelector('.more').textContent).toContain('+2 more');
  });

  it('shows no "more" line for a piece with exactly 3 lines', () => {
    const fixture = render(linesWod('a', 'b', 'c'));
    expect(fixture.nativeElement.querySelectorAll('.rx li').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.more')).toBeNull();
  });

  it('renders the benchmark chip and kind label when benchmarkKind is set', () => {
    const fixture = render(base, '', 'GIRL');
    expect(fixture.nativeElement.querySelector('.chip')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.eyebrow').textContent).toContain('Girl');
  });

  it('renders no score label for scoreType NONE', () => {
    const fixture = render({ ...base, scoreType: 'NONE' });
    expect(fixture.nativeElement.querySelector('.score')).toBeNull();
  });

  it('renders no prescription list for a piece with no lines', () => {
    const fixture = render(base);
    expect(fixture.nativeElement.querySelector('.rx')).toBeNull();
  });

  // M14c-b audit P2: the wrapping link/button (owned by the page) needs stable ids to name itself
  // from the title and describe itself from the meta line, instead of reading as one run-on string.
  it('exposes title/description ids keyed by the wod id', () => {
    const fixture = render({ ...base, id: 'w42' });
    const title = fixture.nativeElement.querySelector('.title');
    const top = fixture.nativeElement.querySelector('.top');
    expect(title.id).toBe('pc-title-w42');
    expect(top.id).toBe('pc-desc-w42');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ScoreGridComponent } from './score-grid.component';

describe('ScoreGridComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScoreGridComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('optimistically marks a cell saved, and shows retry on failure', () => {
    const fixture = TestBed.createComponent(ScoreGridComponent);
    const cmp = fixture.componentInstance;
    cmp.itemId = 'i1'; cmp.scoreType = 'TIME';
    cmp.athletes = [{ membershipId: 'm1', name: 'Alex' }, { membershipId: 'm2', name: 'Sam' }];
    fixture.detectChanges();

    cmp.mins.set('m1', 3); cmp.secs.set('m1', 30);
    cmp.save('m1');
    http.expectOne('/api/box/sessions/items/i1/score/m1').flush({});
    expect(cmp.cellStatus('m1')).toBe('saved');

    cmp.load.set('m2', 100);
    cmp.save('m2'); // LOAD type not set for this item, but the call still fires with the payload
    http.expectOne('/api/box/sessions/items/i1/score/m2').flush('x', { status: 0, statusText: 'Network' });
    expect(cmp.cellStatus('m2')).toBe('error');
  });
});

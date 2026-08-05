import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RunnerPage } from './runner.page';

describe('RunnerPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RunnerPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads roster, items and timer on init', () => {
    const fixture = TestBed.createComponent(RunnerPage);
    fixture.componentInstance.sessionId = 's1';
    fixture.componentInstance.load();
    http.expectOne('/api/box/sessions/s1/roster').flush(
      [{ bookingId: 'b1', membershipId: 'm1', name: 'Alex', avatarPath: null, status: 'BOOKED', position: null }]);
    http.expectOne('/api/box/sessions/s1/items').flush(
      [{ id: 'i1', wod: { title: 'Fran', wodType: 'FOR_TIME', scoreType: 'TIME', timeCapSeconds: 300, bodyText: '21-15-9' }, scoreable: true, scoreType: 'TIME', sortOrder: 0 }]);
    http.expectOne('/api/box/sessions/s1/timer').flush(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.athletes().length).toBe(1);
    expect(fixture.componentInstance.scoredItems().length).toBe(1);
  });
});

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ShellChromeService } from './shell-chrome.service';

describe('ShellChromeService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'plain', data: {}, children: [] },
          { path: 'x', data: { detail: true, backTo: '/back' }, children: [] },
          { path: 'nested', children: [{ path: 'child', data: { detail: true, backTo: '/nested-back' }, children: [] }] },
        ]),
      ],
    });
    return {
      service: TestBed.inject(ShellChromeService),
      router: TestBed.inject(Router),
    };
  }

  it('starts non-detail before any navigation', () => {
    const { service } = setup();
    expect(service.detail()).toBe(false);
    expect(service.backTo()).toBeNull();
  });

  it('reads detail/backTo from the deepest activated route on NavigationEnd', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/x');
    expect(service.detail()).toBe(true);
    expect(service.backTo()).toBe('/back');
  });

  it('the deepest route wins over a shallower one with no data', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/nested/child');
    expect(service.detail()).toBe(true);
    expect(service.backTo()).toBe('/nested-back');
  });

  it('clears detailTitle on leaving a detail route', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/x');
    service.detailTitle.set('Burn It');
    expect(service.detailTitle()).toBe('Burn It');

    await router.navigateByUrl('/plain');
    expect(service.detail()).toBe(false);
    expect(service.backTo()).toBeNull();
    expect(service.detailTitle()).toBeNull();
  });

  it('does not clear detailTitle when navigating between two detail routes', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/x');
    service.detailTitle.set('Burn It');

    await router.navigateByUrl('/nested/child');
    expect(service.detail()).toBe(true);
    expect(service.detailTitle()).toBe('Burn It');
  });
});

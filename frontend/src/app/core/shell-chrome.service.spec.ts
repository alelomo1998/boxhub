import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, provideRouter } from '@angular/router';
import { deepestRoute, ShellChromeService } from './shell-chrome.service';

describe('ShellChromeService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'plain', data: {}, children: [] },
          { path: 'x', data: { detail: true, backTo: '/back' }, children: [] },
          { path: 'nested', children: [{ path: 'child', data: { detail: true, backTo: '/nested-back' }, children: [] }] },
          { path: 'class/:id/workout', data: { detail: true, backTo: '/athlete/class/:id' }, children: [] },
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

  it('resolves a parent-relative backTo against the route\'s own params', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/class/abc/workout');
    expect(service.backTo()).toBe('/athlete/class/abc');
  });

  it('a param-less backTo is returned verbatim', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/x');
    expect(service.backTo()).toBe('/back');
  });

  it('clears detailMorphKey on leaving a detail route, same as detailTitle', async () => {
    const { service, router } = setup();
    await router.navigateByUrl('/x');
    service.detailMorphKey.set('session-1');
    expect(service.detailMorphKey()).toBe('session-1');

    await router.navigateByUrl('/plain');
    expect(service.detailMorphKey()).toBeNull();
  });
});

describe('deepestRoute', () => {
  it('walks to the leaf snapshot', () => {
    const leaf = { firstChild: null, data: { x: 1 } } as unknown as ActivatedRouteSnapshot;
    const mid = { firstChild: leaf, data: {} } as unknown as ActivatedRouteSnapshot;
    const root = { firstChild: mid, data: {} } as unknown as ActivatedRouteSnapshot;
    expect(deepestRoute(root)).toBe(leaf);
  });

  it('returns the snapshot itself when it has no children', () => {
    const only = { firstChild: null, data: {} } as unknown as ActivatedRouteSnapshot;
    expect(deepestRoute(only)).toBe(only);
  });
});

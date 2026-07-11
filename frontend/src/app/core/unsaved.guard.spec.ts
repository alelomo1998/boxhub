import { unsavedGuard, HasUnsaved } from './unsaved.guard';

describe('unsavedGuard', () => {
  const run = (c: HasUnsaved) => unsavedGuard(c, null!, null!, null!);

  it('passes when clean without asking', () => {
    spyOn(window, 'confirm');
    expect(run({ hasUnsaved: () => false })).toBeTrue();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('asks when dirty and honors the answer', () => {
    const spy = spyOn(window, 'confirm').and.returnValue(false);
    expect(run({ hasUnsaved: () => true })).toBeFalse();
    spy.and.returnValue(true);
    expect(run({ hasUnsaved: () => true })).toBeTrue();
  });
});

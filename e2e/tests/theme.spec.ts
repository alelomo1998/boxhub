import { test, expect } from '@playwright/test';

test('app boots on the chalkboard ground, with no theme mechanism left', async ({ page }) => {
  await page.goto('/app/auth/login');

  // M13b deleted the light theme, ThemeService and the data-theme attribute outright. Dark is
  // unconditional on :root in the global stylesheet, so the browser paints it before any script
  // runs — which is also why the flash-of-unthemed-content guard this suite used to need is gone.
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBeUndefined();

  // chalkboard black #0d110e → rgb(13, 17, 14)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(13, 17, 14)');
});

test('brand fonts actually load (guards the nginx /media/ collision)', async ({ page }) => {
  await page.goto('/app/auth/login');

  // This test previously called document.fonts.check('800 20px "Saira Condensed"'). That call
  // returns true whenever the string is *renderable* — including by a fallback — so it passed
  // whether or not the webfont loaded, and went on passing after Saira Condensed was deleted from
  // the repo entirely. It was hollow: the one guard against the M5.5 P0, where the brand faces
  // 404'd in production for a whole milestone, could not detect a missing font.
  //
  // document.fonts.load() resolves to the FontFace objects matching the request, and to an EMPTY
  // ARRAY when the family was never declared. That distinction is the whole test, and unlike
  // .check() it cannot be satisfied by a fallback. It also forces the fetch, which matters:
  // browsers load webfonts lazily, so simply reading .status would report JetBrains Mono as absent
  // on a page that happens to render no mono text.
  const faces = await page.evaluate(async () => {
    const count = async (spec: string) => (await document.fonts.load(spec)).length;
    return {
      archivo: await count('400 16px "Archivo"'),
      archivoBlack: await count('800 40px "Archivo"'),
      mono: await count('700 16px "JetBrains Mono"'),
      saira: await count('800 20px "Saira Condensed"'),
    };
  });

  expect(faces.archivo).toBeGreaterThan(0);
  expect(faces.archivoBlack).toBeGreaterThan(0);
  expect(faces.mono).toBeGreaterThan(0);

  // Negative control, and the reason this test can be trusted at all: a family the app does not
  // ship must come back with zero faces. If this ever passes as non-zero, the assertions above are
  // measuring something other than what the app actually serves.
  expect(faces.saira).toBe(0);
});

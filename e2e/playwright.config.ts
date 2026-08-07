import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost' },
  // M12a: retries were load-bearing — login/admin-panel/invite specs failed at --retries=0 and
  // passed with one retry, which is how a flaky spec trained everyone to re-run red pipelines.
  // Isolation is now per-run (see tests/_support.ts), so a red build means something again.
  retries: 0,
  // Serial: the suite shares one seeded backend stack; parallel workers race on shared
  // state and cold-start. One worker keeps it deterministic.
  workers: 1,
  // One baseline per component per viewport. {platform} is deliberately ABSENT: baselines are
  // generated and enforced inside the Linux container (visual.sh), so a macOS run must never
  // compare against them — and it never does, because visual.spec.ts is excluded below.
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',

  // The default run is the functional suite. Visual regression is container-only.
  testIgnore: process.env.BH_VISUAL ? [] : ['**/visual.spec.ts'],
});

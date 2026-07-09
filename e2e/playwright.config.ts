import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost' },
  retries: 1,
  // Serial: the suite shares one seeded backend stack; parallel workers race on shared
  // state and cold-start. One worker + retries keeps it deterministic.
  workers: 1,
});

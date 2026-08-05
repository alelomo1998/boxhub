import { Page } from '@playwright/test';

/**
 * One id per test process. Every entity a spec CREATES must carry it, so a rerun against the
 * same stack cannot collide with the previous run's rows. Seeded read-only fixtures (the demo
 * box, admin@demo.io, the seeded weekly schedule) are shared on purpose and are NOT stamped —
 * the rule is about data a spec creates, not data it reads.
 *
 * Six of the eight data-writing specs already did this ad hoc with Date.now(); this is the same
 * idea in one place, so the next spec author inherits it instead of rediscovering it.
 */
const RUN_ID = String(Date.now());

export function runId(): string {
  return RUN_ID;
}

/** Was copy-pasted verbatim into 8 spec files. */
export async function login(page: Page, email: string, password = 'boxhub-demo-2026'): Promise<void> {
  await page.goto('/app/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

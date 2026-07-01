import { expect, test } from '@playwright/test';

// Smoke E2E for the /docs route. The shell currently mounts a "Coming soon"
// placeholder for docs (the docs remote is not wired into the shell router yet
// and is not served by `npm start`), so we assert against that placeholder.
// When the docs remote is mounted, extend this to assert real docs content.
test.describe('docs', () => {
  test('docs route renders the coming-soon placeholder', async ({ page }) => {
    await page.goto('/docs');

    await expect(page.getByText('Coming soon...')).toBeVisible();
  });
});

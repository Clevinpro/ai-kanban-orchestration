import { expect, test } from '@playwright/test';

// Smoke E2E for the auth MFE login screen, served by the shell at /auth.
// Runs against the shell alone: with no gateway, GuestRoute's getMe() errors
// and falls through to render the login form, which is what we assert here.
test.describe('auth', () => {
  test('login screen renders form and sign-in actions', async ({ page }) => {
    await page.goto('/auth');

    // Card title for the login surface.
    await expect(page.getByText('AI Platform')).toBeVisible();

    // Email field from the shared LoginForm.
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();

    // Primary submit and the Google OAuth entry point.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();

    // Link across to the register flow.
    await expect(page.getByRole('link', { name: 'No account? Register' })).toBeVisible();
  });
});

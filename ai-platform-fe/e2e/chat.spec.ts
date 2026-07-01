import { expect, test } from '@playwright/test';

// Smoke E2E for the /chat route, served by the shell.
//
// Without a logged-in session the outcome depends on the backend:
//   - gateway up   -> conversation fetch 401s and the @libs/api interceptor
//                     redirects to /auth (login screen).
//   - gateway down -> the fetch fails with a network error (no status, no
//                     redirect) and the chat shell renders its composer.
//
// This smoke test accepts either real outcome, asserting that the chat route
// mounts the chat MFE and lands on a known, interactive surface — never a blank
// page. To extend into a full authenticated chat flow, establish a session
// first (log in or seed the auth cookie) and then assert the composer directly:
//   await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
test.describe('chat', () => {
  test('chat route mounts an interactive surface', async ({ page }) => {
    await page.goto('/chat');

    // Either the login screen (redirected) or the chat composer (shell-only).
    const loginTitle = page.getByText('AI Platform');
    const sendButton = page.getByRole('button', { name: 'Send' });

    await expect(loginTitle.or(sendButton).first()).toBeVisible({ timeout: 15_000 });
  });
});

import {test, expect} from '@playwright/test';

test('world renders client-only library, real room desks and reception without media capture', async ({page}) => {
  let captures = 0;
  await page.exposeFunction('unexpectedWorldCapture', () => { captures++; });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { await (window as unknown as {unexpectedWorldCapture: () => Promise<void>}).unexpectedWorldCapture(); throw new Error('World must not request media'); };
  });
  const id = 'a'.repeat(32);
  await page.route('**/api/world/token', route => route.fulfill({status: 503, json: {error: 'World connection unavailable.'}}));
  await page.route('**/api/rooms', route => route.request().method() === 'GET' ? route.fulfill({json: {rooms: [{id, title: 'Calculus together', hostName: 'Bob', visibility: 'PUBLIC', participantCount: 2, maxParticipants: 6, status: 'ACTIVE', createdAt: Date.now(), expiresAt: Date.now() + 60000}]}}) : route.fulfill({status: 503, json: {error: 'Creation unavailable.'}}));
  await page.goto('/world');
  await page.getByLabel('Your nickname').fill('Ada'); await page.getByLabel('Lavender', {exact: true}).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', {name: 'Enter library'}).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('World connection unavailable.')).toBeVisible();
  await page.getByRole('button', {name: /Desk 1/}).click();
  await expect(page.getByRole('dialog')).toContainText('Calculus together');
  await expect(page.getByRole('link', {name: 'Join Room', exact: true})).toHaveAttribute('href', `/room/${id}`);
  await page.getByRole('button', {name: 'Close', exact: true}).click();
  await page.getByRole('button', {name: 'Create Room', exact: true}).click();
  await expect(page.getByRole('dialog').getByLabel('Your nickname')).toHaveValue('Ada');
  await page.getByRole('dialog').getByLabel('Room title').fill('Study hour');
  await page.getByRole('dialog').getByRole('button', {name: 'Create Room', exact: true}).click();
  await expect(page.getByRole('alert').filter({hasText: 'Creation unavailable.'})).toBeVisible();
  await page.getByRole('button', {name: 'Close', exact: true}).click();
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name: 'Leave world / change avatar'}).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByLabel('Your nickname')).toHaveValue('Ada');
  expect(captures).toBe(0);
});
